'use client';
import { useState, useEffect, useRef } from 'react';

interface HPBarProps {
  current: number;
  max: number;
  name: string;
  side: 'player' | 'opponent';
}

export const HPBar = ({ current, max, name, side }: HPBarProps) => {
  const [displayedHp, setDisplayedHp] = useState(current);
  const animFrameRef = useRef<number | null>(null);
  const startHpRef = useRef(current);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const from = startHpRef.current;
    const to = current;
    const duration = 1500;
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const interpolated = Math.round(from + (to - from) * progress);
      setDisplayedHp(interpolated);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        startHpRef.current = to;
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [current]);

  const percentage = Math.max(0, (displayedHp / max) * 100);
  const color =
    percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-yellow-400' : 'bg-red-500';

  return (
    <div className={`flex flex-col gap-1 ${side === 'opponent' ? 'items-start' : 'items-end'}`}>
      <span className="text-sm font-bold uppercase tracking-wide text-white">{name}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-300">HP</span>
        <div className="w-40 h-3 bg-gray-700 rounded-full overflow-hidden border border-gray-600">
          <div
            className={`h-full rounded-full ${color}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-gray-300">
        {displayedHp}/{max}
      </span>
    </div>
  );
};
