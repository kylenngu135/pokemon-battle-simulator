'use client';
import { useEffect, useRef } from 'react';

interface BattleLogProps {
  log: string[];
}

const TurnMarker = ({ text }: { text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0' }}>
    <div style={{ flex: 1, height: '1px', background: '#4b5563' }} />
    <span style={{ color: '#6b7280', fontSize: '10px', whiteSpace: 'nowrap' }}>{text}</span>
    <div style={{ flex: 1, height: '1px', background: '#4b5563' }} />
  </div>
);

export const BattleLog = ({ log }: BattleLogProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  return (
    <div style={{ background: '#111827', border: '2px solid #374151', borderRadius: '6px', padding: '4px 8px', height: '88px', overflowY: 'auto' }}>
      {log.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '12px', fontStyle: 'italic' }}>Battle starting...</p>
      ) : (
        log.map((entry, index) =>
          entry.startsWith('---') ? (
            <TurnMarker key={index} text={entry.replace(/^---\s*/, '').replace(/\s*---$/, '')} />
          ) : (
            <p key={index} style={{ color: 'white', fontSize: '12px', lineHeight: '1.4', margin: 0 }}>
              {entry}
            </p>
          )
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
};
