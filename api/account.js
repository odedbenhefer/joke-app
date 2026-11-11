// DELETE /api/account  ->  deletes the signed-in user and their votes (cascade). Only your own account.
const { configured, getUserId, deleteUser } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!configured()) return res.status(500).json({ error: 'missing_supabase_config' });
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'login_required' });
    await deleteUser(userId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'upstream_error' });
  }
};
