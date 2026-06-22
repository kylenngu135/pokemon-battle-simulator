import { executeMoveEffect } from '../../battle-engine/movePipeline';
import { moveCache } from '../../cache/moveCache';
import { BattlePokemon, BattleState } from '../../models/battle.models';
import { MoveResponse } from '../../models/move.models';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makePokemon = (overrides: Partial<BattlePokemon> = {}): BattlePokemon => ({
    id: 1,
    name: 'chansey',
    currentHp: 50,
    maxHp: 100,
    stats: { attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50 },
    statStages: { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 },
    types: ['normal'],
    currentTypes: ['normal'],
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

const makeState = (p1Override: Partial<BattlePokemon> = {}, p2Override: Partial<BattlePokemon> = {}): BattleState => ({
    matchId: 'test',
    player1: { name: 'Ash', team: [makePokemon(p1Override)], activePokemonIndex: 0 },
    player2: { name: 'Gary', team: [makePokemon(p2Override)], activePokemonIndex: 0 },
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

const makeStatusMove = (id: number, name: string): MoveResponse => ({
    id,
    name,
    accuracy: null,
    effect_chance: null,
    pp: 10,
    priority: 0,
    power: null,
    damage_class: { name: 'status', url: '' },
    type: { name: 'normal', url: '' },
    effect_entries: [],
    meta: {
        ailment: { name: 'none', url: '' },
        category: { name: 'heal', url: '' },
        min_hits: null,
        max_hits: null,
        min_turns: null,
        max_turns: null,
        drain: 0,
        healing: 50,
        crit_rate: 0,
        ailment_chance: 0,
        flinch_chance: 0,
        stat_chance: 0,
    },
    stat_changes: [],
    target: { name: 'user', url: '' },
    flags: {},
});

beforeAll(() => {
    // Seed healing moves into cache
    [105, 135, 208, 303].forEach(id => moveCache.set(id, makeStatusMove(id, 'recover')));
    moveCache.set(355, makeStatusMove(355, 'roost'));
    moveCache.set(107, makeStatusMove(107, 'wish'));
    moveCache.set(275, makeStatusMove(275, 'ingrain'));
    moveCache.set(392, makeStatusMove(392, 'aqua-ring'));
    moveCache.set(220, makeStatusMove(220, 'pain-split'));
    moveCache.set(505, makeStatusMove(505, 'heal-pulse'));
    moveCache.set(361, makeStatusMove(361, 'healing-wish'));
    moveCache.set(234, makeStatusMove(234, 'moonlight'));
    moveCache.set(235, makeStatusMove(235, 'morning-sun'));
    moveCache.set(236, makeStatusMove(236, 'synthesis'));
});

// ── Recover (105) ─────────────────────────────────────────────────────────────

describe('Recover', () => {
    it('heals exactly 50% of max HP', () => {
        const state = makeState({ currentHp: 20, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(105)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(attacker.currentHp).toBe(70); // 20 + floor(100/2)
    });

    it('fails when already at full HP', () => {
        const state = makeState({ currentHp: 100, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(105)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(false);
        expect(attacker.currentHp).toBe(100);
    });

    it('does not overheal past max HP', () => {
        const state = makeState({ currentHp: 80, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(105)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(attacker.currentHp).toBe(100); // capped
    });
});

// ── Roost (355) ───────────────────────────────────────────────────────────────

describe('Roost', () => {
    it('heals 50% and removes Flying type temporarily for a Flying pokemon', () => {
        const state = makeState({ currentHp: 20, maxHp: 100, types: ['fire', 'flying'], currentTypes: ['fire', 'flying'] });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(355)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(attacker.currentHp).toBe(70);
        expect(attacker.currentTypes).not.toContain('flying');
        expect(attacker.roostUsedThisTurn).toBe(true);
    });

    it('does not touch types for non-Flying pokemon', () => {
        const state = makeState({ currentHp: 20, maxHp: 100, types: ['fire'], currentTypes: ['fire'] });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(355)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(attacker.currentTypes).toEqual(['fire']);
        expect(attacker.roostUsedThisTurn).toBe(false);
    });

    it('sets currentTypes to Normal when roosting a pure Flying type', () => {
        const state = makeState({ currentHp: 20, maxHp: 100, types: ['flying'], currentTypes: ['flying'] });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(355)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(attacker.currentTypes).toEqual(['normal']);
    });
});

// ── Wish (107) ────────────────────────────────────────────────────────────────

describe('Wish', () => {
    it('sets wish state on the battle state', () => {
        const state = makeState({ currentHp: 50, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(107)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(true);
        expect(state.player1WishActive).toBe(true);
        expect(state.player1WishHp).toBe(50); // floor(100/2)
        expect(state.player1WishTurnsRemaining).toBe(2);
    });

    it('fails if wish is already active', () => {
        const state = makeState({ currentHp: 50, maxHp: 100 });
        state.player1WishActive = true;
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(107)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(false);
    });
});

// ── Ingrain (275) ─────────────────────────────────────────────────────────────

describe('Ingrain', () => {
    it('sets ingrainActive on the attacker', () => {
        const state = makeState();
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(275)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(true);
        expect(attacker.ingrainActive).toBe(true);
    });

    it('fails if ingrain is already active', () => {
        const state = makeState({ ingrainActive: true });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(275)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(false);
    });
});

// ── Aqua Ring (392) ───────────────────────────────────────────────────────────

describe('Aqua Ring', () => {
    it('sets aquaRingActive on the attacker', () => {
        const state = makeState();
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(392)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(true);
        expect(attacker.aquaRingActive).toBe(true);
    });

    it('fails if aqua ring is already active', () => {
        const state = makeState({ aquaRingActive: true });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(392)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(false);
    });
});

// ── Pain Split (220) ─────────────────────────────────────────────────────────

describe('Pain Split', () => {
    it('averages HP between both pokemon', () => {
        const state = makeState({ currentHp: 20, maxHp: 100 }, { currentHp: 80, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(220)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        const avg = Math.floor((20 + 80) / 2); // 50
        expect(attacker.currentHp).toBe(avg);
        expect(defender.currentHp).toBe(avg);
    });

    it('does not overheal past maxHp', () => {
        const state = makeState({ currentHp: 10, maxHp: 50 }, { currentHp: 200, maxHp: 200 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(220)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        const avg = Math.floor((10 + 200) / 2); // 105
        expect(attacker.currentHp).toBe(50); // capped at maxHp
        expect(defender.currentHp).toBe(avg); // 105, within maxHp
    });
});

// ── Heal Pulse (505) ─────────────────────────────────────────────────────────

describe('Heal Pulse', () => {
    it('restores 50% of defender max HP', () => {
        const state = makeState({}, { currentHp: 10, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(505)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(defender.currentHp).toBe(60); // 10 + floor(100/2)
    });
});

// ── Healing Wish (361) ────────────────────────────────────────────────────────

describe('Healing Wish', () => {
    it('causes the user to faint and sets healingWishPending', () => {
        const state = makeState({ currentHp: 100, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(361)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(true);
        expect(attacker.fainted).toBe(true);
        expect(attacker.currentHp).toBe(0);
        expect(state.player1HealingWishPending).toBe(true);
    });
});

// ── Weather healing (Moonlight/Morning Sun/Synthesis) ─────────────────────────

describe('Weather Heal (Moonlight/Morning Sun/Synthesis)', () => {
    it('heals 50% in no weather', () => {
        const state = makeState({ currentHp: 20, maxHp: 100 });
        state.weather = 'none';
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(234)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(attacker.currentHp).toBe(70); // 20 + floor(100 * 0.5)
    });

    it('heals ~2/3 in harsh sunlight', () => {
        const state = makeState({ currentHp: 10, maxHp: 99 });
        state.weather = 'sun';
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(235)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        const heal = Math.floor(99 * (2 / 3));
        expect(attacker.currentHp).toBe(Math.min(99, 10 + Math.max(1, heal)));
    });

    it('heals only 25% in rain', () => {
        const state = makeState({ currentHp: 10, maxHp: 100 });
        state.weather = 'rain';
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(236)!;
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(attacker.currentHp).toBe(35); // 10 + floor(100 * 0.25)
    });

    it('fails when at full HP', () => {
        const state = makeState({ currentHp: 100, maxHp: 100 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const move = moveCache.get(234)!;
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(false);
    });
});
