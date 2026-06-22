export interface TeamEntry {
    pokemonId: number;
    moves: number[]; // 1-4 move IDs
}

export type PrimaryStatus = 'burn' | 'poison' | 'toxic' | 'paralysis' | 'sleep' | 'freeze';
export type Weather = 'none' | 'sun' | 'rain' | 'sandstorm' | 'hail';

export type TurnEventType =
    | 'turn_start' | 'turn_end' | 'move_use' | 'damage' | 'heal' | 'recoil'
    | 'status_apply' | 'status_clear' | 'stat_change' | 'faint' | 'switch'
    | 'weather_change' | 'weather_damage' | 'field_effect' | 'miss' | 'immune'
    | 'fail' | 'recharge' | 'charging' | 'message';

export interface TurnEvent {
    type: TurnEventType;
    message: string;
    target?: 'player1' | 'player2';
    hpChange?: number;
    newHp?: number;
    maxHp?: number;
    status?: PrimaryStatus;
    stat?: string;
    stages?: number;
    weather?: Weather;
    pokemonName?: string;
    moveName?: string;
    moveId?: number;
    effectiveness?: number;
    isCrit?: boolean;
    isStab?: boolean;
    fieldEffect?: 'reflect' | 'light-screen' | 'mist';
    fieldTurnsRemaining?: number;
}

export type InvulnerableState = 'none' | 'airborne' | 'underground' | 'underwater' | 'phantom';

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
    currentTypes: string[];
    moves: BattleMove[];
    sprites: {
        front: string;
        back: string;
    };
    fainted: boolean;
    // Primary status (persists through switching)
    status: PrimaryStatus | null;
    sleepTurnsRemaining: number;
    toxicCounter: number;
    recharging: boolean;
    // Volatile status (cleared on switch)
    confused: boolean;
    confusionTurnsRemaining: number;
    flinched: boolean;
    seeded: boolean;
    seededBy: 'player1' | 'player2' | null;
    reflect: boolean;
    lightScreen: boolean;
    reflectTurnsRemaining: number;
    lightScreenTurnsRemaining: number;
    // Charging (two-turn moves)
    charging: boolean;
    chargingMoveId: number | null;
    chargingTurnsRemaining: number;
    invulnerableState: InvulnerableState;
    // Bide
    biding: boolean;
    bideTurnsRemaining: number;
    bideDamageStored: number;
    // Rage
    raging: boolean;
    // Substitute
    substituteHp: number;
    // Disable
    disabledMoveId: number | null;
    disabledTurnsRemaining: number;
    // Counter tracking
    lastPhysicalDamageTaken: number;
    // Protect
    protecting: boolean;
    protectConsecutiveTurns: number;
    // Mist
    mistActive: boolean;
    mistTurnsRemaining: number;
    // Multi-turn lock system
    lockedMove: number | null;
    lockType: 'charging' | 'recharge' | 'rampage' | 'bide' | 'rollout' | null;
    lockTurnsRemaining: number;
    lockTotalTurns: number;
    // Rampage specific
    rampageTurns: number;
    // Rollout / Ice Ball
    rolloutConsecutiveTurns: number;
    rolloutBasePower: number;
    defenseCurlUsed: boolean;
    // Fury Cutter
    furyCutterConsecutiveTurns: number;
    // Trapping (applied on the DEFENDER, not attacker)
    trappedByMove: number | null;
    trappedByPlayer: 'player1' | 'player2' | null;
    trappedTurnsRemaining: number;
    // End-of-turn healing
    ingrainActive: boolean;
    aquaRingActive: boolean;
    // Roost temporary Flying removal
    roostUsedThisTurn: boolean;
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

export type BattleStatus = 'waiting' | 'active' | 'resolving' | 'switching' | 'finished';

export type BattleEventType =
    | 'PLAYER_JOINED'
    | 'ACTION_SUBMITTED'
    | 'SWITCH_SUBMITTED'
    | 'FORFEIT'
    | 'PLAYER_DISCONNECTED';

export type BattleEvent =
    | { type: 'PLAYER_JOINED'; player: 'player1' | 'player2'; socketId: string }
    | { type: 'ACTION_SUBMITTED'; player: 'player1' | 'player2'; action: PendingAction }
    | { type: 'SWITCH_SUBMITTED'; player: 'player1' | 'player2'; switchToIndex: number }
    | { type: 'FORFEIT'; player: 'player1' | 'player2' }
    | { type: 'PLAYER_DISCONNECTED'; socketId: string };

