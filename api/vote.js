// POST /api/vote  { joke, topic, sig, value }  (value: 1 like, -1 dislike, 0 remove)  -> { likes, dislikes, my }
// Requires a signed-in user (Authorization: Bearer <access token>).
const { verify } = require('../lib/sign');
const { configured, rpc, getUserId } = require('../lib/supabase');

const hits = new Map();
function isLimited(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > 30;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!configured()) return res.status(500).json({ error: 'missing_supabase_config' });

  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'login_required' });
    if (isLimited(userId)) return res.status(429).json({ error: 'rate_limited' });

    const body = req.body || {};
    const joke = typeof body.joke === 'string' ? body.joke : '';
    const topic = typeof body.topic === 'string' ? body.topic.slice(0, 40) : '';
    const value = Number(body.value);
    if (!joke || joke.length > 500 || !verify(joke, body.sig) || ![1, -1, 0].includes(value)) {
      return res.status(400).json({ error: 'invalid_vote' });
    }

    const rows = await rpc('vote', { p_user: userId, p_joke: joke, p_topic: topic, p_value: value });
    const row = rows[0] || { likes: 0, dislikes: 0, my: 0 };
    return res.status(200).json({ likes: Number(row.likes), dislikes: Number(row.dislikes), my: row.my });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'upstream_error' });
  }
};
