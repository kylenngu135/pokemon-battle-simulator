import { BattleState, BattlePokemon, PendingAction, Weather } from '../models/battle.models';
import { moveCache } from '../cache/moveCache';
import { getStatMultiplier } from '../data/statStages';
import { calculateDamage, checkAccuracy } from './damage.utils';
import { applyStatChanges, getActivePokemon } from './battle.utils';
import { executeMoveEffect, applyPostMoveEffects } from '../battle-engine/movePipeline';

// Returns true if the move successfully executed (hit and ran), false if it missed or had no effect
// This now delegates to the movePipeline for all move effects.
export const resolveMoveAction = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    moveId: number,
    log: string[],
    weather: Weather = 'none',
    attackerPlayer: 'player1' | 'player2' = 'player1',
    defenderPlayer: 'player1' | 'player2' = 'player2',
    state?: BattleState,
    attackerMovedFirst = true,
): boolean => {
    void weather; // weather is in state now
    const move = moveCache.get(moveId);
    if (!move) {
        log.push(`Move not found!`);
        return false;
    }

    if (!state) {
        // Fallback for callers that don't have state (legacy HTTP controller)
        const battleMove = attacker.moves.find((m) => m.id === moveId);
        if (battleMove) {
            if (battleMove.currentPp <= 0) {
                log.push(`${attacker.name} has no PP left for ${move.name}! Used Struggle!`);
                defender.currentHp = Math.max(0, defender.currentHp - 40);
                attacker.currentHp = Math.max(0, attacker.currentHp - Math.floor(attacker.maxHp / 4));
                if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
                if (attacker.currentHp <= 0) { attacker.fainted = true; log.push(`${attacker.name} fainted!`); }
                return true;
            }
            battleMove.currentPp -= 1;
        }
        log.push(`${attacker.name} used ${move.name.replace(/-/g, ' ')}!`);
        if (!checkAccuracy(moveId, attacker, defender)) {
            log.push(`${attacker.name}'s attack missed!`);
            return false;
        }
        if (move.damage_class.name !== 'status') {
            const { damage, effectiveness, isCrit, isStab } = calculateDamage(attacker, defender, moveId);
            if (effectiveness === 0) { log.push(`It doesn't affect ${defender.name}...`); return false; }
            if (isStab) log.push('STAB bonus applied!');
            if (effectiveness > 1) log.push("It's super effective!");
            if (effectiveness < 1) log.push("It's not very effective...");
            if (isCrit) log.push('A critical hit!');
            defender.currentHp = Math.max(0, defender.currentHp - damage);
            log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);
            if (defender.currentHp <= 0) { defender.fainted = true; log.push(`${defender.name} fainted!`); }
        } else {
            if (move.stat_changes.length > 0) {
                const target = move.target.name.includes('user') ? attacker : defender;
                applyStatChanges(target, move.stat_changes, log);
            }
        }
        return true;
    }

    // Full pipeline path
    const result = executeMoveEffect(move, attacker, defender, attackerPlayer, defenderPlayer, state, true, attackerMovedFirst);
    log.push(...result.log);
    if (result.hit) {
        applyPostMoveEffects(move, attacker);
    }
    return result.hit;
};

