// Headers for Supabase REST calls. New sb_secret_ keys are not JWTs and go in `apikey` only;
// legacy service_role keys are JWTs and also go in Authorization.
function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: key };
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
  return h;
}

module.exports = { headers };
