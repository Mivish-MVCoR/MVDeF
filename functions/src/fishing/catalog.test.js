import test from "node:test";
import assert from "node:assert/strict";
import {
    FISH,
    FISH_CATEGORIES,
    FISHING_RULES,
    TIME_PERIODS,
    VENUES,
    WEATHER_CHANCES,
    WEATHER_CYCLE_MS,
    getAvailableFishWeights,
    selectFish,
    validateFishingCatalog,
    xpRequiredForMaxLevel,
    xpToNextLevel
} from "./catalog.js";

test("catalog contains 65 valid species and every venue has weighted fish in each rarity", () => {
    assert.deepEqual(validateFishingCatalog(), []);
    assert.equal(Object.keys(FISH).length, 65);
    assert.deepEqual(Object.keys(VENUES), ["river", "lake", "sea", "ocean-pier", "open-ocean"]);
    assert.deepEqual(
        Object.values(FISH).reduce((counts, fish) => {
            counts[fish.category]++;
            return counts;
        }, { common: 0, exclusive: 0, epic: 0 }),
        { common: 50, exclusive: 10, epic: 5 }
    );
    for (const venue of Object.values(VENUES)) {
        for (const category of Object.keys(FISH_CATEGORIES)) {
            assert.ok(Object.keys(venue.weights[category]).length > 0);
        }
    }
});

test("weather/time conditions filter species without changing rarity chances", () => {
    const riverStormNightEpicWeights = getAvailableFishWeights("river", "epic", {
        weather: "storm",
        time: "night"
    });
    assert.ok(riverStormNightEpicWeights.some(([fishId]) => fishId === "megalodon"));
    assert.ok(riverStormNightEpicWeights.every(([, weight]) => weight > 0));

    assert.throws(
        () => getAvailableFishWeights("unknown-water", "common", { weather: "clear", time: "day" }),
        RangeError
    );
    assert.throws(
        () => getAvailableFishWeights("river", "unknown-rarity", { weather: "clear", time: "day" }),
        RangeError
    );

    const rng = () => 0.905;
    assert.equal(selectFish("lake", { weather: "clear", time: "day", random: rng }).category, "exclusive");
});

test("sharks and megalodon follow their venue and weather/time restrictions", () => {
    const fishIds = (venue, category, weather, time) =>
        getAvailableFishWeights(venue, category, { weather, time }).map(([fishId]) => fishId);

    assert.ok(!fishIds("open-ocean", "epic", "clear", "night").includes("tiger-shark"));
    assert.ok(!fishIds("open-ocean", "epic", "storm", "day").includes("megalodon"));
    assert.ok(fishIds("open-ocean", "epic", "storm", "night").includes("megalodon"));
    assert.ok(fishIds("open-ocean", "epic", "clear", "day").includes("anchor-fish"));
});

test("a deterministic 200,000-catch sample preserves the 90/7/3 rarity distribution", () => {
    let state = 73;
    const random = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x1_0000_0000;
    };
    const counts = { common: 0, exclusive: 0, epic: 0 };

    for (let i = 0; i < 200_000; i++) {
        const { category } = selectFish("river", {
            weather: "clear",
            time: "day",
            random
        });
        counts[category]++;
    }

    assert.ok(Math.abs(counts.common / 200_000 - 0.9) < 0.003);
    assert.ok(Math.abs(counts.exclusive / 200_000 - 0.07) < 0.003);
    assert.ok(Math.abs(counts.epic / 200_000 - 0.03) < 0.003);
});

test("published weather and rarity probabilities sum to 100 percent", () => {
    assert.equal(Object.values(WEATHER_CHANCES).reduce((sum, chance) => sum + chance, 0), 1);
    assert.equal(Object.values(FISH_CATEGORIES).reduce((sum, category) => sum + category.chance, 0), 1);
    assert.equal(WEATHER_CYCLE_MS, 900_000);
});

test("venue level gates and shared in-game time periods match the specification", () => {
    assert.deepEqual(
        Object.values(VENUES).map(({ id, unlockLevel }) => [id, unlockLevel]),
        [["river", 1], ["lake", 5], ["sea", 10], ["ocean-pier", 20], ["open-ocean", 35]]
    );
    assert.deepEqual(
        Object.values(TIME_PERIODS).map(({ startHour, endHour }) => [startHour, endHour]),
        [[5, 8], [8, 17], [17, 21], [21, 5]]
    );
});

test("level curve requires 88,014 XP and rejects invalid levels", () => {
    assert.equal(xpToNextLevel(1), 55);
    assert.equal(xpToNextLevel(249), 765);
    assert.equal(xpRequiredForMaxLevel(), 88_014);
    assert.throws(() => xpToNextLevel(0), RangeError);
    assert.throws(() => xpToNextLevel(250), RangeError);
});

test("starter equipment and inventory limits match the agreed baseline", () => {
    assert.equal(Object.values(FISHING_RULES.startingEquipmentCost)
        .filter(value => typeof value === "number" && value !== 500)
        .reduce((sum, value) => sum + value, 0), 500);
    assert.equal(FISHING_RULES.startingCoins, 500);
    assert.equal(FISHING_RULES.inventoryCapacity, 50);
    assert.equal(FISHING_RULES.collectionCapacity, 10);
});
