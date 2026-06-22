import {
    applyPrimaryStatus,
    applyVolatileStatus,
    applySecondaryEffects,
    processEndOfTurn,
    checkConfusion,
    checkSleep,
    checkRecharging,
} from '../../battle-engine/effectsEngine';
import { MoveResponse } from '../../models/move.models';
import { BattlePokemon, BattleState } from '../../models/battle.models';

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

const makeState = (p1: BattlePokemon, p2: BattlePokemon): BattleState => ({
    matchId: 'test',
    player1: { name: 'Ash', team: [p1], activePokemonIndex: 0 },
    player2: { name: 'Gary', team: [p2], activePokemonIndex: 0 },
    turn: 1,
    currentTurn: 'player1',
    status: 'active',
    winner: null,
    log: [],
    turnLogs: [],
    pendingActions: {},
    awaitingFaintSwitch: { player1: false, player2: false },
    switchesRequired: [],
    switchesSubmitted: [],
    pendingSwitchLog: [],
  pendingSwitchEvents: [],
    weather: 'none',
    weatherTurnsRemaining: 0,
    startedAt: new Date().toISOString(),
    player1LastMoveUsed: null,
    player2LastMoveUsed: null,
    player1WishActive: false,
    player1WishHp: 0,
    player1WishTurnsRemaining: 0,
    player2WishActive: false,
    player2WishHp: 0,
    player2WishTurnsRemaining: 0,
    player1HealingWishPending: false,
    player2HealingWishPending: false,
});

// ── applyPrimaryStatus ────────────────────────────────────────────────────────

describe('applyPrimaryStatus', () => {
    it('applies burn to a non-fire type', () => {
        const p = makePokemon({ types: ['water'] });
        const log: string[] = [];
        const applied = applyPrimaryStatus(p, 'burn', log);
        expect(applied).toBe(true);
        expect(p.status).toBe('burn');
        expect(log.some((l) => l.includes('burned'))).toBe(true);
    });

    it('cannot burn a Fire type pokemon', () => {
        const p = makePokemon({ types: ['fire'] });
        const log: string[] = [];
        const applied = applyPrimaryStatus(p, 'burn', log);
        expect(applied).toBe(false);
        expect(p.status).toBeNull();
    });

    it('cannot poison a Poison type pokemon', () => {
        const p = makePokemon({ types: ['poison'] });
        const log: string[] = [];
        expect(applyPrimaryStatus(p, 'poison', log)).toBe(false);
        expect(p.status).toBeNull();
    });

    it('cannot poison a Steel type pokemon', () => {
        const p = makePokemon({ types: ['steel'] });
        const log: string[] = [];
        expect(applyPrimaryStatus(p, 'toxic', log)).toBe(false);
        expect(p.status).toBeNull();
    });

    it('cannot paralyze an Electric type pokemon', () => {
        const p = makePokemon({ types: ['electric'] });
        const log: string[] = [];
        expect(applyPrimaryStatus(p, 'paralysis', log)).toBe(false);
        expect(p.status).toBeNull();
    });

    it('cannot freeze an Ice type pokemon', () => {
        const p = makePokemon({ types: ['ice'] });
        const log: string[] = [];
        expect(applyPrimaryStatus(p, 'freeze', log)).toBe(false);
        expect(p.status).toBeNull();
    });

    it('cannot apply a second primary status to an already-statused pokemon', () => {
        const p = makePokemon({ types: ['water'], status: 'burn' });
        const log: string[] = [];
        const applied = applyPrimaryStatus(p, 'paralysis', log);
        expect(applied).toBe(false);
        expect(p.status).toBe('burn');
        expect(log.some((l) => l.includes('But it failed'))).toBe(true);
    });

    it('sets sleepTurnsRemaining when applying sleep', () => {
        const p = makePokemon({ types: ['water'] });
        applyPrimaryStatus(p, 'sleep', []);
        expect(p.status).toBe('sleep');
        expect(p.sleepTurnsRemaining).toBeGreaterThanOrEqual(1);
        expect(p.sleepTurnsRemaining).toBeLessThanOrEqual(3);
    });

    it('sets toxicCounter to 1 when applying toxic', () => {
        const p = makePokemon({ types: ['water'] });
        applyPrimaryStatus(p, 'toxic', []);
        expect(p.status).toBe('toxic');
        expect(p.toxicCounter).toBe(1);
    });
});

