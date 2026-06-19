'use client';
import { BattleMove } from '../../types/battle.types';

const TYPE_COLORS: Record<string, string> = {
  normal: 'bg-gray-400',
  fire: 'bg-orange-500',
  water: 'bg-blue-500',
  electric: 'bg-yellow-400',
  grass: 'bg-green-500',
  ice: 'bg-cyan-300',
  fighting: 'bg-red-700',
  poison: 'bg-purple-500',
  ground: 'bg-yellow-600',
  flying: 'bg-indigo-400',
  psychic: 'bg-pink-500',
  bug: 'bg-lime-500',
  rock: 'bg-yellow-800',
  ghost: 'bg-purple-800',
  dragon: 'bg-indigo-700',
  dark: 'bg-gray-800',
  steel: 'bg-gray-400',
  fairy: 'bg-pink-300',
};

interface MoveMenuProps {
  moves: BattleMove[];
  onMoveSelect: (moveId: number) => void;
  disabled: boolean;
}

export const MoveMenu = ({ moves, onMoveSelect, disabled }: MoveMenuProps) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      {moves.map((move) => (
        <button
          key={move.id}
          onClick={() => onMoveSelect(move.id)}
          disabled={disabled || move.currentPp <= 0}
          className={`
            flex flex-col items-start p-3 rounded-lg border-2 border-gray-600
            ${TYPE_COLORS[move.type] ?? 'bg-gray-500'}
            ${disabled || move.currentPp <= 0
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:brightness-110 cursor-pointer active:scale-95'
            }
            transition-all duration-150
          `}
        >
          <span className="text-white font-bold text-sm uppercase tracking-wide">
            {move.name.replace('-', ' ')}
          </span>
          <div className="flex justify-between w-full mt-1">
            <span className="text-white text-xs opacity-80 uppercase">{move.type}</span>
            <span className="text-white text-xs opacity-80">PP {move.currentPp}/{move.maxPp}</span>
          </div>
        </button>
      ))}
    </div>
  );
};
