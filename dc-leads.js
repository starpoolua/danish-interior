/* Відправка заявок на Cloudflare Worker → Telegram-бот.
   Після деплою Worker вставте його адресу в DC_LEADS_ENDPOINT. Токен бота тут НЕ зберігається. */
(function () {
  var DC_LEADS_ENDPOINT = 'https://danish-leads.starpool-ua.workers.dev/';
  var TIMEOUT_MS = 60000;
  var ERR_TEXT = 'Не вдалося надіслати заявку. Спробуйте ще раз або напишіть нам у Telegram чи Viber.';

  function send(form) {
    if (!DC_LEADS_ENDPOINT) return Promise.reject(new Error('endpoint'));
    var fd = new FormData();
    ['name', 'phone', 'message'].forEach(function (k) {
      var el = form.elements[k];
      if (el && typeof el.value === 'string') fd.append(k, el.value);
    });
    fd.append('form', form.id || 'form');
    fd.append('source', location.href.slice(0, 300));
    var input = form.querySelector('input[type=file][name=photos]');
    if (input && input.files) {
      for (var i = 0; i < input.files.length && i < 3; i++) fd.append('photos', input.files[i], input.files[i].name);
    }
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(DC_LEADS_ENDPOINT, { method: 'POST', body: fd, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok || !j.ok) throw new Error('send'); }); })
      .then(function (v) { if (timer) clearTimeout(timer); return v; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function showError(form, text) {
    var box = form.querySelector('.dc-form-error');
    if (!box) {
      box = document.createElement('p');
      box.className = 'dc-form-error';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'color:#b3261e;margin:1.2rem 0 0;font-size:1.4rem;line-height:1.4';
      form.appendChild(box);
    }
    box.textContent = text || '';
  }

  /* dcSubmit(form, onOk): перевіряє форму, відправляє, при успіху викликає onOk, при помилці показує повідомлення. */
  window.dcSubmit = function (form, onOk) {
    if (form.dataset.dcSending) return;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var btn = form.querySelector('button[type=submit]');
    var label = btn && btn.querySelector('span');
    var old = label ? label.textContent : '';
    form.dataset.dcSending = '1';
    showError(form, '');
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'НАДСИЛАЄМО…';
    send(form).then(function () {
      delete form.dataset.dcSending;
      onOk();
    }, function () {
      delete form.dataset.dcSending;
      if (btn) btn.disabled = false;
      if (label) label.textContent = old;
      showError(form, ERR_TEXT);
    });
  };
})();
