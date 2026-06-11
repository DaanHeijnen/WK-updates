const { json, withDb } = require('./_shared');

const DEFAULT_API_BASE = 'https://worldcup26.ir';
const finishedValues = new Set(['true', '1', 'yes', 'finished', 'ft', 'fulltime', 'full_time', 'completed', 'afgelopen']);
const liveValues = new Set(['live', 'in_play', 'playing', '1h', '2h', 'ht', 'et', 'pen', 'nu bezig']);


const stadiumTimezoneRules = [
  [/atlanta|mercedes/i, 'America/New_York'],
  [/boston|foxborough|gillette|new england/i, 'America/New_York'],
  [/dallas|arlington|at&t/i, 'America/Chicago'],
  [/guadalajara|akron/i, 'America/Mexico_City'],
  [/houston|nrg/i, 'America/Chicago'],
  [/kansas/i, 'America/Chicago'],
  [/los angeles|inglewood|sofi/i, 'America/Los_Angeles'],
  [/mexico city|ciudad de mexico|azteca/i, 'America/Mexico_City'],
  [/miami|hard rock/i, 'America/New_York'],
  [/monterrey|bbva/i, 'America/Monterrey'],
  [/new york|new jersey|east rutherford|metlife/i, 'America/New_York'],
  [/philadelphia|lincoln/i, 'America/New_York'],
  [/san francisco|bay area|santa clara|levi/i, 'America/Los_Angeles'],
  [/seattle|lumen/i, 'America/Los_Angeles'],
  [/toronto|bmo/i, 'America/Toronto'],
  [/vancouver|bc place/i, 'America/Vancouver']
];

function timezoneForVenue(stadium = {}, game = {}) {
  const explicit = firstValue(
    game.timezone,
    game.time_zone,
    game.tz,
    stadium.timezone,
    stadium.time_zone,
    stadium.tz
  );
  if (explicit && String(explicit).includes('/')) return String(explicit).trim();

  const text = [
    stadium.name,
    stadium.city,
    game.stadium,
    game.venue,
    game.city,
    game.location
  ].filter(Boolean).join(' ');

  for (const [pattern, timezone] of stadiumTimezoneRules) {
    if (pattern.test(text)) return timezone;
  }
  return 'UTC';
}

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second || 0)
  };
}

function zonedTimeToUtc(year, month, day, hour, minute, second, timeZone) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    const asUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
    utcMs -= asUtcMs - Date.UTC(year, month - 1, day, hour, minute, second || 0);
  }
  return new Date(utcMs);
}

function parseDateInfo(value, sourceTimezone = 'UTC') {
  if (!value) return { date: null, hasTime: false };
  if (value instanceof Date) return { date: Number.isNaN(value.getTime()) ? null : value, hasTime: true };
  const text = String(value).trim();

  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (usMatch) {
    const [, month, day, year, hour = '0', minute = '0', second = '0'] = usMatch;
    const hasTime = usMatch[4] !== undefined;
    return {
      date: zonedTimeToUtc(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second), sourceTimezone),
      hasTime
    };
  }

  const euMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?!.*(?:Z|[+-]\d{2}:?\d{2}))/.exec(text);
  if (euMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = euMatch;
    const hasTime = euMatch[4] !== undefined;
    return {
      date: zonedTimeToUtc(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second), sourceTimezone),
      hasTime
    };
  }

  const parsed = new Date(text);
  return { date: Number.isNaN(parsed.getTime()) ? null : parsed, hasTime: /\d{1,2}:\d{2}/.test(text) };
}

