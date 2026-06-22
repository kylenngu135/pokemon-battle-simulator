import { BattlePokemon, BattleState, PrimaryStatus, Weather } from '../models/battle.models';
import { MoveResponse } from '../models/move.models';
import { moveCache } from '../cache/moveCache';
import { TRAPPING_MOVE_NAMES } from './lockManager';
import { getActivePokemon, applyStatChanges } from '../utils/battle.utils';
import { applyPrimaryStatus, applyVolatileStatus, applyWeather } from './effectsEngine';
import {
    handleDamage,
    handleRecoil,
    handleDrain,
    handleFlinch,
    handleMultiHit,
    handleCharging,
    handleStatChanges,
    getSolarBeamPowerMod,
    consumePP,
    applyChargeTurnBonuses,
    handleCrashDamage,
    applyHalfHpCost,
    DamageResult,
} from './pipelineHandlers';

export interface MoveEffectResult {
    log: string[];
    hit: boolean;
}

// ── Struggle fallback ─────────────────────────────────────────────────────────

const resolveStruggle = (attacker: BattlePokemon, defender: BattlePokemon, log: string[]): MoveEffectResult => {
    const damage = Math.max(1, 50);
    // Struggle: typeless 50 power, no type effectiveness
    const level = 50;
    const rawAtk = attacker.stats.attack;
    const rawDef = defender.stats.defense;
    const dmg = Math.max(1, Math.floor(((((2 * level) / 5 + 2) * 50 * (rawAtk / rawDef)) / 50 + 2)));
    defender.currentHp = Math.max(0, defender.currentHp - dmg);
    log.push(`${defender.name} took ${dmg} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    // Recoil: 25% max HP
    const recoil = Math.max(1, Math.floor(attacker.maxHp / 4));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
    log.push(`${attacker.name} is hit by recoil! (${attacker.currentHp}/${attacker.maxHp} HP remaining)`);
    if (attacker.currentHp <= 0) { attacker.fainted = true; log.push(`${attacker.name} fainted!`); }
    void damage;
    return { log, hit: true };
};

// ── Unique move handlers (matched by move.id) ─────────────────────────────────

const handleBide = (move: MoveResponse, attacker: BattlePokemon, defender: BattlePokemon, log: string[]): MoveEffectResult => {
    void move;
    if (!attacker.biding) {
        attacker.biding = true;
        attacker.bideTurnsRemaining = 2;
        attacker.bideDamageStored = 0;
        log.push(`${attacker.name} is storing energy!`);
        return { log, hit: false };
    }
    attacker.bideTurnsRemaining -= 1;
    if (attacker.bideTurnsRemaining > 0) {
        log.push(`${attacker.name} is storing energy!`);
        return { log, hit: false };
    }
    // Release — deals 2× stored damage
    attacker.biding = false;
    const damage = attacker.bideDamageStored * 2;
    attacker.bideDamageStored = 0;
    log.push(`${attacker.name} unleashed its energy!`);
    if (damage === 0) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    return { log, hit: true };
};

const handleRage = (move: MoveResponse, attacker: BattlePokemon, defender: BattlePokemon, state: BattleState, log: string[]): MoveEffectResult => {
    attacker.raging = true;
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    return { log, hit: result.hit };
};

const handleMimic = (
    move: MoveResponse,
    attacker: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    void move;
    const opponentPlayer: 'player1' | 'player2' = attackerPlayer === 'player1' ? 'player2' : 'player1';
    const lastMoveId = attackerPlayer === 'player1' ? state.player2LastMoveUsed : state.player1LastMoveUsed;
    if (!lastMoveId) {
        log.push(`But it failed! The opponent hasn't used a move yet.`);
        return { log, hit: false };
    }
    const copiedMove = moveCache.get(lastMoveId);
    if (!copiedMove) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    // Replace Mimic slot with opponent's last move
    const mimicIdx = attacker.moves.findIndex((m) => m.id === 102); // mimic
    if (mimicIdx === -1) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    attacker.moves[mimicIdx] = {
        id: copiedMove.id,
        name: copiedMove.name,
        currentPp: copiedMove.pp,
        maxPp: copiedMove.pp,
        power: copiedMove.power,
        accuracy: copiedMove.accuracy,
        type: copiedMove.type.name,
        damageClass: copiedMove.damage_class.name as 'physical' | 'special' | 'status',
    };
    const opponentName = getActivePokemon(state, opponentPlayer).name;
    log.push(`${attacker.name} learned ${copiedMove.name} from ${opponentName}!`);
    return { log, hit: true };
};