export const resolveSwitchAction = (
    state: BattleState,
    player: 'player1' | 'player2',
    switchToIndex: number,
    log: string[]
): void => {
    const p = state[player];
    const current = p.team[p.activePokemonIndex];
    const switchTarget = p.team[switchToIndex];

    if (!switchTarget || switchTarget.fainted) {
        log.push(`Cannot switch to that pokemon!`);
        return;
    }

    log.push(`${p.name} withdrew ${current.name}!`);

    // Clear volatile status on the withdrawing pokemon
    current.confused = false;
    current.confusionTurnsRemaining = 0;
    current.flinched = false;
    current.seeded = false;
    current.seededBy = null;
    current.reflect = false;
    current.lightScreen = false;
    current.reflectTurnsRemaining = 0;
    current.lightScreenTurnsRemaining = 0;
    current.recharging = false;
    current.charging = false;
    current.chargingMoveId = null;
    current.chargingTurnsRemaining = 0;
    current.invulnerableState = 'none';
    current.biding = false;
    current.bideTurnsRemaining = 0;
    current.bideDamageStored = 0;
    current.raging = false;
    current.substituteHp = 0;
    current.disabledMoveId = null;
    current.disabledTurnsRemaining = 0;
    current.protecting = false;
    current.protectConsecutiveTurns = 0;
    current.lastPhysicalDamageTaken = 0;
    current.mistActive = false;
    current.mistTurnsRemaining = 0;
    current.lockedMove = null;
    current.lockType = null;
    current.lockTurnsRemaining = 0;
    current.lockTotalTurns = 0;
    current.rampageTurns = 0;
    current.rolloutConsecutiveTurns = 0;
    current.rolloutBasePower = 0;
    current.defenseCurlUsed = false;
    current.furyCutterConsecutiveTurns = 0;
    current.trappedByMove = null;
    current.trappedByPlayer = null;
    current.trappedTurnsRemaining = 0;
    current.ingrainActive = false;
    current.aquaRingActive = false;
    current.roostUsedThisTurn = false;
    // Reset stat stages
    current.statStages = { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 };
    // Reset toxic counter (to 1 so it starts fresh if still toxic)
    if (current.status === 'toxic') current.toxicCounter = 1;

    p.activePokemonIndex = switchToIndex;
    log.push(`${p.name} sent out ${switchTarget.name}!`);

    // Healing Wish / Lunar Dance pending: fully restore the switched-in pokemon
    const healingWishKey = player === 'player1' ? 'player1HealingWishPending' : 'player2HealingWishPending';
    if (state[healingWishKey]) {
        state[healingWishKey] = false;
        switchTarget.currentHp = switchTarget.maxHp;
        switchTarget.status = null;
        switchTarget.toxicCounter = 1;
        switchTarget.sleepTurnsRemaining = 0;
        log.push(`${switchTarget.name} was restored by the healing wish!`);
    }
};

export const determineTurnOrder = (
    state: BattleState,
    p1Action: PendingAction,
    p2Action: PendingAction
): Array<{ player: 'player1' | 'player2'; action: PendingAction }> => {
    // switches always go first
    if (p1Action.type === 'switch' && p2Action.type !== 'switch') return [
        { player: 'player1', action: p1Action },
        { player: 'player2', action: p2Action },
    ];
    if (p2Action.type === 'switch' && p1Action.type !== 'switch') return [
        { player: 'player2', action: p2Action },
        { player: 'player1', action: p1Action },
    ];

    // check move priority (e.g. Quick Attack = +1)
    const p1Move = p1Action.moveId ? moveCache.get(p1Action.moveId) : null;
    const p2Move = p2Action.moveId ? moveCache.get(p2Action.moveId) : null;
    const p1Priority = p1Move?.priority ?? 0;
    const p2Priority = p2Move?.priority ?? 0;

    if (p1Priority !== p2Priority) {
        return p1Priority > p2Priority
            ? [{ player: 'player1', action: p1Action }, { player: 'player2', action: p2Action }]
            : [{ player: 'player2', action: p2Action }, { player: 'player1', action: p1Action }];
    }

    // speed tiebreak (paralysis halves effective speed)
    const p1Mon = getActivePokemon(state, 'player1');
    const p2Mon = getActivePokemon(state, 'player2');
    const p1Speed = p1Mon.stats.speed * getStatMultiplier(p1Mon.statStages.speed) *
        (p1Mon.status === 'paralysis' ? 0.25 : 1);
    const p2Speed = p2Mon.stats.speed * getStatMultiplier(p2Mon.statStages.speed) *
        (p2Mon.status === 'paralysis' ? 0.25 : 1);

    if (p1Speed === p2Speed) {
        // true speed tie — random
        return Math.random() < 0.5
            ? [{ player: 'player1', action: p1Action }, { player: 'player2', action: p2Action }]
            : [{ player: 'player2', action: p2Action }, { player: 'player1', action: p1Action }];
    }

    return p1Speed > p2Speed
        ? [{ player: 'player1', action: p1Action }, { player: 'player2', action: p2Action }]
        : [{ player: 'player2', action: p2Action }, { player: 'player1', action: p1Action }];
};
