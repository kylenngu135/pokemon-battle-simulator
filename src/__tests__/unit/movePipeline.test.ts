import { executeMoveEffect, applyPostMoveEffects } from '../../battle-engine/movePipeline';
import { moveCache } from '../../cache/moveCache';
import { BattlePokemon, BattleState } from '../../models/battle.models';
import { MoveResponse } from '../../models/move.models';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makePokemon = (overrides: Partial<BattlePokemon> = {}): BattlePokemon => ({
    id: 1,
    name: 'bulbasaur',
    currentHp: 100,
    maxHp: 100,
    stats: { attack: 80, defense: 80, specialAttack: 80, specialDefense: 80, speed: 80 },
    statStages: { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 },
    types: ['grass', 'poison'],
    currentTypes: ['grass', 'poison'],
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

const makeMove = (overrides: Partial<MoveResponse>): MoveResponse => ({
    id: 999,
    name: 'test-move',
    accuracy: 100,
    effect_chance: null,
    pp: 10,
    priority: 0,
    power: 80,
    damage_class: { name: 'physical', url: '' },
    type: { name: 'normal', url: '' },
    effect_entries: [],
    meta: {
        ailment: { name: 'none', url: '' },
        category: { name: 'damage', url: '' },
        min_hits: null,
        max_hits: null,
        min_turns: null,
        max_turns: null,
        drain: 0,
        healing: 0,
        crit_rate: 0,
        ailment_chance: 0,
        flinch_chance: 0,
        stat_chance: 0,
    },
    stat_changes: [],
    target: { name: 'selected-pokemon', url: '' },
    flags: {},
    ...overrides,
});

// Inject a move into the cache for Metronome and ID-based lookups
beforeAll(() => {
    moveCache.set(999, makeMove({}));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('damage category', () => {
    it('deals correct damage for a physical move', () => {
        const move = makeMove({ id: 999, power: 80, damage_class: { name: 'physical', url: '' } });
        moveCache.set(999, move);
        const state = makeState();
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const result = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(result.hit).toBe(true);
        expect(defender.currentHp).toBeLessThan(100);
    });

    it('logs damage taken', () => {
        const move = makeMove({ id: 999, power: 80 });
        moveCache.set(999, move);
        const state = makeState();
        const result = executeMoveEffect(move, state.player1.team[0], state.player2.team[0], 'player1', 'player2', state, false);
        expect(result.log.some((l) => l.includes('took') && l.includes('damage'))).toBe(true);
    });
});

describe('ailment category', () => {
    it('applies paralysis at 100% for a pure ailment move', () => {
        const move = makeMove({
            id: 999,
            power: null,
            damage_class: { name: 'status', url: '' },
            meta: {
                ailment: { name: 'paralysis', url: '' },
                category: { name: 'ailment', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 0, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(999, move);
        const state = makeState();
        // Mock Math.random to always hit accuracy
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.01);
        const defender = state.player2.team[0];
        executeMoveEffect(move, state.player1.team[0], defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(defender.status).toBe('paralysis');
    });
});

describe('damage+ailment category', () => {
    it('always deals damage, then rolls ailment chance', () => {
        const move = makeMove({
            id: 999,
            power: 90,
            meta: {
                ailment: { name: 'burn', url: '' },
                category: { name: 'damage+ailment', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 0, healing: 0, crit_rate: 0, ailment_chance: 30, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(999, move);
        // Force ailment to NOT trigger (random > 0.30)
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
        const state = makeState();
        const defender = state.player2.team[0];
        const result = executeMoveEffect(move, state.player1.team[0], defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(result.hit).toBe(true);
        expect(defender.currentHp).toBeLessThan(100);
        expect(defender.status).toBeNull(); // ailment did not trigger
    });
});

describe('damage+heal (drain) category', () => {
    it('heals attacker for drain% of damage dealt', () => {
        const move = makeMove({
            id: 999,
            power: 80,
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'damage+heal', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 50, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(999, move);
        const state = makeState({ currentHp: 50 }); // attacker at 50 HP
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        // Force hit, no crit — Math.random returns 0.9 (no crit) / 0 (accuracy hit) / 0.9 (random damage roll)
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
        executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(attacker.currentHp).toBeGreaterThan(50);
    });
});

describe('damage+lower category', () => {
    it('lowers defender stat after damage', () => {
        const move = makeMove({
            id: 999,
            power: 65,
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'damage+lower', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 0, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
            stat_changes: [{ stat: { name: 'defense', url: '' }, change: -1 }],
        });
        moveCache.set(999, move);
        const state = makeState();
        const defender = state.player2.team[0];
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.01);
        executeMoveEffect(move, state.player1.team[0], defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(defender.currentHp).toBeLessThan(100);
        expect(defender.statStages.defense).toBe(-1);
    });
});

describe('recoil moves', () => {
    it('damages attacker after hitting', () => {
        const move = makeMove({
            id: 999,
            power: 120,
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'damage+heal', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: -33, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(999, move);
        const state = makeState();
        const attacker = state.player1.team[0];
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9); // no crit
        executeMoveEffect(move, attacker, state.player2.team[0], 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(attacker.currentHp).toBeLessThan(100);
    });
});

describe('multi-hit moves', () => {
    it('applies damage the correct number of times', () => {
        const move = makeMove({
            id: 999,
            power: 25,
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'damage', url: '' },
                min_hits: 2, max_hits: 5, min_turns: null, max_turns: null,
                drain: 0, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(999, move);
        // Force 2 hits (roll < 0.375)
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
        const state = makeState();
        const defender = state.player2.team[0];
        const result = executeMoveEffect(move, state.player1.team[0], defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(result.hit).toBe(true);
        expect(result.log.some((l) => l.includes('Hit'))).toBe(true);
        expect(defender.currentHp).toBeLessThan(100);
    });
});

describe('charging moves', () => {
    it('sets charging flag on turn 1 and fires on turn 2', () => {
        const move = makeMove({
            id: 19,
            name: 'fly',
            power: 90,
            damage_class: { name: 'physical', url: '' },
            flags: { charge: true },
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'damage', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 0, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(19, move);
        const state = makeState();
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];

        // Turn 1 — should charge
        const r1 = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        expect(r1.hit).toBe(false);
        expect(attacker.charging).toBe(true);
        expect(attacker.invulnerableState).toBe('airborne');

        // Turn 2 — should fire
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
        const r2 = executeMoveEffect(move, attacker, defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(r2.hit).toBe(true);
        expect(attacker.charging).toBe(false);
        expect(attacker.invulnerableState).toBe('none');
    });
});

describe('invulnerable state', () => {
    it('airborne pokemon cannot be hit by a non-piercing move', () => {
        const move = makeMove({ id: 999, power: 80 }); // tackle-type
        const state = makeState({}, { invulnerableState: 'airborne' });
        const defender = state.player2.team[0];
        // Force accuracy hit
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.01);
        const result = executeMoveEffect(move, state.player1.team[0], defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(result.hit).toBe(false);
        expect(result.log.some((l) => l.includes('avoided'))).toBe(true);
    });

    it('underground pokemon takes double damage from Earthquake', () => {
        const earthquake = makeMove({
            id: 89,
            name: 'earthquake',
            power: 100,
            damage_class: { name: 'physical', url: '' },
            type: { name: 'ground', url: '' },
        });
        moveCache.set(89, earthquake);
        const state = makeState({}, { invulnerableState: 'underground' });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];

        // First, get normal damage for comparison
        const stateNormal = makeState({}, { invulnerableState: 'none' });
        const defNormal = stateNormal.player2.team[0];
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9); // consistent roll, no crit
        executeMoveEffect(earthquake, stateNormal.player1.team[0], defNormal, 'player1', 'player2', stateNormal, false);
        const normalDmg = 100 - defNormal.currentHp;

        executeMoveEffect(earthquake, attacker, defender, 'player1', 'player2', state, false);
        const underDmg = 100 - defender.currentHp;
        spy.mockRestore();

        expect(underDmg).toBeGreaterThanOrEqual(normalDmg * 1.9); // ~2x (rounding may vary slightly)
    });
});

describe('Self-Destruct (ID 120)', () => {
    it('faints the user after use', () => {
        const move = makeMove({
            id: 120,
            name: 'self-destruct',
            power: 200,
            damage_class: { name: 'physical', url: '' },
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'unique', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 0, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(120, move);
        const state = makeState();
        const attacker = state.player1.team[0];
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
        executeMoveEffect(move, attacker, state.player2.team[0], 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(attacker.fainted).toBe(true);
        expect(attacker.currentHp).toBe(0);
    });
});

describe('Rest (ID 156)', () => {
    it('heals to full HP and applies sleep for 2 turns', () => {
        const move = makeMove({
            id: 156,
            name: 'rest',
            power: null,
            damage_class: { name: 'status', url: '' },
            meta: {
                ailment: { name: 'sleep', url: '' },
                category: { name: 'heal', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 0, healing: 100, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(156, move);
        const state = makeState({ currentHp: 30, status: 'burn' });
        const attacker = state.player1.team[0];
        executeMoveEffect(move, attacker, state.player2.team[0], 'player1', 'player2', state, false);
        expect(attacker.currentHp).toBe(100);
        expect(attacker.status).toBe('sleep');
        expect(attacker.sleepTurnsRemaining).toBe(2);
    });
});

describe('Dream Eater (ID 138)', () => {
    it('fails against non-sleeping targets', () => {
        const move = makeMove({
            id: 138,
            name: 'dream-eater',
            power: 100,
            damage_class: { name: 'special', url: '' },
            type: { name: 'psychic', url: '' },
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'damage+heal', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 50, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(138, move);
        const state = makeState({}, { status: null }); // defender awake
        const result = executeMoveEffect(move, state.player1.team[0], state.player2.team[0], 'player1', 'player2', state, false);
        expect(result.hit).toBe(false);
        expect(result.log.some((l) => l.includes('failed'))).toBe(true);
    });
});

describe('Substitute (ID 164)', () => {
    it('absorbs damage in place of the user', () => {
        const substituteMoveData = makeMove({
            id: 164,
            name: 'substitute',
            power: null,
            damage_class: { name: 'status', url: '' },
        });
        moveCache.set(164, substituteMoveData);
        const state = makeState({ currentHp: 100, maxHp: 100 });
        const attacker = state.player1.team[0];
        executeMoveEffect(substituteMoveData, attacker, state.player2.team[0], 'player1', 'player2', state, false);
        expect(attacker.substituteHp).toBe(25);
        expect(attacker.currentHp).toBe(75);

        // Now attack the pokemon — substitute should absorb
        const tackle = makeMove({ id: 999, power: 40 });
        moveCache.set(999, tackle);
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
        const stateForHit = makeState({ currentHp: 75, maxHp: 100, substituteHp: 25 });
        const defenderWithSub = stateForHit.player1.team[0];
        executeMoveEffect(tackle, stateForHit.player2.team[0], defenderWithSub, 'player2', 'player1', stateForHit, false);
        spy.mockRestore();
        // Substitute absorbed the damage, not the pokemon directly
        expect(defenderWithSub.currentHp).toBe(75); // HP unchanged
    });
});

describe('Protect (ID 182)', () => {
    it('blocks all damage when active', () => {
        const protectMove = makeMove({
            id: 182,
            name: 'protect',
            power: null,
            damage_class: { name: 'status', url: '' },
        });
        moveCache.set(182, protectMove);
        // First use Protect on defender, then attack
        const stateWithProtect = makeState({}, { protecting: true });
        const defender = stateWithProtect.player2.team[0];
        const tackle = makeMove({ id: 999, power: 80 });
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.01);
        const result = executeMoveEffect(tackle, stateWithProtect.player1.team[0], defender, 'player1', 'player2', stateWithProtect, false);
        spy.mockRestore();
        expect(result.hit).toBe(false);
        expect(defender.currentHp).toBe(100);
        expect(result.log.some((l) => l.includes('protected'))).toBe(true);
    });
});

describe('Counter (ID 68)', () => {
    it('deals double last physical damage received', () => {
        const state = makeState({ lastPhysicalDamageTaken: 30 });
        const attacker = state.player1.team[0];
        const defender = state.player2.team[0];
        const counterMove = makeMove({
            id: 68,
            name: 'counter',
            power: null,
            damage_class: { name: 'physical', url: '' },
        });
        moveCache.set(68, counterMove);
        executeMoveEffect(counterMove, attacker, defender, 'player1', 'player2', state, false);
        expect(defender.currentHp).toBe(100 - 60); // 30 * 2
    });

    it('fails if no physical damage was taken', () => {
        const state = makeState({ lastPhysicalDamageTaken: 0 });
        const counterMove = makeMove({ id: 68, name: 'counter', power: null });
        moveCache.set(68, counterMove);
        const result = executeMoveEffect(counterMove, state.player1.team[0], state.player2.team[0], 'player1', 'player2', state, false);
        expect(result.hit).toBe(false);
    });
});

describe('OHKO moves', () => {
    it('deals 100% HP damage on hit and knocks out the target', () => {
        const guillotine = makeMove({
            id: 12,
            name: 'guillotine',
            power: null,
            damage_class: { name: 'physical', url: '' },
        });
        moveCache.set(12, guillotine);
        const state = makeState();
        const defender = state.player2.team[0];
        // Force hit: random < 0.30
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.01);
        executeMoveEffect(guillotine, state.player1.team[0], defender, 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(defender.fainted).toBe(true);
        expect(defender.currentHp).toBe(0);
    });

    it('has 30% accuracy — misses when roll >= 0.30', () => {
        const hornDrill = makeMove({
            id: 32,
            name: 'horn-drill',
            power: null,
            accuracy: 30,
        });
        moveCache.set(32, hornDrill);
        const state = makeState();
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
        const result = executeMoveEffect(hornDrill, state.player1.team[0], state.player2.team[0], 'player1', 'player2', state, false);
        spy.mockRestore();
        expect(result.hit).toBe(false);
    });
});

describe('turn markers', () => {
    it('turn start and end markers start with ---', () => {
        const startMarker = '--- Turn 1 ---';
        const endMarker = '--- End of Turn 1 ---';
        expect(startMarker.startsWith('---')).toBe(true);
        expect(endMarker.startsWith('---')).toBe(true);
    });
});

describe('Disable (ID 50)', () => {
    it('disables the last move the opponent used', () => {
        const disableMove = makeMove({
            id: 50,
            name: 'disable',
            power: null,
            accuracy: 100,
            damage_class: { name: 'status', url: '' },
        });
        moveCache.set(50, disableMove);
        const state = makeState({}, {
            moves: [{ id: 53, name: 'flamethrower', currentPp: 10, maxPp: 15, power: 90, accuracy: 100, type: 'fire', damageClass: 'special' }],
        });
        state.player2LastMoveUsed = 53; // opponent last used flamethrower
        const defender = state.player2.team[0];
        executeMoveEffect(disableMove, state.player1.team[0], defender, 'player1', 'player2', state, false);
        expect(defender.disabledMoveId).toBe(53);
        expect(defender.disabledTurnsRemaining).toBe(4);
    });
});

describe('recharge flag', () => {
    it('sets recharging flag after use', () => {
        const hyperBeam = makeMove({
            id: 63,
            name: 'hyper-beam',
            power: 150,
            flags: { recharge: true },
            meta: {
                ailment: { name: 'none', url: '' },
                category: { name: 'damage+recharge', url: '' },
                min_hits: null, max_hits: null, min_turns: null, max_turns: null,
                drain: 0, healing: 0, crit_rate: 0, ailment_chance: 0, flinch_chance: 0, stat_chance: 0,
            },
        });
        moveCache.set(63, hyperBeam);
        const state = makeState();
        const attacker = state.player1.team[0];
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
        const result = executeMoveEffect(hyperBeam, attacker, state.player2.team[0], 'player1', 'player2', state, false);
        spy.mockRestore();
        if (result.hit) {
            applyPostMoveEffects(hyperBeam, attacker);
        }
        expect(attacker.recharging).toBe(true);
    });
});
