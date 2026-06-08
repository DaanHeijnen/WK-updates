const { withDb, ensurePhotoDataColumn } = require('./_shared');

exports.handler = async (event) => {
  try {
    const key = event.queryStringParameters && event.queryStringParameters.key;
    if (!key || !key.startsWith('updates/')) return { statusCode: 404, body: 'Niet gevonden' };

    const photo = await withDb(async (client) => {
      await ensurePhotoDataColumn(client);
      const result = await client.query(
        'SELECT mime_type, file_data FROM update_photos WHERE blob_key = $1 LIMIT 1',
        [key]
      );
      return result.rows[0] || null;
    });

    if (!photo || !photo.file_data) return { statusCode: 404, body: 'Niet gevonden' };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': photo.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
      isBase64Encoded: true,
      body: Buffer.from(photo.file_data).toString('base64')
    };
  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
};
