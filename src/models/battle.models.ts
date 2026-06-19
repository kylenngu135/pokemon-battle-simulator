export interface TeamEntry {
    pokemonId: number;
    moves: number[]; // 1-4 move IDs
}

export interface BattlePokemon {
    id: number;
    name: string;
    currentHp: number;
    maxHp: number;
    stats: {
        attack: number;
        defense: number;
        specialAttack: number;
        specialDefense: number;
        speed: number;
    };
    statStages: {
        attack: number;
        defense: number;
        specialAttack: number;
        specialDefense: number;
        speed: number;
        accuracy: number;
        evasion: number;
    };
    types: string[];
    moves: BattleMove[];
    sprites: {
        front: string;
        back: string;
    };
    fainted: boolean;
}

export interface BattleMove {
    id: number;
    name: string;
    currentPp: number;
    maxPp: number;
    power: number | null;
    accuracy: number | null;
    type: string;
    damageClass: 'physical' | 'special' | 'status';
}

export interface BattlePlayer {
    name: string;
    team: BattlePokemon[];
    activePokemonIndex: number;  // which pokemon is currently out
    socketId?: string;
}

export interface PendingAction {
    type: 'attack' | 'switch';
    moveId?: number;
    switchToIndex?: number;
}

export interface BattleState {
    matchId: string;
    player1: BattlePlayer;
    player2: BattlePlayer;
    turn: number;
    currentTurn: 'player1' | 'player2';  // whose turn it is to submit an action
    status: 'active' | 'finished';
    winner: string | null;
    log: string[];           // cumulative full log across all turns
    turnLogs: string[][];    // per-turn logs, each index is one turn's log entries
    pendingActions: {
        player1?: PendingAction;
        player2?: PendingAction;
    };
    awaitingFaintSwitch: {
        player1: boolean;
        player2: boolean;
    };
    startedAt: string;       // ISO timestamp when battle was created
}

export interface BattleReadyPokemon {
    id: number;
    name: string;
    currentHp: number;
    maxHp: number;
    types: string[];
    moves: BattleMove[];
    sprites: { front: string; back: string };
    fainted: boolean;
}

export interface BattleReadyPayload {
    matchId: string;
    player1: {
        name: string;
        team: BattleReadyPokemon[];
        activePokemonIndex: number;
    };
    player2: {
        name: string;
        team: BattleReadyPokemon[];
        activePokemonIndex: number;
    };
    turn: number;
}

export interface TurnResultPayload {
    turnLog: string[];
    player1NeedsSwitch: boolean;
    player2NeedsSwitch: boolean;
    battleOver: boolean;
    winner: string | null;
}

export interface BattleOverPayload {
    winner: string | null;
    forfeited?: boolean;
    forfeitedBy?: string;
}
