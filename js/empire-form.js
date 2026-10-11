import { db } from './firebase.js';
import { ref, get, push, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const uuid = sessionStorage.getItem('uuid');
const playerName = sessionStorage.getItem('playerName') || 'Гравець';
const mode = document.body.dataset.empireMode;
if (!uuid) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', event => {
    event.preventDefault();
    sessionStorage.clear();
    window.location.href = 'login.html';
});

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
    const snapshot = await get(ref(db, 'mvdef/empires'));
    snapshot.forEach(child => {
        if (child.val()?.ownerUuid === uuid) {
            existingEmpireId = child.key;
        }
    });
    if (mode === 'create' && existingEmpireId) {
        window.location.replace('empire-edit.html');
        return;
    }
    if (mode === 'edit' && !existingEmpireId) {
        window.location.replace('empire-create.html');
        return;
    }

    if (mode === 'create') {
        const noun = ({ empire: 'Імперією', city: 'Містом', village: 'Селом', country: 'Країною' })[
            document.getElementById('organizationLevel').value
        ];
        document.getElementById('welcomeText').textContent =
            `Ви, ${playerName}, з цього моменту починаєте керувати ${noun}. Ви можете призначити собі підопічних, видавши їм ролі, та вибрати території, які з'являться у вас після модерації.`;
        document.getElementById('organizationLevel').addEventListener('change', event => {
            const levelNoun = ({ empire: 'Імперією', city: 'Містом', village: 'Селом', country: 'Країною' })[event.target.value];
            document.getElementById('welcomeText').textContent =
                `Ви, ${playerName}, з цього моменту починаєте керувати ${levelNoun}. Ви можете призначити собі підопічних, видавши їм ролі, та вибрати території, які з'являться у вас після модерації.`;
        });
    } else {
        const empire = snapshot.child(existingEmpireId).val();
        document.getElementById('empireNameInput').value = empire.name || '';
        document.getElementById('empireDescription').value = empire.description || '';
        document.getElementById('organizationLevel').value = empire.organizationLevel || 'empire';
        document.getElementById('government').value = empire.government || 'monarchy';
        colorInput.value = /^#[0-9a-f]{6}$/i.test(empire.color || '') ? empire.color : '#81c878';
        colorValue.textContent = colorInput.value.toUpperCase();
        setAvatar(empire.avatar || null);
    }
    showGovernmentInfo();
    saveButton.disabled = false;
}

document.getElementById('government').addEventListener('change', showGovernmentInfo);
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
            const keyRef = push(ref(db, 'mvdef/empires'));
            await update(ref(db), {
                [`mvdef/empires/${keyRef.key}`]: {
                    ...fields,
                    ownerUuid: uuid,
                    ownerName: playerName,
                    createdAt: Date.now()
                }
            });
            window.location.replace('map.html');
        } else {
            await update(ref(db, `mvdef/empires/${existingEmpireId}`), fields);
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
