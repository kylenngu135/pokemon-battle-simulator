'use client';
import { useState } from 'react';
import { usePokemon } from '../../hooks/usePokemon';

interface PokemonSearchProps {
  onSelect: (id: number, name: string) => void;
  selectedIds: number[];
}

export const PokemonSearch = ({ onSelect, selectedIds }: PokemonSearchProps) => {
  const { pokemon, loading } = usePokemon();
  const [search, setSearch] = useState('');

  const filtered = pokemon.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const getIdFromUrl = (url: string): number => {
    return parseInt(url.split('/').filter(Boolean).pop() ?? '0');
  };

  if (loading) return <p className="text-gray-400">Loading Pokémon...</p>;

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Search Pokémon..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <div className="grid grid-cols-3 gap-1 max-h-64 overflow-y-auto">
        {filtered.map((p) => {
          const id = getIdFromUrl(p.url);
          const isSelected = selectedIds.includes(id);
          const isFull = selectedIds.length >= 6 && !isSelected;
          return (
            <button
              key={id}
              onClick={() => !isFull && !isSelected && onSelect(id, p.name)}
              disabled={isFull || isSelected}
              className={`
                px-2 py-1 rounded text-xs font-bold uppercase tracking-wide
                ${isSelected
                  ? 'bg-blue-700 text-white cursor-default'
                  : isFull
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 text-white hover:bg-gray-600 cursor-pointer'
                }
              `}
            >
              #{id} {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
