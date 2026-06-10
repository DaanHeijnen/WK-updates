const { json, withDb, ensureRankingsTable } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    const ranking = await withDb(async (client) => {
      await ensureRankingsTable(client);
      const result = await client.query('SELECT names, updated_at FROM rankings WHERE id = 1');
      if (!result.rows.length) return { names: [], updatedAt: null };
      return {
        names: Array.isArray(result.rows[0].names) ? result.rows[0].names : [],
        updatedAt: result.rows[0].updated_at
      };
    });
    return json(200, { ranking });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
