const { json, withDb } = require('./_shared');

const finishedStatuses = new Set(['FT', 'AET', 'PEN']);
const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);

function apiConfig() {
  return {
    key: process.env.API_FOOTBALL_KEY || process.env.APIFOOTBALL_KEY || process.env.API_SPORTS_KEY,
    league: process.env.API_FOOTBALL_LEAGUE || '1',
    season: process.env.API_FOOTBALL_SEASON || '2026',
    timezone: process.env.API_FOOTBALL_TIMEZONE || 'Europe/Amsterdam',
    cacheMinutes: Number(process.env.MATCH_CACHE_MINUTES || 30)
  };
}

function localDateKey(dateValue, timezone) {
  const date = new Date(dateValue);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeFixture(item, timezone) {
  const statusShort = item.fixture?.status?.short || 'TBD';
  const statusLong = item.fixture?.status?.long || '';
  const homeGoals = item.goals?.home;
  const awayGoals = item.goals?.away;
  const elapsed = item.fixture?.status?.elapsed;
  let state = 'upcoming';
  if (finishedStatuses.has(statusShort)) state = 'played';
  else if (liveStatuses.has(statusShort)) state = 'live';

  return {
    id: item.fixture?.id,
    date: item.fixture?.date,
    dateKey: localDateKey(item.fixture?.date, timezone),
    timestamp: item.fixture?.timestamp || Math.floor(new Date(item.fixture?.date).getTime() / 1000),
    venue: item.fixture?.venue?.name || '',
    city: item.fixture?.venue?.city || '',
    round: item.league?.round || '',
    statusShort,
    statusLong,
    elapsed,
    state,
    homeTeam: item.teams?.home?.name || 'Nog onbekend',
    awayTeam: item.teams?.away?.name || 'Nog onbekend',
    homeLogo: item.teams?.home?.logo || '',
    awayLogo: item.teams?.away?.logo || '',
    homeGoals,
    awayGoals
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

async function getCachedMatches(client, cacheKey, cacheMinutes) {
  const result = await client.query(
    `SELECT payload, fetched_at FROM match_cache WHERE id = $1 AND fetched_at > NOW() - ($2 || ' minutes')::interval`,
    [cacheKey, String(cacheMinutes)]
  );
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

async function fetchFixtures(config) {
  if (!config.key) {
    throw new Error('API_FOOTBALL_KEY ontbreekt. Voeg deze toe aan de Environment variables in Netlify.');
  }
  const url = new URL('https://v3.football.api-sports.io/fixtures');
  url.searchParams.set('league', config.league);
  url.searchParams.set('season', config.season);
  url.searchParams.set('timezone', config.timezone);

  const response = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': config.key
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || 'API-Football kon niet worden geladen.');
  }
  if (Array.isArray(data?.errors) && data.errors.length) {
    throw new Error(data.errors.join(', '));
  }
  if (data?.errors && typeof data.errors === 'object' && Object.keys(data.errors).length) {
    throw new Error(Object.values(data.errors).join(', '));
  }
  return data.response || [];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    const config = apiConfig();
    const cacheKey = `api-football-fixtures-${config.league}-${config.season}-${config.timezone}`;
    const payload = await withDb(async (client) => {
      await ensureCacheTable(client);
      const cached = await getCachedMatches(client, cacheKey, config.cacheMinutes);
      if (cached) return { ...cached, cached: true };

      const fixtures = await fetchFixtures(config);
      const matches = fixtures.map((fixture) => normalizeFixture(fixture, config.timezone)).sort((a, b) => a.timestamp - b.timestamp);
      const todayKey = localDateKey(new Date().toISOString(), config.timezone);
      const result = {
        matches,
        todayKey,
        league: Number(config.league),
        season: Number(config.season),
        timezone: config.timezone,
        fetchedAt: new Date().toISOString()
      };
      await saveCache(client, cacheKey, result);
      return { ...result, cached: false };
    });
    return json(200, payload);
  } catch (error) {
    return json(500, { error: error.message });
  }
};
