const { json, withDb, parseBody, requireAdmin, renderMarkdown, savePhotos } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    requireAdmin(event);
    const body = parseBody(event);
    if (!body.title || !body.contentMarkdown) return json(422, { error: 'Titel en inhoud zijn verplicht.' });
    const contentHtml = renderMarkdown(body.contentMarkdown);
    const update = await withDb(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await client.query(
          `INSERT INTO updates (title, content_markdown, content_html, status)
           VALUES ($1, $2, $3, 'published') RETURNING *`,
          [body.title.trim(), body.contentMarkdown, contentHtml]
        );
        await savePhotos(client, result.rows[0].id, body.photos || []);
        await client.query('COMMIT');
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    return json(200, { message: 'Update geplaatst.', updateId: update.id });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
