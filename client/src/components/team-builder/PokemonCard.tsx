'use client';
import { SelectedPokemon, Move } from '../../types/pokemon.types';
import { MoveSelector } from './MoveSelector';

interface PokemonCardProps {
  entry: SelectedPokemon;
  onRemove: () => void;
  onMovesChange: (moves: Move[]) => void;
}

export const PokemonCard = ({ entry, onRemove, onMovesChange }: PokemonCardProps) => {
  const { pokemon, moves } = entry;

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pokemon.sprites.front_default && (
            <img
              src={pokemon.sprites.front_default}
              alt={pokemon.name}
              className="w-12 h-12"
              style={{ imageRendering: 'pixelated' }}
            />
          )}
          <div>
            <p className="font-bold text-white uppercase text-sm tracking-wide">
              {pokemon.name}
            </p>
            <p className="text-gray-400 text-xs">#{pokemon.id}</p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-300 text-xs font-bold"
        >
          REMOVE
        </button>
      </div>
      <MoveSelector
        pokemonId={pokemon.id}
        selectedMoves={moves}
        onMovesChange={onMovesChange}
      />
      {moves.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {moves.map((move) => (
            <span
              key={move.id}
              className="px-2 py-0.5 bg-blue-900 text-blue-300 text-xs rounded-full uppercase"
            >
              {move.name.replace(/-/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
