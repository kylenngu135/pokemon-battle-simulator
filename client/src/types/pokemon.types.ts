export interface Pokemon {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    back_default: string | null;
  };
  types: { slot: number; type: { name: string; url: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
  moves: { move: { name: string; url: string } }[];
}

export interface PokemonListItem {
  name: string;
  url: string;
}

export interface Move {
  id: number;
  name: string;
  pp: number;
  power: number | null;
  accuracy: number | null;
  type: { name: string };
  damage_class: { name: string };
}

export interface TeamEntry {
  pokemonId: number;
  moves: number[];
}

export interface SelectedPokemon {
  pokemon: Pokemon;
  moves: Move[];
}
