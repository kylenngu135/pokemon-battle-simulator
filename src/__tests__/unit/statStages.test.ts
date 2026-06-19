import { getStatMultiplier } from '../../data/statStages';

describe('getStatMultiplier', () => {
  it('returns 1 at stage 0', () => {
    expect(getStatMultiplier(0)).toBe(1);
  });

  it('returns correct multiplier at +1', () => {
    expect(getStatMultiplier(1)).toBe(3 / 2);
  });

  it('returns correct multiplier at -1', () => {
    expect(getStatMultiplier(-1)).toBeCloseTo(2 / 3);
  });

  it('clamps at +6', () => {
    expect(getStatMultiplier(6)).toBe(getStatMultiplier(7));
    expect(getStatMultiplier(6)).toBe(getStatMultiplier(100));
  });

  it('clamps at -6', () => {
    expect(getStatMultiplier(-6)).toBe(getStatMultiplier(-7));
    expect(getStatMultiplier(-6)).toBe(getStatMultiplier(-100));
  });
});
