const { json, requireAdmin } = require('./_shared');

exports.handler = async (event) => {
  try {
    const admin = requireAdmin(event);
    return json(200, { loggedIn: true, email: admin.email });
  } catch (error) {
    return json(401, { loggedIn: false, error: error.message });
  }
};
