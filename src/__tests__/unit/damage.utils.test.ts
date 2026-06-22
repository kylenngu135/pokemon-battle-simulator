import { calculateDamage, checkAccuracy } from '../../utils/damage.utils';
import { moveCache } from '../../cache/moveCache';
import { BattlePokemon } from '../../models/battle.models';

const makePokemon = (overrides: Partial<BattlePokemon> = {}): BattlePokemon => ({
  id: 6,
  name: 'charizard',
  currentHp: 78,
  maxHp: 78,
  stats: { attack: 84, defense: 78, specialAttack: 109, specialDefense: 85, speed: 100 },
  statStages: { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 },
  types: ['fire', 'flying'],
  currentTypes: ['fire', 'flying'],
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

describe('calculateDamage', () => {
  beforeAll(() => {
    moveCache.set(53, {
      id: 53,
      name: 'flamethrower',
      accuracy: 100,
      effect_chance: 10,
      pp: 15,
      priority: 0,
      power: 90,
      damage_class: { name: 'special', url: '' },
      type: { name: 'fire', url: '' },
      effect_entries: [],
      meta: {
        ailment: { name: 'burn', url: '' },
        category: { name: 'damage+ailment', url: '' },
        min_hits: null,
        max_hits: null,
        min_turns: null,
        max_turns: null,
        drain: 0,
        healing: 0,
        crit_rate: 0,
        ailment_chance: 10,
        flinch_chance: 0,
        stat_chance: 0,
      },
      stat_changes: [],
      target: { name: 'selected-pokemon', url: '' },
      flags: {},
    });

    moveCache.set(86, {
      id: 86,
      name: 'thunder-wave',
      accuracy: 90,
      effect_chance: null,
      pp: 20,
      priority: 0,
      power: null,
      damage_class: { name: 'status', url: '' },
      type: { name: 'electric', url: '' },
      effect_entries: [],
      meta: {
        ailment: { name: 'paralysis', url: '' },
        category: { name: 'ailment', url: '' },
        min_hits: null,
        max_hits: null,
        min_turns: null,
        max_turns: null,
        drain: 0,
        healing: 0,
        crit_rate: 0,
        ailment_chance: 100,
        flinch_chance: 0,
        stat_chance: 0,
      },
      stat_changes: [],
      target: { name: 'selected-pokemon', url: '' },
      flags: {},
    });
  });

  it('returns 0 damage for a status move with no power', () => {
    const attacker = makePokemon();
    const defender = makePokemon({ types: ['water'] });
    const result = calculateDamage(attacker, defender, 86);
    expect(result.damage).toBe(0);
  });

  it('calculates positive damage for a damaging move', () => {
    const attacker = makePokemon();
    const defender = makePokemon({ types: ['grass'] });
    const result = calculateDamage(attacker, defender, 53);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('applies STAB correctly', () => {
    const attacker = makePokemon({ types: ['fire'] });
    const defender = makePokemon({ types: ['normal'] });
    const result = calculateDamage(attacker, defender, 53);
    expect(result.isStab).toBe(true);
  });

  it('does not apply STAB when types do not match', () => {
    const attacker = makePokemon({ types: ['water'] });
    const defender = makePokemon({ types: ['normal'] });
    const result = calculateDamage(attacker, defender, 53);
    expect(result.isStab).toBe(false);
  });

  it('returns correct effectiveness for super effective hit', () => {
    const attacker = makePokemon({ types: ['fire'] });
    const defender = makePokemon({ types: ['grass'] });
    const result = calculateDamage(attacker, defender, 53);
    expect(result.effectiveness).toBe(2);
  });

  it('returns correct effectiveness for not very effective hit', () => {
    const attacker = makePokemon({ types: ['fire'] });
    const defender = makePokemon({ types: ['water'] });
    const result = calculateDamage(attacker, defender, 53);
    expect(result.effectiveness).toBe(0.5);
  });
});

describe('checkAccuracy', () => {
  it('returns true for moves with null accuracy (always hit)', () => {
    moveCache.set(32, {
      id: 32,
      name: 'horn-drill',
      accuracy: null,
      effect_chance: null,
      pp: 5,
      priority: 0,
      power: null,
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
    });

    const attacker = makePokemon();
    const defender = makePokemon();
    expect(checkAccuracy(32, attacker, defender)).toBe(true);
  });
});