// ── processEndOfTurn ─────────────────────────────────────────────────────────

describe('processEndOfTurn — toxic counter', () => {
    it('increments toxic counter each turn', () => {
        const p1 = makePokemon({ status: 'toxic', toxicCounter: 1 });
        const p2 = makePokemon();
        const state = makeState(p1, p2);
        const log: string[] = [];

        processEndOfTurn(state, log);
        expect(p1.toxicCounter).toBe(2);
        const dmg1 = Math.floor((100 * 1) / 16); // 1/16 max HP on counter=1
        expect(p1.currentHp).toBe(100 - Math.max(1, dmg1));

        processEndOfTurn(state, log);
        expect(p1.toxicCounter).toBe(3);
    });
});

describe('processEndOfTurn — sleep turns', () => {
    it('decrements sleepTurnsRemaining each turn', () => {
        const p1 = makePokemon({ status: 'sleep', sleepTurnsRemaining: 2 });
        const p2 = makePokemon();
        const state = makeState(p1, p2);
        const log: string[] = [];

        processEndOfTurn(state, log);
        expect(p1.sleepTurnsRemaining).toBe(1);
        expect(p1.status).toBe('sleep');

        processEndOfTurn(state, log);
        expect(p1.sleepTurnsRemaining).toBe(0);
        expect(p1.status).toBeNull();
        expect(log.some((l) => l.includes('woke up'))).toBe(true);
    });
});

describe('processEndOfTurn — order', () => {
    it('applies weather damage before poison damage', () => {
        // Rock type: immune to sandstorm damage, not immune to poison
        const p1 = makePokemon({ status: 'poison', types: ['rock'] });
        const p2 = makePokemon({ types: ['normal'] }); // takes sandstorm, no status
        const state = makeState(p1, p2);
        state.weather = 'sandstorm';
        state.weatherTurnsRemaining = 5;

        const log: string[] = [];
        processEndOfTurn(state, log);

        // p1 took only poison damage (immune to sandstorm as Rock type)
        const poisonDmg = Math.max(1, Math.floor(100 / 8));
        expect(p1.currentHp).toBe(100 - poisonDmg);

        // p2 took only sandstorm damage
        const sandDmg = Math.max(1, Math.floor(100 / 16));
        expect(p2.currentHp).toBe(100 - sandDmg);
    });
});

describe('processEndOfTurn — weather damage type immunity', () => {
    it('sandstorm does not damage Rock, Ground, or Steel types', () => {
        const p1 = makePokemon({ types: ['rock'] });
        const p2 = makePokemon({ types: ['normal'] });
        const state = makeState(p1, p2);
        state.weather = 'sandstorm';
        state.weatherTurnsRemaining = 3;

        processEndOfTurn(state, []);
        expect(p1.currentHp).toBe(100); // immune
        expect(p2.currentHp).toBeLessThan(100); // damaged
    });

    it('hail does not damage Ice types', () => {
        const p1 = makePokemon({ types: ['ice'] });
        const p2 = makePokemon({ types: ['fire'] });
        const state = makeState(p1, p2);
        state.weather = 'hail';
        state.weatherTurnsRemaining = 3;

        processEndOfTurn(state, []);
        expect(p1.currentHp).toBe(100); // immune
        expect(p2.currentHp).toBeLessThan(100); // damaged
    });
});

// ── checkConfusion ─────────────────────────────────────────────────────────

