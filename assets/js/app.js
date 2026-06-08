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
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value));
}

function compactLikes(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}m`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function renderPhotos(photos = []) {
  if (!photos.length) return '';
  return `<div class="photo-grid ${photos.length > 1 ? 'multi' : ''}">${photos.map((photo) => `
    <img src="${photo.url}" alt="${escapeHtml(photo.altText || 'WK foto')}" loading="lazy">
  `).join('')}</div>`;
}

function renderUpdate(update, isLatest = false) {
  return `
    <article class="update-card ${isLatest ? 'latest' : ''}">
      <div class="update-inner">
        <div class="update-meta">
          <span class="tag">${isLatest ? 'Nieuw' : 'Update'}</span>
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
      ${renderPhotos(update.photos)}
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
      empty.hidden = false;
      return;
    }
    latestSection.hidden = false;
    latest.innerHTML = renderUpdate(updates[0], true);
    list.innerHTML = updates.slice(1).map((update) => renderUpdate(update, false)).join('');
    bindLikes();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
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
        button.querySelector('.heart').textContent = '♥';
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
    const shareData = {
      title: 'Oranje Updates',
      text: 'Bekijk de laatste WK-updates van Oranje.',
      url: window.location.origin
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.origin);
        button.textContent = 'Link gekopieerd';
        setTimeout(() => { button.textContent = 'Deel website'; }, 1800);
      }
    } catch (_) {}
  });
}

