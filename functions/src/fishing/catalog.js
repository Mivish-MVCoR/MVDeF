export const FISH_CATEGORIES = Object.freeze({
    common: Object.freeze({ label: "Звичайна", chance: 0.9, baseXp: 20 }),
    exclusive: Object.freeze({ label: "Ексклюзивна", chance: 0.07, baseXp: 60 }),
    epic: Object.freeze({ label: "Епічна", chance: 0.03, baseXp: 120 })
});

const fishRows = [
    ["silver-crucian", "Карась сріблястий", "common", 70, 2000, 9, 45],
    ["roach", "Плітка", "common", 70, 1500, 9, 40],
    ["topmouth-gudgeon", "Верхівка", "common", 10, 100, 9, 20],
    ["river-perch", "Окунь річковий", "common", 50, 2000, 15, 70],
    ["russian-ruff", "Йорж звичайний", "common", 10, 200, 9, 30],
    ["gudgeon", "Пічкур", "common", 10, 150, 9, 25],
    ["rudd", "Краснопірка", "common", 50, 1500, 12, 55],
    ["white-bream", "Густера", "common", 50, 1500, 12, 50],
    ["bream", "Лящ", "common", 200, 7000, 30, 180],
    ["white-breamlet", "Підлящик", "common", 100, 2000, 20, 70],
    ["tench", "Лин", "common", 100, 5000, 35, 160],
    ["carp", "Короп", "common", 300, 7000, 40, 250],
    ["grass-carp", "Білий амур", "common", 500, 7000, 50, 300],
    ["silver-carp", "Товстолобик білий", "common", 1000, 7000, 60, 350],
    ["bighead-carp", "Товстолобик строкатий", "common", 1000, 7000, 70, 400],
    ["golden-crucian", "Карась золотий", "common", 50, 1500, 15, 60],
    ["sazan", "Сазан", "common", 500, 7000, 60, 300],
    ["european-catfish", "Сом європейський", "common", 1000, 7000, 100, 450],
    ["pike", "Щука звичайна", "common", 200, 7000, 50, 300],
    ["zander", "Судак", "common", 200, 7000, 60, 350],
    ["nosar-ruff", "Йорж-носар", "common", 10, 250, 12, 35],
    ["bleak", "Білизна", "common", 100, 3000, 30, 120],
    ["sabrefish", "Чехоня", "common", 50, 1000, 20, 65],
    ["blue-bream", "Синець", "common", 100, 1500, 20, 70],
    ["common-bleak", "Верховодка", "common", 5, 80, 9, 18],
    ["brook-trout", "Форель струмкова", "common", 100, 3000, 60, 300],
    ["rainbow-trout", "Форель райдужна", "common", 200, 5000, 80, 400],
    ["grayling", "Харіус", "common", 100, 3000, 70, 320],
    ["arctic-char", "Голець арктичний", "common", 200, 5000, 100, 450],
    ["european-whitefish", "Сиг європейський", "common", 200, 5000, 80, 350],
    ["atlantic-herring", "Оселедець атлантичний", "common", 100, 1000, 20, 80],
    ["atlantic-mackerel", "Скумбрія атлантична", "common", 200, 2000, 40, 150],
    ["horse-mackerel", "Ставрида", "common", 100, 1000, 25, 100],
    ["sardine", "Сардина", "common", 20, 300, 12, 45],
    ["anchovy", "Анчоус", "common", 5, 80, 9, 25],
    ["flounder", "Камбала", "common", 100, 5000, 40, 220],
    ["sole", "Морський язик", "common", 100, 3000, 50, 250],
    ["atlantic-cod", "Тріска атлантична", "common", 500, 7000, 80, 350],
    ["haddock", "Пікша", "common", 300, 5000, 60, 280],
    ["pollock", "Минтай", "common", 200, 5000, 45, 200],
    ["european-hake", "Хек європейський", "common", 300, 5000, 60, 250],
    ["sea-perch", "Морський окунь", "common", 100, 5000, 70, 350],
    ["dorado", "Дорадо", "common", 200, 5000, 80, 400],
    ["sea-bass", "Сібас", "common", 200, 5000, 80, 400],
    ["mullet", "Кефаль", "common", 100, 5000, 40, 220],
    ["red-mullet", "Барабуля", "common", 30, 500, 20, 100],
    ["bonito", "Пеламіда", "common", 500, 7000, 100, 500],
    ["little-tunny", "Тунець малий", "common", 1000, 7000, 120, 600],
    ["sea-bream", "Морський лящ", "common", 200, 5000, 70, 350],
    ["swordfish", "Риба-меч", "common", 2000, 7000, 200, 1500],
    ["atlantic-sturgeon", "Осетер атлантичний", "exclusive", 2000, 15000, 300, 1000],
    ["beluga", "Білуга", "exclusive", 5000, 30000, 500, 1400],
    ["paddlefish", "Веслоніс", "exclusive", 2000, 15000, 250, 900],
    ["arapaima", "Арапайма", "exclusive", 5000, 30000, 400, 1300],
    ["electric-eel", "Електричний вугор", "exclusive", 1000, 15000, 250, 900],
    ["parrotfish", "Риба-папуга", "exclusive", 200, 5000, 150, 650],
    ["ocean-sunfish", "Риба-місяць", "exclusive", 2000, 30000, 350, 1400],
    ["sailfish", "Риба-вітрильник", "exclusive", 2000, 20000, 300, 1200],
    ["blue-marlin", "Марлін блакитний", "exclusive", 5000, 30000, 400, 1500],
    ["giant-needlefish", "Риба-голка велетенська", "exclusive", 100, 3000, 150, 700],
    ["tiger-shark", "Тигрова акула", "epic", 10000, 100000, 600, 1500],
    ["blue-shark", "Синя акула", "epic", 10000, 100000, 700, 2000],
    ["megalodon", "Мегалодон", "epic", 10000, 100000, 100, 860],
    ["anchor-fish", "Риба-якір", "epic", 3000, 7000, 300, 1700],
    ["yellowtail-giant", "Жовтохвостий гігант", "epic", 5000, 70000, 200, 700]
];

