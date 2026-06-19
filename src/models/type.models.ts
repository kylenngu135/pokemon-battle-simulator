export interface TypeMatchupResponse {
    attackType: string;
    defenderTypes: string[];
    multiplier: number;
}

export interface TypeChartResponse {
    [attackType: string]: {
        [defenderType: string]: number;
    };
}
