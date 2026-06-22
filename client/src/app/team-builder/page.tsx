'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PokemonSearch } from '../../components/team-builder/PokemonSearch';
import { PokemonCard } from '../../components/team-builder/PokemonCard';
import { fetchPokemonById, startBattle } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { SelectedPokemon, Move } from '../../types/pokemon.types';
import { BattleReadyPayload } from '../../types/battle.types';

type LobbyState = 'building' | 'waiting';

export default function TeamBuilder() {
  const router = useRouter();
  const [team, setTeam] = useState<SelectedPokemon[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobbyState, setLobbyState] = useState<LobbyState>('building');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (lobbyState !== 'waiting' || !matchId) return;

    const socket = getSocket();
    socket.connect();
    socket.emit('battle:join', { battleId: matchId, player: 'player1' });

    socket.on('battle:ready', (data: BattleReadyPayload) => {
      router.push(`/battle?matchId=${data.matchId}&player=player1`);
    });

    socket.on('battle:error', (data: { message: string }) => {
      setError(data.message);
    });

    return () => {
      socket.off('battle:ready');
      socket.off('battle:error');
    };
  }, [lobbyState, matchId, router]);

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

  const isTeamValid = () =>
    playerName.trim().length > 0 &&
    team.length >= 1 && team.length <= 6 &&
    team.every((entry) => entry.moves.length >= 1);

  const handleStartBattle = async () => {
    if (!isTeamValid()) return;
    setLoading(true);
    setError(null);

    try {
      const battle = await startBattle({
        player1: {
          name: playerName,
          team: team.map((entry) => ({
            pokemonId: entry.pokemon.id,
            moves: entry.moves.map((m) => m.id),
          })),
        },
        player2: { name: 'WAITING', team: [] },
      });

      setMatchId(battle.matchId as string);
      setLobbyState('waiting');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      setError(axiosErr.response?.data?.message ?? axiosErr.message ?? 'Failed to create lobby');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!matchId) return;
    void navigator.clipboard.writeText(matchId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (lobbyState === 'waiting' && matchId) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">

          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-3xl font-black uppercase tracking-wide text-green-400">
              Lobby Created!
            </h1>
            <p className="text-gray-400">Share this code with your opponent</p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="px-8 py-4 bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-xl">
              <p className="text-2xl font-mono font-bold tracking-widest text-yellow-400 break-all text-center">
                {matchId}
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="px-6 py-2 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl uppercase tracking-wide transition-colors active:scale-95"
            >
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-300 text-lg font-semibold">Waiting for opponent to join...</p>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-gray-300 uppercase tracking-wide">Your Team</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {team.map((entry) => (
                <div
                  key={entry.pokemon.id}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-3 flex items-center gap-3"
                >
                  {entry.pokemon.sprites.front_default && (
                    <img
                      src={entry.pokemon.sprites.front_default}
                      alt={entry.pokemon.name}
                      className="w-12 h-12"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="font-bold text-white uppercase text-sm tracking-wide truncate">
                      {entry.pokemon.name}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {entry.moves.length} move{entry.moves.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black uppercase tracking-wide">Team Builder</h1>
          <span className="text-gray-400">{team.length}/6 Pokémon · Select 1–6</span>
        </div>

        <input
          type="text"
          placeholder="Enter your name..."
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-lg"
        />

        {team.length < 6 && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-lg font-bold mb-3 text-gray-300">Add Pokémon</h2>
            <PokemonSearch
              onSelect={handleAddPokemon}
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
          onClick={() => { void handleStartBattle(); }}
          disabled={!isTeamValid() || loading}
          className={`
            w-full py-4 rounded-xl font-black text-xl uppercase tracking-widest
            ${isTeamValid() && !loading
              ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer active:scale-95'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }
            transition-all duration-150
          `}
        >
          {loading ? 'Creating Lobby...' : 'Start Battle!'}
        </button>

      </div>
    </main>
  );
}
