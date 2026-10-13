import {
    FISH,
    FISH_CATEGORIES,
    FISHING_RULES,
    TIME_PERIODS,
    VENUES,
    WEATHER_CHANCES,
    WEATHER_CYCLE_MS,
    WEATHER_FISH_MULTIPLIERS,
    TIME_FISH_MULTIPLIERS,
    pickWeighted,
    selectFish,
    xpToNextLevel
} from "./catalog.js";

const INITIAL_DURABILITY = FISHING_RULES.wear.durability;
const MAX_FIGHT_STEP_MS = 2000;
const IDEAL_TENSION_MIN = 30;
const IDEAL_TENSION_MAX = 60;
const WEATHER_CYCLE_EPOCH = Date.UTC(2026, 0, 1);

export const EQUIPMENT = Object.freeze({
    rod: Object.freeze({
        starter: Object.freeze({ name: "Початкова вудка", price: 100, maxFishMassKg: 2, tensionControl: 0, fatigueBonus: 0 }),
        light: Object.freeze({ name: "Легка вудка", price: 250, maxFishMassKg: 5, tensionControl: 0.03, fatigueBonus: 0.03 }),
        universal: Object.freeze({ name: "Універсальна вудка", price: 500, maxFishMassKg: 10, tensionControl: 0.06, fatigueBonus: 0.06 }),
        medium: Object.freeze({ name: "Середня вудка", price: 1000, maxFishMassKg: 20, tensionControl: 0.09, fatigueBonus: 0.09 }),
        reinforced: Object.freeze({ name: "Посилена вудка", price: 2000, maxFishMassKg: 35, tensionControl: 0.12, fatigueBonus: 0.12 }),
        professional: Object.freeze({ name: "Професійна вудка", price: 4000, maxFishMassKg: 50, tensionControl: 0.15, fatigueBonus: 0.15 }),
        expert: Object.freeze({ name: "Експертна вудка", price: 8000, maxFishMassKg: 70, tensionControl: 0.18, fatigueBonus: 0.18 })
    }),
    line: Object.freeze({
        starter: Object.freeze({ name: "Початкова волосінь", price: 40, loadKg: 3 }),
        light: Object.freeze({ name: "Легка волосінь", price: 100, loadKg: 8 }),
        medium: Object.freeze({ name: "Середня волосінь", price: 220, loadKg: 18 }),
        reinforced: Object.freeze({ name: "Посилена волосінь", price: 450, loadKg: 35 }),
        professional: Object.freeze({ name: "Професійна волосінь", price: 800, loadKg: 55 }),
        expert: Object.freeze({ name: "Експертна волосінь", price: 1400, loadKg: 80 })
    }),
    reel: Object.freeze({
        starter: Object.freeze({ name: "Початкова котушка", price: 80, reelBonusMps: 0.2, tensionControl: 0.05, loadBonus: 0.05 }),
        ordinary: Object.freeze({ name: "Звичайна котушка", price: 200, reelBonusMps: 0.5, tensionControl: 0.1, loadBonus: 0.1 }),
        professional: Object.freeze({ name: "Професійна котушка", price: 600, reelBonusMps: 1, tensionControl: 0.2, loadBonus: 0.2 })
    }),
    hook: Object.freeze({
        starter: Object.freeze({ name: "Початковий гачок", price: 30, hookChance: 0.7 }),
        quality: Object.freeze({ name: "Якісний гачок", price: 100, hookChance: 0.8 }),
        professional: Object.freeze({ name: "Професійний гачок", price: 250, hookChance: 0.9 })
    }),
    bait: Object.freeze({
        standard: Object.freeze({ name: "Звичайна наживка", price: 5, lostOnNoBiteChance: 0.05 }),
        quality: Object.freeze({ name: "Якісна наживка", price: 15, lostOnNoBiteChance: 0.02 }),
        premium: Object.freeze({ name: "Преміальна наживка", price: 35, lostOnNoBiteChance: 0.01 })
    })
});

export const WEATHER_LABELS = Object.freeze({
    clear: "Ясно",
    cloudy: "Хмарно",
    rain: "Дощ",
    fog: "Туман",
    storm: "Шторм"
});

