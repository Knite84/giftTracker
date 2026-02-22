const API_BASE = '/api';

// State
let people = [];
let currentPersonId = null;
let currentGifts = [];

// DOM Elements
const peopleListEl = document.getElementById('people-list');
const giftsSection = document.getElementById('gifts-section');
const currentPersonNameEl = document.getElementById('current-person-name');
const unpurchasedListEl = document.getElementById('unpurchased-list');
const purchasedListEl = document.getElementById('purchased-list');
const noGiftsMsg = document.getElementById('no-gifts-msg');

const peopleSection = document.getElementById('people-section');
const btnShowPeople = document.getElementById('btn-show-people');
const btnBackPeople = document.getElementById('btn-back-people');

// Modals
const personModal = document.getElementById('person-modal');
const personForm = document.getElementById('person-form');
const personIdInput = document.getElementById('person-id');
const personNameInput = document.getElementById('person-name');
const btnDeletePerson = document.getElementById('btn-delete-person');

const giftModal = document.getElementById('gift-modal');
const giftForm = document.getElementById('gift-form');
const giftIdInput = document.getElementById('gift-id');
const giftDescInput = document.getElementById('gift-description');
const giftLinkInput = document.getElementById('gift-link');
const giftPurchasedInput = document.getElementById('gift-purchased');
const btnDeleteGift = document.getElementById('btn-delete-gift');

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadPeople();
    setupEventListeners();
    setupDragAndDrop();
});

function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}

// --- Fetch & Render ---

async function loadPeople() {
    try {
        const res = await fetch(`${API_BASE}/people`);
        people = await res.json();
        renderPeople();
    } catch (err) {
        showToast('Failed to load people. Database error.', true);
    }
}

function renderPeople() {
    peopleListEl.innerHTML = '';

    // Sort logic happens primarily on backend, but we ensure local items match the array layout
    people.forEach(person => {
        const li = document.createElement('li');
        li.className = `list-item person-item ${currentPersonId === person.id ? 'active' : ''}`;
        li.draggable = true;
        li.dataset.id = person.id;
        li.dataset.type = 'person';

        li.innerHTML = `<span class="person-name">${person.name}</span>`;

        li.addEventListener('click', () => selectPerson(person.id));
        peopleListEl.appendChild(li);
    });
}

async function selectPerson(id) {
    currentPersonId = id;
    const person = people.find(p => p.id === id);
    if (!person) return;

    currentPersonNameEl.textContent = person.name;
    giftsSection.classList.remove('hidden');

    // Collapse people section on mobile
    peopleSection.classList.add('collapsed-mobile');
    btnShowPeople.classList.remove('hidden');

    renderPeople(); // Update active class

    await loadGifts(id);
}

async function loadGifts(personId) {
    try {
        const res = await fetch(`${API_BASE}/gifts/${personId}`);
        currentGifts = await res.json();
        renderGifts();
    } catch (err) {
        showToast('Failed to load gifts.', true);
    }
}

function renderGifts() {
    unpurchasedListEl.innerHTML = '';
    purchasedListEl.innerHTML = '';

    const unpurchased = currentGifts.filter(g => !g.purchased);
    const purchased = currentGifts.filter(g => g.purchased);

    if (unpurchased.length === 0) {
        noGiftsMsg.classList.remove('hidden');
    } else {
        noGiftsMsg.classList.add('hidden');
        unpurchased.forEach(gift => renderGiftItem(gift, unpurchasedListEl));
    }

    purchased.forEach(gift => renderGiftItem(gift, purchasedListEl));
}

