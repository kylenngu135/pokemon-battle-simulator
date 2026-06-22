'use client';
import { useState, useRef, useEffect } from 'react';
import { useBattle } from '../../hooks/useBattle';
import { HPBar } from './HPBar';
import { PartyIndicator } from './PartyIndicator';
import { PokemonSprite } from './PokemonSprite';
import { MoveMenu } from './MoveMenu';
import { ActionMenu } from './ActionMenu';
import { BattleLog } from './BattleLog';
import { BattlePokemon, Weather, PrimaryStatus } from '../../types/battle.types';
import { StatsPanel } from './StatsPanel';

interface BattleScreenProps {
  matchId: string;
  player: 'player1' | 'player2';
}

type MenuState = 'action' | 'fight' | 'party';

const CANVAS_W = 800;
const CANVAS_H = 600;
const FIELD_H = 400;
const PANEL_H = 200;

const STATUS_BADGE_STYLE: Record<string, { bg: string; label: string }> = {
  burn:      { bg: '#f97316', label: 'BRN' },
  poison:    { bg: '#a855f7', label: 'PSN' },
  toxic:     { bg: '#7e22ce', label: 'TOX' },
  paralysis: { bg: '#eab308', label: 'PAR' },
  sleep:     { bg: '#3b82f6', label: 'SLP' },
  freeze:    { bg: '#67e8f9', label: 'FRZ' },
};

const WEATHER_ICONS: Record<Weather, string> = {
  none: '',
  sun: '☀️',
  rain: '🌧️',
  sandstorm: '🌪️',
  hail: '🧊',
};

const WEATHER_LABELS: Record<Weather, string> = {
  none: '',
  sun: 'Harsh Sun',
  rain: 'Rain',
  sandstorm: 'Sandstorm',
  hail: 'Hail',
};

const StatusBadge = ({ status }: { status: PrimaryStatus | null }) => {
  if (!status) return null;
  const cfg = STATUS_BADGE_STYLE[status];
  if (!cfg) return null;
  return (
    <span style={{
      background: cfg.bg,
      color: 'white',
      fontSize: '11px',
      fontWeight: 'bold',
      padding: '2px 6px',
      borderRadius: '4px',
      letterSpacing: '0.05em',
    }}>
      {cfg.label}
    </span>
  );
};

const FieldEffectBadge = ({ label, turns, color }: { label: string; turns: number; color: string }) => (
  <div style={{
    background: color,
    color: 'white',
    fontSize: '10px',
    fontWeight: 'bold',
    padding: '2px 6px',
    borderRadius: '4px',
    display: 'inline-block',
  }}>
    {label} ({turns})
  </div>
);

