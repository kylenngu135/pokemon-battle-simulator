'use client';
import { useState, useEffect } from 'react';
import { fetchPokemonById, fetchMoveById } from '../../lib/api';
import { Move } from '../../types/pokemon.types';

interface MoveSelectorProps {
  pokemonId: number;
  selectedMoves: Move[];
  onMovesChange: (moves: Move[]) => void;
}

export const MoveSelector = ({ pokemonId, selectedMoves, onMovesChange }: MoveSelectorProps) => {
  const [availableMoves, setAvailableMoves] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const pokemon = await fetchPokemonById(pokemonId);
      const gen1Moves = pokemon.moves
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((m: any) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.version_group_details.some((v: any) =>
            v.version_group.name === 'red-blue' || v.version_group.name === 'yellow'
          )
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((m: any) => ({
          id: parseInt(m.move.url.split('/').filter(Boolean).pop()),
          name: m.move.name,
        }));
      setAvailableMoves(gen1Moves);
      setLoading(false);
    };
    load();
  }, [pokemonId]);

  const handleMoveToggle = async (moveId: number) => {
    const isSelected = selectedMoves.some((m) => m.id === moveId);
    if (isSelected) {
      onMovesChange(selectedMoves.filter((m) => m.id !== moveId));
    } else if (selectedMoves.length < 4) {
      const move = await fetchMoveById(moveId);
      onMovesChange([...selectedMoves, move]);
    }
  };

  if (loading) return <p className="text-gray-400 text-xs">Loading moves...</p>;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-gray-400 text-xs">
        Select up to 4 moves ({selectedMoves.length}/4)
      </p>
      <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
        {availableMoves.map((move) => {
          const isSelected = selectedMoves.some((m) => m.id === move.id);
          const isFull = selectedMoves.length >= 4 && !isSelected;
          return (
            <button
              key={move.id}
              onClick={() => { void handleMoveToggle(move.id); }}
              disabled={isFull}
              className={`
                px-2 py-1 rounded text-xs font-bold uppercase tracking-wide text-left
                ${isSelected
                  ? 'bg-green-700 text-white'
                  : isFull
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 text-white hover:bg-gray-600 cursor-pointer'
                }
              `}
            >
              {move.name.replace(/-/g, ' ')}
            </button>
          );
        })}
      </div>
    </div>
  );
};
