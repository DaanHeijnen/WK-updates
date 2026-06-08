const { json, withDb, parseBody, requireAdmin, deletePhotos } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    requireAdmin(event);
    const body = parseBody(event);
    await withDb((client) => deletePhotos(client, [Number(body.id)]));
    return json(200, { message: 'Foto verwijderd.' });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