const handleMetronome = (
    _move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    defenderPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    // Excluded move IDs
    const excluded = new Set([118, 165]); // metronome, struggle
    const allMoves = Array.from(moveCache.values()).filter((m) => !excluded.has(m.id));
    if (allMoves.length === 0) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const chosen = allMoves[Math.floor(Math.random() * allMoves.length)];
    log.push(`${attacker.name} used Metronome and got ${chosen.name}!`);
    const result = executeMoveEffect(chosen, attacker, defender, attackerPlayer, defenderPlayer, state, false);
    log.push(...result.log);
    return { log, hit: result.hit };
};

const handleSelfDestruct = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    // User faints regardless
    attacker.currentHp = 0;
    attacker.fainted = true;
    log.push(`${attacker.name} exploded!`);
    return { log, hit: result.hit };
};

const handleRest = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.currentHp >= attacker.maxHp && attacker.status === null) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const hpRestored = attacker.maxHp - attacker.currentHp;
    const priorStatus = attacker.status;

    // 1. Restore HP
    attacker.currentHp = attacker.maxHp;
    if (hpRestored > 0) {
        log.push(`${attacker.name} restored ${hpRestored} HP!`);
    }

    // 2. Clear prior status
    attacker.status = null;
    attacker.toxicCounter = 1;
    if (priorStatus) {
        log.push(`${attacker.name}'s ${priorStatus} was cured!`);
    }

    // 3. Apply sleep
    attacker.status = 'sleep';
    attacker.sleepTurnsRemaining = 2;
    log.push(`${attacker.name} fell asleep!`);

    return { log, hit: true };
};

const handleDreamEater = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    if (defender.status !== 'sleep') {
        log.push(`But it failed! ${defender.name} is not asleep.`);
        return { log, hit: false };
    }
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    if (result.hit && result.damage > 0) {
        handleDrain(move, attacker, result.damage, log);
    }
    return { log, hit: result.hit };
};

const handleSubstitute = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.substituteHp > 0) {
        log.push(`${attacker.name} already has a substitute!`);
        return { log, hit: false };
    }
    const subHp = Math.floor(attacker.maxHp / 4);
    if (attacker.currentHp <= subHp) {
        log.push(`${attacker.name} doesn't have enough HP to create a substitute!`);
        return { log, hit: false };
    }
    attacker.currentHp -= subHp;
    attacker.substituteHp = subHp;
    log.push(`${attacker.name} created a substitute!`);
    return { log, hit: true };
};

const handleDisable = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const lastMoveId = attackerPlayer === 'player1' ? state.player2LastMoveUsed : state.player1LastMoveUsed;
    if (!lastMoveId) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    if (defender.disabledMoveId) {
        log.push(`But it failed! ${defender.name} already has a move disabled.`);
        return { log, hit: false };
    }
    // Check the defender actually has that move
    const hasMove = defender.moves.some((m) => m.id === lastMoveId);
    if (!hasMove) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    defender.disabledMoveId = lastMoveId;
    defender.disabledTurnsRemaining = 4;
    const moveName = moveCache.get(lastMoveId)?.name ?? 'a move';
    log.push(`${defender.name}'s ${moveName} was disabled!`);
    void attacker;
    return { log, hit: true };
};

const handleConversion = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (!attacker.moves[0]) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const firstMoveType = attacker.moves[0].type;
    attacker.currentTypes = [firstMoveType];
    log.push(`${attacker.name} transformed its type to ${firstMoveType}!`);
    return { log, hit: true };
};

const handleTransform = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    // Copy types, stats (not HP), stat stages, and moves
    attacker.currentTypes = [...defender.currentTypes];
    attacker.stats = { ...defender.stats };
    attacker.statStages = { ...defender.statStages };
    attacker.moves = defender.moves.map((m) => ({
        ...m,
        currentPp: 5,
        maxPp: 5,
    }));
    log.push(`${attacker.name} transformed into ${defender.name}!`);
    return { log, hit: true };
};

const handleCounter = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    const damage = attacker.lastPhysicalDamageTaken * 2;
    if (damage <= 0) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    // Typeless damage, cannot miss, ignores type effectiveness
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${attacker.name} used Counter! ${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    return { log, hit: true };
};

const handleNightShade = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    // Normal types are immune
    if (defender.types.includes('normal')) {
        log.push(`It doesn't affect ${defender.name}...`);
        return { log, hit: false };
    }
    const damage = 50; // level 50
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    return { log, hit: true };
};

const handleSeismicToss = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    // Ghost types are immune
    if (defender.types.includes('ghost')) {
        log.push(`It doesn't affect ${defender.name}...`);
        return { log, hit: false };
    }
    const damage = 50; // level 50
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    void attacker;
    return { log, hit: true };
};

const handlePsywave = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    const damage = Math.max(1, Math.floor(Math.random() * 76)); // 1-75
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    void attacker;
    return { log, hit: true };
};

