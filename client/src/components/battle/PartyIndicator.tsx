'use client';
import { BattlePokemon } from '../../types/battle.types';

interface PartyIndicatorProps {
  team: BattlePokemon[];
  activePokemonIndex: number;
  side: 'player' | 'opponent';
}

export const PartyIndicator = ({ team, activePokemonIndex, side }: PartyIndicatorProps) => {
  return (
    <div className={`flex gap-1 ${side === 'opponent' ? 'flex-row' : 'flex-row-reverse'}`}>
      {team.map((pokemon, index) => (
        <div
          key={index}
          className={`w-5 h-5 rounded-full border-2 ${
            pokemon.fainted
              ? 'bg-gray-600 border-gray-500'
              : index === activePokemonIndex
              ? 'bg-yellow-400 border-yellow-300'
              : 'bg-green-500 border-green-400'
          }`}
          title={pokemon.name}
        />
      ))}
    </div>
  );
};
