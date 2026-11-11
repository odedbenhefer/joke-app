// GET /api/community?sort=top|new  ->  { jokes: [{ joke, topic, likes, dislikes, my }] }
// Open to guests; a signed-in user also gets their own vote in `my`.
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
    const sort = req.query && req.query.sort === 'new' ? 'new' : 'top';
    const rows = await rpc('community', { p_user: userId, p_sort: sort, p_limit: 20 });
    return res.status(200).json({
      jokes: rows.map((r) => ({
        joke: r.joke, sig: sign(r.joke), topic: r.topic, likes: Number(r.likes), dislikes: Number(r.dislikes), my: r.my,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'upstream_error' });
  }
};