const fallbackTeamRows = [
  ['1', 'Mexico', '🇲🇽', 'A'],
  ['2', 'Zuid-Afrika', '🇿🇦', 'A'],
  ['3', 'Zuid-Korea', '🇰🇷', 'A'],
  ['4', 'Tsjechië', '🇨🇿', 'A'],
  ['5', 'Canada', '🇨🇦', 'B'],
  ['6', 'Zwitserland', '🇨🇭', 'B'],
  ['7', 'Qatar', '🇶🇦', 'B'],
  ['8', 'Bosnië en Herzegovina', '🇧🇦', 'B'],
  ['9', 'Brazilië', '🇧🇷', 'C'],
  ['10', 'Marokko', '🇲🇦', 'C'],
  ['11', 'Haïti', '🇭🇹', 'C'],
  ['12', 'Schotland', '🏴', 'C'],
  ['13', 'Verenigde Staten', '🇺🇸', 'D'],
  ['14', 'Paraguay', '🇵🇾', 'D'],
  ['15', 'Australië', '🇦🇺', 'D'],
  ['16', 'Turkije', '🇹🇷', 'D'],
  ['17', 'Duitsland', '🇩🇪', 'E'],
  ['18', 'Curaçao', '🇨🇼', 'E'],
  ['19', 'Ivoorkust', '🇨🇮', 'E'],
  ['20', 'Ecuador', '🇪🇨', 'E'],
  ['21', 'Nederland', '🇳🇱', 'F'],
  ['22', 'Japan', '🇯🇵', 'F'],
  ['23', 'Zweden', '🇸🇪', 'F'],
  ['24', 'Tunesië', '🇹🇳', 'F'],
  ['25', 'België', '🇧🇪', 'G'],
  ['26', 'Egypte', '🇪🇬', 'G'],
  ['27', 'Iran', '🇮🇷', 'G'],
  ['28', 'Nieuw-Zeeland', '🇳🇿', 'G'],
  ['29', 'Spanje', '🇪🇸', 'H'],
  ['30', 'Kaapverdië', '🇨🇻', 'H'],
  ['31', 'Saudi-Arabië', '🇸🇦', 'H'],
  ['32', 'Uruguay', '🇺🇾', 'H'],
  ['33', 'Frankrijk', '🇫🇷', 'I'],
  ['34', 'Senegal', '🇸🇳', 'I'],
  ['35', 'Noorwegen', '🇳🇴', 'I'],
  ['36', 'Irak', '🇮🇶', 'I'],
  ['37', 'Argentinië', '🇦🇷', 'J'],
  ['38', 'Algerije', '🇩🇿', 'J'],
  ['39', 'Oostenrijk', '🇦🇹', 'J'],
  ['40', 'Jordanië', '🇯🇴', 'J'],
  ['41', 'Portugal', '🇵🇹', 'K'],
  ['42', 'Congo DR', '🇨🇩', 'K'],
  ['43', 'Oezbekistan', '🇺🇿', 'K'],
  ['44', 'Colombia', '🇨🇴', 'K'],
  ['45', 'Engeland', '🏴', 'L'],
  ['46', 'Kroatië', '🇭🇷', 'L'],
  ['47', 'Ghana', '🇬🇭', 'L'],
  ['48', 'Panama', '🇵🇦', 'L']
];

const fallbackTeams = new Map(fallbackTeamRows.map(([id, name, logo, group]) => [id, { name, logo, group } ]));
const fallbackGroups = fallbackTeamRows.reduce((groups, [id, name, logo, group]) => {
  if (!groups[group]) groups[group] = [];
  groups[group].push({ id, name, logo, group });
  return groups;
}, {});

const fallbackPairings = {
  '1': [[0, 1], [2, 3]],
  '2': [[0, 2], [3, 1]],
  '3': [[3, 0], [1, 2]]
};

function config() {
  return {
    apiBase: (process.env.WORLD_CUP26_API_BASE || DEFAULT_API_BASE).replace(/\/$/, ''),
    token: process.env.WORLD_CUP26_TOKEN || process.env.WORLDCUP26_TOKEN || '',
    timezone: process.env.MATCH_TIMEZONE || 'Europe/Amsterdam',
    cacheMinutes: Number(process.env.MATCH_CACHE_MINUTES || 30)
  };
}

function headers(cfg) {
  const base = { Accept: 'application/json' };
  if (cfg.token) base.Authorization = `Bearer ${cfg.token}`;
  return base;
}

