import { getTypeEffectiveness } from '../../data/typeChart';

describe('getTypeEffectiveness', () => {
  it('returns 2 for super effective matchup (fire vs grass)', () => {
    expect(getTypeEffectiveness('fire', ['grass'])).toBe(2);
  });

  it('returns 0.5 for not very effective matchup (fire vs water)', () => {
    expect(getTypeEffectiveness('fire', ['water'])).toBe(0.5);
  });

  it('returns 0 for immune matchup (normal vs ghost)', () => {
    expect(getTypeEffectiveness('normal', ['ghost'])).toBe(0);
  });

  it('returns 1 for neutral matchup (fire vs normal)', () => {
    expect(getTypeEffectiveness('fire', ['normal'])).toBe(1);
  });

  it('handles dual type defenders correctly (fire vs grass/water = 1)', () => {
    expect(getTypeEffectiveness('fire', ['grass', 'water'])).toBe(1);
  });

  it('handles dual type super effective (water vs fire/ground = 4)', () => {
    expect(getTypeEffectiveness('water', ['fire', 'ground'])).toBe(4);
  });

  it('handles dual type immunity (normal vs ghost/normal = 0)', () => {
    expect(getTypeEffectiveness('normal', ['ghost', 'normal'])).toBe(0);
  });
});
