const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

function json(statusCode, data, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    },
    body: JSON.stringify(data)
  };
}

async function getDatabaseUrl() {
  const manualUrl = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;
  if (manualUrl) return manualUrl;

  try {
    const database = await import('@netlify/database');
    if (database && typeof database.getConnectionString === 'function') {
      return database.getConnectionString();
    }
  } catch (error) {
    // Fallback error is thrown below with a clearer Dutch message.
  }

  return null;
}

async function withDb(callback) {
  const connectionString = await getDatabaseUrl();
  if (!connectionString) {
    throw new Error('Geen databaseverbinding gevonden. Koppel Netlify Database aan deze site of stel DATABASE_URL handmatig in.');
  }
  const client = new Client({ connectionString, ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function renderMarkdown(markdown) {
  const rawHtml = marked.parse(markdown || '', { breaks: true, gfm: true });
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      'h1','h2','h3','h4','p','strong','em','ul','ol','li','a','br','blockquote','code','pre'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' })
    }
  });
}

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

function requireAdmin(event) {
  const token = getBearerToken(event);
  if (!token) throw new Error('Niet ingelogd.');
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET ontbreekt.');
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Sessie is verlopen. Log opnieuw in.');
  }
}

function signAdmin(admin) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET ontbreekt.');
  return jwt.sign({ adminId: admin.id, email: admin.email }, secret, { expiresIn: process.env.ADMIN_SESSION_DURATION || '90d' });
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    throw new Error('Ongeldige JSON.');
  }
}


async function ensureRankingsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS rankings (
      id INT PRIMARY KEY DEFAULT 1,
      names JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMP NULL
    );
  `);
}

async function ensurePhotoDataColumn(client) {
  await client.query('ALTER TABLE update_photos ADD COLUMN IF NOT EXISTS file_data BYTEA');
}

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxImageSize = 5 * 1024 * 1024;
const maxImagesPerRequest = 5;

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Ongeldig afbeeldingsbestand.');
  const mimeType = match[1];
  if (!allowedImageTypes.includes(mimeType)) {
    throw new Error('Alleen JPG, PNG en WebP zijn toegestaan.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > maxImageSize) {
    throw new Error('Een foto mag maximaal 5 MB zijn.');
  }
  return { mimeType, buffer };
}

function safeFileName(name) {
  const clean = String(name || 'foto').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80);
  return clean || 'foto';
}

async function savePhotos(client, updateId, photos = []) {
  if (!Array.isArray(photos) || photos.length === 0) return;
  if (photos.length > maxImagesPerRequest) throw new Error('Je kunt maximaal 5 foto’s per keer uploaden.');

  await ensurePhotoDataColumn(client);

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const { mimeType, buffer } = decodeDataUrl(photo.dataUrl);
    const originalName = safeFileName(photo.name);
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const blobKey = `updates/${updateId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;

    await client.query(
      `INSERT INTO update_photos (update_id, file_name, blob_key, mime_type, file_size, alt_text, sort_order, file_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [updateId, originalName, blobKey, mimeType, buffer.length, photo.altText || null, index, buffer]
    );
  }
}

async function getPhotosByUpdateIds(client, updateIds) {
  if (!updateIds.length) return new Map();
  const result = await client.query(
    `SELECT * FROM update_photos WHERE update_id = ANY($1::int[]) ORDER BY sort_order ASC, id ASC`,
    [updateIds]
  );
  const map = new Map();
  for (const photo of result.rows) {
    if (!map.has(photo.update_id)) map.set(photo.update_id, []);
    map.get(photo.update_id).push({
      id: photo.id,
      fileName: photo.file_name,
      url: `/.netlify/functions/photo?key=${encodeURIComponent(photo.blob_key)}`,
      mimeType: photo.mime_type,
      altText: photo.alt_text || 'WK foto'
    });
  }
  return map;
}

async function deletePhotos(client, photoIds) {
  if (!Array.isArray(photoIds) || photoIds.length === 0) return;
  await client.query(`DELETE FROM update_photos WHERE id = ANY($1::int[])`, [photoIds.map(Number)]);
}

module.exports = {
  json,
  withDb,
  renderMarkdown,
  requireAdmin,
  signAdmin,
  hashPassword,
  verifyPassword,
  parseBody,
  ensureRankingsTable,
  ensurePhotoDataColumn,
  savePhotos,
  getPhotosByUpdateIds,
  deletePhotos
};
