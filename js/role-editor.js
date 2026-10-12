import { db } from './firebase.js';
import { ref, get, push, set } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const uuid = sessionStorage.getItem('uuid');
if (!uuid) window.location.href = 'login.html';

const roleId = new URLSearchParams(location.search).get('role');
const nameInput = document.getElementById('roleName');
const form = document.getElementById('roleEditor');
const saveButton = form.querySelector('button[type="submit"]');
saveButton.disabled = true;
let empireId = null;

async function initialize() {
    const empiresSnapshot = await get(ref(db, 'mvdef/empires'));
    let empire = null;
    empiresSnapshot.forEach(child => {
        if (child.val()?.ownerUuid === uuid) {
            empireId = child.key;
            empire = child.val();
        }
    });
    if (!empireId) {
        window.location.replace('empire-create.html');
        return;
    }
    document.getElementById('editorEmpireName').textContent = empire.name || 'Правління';

    if (!roleId) {
        saveButton.disabled = false;
        return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(roleId)) {
        window.location.replace('roles.html');
        return;
    }
    const roleSnapshot = await get(ref(db, `mvdef/empireRoles/${empireId}/roles/${roleId}`));
    const role = roleSnapshot.val();
    if (!role || role.builtIn) {
        window.location.replace('roles.html');
        return;
    }
    document.getElementById('editorHeading').textContent = `Редагування: ${role.name}`;
    nameInput.value = role.name || '';
    document.querySelectorAll('input[name="permission"]').forEach(input => {
        input.checked = Boolean(role.permissions?.[input.value]);
    });
    saveButton.disabled = false;
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const error = document.getElementById('roleEditorError');
    if (!name) {
        error.textContent = 'Вкажи назву ролі.';
        return;
    }
    const permissions = {};
    document.querySelectorAll('input[name="permission"]:checked').forEach(input => {
        permissions[input.value] = true;
    });
    saveButton.disabled = true;
    try {
        const roleRef = roleId
            ? ref(db, `mvdef/empireRoles/${empireId}/roles/${roleId}`)
            : push(ref(db, `mvdef/empireRoles/${empireId}/roles`));
        await set(roleRef, { name, builtIn: false, permissions, updatedAt: Date.now() });
        window.location.href = 'roles.html';
    } catch (saveError) {
        console.error('Не вдалося зберегти роль:', saveError);
        error.textContent = `Не вдалося зберегти роль: ${saveError instanceof Error ? saveError.message : 'помилка бази даних'}`;
        saveButton.disabled = false;
    }
});

initialize().catch(error => {
    console.error('Не вдалося відкрити редактор ролі:', error);
    document.getElementById('roleEditorError').textContent = 'Не вдалося завантажити дані. Онови сторінку або увійди повторно.';
});
