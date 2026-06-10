const { json, withDb, parseBody, requireAdmin, ensureRankingsTable } = require('./_shared');

function parseRankingNames(value) {
  const rawNames = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n/);

  return rawNames
    .map((line) => String(line || '')
      .replace(/^\s*(?:\d+[.)-]?\s*|[-*•]\s*)/, '')
      .trim())
    .filter(Boolean);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    requireAdmin(event);
    const body = parseBody(event);
    const names = parseRankingNames(body.names || body.rankingText);

    if (names.length !== 10) {
      return json(422, { error: 'Plak precies 10 namen, ieder op een eigen regel.' });
    }

    const ranking = await withDb(async (client) => {
      await ensureRankingsTable(client);
      const result = await client.query(
        `INSERT INTO rankings (id, names, updated_at)
         VALUES (1, $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names, updated_at = NOW()
         RETURNING names, updated_at`,
        [JSON.stringify(names)]
      );
      return {
        names: result.rows[0].names,
        updatedAt: result.rows[0].updated_at
      };
    });

    return json(200, { message: 'Ranking is bijgewerkt.', ranking });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
