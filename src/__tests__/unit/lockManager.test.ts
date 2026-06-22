import {
    isLocked,
    getLockedAction,
    releaseLock,
    syncLockStateAfterMove,
    getTrapDamage,
    advanceTrap,
    RAMPAGE_MOVE_IDS,
    ROLLOUT_MOVE_IDS,
    TRAPPING_MOVE_IDS,
} from '../../battle-engine/lockManager';
import { BattlePokemon } from '../../models/battle.models';

const makePokemon = (overrides: Partial<BattlePokemon> = {}): BattlePokemon => ({
    id: 1,
    name: 'bulbasaur',
    currentHp: 100,
    maxHp: 100,
    stats: { attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50 },
    statStages: { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 },
    types: ['grass'],
    currentTypes: ['grass'],
    moves: [],
    sprites: { front: '', back: '' },
    fainted: false,
    status: null,
    sleepTurnsRemaining: 0,
    toxicCounter: 1,
    recharging: false,
    confused: false,
    confusionTurnsRemaining: 0,
    flinched: false,
    seeded: false,
    seededBy: null,
    reflect: false,
    lightScreen: false,
    reflectTurnsRemaining: 0,
    lightScreenTurnsRemaining: 0,
    charging: false,
    chargingMoveId: null,
    chargingTurnsRemaining: 0,
    invulnerableState: 'none',
    biding: false,
    bideTurnsRemaining: 0,
    bideDamageStored: 0,
    raging: false,
    substituteHp: 0,
    disabledMoveId: null,
    disabledTurnsRemaining: 0,
    lastPhysicalDamageTaken: 0,
    protecting: false,
    protectConsecutiveTurns: 0,
    mistActive: false,
    mistTurnsRemaining: 0,
    lockedMove: null,
    lockType: null,
    lockTurnsRemaining: 0,
    lockTotalTurns: 0,
    rampageTurns: 0,
    rolloutConsecutiveTurns: 0,
    rolloutBasePower: 0,
    defenseCurlUsed: false,
    furyCutterConsecutiveTurns: 0,
    trappedByMove: null,
    trappedByPlayer: null,
    trappedTurnsRemaining: 0,
    ingrainActive: false,
    aquaRingActive: false,
    roostUsedThisTurn: false,
    ...overrides,
});

// ── isLocked ──────────────────────────────────────────────────────────────────

describe('isLocked', () => {
    it('returns false when lockedMove is null', () => {
        const p = makePokemon({ lockedMove: null });
        expect(isLocked(p)).toBe(false);
    });

    it('returns true when lockedMove is set', () => {
        const p = makePokemon({ lockedMove: 37, lockType: 'rampage' });
        expect(isLocked(p)).toBe(true);
    });
});

// ── getLockedAction ───────────────────────────────────────────────────────────

describe('getLockedAction', () => {
    it('returns an attack action with the locked move id', () => {
        const p = makePokemon({ lockedMove: 200, lockType: 'rampage' });
        const action = getLockedAction(p);
        expect(action).toEqual({ type: 'attack', moveId: 200 });
    });
});

// ── releaseLock ───────────────────────────────────────────────────────────────

describe('releaseLock', () => {
    it('clears all lock fields', () => {
        const p = makePokemon({
            lockedMove: 37,
            lockType: 'rampage',
            lockTurnsRemaining: 1,
            lockTotalTurns: 3,
            rampageTurns: 3,
        });
        releaseLock(p, []);
        expect(p.lockedMove).toBeNull();
        expect(p.lockType).toBeNull();
        expect(p.lockTurnsRemaining).toBe(0);
        expect(p.lockTotalTurns).toBe(0);
        expect(p.rampageTurns).toBe(0);
    });

    it('causes confusion after rampage ends', () => {
        const p = makePokemon({ lockedMove: 37, lockType: 'rampage', confused: false });
        const log: string[] = [];
        releaseLock(p, log);
        expect(p.confused).toBe(true);
        expect(p.confusionTurnsRemaining).toBeGreaterThanOrEqual(2);
        expect(log.some(l => l.includes('confused'))).toBe(true);
    });

    it('does not double-confuse if already confused', () => {
        const p = makePokemon({ lockedMove: 37, lockType: 'rampage', confused: true, confusionTurnsRemaining: 3 });
        const log: string[] = [];
        releaseLock(p, log);
        expect(p.confusionTurnsRemaining).toBe(3); // unchanged
        expect(log.some(l => l.includes('confused'))).toBe(false);
    });

    it('does not confuse after non-rampage lock release', () => {
        const p = makePokemon({ lockedMove: 19, lockType: 'charging' });
        const log: string[] = [];
        releaseLock(p, log);
        expect(p.confused).toBe(false);
    });
});