export const BattleScreen = ({ matchId, player }: BattleScreenProps) => {
  const {
    battleReady,
    player1,
    player2,
    myNeedsSwitch,
    waitingForOpponentSwitch,
    battleOver,
    winner,
    error,
    waitingForOpponent,
    weather,
    weatherTurnsRemaining,
    myPokemonRecharging,
    player1WishActive,
    player1WishTurnsRemaining,
    player2WishActive,
    player2WishTurnsRemaining,
    visibleLog,
    isPlaying,
    displayedHp,
    displayedStatus,
    submitAction,
    forfeit,
  } = useBattle(matchId, player);

  const opponentPlayer = player === 'player1' ? 'player2' : 'player1';

  const myWishActive = player === 'player1' ? player1WishActive : player2WishActive;
  const myWishTurns = player === 'player1' ? player1WishTurnsRemaining : player2WishTurnsRemaining;
  const oppWishActive = player === 'player1' ? player2WishActive : player1WishActive;
  const oppWishTurns = player === 'player1' ? player2WishTurnsRemaining : player1WishTurnsRemaining;

  const [menuState, setMenuState] = useState<MenuState>('action');
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const applyScale = () => {
      if (!canvasRef.current) return;
      const scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
      const left = (window.innerWidth - CANVAS_W * scale) / 2;
      const top = (window.innerHeight - CANVAS_H * scale) / 2;
      canvasRef.current.style.transform = `scale(${scale})`;
      canvasRef.current.style.left = `${left}px`;
      canvasRef.current.style.top = `${top}px`;
    };
    applyScale();
    window.addEventListener('resize', applyScale);
    return () => window.removeEventListener('resize', applyScale);
  }, []);

  const myState = player === 'player1' ? player1 : player2;
  const opponentState = player === 'player1' ? player2 : player1;
  const myActivePokemon = myState?.team[myState.activePokemonIndex];
  const opponentActivePokemon = opponentState?.team[opponentState.activePokemonIndex];

  // Playback-driven display pokemon — HP and status come from the hook
  const myDisplayPokemon: BattlePokemon | null = myActivePokemon
    ? { ...myActivePokemon, currentHp: displayedHp[player], status: displayedStatus[player] }
    : null;
  const opDisplayPokemon: BattlePokemon | null = opponentActivePokemon
    ? { ...opponentActivePokemon, currentHp: displayedHp[opponentPlayer], status: displayedStatus[opponentPlayer] }
    : null;

  const isFullyLocked =
    myPokemonRecharging ||
    (myActivePokemon?.lockedMove != null) ||
    isPlaying;

  const getLockReason = (): string => {
    if (myPokemonRecharging) return 'is recharging!';
    if (myActivePokemon?.lockedMove != null) return 'is locked into a move!';
    return 'is waiting...';
  };

  const handleMoveSelect = (moveId: number) => {
    submitAction({ type: 'attack', moveId });
    setMenuState('action');
  };

  const handleSwitch = (index: number) => {
    submitAction({ type: 'switch', switchToIndex: index });
    setMenuState('action');
  };

  if (!battleReady || !myState || !opponentState || !myActivePokemon || !opponentActivePokemon || !myDisplayPokemon || !opDisplayPokemon) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '24px' }} className="animate-pulse">Waiting for opponent...</div>
      </div>
    );
  }

  if (battleOver) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030712', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
        <h1 style={{ fontSize: '40px', fontWeight: 'bold', color: 'white' }}>
          {winner === myState.name ? 'You Win!' : 'You Lose!'}
        </h1>
        <p style={{ color: '#9ca3af', fontSize: '20px' }}>{winner} wins the battle!</p>
        <button
          onClick={() => window.location.href = '/'}
          style={{ padding: '12px 32px', background: '#2563eb', color: 'white', fontWeight: 'bold', borderRadius: '8px', fontSize: '18px', cursor: 'pointer', border: 'none' }}
        >
          Play Again
        </button>
      </div>
    );
  }

  const showWaitingOverlay = waitingForOpponent && !waitingForOpponentSwitch;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#030712', overflow: 'hidden' }}>
      <div
        ref={canvasRef}
        style={{
          position: 'absolute',
          width: `${CANVAS_W}px`,
          height: `${CANVAS_H}px`,
          transformOrigin: 'top left',
          userSelect: 'none',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        {/* ── Battle field zone (800×400) ── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${CANVAS_W}px`,
            height: `${FIELD_H}px`,
            background: 'linear-gradient(to bottom, #075985, #166534)',
            overflow: 'hidden',
          }}
        >
          {/* Opponent sprite — top right */}
          <div style={{ position: 'absolute', top: '40px', right: '80px' }}>
            <PokemonSprite
              src={opponentActivePokemon.sprites.front}
              name={opponentActivePokemon.name}
              side="opponent"
            />
          </div>

          {/* Opponent StatsPanel — top right, beside sprite */}
          <div style={{ position: 'absolute', top: '40px', right: '220px', zIndex: 25 }}>
            <StatsPanel pokemon={opDisplayPokemon} side="opponent" />
          </div>

          {/* Player sprite — bottom left */}
          <div style={{ position: 'absolute', bottom: '40px', left: '80px' }}>
            <PokemonSprite
              src={myActivePokemon.sprites.back}
              name={myActivePokemon.name}
              side="player"
            />
          </div>

          {/* Player StatsPanel — bottom left, beside sprite */}
          <div style={{ position: 'absolute', bottom: '40px', left: '220px', zIndex: 25 }}>
            <StatsPanel pokemon={myDisplayPokemon} side="player" />
          </div>

          {/* Substitute indicator — player side */}
          {myActivePokemon.substituteHp > 0 && (
            <div style={{
              position: 'absolute', bottom: '20px', left: '200px', zIndex: 20,
              background: 'rgba(99,102,241,0.85)', color: 'white', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              SUB {myActivePokemon.substituteHp} HP
            </div>
          )}

          {/* Protect indicator — player side */}
          {myActivePokemon.protecting && (
            <div style={{
              position: 'absolute', bottom: '60px', left: '80px', zIndex: 20,
              background: 'rgba(34,197,94,0.85)', color: 'white', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }} className="animate-pulse">
              PROTECTED!
            </div>
          )}


          {/* Trap / Ingrain / Aqua Ring / Wish indicators — player side */}
          {myActivePokemon.trappedByMove !== null && (
            <div style={{
              position: 'absolute', bottom: '80px', left: '80px', zIndex: 20,
              background: 'rgba(220,38,38,0.85)', color: 'white', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              TRAPPED ({myActivePokemon.trappedTurnsRemaining})
            </div>
          )}
          {myActivePokemon.ingrainActive && (
            <div style={{
              position: 'absolute', bottom: '100px', left: '80px', zIndex: 20,
              background: 'rgba(34,197,94,0.85)', color: '#14532d', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              ROOTED
            </div>
          )}
          {myActivePokemon.aquaRingActive && (
            <div style={{
              position: 'absolute', bottom: '120px', left: '80px', zIndex: 20,
              background: 'rgba(59,130,246,0.85)', color: 'white', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              AQUA RING
            </div>
          )}
          {myWishActive && (
            <div style={{
              position: 'absolute', bottom: '140px', left: '80px', zIndex: 20,
              background: 'rgba(250,204,21,0.85)', color: '#713f12', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              WISH ({myWishTurns})
            </div>
          )}

          {/* Substitute indicator — opponent side */}
          {opponentActivePokemon.substituteHp > 0 && (
            <div style={{
              position: 'absolute', top: '120px', right: '180px', zIndex: 20,
              background: 'rgba(99,102,241,0.85)', color: 'white', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              SUB {opponentActivePokemon.substituteHp} HP
            </div>
          )}


          {/* Trap / Ingrain / Aqua Ring / Wish indicators — opponent side */}
          {opponentActivePokemon.trappedByMove !== null && (
            <div style={{
              position: 'absolute', top: '160px', right: '180px', zIndex: 20,
              background: 'rgba(220,38,38,0.85)', color: 'white', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              TRAPPED ({opponentActivePokemon.trappedTurnsRemaining})
            </div>
          )}
          {opponentActivePokemon.ingrainActive && (
            <div style={{
              position: 'absolute', top: '180px', right: '180px', zIndex: 20,
              background: 'rgba(34,197,94,0.85)', color: '#14532d', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              ROOTED
            </div>
          )}
          {opponentActivePokemon.aquaRingActive && (
            <div style={{
              position: 'absolute', top: '200px', right: '180px', zIndex: 20,
              background: 'rgba(59,130,246,0.85)', color: 'white', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              AQUA RING
            </div>
          )}
          {oppWishActive && (
            <div style={{
              position: 'absolute', top: '220px', right: '180px', zIndex: 20,
              background: 'rgba(250,204,21,0.85)', color: '#713f12', fontSize: '11px',
              fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
            }}>
              WISH ({oppWishTurns})
            </div>
          )}

          {/* "Waiting for opponent" overlay — battlefield only */}
          {showWaitingOverlay && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 15,
              }}
            >
              <p style={{ color: 'white', fontSize: '20px' }} className="animate-pulse">
                Waiting for opponent...
              </p>
            </div>
          )}
        </div>

        {/* ── HP bars + party indicators at canvas level (z-30) ── */}

        {/* Opponent: top-left of battlefield */}
        <div
          style={{
            position: 'absolute',
            top: '24px',
            left: '24px',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <PartyIndicator
            team={opponentState.team}
            activePokemonIndex={opponentState.activePokemonIndex}
            side="opponent"
          />
          <HPBar
            current={displayedHp[opponentPlayer]}
            max={opponentActivePokemon.maxHp}
            name={opponentActivePokemon.name}
            side="opponent"
          />
          <StatusBadge status={displayedStatus[opponentPlayer]} />
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {opponentActivePokemon.reflect && (
              <FieldEffectBadge label="REFLECT" turns={opponentActivePokemon.reflectTurnsRemaining} color="rgba(250,204,21,0.85)" />
            )}
            {opponentActivePokemon.lightScreen && (
              <FieldEffectBadge label="L.SCREEN" turns={opponentActivePokemon.lightScreenTurnsRemaining} color="rgba(167,139,250,0.85)" />
            )}
            {opponentActivePokemon.mistActive && (
              <FieldEffectBadge label="MIST" turns={opponentActivePokemon.mistTurnsRemaining} color="rgba(147,197,253,0.85)" />
            )}
          </div>
        </div>

        {/* Player: bottom-right of battlefield */}
        <div
          style={{
            position: 'absolute',
            bottom: `${PANEL_H + 24}px`,
            right: '24px',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px',
          }}
        >
          <PartyIndicator
            team={myState.team}
            activePokemonIndex={myState.activePokemonIndex}
            side="player"
          />
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {myActivePokemon.reflect && (
              <FieldEffectBadge label="REFLECT" turns={myActivePokemon.reflectTurnsRemaining} color="rgba(250,204,21,0.85)" />
            )}
            {myActivePokemon.lightScreen && (
              <FieldEffectBadge label="L.SCREEN" turns={myActivePokemon.lightScreenTurnsRemaining} color="rgba(167,139,250,0.85)" />
            )}
            {myActivePokemon.mistActive && (
              <FieldEffectBadge label="MIST" turns={myActivePokemon.mistTurnsRemaining} color="rgba(147,197,253,0.85)" />
            )}
          </div>
          <StatusBadge status={displayedStatus[player]} />
          <HPBar
            current={displayedHp[player]}
            max={myActivePokemon.maxHp}
            name={myActivePokemon.name}
            side="player"
          />
        </div>

        {/* Weather indicator — top right */}
        {weather !== 'none' && (
          <div style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            zIndex: 30,
            background: 'rgba(0,0,0,0.6)',
            padding: '4px 12px',
            borderRadius: '12px',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '14px' }}>{WEATHER_ICONS[weather]}</span>
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 'bold' }}>
              {WEATHER_LABELS[weather]} ({weatherTurnsRemaining})
            </span>
          </div>
        )}

        {/* Opponent selecting Pokemon overlay */}
        {waitingForOpponentSwitch && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
            }}
          >
            <p style={{ color: 'white', fontSize: '22px' }} className="animate-pulse">
              Opponent is selecting a Pokemon...
            </p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#dc2626',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              zIndex: 40,
            }}
          >
            {error}
          </div>
        )}

        {/* ── Action panel (800×200, y=400) ── */}
        <div
          style={{
            position: 'absolute',
            top: `${FIELD_H}px`,
            left: 0,
            width: `${CANVAS_W}px`,
            height: `${PANEL_H}px`,
            background: '#111827',
            borderTop: '4px solid #374151',
            zIndex: 1,
          }}
        >
          {/* Battle log */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '96px', padding: '4px 12px', overflowY: 'hidden' }}>
            <BattleLog log={visibleLog} />
          </div>

          {/* Action area */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '96px', padding: '4px 12px' }}>
            {(isFullyLocked && !myNeedsSwitch) || isPlaying ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '8px' }}>
                <p style={{ color: '#facc15', fontWeight: 'bold', fontSize: '16px' }} className="animate-pulse">
                  {myActivePokemon.name} {getLockReason()}
                </p>
                <p style={{ color: '#9ca3af', fontSize: '13px' }}>
                  Waiting for opponent...
                </p>
              </div>
            ) : myNeedsSwitch ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                <p style={{ color: '#facc15', fontWeight: 'bold', textAlign: 'center', fontSize: '14px' }}>
                  Choose your next Pokemon!
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {myState.team.map((pokemon, index) => (
                    <button
                      key={index}
                      onClick={() => handleSwitch(index)}
                      disabled={pokemon.fainted || index === myState.activePokemonIndex}
                      style={{
                        padding: '6px',
                        borderRadius: '8px',
                        border: `2px solid ${pokemon.fainted || index === myState.activePokemonIndex ? '#4b5563' : '#22c55e'}`,
                        background: pokemon.fainted || index === myState.activePokemonIndex ? '#374151' : '#14532d',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        opacity: pokemon.fainted || index === myState.activePokemonIndex ? 0.4 : 1,
                        cursor: pokemon.fainted || index === myState.activePokemonIndex ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {pokemon.name}
                      <span style={{ display: 'block', fontSize: '10px', opacity: 0.7, fontWeight: 'normal' }}>
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
                disabled={waitingForOpponent || waitingForOpponentSwitch}
              />
            ) : menuState === 'fight' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                <button
                  onClick={() => setMenuState('action')}
                  style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ← Back
                </button>
                <MoveMenu
                  moves={myActivePokemon.moves}
                  onMoveSelect={handleMoveSelect}
                  disabled={waitingForOpponent}
                  recharging={myPokemonRecharging}
                  activePokemon={myActivePokemon}
                />
              </div>
            ) : menuState === 'party' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                <button
                  onClick={() => setMenuState('action')}
                  style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ← Back
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {myState.team.map((pokemon, index) => (
                    <button
                      key={index}
                      onClick={() => handleSwitch(index)}
                      disabled={pokemon.fainted || index === myState.activePokemonIndex || waitingForOpponent}
                      style={{
                        padding: '6px',
                        borderRadius: '8px',
                        border: `2px solid ${pokemon.fainted || index === myState.activePokemonIndex ? '#4b5563' : '#3b82f6'}`,
                        background: pokemon.fainted || index === myState.activePokemonIndex ? '#374151' : '#1e3a5f',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        opacity: pokemon.fainted || index === myState.activePokemonIndex ? 0.4 : 1,
                        cursor: pokemon.fainted || index === myState.activePokemonIndex ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {pokemon.name}
                      <span style={{ display: 'block', fontSize: '10px', opacity: 0.7, fontWeight: 'normal' }}>
                        {pokemon.currentHp}/{pokemon.maxHp} HP
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
