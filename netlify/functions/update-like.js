const { json, withDb, parseBody } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    const body = parseBody(event);
    const id = Number(body.id);
    if (!id) return json(422, { error: 'Update ontbreekt.' });

    let delta = 1;
    if (typeof body.liked === 'boolean') delta = body.liked ? 1 : -1;
    else if (Number(body.delta) === -1) delta = -1;

    const result = await withDb((client) => client.query(
      `UPDATE updates
       SET likes_count = GREATEST(likes_count + $2, 0)
       WHERE id = $1
       RETURNING likes_count`,
      [id, delta]
    ));
    if (!result.rows[0]) return json(404, { error: 'Update niet gevonden.' });
    return json(200, { likesCount: result.rows[0].likes_count });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
