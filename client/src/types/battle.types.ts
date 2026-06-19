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

export interface BattlePokemon {
  id: number;
  name: string;
  currentHp: number;
  maxHp: number;
  types: string[];
  moves: BattleMove[];
  sprites: {
    front: string;
    back: string;
  };
  fainted: boolean;
}

export interface BattlePlayer {
  name: string;
  team: BattlePokemon[];
  activePokemonIndex: number;
}

export interface BattleReadyPayload {
  matchId: string;
  player1: BattlePlayer;
  player2: BattlePlayer;
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

export type ActionType = 'attack' | 'switch';

export interface BattleAction {
  type: ActionType;
  moveId?: number;
  switchToIndex?: number;
}
