(function () {
  var form = document.getElementById('form');
  var input = document.getElementById('topic');
  var button = document.getElementById('go');
  var panels = document.querySelectorAll('#card .panel');
  var chip = document.getElementById('chip');
  var jokeEl = document.getElementById('joke');
  var errorText = document.getElementById('error-text');

  var LABEL_DEFAULT = 'תנו לי בדיחה!';
  var LABEL_AGAIN = 'עוד אחת!';
  var LABEL_LOADING = 'מחפשים בדיחה...';
  var MSG_ERROR = 'משהו השתבש, נסו שוב';
  var MSG_RATE = 'רגע, יותר מדי בדיחות.\nנסו שוב בעוד דקה';

  var laughBtn = document.getElementById('laugh');
  var topSection = document.getElementById('top');
  var topList = document.getElementById('top-list');
  var current = null;
  var hasJoke = false;

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
        hasJoke = true;
        current = { joke: data.joke, sig: data.sig, topic: topic };
        laughBtn.disabled = false;
        laughBtn.textContent = 'צחקתי 😂';
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

  function loadTop() {
    fetch('/api/top')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.jokes || !data.jokes.length) { topSection.hidden = true; return; }
        topList.textContent = '';
        data.jokes.forEach(function (row) {
          var li = document.createElement('li');
          var text = document.createElement('div');
          text.className = 'tj';
          text.textContent = row.joke;
          var count = document.createElement('span');
          count.className = 'tc';
          count.textContent = row.laughs + ' צחקו';
          li.appendChild(text);
          li.appendChild(count);
          topList.appendChild(li);
        });
        topSection.hidden = false;
      })
      .catch(function () {});
  }

  laughBtn.addEventListener('click', function () {
    if (!current || laughBtn.disabled) return;
    laughBtn.disabled = true;
    laughBtn.textContent = 'נרשם ✓';
    fetch('/api/laugh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        loadTop();
      })
      .catch(function () {
        laughBtn.disabled = false;
        laughBtn.textContent = 'לא נשמר, נסו שוב';
      });
  });

  loadTop();
})();