describe('checkConfusion', () => {
    it('returns false for a pokemon that is not confused', () => {
        const p = makePokemon({ confused: false });
        expect(checkConfusion(p, [])).toBe(false);
    });

    it('self-damage uses pokemon own attack/defense stats', () => {
        // Force confusion to trigger every time by mocking Math.random
        const p = makePokemon({ confused: true, confusionTurnsRemaining: 3 });
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.33 → always hurt itself
        const log: string[] = [];
        const hurt = checkConfusion(p, log);
        spy.mockRestore();

        expect(hurt).toBe(true);
        expect(p.currentHp).toBeLessThan(100);
        expect(log.some((l) => l.includes('hurt itself'))).toBe(true);
    });
});

// ── checkSleep ────────────────────────────────────────────────────────────

describe('checkSleep', () => {
    it('returns true and logs when pokemon is asleep with turns remaining', () => {
        const p = makePokemon({ status: 'sleep', sleepTurnsRemaining: 2 });
        const log: string[] = [];
        expect(checkSleep(p, log)).toBe(true);
        expect(log.some((l) => l.includes('asleep'))).toBe(true);
    });

    it('returns false when sleepTurnsRemaining is 0', () => {
        const p = makePokemon({ status: 'sleep', sleepTurnsRemaining: 0 });
        expect(checkSleep(p, [])).toBe(false);
    });
});

// ── applyVolatileStatus ───────────────────────────────────────────────────

describe('applyVolatileStatus — confusion duration', () => {
    it('sets confusionTurnsRemaining between 2 and 5', () => {
        const p = makePokemon();
        applyVolatileStatus(p, 'confusion', []);
        expect(p.confused).toBe(true);
        expect(p.confusionTurnsRemaining).toBeGreaterThanOrEqual(2);
        expect(p.confusionTurnsRemaining).toBeLessThanOrEqual(5);
    });

    it('Grass types cannot be seeded', () => {
        const p = makePokemon({ types: ['grass'] });
        const log: string[] = [];
        const applied = applyVolatileStatus(p, 'seed', log);
        expect(applied).toBe(false);
        expect(p.seeded).toBe(false);
    });
});

// ── checkRecharging ───────────────────────────────────────────────────────────

describe('checkRecharging', () => {
    it('returns true and clears flag when pokemon is recharging', () => {
        const p = makePokemon({ recharging: true });
        const log: string[] = [];
        expect(checkRecharging(p, log)).toBe(true);
        expect(p.recharging).toBe(false);
        expect(log.some((l) => l.includes('recharge'))).toBe(true);
    });

    it('returns false when pokemon is not recharging', () => {
        const p = makePokemon({ recharging: false });
        expect(checkRecharging(p, [])).toBe(false);
    });
});

// ── applySecondaryEffects — status move 100% ailment ─────────────────────────

describe('applySecondaryEffects — status move ailment', () => {
    it('applies paralysis at 100% for a status move even when ailment_chance is 0', () => {
        const attacker = makePokemon({ types: ['electric'] });
        const defender = makePokemon({ types: ['normal'] });
        const state = makeState(attacker, defender);

        // Minimal mock of Thunder Wave (status move, ailment: paralysis, chance: 0 in some data)
        const mockMove = {
            id: 86,
            damage_class: { name: 'status' },
            meta: { ailment: { name: 'paralysis' }, ailment_chance: 0, flinch_chance: 0 },
            stat_changes: [],
        } as unknown as MoveResponse;

        const log: string[] = [];
        applySecondaryEffects(mockMove, attacker, 'player1', defender, state, log);
        expect(defender.status).toBe('paralysis');
    });

    it('does not apply status to an immune type from a status move', () => {
        const attacker = makePokemon({ types: ['electric'] });
        const defender = makePokemon({ types: ['electric'] }); // immune to paralysis
        const state = makeState(attacker, defender);

        const mockMove = {
            id: 86,
            damage_class: { name: 'status' },
            meta: { ailment: { name: 'paralysis' }, ailment_chance: 0, flinch_chance: 0 },
            stat_changes: [],
        } as unknown as MoveResponse;

        const log: string[] = [];
        applySecondaryEffects(mockMove, attacker, 'player1', defender, state, log);
        expect(defender.status).toBeNull();
        expect(log.some((l) => l.includes("can't be paralyzed"))).toBe(true);
    });
});
