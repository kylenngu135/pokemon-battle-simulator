import { BattlePokemon, PendingAction } from '../models/battle.models';

export const RAMPAGE_MOVE_IDS = new Set([37, 80, 200, 253]);  // Thrash, Petal Dance, Outrage, Uproar
export const ROLLOUT_MOVE_IDS = new Set([205, 301]);       // Rollout, Ice Ball
export const TRAPPING_MOVE_IDS = new Set([20, 35, 83, 128, 250, 328, 611]); // Bind, Wrap, Fire Spin, Clamp, Whirlpool, Sand Tomb, Infestation

export const TRAPPING_MOVE_NAMES: Record<number, string> = {
    20: 'Bind',
    35: 'Wrap',
    83: 'Fire Spin',
    128: 'Clamp',
    250: 'Whirlpool',
    328: 'Sand Tomb',
    611: 'Infestation',
};

export const isLocked = (pokemon: BattlePokemon): boolean =>
    pokemon.lockedMove !== null;

export const getLockedAction = (pokemon: BattlePokemon): PendingAction => ({
    type: 'attack',
    moveId: pokemon.lockedMove!,
});

export const releaseLock = (pokemon: BattlePokemon, log: string[]): void => {
    const wasRampage = pokemon.lockType === 'rampage';

    pokemon.lockedMove = null;
    pokemon.lockType = null;
    pokemon.lockTurnsRemaining = 0;
    pokemon.lockTotalTurns = 0;
    pokemon.rampageTurns = 0;
    pokemon.rolloutConsecutiveTurns = 0;
    pokemon.rolloutBasePower = 0;

    if (wasRampage && !pokemon.confused) {
        pokemon.confused = true;
        pokemon.confusionTurnsRemaining = Math.floor(Math.random() * 4) + 2;
        log.push(`${pokemon.name} became confused due to fatigue!`);
    }
};

/**
 * Called after executeMoveEffect to sync the lock state from the outcome of a move.
 * Updates lockedMove, lockType, lockTurnsRemaining etc. based on what the pipeline did.
 */
export const syncLockStateAfterMove = (
    moveId: number,
    actingPokemon: BattlePokemon,
    hit: boolean,
    log: string[],
): void => {
    // ── Charging (Fly, Dig, etc.) — sync from charging field set by pipeline ──
    if (actingPokemon.charging && actingPokemon.lockedMove === null) {
        actingPokemon.lockedMove = actingPokemon.chargingMoveId;
        actingPokemon.lockType = 'charging';
        actingPokemon.lockTurnsRemaining = 1;
        actingPokemon.lockTotalTurns = 2;
    } else if (!actingPokemon.charging && actingPokemon.lockType === 'charging') {
        releaseLock(actingPokemon, log);
    }

    // ── Bide — sync from biding field set by pipeline ──
    if (actingPokemon.biding && actingPokemon.lockedMove === null) {
        actingPokemon.lockedMove = 117; // Bide
        actingPokemon.lockType = 'bide';
        actingPokemon.lockTurnsRemaining = actingPokemon.bideTurnsRemaining;
        actingPokemon.lockTotalTurns = 2;
    } else if (actingPokemon.lockType === 'bide') {
        if (!actingPokemon.biding) {
            // Bide released (fired or failed)
            releaseLock(actingPokemon, log);
        } else {
            // Update remaining turns
            actingPokemon.lockTurnsRemaining = actingPokemon.bideTurnsRemaining;
        }
    }

    // ── Rampage (Thrash, Outrage, Petal Dance) ──
    if (RAMPAGE_MOVE_IDS.has(moveId)) {
        if (hit) {
            if (actingPokemon.lockedMove === null) {
                const turns = Math.floor(Math.random() * 2) + 2; // 2 or 3
                actingPokemon.lockedMove = moveId;
                actingPokemon.lockType = 'rampage';
                actingPokemon.rampageTurns = turns;
                actingPokemon.lockTurnsRemaining = turns - 1;
                actingPokemon.lockTotalTurns = turns;
            } else if (actingPokemon.lockType === 'rampage') {
                actingPokemon.lockTurnsRemaining -= 1;
                if (actingPokemon.lockTurnsRemaining <= 0) {
                    releaseLock(actingPokemon, log);
                }
            }
        } else if (actingPokemon.lockType === 'rampage') {
            // Missed during rampage — release and confuse
            releaseLock(actingPokemon, log);
        }
    }

    // ── Rollout / Ice Ball ──
    if (ROLLOUT_MOVE_IDS.has(moveId)) {
        if (hit) {
            if (actingPokemon.lockedMove === null) {
                actingPokemon.lockedMove = moveId;
                actingPokemon.lockType = 'rollout';
                actingPokemon.rolloutConsecutiveTurns = 1;
                actingPokemon.rolloutBasePower = 30;
                actingPokemon.lockTurnsRemaining = 4;
                actingPokemon.lockTotalTurns = 5;
            } else if (actingPokemon.lockType === 'rollout') {
                actingPokemon.lockTurnsRemaining -= 1;
                actingPokemon.rolloutConsecutiveTurns += 1;
                actingPokemon.rolloutBasePower = 30 * Math.pow(2, actingPokemon.rolloutConsecutiveTurns - 1);
                if (actingPokemon.lockTurnsRemaining <= 0) {
                    releaseLock(actingPokemon, log);
                }
            }
        } else if (actingPokemon.lockType === 'rollout') {
            releaseLock(actingPokemon, log);
        }
    }
};

export const getTrapDamage = (trappedPokemon: BattlePokemon): number => {
    if (!trappedPokemon.trappedByMove) return 0;
    return Math.max(1, Math.floor(trappedPokemon.maxHp / 8));
};

export const advanceTrap = (pokemon: BattlePokemon, log: string[]): void => {
    if (!pokemon.trappedByMove) return;
    pokemon.trappedTurnsRemaining -= 1;
    if (pokemon.trappedTurnsRemaining <= 0) {
        const moveName = TRAPPING_MOVE_NAMES[pokemon.trappedByMove] ?? 'the trap';
        log.push(`${pokemon.name} was freed from ${moveName}!`);
        pokemon.trappedByMove = null;
        pokemon.trappedByPlayer = null;
        pokemon.trappedTurnsRemaining = 0;
    }
};
