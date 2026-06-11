const API = '/.netlify/functions';
const tokenKey = 'oranje_admin_token';
const likedUpdatesKey = 'oranje_liked_updates';

function $(selector) { return document.querySelector(selector); }
function $all(selector) { return [...document.querySelectorAll(selector)]; }

function token() { return localStorage.getItem(tokenKey); }
function setToken(value) { localStorage.setItem(tokenKey, value); }
function clearToken() { localStorage.removeItem(tokenKey); }


function enhanceAdminNavigation() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const adminToken = token();

  const adminLinks = [...nav.querySelectorAll('a')].filter((link) => {
    const href = link.getAttribute('href') || '';
    return href === '/admin-overview.html'
      || href === 'admin-overview.html'
      || link.pathname === '/admin-overview.html'
      || link.textContent.trim().toLowerCase() === 'admin dashboard';
  });

  const logoutButtons = [...nav.querySelectorAll('button, a')].filter((item) => {
    return item.id === 'logout-button'
      || item.dataset.adminLogout === 'true'
      || item.textContent.trim().toLowerCase() === 'uitloggen';
  });

  // Keep only one admin dashboard link and one logout button.
  adminLinks.slice(1).forEach((link) => link.remove());
  logoutButtons.slice(1).forEach((button) => button.remove());

  let adminLink = adminLinks[0] || null;
  let logoutButton = logoutButtons[0] || null;

  if (!adminToken) {
    if (adminLink && adminLink.dataset.dynamicAdminNav === 'true') adminLink.remove();
    if (logoutButton && logoutButton.dataset.dynamicAdminNav === 'true') logoutButton.remove();
    return;
  }

  if (!adminLink) {
    adminLink = document.createElement('a');
    adminLink.href = '/admin-overview.html';
    adminLink.textContent = 'Admin dashboard';
    adminLink.dataset.dynamicAdminNav = 'true';
    nav.appendChild(adminLink);
  }

  if (window.location.pathname.includes('admin-')) {
    adminLink.setAttribute('aria-current', 'page');
  }

  if (!logoutButton) {
    logoutButton = document.createElement('button');
    logoutButton.className = 'nav-button';
    logoutButton.id = 'logout-button';
    logoutButton.type = 'button';
    logoutButton.textContent = 'Uitloggen';
    logoutButton.dataset.dynamicAdminNav = 'true';
    logoutButton.dataset.adminLogout = 'true';
    nav.appendChild(logoutButton);
  } else {
    logoutButton.id = 'logout-button';
    logoutButton.dataset.adminLogout = 'true';
  }
}

