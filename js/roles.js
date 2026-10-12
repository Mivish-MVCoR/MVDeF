import { db } from './firebase.js';
import { ref, get, onValue, set, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const uuid = sessionStorage.getItem('uuid');
if (!uuid) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', event => {
    event.preventDefault();
    sessionStorage.clear();
    window.location.href = 'login.html';
});

const defaultRoles = {
    passerby: { name: 'Прохожий', builtIn: true, permissions: { fightMobs: true } },
    builder: { name: 'Будівельник', builtIn: true, permissions: { breakBlocks: true, placeBlocks: true } },
    universal: {
        name: 'Універсал',
        builtIn: true,
        permissions: {
            breakBlocks: true, placeBlocks: true, fightMobs: true,
            useContainers: true, useDoors: true
        }
    }
};
const permissionLabels = {
    breakBlocks: 'ламати блоки',
    placeBlocks: 'ставити блоки',
    fightMobs: 'битися з мобами',
    useContainers: 'користуватися контейнерами',
    useDoors: 'відкривати двері та ворота',
    useBuckets: 'використовувати відра'
};
const roleSelect = document.getElementById('roleSelect');
const assignmentList = document.getElementById('assignmentList');
const assignmentCount = document.getElementById('assignmentCount');
const customRoleList = document.getElementById('customRoleList');
const rolesMapCanvas = document.getElementById('rolesMap');
const mapContext = rolesMapCanvas.getContext('2d');
const assignButton = document.querySelector('#assignmentForm button[type="submit"]');
const newRoleButton = document.getElementById('newRoleButton');
assignButton.disabled = true;
newRoleButton.disabled = true;
const roles = {};
const assignments = {};
const empires = {};
const chunks = {};
const WORLD_CHUNK_SIZE = 218;
const WORLD_MIN = -Math.floor(WORLD_CHUNK_SIZE / 2);
let empireId = null;
let empireRolesPath = null;
let worldImage = null;