function renderGiftItem(gift, container) {
    const li = document.createElement('li');
    li.className = 'list-item gift-item';
    li.draggable = true;
    li.dataset.id = gift.id;
    li.dataset.type = 'gift';

    const content = document.createElement('div');
    content.className = 'gift-content';

    const desc = document.createElement('div');
    desc.className = 'gift-desc';
    desc.textContent = gift.description;
    content.appendChild(desc);

    if (gift.link) {
        const link = document.createElement('a');
        link.className = 'gift-link';
        link.href = gift.link;
        link.target = '_blank';
        link.textContent = gift.link;
        content.appendChild(link);
    }

    const actions = document.createElement('div');
    actions.className = 'gift-actions';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'gift-checkbox';
    checkbox.checked = gift.purchased;
    checkbox.addEventListener('change', async (e) => {
        // Toggle purchased status
        const updated = { ...gift, purchased: e.target.checked };
        try {
            const res = await fetch(`${API_BASE}/gifts/${gift.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
            if (res.ok) {
                await loadGifts(currentPersonId);
            } else {
                e.target.checked = !e.target.checked; // Revert
                showToast('Failed to update gift', true);
            }
        } catch (err) {
            e.target.checked = !e.target.checked;
            showToast('Network error', true);
        }
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openGiftModal(gift));

    actions.appendChild(editBtn);
    actions.appendChild(checkbox);

    li.appendChild(content);
    li.appendChild(actions);
    container.appendChild(li);
}

// --- Event Listeners and Modals ---

function setupEventListeners() {
    // Add Person
    document.getElementById('btn-add-person').addEventListener('click', () => {
        openPersonModal();
    });

    // Edit Person
    document.getElementById('btn-edit-person').addEventListener('click', () => {
        const person = people.find(p => p.id === currentPersonId);
        openPersonModal(person);
    });

    // Add Gift
    document.getElementById('btn-add-gift').addEventListener('click', () => {
        openGiftModal();
    });

    // Share Gifts
    document.getElementById('btn-share-gifts').addEventListener('click', async () => {
        if (!currentPersonId) return;
        const person = people.find(p => p.id === currentPersonId);
        if (!person) return;

        const unpurchased = currentGifts.filter(g => !g.purchased);
        let text = `### ${person.name}'s Gift Ideas\n`;
        if (unpurchased.length === 0) {
            text += `- No gifts added yet.\n`;
        } else {
            unpurchased.forEach(g => {
                if (g.link) {
                    text += `- [${g.description}](${g.link})\n`;
                } else {
                    text += `- ${g.description}\n`;
                }
            });
        }

        try {
            await navigator.clipboard.writeText(text);
            showToast('Gift ideas copied to clipboard!');
        } catch (err) {
            showToast('Failed to copy to clipboard', true);
        }
    });

    // Mobile Navigation
    if (btnShowPeople) {
        btnShowPeople.addEventListener('click', () => {
            peopleSection.classList.remove('collapsed-mobile');
            btnShowPeople.classList.add('hidden');
        });
    }

    if (btnBackPeople) {
        btnBackPeople.addEventListener('click', () => {
            peopleSection.classList.remove('collapsed-mobile');
            btnShowPeople.classList.add('hidden');
        });
    }

    // Cancel buttons
    document.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            personModal.classList.add('hidden');
            giftModal.classList.add('hidden');
        });
    });

    // Submits
    personForm.addEventListener('submit', handlePersonSubmit);
    giftForm.addEventListener('submit', handleGiftSubmit);

    // Deletes
    btnDeletePerson.addEventListener('click', handleDeletePerson);
    btnDeleteGift.addEventListener('click', handleDeleteGift);
}

function openPersonModal(person = null) {
    personIdInput.value = person ? person.id : '';
    personNameInput.value = person ? person.name : '';
    document.getElementById('person-modal-title').textContent = person ? 'Edit Person' : 'Add Person';

    if (person) {
        btnDeletePerson.classList.remove('hidden');
    } else {
        btnDeletePerson.classList.add('hidden');
    }

    personModal.classList.remove('hidden');
    personNameInput.focus();
}

async function handlePersonSubmit(e) {
    e.preventDefault();
    const id = personIdInput.value;
    const name = personNameInput.value.trim();

    const url = id ? `${API_BASE}/people/${id}` : `${API_BASE}/people`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Failed to save', true);
            return;
        }

        personModal.classList.add('hidden');
        await loadPeople();
        if (id && currentPersonId == id) {
            currentPersonNameEl.textContent = name;
        }
    } catch (err) {
        showToast('Network error', true);
    }
}

