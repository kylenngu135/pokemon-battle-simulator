import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center h-screen bg-gray-950 gap-8">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-6xl font-black text-white tracking-tight">
          Pokémon
        </h1>
        <h2 className="text-2xl font-bold text-yellow-400 tracking-widest uppercase">
          Battle Simulator
        </h2>
        <p className="text-gray-400 text-center max-w-sm">
          Choose your team, select your moves, and battle it out in this Gen 1 Pokemon battle simulator.
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        <Link
          href="/team-builder"
          className="w-full text-center px-10 py-4 bg-red-600 hover:bg-red-500 text-white font-black text-xl rounded-xl tracking-widest uppercase transition-colors active:scale-95"
        >
          Create Lobby
        </Link>
        <Link
          href="/lobby/join"
          className="w-full text-center px-10 py-4 bg-gray-700 hover:bg-gray-600 text-white font-black text-xl rounded-xl tracking-widest uppercase transition-colors active:scale-95"
        >
          Join Lobby
        </Link>
      </div>
    </main>
  );
}
