'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BattleScreen } from '../../components/battle/BattleScreen';

function BattlePageInner() {
  const params = useSearchParams();
  const matchId = params.get('matchId');
  const player = params.get('player') as 'player1' | 'player2' | null;

  if (!matchId || !player) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <p>Invalid battle parameters.</p>
      </div>
    );
  }

  return <BattleScreen matchId={matchId} player={player} />;
}

export default function BattlePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        Loading...
      </div>
    }>
      <BattlePageInner />
    </Suspense>
  );
}
