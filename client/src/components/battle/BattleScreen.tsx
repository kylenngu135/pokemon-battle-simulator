'use client';
import { useState } from 'react';
import { useBattle } from '../../hooks/useBattle';
import { HPBar } from './HPBar';
import { PartyIndicator } from './PartyIndicator';
import { PokemonSprite } from './PokemonSprite';
import { MoveMenu } from './MoveMenu';
import { ActionMenu } from './ActionMenu';
import { BattleLog } from './BattleLog';

interface BattleScreenProps {
  matchId: string;
  player: 'player1' | 'player2';
}

type MenuState = 'action' | 'fight' | 'party';

export const BattleScreen = ({ matchId, player }: BattleScreenProps) => {
  const {
    battleReady,
    player1,
    player2,
    fullLog,
    player1NeedsSwitch,
    player2NeedsSwitch,
    battleOver,
    winner,
    error,
    waitingForOpponent,
    submitAction,
    forfeit,
  } = useBattle(matchId, player);

  const [menuState, setMenuState] = useState<MenuState>('action');

  const myState = player === 'player1' ? player1 : player2;
  const opponentState = player === 'player1' ? player2 : player1;
  const myActivePokemon = myState?.team[myState.activePokemonIndex];
  const opponentActivePokemon = opponentState?.team[opponentState.activePokemonIndex];

  const myNeedsSwitch = player === 'player1' ? player1NeedsSwitch : player2NeedsSwitch;

  const handleMoveSelect = (moveId: number) => {
    submitAction({ type: 'attack', moveId });
    setMenuState('action');
  };

  const handleSwitch = (index: number) => {
    submitAction({ type: 'switch', switchToIndex: index });
    setMenuState('action');
  };

  if (!battleReady || !myState || !opponentState || !myActivePokemon || !opponentActivePokemon) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-white text-2xl animate-pulse">Waiting for opponent...</div>
      </div>
    );
  }

  if (battleOver) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 gap-6">
        <h1 className="text-4xl font-bold text-white">
          {winner === myState.name ? '🏆 You Win!' : '💀 You Lose!'}
        </h1>
        <p className="text-gray-400 text-xl">{winner} wins the battle!</p>
        <button
          onClick={() => window.location.href = '/'}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-lg"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none">

      {/* battle field */}
      <div className="flex-1 relative bg-linear-to-b from-sky-800 to-green-800 overflow-hidden">

        {/* opponent side — top left */}
        <div className="absolute top-6 left-6 flex flex-col gap-2">
          <PartyIndicator
            team={opponentState.team}
            activePokemonIndex={opponentState.activePokemonIndex}
            side="opponent"
          />
          <HPBar
            current={opponentActivePokemon.currentHp}
            max={opponentActivePokemon.maxHp}
            name={opponentActivePokemon.name}
            side="opponent"
          />
        </div>

        {/* opponent sprite — top right */}
        <div className="absolute top-8 right-16">
          <PokemonSprite
            src={opponentActivePokemon.sprites.front}
            name={opponentActivePokemon.name}
            side="opponent"
          />
        </div>

        {/* player sprite — bottom left */}
        <div className="absolute bottom-8 left-16">
          <PokemonSprite
            src={myActivePokemon.sprites.back}
            name={myActivePokemon.name}
            side="player"
          />
        </div>

        {/* player side — bottom right */}
        <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
          <PartyIndicator
            team={myState.team}
            activePokemonIndex={myState.activePokemonIndex}
            side="player"
          />
          <HPBar
            current={myActivePokemon.currentHp}
            max={myActivePokemon.maxHp}
            name={myActivePokemon.name}
            side="player"
          />
        </div>

        {/* waiting overlay — bg-black/40 is the Tailwind v4 syntax for semi-transparent black */}
        {waitingForOpponent && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <p className="text-white text-xl animate-pulse">Waiting for opponent...</p>
          </div>
        )}

        {/* error banner */}
        {error && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {/* bottom UI panel */}
      <div className="bg-gray-900 border-t-4 border-gray-700 p-4 flex flex-col gap-3">

        <BattleLog log={fullLog} />

        {/* switch required */}
        {myNeedsSwitch ? (
          <div className="flex flex-col gap-2">
            <p className="text-yellow-400 font-bold text-center">Choose your next Pokemon!</p>
            <div className="grid grid-cols-3 gap-2">
              {myState.team.map((pokemon, index) => (
                <button
                  key={index}
                  onClick={() => handleSwitch(index)}
                  disabled={pokemon.fainted || index === myState.activePokemonIndex}
                  className={`
                    p-2 rounded-lg border-2 text-sm font-bold uppercase
                    ${pokemon.fainted || index === myState.activePokemonIndex
                      ? 'border-gray-600 bg-gray-700 opacity-40 cursor-not-allowed'
                      : 'border-green-500 bg-green-900 hover:bg-green-800 cursor-pointer'
                    }
                  `}
                >
                  {pokemon.name}
                  <span className="block text-xs font-normal opacity-70">
                    {pokemon.currentHp}/{pokemon.maxHp} HP
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : menuState === 'action' ? (
          <ActionMenu
            onBattle={() => setMenuState('fight')}
            onParty={() => setMenuState('party')}
            onForfeit={forfeit}
            disabled={waitingForOpponent}
          />
        ) : menuState === 'fight' ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setMenuState('action')}
              className="text-gray-400 text-sm text-left hover:text-white"
            >
              ← Back
            </button>
            <MoveMenu
              moves={myActivePokemon.moves}
              onMoveSelect={handleMoveSelect}
              disabled={waitingForOpponent}
            />
          </div>
        ) : menuState === 'party' ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setMenuState('action')}
              className="text-gray-400 text-sm text-left hover:text-white"
            >
              ← Back
            </button>
            <div className="grid grid-cols-3 gap-2">
              {myState.team.map((pokemon, index) => (
                <button
                  key={index}
                  onClick={() => handleSwitch(index)}
                  disabled={pokemon.fainted || index === myState.activePokemonIndex || waitingForOpponent}
                  className={`
                    p-2 rounded-lg border-2 text-sm font-bold uppercase
                    ${pokemon.fainted || index === myState.activePokemonIndex
                      ? 'border-gray-600 bg-gray-700 opacity-40 cursor-not-allowed'
                      : 'border-blue-500 bg-blue-900 hover:bg-blue-800 cursor-pointer'
                    }
                  `}
                >
                  {pokemon.name}
                  <span className="block text-xs font-normal opacity-70">
                    {pokemon.currentHp}/{pokemon.maxHp} HP
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
