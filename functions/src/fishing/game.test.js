import test from "node:test";
import assert from "node:assert/strict";
import {
    EQUIPMENT,
    FIGHT_RULES,
    FishingError,
    advanceFight,
    buyEquipment,
    buyStarterKit,
    createPlayer,
    ensureCurrentWeather,
    hookFish,
    moveFishToCollection,
    publicAttempt,
    refreshAttempt,
    restoreFishFromCollection,
    runFishingAction,
    sellAllFish,
    sellFish,
    selectVenue,
    startCast
} from "./game.js";

const deterministicRandom = value => () => value;

function readyPlayer(now = 1_800_000_000_000) {
    const player = createPlayer(now);
    buyStarterKit(player, now);
    return player;
}

function fightingPlayer(fishDirection) {
    const player = readyPlayer(1000);
    player.activeAttempt = {
        id: "fight-test",
        stage: "fight",
        fishId: "roach",
        fishMassGrams: 1000,
        fishDirection,
        distanceM: 50,
        fatigue: 0,
        tension: 45,
        fightLastTickAt: 1000,
        nextDirectionChangeAt: 10_000,
        specimenId: "specimen-test"
    };
    return player;
}

test("first-time player receives one 500-coin starter balance and buys a durable kit atomically", () => {
    const player = createPlayer(100);
    assert.equal(player.wallet, 500);

    buyStarterKit(player, 101);
    assert.equal(player.wallet, 0);
    assert.equal(player.bait.standard, 50);
    assert.deepEqual(Object.keys(player.equipment).sort(), ["hook", "line", "reel", "rod"]);
    assert.ok(Object.values(player.equipment).every(item => item.durability === 120));

    assert.throws(
        () => buyStarterKit(player, 102),
        error => error instanceof FishingError && error.code === "failed-precondition"
    );
});

test("starter purchases, venue gates, bait and inventory capacity are enforced server-side", () => {
    const player = readyPlayer();
    assert.throws(
        () => buyEquipment(player, "rod", "expert"),
        error => error instanceof FishingError && error.code === "failed-precondition"
    );
    assert.throws(
        () => selectVenue(player, "open-ocean"),
        error => error instanceof FishingError && error.code === "failed-precondition"
    );

    player.level = 35;
    player.wallet = 9000;
    selectVenue(player, "open-ocean", 200);
    buyEquipment(player, "rod", "expert", 1, 201);
    assert.equal(player.equipment.rod.id, "expert");
    assert.equal(player.wallet, 9000 - EQUIPMENT.rod.expert.price);

    player.bait.standard = 0;
    player.inventory = Array.from({ length: 50 }, (_, index) => ({ id: String(index) }));
    assert.throws(
        () => startCast(player, { weather: "clear", time: "day", now: 202, random: deterministicRandom(0.2), id: "attempt" }),
        error => error instanceof FishingError && error.code === "resource-exhausted"
    );
});

test("cast hides the fish, waits for its bite and opens the server-timed hook window", () => {
    const player = readyPlayer();
    startCast(player, {
        weather: "clear",
        time: "day",
        now: 1000,
        random: deterministicRandom(0),
        id: "server-attempt-id"
    });
    assert.equal(player.activeAttempt.stage, "waiting");
    assert.equal(publicAttempt(player.activeAttempt).fishId, undefined);

    refreshAttempt(player, 5999, deterministicRandom(0));
    assert.equal(player.activeAttempt.stage, "waiting");
    refreshAttempt(player, 6000, deterministicRandom(0));
    assert.equal(player.activeAttempt.stage, "hook");

    const fishId = player.activeAttempt.fishId;
    assert.ok(fishId);
    assert.equal(publicAttempt(player.activeAttempt).fishId, undefined);
});

test("missed hook window consumes bait and completes exactly one fishing attempt", () => {
    const player = readyPlayer();
    startCast(player, {
        weather: "clear",
        time: "day",
        now: 1000,
        random: deterministicRandom(0),
        id: "attempt"
    });
    refreshAttempt(player, 6801, deterministicRandom(0));
    assert.equal(player.activeAttempt, null);
    assert.equal(player.lastResult.outcome, "missed-hook");
    assert.equal(player.bait.standard, 49);
    assert.equal(player.attemptsCompleted, 1);
});