const handleSuperFang = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    const damage = Math.max(1, Math.floor(defender.currentHp / 2));
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    void attacker;
    return { log, hit: true };
};

const handleOHKO = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    // 30% accuracy, fails if user level < defender level (all level 50, so 30%)
    if (Math.random() > 0.30) {
        log.push(`${attacker.name}'s attack missed!`);
        return { log, hit: false };
    }
    void move;
    defender.currentHp = 0;
    defender.fainted = true;
    log.push(`${defender.name} is knocked out!`);
    return { log, hit: true };
};

const handleProtect = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    // Success chance decreases with consecutive uses
    const successChance = Math.pow(0.5, attacker.protectConsecutiveTurns);
    if (Math.random() > successChance) {
        attacker.protectConsecutiveTurns = 0;
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    attacker.protecting = true;
    attacker.protectConsecutiveTurns += 1;
    log.push(`${attacker.name} protected itself!`);
    return { log, hit: true };
};

const handleReflect = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.reflect) {
        log.push(`But it failed! Reflect is already active.`);
        return { log, hit: false };
    }
    attacker.reflect = true;
    attacker.reflectTurnsRemaining = 5;
    log.push(`${attacker.name} is protected by Reflect!`);
    return { log, hit: true };
};

const handleLightScreen = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.lightScreen) {
        log.push(`But it failed! Light Screen is already active.`);
        return { log, hit: false };
    }
    attacker.lightScreen = true;
    attacker.lightScreenTurnsRemaining = 5;
    log.push(`${attacker.name} is protected by Light Screen!`);
    return { log, hit: true };
};

const handleHaze = (attacker: BattlePokemon, defender: BattlePokemon, log: string[]): MoveEffectResult => {
    const zero = { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 };
    attacker.statStages = { ...zero };
    defender.statStages = { ...zero };
    log.push(`All stat changes were eliminated!`);
    return { log, hit: true };
};

const handleMist = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.mistActive) {
        log.push(`But it failed! Mist is already active.`);
        return { log, hit: false };
    }
    attacker.mistActive = true;
    attacker.mistTurnsRemaining = 5;
    log.push(`${attacker.name} is protected by the mist!`);
    return { log, hit: true };
};

const handleWhirlwindRoar = (
    attacker: BattlePokemon,
    defenderPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const defTeam = state[defenderPlayer].team;
    const validTargets = defTeam
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => !p.fainted && i !== state[defenderPlayer].activePokemonIndex);
    if (validTargets.length === 0) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const chosen = validTargets[Math.floor(Math.random() * validTargets.length)];
    const current = getActivePokemon(state, defenderPlayer);
    // Clear volatile status on withdrawing pokemon
    current.confused = false;
    current.confusionTurnsRemaining = 0;
    current.flinched = false;
    state[defenderPlayer].activePokemonIndex = chosen.i;
    log.push(`${attacker.name} blew ${current.name} away!`);
    log.push(`${state[defenderPlayer].name} sent out ${chosen.p.name}!`);
    return { log, hit: true };
};

const handleLeechSeed = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    log: string[]
): MoveEffectResult => {
    void move;
    if (!checkAccuracy(move, attacker, defender)) {
        log.push(`${attacker.name}'s attack missed!`);
        return { log, hit: false };
    }
    if (defender.types.includes('grass') || defender.currentTypes.includes('grass')) {
        log.push(`${defender.name} is immune to Leech Seed!`);
        return { log, hit: false };
    }
    if (defender.seeded) {
        log.push(`But it failed! ${defender.name} is already seeded.`);
        return { log, hit: false };
    }
    defender.seeded = true;
    defender.seededBy = attackerPlayer;
    log.push(`${defender.name} was seeded!`);
    return { log, hit: true };
};

// ── New move handlers ─────────────────────────────────────────────────────────

const handleTrapping = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    if (result.hit && defender.trappedByMove === null) {
        defender.trappedByMove = move.id;
        defender.trappedByPlayer = attackerPlayer;
        defender.trappedTurnsRemaining = Math.random() < 0.5 ? 4 : 5;
        const moveName = TRAPPING_MOVE_NAMES[move.id] ?? move.name.replace(/-/g, ' ');
        log.push(`${defender.name} was trapped in ${moveName}!`);
    }
    return { log, hit: result.hit };
};

const handleRollout = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const base = attacker.lockType === 'rollout' ? attacker.rolloutBasePower : 30;
    const power = attacker.defenseCurlUsed ? base * 2 : base;
    const result = handleDamage(move, attacker, defender, state, power);
    log.push(...result.log);
    return { log, hit: result.hit };
};

