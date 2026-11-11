// GET /api/mine  ->  { jokes: [{ joke, topic, likes, dislikes }] }  the signed-in user's liked jokes only.
const { configured, rpc, getUserId } = require('../lib/supabase');
const { sign } = require('../lib/sign');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!configured()) return res.status(500).json({ error: 'missing_supabase_config' });
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'login_required' });
    const rows = await rpc('my_likes', { p_user: userId });
    return res.status(200).json({
      jokes: rows.map((r) => ({
        joke: r.joke, sig: sign(r.joke), topic: r.topic, likes: Number(r.likes), dislikes: Number(r.dislikes), my: 1,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'upstream_error' });
  }
};
