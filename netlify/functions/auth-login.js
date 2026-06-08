const { json, withDb, parseBody, verifyPassword, signAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Methode niet toegestaan.' });
  try {
    const body = parseBody(event);
    const result = await withDb((client) => client.query('SELECT * FROM admin_users WHERE email = $1 LIMIT 1', [String(body.email || '').toLowerCase()]));
    const admin = result.rows[0];
    if (!admin || !(await verifyPassword(body.password || '', admin.password_hash))) {
      return json(401, { error: 'E-mailadres of wachtwoord klopt niet.' });
    }
    return json(200, { token: signAdmin(admin), email: admin.email });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
