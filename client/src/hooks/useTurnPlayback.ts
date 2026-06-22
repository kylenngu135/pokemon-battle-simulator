'use client';
import { useState, useEffect, useRef } from 'react';
import { TurnEvent, PrimaryStatus } from '../types/battle.types';

const EVENT_DELAY: Record<string, number> = {
  turn_start: 200,
  turn_end: 300,
  move_use: 800,
  charging: 800,
  recharge: 800,
  switch: 800,
  damage: 1200,
  recoil: 1000,
  heal: 1000,
  status_apply: 1000,
  status_clear: 700,
  faint: 1500,
  weather_change: 700,
  weather_damage: 1000,
  field_effect: 700,
  miss: 700,
  immune: 700,
  fail: 600,
  stat_change: 700,
  message: 600,
};

function getDelay(type: string): number {
  return EVENT_DELAY[type] ?? 600;
}

export interface PlaybackHp {
  player1: number;
  player2: number;
}

export interface PlaybackStatus {
  player1: PrimaryStatus | null;
  player2: PrimaryStatus | null;
}

export interface TurnPlaybackResult {
  visibleLog: string[];
  isPlaying: boolean;
  displayedHp: PlaybackHp;
  displayedStatus: PlaybackStatus;
}

export function useTurnPlayback(
  turnEvents: TurnEvent[],
  initialHp: PlaybackHp,
  initialStatus: PlaybackStatus,
): TurnPlaybackResult {
  const [visibleLog, setVisibleLog] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayedHp, setDisplayedHp] = useState<PlaybackHp>(initialHp);
  const [displayedStatus, setDisplayedStatus] = useState<PlaybackStatus>(initialStatus);

  // Keep refs in sync so the effect always reads latest initial values
  const initHpRef = useRef(initialHp);
  const initStatusRef = useRef(initialStatus);
  const isPlayingRef = useRef(false);
  initHpRef.current = initialHp;
  initStatusRef.current = initialStatus;

  // Snap to new initial values when not playing (handles battle start and forced switches)
  useEffect(() => {
    if (!isPlayingRef.current) {
      setDisplayedHp(initialHp);
      setDisplayedStatus(initialStatus);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHp.player1, initialHp.player2, initialStatus.player1, initialStatus.player2]);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (turnEvents.length === 0) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    isPlayingRef.current = true;
    setIsPlaying(true);
    setDisplayedHp(initHpRef.current);
    setDisplayedStatus(initStatusRef.current);

    let elapsed = 0;

    for (const ev of turnEvents) {
      elapsed += getDelay(ev.type);
      const captured = ev;
      const t = setTimeout(() => {
        // Add to log (skip turn_start bookkeeping; keep turn_end for turn markers)
        if (captured.type !== 'turn_start') {
          setVisibleLog(prev => [...prev, captured.message]);
        }

        // Update displayed HP
        if (captured.newHp !== undefined && captured.target) {
          setDisplayedHp(prev => ({ ...prev, [captured.target!]: captured.newHp! }));
        }

        // Update displayed status
        if (captured.type === 'status_apply' && captured.status && captured.target) {
          setDisplayedStatus(prev => ({ ...prev, [captured.target!]: captured.status! }));
        } else if (captured.type === 'status_clear' && captured.target) {
          setDisplayedStatus(prev => ({ ...prev, [captured.target!]: null }));
        }
      }, elapsed);
      timersRef.current.push(t);
    }

    const done = setTimeout(() => { isPlayingRef.current = false; setIsPlaying(false); }, elapsed + 100);
    timersRef.current.push(done);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // intentionally omitting initialHp/initialStatus — read via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnEvents]);

  return { visibleLog, isPlaying, displayedHp, displayedStatus };
}
