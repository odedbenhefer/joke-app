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
})();
