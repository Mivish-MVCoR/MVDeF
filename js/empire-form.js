import { db } from './firebase.js';
import { ref, get, push, set, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { CLOUDFLARE_API_URL, SITE_SESSION_KEY } from './cloudflare-config.js';

const uuid = sessionStorage.getItem('uuid');
const playerName = sessionStorage.getItem('playerName') || 'Гравець';
const mode = document.body.dataset.empireMode;
if (!uuid) window.location.href = 'login.html';

const governmentInfo = {
    monarchy: ['Монархія', 'Влада однієї особи (короля, царя, імператора), яка найчастіше передається у спадок.'],
    republic: ['Республіка', 'Влада виборних органів та правителів, яких народ чи еліта обирає на певний термін.'],
    democracy: ['Демократія', 'Влада всього народу (або більшості громадян), де рішення приймаються голосуванням — напряму або через обраних депутатів.'],
    aristocracy: ['Аристократія', 'Влада «найкращих» — невеликої групи родовитої, шляхетної та освіченої знаті.'],
    oligarchy: ['Олігархія', 'Влада небагатьох найбагатших людей або фінансових кланів, які керують державою заради власного збагачення.'],
    dictatorship: ['Тиранія (Диктатура)', 'Одноосібна влада, яка тримається не на законах чи традиціях, а на силі, зброї та залякуванні.'],
    theocracy: ['Теократія', 'Влада духовенства або релігійних лідерів, де релігійні закони є вищими за державні.'],
    ochlocracy: ['Охлократія', 'Влада натовпу або анархія, коли державою керують хаотичні мітинги, емоції та вуличні протести, а законні інститути влади зруйновані.'],
    junta: ['Хунта', 'Влада групи військових, які захопили контроль над країною внаслідок військового перевороту.']
};
const presets = ['#81c878', '#e57373', '#64b5f6', '#ffd54f', '#ba68c8', '#4dd0e1', '#ff8a65', '#aed581', '#f06292', '#90a4ae'];
const form = document.getElementById('empireForm');
const saveButton = document.getElementById('saveEmpire');
saveButton.disabled = true;
const avatarInput = document.getElementById('empireAvatarFile');
const avatarPreview = document.getElementById('empireAvatarPreview');
const avatarPlaceholder = document.getElementById('avatarPlaceholder');
const clearAvatar = document.getElementById('clearAvatar');
const colorInput = document.getElementById('empireColor');
const colorValue = document.getElementById('colorValue');
const errorBox = document.getElementById('formError');
let avatarData = null;
let existingEmpireId = null;
let hasPendingCreationRequest = false;
let currentEmpire = null;

const organizationLevelDetails = {
    empire: {
        button: 'Покинути престол',
        title: 'Ви точно хочете покинути престол?',
        confirm: 'Я покидаю престол (це повністю видалить вашу імперію)'
    },
    city: {
        button: 'Зректися посади',
        title: 'Ви точно хочете зректися посади?',
        confirm: 'Я зрікаюся влади (це повністю видалить ваше місто)'
    },
    village: {
        button: 'Зректися посади',
        title: 'Ви точно хочете зректися посади?',
        confirm: 'Я зрікаюся влади (це повністю видалить ваше село)'
    },
    country: {
        button: 'Зректися посади',
        title: 'Ви точно хочете зректися посади?',
        confirm: 'Я зрікаюся влади (це повністю видалить вашу країну)'
    }
};

function showGovernmentInfo() {
    const [title, description] = governmentInfo[document.getElementById('government').value];
    document.getElementById('governmentTitle').textContent = title;
    document.getElementById('governmentDescription').textContent = description;
}

function setAvatar(data) {
    avatarData = data;
    avatarPreview.hidden = !data;
    avatarPlaceholder.hidden = Boolean(data);
    clearAvatar.hidden = !data;
    if (data) avatarPreview.src = data;
    else avatarPreview.removeAttribute('src');
}

function showError(message) {
    errorBox.textContent = message;
}

function renderPresets() {
    const container = document.getElementById('colorPresets');
    for (const color of presets) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'color-swatch';
        button.style.setProperty('--swatch-color', color);
        button.title = color;
        button.setAttribute('aria-label', `Колір ${color}`);
        button.addEventListener('click', () => {
            colorInput.value = color;
            colorValue.textContent = color.toUpperCase();
        });
        container.append(button);
    }
}

