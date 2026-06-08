const { json, withDb, parseBody, requireAdmin, deletePhotos } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    requireAdmin(event);
    const body = parseBody(event);
    const id = Number(body.id);
    if (!id) return json(422, { error: 'Update ontbreekt.' });
    await withDb(async (client) => {
      const photos = await client.query('SELECT id FROM update_photos WHERE update_id = $1', [id]);
      await deletePhotos(client, photos.rows.map((row) => row.id));
      await client.query('DELETE FROM updates WHERE id = $1', [id]);
    });
    return json(200, { message: 'Update verwijderd.' });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
