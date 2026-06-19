const POKEMON = [
    { id: 6, name: 'Charizard' },
    { id: 25, name: 'Pikachu' },
    { id: 131, name: 'Lapras' },
    { id: 94, name: 'Gengar' },
    { id: 143, name: 'Snorlax' },
    { id: 149, name: 'Dragonite' },
    { id: 9, name: 'Blastoise' },
    { id: 65, name: 'Alakazam' },
    { id: 112, name: 'Rhydon' },
    { id: 130, name: 'Gyarados' },
    { id: 59, name: 'Arcanine' },
    { id: 150, name: 'Mewtwo' },
];

const getLearnsets = async (): Promise<void> => {
    for (const p of POKEMON) {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.id}`);
        const data = await res.json() as any;
        const gen1Moves = data.moves
            .filter((m: any) =>
                m.version_group_details.some((v: any) =>
                    v.version_group.name === 'red-blue' || v.version_group.name === 'yellow'
                )
            )
            .map((m: any) => ({
                name: m.move.name,
                id: parseInt(m.move.url.split('/').filter(Boolean).pop()),
            }));
        console.log(`\n${p.name}:`, JSON.stringify(gen1Moves, null, 2));
    }
};

getLearnsets();