async function loadEmpire() {
    const [snapshot, pendingRequestSnapshot] = await Promise.all([
        get(ref(db, 'mvdef/empires')),
        get(ref(db, `mvdef/empireRequests/${uuid}`))
    ]);
    hasPendingCreationRequest = pendingRequestSnapshot.exists();
    snapshot.forEach(child => {
        if (child.val()?.ownerUuid === uuid) {
            existingEmpireId = child.key;
        }
    });
    if (mode === 'create' && existingEmpireId) {
        window.location.replace('empire-edit.html');
        return;
    }
    if (mode === 'create' && hasPendingCreationRequest) {
        window.location.replace('cabinet.html');
        return;
    }
    if (mode === 'edit' && !existingEmpireId) {
        window.location.replace('empire-create.html');
        return;
    }

    if (mode === 'create') {
        const noun = ({ empire: 'імперії', city: 'міста', village: 'села', country: 'країни' })[
            document.getElementById('organizationLevel').value
        ];
        document.getElementById('welcomeText').textContent =
            `Ви, ${playerName}, подаєте заявку на створення ${noun}. Після підтвердження модератором зможете керувати правлінням, призначати підопічних і подавати заявки на території.`;
        document.getElementById('organizationLevel').addEventListener('change', event => {
            const levelNoun = ({ empire: 'імперії', city: 'міста', village: 'села', country: 'країни' })[event.target.value];
            document.getElementById('welcomeText').textContent =
                `Ви, ${playerName}, подаєте заявку на створення ${levelNoun}. Після підтвердження модератором зможете керувати правлінням, призначати підопічних і подавати заявки на території.`;
        });
    } else {
        const empire = snapshot.child(existingEmpireId).val();
        currentEmpire = empire;
        document.getElementById('empireNameInput').value = empire.name || '';
        document.getElementById('empireDescription').value = empire.description || '';
        document.getElementById('organizationLevel').value = empire.organizationLevel || 'empire';
        document.getElementById('government').value = empire.government || 'monarchy';
        colorInput.value = /^#[0-9a-f]{6}$/i.test(empire.color || '') ? empire.color : '#81c878';
        colorValue.textContent = colorInput.value.toUpperCase();
        setAvatar(empire.avatar || null);
        configureDangerZone(empire.organizationLevel || 'empire');
    }
    showGovernmentInfo();
    saveButton.disabled = false;
}

function configureDangerZone(level) {
    const details = organizationLevelDetails[level] || organizationLevelDetails.empire;
    const abdicateButton = document.getElementById('abdicateButton');
    abdicateButton.textContent = details.button;
    abdicateButton.hidden = false;
    document.getElementById('capitulateButton').hidden = false;
}

function openDeleteConfirmation() {
    const level = currentEmpire?.organizationLevel || 'empire';
    const details = organizationLevelDetails[level] || organizationLevelDetails.empire;
    document.getElementById('deleteEmpireTitle').textContent = details.title;
    document.getElementById('deleteEmpireWarning').textContent =
        `Правління «${currentEmpire?.name || 'Без назви'}», усі його ролі та території буде видалено без можливості відновлення.`;
    document.getElementById('deleteEmpireError').textContent = '';
    document.getElementById('confirmDeleteEmpire').textContent = details.confirm;
    document.getElementById('deleteEmpireDialog').showModal();
}

async function deleteEmpire() {
    if (!existingEmpireId || !currentEmpire) {
        document.getElementById('deleteEmpireError').textContent = 'Не вдалося визначити правління для видалення.';
        return;
    }

    const confirmButton = document.getElementById('confirmDeleteEmpire');
    confirmButton.disabled = true;
    document.getElementById('cancelDeleteEmpire').disabled = true;
    document.getElementById('deleteEmpireError').textContent = '';

    try {
        const chunksSnapshot = await get(ref(db, 'mvdef/chunks'));
        const updates = {
            [`mvdef/empires/${existingEmpireId}`]: null,
            [`mvdef/empireRoles/${existingEmpireId}`]: null,
            [`mvdef/empireRequests/${uuid}`]: null
        };
        chunksSnapshot.forEach(child => {
            if (child.val()?.empireId === existingEmpireId) {
                updates[`mvdef/chunks/${child.key}`] = null;
            }
        });
        await update(ref(db), updates);
        window.location.replace('cabinet.html');
    } catch (error) {
        console.error('Не вдалося повністю видалити правління:', error);
        document.getElementById('deleteEmpireError').textContent =
            `Не вдалося видалити правління: ${error instanceof Error ? error.message : 'помилка бази даних'}`;
        confirmButton.disabled = false;
        document.getElementById('cancelDeleteEmpire').disabled = false;
    }
}

function resetFishingInput() {
    const input = document.getElementById('fishingResetEmpireName');
    input.value = '';
    document.getElementById('confirmFishingReset').disabled = true;
    document.getElementById('fishingResetError').textContent = '';
}

function openFishingResetConfirmation() {
    if (!currentEmpire?.name?.trim()) return;
    resetFishingInput();
    const empireName = currentEmpire.name.trim();
    document.getElementById('fishingResetEmpireLabel').textContent = empireName;
    document.getElementById('fishingResetEmpireName').placeholder = empireName;
    document.getElementById('fishingResetDialog').showModal();
    document.getElementById('fishingResetEmpireName').focus();
}

