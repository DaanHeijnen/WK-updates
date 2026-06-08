const API = '/.netlify/functions';
const tokenKey = 'oranje_admin_token';

function $(selector) { return document.querySelector(selector); }
function $all(selector) { return [...document.querySelectorAll(selector)]; }
function token() { return localStorage.getItem(tokenKey); }
function setToken(value) { localStorage.setItem(tokenKey, value); }
function clearToken() { localStorage.removeItem(tokenKey); }

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function compactLikes(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}m`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function renderPhotos(photos = []) {
  if (!photos.length) return '';
  return `<div class="photo-grid ${photos.length > 1 ? 'multi' : ''}">${photos.map((photo) => `
    <img src="${photo.url}" alt="${escapeHtml(photo.altText || 'Oranje foto')}" loading="lazy">
  `).join('')}</div>`;
}

function renderUpdate(update, isLatest = false) {
  return `
    <article class="update-card ${isLatest ? 'latest' : ''}">
      ${renderPhotos(update.photos)}
      <div class="update-inner">
        <div class="update-meta">
          <span class="tag">${isLatest ? 'Laatste update' : 'Update'}</span>
          <time class="update-date" datetime="${update.createdAt}">${formatDate(update.createdAt)}</time>
        </div>
        <h3>${escapeHtml(update.title)}</h3>
        <div class="update-content">${update.contentHtml}</div>
        <div class="update-footer">
          <button class="like-button" type="button" data-like-id="${update.id}">
            <span class="heart">♡</span>
            <span data-like-count="${update.id}">${compactLikes(update.likesCount)}</span>
          </button>
        </div>
      </div>
    </article>`;
}

async function initFeed() {
  const list = $('#updates-list');
  const latest = $('#latest-update');
  const latestSection = $('#latest-section');
  const empty = $('#empty-feed');
  const error = $('#feed-error');
  try {
    const data = await request('/updates');
    const updates = data.updates || [];
    if (!updates.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (latestSection) latestSection.hidden = false;
    if (latest) latest.innerHTML = renderUpdate(updates[0], true);
    if (list) list.innerHTML = updates.slice(1).map((update) => renderUpdate(update, false)).join('');
    bindLikes();
  } catch (err) {
    if (error) {
      error.textContent = err.message;
      error.hidden = false;
    }
  }
}

function bindLikes() {
  $all('[data-like-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.likeId;
      button.disabled = true;
      try {
        const data = await request('/update-like', { method: 'POST', body: JSON.stringify({ id }) });
        const count = document.querySelector(`[data-like-count="${id}"]`);
        if (count) count.textContent = compactLikes(data.likesCount);
        const heart = button.querySelector('.heart');
        if (heart) heart.textContent = '♥';
      } catch (err) {
        alert(err.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function initShare() {
  const button = $('#share-site');
  if (!button) return;
  button.addEventListener('click', async () => {
    const shareData = { title: 'Oranje Updates', text: 'Bekijk de laatste Oranje updates.', url: window.location.origin };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.origin);
        const oldText = button.textContent;
        button.textContent = '✓';
        setTimeout(() => { button.textContent = oldText; }, 1600);
      }
    } catch (_) {}
  });
}

async function requireLogin() {
  try {
    await request('/auth-check');
    return true;
  } catch (_) {
    clearToken();
    return false;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Foto kon niet worden gelezen.'));
    reader.readAsDataURL(file);
  });
}

async function collectPhotos(form) {
  const input = form.querySelector('input[type="file"]');
  const files = [...(input?.files || [])];
  if (files.length > 5) throw new Error('Je kunt maximaal 5 foto’s per keer uploaden.');
  const photos = [];
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Alleen JPG, PNG en WebP zijn toegestaan.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Een foto mag maximaal 5 MB zijn.');
    photos.push({ name: file.name, dataUrl: await fileToDataUrl(file), altText: file.name.replace(/\.[^.]+$/, '') });
  }
  return photos;
}

async function initAdmin() {
  const loginView = $('#admin-login-view');
  const dashboardView = $('#admin-dashboard-view');
  const loginForm = $('#login-form');
  const loginError = $('#login-error');
  const updateForm = $('#update-form');
  const formPanel = $('#admin-form-panel');
  const formTitle = $('#admin-form-title');
  const formError = $('#form-error');
  const list = $('#admin-list');
  const adminError = $('#admin-error');
  const existingPhotos = $('#existing-photos');
  const deletePhotoIds = new Set();
  let currentMode = 'create';

  async function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    await loadAdminUpdates();
  }

  function showLogin() {
    dashboardView.hidden = true;
    loginView.hidden = false;
  }

  function resetForm() {
    currentMode = 'create';
    deletePhotoIds.clear();
    updateForm.reset();
    updateForm.elements.id.value = '';
    existingPhotos.innerHTML = '';
    formTitle.textContent = 'Nieuwe update';
    formError.hidden = true;
  }

  function openCreate() {
    resetForm();
    formPanel.hidden = false;
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeForm() {
    formPanel.hidden = true;
    resetForm();
  }

  async function openEdit(id) {
    resetForm();
    currentMode = 'edit';
    formTitle.textContent = 'Update bewerken';
    formPanel.hidden = false;
    try {
      const data = await request(`/update-get?id=${encodeURIComponent(id)}`);
      const update = data.update;
      updateForm.elements.id.value = update.id;
      updateForm.elements.title.value = update.title;
      updateForm.elements.contentMarkdown.value = update.contentMarkdown;
      existingPhotos.innerHTML = update.photos.length ? `<p><strong>Bestaande foto’s</strong></p>${update.photos.map((photo) => `
        <label class="photo-admin">
          <img src="${photo.url}" alt="${escapeHtml(photo.altText || '')}">
          <span><input type="checkbox" value="${photo.id}" data-photo-delete> Verwijder deze foto</span>
        </label>`).join('')}` : '';
      $all('[data-photo-delete]').forEach((input) => input.addEventListener('change', () => {
        if (input.checked) deletePhotoIds.add(Number(input.value));
        else deletePhotoIds.delete(Number(input.value));
      }));
      formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      formError.textContent = err.message;
      formError.hidden = false;
    }
  }

  async function loadAdminUpdates() {
    try {
      adminError.hidden = true;
      const data = await request('/admin-updates');
      const updates = data.updates || [];
      const totalLikes = updates.reduce((sum, update) => sum + Number(update.likesCount || 0), 0);
      $('#stat-updates').textContent = updates.length;
      $('#stat-likes').textContent = compactLikes(totalLikes);
      if (!updates.length) {
        list.innerHTML = '<p class="empty-state">Er zijn nog geen updates geplaatst.</p>';
        return;
      }
      list.innerHTML = updates.map((update) => `
        <article class="admin-item">
          <h2>${escapeHtml(update.title)}</h2>
          <p>${formatDate(update.createdAt)} · ${compactLikes(update.likesCount)} likes · ${update.photos.length} foto’s</p>
          <div class="admin-actions">
            <button class="btn btn-light" type="button" data-edit-id="${update.id}">Bewerken</button>
            <button class="btn btn-dark" type="button" data-delete-id="${update.id}">Verwijderen</button>
          </div>
        </article>`).join('');
      $all('[data-edit-id]').forEach((button) => button.addEventListener('click', () => openEdit(button.dataset.editId)));
      $all('[data-delete-id]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!confirm('Weet je zeker dat je deze update wilt verwijderen?')) return;
          try {
            await request('/update-delete', { method: 'POST', body: JSON.stringify({ id: button.dataset.deleteId }) });
            await loadAdminUpdates();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (err) {
      adminError.textContent = err.message;
      adminError.hidden = false;
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    try {
      const body = Object.fromEntries(new FormData(loginForm));
      const data = await request('/auth-login', { method: 'POST', body: JSON.stringify(body) });
      setToken(data.token);
      await showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    }
  });

  updateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.hidden = true;
    try {
      const formData = new FormData(updateForm);
      const body = {
        title: formData.get('title'),
        contentMarkdown: formData.get('contentMarkdown'),
        photos: await collectPhotos(updateForm)
      };
      if (currentMode === 'edit') {
        body.id = formData.get('id');
        body.deletePhotoIds = [...deletePhotoIds];
        await request('/update-edit', { method: 'POST', body: JSON.stringify(body) });
      } else {
        await request('/update-create', { method: 'POST', body: JSON.stringify(body) });
      }
      closeForm();
      await loadAdminUpdates();
    } catch (err) {
      formError.textContent = err.message;
      formError.hidden = false;
    }
  });

  $('#logout-button').addEventListener('click', () => {
    clearToken();
    showLogin();
  });
  $all('[data-open-create]').forEach((button) => button.addEventListener('click', openCreate));
  $all('[data-close-form]').forEach((button) => button.addEventListener('click', closeForm));

  if (await requireLogin()) await showDashboard();
  else showLogin();
}

async function initSetup() {
  const form = $('#setup-form');
  if (!form) return;
  const message = $('#setup-message');
  const error = $('#setup-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.hidden = true;
    error.hidden = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      const data = await request('/setup-db', { method: 'POST', body: JSON.stringify(body) });
      message.textContent = data.message + ' Je kunt nu inloggen via /admin.html.';
      message.hidden = false;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

const page = document.body.dataset.page;
if (page === 'feed') { initFeed(); initShare(); }
if (page === 'matches') initShare();
if (page === 'admin') initAdmin();
if (page === 'setup') initSetup();