export const FIGHT_RULES = Object.freeze({
    initialDistanceM: FISHING_RULES.fight.startingDistanceM,
    counterplayReelMps: FISHING_RULES.fight.counterplayReelMps,
    fishApproachMps: FISHING_RULES.fight.fishApproachMps,
    tensionIdealMin: IDEAL_TENSION_MIN,
    tensionIdealMax: IDEAL_TENSION_MAX,
    fishDirectionIntervalMinMs: 2000,
    fishDirectionIntervalMaxMs: 4000,
    fatiguePerSecond: 1.7,
    fatigueBonusMax: 0.18,
    missChance: FISHING_RULES.cast.biteChance === 1 ? 0 : 0.1,
    maxStepMs: MAX_FIGHT_STEP_MS
});

export class FishingError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "FishingError";
        this.code = code;
    }
}

function fail(code, message) {
    throw new FishingError(code, message);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function requirePlayer(player) {
    if (!player || typeof player !== "object") fail("failed-precondition", "Спершу завантаж профіль рибалки.");
    return player;
}

export function createPlayer(now = Date.now()) {
    return {
        schemaVersion: 1,
        wallet: FISHING_RULES.startingCoins,
        level: 1,
        xp: 0,
        totalXp: 0,
        selectedVenueId: "river",
        inventory: [],
        collection: [],
        discoveredSpecies: {},
        equipment: {},
        bait: {},
        attemptsCompleted: 0,
        catches: 0,
        bestCatch: null,
        activeAttempt: null,
        lastResult: null,
        createdAt: now,
        updatedAt: now
    };
}

export function createWorldWeather(now = Date.now(), random = Math.random) {
    const cycle = Math.floor((now - WEATHER_CYCLE_EPOCH) / WEATHER_CYCLE_MS);
    const weather = pickWeighted(Object.entries(WEATHER_CHANCES), random);
    return {
        cycle,
        weather,
        cycleStartedAt: WEATHER_CYCLE_EPOCH + cycle * WEATHER_CYCLE_MS,
        updatedAt: now
    };
}

export function currentGameTime(now = Date.now()) {
    const date = new Date(now);
    const hour = date.getUTCHours();
    const period = Object.entries(TIME_PERIODS).find(([, value]) =>
        value.startHour < value.endHour
            ? hour >= value.startHour && hour < value.endHour
            : hour >= value.startHour || hour < value.endHour
    )?.[0];
    return { hour, period: period || "night" };
}

export function ensureCurrentWeather(current, now = Date.now(), random = Math.random) {
    const currentCycle = Math.floor((now - WEATHER_CYCLE_EPOCH) / WEATHER_CYCLE_MS);
    if (current && current.cycle === currentCycle && current.weather in WEATHER_CHANCES) return current;
    return createWorldWeather(now, random);
}

export function getLevelProgress(player) {
    if (player.level >= FISHING_RULES.xp.maxLevel) {
        return { level: FISHING_RULES.xp.maxLevel, xp: 0, xpToNextLevel: 0 };
    }
    return {
        level: player.level,
        xp: player.xp,
        xpToNextLevel: xpToNextLevel(player.level)
    };
}

export function publicAttempt(attempt) {
    if (!attempt) return null;
    const {
        fishId: _fishId,
        fishMassGrams: _fishMassGrams,
        fightLastTickAt: _fightLastTickAt,
        nextDirectionChangeAt: _nextDirectionChangeAt,
        ...visible
    } = attempt;
    return visible;
}

export function publicPlayer(player) {
    const safe = clone(player);
    safe.activeAttempt = publicAttempt(safe.activeAttempt);
    return safe;
}

export function publicWorld(weather, now = Date.now()) {
    const gameTime = currentGameTime(now);
    return {
        weather: weather.weather,
        weatherLabel: WEATHER_LABELS[weather.weather],
        weatherCycleEndsAt: weather.cycleStartedAt + WEATHER_CYCLE_MS,
        gameTime,
        timeLabel: TIME_PERIODS[gameTime.period].label
    };
}

function newEquipmentItem(slot, type, now) {
    const definition = EQUIPMENT[slot]?.[type];
    if (!definition) fail("invalid-argument", "Обраний предмет спорядження не знайдено.");
    return { id: type, durability: INITIAL_DURABILITY, acquiredAt: now };
}

function currentEquipment(player, slot) {
    const item = player.equipment?.[slot];
    if (!item || item.durability <= 0) fail("failed-precondition", `Потрібна справна деталь: ${slot}.`);
    const definition = EQUIPMENT[slot]?.[item.id];
    if (!definition) fail("failed-precondition", `Дані спорядження «${slot}» пошкоджені.`);
    return { item, definition };
}

function finishAttempt(player, result, now, random, { catchData = null, baitConsumed = true } = {}) {
    const attempt = player.activeAttempt;
    if (!attempt) fail("failed-precondition", "Активної спроби риболовлі немає.");

    if (baitConsumed) {
        const bait = player.bait[attempt.baitId];
        if (bait > 0) player.bait[attempt.baitId] = bait - 1;
    }

    player.attemptsCompleted++;
    if (player.attemptsCompleted >= FISHING_RULES.wear.freeAttempts + 1) {
        for (const item of Object.values(player.equipment)) {
            if (item && item.durability > 0) {
                item.durability = Math.max(0, item.durability - FISHING_RULES.wear.fixedWearPerAttempt);
            }
        }
    }

    let reward = null;
    if (catchData) {
        if (player.inventory.length >= FISHING_RULES.inventoryCapacity) {
            fail("resource-exhausted", "Інвентар повний. Звільни місце до наступного закидання.");
        }
        const fish = FISH[catchData.fishId];
        const firstCatch = !player.discoveredSpecies[fish.id];
        const massRatio = (catchData.massGrams - fish.minMassGrams) / (fish.maxMassGrams - fish.minMassGrams);
        const massMultiplier = Math.max(0, Math.min(1, massRatio));
        const xpMultiplier = 0.75 + massMultiplier * 0.75;
        const baseXp = FISH_CATEGORIES[fish.category].baseXp;
        const catchXp = Math.round(baseXp * xpMultiplier) + (firstCatch ? FISHING_RULES.xp.firstCatchOfSpecies : 0);
        const valueRatio = Math.max(0, Math.min(1, massRatio));
        const price = Math.round(fish.minPrice + (fish.maxPrice - fish.minPrice) * valueRatio);
        const specimen = {
            id: catchData.specimenId,
            fishId: fish.id,
            name: fish.name,
            category: fish.category,
            massGrams: catchData.massGrams,
            price,
            caughtAt: now
        };

        player.inventory.push(specimen);
        player.discoveredSpecies[fish.id] = true;
        player.catches++;
        if (!player.bestCatch || specimen.massGrams > player.bestCatch.massGrams) {
            player.bestCatch = { fishId: fish.id, name: fish.name, massGrams: specimen.massGrams };
        }

        player.totalXp += catchXp;
        player.xp += catchXp;
        while (player.level < FISHING_RULES.xp.maxLevel && player.xp >= xpToNextLevel(player.level)) {
            player.xp -= xpToNextLevel(player.level);
            player.level++;
        }
        if (player.level >= FISHING_RULES.xp.maxLevel) {
            player.level = FISHING_RULES.xp.maxLevel;
            player.xp = 0;
        }

        reward = { specimen, firstCatch, xp: catchXp, level: player.level };
    }

    player.lastResult = {
        ...result,
        baitId: attempt.baitId,
        baitConsumed,
        completedAt: now,
        reward
    };
    player.activeAttempt = null;
    return player.lastResult;
}

export function buyStarterKit(player, now = Date.now()) {
    requirePlayer(player);
    if (player.attemptsCompleted !== 0 || Object.keys(player.equipment).length !== 0) {
        fail("failed-precondition", "Стартовий набір можна придбати лише один раз.");
    }
    const cost = FISHING_RULES.startingEquipmentCost.total;
    if (player.wallet < cost) fail("failed-precondition", "Недостатньо монет для стартового набору.");

    player.wallet -= cost;
    for (const slot of ["rod", "line", "reel", "hook"]) {
        const id = FISHING_RULES.initialEquipment[slot];
        player.equipment[slot] = newEquipmentItem(slot, id, now);
    }
    const bait = FISHING_RULES.initialEquipment.bait;
    player.bait[bait.id] = (player.bait[bait.id] || 0) + bait.quantity;
    player.updatedAt = now;
    return player;
}

export function selectVenue(player, venueId, now = Date.now()) {
    requirePlayer(player);
    const venue = VENUES[venueId];
    if (!venue) fail("invalid-argument", "Такої водойми немає.");
    if (player.level < venue.unlockLevel) fail("failed-precondition", `Ця водойма відкриється на ${venue.unlockLevel} рівні.`);
    if (player.activeAttempt) fail("failed-precondition", "Заверши поточну рибальську спробу перед зміною водойми.");
    player.selectedVenueId = venueId;
    player.updatedAt = now;
    return player;
}

export function buyEquipment(player, slot, itemId, quantity = 1, now = Date.now()) {
    requirePlayer(player);
    const item = EQUIPMENT[slot]?.[itemId];
    if (!item || !["rod", "line", "reel", "hook", "bait"].includes(slot)) {
        fail("invalid-argument", "Предмет у крамниці не знайдено.");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        fail("invalid-argument", "Кількість має бути від 1 до 100.");
    }
    if (player.activeAttempt) fail("failed-precondition", "Не можна купувати спорядження під час риболовлі.");
    const totalPrice = item.price * quantity;
    if (player.wallet < totalPrice) fail("failed-precondition", "Недостатньо монет для покупки.");

    player.wallet -= totalPrice;
    if (slot === "bait") {
        player.bait[itemId] = (player.bait[itemId] || 0) + quantity;
    } else {
        player.equipment[slot] = newEquipmentItem(slot, itemId, now);
    }
    player.updatedAt = now;
    return player;
}

export function startCast(player, { weather, time, now = Date.now(), random = Math.random, id }) {
    requirePlayer(player);
    if (player.activeAttempt) fail("failed-precondition", "У тебе вже є активна спроба риболовлі.");
    if (player.inventory.length >= FISHING_RULES.inventoryCapacity) {
        fail("resource-exhausted", "Інвентар повний. Продай улов або перемісти рибу до колекції.");
    }
    const venue = VENUES[player.selectedVenueId];
    if (!venue || player.level < venue.unlockLevel) fail("failed-precondition", "Обрана водойма ще недоступна.");
    const rod = currentEquipment(player, "rod");
    currentEquipment(player, "line");
    currentEquipment(player, "reel");
    currentEquipment(player, "hook");
    const baitId = Object.keys(EQUIPMENT.bait).find(key => player.bait[key] > 0);
    if (!baitId) fail("failed-precondition", "Немає наживки. Купи наживку на ринку.");

    const waitMs = nextBiteDelay(random);
    const hasBite = random() < FISHING_RULES.cast.biteChance;
    const selected = hasBite
        ? selectFish(venue.id, { weather, time, random })
        : null;
    const fish = selected?.fish;
    const massRatio = fish ? (random() + random()) / 2 : null;
    const massGrams = fish
        ? Math.round(fish.minMassGrams + massRatio * (fish.maxMassGrams - fish.minMassGrams))
        : null;
    const nextDirectionChangeAt = now + Math.floor(2000 + random() * 2001);

    player.activeAttempt = {
        id,
        venueId: venue.id,
        stage: "waiting",
        startedAt: now,
        biteAt: now + waitMs,
        hookDeadline: now + waitMs + FISHING_RULES.cast.hookWindowMs,
        hasBite,
        baitId,
        fishId: fish?.id || null,
        fishMassGrams: massGrams,
        distanceM: FIGHT_RULES.initialDistanceM,
        fatigue: 0,
        tension: 0,
        fishDirection: random() < 0.5 ? "toward" : "away",
        nextDirectionChangeAt,
        fightLastTickAt: null,
        fightStartedAt: null,
        durabilityAtFightStart: null
    };
    player.updatedAt = now;
    return player;
}

export function refreshAttempt(player, now = Date.now(), random = Math.random) {
    requirePlayer(player);
    const attempt = player.activeAttempt;
    if (!attempt) return player;

    if (attempt.stage === "hook") {
        if (now < attempt.hookDeadline) return player;
        finishAttempt(player, { outcome: "missed-hook" }, now, random);
        player.updatedAt = now;
        return player;
    }

    if (attempt.stage !== "waiting") return player;

    if (now < attempt.biteAt) return player;
    if (attempt.hasBite) {
        attempt.stage = "hook";
        attempt.hookPromptAt = now;
        attempt.hookDeadline = now + FISHING_RULES.cast.hookWindowMs;
        player.updatedAt = now;
        return player;
    }
    finishAttempt(
        player,
        { outcome: attempt.hasBite ? "missed-hook" : "no-bite" },
        now,
        random,
        {
            baitConsumed: attempt.hasBite || random() < EQUIPMENT.bait[attempt.baitId].lostOnNoBiteChance
        }
    );
    player.updatedAt = now;
    return player;
}

export function hookFish(player, { now = Date.now(), random = Math.random, specimenId }) {
    requirePlayer(player);
    const attempt = player.activeAttempt;
    if (!attempt || attempt.stage !== "hook") fail("failed-precondition", "Зараз немає клювання для підсікання.");
    if (now >= attempt.hookDeadline) {
        finishAttempt(player, { outcome: "missed-hook" }, now, random);
        player.updatedAt = now;
        return player;
    }

    const hook = currentEquipment(player, "hook");
    const rod = currentEquipment(player, "rod");
    const line = currentEquipment(player, "line");
    const reel = currentEquipment(player, "reel");
    const hookWear = Math.max(0, Math.min(1, hook.item.durability / INITIAL_DURABILITY));
    const hookChance = Math.max(0, Math.min(1, hook.definition.hookChance * hookWear));
    if (random() >= hookChance) {
        finishAttempt(player, { outcome: "failed-hook" }, now, random);
        player.updatedAt = now;
        return player;
    }

    const fish = FISH[attempt.fishId];
    const massKg = attempt.fishMassGrams / 1000;
    const rodWear = rod.item.durability / INITIAL_DURABILITY;
    const rodLimitKg = rod.definition.maxFishMassKg * Math.max(0.1, rodWear);
    if (massKg > rod.definition.maxFishMassKg) {
        rod.item.durability = 0;
        finishAttempt(player, { outcome: "rod-broken", fishName: fish.name }, now, random);
        player.updatedAt = now;
        return player;
    }

    const fishStrengthKg = massKg * (1 + (fish.category === "epic" ? 0.6 : fish.category === "exclusive" ? 0.3 : 0));
    const lineCapacityKg = line.definition.loadKg * (1 + reel.definition.loadBonus * reel.item.durability / INITIAL_DURABILITY);
    attempt.durabilityAtFightStart = {
        rod: rod.item.durability,
        line: line.item.durability,
        reel: reel.item.durability,
        hook: hook.item.durability
    };
    attempt.loadRatio = fishStrengthKg / Math.max(0.1, Math.min(lineCapacityKg, rodLimitKg));
    attempt.stage = "fight";
    attempt.fightStartedAt = now;
    attempt.fightLastTickAt = now;
    attempt.nextDirectionChangeAt = now + Math.floor(2000 + random() * 2001);
    attempt.specimenId = specimenId;
    attempt.tension = 45;
    player.updatedAt = now;
    return player;
}

function applyAdditionalWear(player, slot, amount) {
    const item = player.equipment[slot];
    if (!item || item.durability <= 0) return;
    item.durability = Math.max(0, item.durability - amount);
}

function nextBiteDelay(random) {
    const { minWaitMs, maxWaitMs } = FISHING_RULES.cast;
    return Math.floor(minWaitMs + random() * (maxWaitMs - minWaitMs + 1));
}

export function advanceFight(player, { tension, reeling, now = Date.now(), random = Math.random }) {
    requirePlayer(player);
    const attempt = player.activeAttempt;
    if (!attempt || attempt.stage !== "fight") fail("failed-precondition", "Зараз немає активної боротьби з рибою.");
    if (!Number.isFinite(tension) || tension < 0 || tension > 100 || typeof reeling !== "boolean") {
        fail("invalid-argument", "Некоректні параметри натягу волосіні.");
    }

    const elapsedMs = Math.max(0, Math.min(MAX_FIGHT_STEP_MS, now - attempt.fightLastTickAt));
    if (elapsedMs === 0) return player;
    const elapsed = elapsedMs / 1000;
    attempt.fightLastTickAt = now;
    attempt.tension = tension;

    while (now >= attempt.nextDirectionChangeAt) {
        attempt.fishDirection = attempt.fishDirection === "toward" ? "away" : "toward";
        attempt.nextDirectionChangeAt += Math.floor(2000 + random() * 2001);
    }

    const rod = currentEquipment(player, "rod");
    const line = currentEquipment(player, "line");
    const reel = currentEquipment(player, "reel");
    currentEquipment(player, "hook");
    const controlWear = Math.max(0, Math.min(1, rod.item.durability / INITIAL_DURABILITY));
    const reelWear = Math.max(0, Math.min(1, reel.item.durability / INITIAL_DURABILITY));
    const ideal = tension >= IDEAL_TENSION_MIN && tension <= IDEAL_TENSION_MAX;
    const yellow = tension > IDEAL_TENSION_MAX && tension <= 85;
    const red = tension > 85;
    const fishKg = attempt.fishMassGrams / 1000;
    const rodLimit = rod.definition.maxFishMassKg * Math.max(0.1, controlWear);
    const lineLimit = line.definition.loadKg * (1 + reel.definition.loadBonus * reelWear);
    const effectiveLoadLimit = Math.max(0.1, Math.min(rodLimit, lineLimit));
    const loadRatio = fishKg / effectiveLoadLimit;
    const tensionFactor = Math.max(0.1, tension / 60);

    if (yellow) {
        applyAdditionalWear(player, "line", 120 * 0.0025 * elapsed);
        applyAdditionalWear(player, "reel", 120 * 0.0025 * elapsed);
    } else if (red) {
        applyAdditionalWear(player, "line", 120 * 0.02 * elapsed);
        applyAdditionalWear(player, "reel", 120 * 0.02 * elapsed);
        applyAdditionalWear(player, "rod", 2 * elapsed);
    }

    const lineWear = player.equipment.line.durability / INITIAL_DURABILITY;
    const breakChancePerSecond = red
        ? Math.min(0.35, 0.03 * Math.max(1, loadRatio) / Math.max(0.15, lineWear))
        : Math.max(0, loadRatio - 0.8) * 0.04 / Math.max(0.15, lineWear);
    const lineBreakChance = 1 - (1 - Math.min(0.99, breakChancePerSecond)) ** elapsed;
    if (player.equipment.rod.durability <= 0 || player.equipment.line.durability <= 0 ||
        player.equipment.reel.durability <= 0 || random() < lineBreakChance) {
        if (random() < 0.35) applyAdditionalWear(player, "line", player.equipment.line.durability);
        finishAttempt(player, { outcome: "broken-equipment" }, now, random);
        player.updatedAt = now;
        return player;
    }

    const massResistance = Math.min(2.2, 0.45 + fishKg / 12);
    const fishPull = Math.max(0.35, massResistance * (1 - attempt.fatigue / 150));
    if (ideal && reeling) {
        attempt.distanceM -= attempt.fishDirection === "toward"
            ? (FIGHT_RULES.fishApproachMps + reel.definition.reelBonusMps * reelWear) * elapsed
            : FIGHT_RULES.counterplayReelMps * elapsed;
    } else if (attempt.fishDirection === "away") {
        attempt.distanceM += fishPull * elapsed;
    }

    if (ideal && reeling) {
        const fatigueGain = FIGHT_RULES.fatiguePerSecond *
            (1 + rod.definition.fatigueBonus * controlWear) *
            Math.max(0.25, 1.2 - loadRatio * 0.25);
        attempt.fatigue = Math.min(100, attempt.fatigue + fatigueGain * elapsed);
    } else if (!reeling || red) {
        attempt.fatigue = Math.max(0, attempt.fatigue - 0.7 * elapsed);
    }

    attempt.distanceM = Math.max(0, Math.min(100, attempt.distanceM));
    if (attempt.distanceM <= 0) {
        const fish = FISH[attempt.fishId];
        finishAttempt(
            player,
            { outcome: "caught", fishName: fish.name },
            now,
            random,
            { catchData: { fishId: fish.id, massGrams: attempt.fishMassGrams, specimenId: attempt.specimenId } }
        );
    }
    player.updatedAt = now;
    return player;
}

export function stopFight(player, now = Date.now(), random = Math.random) {
    requirePlayer(player);
    if (!player.activeAttempt || player.activeAttempt.stage !== "fight") {
        fail("failed-precondition", "Немає боротьби, яку можна припинити.");
    }
    finishAttempt(player, { outcome: "released" }, now, random);
    player.updatedAt = now;
    return player;
}

export function sellFish(player, specimenId, now = Date.now()) {
    requirePlayer(player);
    if (player.activeAttempt) fail("failed-precondition", "Заверши риболовлю перед продажем улову.");
    const index = player.inventory.findIndex(specimen => specimen.id === specimenId);
    if (index < 0) fail("not-found", "Цей екземпляр не знайдено в інвентарі.");
    const [specimen] = player.inventory.splice(index, 1);
    player.wallet += specimen.price;
    player.updatedAt = now;
    return { sold: 1, coins: specimen.price, specimen };
}

export function sellAllFish(player, now = Date.now()) {
    requirePlayer(player);
    if (player.activeAttempt) fail("failed-precondition", "Заверши риболовлю перед продажем улову.");
    if (player.inventory.length === 0) fail("failed-precondition", "В інвентарі немає риби для продажу.");
    const sold = player.inventory.splice(0);
    const coins = sold.reduce((sum, specimen) => sum + specimen.price, 0);
    player.wallet += coins;
    player.updatedAt = now;
    return { sold: sold.length, coins };
}

export function moveFishToCollection(player, specimenId, now = Date.now()) {
    requirePlayer(player);
    if (player.activeAttempt) fail("failed-precondition", "Заверши риболовлю перед зміною колекції.");
    if (player.collection.length >= FISHING_RULES.collectionCapacity) {
        fail("resource-exhausted", "Колекція заповнена.");
    }
    const index = player.inventory.findIndex(specimen => specimen.id === specimenId);
    if (index < 0) fail("not-found", "Екземпляр для колекції не знайдено в інвентарі.");
    const [specimen] = player.inventory.splice(index, 1);
    player.collection.push(specimen);
    player.collection.sort((left, right) => right.price - left.price);
    player.updatedAt = now;
    return player;
}

export function restoreFishFromCollection(player, specimenId, now = Date.now()) {
    requirePlayer(player);
    if (player.activeAttempt) fail("failed-precondition", "Заверши риболовлю перед зміною колекції.");
    if (player.inventory.length >= FISHING_RULES.inventoryCapacity) {
        fail("resource-exhausted", "Інвентар повний.");
    }
    const index = player.collection.findIndex(specimen => specimen.id === specimenId);
    if (index < 0) fail("not-found", "Екземпляр у колекції не знайдено.");
    const [specimen] = player.collection.splice(index, 1);
    player.inventory.push(specimen);
    player.updatedAt = now;
    return player;
}

export function runFishingAction(player, action, payload = {}, context = {}) {
    const current = clone(requirePlayer(player));
    const now = context.now ?? Date.now();
    const random = context.random ?? Math.random;
    let result;

    switch (action) {
        case "buyStarterKit":
            result = buyStarterKit(current, now);
            break;
        case "buyEquipment":
            result = buyEquipment(current, payload.slot, payload.itemId, payload.quantity ?? 1, now);
            break;
        case "selectVenue":
            result = selectVenue(current, payload.venueId, now);
            break;
        case "cast":
            result = startCast(current, { ...context, id: context.id, now, random });
            break;
        case "refresh":
            result = refreshAttempt(current, now, random);
            break;
        case "hook":
            if (!current.activeAttempt) {
                fail("failed-precondition", "Зараз немає активної спроби риболовлі.");
            }
            refreshAttempt(current, now, random);
            if (current.activeAttempt?.stage === "waiting") {
                const waitMs = nextBiteDelay(random);
                current.activeAttempt.startedAt = now;
                current.activeAttempt.biteAt = now + waitMs;
                current.activeAttempt.hookDeadline = current.activeAttempt.biteAt + FISHING_RULES.cast.hookWindowMs;
                current.updatedAt = now;
                return { player: current, result: { outcome: "spooked" } };
            }
            result = current.activeAttempt
                ? hookFish(current, { now, random, specimenId: context.specimenId })
                : current;
            break;
        case "fight":
            result = advanceFight(current, {
                tension: payload.tension,
                reeling: payload.reeling,
                now,
                random
            });
            break;
        case "stopFight":
            result = stopFight(current, now, random);
            break;
        case "sellFish":
            result = sellFish(current, payload.specimenId, now);
            break;
        case "sellAllFish":
            result = sellAllFish(current, now);
            break;
        case "moveFishToCollection":
            result = moveFishToCollection(current, payload.specimenId, now);
            break;
        case "restoreFishFromCollection":
            result = restoreFishFromCollection(current, payload.specimenId, now);
            break;
        default:
            fail("invalid-argument", "Невідома дія риболовлі.");
    }

    return result === current
        ? { player: current, result: null }
        : { player: current, result: result === current ? null : result.lastResult || result };
}

export function rollWeather(random = Math.random) {
    return pickWeighted(Object.entries(WEATHER_CHANCES), random);
}

export function fishWeightMultiplier(fishId, { weather, time }) {
    return (WEATHER_FISH_MULTIPLIERS[fishId]?.[weather] ?? 1) *
        (TIME_FISH_MULTIPLIERS[fishId]?.[time] ?? 1);
}