export const FISH = Object.freeze(Object.fromEntries(
    fishRows.map(([id, name, category, minMassGrams, maxMassGrams, minPrice, maxPrice]) => [
        id,
        Object.freeze({ id, name, category, minMassGrams, maxMassGrams, minPrice, maxPrice })
    ])
));

const riverCommon = {
    "silver-crucian": 100, roach: 100, "topmouth-gudgeon": 90, "river-perch": 85,
    "russian-ruff": 80, gudgeon: 75, rudd: 75, "white-bream": 70, bream: 65,
    "white-breamlet": 70, tench: 45, carp: 50, "grass-carp": 35, "silver-carp": 30,
    "bighead-carp": 25, "golden-crucian": 55, sazan: 35, "european-catfish": 12,
    pike: 25, zander: 25, "nosar-ruff": 45, bleak: 35, sabrefish: 40, "blue-bream": 40,
    "common-bleak": 90, "brook-trout": 15, "rainbow-trout": 10, grayling: 12,
    "arctic-char": 8, "european-whitefish": 15
};

export const VENUES = Object.freeze({
    river: Object.freeze({
        id: "river", name: "Річка", unlockLevel: 1,
        weights: Object.freeze({
            common: Object.freeze(riverCommon),
            exclusive: Object.freeze({
                "atlantic-sturgeon": 12, beluga: 5, paddlefish: 15, arapaima: 8, "electric-eel": 10
            }),
            epic: Object.freeze({
                "tiger-shark": 2, "blue-shark": 2, megalodon: 1, "anchor-fish": 5, "yellowtail-giant": 4
            })
        }),
        conditions: Object.freeze({
            "tiger-shark": Object.freeze({ weather: ["storm"] }),
            "blue-shark": Object.freeze({ weather: ["storm"] }),
            megalodon: Object.freeze({ weather: ["storm"], time: ["night"] })
        })
    }),
    lake: Object.freeze({
        id: "lake", name: "Озеро", unlockLevel: 5,
        weights: Object.freeze({
            common: Object.freeze({
                "silver-crucian": 90, roach: 75, "river-perch": 75, rudd: 70, "white-bream": 65,
                bream: 80, "white-breamlet": 65, tench: 70, carp: 85, "grass-carp": 55,
                "silver-carp": 50, "bighead-carp": 45, "golden-crucian": 55, sazan: 60,
                "european-catfish": 20, pike: 40, zander: 35, bleak: 30, sabrefish: 35,
                "blue-bream": 35, "brook-trout": 15, "rainbow-trout": 15, grayling: 10,
                "european-whitefish": 20
            }),
            exclusive: Object.freeze({
                "atlantic-sturgeon": 12, beluga: 5, paddlefish: 15, arapaima: 8, "electric-eel": 10
            }),
            epic: Object.freeze({ "anchor-fish": 5, "yellowtail-giant": 4 })
        }),
        conditions: Object.freeze({})
    }),
    sea: Object.freeze({
        id: "sea", name: "Море", unlockLevel: 10,
        weights: Object.freeze({
            common: Object.freeze({
                "atlantic-herring": 90, "atlantic-mackerel": 75, "horse-mackerel": 75, sardine: 90,
                anchovy: 85, flounder: 65, sole: 45, "atlantic-cod": 65, haddock: 55,
                pollock: 70, "european-hake": 60, "sea-perch": 55, dorado: 40, "sea-bass": 45,
                mullet: 65, "red-mullet": 60, "sea-bream": 45, swordfish: 10
            }),
            exclusive: Object.freeze({
                parrotfish: 25, "ocean-sunfish": 12, "giant-needlefish": 20, sailfish: 10, "blue-marlin": 8
            }),
            epic: Object.freeze({
                "tiger-shark": 2, "blue-shark": 2, "anchor-fish": 3, "yellowtail-giant": 3
            })
        }),
        conditions: Object.freeze({
            "tiger-shark": Object.freeze({ weather: ["storm"] }),
            "blue-shark": Object.freeze({ weather: ["storm"] })
        })
    }),
    "ocean-pier": Object.freeze({
        id: "ocean-pier", name: "Пірс океану", unlockLevel: 20,
        weights: Object.freeze({
            common: Object.freeze({
                "atlantic-herring": 55, "atlantic-mackerel": 65, "horse-mackerel": 50,
                flounder: 35, "atlantic-cod": 50, haddock: 35, "sea-perch": 55, dorado: 55,
                "sea-bass": 55, bonito: 50, "little-tunny": 40, "sea-bream": 40, swordfish: 25
            }),
            exclusive: Object.freeze({
                parrotfish: 20, "ocean-sunfish": 15, sailfish: 20, "blue-marlin": 15, "giant-needlefish": 10
            }),
            epic: Object.freeze({
                "tiger-shark": 3, "blue-shark": 3, "anchor-fish": 3, "yellowtail-giant": 4
            })
        }),
        conditions: Object.freeze({
            "tiger-shark": Object.freeze({ weather: ["storm"] }),
            "blue-shark": Object.freeze({ weather: ["storm"] })
        })
    }),
    "open-ocean": Object.freeze({
        id: "open-ocean", name: "Відкритий океан", unlockLevel: 35,
        weights: Object.freeze({
            common: Object.freeze({
                "atlantic-mackerel": 35, "atlantic-cod": 25, "sea-perch": 30, dorado: 40,
                "sea-bass": 35, bonito: 65, "little-tunny": 70, swordfish: 45, "atlantic-herring": 25
            }),
            exclusive: Object.freeze({
                "ocean-sunfish": 25, sailfish: 35, "blue-marlin": 40, parrotfish: 5, "giant-needlefish": 5
            }),
            epic: Object.freeze({
                "tiger-shark": 5, "blue-shark": 5, megalodon: 1, "anchor-fish": 2, "yellowtail-giant": 3
            })
        }),
        conditions: Object.freeze({
            "tiger-shark": Object.freeze({ weather: ["storm"] }),
            "blue-shark": Object.freeze({ weather: ["storm"] }),
            megalodon: Object.freeze({ weather: ["storm"], time: ["night"] })
        })
    })
});