// ── getTrapDamage ─────────────────────────────────────────────────────────────

describe('getTrapDamage', () => {
    it('returns 0 when not trapped', () => {
        const p = makePokemon({ trappedByMove: null, maxHp: 100 });
        expect(getTrapDamage(p)).toBe(0);
    });

    it('returns 1/8 maxHp (floored, min 1) when trapped', () => {
        const p = makePokemon({ trappedByMove: 35, maxHp: 100 });
        expect(getTrapDamage(p)).toBe(12); // floor(100/8)
    });

    it('returns at least 1 for tiny maxHp', () => {
        const p = makePokemon({ trappedByMove: 35, maxHp: 4 });
        expect(getTrapDamage(p)).toBe(1); // floor(4/8) = 0, clamped to 1
    });
});

// ── advanceTrap ───────────────────────────────────────────────────────────────

describe('advanceTrap', () => {
    it('decrements trappedTurnsRemaining', () => {
        const p = makePokemon({ trappedByMove: 35, trappedTurnsRemaining: 3, trappedByPlayer: 'player1' });
        advanceTrap(p, []);
        expect(p.trappedTurnsRemaining).toBe(2);
        expect(p.trappedByMove).toBe(35); // still trapped
    });

    it('clears trap fields and logs freedom when turns reach 0', () => {
        const p = makePokemon({ trappedByMove: 35, trappedTurnsRemaining: 1, trappedByPlayer: 'player1' });
        const log: string[] = [];
        advanceTrap(p, log);
        expect(p.trappedByMove).toBeNull();
        expect(p.trappedByPlayer).toBeNull();
        expect(p.trappedTurnsRemaining).toBe(0);
        expect(log.some(l => l.includes('freed'))).toBe(true);
    });

    it('does nothing if not trapped', () => {
        const p = makePokemon({ trappedByMove: null });
        const log: string[] = [];
        advanceTrap(p, log);
        expect(log).toHaveLength(0);
    });
});

// ── syncLockStateAfterMove — charging ────────────────────────────────────────

describe('syncLockStateAfterMove — charging', () => {
    it('sets lock state when pokemon starts charging', () => {
        const p = makePokemon({ charging: true, chargingMoveId: 19, lockedMove: null });
        syncLockStateAfterMove(19, p, true, []);
        expect(p.lockedMove).toBe(19);
        expect(p.lockType).toBe('charging');
        expect(p.lockTurnsRemaining).toBe(1);
        expect(p.lockTotalTurns).toBe(2);
    });

    it('releases lock when charging completes', () => {
        const p = makePokemon({ charging: false, lockedMove: 19, lockType: 'charging', lockTurnsRemaining: 1 });
        syncLockStateAfterMove(19, p, true, []);
        expect(p.lockedMove).toBeNull();
        expect(p.lockType).toBeNull();
    });
});

// ── syncLockStateAfterMove — rampage ─────────────────────────────────────────

