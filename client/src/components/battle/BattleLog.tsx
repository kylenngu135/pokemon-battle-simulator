'use client';
import { useEffect, useRef } from 'react';

interface BattleLogProps {
  log: string[];
}

export const BattleLog = ({ log }: BattleLogProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  return (
    <div className="bg-gray-900 border-2 border-gray-600 rounded-lg p-3 h-28 overflow-y-auto">
      {log.length === 0 ? (
        <p className="text-gray-500 text-sm italic">Battle starting...</p>
      ) : (
        log.map((entry, index) => (
          <p key={index} className="text-white text-sm leading-relaxed">
            {entry}
          </p>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
};