export const WEATHER_CHANCES = Object.freeze({
    clear: 0.45,
    cloudy: 0.3,
    rain: 0.15,
    fog: 0.06,
    storm: 0.04
});

export const WEATHER_LABELS = Object.freeze({
    clear: "Ясно",
    cloudy: "Хмарно",
    rain: "Дощ",
    fog: "Туман",
    storm: "Шторм"
});

export const WEATHER_CYCLE_MS = 15 * 60 * 1000;

export const TIME_PERIODS = Object.freeze({
    morning: Object.freeze({ label: "Ранок", startHour: 5, endHour: 8 }),
    day: Object.freeze({ label: "День", startHour: 8, endHour: 17 }),
    evening: Object.freeze({ label: "Вечір", startHour: 17, endHour: 21 }),
    night: Object.freeze({ label: "Ніч", startHour: 21, endHour: 5 })
});

export const WEATHER_FISH_MULTIPLIERS = Object.freeze({
    "silver-crucian": Object.freeze({ cloudy: 1.2, rain: 1.2 }),
    roach: Object.freeze({ cloudy: 1.2, rain: 1.2 }),
    carp: Object.freeze({ rain: 1.2 }),
    pike: Object.freeze({ rain: 1.5, fog: 1.2, storm: 1.2 }),
    zander: Object.freeze({ rain: 1.2, fog: 1.5, storm: 1.2 }),
    "european-catfish": Object.freeze({ rain: 1.5, fog: 1.2, storm: 1.5 }),
    "atlantic-sturgeon": Object.freeze({ rain: 1.2, fog: 1.2, storm: 1.5 }),
    beluga: Object.freeze({ rain: 1.2, storm: 1.5 }),
    "anchor-fish": Object.freeze({ rain: 1.2, fog: 1.5, storm: 1.5 }),
    "yellowtail-giant": Object.freeze({ rain: 1.2, fog: 1.2, storm: 1.5 })
});

