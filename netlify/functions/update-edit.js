const { json, withDb, parseBody, requireAdmin, renderMarkdown, savePhotos, deletePhotos } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    requireAdmin(event);
    const body = parseBody(event);
    const id = Number(body.id);
    if (!id || !body.title || !body.contentMarkdown) return json(422, { error: 'Titel en inhoud zijn verplicht.' });
    const contentHtml = renderMarkdown(body.contentMarkdown);
    await withDb(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(
          `UPDATE updates SET title = $1, content_markdown = $2, content_html = $3, updated_at = NOW() WHERE id = $4`,
          [body.title.trim(), body.contentMarkdown, contentHtml, id]
        );
        await deletePhotos(client, body.deletePhotoIds || []);
        await savePhotos(client, id, body.photos || []);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    return json(200, { message: 'Update opgeslagen.' });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