const handleFuryCutter = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    attacker.furyCutterConsecutiveTurns += 1;
    const power = Math.min(160, 10 * Math.pow(2, attacker.furyCutterConsecutiveTurns - 1));
    const result = handleDamage(move, attacker, defender, state, power);
    log.push(...result.log);
    if (!result.hit) attacker.furyCutterConsecutiveTurns = 0;
    return { log, hit: result.hit };
};

const handleDefenseCurl = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    applyStatChanges(attacker, [{ stat: { name: 'defense' }, change: 1 }], log);
    attacker.defenseCurlUsed = true;
    return { log, hit: true };
};

const handleRecover = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.currentHp >= attacker.maxHp) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const heal = Math.floor(attacker.maxHp / 2);
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
    log.push(`${attacker.name} restored ${heal} HP!`);
    return { log, hit: true };
};

const handleRoost = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.currentHp >= attacker.maxHp) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const heal = Math.floor(attacker.maxHp / 2);
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
    log.push(`${attacker.name} restored ${heal} HP!`);
    // Temporarily remove Flying type for this turn
    if (attacker.types.includes('flying')) {
        attacker.currentTypes = attacker.types.filter((t) => t !== 'flying');
        if (attacker.currentTypes.length === 0) attacker.currentTypes = ['normal'];
        attacker.roostUsedThisTurn = true;
    }
    return { log, hit: true };
};

const handleWeatherHeal = (attacker: BattlePokemon, weather: Weather, log: string[]): MoveEffectResult => {
    if (attacker.currentHp >= attacker.maxHp) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const fraction = weather === 'sun' ? 2 / 3
        : (weather === 'rain' || weather === 'sandstorm' || weather === 'hail') ? 0.25 : 0.5;
    const heal = Math.floor(attacker.maxHp * fraction);
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + Math.max(1, heal));
    log.push(`${attacker.name} restored ${Math.max(1, heal)} HP!`);
    return { log, hit: true };
};

const handleShoreUp = (attacker: BattlePokemon, weather: Weather, log: string[]): MoveEffectResult => {
    if (attacker.currentHp >= attacker.maxHp) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const fraction = weather === 'sandstorm' ? 2 / 3 : 0.5;
    const heal = Math.max(1, Math.floor(attacker.maxHp * fraction));
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
    log.push(`${attacker.name} restored ${heal} HP!`);
    return { log, hit: true };
};

const handleWish = (
    attacker: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const wishActiveKey = attackerPlayer === 'player1' ? 'player1WishActive' : 'player2WishActive';
    if (state[wishActiveKey]) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const wishHpKey = attackerPlayer === 'player1' ? 'player1WishHp' : 'player2WishHp';
    const wishTurnsKey = attackerPlayer === 'player1' ? 'player1WishTurnsRemaining' : 'player2WishTurnsRemaining';
    state[wishActiveKey] = true;
    state[wishHpKey] = Math.floor(attacker.maxHp / 2);
    state[wishTurnsKey] = 2;
    log.push(`${attacker.name} made a wish!`);
    return { log, hit: true };
};

const handleIngrain = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.ingrainActive) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    attacker.ingrainActive = true;
    log.push(`${attacker.name} planted its roots!`);
    return { log, hit: true };
};

const handleAquaRing = (attacker: BattlePokemon, log: string[]): MoveEffectResult => {
    if (attacker.aquaRingActive) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    attacker.aquaRingActive = true;
    log.push(`${attacker.name} surrounded itself with a veil of water!`);
    return { log, hit: true };
};

const handlePainSplit = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    const avg = Math.floor((attacker.currentHp + defender.currentHp) / 2);
    attacker.currentHp = Math.min(attacker.maxHp, avg);
    defender.currentHp = Math.min(defender.maxHp, avg);
    if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
    log.push(`${attacker.name} shared its pain with ${defender.name}!`);
    return { log, hit: true };
};

const handleHealPulse = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    const heal = Math.floor(defender.maxHp / 2);
    defender.currentHp = Math.min(defender.maxHp, defender.currentHp + heal);
    log.push(`${attacker.name} restored ${heal} HP to ${defender.name}!`);
    return { log, hit: true };
};

const handleHealingWish = (
    attacker: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    attacker.currentHp = 0;
    attacker.fainted = true;
    const pendingKey = attackerPlayer === 'player1' ? 'player1HealingWishPending' : 'player2HealingWishPending';
    state[pendingKey] = true;
    log.push(`${attacker.name} sacrificed itself!`);
    log.push(`${attacker.name} fainted!`);
    return { log, hit: true };
};

