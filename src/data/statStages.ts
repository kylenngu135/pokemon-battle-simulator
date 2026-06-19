export const STAT_STAGE_MULTIPLIERS: Record<number, number> = {
    [-6]: 2 / 8,
    [-5]: 2 / 7,
    [-4]: 2 / 6,
    [-3]: 2 / 5,
    [-2]: 2 / 4,
    [-1]: 2 / 3,
    [0]: 1,
    [1]: 3 / 2,
    [2]: 4 / 2,
    [3]: 5 / 2,
    [4]: 6 / 2,
    [5]: 7 / 2,
    [6]: 8 / 2,
};

export const getStatMultiplier = (stage: number): number => {
    return STAT_STAGE_MULTIPLIERS[Math.max(-6, Math.min(6, stage))] ?? 1;
};
