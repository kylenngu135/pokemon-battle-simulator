'use client';

interface ActionMenuProps {
  onBattle: () => void;
  onParty: () => void;
  onForfeit: () => void;
  disabled: boolean;
}

export const ActionMenu = ({ onBattle, onParty, onForfeit, disabled }: ActionMenuProps) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { label: 'FIGHT', onClick: onBattle, color: 'bg-red-600 hover:bg-red-500' },
        { label: 'PARTY', onClick: onParty, color: 'bg-blue-600 hover:bg-blue-500' },
        { label: 'ITEMS', onClick: () => {}, color: 'bg-gray-600 cursor-not-allowed opacity-50' },
        { label: 'RUN', onClick: onForfeit, color: 'bg-yellow-600 hover:bg-yellow-500' },
      ].map(({ label, onClick, color }) => (
        <button
          key={label}
          onClick={onClick}
          disabled={disabled || label === 'ITEMS'}
          className={`
            py-3 rounded-lg font-bold text-white text-lg tracking-widest
            ${color}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}
            transition-all duration-150
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