async function handleDeletePerson() {
    if (!confirm('Are you sure you want to delete this person and all their gifts?')) return;

    const id = personIdInput.value;
    try {
        const res = await fetch(`${API_BASE}/people/${id}`, { method: 'DELETE' });
        if (res.ok) {
            personModal.classList.add('hidden');
            if (currentPersonId == id) {
                currentPersonId = null;
                giftsSection.classList.add('hidden');
            }
            await loadPeople();
        } else {
            showToast('Failed to delete', true);
        }
    } catch (err) {
        showToast('Network error', true);
    }
}

function openGiftModal(gift = null) {
    giftIdInput.value = gift ? gift.id : '';
    giftDescInput.value = gift ? gift.description : '';
    giftLinkInput.value = gift ? (gift.link || '') : '';
    giftPurchasedInput.checked = gift ? gift.purchased : false;

    document.getElementById('gift-modal-title').textContent = gift ? 'Edit Gift' : 'Add Gift';

    if (gift) {
        btnDeleteGift.classList.remove('hidden');
    } else {
        btnDeleteGift.classList.add('hidden');
    }

    giftModal.classList.remove('hidden');
    giftDescInput.focus();
}

async function handleGiftSubmit(e) {
    e.preventDefault();
    const id = giftIdInput.value;
    const description = giftDescInput.value.trim();
    const link = giftLinkInput.value.trim();
    const purchased = giftPurchasedInput.checked;

    // Client side URL validation
    if (link && !isValidUrl(link)) {
        showToast('Invalid URL format', true);
        return;
    }

    const url = id ? `${API_BASE}/gifts/${id}` : `${API_BASE}/gifts`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personId: currentPersonId, description, link, purchased })
        });

        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Failed to save', true);
            return;
        }

        giftModal.classList.add('hidden');
        await loadGifts(currentPersonId);
    } catch (err) {
        showToast('Network error', true);
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

async function handleDeleteGift() {
    if (!confirm('Are you sure you want to delete this gift?')) return;

    const id = giftIdInput.value;
    try {
        const res = await fetch(`${API_BASE}/gifts/${id}`, { method: 'DELETE' });
        if (res.ok) {
            giftModal.classList.add('hidden');
            await loadGifts(currentPersonId);
        } else {
            showToast('Failed to delete', true);
        }
    } catch (err) {
        showToast('Network error', true);
    }
}

// --- Drag and Drop ---
let draggedItem = null;

function setupDragAndDrop() {
    document.addEventListener('dragstart', e => {
        if (!e.target.classList || !e.target.classList.contains('list-item')) return;
        draggedItem = e.target;
        setTimeout(() => e.target.classList.add('dragging'), 0);
    });

    document.addEventListener('dragend', e => {
        if (!e.target.classList || !e.target.classList.contains('list-item')) return;
        e.target.classList.remove('dragging');

        // Remove drag-over class from all siblings
        const siblings = e.target.parentNode.querySelectorAll('.list-item');
        siblings.forEach(s => s.classList.remove('drag-over'));

        draggedItem = null;

        // Save new order to backend
        saveOrder(e.target.parentNode, e.target.dataset.type);
    });

    // Lists logic
    const lists = [peopleListEl, unpurchasedListEl, purchasedListEl];
    lists.forEach(list => {
        list.addEventListener('dragover', e => {
            e.preventDefault();
            if (!draggedItem) return;

            // Prevent dragging between different lists conceptually
            if (draggedItem.parentNode !== list) {
                // Not ideal UX, but limits cross-list dragging
                return;
            }

            const afterElement = getDragAfterElement(list, e.clientY);

            // Remove previous marker
            [...list.querySelectorAll('.list-item')].forEach(el => el.classList.remove('drag-over'));

            if (afterElement == null) {
                list.appendChild(draggedItem);
            } else {
                list.insertBefore(draggedItem, afterElement);
                afterElement.classList.add('drag-over');
            }
        });

        list.addEventListener('dragleave', e => {
            if (e.target.classList && e.target.classList.contains('list-item')) {
                e.target.classList.remove('drag-over');
            }
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.list-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveOrder(listElement, type) {
    const items = [...listElement.querySelectorAll('.list-item')];
    const orderedIds = items.map(item => item.dataset.id);

    const endpoint = type === 'person' ? '/people/reorder' : '/gifts/reorder';

    try {
        await fetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedIds })
        });
    } catch (err) {
        showToast('Failed to save arrangement', true);
    }
}