// Accuracy check helper (without moveCache lookup since we already have the move)
const checkAccuracy = (move: MoveResponse, attacker: BattlePokemon, defender: BattlePokemon): boolean => {
    if (move.accuracy === null) return true;
    const { getStatMultiplier } = require('../data/statStages');
    const accuracyStage = attacker.statStages.accuracy - defender.statStages.evasion;
    const accuracyMultiplier = getStatMultiplier(accuracyStage);
    return Math.random() < (move.accuracy / 100) * accuracyMultiplier;
};

// ── Category handlers ─────────────────────────────────────────────────────────

const handleAilmentCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    _attackerPlayer: 'player1' | 'player2',
    log: string[]
): MoveEffectResult => {
    // Accuracy check
    if (!checkAccuracy(move, attacker, defender)) {
        log.push(`${attacker.name}'s attack missed!`);
        return { log, hit: false };
    }
    // Substitute blocks status from opponent
    if (defender.substituteHp > 0) {
        log.push(`${defender.name}'s substitute blocked the move!`);
        return { log, hit: false };
    }
    // Mist blocks stat-lowering (ailment moves don't lower stats, but mist check needed for accuracy)
    const ailmentName = move.meta?.ailment?.name ?? 'none';
    const ailmentChance = move.meta?.ailment_chance ?? 0;
    // For pure ailment moves, treat 0 chance as 100% (guaranteed)
    const effectiveChance = ailmentChance === 0 ? 100 : ailmentChance;

    if (ailmentChance > 0 && Math.random() * 100 >= effectiveChance) {
        log.push(`But it failed!`);
        return { log, hit: true };
    }

    applyAilment(ailmentName, attacker, defender, _attackerPlayer, log);
    return { log, hit: true };
};

const applyAilment = (
    ailmentName: string,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    log: string[]
): void => {
    switch (ailmentName) {
        case 'confusion':
            applyVolatileStatus(defender, 'confusion', log);
            break;
        case 'leech-seed':
            applyVolatileStatus(defender, 'seed', log, attackerPlayer);
            break;
        case 'burn':
            applyPrimaryStatus(defender, 'burn', log);
            break;
        case 'freeze':
            applyPrimaryStatus(defender, 'freeze', log);
            break;
        case 'paralysis':
            applyPrimaryStatus(defender, 'paralysis', log);
            break;
        case 'poison':
            applyPrimaryStatus(defender, 'poison', log);
            break;
        case 'bad-poison':
            applyPrimaryStatus(defender, 'toxic', log);
            break;
        case 'sleep':
            applyPrimaryStatus(defender, 'sleep', log);
            break;
        case 'tri-attack': {
            const effects: PrimaryStatus[] = ['burn', 'freeze', 'paralysis'];
            applyPrimaryStatus(defender, effects[Math.floor(Math.random() * 3)], log);
            break;
        }
        case 'none':
        default:
            void attacker;
            break;
    }
};

const handleDamageAilmentCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    state: BattleState,
    log: string[],
    attackerMovedFirst: boolean
): MoveEffectResult => {
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    if (!result.hit) return { log, hit: false };

    const ailmentName = move.meta?.ailment?.name ?? 'none';
    const ailmentChance = move.meta?.ailment_chance ?? 0;
    if (ailmentName !== 'none' && ailmentName !== '' && ailmentChance > 0) {
        if (Math.random() * 100 < ailmentChance) {
            applyAilment(ailmentName, attacker, defender, attackerPlayer, log);
        }
    }
    handleFlinch(move, defender, attackerMovedFirst, log);
    return { log, hit: true };
};

const handleDamageLowerCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[],
    attackerMovedFirst: boolean
): MoveEffectResult => {
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    if (!result.hit) return { log, hit: false };

    const statChance = move.meta?.stat_chance ?? 0;
    if (move.stat_changes.length > 0) {
        if (statChance === 0 || Math.random() * 100 < statChance) {
            handleStatChanges(move, attacker, defender, 'target', log);
        }
    }
    handleFlinch(move, defender, attackerMovedFirst, log);
    return { log, hit: true };
};

const handleDamageRaiseCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[],
    attackerMovedFirst: boolean
): MoveEffectResult => {
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    if (!result.hit) return { log, hit: false };

    const statChance = move.meta?.stat_chance ?? 0;
    if (move.stat_changes.length > 0) {
        if (statChance === 0 || Math.random() * 100 < statChance) {
            handleStatChanges(move, attacker, defender, 'user', log);
        }
    }
    handleFlinch(move, defender, attackerMovedFirst, log);
    return { log, hit: true };
};

const handleDamageHealCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    if (!result.hit || result.damage === 0) return { log, hit: result.hit };

    if (move.meta.drain > 0) {
        handleDrain(move, attacker, result.damage, log);
    } else if (move.meta.drain < 0) {
        handleRecoil(move, attacker, result.damage, log);
    }
    return { log, hit: true };
};

const handleHealCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    if (attacker.currentHp >= attacker.maxHp) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const healPercent = move.meta?.healing ?? 0;
    if (healPercent <= 0) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    const heal = Math.max(1, Math.floor(attacker.maxHp * healPercent / 100));
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
    log.push(`${attacker.name} restored ${heal} HP!`);
    return { log, hit: true };
};

const handleNetGoodStatsCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    log: string[]
): MoveEffectResult => {
    if (move.stat_changes.length === 0) {
        log.push(`But it failed!`);
        return { log, hit: false };
    }
    applyStatChanges(attacker, move.stat_changes, log);
    return { log, hit: true };
};

const handleFieldEffectCategory = (
    move: MoveResponse,
    state: BattleState,
    log: string[]
): MoveEffectResult => {
    const ailmentName = move.meta?.ailment?.name ?? '';
    switch (ailmentName) {
        case 'harsh-sunlight':
        case 'sun':
            applyWeather(state, 'sun', log);
            break;
        case 'rain':
            applyWeather(state, 'rain', log);
            break;
        case 'sandstorm':
            applyWeather(state, 'sandstorm', log);
            break;
        case 'hail':
            applyWeather(state, 'hail', log);
            break;
        default:
            log.push(`But it failed!`);
    }
    return { log, hit: true };
};

const handleDamageCategory = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    state: BattleState,
    log: string[],
    attackerMovedFirst: boolean
): MoveEffectResult => {
    const result = handleDamage(move, attacker, defender, state);
    log.push(...result.log);
    if (result.hit) {
        // Recoil moves (Take Down, Double-Edge, Submission, etc.) have meta.drain < 0
        // but category "damage". Apply recoil here so they don't silently skip it.
        if (move.meta?.drain < 0) handleRecoil(move, attacker, result.damage, log);
        handleFlinch(move, defender, attackerMovedFirst, log);
    }
    return { log, hit: result.hit };
};

// ── Main pipeline entry ───────────────────────────────────────────────────────

/**
 * The single entry point for processing all move effects.
 * Mutates attacker, defender, and state in place (they are already deep copies from the reducer).
 * Returns log entries and whether the move hit.
 */
