(function () {
  var CFG = window.APP_CONFIG;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- auth (Supabase magic link, plain REST) ----------
  var STORE = 'jb_session';
  var session = null;

  function loadSession() {
    try { session = JSON.parse(localStorage.getItem(STORE)); } catch (e) { session = null; }
    if (session && session.access_token) session.name = jwtName(session.access_token);
  }
  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE);
    } catch (e) {}
  }
  // JWT payload is base64url JSON in UTF-8 (Hebrew names): decode bytes, not Latin-1.
  function jwtPayload(tokenValue) {
    try {
      var b = tokenValue.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b.length % 4) b += "=";
      var bin = atob(b);
      var bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
      return JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch (e) { return {}; }
  }
  function jwtEmail(tokenValue) { return jwtPayload(tokenValue).email || ""; }
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('access_token=') === -1) return;
    var q = new URLSearchParams(h);
    if (q.get('access_token')) {
      sessionFromTokens({
        access_token: q.get('access_token'),
        refresh_token: q.get('refresh_token'),
        expires_in: parseInt(q.get('expires_in'), 10) || 3600
      });
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
  function refresh() {
    if (!session || !session.refresh_token) { saveSession(null); return Promise.resolve(null); }
    return fetch(CFG.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.access_token) { saveSession(null); return null; }
        sessionFromTokens(d);
        return session.access_token;
      })
      .catch(function () { return null; });
  }
  function token() {
    if (!session) return Promise.resolve(null);
    if (session.expires_at - 60 > Date.now() / 1000) return Promise.resolve(session.access_token);
    return refresh();
  }
  function api(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      opts.headers = Object.assign({}, opts.headers || {});
      if (t) opts.headers.Authorization = 'Bearer ' + t;
      return fetch(path, opts);
    }).then(function (res) {
      if (res.status === 401 && session) { saveSession(null); renderAuth(); }
      return res;
    });
  }
  function loggedIn() { return Boolean(session); }

  // ---------- login dialog (email + password, or magic link) ----------
  var loginDlg = $('login');
  var mode = 'login';

  function jwtName(tokenValue) {
    return (jwtPayload(tokenValue).user_metadata || {}).name || '';
  }
  function sessionFromTokens(d) {
    saveSession({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      email: jwtEmail(d.access_token),
      name: jwtName(d.access_token)
    });
  }
  function loginMsg(kind, text) {
    $('login-error').hidden = kind !== 'error';
    $('login-info').hidden = kind !== 'info';
    if (kind === 'error') $('login-error').textContent = text;
    if (kind === 'info') $('login-info').textContent = text;
  }
  function setMode(m) {
    mode = m;
    var reg = m === 'register';
    $('mode-login').classList.toggle('on', !reg);
    $('mode-register').classList.toggle('on', reg);
    $('mode-login').setAttribute('aria-selected', reg ? 'false' : 'true');
    $('mode-register').setAttribute('aria-selected', reg ? 'true' : 'false');
    $('login-title').textContent = reg ? 'הרשמה' : 'כניסה';
    $('login-send').textContent = reg ? 'הרשמה' : 'כניסה';
    $('name').hidden = !reg;
    $('name-label').hidden = !reg;
    $('password').autocomplete = reg ? 'new-password' : 'current-password';
    loginMsg('none');
  }
  function openLogin(startMode) {
    setMode(startMode || 'login');
    $('login-send').disabled = false;
    if (loginDlg.showModal) loginDlg.showModal(); else loginDlg.setAttribute('open', '');
    $('email').focus();
  }
  $('mode-login').addEventListener('click', function () { setMode('login'); });
  $('mode-register').addEventListener('click', function () { setMode('register'); });
  $('login-close').addEventListener('click', function () { loginDlg.close(); });

  function authPost(path, body) {
    return fetch(CFG.supabaseUrl + '/auth/v1' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    });
  }
  function finishLogin() {
    renderAuth();
    loginDlg.close();
    resetVotes();
    if (!$('view-mine').hidden) loadMine();
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('email').value.trim();
    var password = $('password').value;
    if (!email || !password) return;
    loginMsg('none');
    $('login-send').disabled = true;

    var request;
    if (mode === 'register') {
      var name = $('name').value.trim().slice(0, 30);
      request = authPost('/signup', { email: email, password: password, data: { name: name } })
        .then(function (r) {
          if (r.ok && r.data.access_token) { sessionFromTokens(r.data); finishLogin(); return; }
          if (r.ok) { loginMsg('info', 'שלחנו מייל לאישור. לחצו על הקישור שבו ואז היכנסו.'); return; }
          var code = r.data.error_code || r.data.code || '';
          if (code === 'user_already_exists') loginMsg('error', 'המייל הזה כבר רשום. נסו להיכנס.');
          else if (code === 'weak_password') loginMsg('error', 'הסיסמה צריכה להיות לפחות 6 תווים.');
          else if (r.status === 429) loginMsg('error', 'יותר מדי ניסיונות. נסו שוב בעוד דקה.');
          else loginMsg('error', 'ההרשמה נכשלה. בדקו את הפרטים ונסו שוב.');
        });
    } else {
      request = authPost('/token?grant_type=password', { email: email, password: password })
        .then(function (r) {
          if (r.ok && r.data.access_token) { sessionFromTokens(r.data); finishLogin(); return; }
          if (r.status === 429) loginMsg('error', 'יותר מדי ניסיונות. נסו שוב בעוד דקה.');
          else if (r.status === 400) loginMsg('error', 'המייל או הסיסמה לא נכונים.');
          else loginMsg('error', 'משהו השתבש. נסו שוב.');
        });
    }
    request
      .catch(function () { loginMsg('error', 'משהו השתבש. נסו שוב.'); })
      .then(function () { $('login-send').disabled = false; });
  });

  $('magic').addEventListener('click', function () {
    var email = $('email').value.trim();
    if (!email) { loginMsg('error', 'כתבו את המייל למעלה ואז לחצו שוב.'); $('email').focus(); return; }
    loginMsg('none');
    authPost('/otp?redirect_to=' + encodeURIComponent(location.origin + '/'), { email: email, create_user: true })
      .then(function (r) {
        if (r.ok) loginMsg('info', 'שלחנו קישור למייל. לחצו עליו כדי להיכנס.');
        else loginMsg('error', 'לא הצלחנו לשלוח. נסו שוב בעוד דקה.');
      })
      .catch(function () { loginMsg('error', 'לא הצלחנו לשלוח. נסו שוב בעוד דקה.'); });
  });
  $('auth-btn').addEventListener('click', function () {
    if (!loggedIn()) { openLogin(); return; }
    if (confirm('להתנתק מ-' + (session.email || 'החשבון') + '?')) {
      saveSession(null);
      renderAuth();
      showView('joke');
      resetVotes();
    }
  });
  function renderAuth() {
    var btn = $('auth-btn');
    btn.classList.toggle('in', loggedIn());
    btn.textContent = loggedIn() ? 'נכנס ✓' + (session.name ? ' · ' + session.name : '') : 'כניסה';
  }

  // ---------- views ----------
  var views = ['joke', 'community', 'mine'];
  function showView(name) {
    syncSession();
    views.forEach(function (v) { $('view-' + v).hidden = v !== name; });
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === name);
    });
    if (name === 'community') loadCommunity();
    if (name === 'mine') loadMine();
  }
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
  });

  // ---------- voting ----------
  function setVoteUI(likeButton, dislikeButton, likes, dislikes, my) {
    likeButton.querySelector('b').textContent = likes;
    dislikeButton.querySelector('b').textContent = dislikes;
    likeButton.setAttribute('aria-pressed', my === 1 ? 'true' : 'false');
    dislikeButton.setAttribute('aria-pressed', my === -1 ? 'true' : 'false');
  }

  // clicked: 1 (like) or -1 (dislike). Pressing the same button again removes the vote.
  function castVote(item, clicked, likeButton, dislikeButton) {
    if (!loggedIn()) { openLogin(); return; }
    var value = item.my === clicked ? 0 : clicked;
    likeButton.disabled = dislikeButton.disabled = true;
    api('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joke: item.joke, sig: item.sig, topic: item.topic || '', value: value })
    })
      .then(function (res) {
        if (res.status === 401) { openLogin(); throw new Error('login'); }
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function (d) {
        item.my = d.my; item.likes = d.likes; item.dislikes = d.dislikes;
        setVoteUI(likeButton, dislikeButton, d.likes, d.dislikes, d.my);
      })
      .catch(function () {})
      .then(function () { likeButton.disabled = dislikeButton.disabled = false; });
  }

  // ---------- joke view ----------
  var form = $('form');
  var input = $('topic');
  var button = $('go');
  var panels = document.querySelectorAll('#card .panel');
  var chip = $('chip');
  var jokeEl = $('joke');
  var errorText = $('error-text');
  var likeBtn = $('like');
  var dislikeBtn = $('dislike');

  var LABEL_DEFAULT = 'תנו לי בדיחה!';
  var LABEL_AGAIN = 'עוד אחת!';
  var LABEL_LOADING = 'מחפשים בדיחה...';
  var MSG_ERROR = 'משהו השתבש, נסו שוב';
  var MSG_RATE = 'רגע, יותר מדי בדיחות.\nנסו שוב בעוד דקה';

  var hasJoke = false;
  var current = null;

  function show(name) {
    panels.forEach(function (p) { p.hidden = p.dataset.state !== name; });
  }
  function setBusy(busy) {
    button.disabled = busy;
    if (busy) {
      button.setAttribute('aria-busy', 'true');
      button.textContent = LABEL_LOADING;
    } else {
      button.removeAttribute('aria-busy');
      button.textContent = hasJoke ? LABEL_AGAIN : LABEL_DEFAULT;
    }
  }
  function showError(message) {
    errorText.textContent = message;
    errorText.style.whiteSpace = 'pre-line';
    show('error');
  }
  function resetVotes() {
    if (current) {
      current.my = 0;
      setVoteUI(likeBtn, dislikeBtn, current.likes || 0, current.dislikes || 0, 0);
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (button.disabled) return;
    var topic = input.value.replace(/\s+/g, ' ').trim().slice(0, 40);

    setBusy(true);
    show('loading');

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 45000);

    fetch('/api/joke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic }),
      signal: controller.signal
    })
      .then(function (res) {
        if (res.status === 429) { var e = new Error('rate'); e.rate = true; throw e; }
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.joke) throw new Error('empty');
        jokeEl.textContent = data.joke;
        chip.textContent = topic ? 'בדיחה על ' + topic : 'בדיחה כללית';
        current = { joke: data.joke, sig: data.sig, topic: topic, likes: 0, dislikes: 0, my: 0 };
        setVoteUI(likeBtn, dislikeBtn, 0, 0, 0);
        hasJoke = true;
        show('result');
      })
      .catch(function (err) {
        showError(err && err.rate ? MSG_RATE : MSG_ERROR);
      })
      .then(function () {
        clearTimeout(timer);
        setBusy(false);
      });
  });

  likeBtn.addEventListener('click', function () {
    if (current) castVote(current, 1, likeBtn, dislikeBtn);
  });
  dislikeBtn.addEventListener('click', function () {
    if (current) castVote(current, -1, likeBtn, dislikeBtn);
  });

  // ---------- lists (community / mine) ----------
  function renderList(listEl, items, withDislike) {
    listEl.textContent = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'item';
      var p = document.createElement('p');
      p.className = 'joke';
      p.textContent = item.joke;
      li.appendChild(p);
      if (item.topic) {
        var c = document.createElement('span');
        c.className = 'chip';
        c.textContent = 'על ' + item.topic;
        li.appendChild(c);
      }
      var votes = document.createElement('div');
      votes.className = 'votes';
      var lb = document.createElement('button');
      lb.type = 'button';
      lb.className = 'vote vote-like';
      lb.appendChild(document.createTextNode('אהבתי 👍 '));
      lb.appendChild(document.createElement('b'));
      var db = document.createElement('button');
      db.type = 'button';
      db.className = 'vote vote-dislike';
      db.appendChild(document.createTextNode('לא אהבתי 👎 '));
      db.appendChild(document.createElement('b'));
      setVoteUI(lb, db, item.likes, item.dislikes, item.my || 0);
      lb.addEventListener('click', function () { castVote(item, 1, lb, db); });
      db.addEventListener('click', function () { castVote(item, -1, lb, db); });
      votes.appendChild(lb);
      if (withDislike) votes.appendChild(db);
      li.appendChild(votes);
      listEl.appendChild(li);
    });
  }

  var sort = 'top';
  function setSort(s) {
    sort = s;
    $('tab-top').classList.toggle('on', s === 'top');
    $('tab-new').classList.toggle('on', s === 'new');
    $('tab-top').setAttribute('aria-selected', s === 'top' ? 'true' : 'false');
    $('tab-new').setAttribute('aria-selected', s === 'new' ? 'true' : 'false');
    loadCommunity();
  }
  $('tab-top').addEventListener('click', function () { setSort('top'); });
  $('tab-new').addEventListener('click', function () { setSort('new'); });

  function loadCommunity() {
    api('/api/community?sort=' + sort)
      .then(function (res) { return res.ok ? res.json() : { jokes: [] }; })
      .then(function (d) {
        renderList($('community-list'), d.jokes, true);
        $('community-empty').hidden = d.jokes.length > 0;
      })
      .catch(function () {});
  }

  function loadMine() {
    var open = loggedIn();
    $('mine-locked').hidden = open;
    $('mine-open').hidden = !open;
    if (!open) return;
    api('/api/mine')
      .then(function (res) { return res.ok ? res.json() : { jokes: [] }; })
      .then(function (d) {
        renderList($('mine-list'), d.jokes, true);
        $('mine-empty').hidden = d.jokes.length > 0;
      })
      .catch(function () {});
  }
  $('mine-login').addEventListener('click', function () { openLogin('login'); });

  $('delete-account').addEventListener('click', function () {
    if (!confirm('למחוק את החשבון שלך לצמיתות? הסימונים שלך יימחקו.')) return;
    api('/api/account', { method: 'DELETE' })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        saveSession(null);
        renderAuth();
        resetVotes();
        showView('joke');
      })
      .catch(function () { alert('המחיקה נכשלה, נסו שוב.'); });
  });

  // ---------- start ----------
  // The magic link opens in a new tab and saves the session there: pick it up in every open tab.
  function syncSession() {
    var was = loggedIn();
    loadSession();
    if (was !== loggedIn()) {
      renderAuth();
      if (loggedIn() && loginDlg.open) loginDlg.close();
      if (!$('view-mine').hidden) loadMine();
    }
  }
  window.addEventListener('storage', function (e) { if (e.key === STORE) syncSession(); });
  window.addEventListener('focus', syncSession);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncSession(); });

  loadSession();
  readHash();
  renderAuth();
})();
