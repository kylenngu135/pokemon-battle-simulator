'use client';

interface PokemonSpriteProps {
  src: string | null;
  name: string;
  side: 'player' | 'opponent';
}

export const PokemonSprite = ({ src, name, side }: PokemonSpriteProps) => {
  if (!src) return (
    <div className={`flex items-center justify-center ${side === 'player' ? 'w-48 h-48' : 'w-40 h-40'}`}>
      <span className="text-gray-500 text-sm">No sprite</span>
    </div>
  );

  return (
    <img
      src={src}
      alt={name}
      className={`${side === 'player' ? 'w-48 h-48' : 'w-40 h-40'} object-contain`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
};
