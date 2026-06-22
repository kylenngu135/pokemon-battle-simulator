'use client';
import { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import {
  BattleReadyPayload,
  TurnResultPayload,
  BattleOverPayload,
  BattleAction,
  BattlePlayer,
  Weather,
  TurnEvent,
} from '../types/battle.types';
import { useTurnPlayback, PlaybackHp, PlaybackStatus } from './useTurnPlayback';

type BattleStatus = 'waiting' | 'active' | 'switching' | 'finished';

interface BattleUIState {
  battleStatus: BattleStatus;
  player1: BattlePlayer | null;
  player2: BattlePlayer | null;
  turn: number;
  fullLog: string[];
  currentTurnLog: string[];
  winner: string | null;
  myNeedsSwitch: boolean;
  waitingForOpponent: boolean;
  waitingForOpponentSwitch: boolean;
  weather: Weather;
  weatherTurnsRemaining: number;
  error: string | null;
  player1WishActive: boolean;
  player1WishTurnsRemaining: number;
  player2WishActive: boolean;
  player2WishTurnsRemaining: number;
}

type BattleUIAction =
  | { type: 'BATTLE_READY'; payload: BattleReadyPayload }
  | { type: 'TURN_RESULT'; payload: TurnResultPayload; myPlayer: 'player1' | 'player2' }
  | { type: 'BATTLE_OVER'; payload: BattleOverPayload }
  | { type: 'SWITCH_REQUIRED'; player: string }
  | { type: 'WAITING_FOR_OPPONENT_SWITCH' }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'ACTION_SUBMITTED' };

const initialState: BattleUIState = {
  battleStatus: 'waiting',
  player1: null,
  player2: null,
  turn: 1,
  fullLog: [],
  currentTurnLog: [],
  winner: null,
  myNeedsSwitch: false,
  waitingForOpponent: false,
  waitingForOpponentSwitch: false,
  weather: 'none',
  weatherTurnsRemaining: 0,
  error: null,
  player1WishActive: false,
  player1WishTurnsRemaining: 0,
  player2WishActive: false,
  player2WishTurnsRemaining: 0,
};

const battleUIReducer = (state: BattleUIState, action: BattleUIAction): BattleUIState => {
  switch (action.type) {
    case 'BATTLE_READY':
      return {
        ...state,
        battleStatus: 'active',
        player1: action.payload.player1,
        player2: action.payload.player2,
        turn: action.payload.turn,
      };

    case 'TURN_RESULT': {
      const { payload, myPlayer } = action;
      const myNeedsSwitch =
        myPlayer === 'player1' ? payload.player1NeedsSwitch : payload.player2NeedsSwitch;
      const opponentNeedsSwitch =
        myPlayer === 'player1' ? payload.player2NeedsSwitch : payload.player1NeedsSwitch;
      const nextStatus: BattleStatus = payload.battleOver
        ? 'finished'
        : payload.player1NeedsSwitch || payload.player2NeedsSwitch
        ? 'switching'
        : 'active';
      return {
        ...state,
        currentTurnLog: payload.turnLog,
        fullLog: [...state.fullLog, ...payload.turnLog],
        myNeedsSwitch,
        waitingForOpponentSwitch: !myNeedsSwitch && opponentNeedsSwitch,
        weather: payload.weather ?? state.weather,
        weatherTurnsRemaining: payload.weatherTurnsRemaining ?? state.weatherTurnsRemaining,
        player1WishActive: payload.player1WishActive ?? state.player1WishActive,
        player1WishTurnsRemaining: payload.player1WishTurnsRemaining ?? state.player1WishTurnsRemaining,
        player2WishActive: payload.player2WishActive ?? state.player2WishActive,
        player2WishTurnsRemaining: payload.player2WishTurnsRemaining ?? state.player2WishTurnsRemaining,
        battleStatus: nextStatus,
        winner: payload.winner ?? state.winner,
        waitingForOpponent: false,
        turn: state.turn + 1,
        player1: payload.player1State
          ? { ...(state.player1 ?? {}), ...payload.player1State } as BattlePlayer
          : state.player1,
        player2: payload.player2State
          ? { ...(state.player2 ?? {}), ...payload.player2State } as BattlePlayer
          : state.player2,
      };
    }

    case 'BATTLE_OVER':
      return {
        ...state,
        battleStatus: 'finished',
        winner: action.payload.winner,
      };

    case 'SWITCH_REQUIRED':
      return state;

    case 'WAITING_FOR_OPPONENT_SWITCH':
      return { ...state, myNeedsSwitch: false, waitingForOpponentSwitch: true };

    case 'ERROR':
      return { ...state, error: action.message };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'ACTION_SUBMITTED':
      return { ...state, waitingForOpponent: true, error: null };

    default:
      return state;
  }
};

