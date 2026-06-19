import { BattleState, BattlePokemon, PendingAction } from '../models/battle.models';
import { moveCache } from '../cache/moveCache';
import { getStatMultiplier } from '../data/statStages';
import { calculateDamage, checkAccuracy } from './damage.utils';
import { applyStatChanges, getActivePokemon } from './battle.utils';

export const resolveMoveAction = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    moveId: number,
    log: string[]
): void => {
    const move = moveCache.get(moveId);
    if (!move) {
        log.push(`Move not found!`);
        return;
    }

    // decrement PP
    const battleMove = attacker.moves.find((m) => m.id === moveId);
    if (battleMove) {
        if (battleMove.currentPp <= 0) {
            log.push(`${attacker.name} has no PP left for ${move.name}! Used Struggle!`);
            // struggle does fixed damage, ignores type
            defender.currentHp = Math.max(0, defender.currentHp - 40);
            attacker.currentHp = Math.max(0, attacker.currentHp - Math.floor(attacker.maxHp / 4));
            return;
        }
        battleMove.currentPp -= 1;
    }

    log.push(`${attacker.name} used ${move.name}!`);

    // check accuracy
    if (!checkAccuracy(moveId, attacker, defender)) {
        log.push(`${attacker.name}'s attack missed!`);
        return;
    }

    // status moves — apply stat changes only
    if (move.damage_class.name === 'status') {
        if (move.stat_changes.length > 0) {
            const target = move.target.name.includes('user') ? attacker : defender;
            applyStatChanges(target, move.stat_changes, log);
        }
        return;
    }

    // damaging moves
    const { damage, effectiveness, isCrit, isStab } = calculateDamage(attacker, defender, moveId);

    if (isStab) log.push(`STAB bonus applied!`);
    if (effectiveness > 1) log.push(`It's super effective!`);
    if (effectiveness < 1 && effectiveness > 0) log.push(`It's not very effective...`);
    if (effectiveness === 0) {
        log.push(`It doesn't affect ${defender.name}...`);
        return;
    }
    if (isCrit) log.push(`A critical hit!`);

    defender.currentHp = Math.max(0, defender.currentHp - damage);
    log.push(`${defender.name} took ${damage} damage! (${defender.currentHp}/${defender.maxHp} HP remaining)`);

    // secondary stat changes from move (e.g. Crunch lowering defense)
    if (move.stat_changes.length > 0 && move.effect_chance) {
        if (Math.random() < move.effect_chance / 100) {
            applyStatChanges(defender, move.stat_changes, log);
        }
    }

    // check faint
    if (defender.currentHp <= 0) {
        defender.fainted = true;
        log.push(`${defender.name} fainted!`);
    }
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
    p.activePokemonIndex = switchToIndex;
    log.push(`${p.name} sent out ${switchTarget.name}!`);
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

    // speed tiebreak
    const p1Speed = getActivePokemon(state, 'player1').stats.speed *
        getStatMultiplier(getActivePokemon(state, 'player1').statStages.speed);
    const p2Speed = getActivePokemon(state, 'player2').stats.speed *
        getStatMultiplier(getActivePokemon(state, 'player2').statStages.speed);

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
