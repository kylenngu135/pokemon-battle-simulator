'use client';
import { BattleMove, BattlePokemon } from '../../types/battle.types';

const TYPE_BG: Record<string, string> = {
  normal: '#9ca3af', fire: '#f97316', water: '#3b82f6', electric: '#facc15',
  grass: '#22c55e', ice: '#67e8f9', fighting: '#991b1b', poison: '#a855f7',
  ground: '#ca8a04', flying: '#818cf8', psychic: '#ec4899', bug: '#84cc16',
  rock: '#92400e', ghost: '#6b21a8', dragon: '#4338ca', dark: '#1f2937',
  steel: '#9ca3af', fairy: '#f9a8d4',
};

interface MoveMenuProps {
  moves: BattleMove[];
  onMoveSelect: (moveId: number) => void;
  disabled: boolean;
  recharging?: boolean;
  activePokemon?: BattlePokemon;
}

export const MoveMenu = ({ moves, onMoveSelect, disabled, recharging, activePokemon }: MoveMenuProps) => {
  const charging = activePokemon?.charging ?? false;
  const biding = activePokemon?.biding ?? false;
  const raging = activePokemon?.raging ?? false;
  const lockType = activePokemon?.lockedMove !== null ? activePokemon?.lockType : null;
  const disabledMoveId = activePokemon?.disabledMoveId ?? null;

  if (recharging) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: '#facc15', fontWeight: 'bold', fontSize: '14px' }} className="animate-pulse">
          Recharging...
        </p>
      </div>
    );
  }

  if (charging) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: '#818cf8', fontWeight: 'bold', fontSize: '14px' }} className="animate-pulse">
          Charging up...
        </p>
      </div>
    );
  }

  if (biding) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: '#fb923c', fontWeight: 'bold', fontSize: '14px' }} className="animate-pulse">
          Storing energy...
        </p>
      </div>
    );
  }

  if (lockType === 'rampage') {
    const turnsLeft = activePokemon?.lockTurnsRemaining ?? 0;
    const moveName = activePokemon?.moves.find(m => m.id === activePokemon?.lockedMove)?.name ?? 'move';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '4px' }}>
        <p style={{ color: '#f97316', fontWeight: 'bold', fontSize: '14px' }} className="animate-pulse">
          Rampaging! ({turnsLeft} turn{turnsLeft !== 1 ? 's' : ''} left)
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', textTransform: 'uppercase' }}>
          {moveName.replace(/-/g, ' ')}
        </p>
      </div>
    );
  }

  if (lockType === 'rollout') {
    const consecutive = activePokemon?.rolloutConsecutiveTurns ?? 1;
    const moveName = activePokemon?.moves.find(m => m.id === activePokemon?.lockedMove)?.name ?? 'move';
    const power = (activePokemon?.rolloutBasePower ?? 30) * Math.pow(2, consecutive - 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '4px' }}>
        <p style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '14px' }} className="animate-pulse">
          Rolling! (Hit {consecutive}/5)
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', textTransform: 'uppercase' }}>
          {moveName.replace(/-/g, ' ')} — Power: {power}
        </p>
      </div>
    );
  }

  if (raging) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '4px' }}>
        <p style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px' }}>
          Raging!
        </p>
        <button
          onClick={() => onMoveSelect(99)}
          disabled={disabled}
          style={{
            padding: '4px 16px', borderRadius: '6px', border: '2px solid #ef4444',
            background: '#7f1d1d', color: 'white', fontWeight: 'bold', fontSize: '12px',
            cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          }}
        >
          RAGE
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
      {moves.map((move) => {
        const isDisabled = move.id === disabledMoveId;
        const isUnusable = disabled || move.currentPp <= 0 || isDisabled;
        const bg = TYPE_BG[move.type] ?? '#6b7280';
        return (
          <button
            key={move.id}
            onClick={() => !isUnusable && onMoveSelect(move.id)}
            disabled={isUnusable}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '6px 8px', borderRadius: '6px', border: '2px solid rgba(255,255,255,0.2)',
              background: isUnusable ? '#374151' : bg,
              opacity: isUnusable ? 0.45 : 1,
              cursor: isUnusable ? 'not-allowed' : 'pointer',
              transition: 'filter 0.1s',
            }}
          >
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {move.name.replace(/-/g, ' ')}
              {isDisabled ? ' (Disabled)' : ''}
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '2px' }}>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px', textTransform: 'uppercase' }}>{move.type}</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px' }}>PP {move.currentPp}/{move.maxPp}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