export type SideEffect =
    | { type: 'EMIT_BATTLE_READY'; payload: BattleReadyPayload }
    | { type: 'EMIT_TURN_RESULT'; payload: TurnResultPayload }
    | { type: 'EMIT_SWITCH_REQUIRED'; player: 'player1' | 'player2' }
    | { type: 'EMIT_WAITING_FOR_OPPONENT_SWITCH'; player: 'player1' | 'player2' }
    | { type: 'EMIT_BATTLE_OVER'; payload: BattleOverPayload }
    | { type: 'EMIT_OPPONENT_DISCONNECTED'; disconnectedPlayer: 'player1' | 'player2' }
    | { type: 'SAVE_BATTLE'; forfeited: boolean }
    | { type: 'DELETE_BATTLE' }
    | { type: 'AUTO_RESOLVE_RECHARGE' };

export interface BattleState {
    matchId: string;
    player1: BattlePlayer;
    player2: BattlePlayer;
    turn: number;
    currentTurn: 'player1' | 'player2';  // whose turn it is to submit an action
    status: BattleStatus;
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
    switchesRequired: Array<'player1' | 'player2'>;
    switchesSubmitted: Array<'player1' | 'player2'>;
    pendingSwitchLog: string[];
    pendingSwitchEvents: TurnEvent[];
    weather: Weather;
    weatherTurnsRemaining: number;
    startedAt: string;       // ISO timestamp when battle was created
    player1LastMoveUsed: number | null;
    player2LastMoveUsed: number | null;
    // Wish (delayed heal — stored per side)
    player1WishActive: boolean;
    player1WishHp: number;
    player1WishTurnsRemaining: number;
    player2WishActive: boolean;
    player2WishHp: number;
    player2WishTurnsRemaining: number;
    // Healing Wish / Lunar Dance pending (set when user faints)
    player1HealingWishPending: boolean;
    player2HealingWishPending: boolean;
}

export interface BattleReadyPokemon {
    id: number;
    name: string;
    currentHp: number;
    maxHp: number;
    types: string[];
    currentTypes: string[];
    moves: BattleMove[];
    sprites: { front: string; back: string };
    fainted: boolean;
    status: PrimaryStatus | null;
    sleepTurnsRemaining: number;
    toxicCounter: number;
    recharging: boolean;
    confused: boolean;
    flinched: boolean;
    seeded: boolean;
    reflect: boolean;
    lightScreen: boolean;
    reflectTurnsRemaining: number;
    lightScreenTurnsRemaining: number;
    charging: boolean;
    chargingMoveId: number | null;
    invulnerableState: InvulnerableState;
    biding: boolean;
    raging: boolean;
    substituteHp: number;
    disabledMoveId: number | null;
    disabledTurnsRemaining: number;
    protecting: boolean;
    mistActive: boolean;
    mistTurnsRemaining: number;
    lockedMove: number | null;
    lockType: 'charging' | 'recharge' | 'rampage' | 'bide' | 'rollout' | null;
    lockTurnsRemaining: number;
    lockTotalTurns: number;
    rampageTurns: number;
    rolloutConsecutiveTurns: number;
    rolloutBasePower: number;
    defenseCurlUsed: boolean;
    furyCutterConsecutiveTurns: number;
    trappedByMove: number | null;
    trappedByPlayer: 'player1' | 'player2' | null;
    trappedTurnsRemaining: number;
    ingrainActive: boolean;
    aquaRingActive: boolean;
    roostUsedThisTurn: boolean;
    statStages: {
        attack: number;
        defense: number;
        specialAttack: number;
        specialDefense: number;
        speed: number;
        accuracy: number;
        evasion: number;
    };
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
    turnEvents?: TurnEvent[];
    player1NeedsSwitch: boolean;
    player2NeedsSwitch: boolean;
    battleOver: boolean;
    winner: string | null;
    weather?: Weather;
    weatherTurnsRemaining?: number;
    player1State?: { name: string; team: BattleReadyPokemon[]; activePokemonIndex: number };
    player2State?: { name: string; team: BattleReadyPokemon[]; activePokemonIndex: number };
    player1WishActive?: boolean;
    player1WishTurnsRemaining?: number;
    player2WishActive?: boolean;
    player2WishTurnsRemaining?: number;
}

export interface BattleOverPayload {
    winner: string | null;
    forfeited?: boolean;
    forfeitedBy?: string;
}
