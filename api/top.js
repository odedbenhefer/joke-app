// GET /api/top  ->  { jokes: [{ joke, topic, laughs }] }  (funniest first)
const { headers } = require('../lib/supabase');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'missing_supabase_config' });
  }
  try {
    const url = process.env.SUPABASE_URL +
      '/rest/v1/jokes?select=joke,topic,laughs&order=laughs.desc,created_at.desc&limit=10';
    const r = await fetch(url, {
      headers: headers(),
    });
    if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 300));
    return res.status(200).json({ jokes: await r.json() });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'upstream_error' });
  }
};
