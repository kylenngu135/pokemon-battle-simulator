export type PrimaryStatus = 'burn' | 'poison' | 'toxic' | 'paralysis' | 'sleep' | 'freeze';
export type Weather = 'none' | 'sun' | 'rain' | 'sandstorm' | 'hail';
export type InvulnerableState = 'none' | 'airborne' | 'underground' | 'underwater' | 'phantom';

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
  currentTypes: string[];
  moves: BattleMove[];
  sprites: {
    front: string;
    back: string;
  };
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
  turnEvents?: TurnEvent[];
  player1NeedsSwitch: boolean;
  player2NeedsSwitch: boolean;
  battleOver: boolean;
  winner: string | null;
  weather?: Weather;
  weatherTurnsRemaining?: number;
  player1State?: BattlePlayer;
  player2State?: BattlePlayer;
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

export type ActionType = 'attack' | 'switch';

export interface BattleAction {
  type: ActionType;
  moveId?: number;
  switchToIndex?: number;
}
