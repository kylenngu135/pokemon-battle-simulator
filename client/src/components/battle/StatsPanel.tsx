'use client';
import { BattlePokemon } from '../../types/battle.types';

const STAT_LABELS: Record<string, string> = {
  attack: 'ATK',
  defense: 'DEF',
  specialAttack: 'SPA',
  specialDefense: 'SPD',
  speed: 'SPE',
  accuracy: 'ACC',
  evasion: 'EVA',
};

const STAT_MULTIPLIERS: Record<number, number> = {
  [-6]: 2 / 8,
  [-5]: 2 / 7,
  [-4]: 2 / 6,
  [-3]: 2 / 5,
  [-2]: 2 / 4,
  [-1]: 2 / 3,
  [0]: 1,
  [1]: 3 / 2,
  [2]: 4 / 2,
  [3]: 5 / 2,
  [4]: 6 / 2,
  [5]: 7 / 2,
  [6]: 8 / 2,
};

const getMultiplier = (stage: number) =>
  STAT_MULTIPLIERS[Math.max(-6, Math.min(6, stage))] ?? 1;

interface StatsPanelProps {
  pokemon: BattlePokemon;
  side: 'player' | 'opponent';
}

const STATUS_BADGE: Record<string, { bg: string; label: (p: BattlePokemon) => string }> = {
  burn:      { bg: '#f97316', label: () => 'BRN' },
  poison:    { bg: '#a855f7', label: () => 'PSN' },
  toxic:     { bg: '#7e22ce', label: (p) => `TOX (${p.toxicCounter}/16)` },
  paralysis: { bg: '#eab308', label: () => 'PAR' },
  sleep:     { bg: '#3b82f6', label: () => 'SLP' },
  freeze:    { bg: '#67e8f9', label: () => 'FRZ' },
};

export const StatsPanel = ({ pokemon, side }: StatsPanelProps) => {
  const stages = pokemon.statStages;
  const activeStages = Object.entries(stages).filter(([, v]) => v !== 0);

  const base: React.CSSProperties = {
    background: 'rgba(0,0,0,0.55)',
    borderRadius: '8px',
    padding: '6px 10px',
    minWidth: '110px',
    maxWidth: '140px',
    fontSize: '11px',
    color: 'white',
    lineHeight: '1.4',
  };

  return (
    <div style={base}>
      {/* Status badge */}
      {pokemon.status && STATUS_BADGE[pokemon.status] && (
        <div style={{ marginBottom: '4px' }}>
          <span style={{
            background: STATUS_BADGE[pokemon.status].bg,
            color: 'white',
            fontWeight: 'bold',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            letterSpacing: '0.05em',
          }}>
            {STATUS_BADGE[pokemon.status].label(pokemon)}
          </span>
        </div>
      )}

      {/* Stat stages */}
      {activeStages.length === 0 ? (
        <span style={{ color: '#9ca3af', fontSize: '10px' }}>No stat changes</span>
      ) : (
        activeStages.map(([stat, stage]) => {
          const mult = getMultiplier(stage);
          const color = stage > 0 ? '#4ade80' : '#f87171';
          const sign = stage > 0 ? '+' : '';
          return (
            <div key={stat} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: '#d1d5db' }}>{STAT_LABELS[stat] ?? stat}</span>
              <span style={{ color }}>
                {sign}{stage}
                {side === 'player' && (
                  <span style={{ color: '#9ca3af', fontSize: '9px' }}> {mult.toFixed(2)}×</span>
                )}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
};
