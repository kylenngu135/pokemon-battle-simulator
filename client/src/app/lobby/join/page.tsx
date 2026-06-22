'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchPokemonById, joinBattle } from '../../../lib/api';
import { getSocket } from '../../../lib/socket';
import { PokemonSearch } from '../../../components/team-builder/PokemonSearch';
import { PokemonCard } from '../../../components/team-builder/PokemonCard';
import { SelectedPokemon, Move } from '../../../types/pokemon.types';
import { BattleReadyPayload } from '../../../types/battle.types';

export default function JoinLobbyPage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [matchId, setMatchId] = useState('');
  const [team, setTeam] = useState<SelectedPokemon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddPokemon = async (id: number) => {
    if (team.length >= 6) return;
    const pokemon = await fetchPokemonById(id);
    setTeam((prev) => [...prev, { pokemon, moves: [] }]);
  };

  const handleRemovePokemon = (index: number) => {
    setTeam((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMovesChange = (index: number, moves: Move[]) => {
    setTeam((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, moves } : entry))
    );
  };

  const isFormValid = () =>
    playerName.trim().length > 0 &&
    matchId.trim().length > 0 &&
    team.length >= 1 && team.length <= 6 &&
    team.every((entry) => entry.moves.length >= 1);

  const handleJoin = async () => {
    if (!isFormValid()) return;
    setLoading(true);
    setError(null);

    const trimmedMatchId = matchId.trim();

    try {
      await joinBattle(trimmedMatchId, {
        player2: {
          name: playerName.trim(),
          team: team.map((entry) => ({
            pokemonId: entry.pokemon.id,
            moves: entry.moves.map((m) => m.id),
          })),
        },
      });

      const socket = getSocket();
      socket.connect();
      socket.emit('battle:join', { battleId: trimmedMatchId, player: 'player2' });

      socket.on('battle:ready', (data: BattleReadyPayload) => {
        router.push(`/battle?matchId=${data.matchId}&player=player2`);
      });

      socket.on('battle:error', (data: { message: string }) => {
        setError(data.message);
        setLoading(false);
        socket.off('battle:ready');
        socket.off('battle:error');
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      setError(axiosErr.response?.data?.message ?? axiosErr.message ?? 'Failed to join battle');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black uppercase tracking-wide">Join Lobby</h1>
          <span className="text-gray-400">{team.length}/6 Pokémon · Select 1–6</span>
        </div>

        <input
          type="text"
          placeholder="Enter your name..."
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-lg"
        />

        <input
          type="text"
          placeholder="Paste match code here..."
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 text-lg font-mono"
        />

        {team.length < 6 && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-lg font-bold mb-3 text-gray-300">Add Pokémon</h2>
            <PokemonSearch
              onSelect={(id) => { void handleAddPokemon(id); }}
              selectedIds={team.map((e) => e.pokemon.id)}
            />
          </div>
        )}

        {team.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {team.map((entry, index) => (
              <PokemonCard
                key={entry.pokemon.id}
                entry={entry}
                onRemove={() => handleRemovePokemon(index)}
                onMovesChange={(moves) => handleMovesChange(index, moves)}
              />
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          onClick={() => { void handleJoin(); }}
          disabled={!isFormValid() || loading}
          className={`
            w-full py-4 rounded-xl font-black text-xl uppercase tracking-widest
            ${isFormValid() && !loading
              ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer active:scale-95'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }
            transition-all duration-150
          `}
        >
          {loading ? 'Joining...' : 'Join Battle!'}
        </button>
      </div>
    </main>
  );
}