function safeKey(value) {
    return value.toLowerCase().replace(/[.#$\[\]/]/g, '_');
}

function showMessage(elementId, text, isError = false) {
    const element = document.getElementById(elementId);
    element.textContent = text;
    element.classList.toggle('error-message', isError);
}

function roleDescription(role) {
    const permissions = Object.entries(role.permissions || {})
        .filter(([, allowed]) => allowed)
        .map(([key]) => permissionLabels[key])
        .filter(Boolean);
    return permissions.length ? permissions.join(' · ') : 'Без додаткових дозволів';
}

function renderRoleSelect() {
    const current = roleSelect.value;
    roleSelect.replaceChildren();
    Object.entries(roles).forEach(([id, role]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = role.name;
        roleSelect.append(option);
    });
    roleSelect.value = current && roles[current] ? current : 'passerby';
}

function renderAssignments() {
    const entries = Object.entries(assignments);
    assignmentCount.textContent = String(entries.length);
    assignmentList.replaceChildren();
    if (!entries.length) {
        assignmentList.innerHTML = '<p class="empty">Ще немає призначених ролей.</p>';
        return;
    }
    entries.sort((a, b) => (a[1].playerName || '').localeCompare(b[1].playerName || ''));
    for (const [playerKey, assignment] of entries) {
        const role = roles[assignment.roleId];
        const row = document.createElement('article');
        row.className = 'assignment-row';
        const identity = document.createElement('div');
        identity.className = 'assignment-identity';
        const name = document.createElement('strong');
        name.textContent = assignment.playerName || playerKey;
        const detail = document.createElement('span');
        detail.textContent = role ? `${role.name} · ${roleDescription(role)}` : 'Роль видалена';
        const color = document.createElement('span');
        color.className = 'role-color-dot';
        color.style.setProperty('--role-color', empires[empireId]?.color || '#81c878');
        color.setAttribute('aria-label', `Колір ${empires[empireId]?.color || '#81c878'}`);
        identity.append(name, detail);
        const remove = document.createElement('button');
        remove.className = 'text-button danger-text';
        remove.type = 'button';
        remove.textContent = 'Зняти';
        remove.addEventListener('click', async () => {
            remove.disabled = true;
            try {
                await set(ref(db, `${empireRolesPath}/assignments/${playerKey}`), null);
            } catch (error) {
                console.error('Не вдалося зняти роль гравця:', error);
                showMessage('assignmentMessage', `Помилка: ${error.message}`, true);
                remove.disabled = false;
            }
        });
        row.append(color, identity, remove);
        assignmentList.append(row);
    }
}

function renderCustomRoles() {
    customRoleList.replaceChildren();
    Object.entries(roles).forEach(([id, role]) => {
        const row = document.createElement('article');
        row.className = 'custom-role-row';
        const color = document.createElement('span');
        color.className = 'role-color-dot';
        color.style.setProperty('--role-color', empires[empireId]?.color || '#81c878');
        const text = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = role.name;
        const permissions = document.createElement('span');
        permissions.textContent = roleDescription(role);
        text.append(name, permissions);
        row.append(color, text);
        if (!role.builtIn) {
            const edit = document.createElement('button');
            edit.className = 'text-button';
            edit.type = 'button';
            edit.textContent = 'Редагувати';
            edit.addEventListener('click', () => {
                window.location.href = `role-editor.html?role=${encodeURIComponent(id)}`;
            });
            const remove = document.createElement('button');
            remove.className = 'text-button danger-text';
            remove.type = 'button';
            remove.textContent = 'Видалити';
            remove.addEventListener('click', async () => {
                remove.disabled = true;
                try {
                    const changes = { [`${empireRolesPath}/roles/${id}`]: null };
                    Object.entries(assignments).forEach(([key, assignment]) => {
                        if (assignment.roleId === id) changes[`${empireRolesPath}/assignments/${key}`] = null;
                    });
                    await update(ref(db), changes);
                } catch (error) {
                    console.error('Не вдалося видалити роль:', error);
                    showMessage('assignmentMessage', `Не вдалося видалити роль: ${error.message}`, true);
                    remove.disabled = false;
                }
            });
            row.append(edit, remove);
        } else {
            const fixed = document.createElement('span');
            fixed.className = 'role-fixed';
            fixed.textContent = 'Базова';
            row.append(fixed);
        }
        customRoleList.append(row);
    });
}

function renderMap() {
    const { width, height } = rolesMapCanvas;
    mapContext.clearRect(0, 0, width, height);
    mapContext.fillStyle = '#101713';
    mapContext.fillRect(0, 0, width, height);
    if (worldImage) mapContext.drawImage(worldImage, 0, 0, width, height);
    const cell = width / WORLD_CHUNK_SIZE;
    Object.entries(chunks).forEach(([key, chunk]) => {
        if (chunk.status !== 'active') return;
        const match = /^world_(-?\d+)_(-?\d+)$/.exec(key);
        if (!match) return;
        const x = Number(match[1]) - WORLD_MIN;
        const z = Number(match[2]) - WORLD_MIN;
        const empire = empires[chunk.empireId];
        mapContext.globalAlpha = 0.75;
        mapContext.fillStyle = empire?.color || '#738178';
        mapContext.fillRect(x * cell, z * cell, Math.ceil(cell), Math.ceil(cell));
    });
    mapContext.globalAlpha = 1;
    mapContext.strokeStyle = 'rgba(167,217,154,.55)';
    mapContext.strokeRect(0.5, 0.5, width - 1, height - 1);
}

async function initialize() {
    const empireSnapshot = await get(ref(db, 'mvdef/empires'));
    empireSnapshot.forEach(child => {
        empires[child.key] = child.val();
        if (child.val()?.ownerUuid === uuid) empireId = child.key;
    });
    if (!empireId) {
        window.location.replace('empire-create.html');
        return;
    }
    empireRolesPath = `mvdef/empireRoles/${empireId}`;
    document.getElementById('rolesEmpireName').textContent = empires[empireId].name || 'Правління';

    const rolesSnapshot = await get(ref(db, `${empireRolesPath}/roles`));
    const missingDefaults = {};
    for (const [id, role] of Object.entries(defaultRoles)) {
        if (!rolesSnapshot.child(id).exists()) missingDefaults[`${empireRolesPath}/roles/${id}`] = role;
    }
    if (Object.keys(missingDefaults).length) await update(ref(db), missingDefaults);

    onValue(ref(db, `${empireRolesPath}/roles`), snapshot => {
        Object.keys(roles).forEach(key => delete roles[key]);
        snapshot.forEach(child => { roles[child.key] = child.val(); });
        renderRoleSelect();
        renderCustomRoles();
        renderAssignments();
        assignButton.disabled = false;
        newRoleButton.disabled = false;
    }, error => {
        console.error('Не вдалося слухати ролі імперії:', error);
        showMessage('assignmentMessage', `Не вдалося завантажити ролі: ${error.message}`, true);
    });
    onValue(ref(db, `${empireRolesPath}/assignments`), snapshot => {
        Object.keys(assignments).forEach(key => delete assignments[key]);
        snapshot.forEach(child => { assignments[child.key] = child.val(); });
        renderAssignments();
    }, error => {
        console.error('Не вдалося слухати призначені ролі:', error);
        showMessage('assignmentMessage', `Не вдалося завантажити призначення: ${error.message}`, true);
    });
    onValue(ref(db, 'mvdef/chunks'), snapshot => {
        Object.keys(chunks).forEach(key => delete chunks[key]);
        snapshot.forEach(child => { chunks[child.key] = child.val(); });
        renderMap();
    }, error => {
        console.error('Не вдалося завантажити території для огляду:', error);
        showMessage('rolesMapMessage', `Не вдалося завантажити території: ${error.message}`, true);
    });
    onValue(ref(db, 'mvdef/empires'), snapshot => {
        Object.keys(empires).forEach(key => delete empires[key]);
        snapshot.forEach(child => { empires[child.key] = child.val(); });
        document.getElementById('rolesEmpireName').textContent = empires[empireId]?.name || 'Правління';
        renderCustomRoles();
        renderAssignments();
        renderMap();
    }, error => {
        console.error('Не вдалося оновити кольори територій:', error);
        showMessage('rolesMapMessage', `Не вдалося оновити кольори: ${error.message}`, true);
    });
    worldImage = new Image();
    worldImage.onload = renderMap;
    worldImage.onerror = () => showMessage('rolesMapMessage', 'Не знайдено спільний файл карти assets/world-map.png.');
    worldImage.src = new URL('../assets/world-map.png', import.meta.url).href;
}

document.getElementById('assignmentForm').addEventListener('submit', async event => {
    event.preventDefault();
    const nickname = document.getElementById('playerNickname').value.trim();
    const roleId = roleSelect.value;
    if (!/^[A-Za-z0-9_]{1,16}$/.test(nickname)) {
        showMessage('assignmentMessage', 'Нік має містити 1–16 латинських літер, цифр або символів _.', true);
        return;
    }
    try {
        await set(ref(db, `${empireRolesPath}/assignments/${safeKey(nickname)}`), {
            playerName: nickname,
            roleId,
            updatedAt: Date.now()
        });
        document.getElementById('playerNickname').value = '';
        roleSelect.value = 'passerby';
        showMessage('assignmentMessage', `Гравцю ${nickname} призначено роль «${roles[roleId]?.name || ''}».`);
    } catch (error) {
        console.error('Не вдалося призначити роль гравцю:', error);
        showMessage('assignmentMessage', `Не вдалося призначити роль: ${error.message}`, true);
    }
});

newRoleButton.addEventListener('click', () => {
    window.location.href = 'role-editor.html';
});

initialize().catch(error => {
    console.error('Не вдалося ініціалізувати керування ролями:', error);
    showMessage('assignmentMessage', `Помилка завантаження: ${error.message}`, true);
});
