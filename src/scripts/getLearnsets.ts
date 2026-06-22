const getLearnsets = async (): Promise<void> => {
    for (let id = 1; id <= 151; id++) {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        const data = await res.json() as { name: string; moves: { move: { name: string; url: string }; version_group_details: { version_group: { name: string } }[] }[] };
        const gen1Moves = data.moves
            .filter((m) =>
                m.version_group_details.some((v) =>
                    v.version_group.name === 'red-blue' || v.version_group.name === 'yellow'
                )
            )
            .map((m) => ({
                name: m.move.name,
                id: parseInt(m.move.url.split('/').filter(Boolean).pop() ?? '0'),
            }));
        console.log(`\n#${id} ${data.name}:`, JSON.stringify(gen1Moves));
    }
};

getLearnsets();