export const TIME_FISH_MULTIPLIERS = Object.freeze({
    "silver-crucian": Object.freeze({ morning: 1.2 }),
    roach: Object.freeze({ morning: 1.2 }),
    carp: Object.freeze({ day: 1.2, evening: 1.2 }),
    pike: Object.freeze({ morning: 1.2, evening: 1.5, night: 1.2 }),
    zander: Object.freeze({ evening: 1.2, night: 1.5 }),
    "european-catfish": Object.freeze({ evening: 1.2, night: 1.5 }),
    "electric-eel": Object.freeze({ evening: 1.2, night: 1.5 }),
    "anchor-fish": Object.freeze({ evening: 1.2, night: 1.5 }),
    "yellowtail-giant": Object.freeze({ day: 1.2, evening: 1.2, night: 1.5 })
});

export const FISHING_RULES = Object.freeze({
    inventoryCapacity: 50,
    collectionCapacity: 10,
    startingCoins: 500,
    initialEquipment: Object.freeze({
        rod: "starter",
        line: "starter",
        reel: "starter",
        hook: "starter",
        bait: Object.freeze({ id: "standard", quantity: 50 })
    }),
    startingEquipmentCost: Object.freeze({
        rod: 100,
        line: 40,
        reel: 80,
        hook: 30,
        bait: 250,
        total: 500
    }),
    cast: Object.freeze({ biteChance: 0.9, minWaitMs: 5000, maxWaitMs: 30000, hookWindowMs: 3000 }),
    fight: Object.freeze({ startingDistanceM: 50, counterplayReelMps: 0.7, fishApproachMps: 1.5 }),
    wear: Object.freeze({ durability: 120, freeAttempts: 4, fixedWearPerAttempt: 2.4 }),
    xp: Object.freeze({ firstCatchOfSpecies: 50, maxLevel: 250 })
});

export function xpToNextLevel(level) {
    if (!Number.isInteger(level) || level < 1 || level >= FISHING_RULES.xp.maxLevel) {
        throw new RangeError(`Рівень має бути цілим числом від 1 до ${FISHING_RULES.xp.maxLevel - 1}.`);
    }
    return Math.floor(55 + 1.5 * (level - 1) + 0.0055 * (level - 1) ** 2);
}

export function xpRequiredForMaxLevel() {
    let total = 0;
    for (let level = 1; level < FISHING_RULES.xp.maxLevel; level++) {
        total += xpToNextLevel(level);
    }
    return total;
}

export function getAvailableFishWeights(venueId, categoryId, { weather, time } = {}) {
    const venue = VENUES[venueId];
    if (!venue) throw new RangeError(`Невідома водойма: ${venueId}.`);
    if (!FISH_CATEGORIES[categoryId]) throw new RangeError(`Невідома категорія риби: ${categoryId}.`);

    const available = Object.entries(venue.weights[categoryId]).filter(([fishId]) => {
        const conditions = venue.conditions[fishId] || {};
        return (!conditions.weather || conditions.weather.includes(weather)) &&
            (!conditions.time || conditions.time.includes(time));
    });

    if (available.length === 0) {
        throw new RangeError(`Для категорії ${categoryId} немає доступних видів у водоймі ${venueId}.`);
    }

    return available.map(([fishId, baseWeight]) => {
        const weatherMultiplier = WEATHER_FISH_MULTIPLIERS[fishId]?.[weather] ?? 1;
        const timeMultiplier = TIME_FISH_MULTIPLIERS[fishId]?.[time] ?? 1;
        return [fishId, baseWeight * weatherMultiplier * timeMultiplier];
    });
}

export function pickWeighted(entries, random) {
    if (!Array.isArray(entries) || entries.length === 0 ||
        entries.some(([, weight]) => !Number.isFinite(weight) || weight <= 0)) {
        throw new RangeError("Для випадкового вибору потрібні додатні ваги.");
    }
    if (typeof random !== "function") throw new TypeError("Потрібна функція генератора випадкових чисел.");

    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let choice = random() * totalWeight;
    for (const [value, weight] of entries) {
        choice -= weight;
        if (choice < 0) return value;
    }
    return entries.at(-1)[0];
}