export const executeMoveEffect = (
    move: MoveResponse,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    defenderPlayer: 'player1' | 'player2',
    state: BattleState,
    decrementPP = true,
    attackerMovedFirst = true,
): MoveEffectResult => {
    const log: string[] = [];

    // Reset Fury Cutter chain when a different move is used
    if (move.id !== 210) {
        attacker.furyCutterConsecutiveTurns = 0;
    }

    // Decrement PP / handle Struggle
    if (decrementPP) {
        const ppResult = consumePP(move, attacker, log);
        if (ppResult === 'struggle') {
            log.push(`${attacker.name} used Struggle!`);
            return resolveStruggle(attacker, defender, log);
        }
    }

    log.push(`${attacker.name} used ${move.name.replace(/-/g, ' ')}!`);

    // Update last move used in state
    const lastMoveKey: 'player1LastMoveUsed' | 'player2LastMoveUsed' =
        attackerPlayer === 'player1' ? 'player1LastMoveUsed' : 'player2LastMoveUsed';
    state[lastMoveKey] = move.id;

    // Handle charging moves (two-turn: charge flag)
    const hasChargeFlag = move.flags?.charge === true;
    const isSolarBeam = move.id === 76;

    if (hasChargeFlag || isSolarBeam) {
        // Solar Beam skips charge in sun
        const skipCharge = isSolarBeam && state.weather === 'sun';
        if (!skipCharge && !attacker.charging) {
            // Apply solar beam weather power mod note (actual mod applied in calculateDamage)
            const charging = handleCharging(move, attacker, log);
            if (charging) {
                applyChargeTurnBonuses(move, attacker, log);
                return { log, hit: false };
            }
        } else if (attacker.charging && attacker.chargingMoveId === move.id) {
            // Second turn — clear charging and proceed
            handleCharging(move, attacker, log);
        }
    }

    // Handle bide — if biding, keep storing
    if (move.id === 117) {
        return handleBide(move, attacker, defender, log);
    }

    // Handle multi-hit before single-hit
    if (move.meta?.min_hits !== null && move.meta?.min_hits !== undefined) {
        const totalDmg = handleMultiHit(move, attacker, defender, state, log);
        if (move.meta.drain < 0) handleRecoil(move, attacker, totalDmg, log);
        if (move.meta.drain > 0) handleDrain(move, attacker, totalDmg, log);
        if (move.flags?.recharge) attacker.recharging = true;
        return { log, hit: totalDmg > 0 };
    }

    // ── Unique moves (matched by ID) ──────────────────────────────────────────

    switch (move.id) {
        // Jump Kick — crash damage on miss (1/2 user's max HP)
        case 26:
        // High Jump Kick
        case 136: {
            const crashResult = handleDamage(move, attacker, defender, state);
            log.push(...crashResult.log);
            if (!crashResult.hit) {
                handleCrashDamage(attacker, log);
            } else {
                handleFlinch(move, defender, attackerMovedFirst, log);
            }
            return { log, hit: crashResult.hit };
        }

        // Mind Blown — user pays floor(maxHp/2) regardless of damage
        case 812: {
            const mbResult = handleDamage(move, attacker, defender, state);
            log.push(...mbResult.log);
            if (mbResult.hit) handleFlinch(move, defender, attackerMovedFirst, log);
            if (!attacker.fainted) applyHalfHpCost(attacker, log);
            return { log, hit: mbResult.hit };
        }

        // Steel Beam — user pays floor(maxHp/2) regardless of damage
        case 796: {
            const sbResult = handleDamage(move, attacker, defender, state);
            log.push(...sbResult.log);
            if (!attacker.fainted) applyHalfHpCost(attacker, log);
            return { log, hit: sbResult.hit };
        }

        // Rage
        case 99:
            return handleRage(move, attacker, defender, state, log);

        // Mimic
        case 102:
            return handleMimic(move, attacker, attackerPlayer, state, log);

        // Metronome
        case 118:
            return handleMetronome(move, attacker, defender, attackerPlayer, defenderPlayer, state, log);

        // Self-Destruct
        case 120:
        // Explosion
        case 153:
            return handleSelfDestruct(move, attacker, defender, state, log);

        // Rest
        case 156:
            return handleRest(attacker, log);

        // Dream Eater
        case 138:
            return handleDreamEater(move, attacker, defender, state, log);

        // Substitute
        case 164:
            return handleSubstitute(attacker, log);

        // Disable
        case 50:
            return handleDisable(attacker, defender, attackerPlayer, state, log);

        // Leech Seed
        case 73:
            return handleLeechSeed(move, attacker, defender, attackerPlayer, log);

        // Conversion
        case 160:
            return handleConversion(attacker, log);

        // Transform
        case 144:
            return handleTransform(attacker, defender, log);

        // Counter
        case 68:
            return handleCounter(attacker, defender, log);

        // Night Shade
        case 101:
            if (!checkAccuracy(move, attacker, defender)) {
                log.push(`${attacker.name}'s attack missed!`);
                return { log, hit: false };
            }
            return handleNightShade(attacker, defender, log);

        // Seismic Toss
        case 69:
            if (!checkAccuracy(move, attacker, defender)) {
                log.push(`${attacker.name}'s attack missed!`);
                return { log, hit: false };
            }
            return handleSeismicToss(attacker, defender, log);

        // Psywave
        case 149:
            if (!checkAccuracy(move, attacker, defender)) {
                log.push(`${attacker.name}'s attack missed!`);
                return { log, hit: false };
            }
            return handlePsywave(attacker, defender, log);

        // Super Fang
        case 162:
            if (!checkAccuracy(move, attacker, defender)) {
                log.push(`${attacker.name}'s attack missed!`);
                return { log, hit: false };
            }
            return handleSuperFang(attacker, defender, log);

        // Guillotine
        case 12:
        // Horn Drill
        case 32:
        // Fissure
        case 90:
            return handleOHKO(move, attacker, defender, log);

        // Protect
        case 182:
        // Detect
        case 197:
            return handleProtect(attacker, log);

        // Reflect
        case 115:
            return handleReflect(attacker, log);

        // Light Screen
        case 113:
            return handleLightScreen(attacker, log);

        // Haze
        case 114:
            return handleHaze(attacker, defender, log);

        // Mist
        case 54:
            return handleMist(attacker, log);

        // Whirlwind
        case 18:
        // Roar
        case 46:
            return handleWhirlwindRoar(attacker, defenderPlayer, state, log);

        // Teleport — fails in battle
        case 100:
            log.push(`But it failed!`);
            return { log, hit: false };

        // Splash — does nothing
        case 150:
            log.push(`But nothing happened!`);
            return { log, hit: false };

        // ── Trapping moves ────────────────────────────────────────────────────

        // Bind
        case 20:
        // Wrap
        case 35:
        // Fire Spin
        case 83:
        // Clamp
        case 128:
        // Whirlpool (also pierces underwater invulnerability — handled in handleDamage)
        case 250:
        // Sand Tomb
        case 328:
        // Infestation
        case 611:
            return handleTrapping(move, attacker, defender, attackerPlayer, state, log);

        // ── Rollout / Ice Ball ────────────────────────────────────────────────

        // Rollout
        case 205:
        // Ice Ball
        case 301:
            return handleRollout(move, attacker, defender, state, log);

        // ── Fury Cutter ───────────────────────────────────────────────────────

        case 210:
            return handleFuryCutter(move, attacker, defender, state, log);

        // ── Defense Curl ──────────────────────────────────────────────────────

        case 111:
            return handleDefenseCurl(attacker, log);

        // ── Healing moves ─────────────────────────────────────────────────────

        // Recover
        case 105:
        // Soft-Boiled
        case 135:
        // Milk Drink
        case 208:
        // Slack Off
        case 303:
            return handleRecover(attacker, log);

        // Roost
        case 355:
            return handleRoost(attacker, log);

        // Morning Sun
        case 234:
        // Synthesis
        case 235:
        // Moonlight
        case 236:
            return handleWeatherHeal(attacker, state.weather, log);

        // Shore Up
        case 659:
            return handleShoreUp(attacker, state.weather, log);

        // Wish
        case 107:
            return handleWish(attacker, attackerPlayer, state, log);

        // Ingrain
        case 275:
            return handleIngrain(attacker, log);

        // Aqua Ring
        case 392:
            return handleAquaRing(attacker, log);

        // Pain Split
        case 220:
            return handlePainSplit(attacker, defender, log);

        // Heal Pulse
        case 505:
            return handleHealPulse(attacker, defender, log);

        // Healing Wish
        case 361:
        // Lunar Dance
        case 411:
            return handleHealingWish(attacker, attackerPlayer, state, log);
    }

    // ── Weather moves (handled by field-effect or direct check) ──────────────
    const WEATHER_MOVES: Record<number, import('../models/battle.models').Weather> = {
        240: 'rain',
        241: 'sun',
        237: 'sandstorm',
        258: 'hail',
    };
    if (WEATHER_MOVES[move.id]) {
        applyWeather(state, WEATHER_MOVES[move.id], log);
        return { log, hit: true };
    }

    // ── Category dispatch ─────────────────────────────────────────────────────

    const category = move.meta?.category?.name ?? 'damage';

    switch (category) {
        case 'damage':
            return handleDamageCategory(move, attacker, defender, state, log, attackerMovedFirst);

        case 'ailment':
            return handleAilmentCategory(move, attacker, defender, attackerPlayer, log);

        case 'damage+ailment':
            return handleDamageAilmentCategory(move, attacker, defender, attackerPlayer, state, log, attackerMovedFirst);

        case 'damage+lower':
            return handleDamageLowerCategory(move, attacker, defender, state, log, attackerMovedFirst);

        case 'damage+raise':
            return handleDamageRaiseCategory(move, attacker, defender, state, log, attackerMovedFirst);

        case 'damage+heal':
            return handleDamageHealCategory(move, attacker, defender, state, log);

        case 'heal':
            return handleHealCategory(move, attacker, log);

        case 'net-good-stats':
            return handleNetGoodStatsCategory(move, attacker, log);

        case 'field-effect':
            return handleFieldEffectCategory(move, state, log);

        case 'swagger':
            // Raises attack by 2, confuses defender
            applyStatChanges(defender, [{ stat: { name: 'attack' }, change: 2 }], log);
            applyVolatileStatus(defender, 'confusion', log);
            return { log, hit: true };

        case 'damage+recharge':
            // e.g. Hyper Beam — handled by recharge flag below
            return handleDamageCategory(move, attacker, defender, state, log, attackerMovedFirst);

        case 'ohko':
            return handleOHKO(move, attacker, defender, log);

        case 'whole-field-effect':
        case 'force-switch':
            return handleWhirlwindRoar(attacker, defenderPlayer, state, log);

        case 'unique':
        default: {
            // Check short_effect for unique behaviors we recognize
            const shortEffect = move.effect_entries?.[0]?.short_effect ?? '';
            if (shortEffect.toLowerCase().includes('nothing')) {
                log.push(`But nothing happened!`);
                return { log, hit: false };
            }
            // Default: treat as a damage move
            return handleDamageCategory(move, attacker, defender, state, log, attackerMovedFirst);
        }
    }

    // Apply recharge flag after move executes (covered by returns above for most paths, but
    // the damage+recharge case falls through here)
};

/**
 * Post-move hook: apply recharge flag if the move requires it.
 * Call this after executeMoveEffect if the move hit.
 */
export const applyPostMoveEffects = (
    move: MoveResponse,
    attacker: BattlePokemon,
): void => {
    if (move.flags?.recharge || move.meta?.category?.name === 'damage+recharge') {
        attacker.recharging = true;
    }
};