function getLikedUpdates() {
  try {
    const value = JSON.parse(localStorage.getItem(likedUpdatesKey) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch (_) {
    return [];
  }
}

function isUpdateLiked(id) {
  return getLikedUpdates().includes(String(id));
}

function setUpdateLiked(id, liked) {
  const key = String(id);
  const values = new Set(getLikedUpdates());
  if (liked) values.add(key);
  else values.delete(key);
  localStorage.setItem(likedUpdatesKey, JSON.stringify([...values]));
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout || 15000);
  try {
    const response = await fetch(`${API}${path}`, { ...options, headers, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Er ging iets mis.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('De server reageert te langzaam. Probeer het opnieuw.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
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
    <img src="${photo.url}" alt="${escapeHtml(photo.altText || 'WK foto')}" loading="lazy" decoding="async">
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
        ${renderPhotos(update.photos)}
        <div class="update-footer">
          <button class="like-button ${isUpdateLiked(update.id) ? 'liked' : ''}" type="button" data-like-id="${update.id}" aria-pressed="${isUpdateLiked(update.id) ? 'true' : 'false'}">
            <span class="heart">${isUpdateLiked(update.id) ? '♥' : '♡'}</span>
            <span data-like-count="${update.id}">${compactLikes(update.likesCount)}</span>
          </button>
        </div>
      </div>
    </article>`;
}

async function initFeed() {
  const list = $('#updates-list');
  const empty = $('#empty-feed');
  const error = $('#feed-error');
  try {
    const data = await request('/updates');
    const updates = data.updates || [];
    if (!updates.length) {
      empty.hidden = false;
      return;
    }
    const sortedUpdates = updates.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = sortedUpdates.map((update, index) => renderUpdate(update, index === 0)).join('');
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
      const currentlyLiked = isUpdateLiked(id);
      const nextLiked = !currentlyLiked;
      button.disabled = true;
      try {
        const data = await request('/update-like', { method: 'POST', body: JSON.stringify({ id, liked: nextLiked }) });
        setUpdateLiked(id, nextLiked);
        document.querySelectorAll(`[data-like-count="${id}"]`).forEach((count) => {
          count.textContent = compactLikes(data.likesCount);
        });
        document.querySelectorAll(`[data-like-id="${id}"]`).forEach((likeButton) => {
          likeButton.classList.toggle('liked', nextLiked);
          likeButton.setAttribute('aria-pressed', nextLiked ? 'true' : 'false');
          const heart = likeButton.querySelector('.heart');
          if (heart) heart.textContent = nextLiked ? '♥' : '♡';
        });
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
      title: 'Poule van Moise',
      text: 'Bekijk de laatste WK-updates van Oranje.',
      url: window.location.origin
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.origin);
        button.textContent = 'Link gekopieerd';
        setTimeout(() => { button.textContent = 'Share'; }, 1800);
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
  $all('#logout-button').forEach((button) => {
    if (button.dataset.logoutBound === 'true') return;
    button.dataset.logoutBound = 'true';
    button.addEventListener('click', () => {
      clearToken();
      window.location.href = '/admin-login.html';
    });
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Foto kon niet worden geladen.'));
    image.src = src;
  });
}

async function optimiseImage(file) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxWidth = 1600;
  const maxHeight = 1000;
  const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const optimised = canvas.toDataURL(outputType, .84);
  return optimised.length < dataUrl.length ? optimised : dataUrl;
}

async function collectPhotos(form) {
  const input = form.querySelector('input[type="file"]');
  const files = [...(input.files || [])];
  if (files.length > 5) throw new Error('Je kunt maximaal 5 foto’s per keer uploaden.');
  const photos = [];
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Alleen JPG, PNG en WebP zijn toegestaan.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Een foto mag maximaal 5 MB zijn.');
    photos.push({ name: file.name, dataUrl: await optimiseImage(file), altText: file.name.replace(/\.[^.]+$/, '') });
  }
  return photos;
}

async function initCreate() {
  await requireLogin();
  initLogout();
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
  initLogout();
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
enhanceAdminNavigation();
initLogout();
initShare();
if (page === 'feed') initFeed();
if (page === 'login') initLogin();
if (page === 'admin-overview') initAdminOverview();
if (page === 'admin-create') initCreate();
if (page === 'admin-edit') initEdit();
if (page === 'setup') initSetup();


let matchesUpdatedCounterInterval = null;
let matchesPollTimeout = null;

function formatLastUpdated(value) {
  if (!value) return 'Nog niet bijgewerkt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Onbekend';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 1) return 'zojuist bijgewerkt';
  if (diffSeconds < 120) return `${diffSeconds} ${diffSeconds === 1 ? 'seconde' : 'seconden'} geleden bijgewerkt`;
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
  if (matchesUpdatedCounterInterval) window.clearInterval(matchesUpdatedCounterInterval);
  const render = () => {
    box.textContent = `Scores ${formatLastUpdated(value)}`;
  };
  render();
  matchesUpdatedCounterInterval = window.setInterval(render, 1000);
}

function stopMatchesPolling() {
  if (matchesPollTimeout) window.clearTimeout(matchesPollTimeout);
  matchesPollTimeout = null;
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

  const date = new Date(match.date);
  if (!match.date || Number.isNaN(date.getTime()) || date.getTime() <= 0) {
    return 'Tijd nog onbekend';
  }

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
      <span class="tag">${match.state === 'played' ? 'Final score' : match.state === 'live' ? 'Live now' : 'Upcoming'}</span>
      <span>${matchStatusLabel(match)}${match.state === 'upcoming' ? ` · ${formatMatchDay(match.date)}` : ''}</span>
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
  const loading = $('#matches-loading');
  const error = $('#matches-error');
  const todaySection = $('#today-section');
  const playedSection = $('#played-section');
  const upcomingSection = $('#upcoming-section');
  const todayBox = $('#today-matches');
  const playedBox = $('#played-matches');
  const upcomingBox = $('#upcoming-matches');
  const sourceInfo = $('#matches-source-info');
  let didInitialScroll = false;
  let isLoading = false;
  let lastMatches = [];
  let lastTodayKey = null;

  const LIVE_REFRESH_MS = 60000;
  const PRE_MATCH_REFRESH_WINDOW_MS = 10 * 60 * 1000;

  const getRefreshPlan = (matches, todayKey) => {
    const now = Date.now();
    const todayMatches = matches.filter((match) => match.dateKey === todayKey);
    const hasLive = todayMatches.some((match) => match.state === 'live');

    if (hasLive) {
      return {
        delay: LIVE_REFRESH_MS,
        shouldRefreshOnVisible: true,
        label: ' · live refresh elke 60 sec'
      };
    }

    const upcomingToday = todayMatches
      .filter((match) => match.state === 'upcoming')
      .map((match) => ({ match, time: new Date(match.date).getTime() }))
      .filter((entry) => Number.isFinite(entry.time) && entry.time > 0)
      .sort((a, b) => a.time - b.time);

    if (!upcomingToday.length) {
      return { delay: null, shouldRefreshOnVisible: false, label: ' · geen live refresh nodig' };
    }

    const next = upcomingToday[0];
    const msUntilKickoff = next.time - now;

    if (msUntilKickoff <= PRE_MATCH_REFRESH_WINDOW_MS) {
      return {
        delay: LIVE_REFRESH_MS,
        shouldRefreshOnVisible: true,
        label: ' · checkt vanaf nu elke 60 sec'
      };
    }

    const startPollingAt = next.time - PRE_MATCH_REFRESH_WINDOW_MS;
    const delayUntilWindow = Math.max(startPollingAt - now, 0);

    return {
      delay: delayUntilWindow,
      shouldRefreshOnVisible: false,
      label: ` · refresh start rond ${formatMatchTime(startPollingAt)}`
    };
  };

  const scheduleNextRefresh = (matches, todayKey, loadMatches) => {
    stopMatchesPolling();
    if (document.hidden) return;

    const plan = getRefreshPlan(matches, todayKey);
    if (!plan.delay) return;

    matchesPollTimeout = window.setTimeout(() => {
      loadMatches({ silent: true, forceFresh: true });
    }, plan.delay);
  };

  const loadMatches = async (options = {}) => {
    if (isLoading) return;
    isLoading = true;
    const { silent = false, forceFresh = false } = options;

    try {
      if (!silent) {
        loading.hidden = false;
        loading.textContent = 'Wedstrijden worden geladen...';
      }
      error.hidden = true;

      const data = await request(`/matches${forceFresh ? '?fresh=1' : ''}`);
      const matches = data.matches || [];
      const todayKey = data.todayKey;
      startLastUpdatedCounter(new Date().toISOString());

      if (sourceInfo) {
        const refreshPlan = getRefreshPlan(matches, todayKey);
        const refreshText = refreshPlan.label;
        const warning = data.warning ? ` Laatst bekende data wordt getoond: ${data.warning}` : '';
        sourceInfo.textContent = `${data.sourceLabel || 'WK scoreprovider'}${data.cached ? ' · uit cache' : ' · net opgehaald'}${refreshText}${warning}`;
        sourceInfo.hidden = false;
      }

      lastMatches = matches;
      lastTodayKey = todayKey;

      const today = matches.filter((match) => match.dateKey === todayKey);
      const played = matches.filter((match) => match.state === 'played' && match.dateKey !== todayKey).reverse();
      const upcoming = matches.filter((match) => match.state !== 'played' && match.dateKey !== todayKey);

      loading.hidden = true;
      todaySection.hidden = !today.length;
      playedSection.hidden = !played.length;
      upcomingSection.hidden = !upcoming.length;
      todayBox.innerHTML = '';
      playedBox.innerHTML = '';
      upcomingBox.innerHTML = '';

      if (today.length) {
        const firstNotPlayed = today.find((match) => match.state !== 'played') || today[0];
        todayBox.innerHTML = today.map((match) => renderMatch(match, { today: true, scrollTarget: match.id === firstNotPlayed.id })).join('');
      }
      if (played.length) playedBox.innerHTML = played.map((match) => renderMatch(match)).join('');
      if (upcoming.length) upcomingBox.innerHTML = upcoming.map((match) => renderMatch(match)).join('');

      if (!matches.length) {
        loading.textContent = 'Er zijn nog geen wedstrijden gevonden.';
        loading.hidden = false;
      }

      if (!didInitialScroll) {
        didInitialScroll = true;
        setTimeout(() => {
          const target = document.querySelector('[data-scroll-target="true"]') || todaySection;
          if (target && !todaySection.hidden) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 450);
      }

      scheduleNextRefresh(matches, todayKey, loadMatches);
    } catch (err) {
      loading.hidden = true;
      error.textContent = err.message;
      error.hidden = false;
      stopMatchesPolling();
    } finally {
      isLoading = false;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopMatchesPolling();
      return;
    }

    const plan = getRefreshPlan(lastMatches, lastTodayKey);
    if (plan.shouldRefreshOnVisible) {
      loadMatches({ silent: true, forceFresh: true });
      return;
    }

    scheduleNextRefresh(lastMatches, lastTodayKey, loadMatches);
  });

  loadMatches();
}

if (page === 'matches') initMatches();

function formatAmsterdamDateTime(value) {
  if (!value) return 'Nog niet bijgewerkt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Onbekend';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function renderRankingNames(names = []) {
  return names.map((name, index) => `
    <li class="ranking-item">
      <span class="ranking-number">${index + 1}</span>
      <span class="ranking-name">${escapeHtml(name)}</span>
    </li>
  `).join('');
}

async function initRankings() {
  const loading = $('#rankings-loading');
  const empty = $('#rankings-empty');
  const error = $('#rankings-error');
  const list = $('#rankings-list');
  const updatedAt = $('#ranking-updated-at');

  try {
    const data = await request('/rankings');
    const ranking = data.ranking || {};
    const names = Array.isArray(ranking.names) ? ranking.names : [];
    loading.hidden = true;
    updatedAt.textContent = formatAmsterdamDateTime(ranking.updatedAt);

    if (!names.length) {
      empty.hidden = false;
      return;
    }

    list.innerHTML = renderRankingNames(names);
  } catch (err) {
    loading.hidden = true;
    error.textContent = err.message;
    error.hidden = false;
  }
}

function parseRankingInput(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)-]?\s*|[-*•]\s*)/, '').trim())
    .filter(Boolean);
}

async function initAdminRankings() {
  await requireLogin();
  initLogout();

  const form = $('#ranking-form');
  const textarea = form.elements.rankingText;
  const message = $('#ranking-admin-message');
  const error = $('#ranking-admin-error');

  try {
    const data = await request('/rankings');
    const names = data.ranking && Array.isArray(data.ranking.names) ? data.ranking.names : [];
    if (names.length) textarea.value = names.map((name, index) => `${index + 1}. ${name}`).join('\n');
  } catch (_) {}

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.hidden = true;
    error.hidden = true;

    const names = parseRankingInput(textarea.value);
    if (names.length !== 10) {
      error.textContent = `Je hebt ${names.length} namen ingevuld. Vul precies 10 namen in.`;
      error.hidden = false;
      return;
    }

    try {
      const data = await request('/rankings-update', {
        method: 'POST',
        body: JSON.stringify({ names })
      });
      const updatedAt = data.ranking ? data.ranking.updatedAt : null;
      message.textContent = `Ranking opgeslagen. Laatst bijgewerkt: ${formatAmsterdamDateTime(updatedAt)}.`;
      message.hidden = false;
      textarea.value = names.map((name, index) => `${index + 1}. ${name}`).join('\n');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

if (page === 'rankings') initRankings();
if (page === 'admin-rankings') initAdminRankings();

const pouleGroupPredictions = [
  { group: 'Group A', date: '11/06 21:00', home: 'Mexico', away: 'Zuid-Afrika', predicted: '2 - 0' },
  { group: 'Group A', date: '12/06 04:00', home: 'Zuid-Korea', away: 'Tsjechië', predicted: '1 - 1' },
  { group: 'Group A', date: '18/06 18:00', home: 'Tsjechië', away: 'Zuid-Afrika', predicted: '2 - 0' },
  { group: 'Group A', date: '19/06 03:00', home: 'Mexico', away: 'Zuid-Korea', predicted: '2 - 1' },
  { group: 'Group A', date: '25/06 03:00', home: 'Tsjechië', away: 'Mexico', predicted: '1 - 1' },
  { group: 'Group A', date: '25/06 03:00', home: 'Zuid-Afrika', away: 'Zuid-Korea', predicted: '0 - 2' },
  { group: 'Group B', date: '12/06 21:00', home: 'Canada', away: 'Bosnië & Herzegovina', predicted: '1 - 1' },
  { group: 'Group B', date: '13/06 21:00', home: 'Qatar', away: 'Zwitserland', predicted: '0 - 2' },
  { group: 'Group B', date: '18/06 21:00', home: 'Zwitserland', away: 'Bosnië & Herzegovina', predicted: '2 - 0' },
  { group: 'Group B', date: '19/06 00:00', home: 'Canada', away: 'Qatar', predicted: '2 - 0' },
  { group: 'Group B', date: '24/06 21:00', home: 'Zwitserland', away: 'Canada', predicted: '1 - 1' },
  { group: 'Group B', date: '24/06 21:00', home: 'Bosnië & Herzegovina', away: 'Qatar', predicted: '2 - 1' },
  { group: 'Group C', date: '14/06 00:00', home: 'Brazilië', away: 'Marokko', predicted: '2 - 1' },
  { group: 'Group C', date: '14/06 03:00', home: 'Haïti', away: 'Schotland', predicted: '0 - 1' },
  { group: 'Group C', date: '20/06 00:00', home: 'Schotland', away: 'Marokko', predicted: '0 - 1' },
  { group: 'Group C', date: '20/06 03:00', home: 'Brazilië', away: 'Haïti', predicted: '3 - 0' },
  { group: 'Group C', date: '25/06 00:00', home: 'Schotland', away: 'Brazilië', predicted: '0 - 2' },
  { group: 'Group C', date: '25/06 00:00', home: 'Marokko', away: 'Haïti', predicted: '2 - 0' },
  { group: 'Group D', date: '13/06 03:00', home: 'Verenigde Staten', away: 'Paraguay', predicted: '2 - 1' },
  { group: 'Group D', date: '14/06 06:00', home: 'Australië', away: 'Turkije', predicted: '1 - 2' },
  { group: 'Group D', date: '19/06 21:00', home: 'Verenigde Staten', away: 'Australië', predicted: '2 - 0' },
  { group: 'Group D', date: '20/06 06:00', home: 'Turkije', away: 'Paraguay', predicted: '2 - 1' },
  { group: 'Group D', date: '26/06 04:00', home: 'Turkije', away: 'Verenigde Staten', predicted: '1 - 2' },
  { group: 'Group D', date: '26/06 04:00', home: 'Paraguay', away: 'Australië', predicted: '2 - 0' },
  { group: 'Group E', date: '14/06 19:00', home: 'Duitsland', away: 'Curaçao', predicted: '4 - 0' },
  { group: 'Group E', date: '15/06 01:00', home: 'Ivoorkust', away: 'Ecuador', predicted: '1 - 1' },
  { group: 'Group E', date: '20/06 22:00', home: 'Duitsland', away: 'Ivoorkust', predicted: '2 - 1' },
  { group: 'Group E', date: '21/06 02:00', home: 'Ecuador', away: 'Curaçao', predicted: '2 - 0' },
  { group: 'Group E', date: '25/06 22:00', home: 'Ecuador', away: 'Duitsland', predicted: '1 - 1' },
  { group: 'Group E', date: '25/06 22:00', home: 'Curaçao', away: 'Ivoorkust', predicted: '0 - 2' },
  { group: 'Group F', date: '14/06 22:00', home: 'Nederland', away: 'Japan', predicted: '2 - 1' },
  { group: 'Group F', date: '15/06 04:00', home: 'Zweden', away: 'Tunesië', predicted: '2 - 0' },
  { group: 'Group F', date: '20/06 06:00', home: 'Tunesië', away: 'Japan', predicted: '0 - 2' },
  { group: 'Group F', date: '20/06 19:00', home: 'Nederland', away: 'Zweden', predicted: '2 - 1' },
  { group: 'Group F', date: '26/06 01:00', home: 'Japan', away: 'Zweden', predicted: '2 - 1' },
  { group: 'Group F', date: '26/06 01:00', home: 'Tunesië', away: 'Nederland', predicted: '0 - 2' },
  { group: 'Group G', date: '15/06 21:00', home: 'België', away: 'Egypte', predicted: '1 - 1' },
  { group: 'Group G', date: '16/06 03:00', home: 'Iran', away: 'Nieuw-Zeeland', predicted: '2 - 0' },
  { group: 'Group G', date: '21/06 21:00', home: 'België', away: 'Iran', predicted: '2 - 1' },
  { group: 'Group G', date: '22/06 03:00', home: 'Nieuw-Zeeland', away: 'Egypte', predicted: '0 - 2' },
  { group: 'Group G', date: '27/06 05:00', home: 'Egypte', away: 'Iran', predicted: '1 - 1' },
  { group: 'Group G', date: '27/06 05:00', home: 'Nieuw-Zeeland', away: 'België', predicted: '0 - 3' },
  { group: 'Group H', date: '15/06 18:00', home: 'Spanje', away: 'Kaapverdië', predicted: '3 - 0' },
  { group: 'Group H', date: '16/06 00:00', home: 'Saoedi-Arabië', away: 'Uruguay', predicted: '0 - 2' },
  { group: 'Group H', date: '21/06 18:00', home: 'Spanje', away: 'Saoedi-Arabië', predicted: '2 - 0' },
  { group: 'Group H', date: '22/06 00:00', home: 'Uruguay', away: 'Kaapverdië', predicted: '2 - 0' },
  { group: 'Group H', date: '27/06 02:00', home: 'Kaapverdië', away: 'Saoedi-Arabië', predicted: '0 - 1' },
  { group: 'Group H', date: '27/06 02:00', home: 'Uruguay', away: 'Spanje', predicted: '1 - 1' },
  { group: 'Group I', date: '16/06 21:00', home: 'Frankrijk', away: 'Senegal', predicted: '1 - 1' },
  { group: 'Group I', date: '17/06 00:00', home: 'Irak', away: 'Noorwegen', predicted: '0 - 2' },
  { group: 'Group I', date: '22/06 23:00', home: 'Frankrijk', away: 'Irak', predicted: '3 - 0' },
  { group: 'Group I', date: '23/06 02:00', home: 'Noorwegen', away: 'Senegal', predicted: '2 - 1' },
  { group: 'Group I', date: '26/06 21:00', home: 'Noorwegen', away: 'Frankrijk', predicted: '0 - 2' },
  { group: 'Group I', date: '26/06 21:00', home: 'Senegal', away: 'Irak', predicted: '2 - 0' },
  { group: 'Group J', date: '16/06 06:00', home: 'Oostenrijk', away: 'Jordanië', predicted: '2 - 0' },
  { group: 'Group J', date: '17/06 03:00', home: 'Argentinië', away: 'Algerije', predicted: '2 - 0' },
  { group: 'Group J', date: '22/06 19:00', home: 'Argentinië', away: 'Oostenrijk', predicted: '2 - 1' },
  { group: 'Group J', date: '23/06 05:00', home: 'Jordanië', away: 'Algerije', predicted: '0 - 2' },
  { group: 'Group J', date: '28/06 04:00', home: 'Algerije', away: 'Oostenrijk', predicted: '1 - 1' },
  { group: 'Group J', date: '28/06 04:00', home: 'Jordanië', away: 'Argentinië', predicted: '0 - 3' },
  { group: 'Group K', date: '17/06 19:00', home: 'Portugal', away: 'Congo', predicted: '3 - 0' },
  { group: 'Group K', date: '18/06 04:00', home: 'Oezbekistan', away: 'Colombia', predicted: '1 - 1' },
  { group: 'Group K', date: '23/06 19:00', home: 'Portugal', away: 'Oezbekistan', predicted: '2 - 0' },
  { group: 'Group K', date: '24/06 04:00', home: 'Colombia', away: 'Congo', predicted: '2 - 0' },
  { group: 'Group K', date: '28/06 01:30', home: 'Colombia', away: 'Portugal', predicted: '1 - 1' },
  { group: 'Group K', date: '28/06 01:30', home: 'Congo', away: 'Oezbekistan', predicted: '0 - 1' },
  { group: 'Group L', date: '17/06 22:00', home: 'Engeland', away: 'Kroatië', predicted: '1 - 1' },
  { group: 'Group L', date: '18/06 01:00', home: 'Ghana', away: 'Panama', predicted: '2 - 0' },
  { group: 'Group L', date: '23/06 22:00', home: 'Engeland', away: 'Ghana', predicted: '2 - 0' },
  { group: 'Group L', date: '24/06 01:00', home: 'Panama', away: 'Kroatië', predicted: '0 - 2' },
  { group: 'Group L', date: '27/06 23:00', home: 'Panama', away: 'Engeland', predicted: '0 - 3' },
  { group: 'Group L', date: '27/06 23:00', home: 'Kroatië', away: 'Ghana', predicted: '1 - 1' }
];

const pouleKnockoutPredictions = [
  { date: '28/06 21:00', round: 'Round of 32', predicted: 'Tsjechië - Canada' },
  { date: '29/06 19:00', round: 'Round of 32', predicted: 'Brazilië - Japan' },
  { date: '29/06 22:30', round: 'Round of 32', predicted: 'Duitsland - Zuid-Korea' },
  { date: '30/06 03:00', round: 'Round of 32', predicted: 'Nederland - Marokko' },
  { date: '30/06 19:00', round: 'Round of 32', predicted: 'Ecuador - Noorwegen' },
  { date: '30/06 23:00', round: 'Round of 32', predicted: 'Frankrijk - Iran' },
  { date: '01/07 03:00', round: 'Round of 32', predicted: 'Mexico - Ivoorkust' },
  { date: '01/07 18:00', round: 'Round of 32', predicted: 'Engeland - Oezbekistan' },
  { date: '01/07 22:00', round: 'Round of 32', predicted: 'België - Algerije' },
  { date: '02/07 02:00', round: 'Round of 32', predicted: 'Verenigde Staten - Bosnië & Herzegovina' },
  { date: '02/07 21:00', round: 'Round of 32', predicted: 'Spanje - Oostenrijk' },
  { date: '03/07 01:00', round: 'Round of 32', predicted: 'Colombia - Kroatië' },
  { date: '03/07 05:00', round: 'Round of 32', predicted: 'Zwitserland - Senegal' },
  { date: '03/07 20:00', round: 'Round of 32', predicted: 'Turkije - Egypte' },
  { date: '04/07 00:00', round: 'Round of 32', predicted: 'Argentinië - Uruguay' },
  { date: '04/07 03:30', round: 'Round of 32', predicted: 'Portugal - Ghana' },
  { date: '04/07 19:00', round: 'Round of 16', predicted: 'Canada - Nederland' },
  { date: '04/07 23:00', round: 'Round of 16', predicted: 'Duitsland - Frankrijk' },
  { date: '05/07 22:00', round: 'Round of 16', predicted: 'Brazilië - Noorwegen' },
  { date: '06/07 02:00', round: 'Round of 16', predicted: 'Mexico - Engeland' },
  { date: '06/07 21:00', round: 'Round of 16', predicted: 'Colombia - Spanje' },
  { date: '07/07 02:00', round: 'Round of 16', predicted: 'Verenigde Staten - België' },
  { date: '07/07 18:00', round: 'Round of 16', predicted: 'Argentinië - Turkije' },
  { date: '07/07 22:00', round: 'Round of 16', predicted: 'Zwitserland - Portugal' },
  { date: '09/07 22:00', round: 'Quarterfinal', predicted: 'Frankrijk - Nederland' },
  { date: '10/07 21:00', round: 'Quarterfinal', predicted: 'Spanje - België' },
  { date: '11/07 23:00', round: 'Quarterfinal', predicted: 'Brazilië - Engeland' },
  { date: '12/07 03:00', round: 'Quarterfinal', predicted: 'Argentinië - Portugal' },
  { date: '14/07 21:00', round: 'Semifinal', predicted: 'Frankrijk - Spanje' },
  { date: '15/07 21:00', round: 'Semifinal', predicted: 'Engeland - Argentinië' },
  { date: '18/07 23:00', round: 'Third place', predicted: 'Frankrijk - Argentinië' },
  { date: '19/07 21:00', round: 'Final', predicted: 'Spanje - Engeland' }
];

const pouleBonusPredictions = [
  ['World Cup winner', 'Spanje'],
  ['Earliest goal', '2nd minute'],
  ['Red cards', '17'],
  ['Penalties after a foul', '25'],
  ['Best host country', 'Verenigde Staten'],
  ['Total World Cup goals', '292'],
  ['Most goals scored by', 'Spanje'],
  ['Fewest goals conceded by', 'Frankrijk'],
  ['Best goalkeeper', 'Mike Maignan'],
  ['Top scorer', 'Kylian Mbappé'],
  ['Netherlands finish', 'Quarterfinal']
];

function normalizePouleName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'en')
    .replace(/czechia/g, 'tsjechie')
    .replace(/czech republic/g, 'tsjechie')
    .replace(/south africa/g, 'zuid afrika')
    .replace(/south korea/g, 'zuid korea')
    .replace(/netherlands/g, 'nederland')
    .replace(/united states/g, 'verenigde staten')
    .replace(/usa/g, 'verenigde staten')
    .replace(/united states of america/g, 'verenigde staten')
    .replace(/bosnia and herzegovina/g, 'bosnie en herzegovina')
    .replace(/bosnie herzogovina/g, 'bosnie en herzegovina')
    .replace(/bosnie & herzegovina/g, 'bosnie en herzegovina')
    .replace(/saudi arabia/g, 'saoedi arabie')
    .replace(/new zealand/g, 'nieuw zeeland')
    .replace(/ivory coast/g, 'ivoorkust')
    .replace(/cape verde/g, 'kaapverdie')
    .replace(/dr congo/g, 'congo')
    .replace(/congo dr/g, 'congo')
    .replace(/uzbekistan/g, 'oezbekistan')
    .replace(/haiti/g, 'haiti')
    .replace(/curacao/g, 'curacao')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pouleMatchKey(home, away) {
  return `${normalizePouleName(home)}|${normalizePouleName(away)}`;
}

function pouleDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.day}/${map.month} ${map.hour}:${map.minute}`;
}

function pouleActualLabel(match, options = {}) {
  if (!match) return options.unknown || 'Not known yet';
  const teams = `${match.homeTeam || 'TBD'} - ${match.awayTeam || 'TBD'}`;
  if (match.state === 'played' || match.state === 'live') {
    const score = `${match.homeGoals ?? '-'} - ${match.awayGoals ?? '-'}`;
    return options.teamsOnly ? `${teams}, ${score}` : score;
  }
  return options.teamsOnly ? teams : 'Not played yet';
}

function parsePouleScore(value) {
  const match = /(-?\d+)\s*-\s*(-?\d+)/.exec(String(value || ''));
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function pouleOutcome(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'home';
  if (homeGoals < awayGoals) return 'away';
  return 'draw';
}

function isPlayedWithScore(match) {
  return match
    && match.state === 'played'
    && Number.isFinite(Number(match.homeGoals))
    && Number.isFinite(Number(match.awayGoals));
}

function renderPoulePoints(points) {
  if (points === null || points === undefined) return '<span class="poule-points is-pending">-</span>';
  return `<span class="poule-points is-known">${points}</span>`;
}

function calculateGroupPredictionPoints(prediction, actual, reversed = false) {
  if (!isPlayedWithScore(actual)) return null;
  const predicted = parsePouleScore(prediction.predicted);
  if (!predicted) return null;

  const actualHome = reversed ? Number(actual.awayGoals) : Number(actual.homeGoals);
  const actualAway = reversed ? Number(actual.homeGoals) : Number(actual.awayGoals);

  if (predicted.home === actualHome && predicted.away === actualAway) return 10;

  let points = 0;
  if (pouleOutcome(predicted.home, predicted.away) === pouleOutcome(actualHome, actualAway)) points += 5;
  if (predicted.home === actualHome) points += 2;
  if (predicted.away === actualAway) points += 2;
  return points;
}

function splitPouleTeams(value) {
  const parts = String(value || '').split(/\s+-\s+/);
  if (parts.length < 2) return [];
  return [parts[0].trim(), parts.slice(1).join(' - ').trim()].filter(Boolean);
}

function isKnownPouleTeam(value) {
  const normalized = normalizePouleName(value);
  if (!normalized) return false;
  return !['nog onbekend', 'tbd', 'unknown', 'not known yet'].includes(normalized);
}

const pouleKnockoutPointRules = {
  'Round of 32': { team: 10, match: 15 },
  'Round of 16': { team: 15, match: 20 },
  'Quarterfinal': { team: 20, match: 25 },
  'Semifinal': { team: 25, match: 30 },
  'Third place': { team: 30, match: 65 },
  'Final': { team: 40, match: 85 }
};

function calculateKnockoutPredictionPoints(prediction, actual) {
  if (!isPlayedWithScore(actual)) return null;
  if (!isKnownPouleTeam(actual.homeTeam) || !isKnownPouleTeam(actual.awayTeam)) return null;

  const rules = pouleKnockoutPointRules[prediction.round];
  if (!rules) return null;

  const predictedTeams = splitPouleTeams(prediction.predicted).map(normalizePouleName);
  const actualTeams = [actual.homeTeam, actual.awayTeam].map(normalizePouleName);
  if (predictedTeams.length !== 2 || actualTeams.length !== 2) return null;

  let points = 0;
  const firstCorrect = actualTeams.includes(predictedTeams[0]);
  const secondCorrect = actualTeams.includes(predictedTeams[1]);

  if (firstCorrect) points += rules.team;
  if (secondCorrect) points += rules.team;
  if (firstCorrect && secondCorrect) points += rules.match;

  return points;
}

function buildPouleIndexes(matches) {
  const byTeam = new Map();
  const byDate = new Map();
  for (const match of matches) {
    byTeam.set(pouleMatchKey(match.homeTeam, match.awayTeam), { match, reversed: false });
    byTeam.set(pouleMatchKey(match.awayTeam, match.homeTeam), { match, reversed: true });
    const key = pouleDateKey(match.date);
    if (!key) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(match);
  }
  return { byTeam, byDate };
}

function renderPouleTable(headers, rows) {
  return `<div class="poule-table-wrap"><table class="poule-table">
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;
}

function renderGroupPredictionRows(predictions, byTeam) {
  return predictions.map((prediction) => {
    const actualEntry = byTeam.get(pouleMatchKey(prediction.home, prediction.away));
    const actual = actualEntry ? actualEntry.match : null;
    const actualClass = actual && (actual.state === 'played' || actual.state === 'live') ? 'is-known' : 'is-pending';
    let reality = pouleActualLabel(actual);
    if (actual && actualEntry && actualEntry.reversed && (actual.state === 'played' || actual.state === 'live')) {
      reality = `${actual.awayGoals ?? '-'} - ${actual.homeGoals ?? '-'}`;
    }
    const points = calculateGroupPredictionPoints(prediction, actual, Boolean(actualEntry && actualEntry.reversed));
    return `<tr>
      <td data-label="Date">${escapeHtml(prediction.date)}</td>
      <td data-label="Match"><strong>${escapeHtml(prediction.home)} - ${escapeHtml(prediction.away)}</strong></td>
      <td data-label="Predicted">${escapeHtml(prediction.predicted)}</td>
      <td data-label="Reality"><span class="poule-reality ${actualClass}">${escapeHtml(reality)}</span></td>
      <td data-label="Points">${renderPoulePoints(points)}</td>
    </tr>`;
  });
}

function renderKnockoutPredictionRows(predictions, byDate) {
  const usedByDate = new Map();
  return predictions.map((prediction) => {
    const candidates = byDate.get(prediction.date) || [];
    const used = usedByDate.get(prediction.date) || 0;
    const actual = candidates[used] || null;
    usedByDate.set(prediction.date, used + 1);
    const actualClass = actual && isKnownPouleTeam(actual.homeTeam) && isKnownPouleTeam(actual.awayTeam) ? 'is-known' : 'is-pending';
    const points = calculateKnockoutPredictionPoints(prediction, actual);
    return `<tr>
      <td data-label="Date">${escapeHtml(prediction.date)}</td>
      <td data-label="Predicted"><strong>${escapeHtml(prediction.predicted)}</strong></td>
      <td data-label="Reality"><span class="poule-reality ${actualClass}">${escapeHtml(pouleActualLabel(actual, { teamsOnly: true, unknown: 'Not known yet' }))}</span></td>
      <td data-label="Points">${renderPoulePoints(points)}</td>
    </tr>`;
  });
}

const pouleKnockoutSections = [
  { title: 'Zestiende finale', round: 'Round of 32' },
  { title: 'Achtste finale', round: 'Round of 16' },
  { title: 'Kwartfinales', round: 'Quarterfinal' },
  { title: 'Halve finales', round: 'Semifinal' },
  { title: 'Troost finale', round: 'Third place' },
  { title: 'THE FINAL!', round: 'Final', final: true }
];

function renderKnockoutPredictionSections(predictions, byDate) {
  return pouleKnockoutSections.map((section) => {
    const sectionPredictions = predictions.filter((prediction) => prediction.round === section.round);
    if (!sectionPredictions.length) return '';
    return `<article class="poule-card ${section.final ? 'poule-final-card' : ''}">
      <h3 class="${section.final ? 'poule-final-title' : ''}">${escapeHtml(section.title)}</h3>
      ${renderPouleTable(['Date', 'Predicted', 'Reality', 'Points'], renderKnockoutPredictionRows(sectionPredictions, byDate))}
    </article>`;
  }).join('');
}

function renderPouleBonus() {
  const box = $('#poule-bonus');
  if (!box) return;
  box.innerHTML = `<div class="bonus-grid">${pouleBonusPredictions.map(([label, value]) => `
    <article class="bonus-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join('')}</div>`;
}

async function initPoule() {
  const loading = $('#poule-loading');
  const error = $('#poule-error');
  const status = $('#poule-status');
  const source = $('#poule-source-info');
  const groupSection = $('#poule-group-section');
  const knockoutSection = $('#poule-knockout-section');
  const groupBox = $('#poule-groups');
  const knockoutBox = $('#poule-knockouts');
  const refreshButton = $('#poule-refresh');
  let isLoading = false;

  renderPouleBonus();

  const loadPoule = async (options = {}) => {
    if (isLoading) return;
    isLoading = true;
    const { forceFresh = false } = options;

    try {
      error.hidden = true;
      if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = forceFresh ? 'Updating...' : 'Loading...';
      }
      if (!forceFresh) loading.hidden = false;

      const data = await request(`/matches${forceFresh ? '?fresh=1' : ''}`);
      const matches = data.matches || [];
      const indexes = buildPouleIndexes(matches);

      const grouped = pouleGroupPredictions.reduce((acc, item) => {
        if (!acc[item.group]) acc[item.group] = [];
        acc[item.group].push(item);
        return acc;
      }, {});

      groupBox.innerHTML = Object.entries(grouped).map(([group, predictions]) => `
        <article class="poule-card">
          <h3>${escapeHtml(group)}</h3>
          ${renderPouleTable(['Date', 'Match', 'Predicted', 'Reality', 'Points'], renderGroupPredictionRows(predictions, indexes.byTeam))}
        </article>
      `).join('');

      knockoutBox.innerHTML = renderKnockoutPredictionSections(pouleKnockoutPredictions, indexes.byDate);

      loading.hidden = true;
      groupSection.hidden = false;
      knockoutSection.hidden = false;
      status.textContent = `Reality loaded for ${matches.length} matches`;
      if (source) {
        const when = formatLastUpdated(new Date().toISOString()).replace(' bijgewerkt', '');
        source.textContent = `${data.sourceLabel || 'WK scoreprovider'}${data.cached ? ' · from cache' : ' · just fetched'} · page updated ${when}`;
        source.hidden = false;
      }
    } catch (err) {
      loading.hidden = true;
      error.textContent = err.message;
      error.hidden = false;
      status.textContent = 'Reality could not be loaded';
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = 'Update scores';
      }
      isLoading = false;
    }
  };

  if (refreshButton) {
    refreshButton.addEventListener('click', () => loadPoule({ forceFresh: true }));
  }

  loadPoule();
}

if (page === 'poule') initPoule();
