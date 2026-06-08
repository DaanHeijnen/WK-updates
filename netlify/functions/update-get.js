const { json, withDb, requireAdmin, getPhotosByUpdateIds } = require('./_shared');

exports.handler = async (event) => {
  try {
    requireAdmin(event);
    const id = Number(event.queryStringParameters && event.queryStringParameters.id);
    if (!id) return json(422, { error: 'Update ontbreekt.' });
    const data = await withDb(async (client) => {
      const result = await client.query('SELECT * FROM updates WHERE id = $1 LIMIT 1', [id]);
      const row = result.rows[0];
      if (!row) return null;
      const photos = await getPhotosByUpdateIds(client, [id]);
      return {
        id: row.id,
        title: row.title,
        contentMarkdown: row.content_markdown,
        contentHtml: row.content_html,
        likesCount: row.likes_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        photos: photos.get(row.id) || []
      };
    });
    if (!data) return json(404, { error: 'Update niet gevonden.' });
    return json(200, { update: data });
  } catch (error) {
    return json(401, { error: error.message });
  }
};
