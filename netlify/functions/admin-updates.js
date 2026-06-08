const { json, withDb, requireAdmin, getPhotosByUpdateIds } = require('./_shared');

exports.handler = async (event) => {
  try {
    requireAdmin(event);
    const data = await withDb(async (client) => {
      const result = await client.query(
        `SELECT id, title, content_markdown, content_html, likes_count, created_at, updated_at
         FROM updates ORDER BY created_at DESC, id DESC`
      );
      const ids = result.rows.map((row) => row.id);
      const photos = await getPhotosByUpdateIds(client, ids);
      return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        contentMarkdown: row.content_markdown,
        contentHtml: row.content_html,
        likesCount: row.likes_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        photos: photos.get(row.id) || []
      }));
    });
    return json(200, { updates: data });
  } catch (error) {
    return json(401, { error: error.message });
  }
};
