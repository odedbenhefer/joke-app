// Server-side Supabase helpers (secret key never leaves the server).
// New sb_secret_ keys are not JWTs and go in `apikey` only; legacy service_role keys are JWTs
// and also go in Authorization.
const { PUBLISHABLE_KEY } = require('./config');

function adminHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
  return h;
}

function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function rpc(name, args) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('Supabase ' + name + ' ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

// Returns the signed-in user id for the request's Bearer token, or null (guest / bad token).
async function getUserId(req) {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) return null;
  const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: 'Bearer ' + m[1] },
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user && user.id ? user.id : null;
}

async function deleteUser(id) {
  const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/admin/users/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!r.ok) throw new Error('Supabase delete user ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

module.exports = { configured, rpc, getUserId, deleteUser };
