import { BattlePokemon, BattleState, InvulnerableState } from '../models/battle.models';
import { MoveResponse } from '../models/move.models';
import { calculateDamage, checkAccuracy } from '../utils/damage.utils';
import { applyStatChanges } from '../utils/battle.utils';
import { moveCache } from '../cache/moveCache';

// Moves that can hit through specific invulnerable states, and whether they deal double damage
const AIRBORNE_PIERCING = new Set([16, 18, 87, 314, 239, 542, 681]);   // Gust, Whirlwind, Thunder, Twister, Sky Uppercut, Smack Down, Thousand Arrows, Hurricane
const UNDERGROUND_PIERCING = new Set([89, 222]);   // Earthquake, Magnitude
const UNDERWATER_PIERCING = new Set([57, 250]);    // Surf, Whirlpool

// Moves that deal double damage through the corresponding invulnerable state
const DOUBLE_DMG_AIRBORNE = new Set([16, 239]);    // Gust, Twister
const DOUBLE_DMG_UNDERGROUND = new Set([89, 222]); // Earthquake, Magnitude
const DOUBLE_DMG_UNDERWATER = new Set([57, 250]);  // Surf, Whirlpool

// Thunder hits airborne targets with 100% accuracy (ID 87)
const THUNDER_ID = 87;

export interface DamageResult {
    damage: number;
    hit: boolean;
    log: string[];
}

/**
 * Applies damage from a move. Handles accuracy, immunity, invulnerability,
 * substitute absorption, and effectiveness messaging.
 * Returns updated damage dealt (0 if miss/immune/blocked).
 */
export const handleDamage = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    overridePower?: number,
): DamageResult => {
    const log: string[] = [];

    if (!move.power && overridePower === undefined) {
        return { damage: 0, hit: false, log };
    }

    // Check defender invulnerability
    const invState: InvulnerableState = defender.invulnerableState;
    if (invState !== 'none') {
        let canHit = false;
        if (invState === 'airborne' && AIRBORNE_PIERCING.has(move.id)) canHit = true;
        if (invState === 'underground' && UNDERGROUND_PIERCING.has(move.id)) canHit = true;
        if (invState === 'underwater' && UNDERWATER_PIERCING.has(move.id)) canHit = true;
        if (!canHit) {
            log.push(`${defender.name} avoided the attack!`);
            return { damage: 0, hit: false, log };
        }
        // Thunder always hits airborne targets
        if (invState === 'airborne' && move.id === THUNDER_ID) {
            // accuracy check skipped below
        }
    }

    // Protect check
    if (defender.protecting) {
        log.push(`${defender.name} protected itself!`);
        return { damage: 0, hit: false, log };
    }

    // Accuracy check (Thunder vs airborne always hits)
    const skipAccuracy = invState === 'airborne' && move.id === THUNDER_ID;
    if (!skipAccuracy && !checkAccuracy(move.id, attacker, defender)) {
        log.push(`${attacker.name}'s attack missed!`);
        return { damage: 0, hit: false, log };
    }

    const { damage: rawDamage, effectiveness, isCrit, isStab } = calculateDamage(attacker, defender, move.id, state.weather, overridePower);

    if (effectiveness === 0) {
        log.push(`It doesn't affect ${defender.name}...`);
        return { damage: 0, hit: false, log };
    }

    // Apply invulnerability double-damage bonus
    let damage = rawDamage;
    if (invState === 'airborne' && DOUBLE_DMG_AIRBORNE.has(move.id)) damage *= 2;
    if (invState === 'underground' && DOUBLE_DMG_UNDERGROUND.has(move.id)) damage *= 2;
    if (invState === 'underwater' && DOUBLE_DMG_UNDERWATER.has(move.id)) damage *= 2;
    damage = Math.floor(damage);

    if (isStab) log.push('STAB bonus applied!');
    if (effectiveness > 1) log.push("It's super effective!");
    if (effectiveness < 1 && effectiveness > 0) log.push("It's not very effective...");
    if (isCrit) log.push('A critical hit!');

    // Track last physical damage taken for Counter
    if (move.damage_class.name === 'physical') {
        attacker.lastPhysicalDamageTaken = 0; // reset attacker's counter
        // defender tracking is done in battleReducer context
    }

    // Bide damage storage
    if (defender.biding) {
        defender.bideDamageStored += damage;
    }

    // Rage damage tracking — attack rises when hit while raging
    if (defender.raging) {
        applyStatChanges(defender, [{ stat: { name: 'attack' }, change: 1 }], log);
    }

    // Substitute absorbs damage
    if (defender.substituteHp > 0) {
        const sub = Math.min(defender.substituteHp, damage);
        defender.substituteHp -= sub;
        log.push(`${defender.name} took ${damage} damage! (substitute absorbed)`);
        if (defender.substituteHp <= 0) {
            defender.substituteHp = 0;
            log.push(`${defender.name}'s substitute broke!`);
        }
        return { damage, hit: true, log };
    }

    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);

    if (defender.currentHp <= 0) {
        defender.fainted = true;
        log.push(`${defender.name} fainted!`);
    }

    return { damage, hit: true, log };
};

