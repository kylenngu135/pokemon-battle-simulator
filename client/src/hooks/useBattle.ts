'use client';
import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import {
  BattleReadyPayload,
  TurnResultPayload,
  BattleOverPayload,
  BattleAction,
  BattlePlayer,
} from '../types/battle.types';

export const useBattle = (matchId: string, player: 'player1' | 'player2') => {
  const [battleReady, setBattleReady] = useState(false);
  const [player1, setPlayer1] = useState<BattlePlayer | null>(null);
  const [player2, setPlayer2] = useState<BattlePlayer | null>(null);
  const [turn, setTurn] = useState(1);
  const [turnLog, setTurnLog] = useState<string[]>([]);
  const [fullLog, setFullLog] = useState<string[]>([]);
  const [player1NeedsSwitch, setPlayer1NeedsSwitch] = useState(false);
  const [player2NeedsSwitch, setPlayer2NeedsSwitch] = useState(false);
  const [battleOver, setBattleOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.emit('battle:join', { battleId: matchId, player });

    socket.on('battle:ready', (data: BattleReadyPayload) => {
      setPlayer1(data.player1);
      setPlayer2(data.player2);
      setTurn(data.turn);
      setBattleReady(true);
    });

    socket.on('battle:turnResult', (data: TurnResultPayload) => {
      setTurnLog(data.turnLog);
      setFullLog((prev) => [...prev, ...data.turnLog]);
      setPlayer1NeedsSwitch(data.player1NeedsSwitch);
      setPlayer2NeedsSwitch(data.player2NeedsSwitch);
      setBattleOver(data.battleOver);
      setWinner(data.winner);
      setWaitingForOpponent(false);
      setTurn((t) => t + 1);
    });

    socket.on('battle:switchRequired', ({ player: switchPlayer }: { player: string }) => {
      if (switchPlayer === 'player1') setPlayer1NeedsSwitch(true);
      if (switchPlayer === 'player2') setPlayer2NeedsSwitch(true);
    });

    socket.on('battle:over', (data: BattleOverPayload) => {
      setBattleOver(true);
      setWinner(data.winner);
    });

    socket.on('battle:error', (data: { message: string }) => {
      setError(data.message);
    });

    socket.on('battle:opponentDisconnected', () => {
      setError('Your opponent disconnected.');
      setBattleOver(true);
    });

    return () => {
      socket.off('battle:ready');
      socket.off('battle:turnResult');
      socket.off('battle:switchRequired');
      socket.off('battle:over');
      socket.off('battle:error');
      socket.off('battle:opponentDisconnected');
    };
  }, [matchId, player]);

  const submitAction = useCallback((action: BattleAction) => {
    const socket = getSocket();
    socket.emit('battle:action', { battleId: matchId, player, action });
    setWaitingForOpponent(true);
    setError(null);
  }, [matchId, player]);

  const forfeit = useCallback(() => {
    const socket = getSocket();
    socket.emit('battle:forfeit', { battleId: matchId, player });
  }, [matchId, player]);

  return {
    battleReady,
    player1,
    player2,
    turn,
    turnLog,
    fullLog,
    player1NeedsSwitch,
    player2NeedsSwitch,
    battleOver,
    winner,
    error,
    waitingForOpponent,
    submitAction,
    forfeit,
  };
};