async function resetFishingProgress() {
    const expectedName = currentEmpire?.name?.trim();
    const input = document.getElementById('fishingResetEmpireName');
    const confirmButton = document.getElementById('confirmFishingReset');
    const error = document.getElementById('fishingResetError');
    if (!expectedName || input.value.trim() !== expectedName || confirmButton.disabled) return;

    const token = sessionStorage.getItem(SITE_SESSION_KEY);
    if (!token) {
        error.textContent = 'Сеанс входу завершився. Увійди знову та спробуй ще раз.';
        return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = 'Скидаємо…';
    document.getElementById('cancelFishingReset').disabled = true;
    error.textContent = '';
    try {
        const response = await fetch(`${CLOUDFLARE_API_URL}/api/fishing/reset`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'Не вдалося скинути рибальський прогрес.');
        window.location.assign('fishing.html');
    } catch (resetError) {
        console.error('Не вдалося скинути рибальський прогрес:', resetError);
        error.textContent = resetError instanceof Error
            ? resetError.message
            : 'Не вдалося скинути рибальський прогрес. Спробуй ще раз.';
        confirmButton.disabled = input.value.trim() !== expectedName;
        document.getElementById('cancelFishingReset').disabled = false;
        confirmButton.textContent = 'Дійсно видалити';
    }
}

document.getElementById('government').addEventListener('change', showGovernmentInfo);
document.getElementById('organizationLevel').addEventListener('change', event => {
    if (mode === 'edit') configureDangerZone(event.target.value);
});
if (mode === 'edit') {
    document.getElementById('abdicateButton').addEventListener('click', openDeleteConfirmation);
    document.getElementById('capitulateButton').addEventListener('click', openDeleteConfirmation);
    document.getElementById('cancelDeleteEmpire').addEventListener('click', () => {
        window.location.replace('cabinet.html');
    });
    document.getElementById('confirmDeleteEmpire').addEventListener('click', deleteEmpire);
    document.getElementById('deleteEmpireDialog').addEventListener('cancel', event => {
        event.preventDefault();
        window.location.replace('cabinet.html');
    });
    const fishingResetDialog = document.getElementById('fishingResetDialog');
    const fishingResetInput = document.getElementById('fishingResetEmpireName');
    const confirmFishingReset = document.getElementById('confirmFishingReset');
    document.getElementById('openFishingResetButton').addEventListener('click', openFishingResetConfirmation);
    document.getElementById('closeFishingReset').addEventListener('click', () => fishingResetDialog.close());
    document.getElementById('cancelFishingReset').addEventListener('click', () => fishingResetDialog.close());
    fishingResetDialog.addEventListener('close', resetFishingInput);
    fishingResetInput.addEventListener('input', () => {
        confirmFishingReset.disabled =
            fishingResetInput.value.trim() !== currentEmpire?.name?.trim();
    });
    confirmFishingReset.addEventListener('click', resetFishingProgress);
}
colorInput.addEventListener('input', () => {
    colorValue.textContent = colorInput.value.toUpperCase();
});
avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    avatarInput.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        showError('Вибери PNG, JPG або WEBP до 5 МБ.');
        return;
    }
    try {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);
        image.src = objectUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const scale = Math.max(256 / image.naturalWidth, 256 / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
        URL.revokeObjectURL(objectUrl);
        setAvatar(canvas.toDataURL('image/jpeg', 0.82));
        errorBox.textContent = '';
    } catch (error) {
        console.error('Не вдалося обробити аватар імперії:', error);
        showError('Не вдалося відкрити зображення аватара.');
    }
});
clearAvatar.addEventListener('click', () => setAvatar(null));

form.addEventListener('submit', async event => {
    event.preventDefault();
    showError('');
    const name = document.getElementById('empireNameInput').value.trim();
    if (!name) {
        showError('Вкажи назву імперії.');
        return;
    }
    const button = saveButton;
    button.disabled = true;
    try {
        const fields = {
            name,
            description: document.getElementById('empireDescription').value.trim(),
            organizationLevel: document.getElementById('organizationLevel').value,
            government: document.getElementById('government').value,
            color: colorInput.value.toLowerCase(),
            avatar: avatarData,
            updatedAt: Date.now()
        };
        if (mode === 'create') {
            if (hasPendingCreationRequest) {
                showError('Заявка на створення вже очікує на розгляд модератора.');
                button.disabled = true;
                return;
            }
            await set(ref(db, `mvdef/empireRequests/${uuid}`), {
                ...fields,
                ownerUuid: uuid,
                ownerName: playerName,
                submittedAt: Date.now()
            });
            window.location.replace('cabinet.html');
        } else {
            await update(ref(db, `mvdef/empires/${existingEmpireId}`), fields);
            currentEmpire = { ...currentEmpire, ...fields };
            configureDangerZone(fields.organizationLevel);
            button.textContent = 'Збережено';
            button.disabled = false;
            window.setTimeout(() => { button.textContent = 'Зберегти зміни'; }, 1800);
        }
    } catch (error) {
        console.error('Не вдалося зберегти правління:', error);
        showError(`Не вдалося зберегти зміни: ${error instanceof Error ? error.message : 'помилка бази даних'}`);
        button.disabled = false;
    }
});

renderPresets();
loadEmpire().catch(error => {
    console.error('Не вдалося завантажити дані правління:', error);
    showError('Не вдалося завантажити дані. Онови сторінку або увійди повторно.');
});