async function initLogin() {
  const form = $('#login-form');
  const error = $('#login-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const body = Object.fromEntries(new FormData(form));
    try {
      const data = await request('/auth-login', { method: 'POST', body: JSON.stringify(body) });
      setToken(data.token);
      window.location.href = '/admin-overview.html';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

async function requireLogin() {
  try {
    await request('/auth-check');
  } catch (_) {
    clearToken();
    window.location.href = '/admin-login.html';
  }
}

function initLogout() {
  const button = $('#logout-button');
  if (!button) return;
  button.addEventListener('click', () => {
    clearToken();
    window.location.href = '/admin-login.html';
  });
}

async function initAdminOverview() {
  await requireLogin();
  initLogout();
  const list = $('#admin-list');
  const error = $('#admin-error');
  try {
    const data = await request('/admin-updates');
    const updates = data.updates || [];
    if (!updates.length) {
      list.innerHTML = '<p class="empty-state">Er zijn nog geen updates geplaatst.</p>';
      return;
    }
    list.innerHTML = updates.map((update) => `
      <article class="admin-item">
        <h2>${escapeHtml(update.title)}</h2>
        <p>${formatDate(update.createdAt)} · ${compactLikes(update.likesCount)} likes · ${update.photos.length} foto’s</p>
        <div class="admin-actions">
          <a class="btn btn-secondary" href="/admin-edit.html?id=${update.id}">Bewerken</a>
          <button class="btn btn-ghost" type="button" data-delete-id="${update.id}">Verwijderen</button>
        </div>
      </article>`).join('');
    $all('[data-delete-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Weet je zeker dat je deze update wilt verwijderen?')) return;
        try {
          await request('/update-delete', { method: 'POST', body: JSON.stringify({ id: button.dataset.deleteId }) });
          button.closest('.admin-item').remove();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
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
  const files = [...(input.files || [])];
  if (files.length > 5) throw new Error('Je kunt maximaal 5 foto’s per keer uploaden.');
  const photos = [];
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Alleen JPG, PNG en WebP zijn toegestaan.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Een foto mag maximaal 5 MB zijn.');
    photos.push({ name: file.name, dataUrl: await fileToDataUrl(file), altText: file.name.replace(/\.[^.]+$/, '') });
  }
  return photos;
}

async function initCreate() {
  await requireLogin();
  const form = $('#update-form');
  const error = $('#form-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    try {
      const formData = new FormData(form);
      const body = {
        title: formData.get('title'),
        contentMarkdown: formData.get('contentMarkdown'),
        photos: await collectPhotos(form)
      };
      await request('/update-create', { method: 'POST', body: JSON.stringify(body) });
      window.location.href = '/admin-overview.html';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

async function initEdit() {
  await requireLogin();
  const form = $('#update-form');
  const error = $('#form-error');
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const deletePhotoIds = new Set();
  try {
    const data = await request(`/update-get?id=${encodeURIComponent(id)}`);
    const update = data.update;
    form.elements.id.value = update.id;
    form.elements.title.value = update.title;
    form.elements.contentMarkdown.value = update.contentMarkdown;
    const photosBox = $('#existing-photos');
    photosBox.innerHTML = update.photos.length ? `<p><strong>Bestaande foto’s</strong></p>${update.photos.map((photo) => `
      <label class="photo-admin">
        <img src="${photo.url}" alt="${escapeHtml(photo.altText)}">
        <span><input type="checkbox" value="${photo.id}" data-photo-delete> Verwijder deze foto</span>
      </label>`).join('')}` : '';
    $all('[data-photo-delete]').forEach((input) => input.addEventListener('change', () => {
      if (input.checked) deletePhotoIds.add(Number(input.value));
      else deletePhotoIds.delete(Number(input.value));
    }));
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    try {
      const formData = new FormData(form);
      const body = {
        id: formData.get('id'),
        title: formData.get('title'),
        contentMarkdown: formData.get('contentMarkdown'),
        deletePhotoIds: [...deletePhotoIds],
        photos: await collectPhotos(form)
      };
      await request('/update-edit', { method: 'POST', body: JSON.stringify(body) });
      window.location.href = '/admin-overview.html';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

async function initSetup() {
  const form = $('#setup-form');
  const message = $('#setup-message');
  const error = $('#setup-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.hidden = true;
    error.hidden = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      const data = await request('/setup-db', { method: 'POST', body: JSON.stringify(body) });
      message.textContent = data.message + ' Je kunt nu inloggen via /admin-login.html.';
      message.hidden = false;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

const page = document.body.dataset.page;
if (page === 'feed') { initFeed(); initShare(); }
if (page === 'login') initLogin();
if (page === 'admin-overview') initAdminOverview();
if (page === 'admin-create') initCreate();
if (page === 'admin-edit') initEdit();
if (page === 'setup') initSetup();


function formatLastUpdated(value) {
  if (!value) return 'Nog niet bijgewerkt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Onbekend';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 15) return 'zojuist bijgewerkt';
  if (diffSeconds < 60) return `${diffSeconds} seconden geleden bijgewerkt`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minuut' : 'minuten'} geleden bijgewerkt`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'uur' : 'uur'} geleden bijgewerkt`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden bijgewerkt`;
}

function startLastUpdatedCounter(value) {
  const box = $('#matches-updated-counter');
  if (!box) return;
  const render = () => {
    box.textContent = `Scores ${formatLastUpdated(value)}`;
  };
  render();
  window.setInterval(render, 30000);
}

function formatMatchDay(value) {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(value));
}

function formatMatchTime(value) {
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function matchStatusLabel(match) {
  if (match.state === 'played') return 'Afgelopen';
  if (match.state === 'live') return match.elapsed ? `Live · ${match.elapsed}’` : 'Live';
  if (match.statusShort === 'TBD') return 'Tijd nog onbekend';
  return formatMatchTime(match.date);
}

function renderTeam(name, logo, align = '') {
  const flag = logo && /^https?:\/\//i.test(logo)
    ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy">`
    : logo
      ? `<span class="team-flag" aria-hidden="true">${escapeHtml(logo)}</span>`
      : '<span class="team-placeholder">•</span>';
  return `<div class="match-team ${align}">
    ${flag}
    <span>${escapeHtml(name)}</span>
  </div>`;
}

function renderMatch(match, options = {}) {
  const score = match.state === 'upcoming'
    ? '<span class="score-vs">vs</span>'
    : `<span>${match.homeGoals ?? '-'}</span><span class="score-divider">-</span><span>${match.awayGoals ?? '-'}</span>`;
  const place = [match.venue, match.city].filter(Boolean).join(', ');
  const target = options.scrollTarget ? ' data-scroll-target="true"' : '';
  return `<article class="match-card ${match.state} ${options.today ? 'today-match' : ''}" id="match-${match.id}"${target}>
    <div class="match-topline">
      <span class="tag">${match.state === 'played' ? 'Uitslag' : match.state === 'live' ? 'Nu bezig' : 'Komt eraan'}</span>
      <span>${formatMatchDay(match.date)} · ${matchStatusLabel(match)}</span>
    </div>
    <div class="match-main">
      ${renderTeam(match.homeTeam, match.homeLogo, 'home')}
      <div class="match-score">${score}</div>
      ${renderTeam(match.awayTeam, match.awayLogo, 'away')}
    </div>
    <p class="match-details">${escapeHtml(match.round || 'WK wedstrijd')}${place ? ` · ${escapeHtml(place)}` : ''}</p>
  </article>`;
}

async function initMatches() {
  initShare();
  const loading = $('#matches-loading');
  const error = $('#matches-error');
  const todaySection = $('#today-section');
  const playedSection = $('#played-section');
  const upcomingSection = $('#upcoming-section');
  const todayBox = $('#today-matches');
  const playedBox = $('#played-matches');
  const upcomingBox = $('#upcoming-matches');

  try {
    const data = await request('/matches');
    const matches = data.matches || [];
    const todayKey = data.todayKey;
    startLastUpdatedCounter(data.lastUpdatedAt || data.fetchedAt);
    const sourceInfo = $('#matches-source-info');
    if (sourceInfo) {
      const warning = data.warning ? ` Laatst bekende data wordt getoond: ${data.warning}` : '';
      sourceInfo.textContent = `${data.sourceLabel || 'WK scoreprovider'}${data.cached ? ' · uit cache' : ' · net opgehaald'}${warning}`;
      sourceInfo.hidden = false;
    }
    const today = matches.filter((match) => match.dateKey === todayKey);
    const played = matches.filter((match) => match.state === 'played' && match.dateKey !== todayKey).reverse();
    const upcoming = matches.filter((match) => match.state !== 'played' && match.dateKey !== todayKey);

    loading.hidden = true;

    if (today.length) {
      todaySection.hidden = false;
      const firstNotPlayed = today.find((match) => match.state !== 'played') || today[0];
      todayBox.innerHTML = today.map((match) => renderMatch(match, { today: true, scrollTarget: match.id === firstNotPlayed.id })).join('');
    }
    if (played.length) {
      playedSection.hidden = false;
      playedBox.innerHTML = played.map((match) => renderMatch(match)).join('');
    }
    if (upcoming.length) {
      upcomingSection.hidden = false;
      upcomingBox.innerHTML = upcoming.map((match) => renderMatch(match)).join('');
    }
    if (!matches.length) {
      loading.textContent = 'Er zijn nog geen wedstrijden gevonden.';
      loading.hidden = false;
    }

    setTimeout(() => {
      const target = document.querySelector('[data-scroll-target="true"]') || todaySection;
      if (target && !todaySection.hidden) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 450);
  } catch (err) {
    loading.hidden = true;
    error.textContent = err.message;
    error.hidden = false;
  }
}

if (page === 'matches') initMatches();
