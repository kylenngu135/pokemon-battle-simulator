import { getActivePokemon, checkBattleOver, needsSwitch, applyStatChanges } from '../../utils/battle.utils';
import { BattleState, BattlePokemon } from '../../models/battle.models';

const makePokemon = (overrides: Partial<BattlePokemon> = {}): BattlePokemon => ({
  id: 1,
  name: 'bulbasaur',
  currentHp: 100,
  maxHp: 100,
  stats: { attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50 },
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

const makeState = (overrides: Partial<BattleState> = {}): BattleState => ({
  matchId: 'test-match-id',
  player1: {
    name: 'Ash',
    team: [makePokemon({ id: 1, name: 'bulbasaur' }), makePokemon({ id: 2, name: 'ivysaur' })],
    activePokemonIndex: 0,
    socketId: 'socket-1',
  },
  player2: {
    name: 'Gary',
    team: [makePokemon({ id: 4, name: 'charmander' }), makePokemon({ id: 5, name: 'charmeleon' })],
    activePokemonIndex: 0,
    socketId: 'socket-2',
  },
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
  ...overrides,
});

describe('getActivePokemon', () => {
  it('returns the active pokemon for player1', () => {
    const state = makeState();
    const active = getActivePokemon(state, 'player1');
    expect(active.name).toBe('bulbasaur');
  });

  it('returns the correct pokemon after index changes', () => {
    const state = makeState();
    state.player1.activePokemonIndex = 1;
    const active = getActivePokemon(state, 'player1');
    expect(active.name).toBe('ivysaur');
  });
});

describe('checkBattleOver', () => {
  it('returns false when both teams have conscious pokemon', () => {
    const state = makeState();
    expect(checkBattleOver(state)).toBe(false);
  });

  it('returns true and sets winner when player1 team all fainted', () => {
    const state = makeState();
    state.player1.team.forEach((p) => (p.fainted = true));
    expect(checkBattleOver(state)).toBe(true);
    expect(state.winner).toBe('Gary');
    expect(state.status).toBe('finished');
  });

  it('returns true and sets winner when player2 team all fainted', () => {
    const state = makeState();
    state.player2.team.forEach((p) => (p.fainted = true));
    expect(checkBattleOver(state)).toBe(true);
    expect(state.winner).toBe('Ash');
    expect(state.status).toBe('finished');
  });
});

describe('needsSwitch', () => {
  it('returns false when active pokemon is not fainted', () => {
    const state = makeState();
    expect(needsSwitch(state, 'player1')).toBe(false);
  });

  it('returns true when active pokemon is fainted and team has remaining', () => {
    const state = makeState();
    state.player1.team[0].fainted = true;
    expect(needsSwitch(state, 'player1')).toBe(true);
  });

  it('returns false when active pokemon fainted and entire team fainted', () => {
    const state = makeState();
    state.player1.team.forEach((p) => (p.fainted = true));
    expect(needsSwitch(state, 'player1')).toBe(false);
  });
});

describe('applyStatChanges', () => {
  it('increases a stat stage correctly', () => {
    const pokemon = makePokemon();
    const log: string[] = [];
    applyStatChanges(pokemon, [{ stat: { name: 'attack' }, change: 1 }], log);
    expect(pokemon.statStages.attack).toBe(1);
    expect(log.length).toBeGreaterThan(0);
  });

  it('decreases a stat stage correctly', () => {
    const pokemon = makePokemon();
    const log: string[] = [];
    applyStatChanges(pokemon, [{ stat: { name: 'defense' }, change: -2 }], log);
    expect(pokemon.statStages.defense).toBe(-2);
  });

  it('clamps stat stages at +6', () => {
    const pokemon = makePokemon();
    pokemon.statStages.attack = 5;
    const log: string[] = [];
    applyStatChanges(pokemon, [{ stat: { name: 'attack' }, change: 2 }], log);
    expect(pokemon.statStages.attack).toBe(6);
  });

  it('clamps stat stages at -6', () => {
    const pokemon = makePokemon();
    pokemon.statStages.speed = -5;
    const log: string[] = [];
    applyStatChanges(pokemon, [{ stat: { name: 'speed' }, change: -2 }], log);
    expect(pokemon.statStages.speed).toBe(-6);
  });
});