describe('syncLockStateAfterMove — rampage', () => {
    it('applies rampage lock on first hit', () => {
        const p = makePokemon({ lockedMove: null });
        // Thrash = 37
        syncLockStateAfterMove(37, p, true, []);
        expect(p.lockedMove).toBe(37);
        expect(p.lockType).toBe('rampage');
        expect(p.rampageTurns).toBeGreaterThanOrEqual(2);
        expect(p.rampageTurns).toBeLessThanOrEqual(3);
    });

    it('decrements lockTurnsRemaining on subsequent hits', () => {
        const p = makePokemon({
            lockedMove: 37,
            lockType: 'rampage',
            lockTurnsRemaining: 2,
            lockTotalTurns: 3,
            rampageTurns: 3,
        });
        syncLockStateAfterMove(37, p, true, []);
        expect(p.lockTurnsRemaining).toBe(1);
    });

    it('releases lock and causes confusion when turns reach 0', () => {
        const p = makePokemon({
            lockedMove: 37,
            lockType: 'rampage',
            lockTurnsRemaining: 1,
            lockTotalTurns: 2,
            rampageTurns: 2,
        });
        const log: string[] = [];
        syncLockStateAfterMove(37, p, true, log);
        expect(p.lockedMove).toBeNull();
        expect(p.confused).toBe(true);
    });

    it('releases lock and causes confusion on miss during rampage', () => {
        const p = makePokemon({
            lockedMove: 37,
            lockType: 'rampage',
            lockTurnsRemaining: 2,
            lockTotalTurns: 3,
            rampageTurns: 3,
        });
        const log: string[] = [];
        syncLockStateAfterMove(37, p, false, log);
        expect(p.lockedMove).toBeNull();
        expect(p.confused).toBe(true);
    });
});

// ── syncLockStateAfterMove — rollout ─────────────────────────────────────────

describe('syncLockStateAfterMove — rollout', () => {
    it('applies rollout lock on first hit', () => {
        const p = makePokemon({ lockedMove: null });
        syncLockStateAfterMove(205, p, true, []);
        expect(p.lockedMove).toBe(205);
        expect(p.lockType).toBe('rollout');
        expect(p.rolloutConsecutiveTurns).toBe(1);
        expect(p.rolloutBasePower).toBe(30);
        expect(p.lockTurnsRemaining).toBe(4);
        expect(p.lockTotalTurns).toBe(5);
    });

    it('doubles power each consecutive hit', () => {
        const p = makePokemon({
            lockedMove: 205,
            lockType: 'rollout',
            rolloutConsecutiveTurns: 1,
            rolloutBasePower: 30,
            lockTurnsRemaining: 4,
            lockTotalTurns: 5,
        });
        syncLockStateAfterMove(205, p, true, []);
        expect(p.rolloutConsecutiveTurns).toBe(2);
        expect(p.rolloutBasePower).toBe(60); // 30 * 2^1
        expect(p.lockTurnsRemaining).toBe(3);
    });

    it('releases rollout lock after 5 turns', () => {
        const p = makePokemon({
            lockedMove: 205,
            lockType: 'rollout',
            rolloutConsecutiveTurns: 4,
            rolloutBasePower: 240,
            lockTurnsRemaining: 1,
            lockTotalTurns: 5,
        });
        syncLockStateAfterMove(205, p, true, []);
        expect(p.lockedMove).toBeNull();
        expect(p.lockType).toBeNull();
    });

    it('releases rollout lock on miss', () => {
        const p = makePokemon({
            lockedMove: 205,
            lockType: 'rollout',
            rolloutConsecutiveTurns: 2,
            rolloutBasePower: 60,
            lockTurnsRemaining: 3,
            lockTotalTurns: 5,
        });
        syncLockStateAfterMove(205, p, false, []);
        expect(p.lockedMove).toBeNull();
    });
});

// ── constant sets ─────────────────────────────────────────────────────────────

describe('constant sets', () => {
    it('RAMPAGE_MOVE_IDS contains Thrash, Petal Dance, Outrage', () => {
        expect(RAMPAGE_MOVE_IDS.has(37)).toBe(true);
        expect(RAMPAGE_MOVE_IDS.has(80)).toBe(true);
        expect(RAMPAGE_MOVE_IDS.has(200)).toBe(true);
    });

    it('ROLLOUT_MOVE_IDS contains Rollout and Ice Ball', () => {
        expect(ROLLOUT_MOVE_IDS.has(205)).toBe(true);
        expect(ROLLOUT_MOVE_IDS.has(301)).toBe(true);
    });

    it('TRAPPING_MOVE_IDS contains all 7 trapping moves', () => {
        [20, 35, 83, 128, 250, 328, 611].forEach(id => {
            expect(TRAPPING_MOVE_IDS.has(id)).toBe(true);
        });
    });
});
