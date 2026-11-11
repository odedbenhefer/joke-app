// Jokes are signed by /api/joke so /api/laugh only stores jokes this app really produced.
const crypto = require('crypto');

function sign(joke) {
  return crypto.createHmac('sha256', process.env.OPENAI_API_KEY || '').update(joke).digest('hex');
}

function verify(joke, sig) {
  if (typeof sig !== 'string' || sig.length !== 64) return false;
  return crypto.timingSafeEqual(Buffer.from(sign(joke)), Buffer.from(sig));
}

module.exports = { sign, verify };
