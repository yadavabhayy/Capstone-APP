/**
 * SecureVault Frontend Application
 * Handles authentication, UI states, item management, and client-side filtering
 */

// Application State
const state = {
  user: null,
  token: localStorage.getItem('vault_token') || null,
  items: [],
  filters: {
    search: '',
    category: 'All',
    status: 'All',
    priority: 'All',
    sort: 'newest'
  },
  pendingDeleteId: null
};

// DOM Elements
const elements = {
  // Navigation
  navActions: document.getElementById('nav-actions'),

  // Views
  authView: document.getElementById('auth-view'),
  vaultView: document.getElementById('vault-view'),

  // Auth elements
  authAlert: document.getElementById('auth-alert'),
  tabLogin: document.getElementById('tab-login'),
  tabRegister: document.getElementById('tab-register'),
  formLogin: document.getElementById('form-login'),
  formRegister: document.getElementById('form-register'),
  btnDemoAlice: document.getElementById('btn-demo-alice'),
  btnDemoBob: document.getElementById('btn-demo-bob'),

  // Banner
  bannerUserName: document.getElementById('banner-user-name'),
  bannerUserEmail: document.getElementById('banner-user-email'),
  bannerUserId: document.getElementById('banner-user-id'),
  btnQuickSwitchDemo: document.getElementById('btn-quick-switch-demo'),

  // Stats
  statTotal: document.getElementById('stat-total'),
  statActive: document.getElementById('stat-active'),
  statCompleted: document.getElementById('stat-completed'),
  statHigh: document.getElementById('stat-high'),

  // Filters & Controls
  filterSearch: document.getElementById('filter-search'),
  categoryPills: document.getElementById('category-pills'),
  filterStatus: document.getElementById('filter-status'),
  filterPriority: document.getElementById('filter-priority'),
  filterSort: document.getElementById('filter-sort'),
  itemsCountBadge: document.getElementById('items-count-badge'),
  btnOpenCreateModal: document.getElementById('btn-open-create-modal'),

  // Grid & Empty State
  itemsGrid: document.getElementById('items-grid'),
  emptyState: document.getElementById('empty-state'),
  btnEmptyCreate: document.getElementById('btn-empty-create'),

  // Create/Edit Modal
  itemModal: document.getElementById('item-modal'),
  modalTitle: document.getElementById('modal-title'),
  formItem: document.getElementById('form-item'),
  itemId: document.getElementById('item-id'),
  itemTitle: document.getElementById('item-title'),
  itemCategory: document.getElementById('item-category'),
  itemPriority: document.getElementById('item-priority'),
  itemStatus: document.getElementById('item-status'),
  itemContent: document.getElementById('item-content'),
  itemPinned: document.getElementById('item-pinned'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  btnCancelModal: document.getElementById('btn-cancel-modal'),

  // Delete Modal
  deleteModal: document.getElementById('delete-modal'),
  deleteItemTitle: document.getElementById('delete-item-title'),
  btnCloseDeleteModal: document.getElementById('btn-close-delete-modal'),
  btnCancelDelete: document.getElementById('btn-cancel-delete'),
  btnConfirmDelete: document.getElementById('btn-confirm-delete'),

  // Toasts
  toastContainer: document.getElementById('toast-container')
};

// ===================================================================
// API Helper
// ===================================================================

async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // If unauthorized, clear session
    if (response.status === 401 && state.user) {
      handleLogout(false);
      showToast('Session expired. Please sign in again.', 'error');
    }
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

// ===================================================================
// Authentication
// ===================================================================

async function checkAuthSession() {
  if (!state.token) {
    renderLoggedOutView();
    return;
  }

  try {
    const res = await api('/api/auth/me');
    if (res.success && res.user) {
      state.user = res.user;
      renderLoggedInView();
      await loadDashboardData();
    } else {
      renderLoggedOutView();
    }
  } catch (err) {
    renderLoggedOutView();
  }
}

async function handleLogin(email, password) {
  try {
    hideAlert();
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('vault_token', res.token);

    showToast(`Welcome back, ${res.user.name}!`, 'success');
    renderLoggedInView();
    await loadDashboardData();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

async function handleRegister(name, email, password) {
  try {
    hideAlert();
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('vault_token', res.token);

    showToast(`Account created! Welcome, ${res.user.name}.`, 'success');
    renderLoggedInView();
    await loadDashboardData();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

async function handleLogout(notify = true) {
  try {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  } finally {
    state.user = null;
    state.token = null;
    state.items = [];
    localStorage.removeItem('vault_token');
    renderLoggedOutView();
    if (notify) {
      showToast('You have been logged out securely.', 'info');
    }
  }
}

// ===================================================================
// Vault Data Management
// ===================================================================

async function loadDashboardData() {
  await Promise.all([fetchItems(), fetchStats()]);
}

async function fetchItems() {
  try {
    const query = new URLSearchParams();
    if (state.filters.category && state.filters.category !== 'All') {
      query.set('category', state.filters.category);
    }
    if (state.filters.status && state.filters.status !== 'All') {
      query.set('status', state.filters.status);
    }
    if (state.filters.priority && state.filters.priority !== 'All') {
      query.set('priority', state.filters.priority);
    }
    if (state.filters.sort) {
      query.set('sort', state.filters.sort);
    }
    if (state.filters.search && state.filters.search.trim()) {
      query.set('search', state.filters.search.trim());
    }

    const res = await api(`/api/vault?${query.toString()}`);
    state.items = res.data || [];
    renderItemsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function fetchStats() {
  try {
    const res = await api('/api/vault/stats');
    if (res.stats) {
      elements.statTotal.textContent = res.stats.total;
      elements.statActive.textContent = res.stats.active;
      elements.statCompleted.textContent = res.stats.completed;
      elements.statHigh.textContent = res.stats.highPriority;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function saveItem(payload) {
  const isEdit = Boolean(state.itemIdEditing);
  try {
    if (isEdit) {
      await api(`/api/vault/${state.itemIdEditing}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Vault item updated successfully.', 'success');
    } else {
      await api('/api/vault', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('New item encrypted and saved to your vault.', 'success');
    }

    closeItemModal();
    await loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteItem(id) {
  try {
    await api(`/api/vault/${id}`, { method: 'DELETE' });
    showToast('Item deleted from your vault.', 'info');
    closeDeleteModal();
    await loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleItemStatus(id, currentStatus) {
  try {
    const newStatus = currentStatus === 'completed' ? 'active' : 'completed';
    await api(`/api/vault/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Marked as ${newStatus}.`, 'info');
    await loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===================================================================
// UI Rendering
// ===================================================================

function renderLoggedOutView() {
  elements.vaultView.classList.add('hidden');
  elements.authView.classList.remove('hidden');

  elements.navActions.innerHTML = `
    <span class="user-nav-badge">
      <span class="pulse-dot"></span>
      <span class="user-nav-name" style="color: var(--text-muted);">Signed Out</span>
    </span>
  `;
}

function renderLoggedInView() {
  elements.authView.classList.add('hidden');
  elements.vaultView.classList.remove('hidden');

  const initial = state.user.name ? state.user.name.charAt(0).toUpperCase() : 'U';

  elements.navActions.innerHTML = `
    <div class="user-nav-badge">
      <div class="user-nav-avatar">${initial}</div>
      <span class="user-nav-name">${escapeHtml(state.user.name)}</span>
    </div>
    <button class="btn btn-sm btn-secondary" id="btn-logout">
      <span>Logout</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>
  `;

  document.getElementById('btn-logout').addEventListener('click', () => handleLogout(true));

  // Update banner
  elements.bannerUserName.textContent = state.user.name;
  elements.bannerUserEmail.textContent = state.user.email;
  elements.bannerUserId.textContent = state.user.id;
}

function renderItemsList() {
  elements.itemsCountBadge.textContent = state.items.length;

  if (state.items.length === 0) {
    elements.itemsGrid.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  elements.itemsGrid.innerHTML = state.items.map(item => {
    const isCompleted = item.status === 'completed';
    const isPinned = Boolean(item.pinned);
    const catClass = `tag-cat-${(item.category || 'personal').toLowerCase()}`;
    const priorityClass = `tag-priority-${item.priority || 'medium'}`;

    const formattedDate = new Date(item.created_at || Date.now()).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    return `
      <div class="vault-card ${isPinned ? 'pinned' : ''}" data-id="${item.id}">
        <div>
          <div class="card-top">
            <div class="card-tags">
              <span class="tag tag-cat ${catClass}">${escapeHtml(item.category || 'General')}</span>
              <span class="tag ${priorityClass}">${escapeHtml(item.priority || 'medium')}</span>
              ${isCompleted ? '<span class="tag tag-status-completed">Completed</span>' : ''}
            </div>
            ${isPinned ? '<span class="pin-indicator" title="Pinned item">📌</span>' : ''}
          </div>

          <h3 class="card-title ${isCompleted ? 'completed' : ''}">${escapeHtml(item.title)}</h3>
          ${item.content ? `<div class="card-content">${escapeHtml(item.content)}</div>` : ''}
        </div>

        <div class="card-footer">
          <span class="card-meta">${formattedDate}</span>
          <div class="card-actions">
            <button class="btn-icon btn-icon-check ${isCompleted ? 'is-completed' : ''}" data-action="toggle" data-id="${item.id}" data-status="${item.status}" title="${isCompleted ? 'Mark Active' : 'Mark Completed'}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="btn-icon" data-action="edit" data-id="${item.id}" title="Edit Item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-icon-danger" data-action="delete" data-id="${item.id}" title="Delete Item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===================================================================
// Modals & UI Helpers
// ===================================================================

function openCreateModal() {
  state.itemIdEditing = null;
  elements.modalTitle.textContent = 'Create Private Item';
  elements.itemId.value = '';
  elements.itemTitle.value = '';
  elements.itemCategory.value = 'Work';
  elements.itemPriority.value = 'medium';
  elements.itemStatus.value = 'active';
  elements.itemContent.value = '';
  elements.itemPinned.checked = false;
  elements.itemModal.classList.remove('hidden');
  elements.itemTitle.focus();
}

function openEditModal(item) {
  state.itemIdEditing = item.id;
  elements.modalTitle.textContent = 'Edit Private Item';
  elements.itemId.value = item.id;
  elements.itemTitle.value = item.title;
  elements.itemCategory.value = item.category || 'Personal';
  elements.itemPriority.value = item.priority || 'medium';
  elements.itemStatus.value = item.status || 'active';
  elements.itemContent.value = item.content || '';
  elements.itemPinned.checked = Boolean(item.pinned);
  elements.itemModal.classList.remove('hidden');
  elements.itemTitle.focus();
}

function closeItemModal() {
  elements.itemModal.classList.add('hidden');
  state.itemIdEditing = null;
}

function openDeleteModal(id, title) {
  state.pendingDeleteId = id;
  elements.deleteItemTitle.textContent = `"${title}"`;
  elements.deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
  elements.deleteModal.classList.add('hidden');
  state.pendingDeleteId = null;
}

function showAlert(message, type = 'danger') {
  elements.authAlert.className = `alert alert-${type}`;
  elements.authAlert.textContent = message;
  elements.authAlert.classList.remove('hidden');
}

function hideAlert() {
  elements.authAlert.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===================================================================
// Event Listeners
// ===================================================================

// Auth Tabs
elements.tabLogin.addEventListener('click', () => {
  elements.tabLogin.classList.add('active');
  elements.tabRegister.classList.remove('active');
  elements.formLogin.classList.remove('hidden');
  elements.formRegister.classList.add('hidden');
  hideAlert();
});

elements.tabRegister.addEventListener('click', () => {
  elements.tabRegister.classList.add('active');
  elements.tabLogin.classList.remove('active');
  elements.formRegister.classList.remove('hidden');
  elements.formLogin.classList.add('hidden');
  hideAlert();
});

// Login Form Submit
elements.formLogin.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  handleLogin(email, password);
});

// Register Form Submit
elements.formRegister.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  handleRegister(name, email, password);
});

// Demo Buttons
elements.btnDemoAlice.addEventListener('click', () => {
  document.getElementById('login-email').value = 'alice@example.com';
  document.getElementById('login-password').value = 'Password123!';
  handleLogin('alice@example.com', 'Password123!');
});

elements.btnDemoBob.addEventListener('click', () => {
  document.getElementById('login-email').value = 'bob@example.com';
  document.getElementById('login-password').value = 'Password123!';
  handleLogin('bob@example.com', 'Password123!');
});

// Quick switch between demo users from inside dashboard
elements.btnQuickSwitchDemo.addEventListener('click', async () => {
  const targetEmail = state.user && state.user.email === 'alice@example.com' ? 'bob@example.com' : 'alice@example.com';
  await handleLogout(false);
  await handleLogin(targetEmail, 'Password123!');
});

// Password Toggle Buttons
document.querySelectorAll('.btn-toggle-password').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🔒';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  });
});

// Search Filter with debounce
let debounceTimeout = null;
elements.filterSearch.addEventListener('input', (e) => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    state.filters.search = e.target.value;
    fetchItems();
  }, 250);
});

// Category Pills
elements.categoryPills.addEventListener('click', (e) => {
  if (e.target.classList.contains('pill')) {
    elements.categoryPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    state.filters.category = e.target.getAttribute('data-category');
    fetchItems();
  }
});

// Status, Priority & Sort Filters
elements.filterStatus.addEventListener('change', (e) => {
  state.filters.status = e.target.value;
  fetchItems();
});

elements.filterPriority.addEventListener('change', (e) => {
  state.filters.priority = e.target.value;
  fetchItems();
});

elements.filterSort.addEventListener('change', (e) => {
  state.filters.sort = e.target.value;
  fetchItems();
});

// Open Item Modals
elements.btnOpenCreateModal.addEventListener('click', openCreateModal);
elements.btnEmptyCreate.addEventListener('click', openCreateModal);
elements.btnCloseModal.addEventListener('click', closeItemModal);
elements.btnCancelModal.addEventListener('click', closeItemModal);

// Item Modal Form Submit
elements.formItem.addEventListener('submit', (e) => {
  e.preventDefault();
  const payload = {
    title: elements.itemTitle.value.trim(),
    category: elements.itemCategory.value,
    priority: elements.itemPriority.value,
    status: elements.itemStatus.value,
    content: elements.itemContent.value.trim(),
    pinned: elements.itemPinned.checked ? 1 : 0
  };
  saveItem(payload);
});

// Delete Modal Buttons
elements.btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
elements.btnCancelDelete.addEventListener('click', closeDeleteModal);
elements.btnConfirmDelete.addEventListener('click', () => {
  if (state.pendingDeleteId) {
    deleteItem(state.pendingDeleteId);
  }
});

// Grid Delegate for Actions (Toggle, Edit, Delete)
elements.itemsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.getAttribute('data-action');
  const id = parseInt(btn.getAttribute('data-id'), 10);
  const item = state.items.find(i => i.id === id);

  if (action === 'toggle' && item) {
    toggleItemStatus(id, item.status);
  } else if (action === 'edit' && item) {
    openEditModal(item);
  } else if (action === 'delete' && item) {
    openDeleteModal(id, item.title);
  }
});

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
});