export const useBattle = (matchId: string, player: 'player1' | 'player2') => {
  const [battleState, uiDispatch] = useReducer(battleUIReducer, initialState);

  // Ref to read current state inside socket-event closures
  const battleStateRef = useRef(battleState);
  useEffect(() => { battleStateRef.current = battleState; });

  // Playback inputs — updated before each TURN_RESULT dispatch
  const [playbackEvents, setPlaybackEvents] = useState<TurnEvent[]>([]);
  const [playbackInitHp, setPlaybackInitHp] = useState<PlaybackHp>({ player1: 0, player2: 0 });
  const [playbackInitStatus, setPlaybackInitStatus] = useState<PlaybackStatus>({ player1: null, player2: null });

  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.emit('battle:join', { battleId: matchId, player });

    socket.on('battle:ready', (data: BattleReadyPayload) => {
      const p1Active = data.player1.team[data.player1.activePokemonIndex];
      const p2Active = data.player2.team[data.player2.activePokemonIndex];
      setPlaybackInitHp({ player1: p1Active?.currentHp ?? 0, player2: p2Active?.currentHp ?? 0 });
      setPlaybackInitStatus({ player1: p1Active?.status ?? null, player2: p2Active?.status ?? null });
      uiDispatch({ type: 'BATTLE_READY', payload: data });
    });

    socket.on('battle:turnResult', (data: TurnResultPayload) => {
      // Capture pre-turn active-pokemon HP and status before state update
      const cur = battleStateRef.current;
      const p1 = cur.player1;
      const p2 = cur.player2;
      const p1Active = p1 ? p1.team[p1.activePokemonIndex] : null;
      const p2Active = p2 ? p2.team[p2.activePokemonIndex] : null;
      setPlaybackInitHp({ player1: p1Active?.currentHp ?? 0, player2: p2Active?.currentHp ?? 0 });
      setPlaybackInitStatus({ player1: p1Active?.status ?? null, player2: p2Active?.status ?? null });
      setPlaybackEvents(data.turnEvents ?? []);
      uiDispatch({ type: 'TURN_RESULT', payload: data, myPlayer: player });
    });

    socket.on('battle:switchRequired', ({ player: switchPlayer }: { player: string }) => {
      uiDispatch({ type: 'SWITCH_REQUIRED', player: switchPlayer });
    });

    socket.on('battle:waitingForOpponentSwitch', () => {
      uiDispatch({ type: 'WAITING_FOR_OPPONENT_SWITCH' });
    });

    socket.on('battle:over', (data: BattleOverPayload) => {
      uiDispatch({ type: 'BATTLE_OVER', payload: data });
    });

    socket.on('battle:error', (data: { message: string }) => {
      uiDispatch({ type: 'ERROR', message: data.message });
    });

    socket.on('battle:opponentDisconnected', () => {
      uiDispatch({ type: 'ERROR', message: 'Your opponent disconnected.' });
      uiDispatch({ type: 'BATTLE_OVER', payload: { winner: null } });
    });

    return () => {
      socket.off('battle:ready');
      socket.off('battle:turnResult');
      socket.off('battle:switchRequired');
      socket.off('battle:waitingForOpponentSwitch');
      socket.off('battle:over');
      socket.off('battle:error');
      socket.off('battle:opponentDisconnected');
    };
  }, [matchId, player]);

  const submitAction = useCallback(
    (action: BattleAction) => {
      const socket = getSocket();
      socket.emit('battle:action', { battleId: matchId, player, action });
      uiDispatch({ type: 'ACTION_SUBMITTED' });
    },
    [matchId, player],
  );

  const forfeit = useCallback(() => {
    const socket = getSocket();
    socket.emit('battle:forfeit', { battleId: matchId, player });
  }, [matchId, player]);

  const { visibleLog, isPlaying, displayedHp, displayedStatus } = useTurnPlayback(
    playbackEvents,
    playbackInitHp,
    playbackInitStatus,
  );

  const myState = player === 'player1' ? battleState.player1 : battleState.player2;
  const myActivePokemon = myState ? myState.team[myState.activePokemonIndex] : null;
  const myPokemonRecharging = myActivePokemon?.recharging ?? false;

  return {
    battleReady: battleState.battleStatus !== 'waiting',
    player1: battleState.player1,
    player2: battleState.player2,
    turn: battleState.turn,
    fullLog: battleState.fullLog,
    currentTurnLog: battleState.currentTurnLog,
    battleStatus: battleState.battleStatus,
    winner: battleState.winner,
    myNeedsSwitch: battleState.myNeedsSwitch,
    waitingForOpponentSwitch: battleState.waitingForOpponentSwitch,
    weather: battleState.weather,
    weatherTurnsRemaining: battleState.weatherTurnsRemaining,
    player1NeedsSwitch:
      player === 'player1' ? battleState.myNeedsSwitch : !!(battleState.battleStatus === 'switching'),
    player2NeedsSwitch:
      player === 'player2' ? battleState.myNeedsSwitch : !!(battleState.battleStatus === 'switching'),
    battleOver: battleState.battleStatus === 'finished',
    error: battleState.error,
    waitingForOpponent: battleState.waitingForOpponent,
    myPokemonRecharging,
    visibleLog,
    isPlaying,
    displayedHp,
    displayedStatus,
    player1WishActive: battleState.player1WishActive,
    player1WishTurnsRemaining: battleState.player1WishTurnsRemaining,
    player2WishActive: battleState.player2WishActive,
    player2WishTurnsRemaining: battleState.player2WishTurnsRemaining,
    submitAction,
    forfeit,
  };
};