test("a fully server-driven first-catch fight grants a specimen and XP exactly once", () => {
    const player = readyPlayer();
    const initialBait = player.bait.standard;
    startCast(player, {
        weather: "clear",
        time: "day",
        now: 1000,
        random: deterministicRandom(0),
        id: "attempt"
    });
    refreshAttempt(player, 6000, deterministicRandom(0));
    hookFish(player, {
        now: 6100,
        random: deterministicRandom(0),
        specimenId: "server-specimen-id"
    });
    assert.equal(player.activeAttempt.stage, "fight");

    let now = 6100;
    for (let index = 0; index < 60 && player.activeAttempt; index++) {
        now += 2000;
        advanceFight(player, {
            tension: 45,
            reeling: true,
            now,
            random: deterministicRandom(0)
        });
    }

    assert.equal(player.activeAttempt, null);
    assert.equal(player.lastResult.outcome, "caught");
    assert.equal(player.inventory.length, 1);
    assert.equal(player.inventory[0].id, "server-specimen-id");
    assert.equal(player.discoveredSpecies[player.inventory[0].fishId], true);
    assert.equal(player.lastResult.reward.firstCatch, true);
    assert.ok(player.lastResult.reward.xp >= 65);
    assert.equal(player.bait.standard, initialBait - 1);
    assert.equal(player.attemptsCompleted, 1);
});

test("fish only approaches while the player correctly resists its direction", () => {
    const towardAndResisted = fightingPlayer("toward");
    advanceFight(towardAndResisted, {
        tension: 45,
        reeling: true,
        now: 2000,
        random: deterministicRandom(0.99)
    });
    assert.equal(
        towardAndResisted.activeAttempt.distanceM,
        50 - FIGHT_RULES.fishApproachMps - EQUIPMENT.reel.starter.reelBonusMps
    );
    assert.ok(towardAndResisted.activeAttempt.fatigue > 0);

    const towardUnresisted = fightingPlayer("toward");
    advanceFight(towardUnresisted, {
        tension: 45,
        reeling: false,
        now: 2000,
        random: deterministicRandom(0.99)
    });
    assert.equal(towardUnresisted.activeAttempt.distanceM, 50);

    const awayAndResisted = fightingPlayer("away");
    advanceFight(awayAndResisted, {
        tension: 45,
        reeling: true,
        now: 2000,
        random: deterministicRandom(0.99)
    });
    assert.equal(awayAndResisted.activeAttempt.distanceM, 50 - FIGHT_RULES.counterplayReelMps);

    const awayUnresisted = fightingPlayer("away");
    advanceFight(awayUnresisted, {
        tension: 45,
        reeling: false,
        now: 2000,
        random: deterministicRandom(0.99)
    });
    assert.ok(awayUnresisted.activeAttempt.distanceM > 50);
});

test("no-bite consumes bait only at the configured loss chance", () => {
    const player = readyPlayer();
    startCast(player, {
        weather: "clear",
        time: "day",
        now: 1000,
        random: deterministicRandom(0.95),
        id: "attempt"
    });
    refreshAttempt(player, player.activeAttempt.biteAt, deterministicRandom(0.99));
    assert.equal(player.lastResult.outcome, "no-bite");
    assert.equal(player.bait.standard, 50);
    assert.equal(player.attemptsCompleted, 1);
});

test("each sale and collection transfer verifies the specific owned specimen", () => {
    const player = readyPlayer();
    player.inventory = [
        { id: "one", fishId: "roach", name: "Плітка", price: 20, massGrams: 100 },
        { id: "two", fishId: "bream", name: "Лящ", price: 80, massGrams: 2000 }
    ];

    moveFishToCollection(player, "two", 300);
    assert.equal(player.collection[0].id, "two");
    assert.deepEqual(player.inventory.map(fish => fish.id), ["one"]);
    assert.throws(
        () => sellFish(player, "two"),
        error => error instanceof FishingError && error.code === "not-found"
    );

    restoreFishFromCollection(player, "two", 301);
    assert.equal(player.collection.length, 0);
    const sale = sellFish(player, "two", 302);
    assert.equal(sale.coins, 80);
    assert.equal(player.wallet, 80);
    const allSale = sellAllFish(player, 303);
    assert.equal(allSale.sold, 1);
    assert.equal(allSale.coins, 20);
    assert.equal(player.wallet, 100);
    assert.equal(player.inventory.length, 0);
});

test("weather stays stable during a cycle and rolls over once when the next starts", () => {
    const now = 1_800_000_000_000;
    const first = ensureCurrentWeather(null, now, deterministicRandom(0.99));
    const stable = ensureCurrentWeather(first, now + 1000, deterministicRandom(0));
    assert.equal(stable.weather, first.weather);
    const nextCycle = ensureCurrentWeather(first, first.cycleStartedAt + 900_000, deterministicRandom(0.99));
    assert.notEqual(nextCycle.cycle, first.cycle);
    assert.equal(nextCycle.weather, "storm");
});

test("fishing actions do not accept client-selected attempt and specimen identifiers", () => {
    const player = readyPlayer();
    const result = runFishingAction(player, "cast", { id: "client-chosen" }, {
        id: "server-generated",
        now: 1000,
        random: deterministicRandom(0),
        weather: "clear",
        time: "day"
    });
    assert.equal(result.player.activeAttempt.id, "server-generated");
});
