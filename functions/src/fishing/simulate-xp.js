import {
    FISH_CATEGORIES,
    VENUES,
    pickWeighted,
    selectFish,
    xpToNextLevel
} from "./catalog.js";

const CATCH_COUNT = 3000;
const RUN_COUNT = 100;
const LEVEL_VENUES = Object.values(VENUES).sort((left, right) => left.unlockLevel - right.unlockLevel);

function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x1_0000_0000;
    };
}

function selectVenue(level) {
    return LEVEL_VENUES.filter(venue => venue.unlockLevel <= level).at(-1);
}

function runSimulation(seed) {
    const random = createRandom(seed);
    const discoveredFish = new Set();
    let totalXp = 0;
    let levelXp = 0;
    let level = 1;
    let firstCatchBonuses = 0;

    for (let catchNumber = 0; catchNumber < CATCH_COUNT; catchNumber++) {
        const venue = selectVenue(level);
        const { fish, category: categoryId } = selectFish(venue.id, {
            weather: "clear",
            time: "day",
            random
        });
        const fishId = fish.id;
        const normalizedMass = (random() + random()) / 2;
        const massFactor = 0.75 + normalizedMass * 0.75;
        const catchXp = Math.round(FISH_CATEGORIES[categoryId].baseXp * massFactor);
        const firstCatchBonus = discoveredFish.has(fishId) ? 0 : 50;
        if (firstCatchBonus) firstCatchBonuses++;
        discoveredFish.add(fishId);
        totalXp += catchXp + firstCatchBonus;
        levelXp += catchXp + firstCatchBonus;

        while (level < 250 && levelXp >= xpToNextLevel(level)) {
            levelXp -= xpToNextLevel(level);
            level++;
        }
        if (level === 250) levelXp = 0;
    }

    return { totalXp, level, levelXp, firstCatchBonuses, discoveredSpecies: discoveredFish.size };
}

const results = Array.from({ length: RUN_COUNT }, (_, index) => runSimulation(index + 1));
const sortedXp = results.map(result => result.totalXp).sort((left, right) => left - right);
const sortedLevels = results.map(result => result.level).sort((left, right) => left - right);
const median = values => values[Math.floor(values.length / 2)];

console.log(JSON.stringify({
    catchesPerRun: CATCH_COUNT,
    runs: RUN_COUNT,
    xp: { min: sortedXp[0], median: median(sortedXp), max: sortedXp.at(-1) },
    level: { min: sortedLevels[0], median: median(sortedLevels), max: sortedLevels.at(-1) },
    medianFirstCatchBonuses: median(results.map(result => result.firstCatchBonuses)),
    medianDiscoveredSpecies: median(results.map(result => result.discoveredSpecies)),
    medianXpRemainingAtLevel: median(results.map(result => result.levelXp))
}, null, 2));
