const { photoStore } = require('./_shared');

exports.handler = async (event) => {
  try {
    const key = event.queryStringParameters && event.queryStringParameters.key;
    if (!key || !key.startsWith('updates/')) return { statusCode: 404, body: 'Niet gevonden' };
    const store = photoStore(event);
    const data = await store.get(key, { type: 'arrayBuffer' });
    if (!data) return { statusCode: 404, body: 'Niet gevonden' };
    const meta = await store.getMetadata(key).catch(() => null);
    const contentType = meta && meta.metadata && meta.metadata.contentType ? meta.metadata.contentType : 'image/jpeg';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
      isBase64Encoded: true,
      body: Buffer.from(data).toString('base64')
    };
  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
};
