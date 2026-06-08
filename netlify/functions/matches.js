const { json, withDb } = require('./_shared');

const DEFAULT_API_BASE = 'https://worldcup26.ir';
const finishedValues = new Set(['true', '1', 'yes', 'finished', 'ft', 'fulltime', 'full_time', 'completed', 'afgelopen']);
const liveValues = new Set(['live', 'in_play', 'playing', '1h', '2h', 'ht', 'et', 'pen', 'nu bezig']);


const fallbackTeams = new Map(Object.entries({
  '1': { name: 'Mexico', logo: '' },
  '2': { name: 'South Africa', logo: '' },
  '3': { name: 'South Korea', logo: '' },
  '4': { name: 'UEFA Path D Winner', logo: '' },
  '5': { name: 'Canada', logo: '' },
  '6': { name: 'UEFA Path A Winner', logo: '' },
  '7': { name: 'Qatar', logo: '' },
  '8': { name: 'Switzerland', logo: '' },
  '9': { name: 'Brazil', logo: '' },
  '10': { name: 'Morocco', logo: '' },
  '11': { name: 'Haiti', logo: '' },
  '12': { name: 'Scotland', logo: '' },
  '13': { name: 'United States', logo: '' },
  '14': { name: 'Paraguay', logo: '' },
  '15': { name: 'Australia', logo: '' },
  '16': { name: 'UEFA Path C Winner', logo: '' },
  '17': { name: 'Germany', logo: '' },
  '18': { name: 'Curaçao', logo: '' },
  '19': { name: 'Ivory Coast', logo: '' },
  '20': { name: 'Ecuador', logo: '' },
  '21': { name: 'Netherlands', logo: '' },
  '22': { name: 'Japan', logo: '' },
  '23': { name: 'UEFA Path B Winner', logo: '' },
  '24': { name: 'Tunisia', logo: '' },
  '25': { name: 'Belgium', logo: '' },
  '26': { name: 'Egypt', logo: '' },
  '27': { name: 'Iran', logo: '' },
  '28': { name: 'New Zealand', logo: '' },
  '29': { name: 'Spain', logo: '' },
  '30': { name: 'Cape Verde', logo: '' },
  '31': { name: 'Saudi Arabia', logo: '' },
  '32': { name: 'Uruguay', logo: '' },
  '33': { name: 'France', logo: '' },
  '34': { name: 'Senegal', logo: '' },
  '35': { name: 'IC Path 2 Winner', logo: '' },
  '36': { name: 'Norway', logo: '' },
  '37': { name: 'Argentina', logo: '' },
  '38': { name: 'Algeria', logo: '' },
  '39': { name: 'Austria', logo: '' },
  '40': { name: 'Jordan', logo: '' },
  '41': { name: 'Portugal', logo: '' },
  '42': { name: 'IC Path 1 Winner', logo: '' },
  '43': { name: 'Uzbekistan', logo: '' },
  '44': { name: 'Colombia', logo: '' },
  '45': { name: 'England', logo: '' },
  '46': { name: 'Croatia', logo: '' },
  '47': { name: 'Ghana', logo: '' },
  '48': { name: 'Panama', logo: '' }
}));

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

function parseWorldCupDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();

  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(text);
  if (usMatch) {
    const [, month, day, year, hour, minute] = usMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0));
  }

  const isoLike = new Date(text);
  return Number.isNaN(isoLike.getTime()) ? null : isoLike;
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
  const date = parseWorldCupDate(game.local_date || game.date || game.kickoff || game.kickoff_at || game.match_date || game.utc_date);
  const dateIso = date ? date.toISOString() : new Date(0).toISOString();
  const stadium = stadiums.get(String(game.stadium_id ?? game.venue_id ?? '').trim()) || {};
  const played = isFinished(game);
  const live = !played && isLive(game);
  const homeGoals = game.home_score ?? game.home_goals ?? game.score_home ?? game.homeScore ?? null;
  const awayGoals = game.away_score ?? game.away_goals ?? game.score_away ?? game.awayScore ?? null;
  const elapsed = game.elapsed ?? game.minute ?? game.time_elapsed ?? null;

  const homeId = firstValue(game.home_team_id, game.homeTeamId, game.home_id, game.homeId, game.homeTeam?.id, game.home_team?.id, game.home?.id, game.team1_id, game.team1?.id);
  const awayId = firstValue(game.away_team_id, game.awayTeamId, game.away_id, game.awayId, game.awayTeam?.id, game.away_team?.id, game.away?.id, game.team2_id, game.team2?.id);
  const homeLabel = firstValue(game.home_team_label, game.home_team_name, game.homeTeamName, game.home_team, game.homeTeam, game.home, game.team1_name, game.team1);
  const awayLabel = firstValue(game.away_team_label, game.away_team_name, game.awayTeamName, game.away_team, game.awayTeam, game.away, game.team2_name, game.team2);

  return {
    id: String(game.id ?? game._id ?? game.match_id ?? Math.random().toString(36).slice(2)),
    date: dateIso,
    dateKey: localDateKey(dateIso, timezone),
    timestamp: Math.floor(new Date(dateIso).getTime() / 1000),
    venue: stadium.name || game.stadium || game.venue || '',
    city: stadium.city || game.city || '',
    round: stageLabel(game),
    statusShort: played ? 'FT' : live ? 'LIVE' : 'TBD',
    statusLong: played ? 'Afgelopen' : live ? 'Live' : 'Nog te spelen',
    elapsed,
    state: played ? 'played' : live ? 'live' : 'upcoming',
    homeTeam: pickTeamName(homeId, homeLabel, teams),
    awayTeam: pickTeamName(awayId, awayLabel, teams),
    homeLogo: pickTeamLogo(homeId, teams),
    awayLogo: pickTeamLogo(awayId, teams),
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
  const matches = games
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
    const cacheKey = `worldcup26-games-v2-${cfg.timezone}`;
    const payload = await withDb(async (client) => {
      await ensureCacheTable(client);
      const cached = await getFreshCache(client, cacheKey, cfg.cacheMinutes);
      if (cached) return { ...cached, cached: true };

      try {
        const fresh = await buildPayload(cfg);
        await saveCache(client, cacheKey, fresh);
        return { ...fresh, cached: false };
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