// Exact recoil fractions by move ID (numerator, denominator)
const RECOIL_FRACTION: Record<number, [number, number]> = {
    36: [1, 4],   // Take Down
    66: [1, 4],   // Submission
    528: [1, 4],  // Wild Charge
    543: [1, 4],  // Head Charge
    38: [1, 3],   // Double-Edge
    344: [1, 3],  // Volt Tackle
    394: [1, 3],  // Flare Blitz
    413: [1, 3],  // Brave Bird
    404: [1, 3],  // Wood Hammer
    707: [1, 3],  // Light of Ruin
    457: [1, 2],  // Head Smash
};

/**
 * Applies recoil damage to the attacker based on damage dealt.
 * Uses exact fractions per move ID; falls back to PokeAPI drain%.
 */
export const handleRecoil = (
    move: MoveResponse,
    attacker: BattlePokemon,
    damageDealt: number,
    log: string[]
): void => {
    if (!move.meta || move.meta.drain >= 0) return;
    const override = RECOIL_FRACTION[move.id];
    const recoil = override
        ? Math.max(1, Math.floor(damageDealt * override[0] / override[1]))
        : Math.max(1, Math.floor(damageDealt * Math.abs(move.meta.drain) / 100));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
    log.push(`${attacker.name} is hit by recoil! (${attacker.currentHp}/${attacker.maxHp} HP remaining)`);
    if (attacker.currentHp <= 0) {
        attacker.fainted = true;
        log.push(`${attacker.name} fainted!`);
    }
};

/**
 * Applies crash damage to the attacker on a missed crash-damage move (Jump Kick / High Jump Kick).
 * Costs floor(maxHp / 2) HP.
 */
export const handleCrashDamage = (attacker: BattlePokemon, log: string[]): void => {
    const crash = Math.max(1, Math.floor(attacker.maxHp / 2));
    attacker.currentHp = Math.max(0, attacker.currentHp - crash);
    log.push(`${attacker.name} kept going and crashed! (${attacker.currentHp}/${attacker.maxHp} HP remaining)`);
    if (attacker.currentHp <= 0) {
        attacker.fainted = true;
        log.push(`${attacker.name} fainted!`);
    }
};

/**
 * Applies a fixed HP cost of floor(maxHp / 2) to the attacker (Mind Blown, Steel Beam).
 */
export const applyHalfHpCost = (attacker: BattlePokemon, log: string[]): void => {
    const cost = Math.max(1, Math.floor(attacker.maxHp / 2));
    attacker.currentHp = Math.max(0, attacker.currentHp - cost);
    log.push(`${attacker.name} paid a hefty price! (${attacker.currentHp}/${attacker.maxHp} HP remaining)`);
    if (attacker.currentHp <= 0) {
        attacker.fainted = true;
        log.push(`${attacker.name} fainted!`);
    }
};

/**
 * Heals attacker by drain% of damage dealt.
 * drain is positive in PokeAPI for drain (e.g. 50 = 50% drain).
 */
export const handleDrain = (
    move: MoveResponse,
    attacker: BattlePokemon,
    damageDealt: number,
    log: string[]
): void => {
    if (!move.meta || move.meta.drain <= 0) return;
    const heal = Math.max(1, Math.floor(damageDealt * move.meta.drain / 100));
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
    log.push(`${attacker.name} had its energy drained!`);
};

/**
 * Applies flinch to the defender if the move has a flinch chance
 * and the attacker moved first.
 */
export const handleFlinch = (
    move: MoveResponse,
    defender: BattlePokemon,
    attackerMovedFirst: boolean,
    log: string[]
): void => {
    if (!move.meta || move.meta.flinch_chance <= 0) return;
    if (!attackerMovedFirst) return;
    if (Math.random() * 100 < move.meta.flinch_chance) {
        defender.flinched = true;
    }
    void log; // flinch message appears when defender tries to act
};

/**
 * Handles multi-hit moves. Applies damage for each hit and returns total damage.
 * Distribution: 2 hits (37.5%), 3 hits (37.5%), 4 hits (12.5%), 5 hits (12.5%).
 */
export const handleMultiHit = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[]
): number => {
    if (!move.meta || move.meta.min_hits === null || move.meta.max_hits === null) return 0;

    let numHits: number;
    if (move.meta.min_hits === move.meta.max_hits) {
        numHits = move.meta.min_hits;
    } else {
        const roll = Math.random();
        if (roll < 0.375) numHits = 2;
        else if (roll < 0.75) numHits = 3;
        else if (roll < 0.875) numHits = 4;
        else numHits = 5;
    }

    let totalDamage = 0;
    for (let i = 0; i < numHits; i++) {
        if (defender.fainted) break;
        const result = handleDamage(move, attacker, defender, state);
        log.push(...result.log);
        totalDamage += result.damage;
    }
    log.push(`Hit ${numHits} time(s)!`);
    return totalDamage;
};