function localDateKey(dateValue, timezone) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseWorldCupDate(value, sourceTimezone = 'UTC') {
  return parseDateInfo(value, sourceTimezone).date;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.response)) return payload.response;
  if (Array.isArray(payload?.games)) return payload.games;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.teams)) return payload.teams;
  if (Array.isArray(payload?.stadiums)) return payload.stadiums;
  if (Array.isArray(payload?.stadia)) return payload.stadia;
  if (Array.isArray(payload?.result)) return payload.result;
  if (payload?.data && typeof payload.data === 'object') {
    if (Array.isArray(payload.data.games)) return payload.data.games;
    if (Array.isArray(payload.data.matches)) return payload.data.matches;
    if (Array.isArray(payload.data.teams)) return payload.data.teams;
    if (Array.isArray(payload.data.stadiums)) return payload.data.stadiums;
    if (Array.isArray(payload.data.stadia)) return payload.data.stadia;
  }
  return [];
}

async function fetchJson(url, cfg) {
  const response = await fetch(url, { headers: headers(cfg) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || data?.message || `${response.status} ${response.statusText}`;
    throw new Error(`WK API kon niet worden geladen: ${message}`);
  }
  return data;
}

async function fetchWorldCupData(cfg) {
  const [gamesPayload, teamsPayload, stadiumsPayload] = await Promise.all([
    fetchJson(`${cfg.apiBase}/get/games`, cfg),
    fetchJson(`${cfg.apiBase}/get/teams`, cfg).catch(() => []),
    fetchJson(`${cfg.apiBase}/get/stadiums`, cfg).catch(() => [])
  ]);

  const teams = new Map(fallbackTeams);
  for (const team of asArray(teamsPayload)) {
    const id = String(team.id ?? team._id ?? team.team_id ?? '').trim();
    if (!id) continue;
    teams.set(id, {
      name: team.name_en || team.name || team.team || team.country || `Team ${id}`,
      logo: team.flag || team.logo || team.image || ''
    });
  }

  const stadiums = new Map();
  for (const stadium of asArray(stadiumsPayload)) {
    const id = String(stadium.id ?? stadium._id ?? stadium.stadium_id ?? '').trim();
    if (!id) continue;
    stadiums.set(id, {
      name: stadium.name_en || stadium.fifa_name || stadium.name || '',
      city: stadium.city_en || stadium.city || stadium.country_en || ''
    });
  }

  return { games: asArray(gamesPayload), teams, stadiums };
}


function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function teamIdFrom(value) {
  if (value && typeof value === 'object') {
    return String(firstValue(value.id, value._id, value.team_id, value.teamId)).trim();
  }
  return String(value ?? '').trim();
}

function teamLabelFrom(value) {
  if (value && typeof value === 'object') {
    return firstValue(value.name_en, value.name, value.team, value.country, value.label);
  }
  return value;
}

function translatePlaceholder(label) {
  const text = String(label || '').trim();
  if (!text) return '';
  return text
    .replace(/Runner-up Group/gi, 'Nummer 2 groep')
    .replace(/Winner Group/gi, 'Winnaar groep')
    .replace(/Winner Match/gi, 'Winnaar wedstrijd')
    .replace(/Loser Match/gi, 'Verliezer wedstrijd')
    .replace(/3rd Group/gi, 'Nummer 3 groep');
}

function pickTeamName(id, label, teams) {
  const cleanId = teamIdFrom(id);
  if (cleanId && cleanId !== '0' && teams.has(cleanId)) return teams.get(cleanId).name;
  const objectLabel = teamLabelFrom(id);
  const cleanLabel = translatePlaceholder(label || objectLabel);
  return cleanLabel || 'Nog onbekend';
}

function pickTeamLogo(id, teams) {
  const cleanId = teamIdFrom(id);
  if (cleanId && teams.has(cleanId)) return teams.get(cleanId).logo || '';
  return '';
}

function teamFromGroupFallback(game, side) {
  const type = String(game.type || '').toLowerCase();
  const group = String(game.group || '').toUpperCase();
  if (type && type !== 'group') return null;
  if (!/^[A-L]$/.test(group)) return null;

  const groupTeams = fallbackGroups[group];
  if (!groupTeams || groupTeams.length < 4) return null;

  const matchday = String(game.matchday || game.match_day || game.round || '1');
  const pairIndex = Number.isFinite(game._pairIndex) ? game._pairIndex : 0;
  const pair = (fallbackPairings[matchday] || fallbackPairings['1'])[pairIndex] || (fallbackPairings[matchday] || fallbackPairings['1'])[0];
  const index = side === 'home' ? pair[0] : pair[1];
  return groupTeams[index] || null;
}

function resolveTeam(game, side, teams) {
  const isHome = side === 'home';
  const id = isHome
    ? firstValue(game.home_team_id, game.homeTeamId, game.home_id, game.homeId, game.homeTeam?.id, game.home_team?.id, game.home?.id, game.team1_id, game.team1?.id)
    : firstValue(game.away_team_id, game.awayTeamId, game.away_id, game.awayId, game.awayTeam?.id, game.away_team?.id, game.away?.id, game.team2_id, game.team2?.id);
  const label = isHome
    ? firstValue(game.home_team_label, game.home_team_name, game.homeTeamName, game.home_team, game.homeTeam, game.home, game.team1_name, game.team1)
    : firstValue(game.away_team_label, game.away_team_name, game.awayTeamName, game.away_team, game.awayTeam, game.away, game.team2_name, game.team2);

  const cleanId = teamIdFrom(id);
  if (cleanId && cleanId !== '0' && teams.has(cleanId)) {
    const team = teams.get(cleanId);
    return { name: team.name, logo: team.logo || '' };
  }

  const cleanLabel = translatePlaceholder(label || teamLabelFrom(id));
  if (cleanLabel) return { name: cleanLabel, logo: '' };

  const fallback = teamFromGroupFallback(game, side);
  if (fallback) return { name: fallback.name, logo: fallback.logo || '' };

  return { name: 'Nog onbekend', logo: '' };
}

function annotateGroupMatchPairings(games) {
  const buckets = new Map();
  for (const game of games) {
    const group = String(game.group || '').toUpperCase();
    const type = String(game.type || '').toLowerCase();
    if ((type && type !== 'group') || !/^[A-L]$/.test(group)) continue;
    const matchday = String(game.matchday || game.match_day || game.round || '1');
    const key = `${group}-${matchday}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(game);
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => {
      const dateA = parseWorldCupDate(a.local_date || a.date || a.kickoff || a.kickoff_at || a.match_date || a.utc_date);
      const dateB = parseWorldCupDate(b.local_date || b.date || b.kickoff || b.kickoff_at || b.match_date || b.utc_date);
      const timeA = dateA ? dateA.getTime() : Number(a.id || 0);
      const timeB = dateB ? dateB.getTime() : Number(b.id || 0);
      return timeA - timeB;
    });
    bucket.forEach((game, index) => { game._pairIndex = index % 2; });
  }

  return games;
}

function isFinished(game) {
  const raw = String(game.finished ?? game.is_finished ?? game.status ?? game.match_status ?? '').toLowerCase();
  return finishedValues.has(raw) || game.finished === true || game.is_finished === true;
}

function isLive(game) {
  const raw = String(game.live_status ?? game.status ?? game.match_status ?? game.state ?? '').toLowerCase();
  return liveValues.has(raw) || game.live === true || game.is_live === true;
}

function stageLabel(game) {
  const type = String(game.type || '').toLowerCase();
  const group = game.group || '';
  const map = {
    group: group ? `Groep ${group}` : 'Groepsfase',
    r32: 'Ronde van 32',
    r16: 'Achtste finale',
    qf: 'Kwartfinale',
    sf: 'Halve finale',
    third: 'Troostfinale',
    final: 'Finale'
  };
  return map[type] || (group ? `Groep ${group}` : 'WK wedstrijd');
}

function normalizeGame(game, teams, stadiums, timezone) {
  const stadium = stadiums.get(String(game.stadium_id ?? game.venue_id ?? '').trim()) || {};
  const sourceTimezone = timezoneForVenue(stadium, game);
  const dateInfo = parseDateInfo(game.local_date || game.date || game.kickoff || game.kickoff_at || game.match_date || game.utc_date, sourceTimezone);
  const date = dateInfo.date;
  const dateIso = date ? date.toISOString() : new Date(0).toISOString();
  const played = isFinished(game);
  const live = !played && isLive(game);
  const homeGoals = game.home_score ?? game.home_goals ?? game.score_home ?? game.homeScore ?? null;
  const awayGoals = game.away_score ?? game.away_goals ?? game.score_away ?? game.awayScore ?? null;
  const elapsed = game.elapsed ?? game.minute ?? game.time_elapsed ?? null;

  const home = resolveTeam(game, 'home', teams);
  const away = resolveTeam(game, 'away', teams);

  return {
    id: String(game.id ?? game._id ?? game.match_id ?? Math.random().toString(36).slice(2)),
    date: dateIso,
    dateKey: localDateKey(dateIso, timezone),
    timestamp: Math.floor(new Date(dateIso).getTime() / 1000),
    venue: stadium.name || game.stadium || game.venue || '',
    city: stadium.city || game.city || '',
    kickoffSourceTimezone: sourceTimezone,
    round: stageLabel(game),
    statusShort: played ? 'FT' : live ? 'LIVE' : dateInfo.hasTime ? 'NS' : 'TBD',
    statusLong: played ? 'Afgelopen' : live ? 'Live' : 'Nog te spelen',
    elapsed,
    state: played ? 'played' : live ? 'live' : 'upcoming',
    homeTeam: home.name,
    awayTeam: away.name,
    homeLogo: home.logo,
    awayLogo: away.logo,
    homeGoals: homeGoals === undefined || homeGoals === null || homeGoals === '' ? null : Number(homeGoals),
    awayGoals: awayGoals === undefined || awayGoals === null || awayGoals === '' ? null : Number(awayGoals)
  };
}

async function ensureCacheTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS match_cache (
      id VARCHAR(80) PRIMARY KEY,
      payload JSONB NOT NULL,
      fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function getFreshCache(client, cacheKey, cacheMinutes) {
  const result = await client.query(
    `SELECT payload, fetched_at FROM match_cache WHERE id = $1 AND fetched_at > NOW() - ($2 || ' minutes')::interval`,
    [cacheKey, String(cacheMinutes)]
  );
  if (!result.rows.length) return null;
  return result.rows[0].payload;
}

async function getAnyCache(client, cacheKey) {
  const result = await client.query(`SELECT payload FROM match_cache WHERE id = $1`, [cacheKey]);
  if (!result.rows.length) return null;
  return result.rows[0].payload;
}

async function saveCache(client, cacheKey, payload) {
  await client.query(
    `INSERT INTO match_cache (id, payload, fetched_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW()`,
    [cacheKey, JSON.stringify(payload)]
  );
}

async function buildPayload(cfg) {
  const { games, teams, stadiums } = await fetchWorldCupData(cfg);
  const annotatedGames = annotateGroupMatchPairings(games);
  const matches = annotatedGames
    .map((game) => normalizeGame(game, teams, stadiums, cfg.timezone))
    .filter((match) => match.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  const todayKey = localDateKey(new Date().toISOString(), cfg.timezone);
  const fetchedAt = new Date().toISOString();
  return {
    provider: 'worldcup26.ir',
    sourceLabel: 'Open-source WK 2026 API',
    matches,
    todayKey,
    timezone: cfg.timezone,
    fetchedAt,
    lastUpdatedAt: fetchedAt
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Methode niet toegestaan.' });

  try {
    const cfg = config();
    const cacheKey = `worldcup26-games-v6-${cfg.timezone}`;
    const payload = await withDb(async (client) => {
      await ensureCacheTable(client);
      const params = event.queryStringParameters || {};
      const forceFresh = params.fresh === '1' || params.refresh === '1';

      if (!forceFresh) {
        const cached = await getFreshCache(client, cacheKey, cfg.cacheMinutes);
        if (cached) return { ...cached, cached: true };
      }

      try {
        const fresh = await buildPayload(cfg);
        await saveCache(client, cacheKey, fresh);
        return { ...fresh, cached: false, forcedRefresh: forceFresh };
      } catch (apiError) {
        const stale = await getAnyCache(client, cacheKey);
        if (stale) return { ...stale, cached: true, stale: true, warning: apiError.message };
        throw apiError;
      }
    });

    return json(200, payload);
  } catch (error) {
    return json(500, { error: error.message });
  }
};
