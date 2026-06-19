'use client';

interface HPBarProps {
  current: number;
  max: number;
  name: string;
  side: 'player' | 'opponent';
}

export const HPBar = ({ current, max, name, side }: HPBarProps) => {
  const percentage = Math.max(0, (current / max) * 100);
  const color =
    percentage > 50 ? 'bg-green-500' :
    percentage > 20 ? 'bg-yellow-400' :
    'bg-red-500';

  return (
    <div className={`flex flex-col gap-1 ${side === 'opponent' ? 'items-start' : 'items-end'}`}>
      <span className="text-sm font-bold uppercase tracking-wide text-white">
        {name}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-300">HP</span>
        <div className="w-40 h-3 bg-gray-700 rounded-full overflow-hidden border border-gray-600">
          <div
            className={`h-full rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-gray-300">
        {current}/{max}
      </span>
    </div>
  );
};
