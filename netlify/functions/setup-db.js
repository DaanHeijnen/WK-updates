const { json, withDb, parseBody, hashPassword } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    const body = parseBody(event);
    if (!process.env.ADMIN_SETUP_SECRET || body.setupSecret !== process.env.ADMIN_SETUP_SECRET) {
      return json(403, { error: 'Ongeldige setup-code.' });
    }
    if (!body.email || !body.password || body.password.length < 8) {
      return json(422, { error: 'Vul een e-mailadres en wachtwoord van minimaal 8 tekens in.' });
    }
    await withDb(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NULL
        );
        CREATE TABLE IF NOT EXISTS updates (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content_markdown TEXT NOT NULL,
          content_html TEXT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'published',
          likes_count INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NULL
        );
        CREATE TABLE IF NOT EXISTS update_photos (
          id SERIAL PRIMARY KEY,
          update_id INT NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
          file_name VARCHAR(255) NOT NULL,
          blob_key VARCHAR(500) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          file_size INT NOT NULL,
          alt_text VARCHAR(255) NULL,
          sort_order INT NOT NULL DEFAULT 0,
          file_data BYTEA NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_updates_created_at ON updates(created_at DESC);
        ALTER TABLE update_photos ADD COLUMN IF NOT EXISTS file_data BYTEA;
        CREATE INDEX IF NOT EXISTS idx_update_photos_update_id ON update_photos(update_id);
        CREATE TABLE IF NOT EXISTS rankings (
          id INT PRIMARY KEY DEFAULT 1,
          names JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at TIMESTAMP NULL
        );
        CREATE TABLE IF NOT EXISTS match_cache (
          id VARCHAR(80) PRIMARY KEY,
          payload JSONB NOT NULL,
          fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      const passwordHash = await hashPassword(body.password);
      await client.query(
        `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
        [body.email.toLowerCase(), passwordHash]
      );
    });
    return json(200, { message: 'Database en admin zijn aangemaakt.' });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
