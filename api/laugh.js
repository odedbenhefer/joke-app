// POST /api/laugh  { joke, topic, sig }  ->  { laughs }
const { verify } = require('../lib/sign');

const hits = new Map();
function isLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'missing_supabase_config' });
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const body = req.body || {};
  const joke = typeof body.joke === 'string' ? body.joke : '';
  const topic = typeof body.topic === 'string' ? body.topic.slice(0, 40) : '';
  if (!joke || joke.length > 500 || !verify(joke, body.sig)) {
    return res.status(400).json({ error: 'invalid_joke' });
  }

  try {
    const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/laugh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ p_joke: joke, p_topic: topic }),
    });
    if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 300));
    return res.status(200).json({ laughs: await r.json() });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'upstream_error' });
  }
};