export function selectFish(venueId, { weather, time, random = Math.random }) {
    const categoryId = pickWeighted(
        Object.entries(FISH_CATEGORIES).map(([id, category]) => [id, category.chance]),
        random
    );
    const fishId = pickWeighted(getAvailableFishWeights(venueId, categoryId, { weather, time }), random);
    return { fish: FISH[fishId], category: categoryId };
}

export function validateFishingCatalog() {
    const errors = [];
    const ids = Object.keys(FISH);

    if (ids.length !== 65) errors.push(`Очікується 65 видів риб, знайдено ${ids.length}.`);
    if (new Set(ids).size !== ids.length) errors.push("Ідентифікатори видів риб мають дублікати.");
    for (const [categoryId, expectedCount] of Object.entries({ common: 50, exclusive: 10, epic: 5 })) {
        const actualCount = Object.values(FISH).filter(fish => fish.category === categoryId).length;
        if (actualCount !== expectedCount) {
            errors.push(`Категорія ${categoryId}: очікується ${expectedCount} видів, знайдено ${actualCount}.`);
        }
    }

    for (const fish of Object.values(FISH)) {
        if (!(fish.minMassGrams > 0 && fish.minMassGrams < fish.maxMassGrams)) {
            errors.push(`Некоректний діапазон маси: ${fish.id}.`);
        }
        if (!(fish.minPrice > 0 && fish.minPrice <= fish.maxPrice)) {
            errors.push(`Некоректний діапазон ціни: ${fish.id}.`);
        }
        if (!FISH_CATEGORIES[fish.category]) errors.push(`Невідома категорія: ${fish.id}.`);
    }

    for (const [venueId, venue] of Object.entries(VENUES)) {
        for (const category of Object.keys(FISH_CATEGORIES)) {
            const distribution = venue.weights[category];
            if (!distribution || Object.keys(distribution).length === 0) {
                errors.push(`Водойма ${venueId} не має видів категорії ${category}.`);
                continue;
            }
            for (const [fishId, weight] of Object.entries(distribution)) {
                if (!FISH[fishId]) errors.push(`Водойма ${venueId} посилається на невідомий вид ${fishId}.`);
                else if (FISH[fishId].category !== category) {
                    errors.push(`Категорія ${fishId} не збігається з розподілом у водоймі ${venueId}.`);
                }
                if (!(Number.isFinite(weight) && weight > 0)) {
                    errors.push(`Вага появи ${fishId} у водоймі ${venueId} має бути додатною.`);
                }
            }
        }
        for (const fishId of Object.keys(venue.conditions)) {
            if (!Object.values(venue.weights).some(distribution => fishId in distribution)) {
                errors.push(`Умова появи ${fishId} задана не для виду цієї водойми ${venueId}.`);
            }
        }
        for (const [fishId, conditions] of Object.entries(venue.conditions)) {
            for (const weather of conditions.weather || []) {
                if (!(weather in WEATHER_CHANCES)) errors.push(`Невідомий стан погоди ${weather} для ${fishId}.`);
            }
            for (const time of conditions.time || []) {
                if (!(time in TIME_PERIODS)) errors.push(`Невідомий період часу ${time} для ${fishId}.`);
            }
        }
    }

    for (const fishId of ids) {
        if (!Object.values(VENUES).some(venue =>
            Object.values(venue.weights).some(distribution => fishId in distribution)
        )) {
            errors.push(`Вид ${fishId} не призначений до жодної водойми.`);
        }
    }

    const weatherTotal = Object.values(WEATHER_CHANCES).reduce((sum, chance) => sum + chance, 0);
    if (Math.abs(weatherTotal - 1) > Number.EPSILON * 10) {
        errors.push(`Імовірності погоди мають сумуватися до 100%, отримано ${weatherTotal * 100}%.`);
    }

    const categoryTotal = Object.values(FISH_CATEGORIES).reduce((sum, category) => sum + category.chance, 0);
    if (Math.abs(categoryTotal - 1) > Number.EPSILON * 10) {
        errors.push(`Імовірності категорій мають сумуватися до 100%, отримано ${categoryTotal * 100}%.`);
    }

    for (const venueId of Object.keys(VENUES)) {
        for (const categoryId of Object.keys(FISH_CATEGORIES)) {
            for (const weather of Object.keys(WEATHER_CHANCES)) {
                for (const time of Object.keys(TIME_PERIODS)) {
                    try {
                        getAvailableFishWeights(venueId, categoryId, { weather, time });
                    } catch (error) {
                        errors.push(error.message);
                    }
                }
            }
        }
    }

    return errors;
}
