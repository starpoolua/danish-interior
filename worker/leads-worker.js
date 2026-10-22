// Cloudflare Worker: приймає заявку з форми danishinterior.com (з фото) і пересилає її в Telegram.
// Секрети (НЕ в коді!): BOT_TOKEN і CHAT_ID задаються в Cloudflare → Worker → Settings → Variables and Secrets.

const ALLOWED_ORIGINS = ['https://danishinterior.com', 'https://www.danishinterior.com'];
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const OK_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => String(s || '').trim().slice(0, n);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

let lastError = '';

async function telegram(env, method, fields) {
  const body = new FormData();
  body.set('chat_id', String(env.CHAT_ID).trim());
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/${method}`, { method: 'POST', body });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    lastError = `${res.status} ${j.description || ''}`.trim();
  }
  return res.ok;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'method' }, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { ok: false, error: 'origin' }, origin);
    if (!env.BOT_TOKEN || !env.CHAT_ID) return reply(500, { ok: false, error: 'not_configured' }, origin);

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return reply(400, { ok: false, error: 'bad_form' }, origin);
    }

    const name = clip(form.get('name'), 100);
    const phone = clip(form.get('phone'), 40);
    const message = clip(form.get('message'), 3000);
    const kind = clip(form.get('form'), 60) || 'form';
    const source = clip(form.get('source'), 300);
    if (!name || !phone) return reply(422, { ok: false, error: 'missing_fields' }, origin);

    const files = form.getAll('photos').filter((f) => f && typeof f === 'object' && f.size > 0);
    if (files.length > MAX_FILES) return reply(422, { ok: false, error: 'too_many_files' }, origin);
    for (const f of files) {
      if (!(OK_TYPES.includes(f.type) || OK_EXT.test(f.name || ''))) return reply(422, { ok: false, error: 'file_type' }, origin);
      if (f.size > MAX_FILE_BYTES) return reply(422, { ok: false, error: 'file_size' }, origin);
    }

    const lines = [
      '<b>Нова заявка · danishinterior.com</b>',
      `<b>Ім’я:</b> ${esc(name)}`,
      `<b>Телефон:</b> ${esc(phone)}`,
    ];
    if (message) lines.push(`<b>Повідомлення:</b>\n${esc(message)}`);
    lines.push(`<i>Форма: ${esc(kind)}${files.length ? ` · фото: ${files.length}` : ''}</i>`);
    if (source) lines.push(`<i>${esc(source)}</i>`);

    const sent = await telegram(env, 'sendMessage', {
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
    });
    if (!sent) return reply(502, { ok: false, error: 'telegram', detail: lastError }, origin);

    // Фото: JPEG/PNG як фото, решта (WebP/HEIC) як файл. Помилка одного фото не скасовує заявку.
    let failed = 0;
    for (const f of files) {
      const caption = `${name} · ${f.name || 'фото'}`.slice(0, 200);
      let ok = false;
      if (PHOTO_TYPES.includes(f.type)) ok = await telegram(env, 'sendPhoto', { photo: f, caption });
      if (!ok) ok = await telegram(env, 'sendDocument', { document: f, caption });
      if (!ok) failed++;
    }
    if (failed) await telegram(env, 'sendMessage', { text: `⚠️ Не вдалося переслати фото: ${failed} з ${files.length} (заявка вище отримана).` });

    return reply(200, { ok: true }, origin);
  },
};