/**
 * Applies stat changes to the target (attacker or defender).
 */
export const handleStatChanges = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    target: 'user' | 'target',
    log: string[]
): void => {
    if (!move.stat_changes || move.stat_changes.length === 0) return;
    // Defender with substitute is immune to stat-lowering from opponent moves
    const targetPokemon = target === 'user' ? attacker : defender;
    if (target === 'target' && defender.substituteHp > 0) {
        log.push(`${defender.name}'s substitute blocked the stat change!`);
        return;
    }
    applyStatChanges(targetPokemon, move.stat_changes, log);
};

/**
 * Handles Solar Beam weather interactions.
 * In sun: skips charge turn.
 * In rain/sandstorm/hail: halves power (returns power modifier).
 */
export const getSolarBeamPowerMod = (state: BattleState): number => {
    if (state.weather === 'rain' || state.weather === 'sandstorm' || state.weather === 'hail') {
        return 0.5;
    }
    return 1;
};

/**
 * Sets up charging state for two-turn moves.
 * Returns true if the pokemon is now charging (skip action this turn).
 */
export const handleCharging = (
    move: MoveResponse,
    attacker: BattlePokemon,
    log: string[]
): boolean => {
    // Already on second turn — fire the move
    if (attacker.charging && attacker.chargingMoveId === move.id) {
        attacker.charging = false;
        attacker.chargingMoveId = null;
        attacker.chargingTurnsRemaining = 0;
        attacker.invulnerableState = 'none';
        return false; // proceed to fire
    }

    // First turn — enter charging state
    attacker.charging = true;
    attacker.chargingMoveId = move.id;
    attacker.chargingTurnsRemaining = 1;

    // Determine invulnerable state and charge message
    switch (move.id) {
        case 19:  // fly
        case 340: // bounce
            attacker.invulnerableState = 'airborne';
            log.push(`${attacker.name} flew up high!`);
            break;
        case 91:  // dig
            attacker.invulnerableState = 'underground';
            log.push(`${attacker.name} burrowed its way under the ground!`);
            break;
        case 291: // dive
            attacker.invulnerableState = 'underwater';
            log.push(`${attacker.name} hid underwater!`);
            break;
        case 467: // shadow-force
        case 566: // phantom-force
            attacker.invulnerableState = 'phantom';
            log.push(`${attacker.name} vanished instantly!`);
            break;
        case 76:  // solar-beam
            attacker.invulnerableState = 'none';
            log.push(`${attacker.name} took in sunlight!`);
            break;
        case 130: // skull-bash
            attacker.invulnerableState = 'none';
            log.push(`${attacker.name} tucked in its head!`);
            break;
        case 143: // sky-attack
            attacker.invulnerableState = 'none';
            log.push(`${attacker.name} is glowing!`);
            break;
        case 13:  // razor-wind
            attacker.invulnerableState = 'none';
            log.push(`${attacker.name} made a whirlwind!`);
            break;
        default:
            attacker.invulnerableState = 'none';
            log.push(`${attacker.name} is charging up!`);
    }

    return true; // charging, skip damage this turn
};

/**
 * Determines if the attacker moved first in the turn, needed for flinch.
 * This is a heuristic: the attacker moved first if the defender hasn't
 * had their action resolved yet (no damage taken this turn, no log entry
 * from their action). Since we call actions in order, if we're the
 * first action, we moved first.
 */
export const didAttackerMoveFirst = (
    attackerPlayer: 'player1' | 'player2',
    state: BattleState,
    firstActingPlayer: 'player1' | 'player2'
): boolean => {
    return attackerPlayer === firstActingPlayer;
};

/**
 * Applies the charging move bonus for skull-bash (+1 defense on charge turn).
 */
export const applyChargeTurnBonuses = (
    move: MoveResponse,
    attacker: BattlePokemon,
    log: string[]
): void => {
    if (move.id === 130) { // skull-bash raises defense during charge
        applyStatChanges(attacker, [{ stat: { name: 'defense' }, change: 1 }], log);
    }
};

/**
 * Applies PP reduction for a move. Returns false if PP is 0 (Struggle).
 */
export const consumePP = (
    move: MoveResponse,
    attacker: BattlePokemon,
    log: string[]
): 'ok' | 'struggle' => {
    const battleMove = attacker.moves.find((m) => m.id === move.id);
    if (!battleMove) return 'ok';
    if (battleMove.currentPp <= 0) {
        log.push(`${attacker.name} has no PP left for ${move.name}! Used Struggle!`);
        return 'struggle';
    }
    battleMove.currentPp -= 1;
    return 'ok';
};
