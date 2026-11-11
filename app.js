/* Smileat Competitive Intelligence · aplicación web (sin dependencias salvo supabase-js) */
(() => {
'use strict';

const CFG = window.APP_CONFIG || {};
const $app = document.getElementById('app');

const CATS = {
  'innovacion':         { name: 'Innovación',         color: 'var(--green)',  icon: 'icono-innovacion.png', bb: 'b-green',  intro: 'Nuevos productos, formatos, ingredientes y evolución de las gamas de alimentación infantil.' },
  'trade':              { name: 'Trade',              color: 'var(--orange)', icon: 'icono-trade.png',      bb: 'b-orange', intro: 'Acciones de marcas y retailers en el punto de venta.' },
  'marketing-eventos':  { name: 'Marketing y eventos', color: 'var(--pink)',  icon: 'icono-marketing.png',  bb: 'b-pink',   intro: 'Campañas de marca, colaboraciones y próximos eventos relevantes para el sector de alimentación infantil.' },
  'publicidad-digital': { name: 'Publicidad digital', color: 'var(--purple)', icon: 'icono-digital.png',    bb: 'b-purple', intro: 'Estrategias y creatividades detectadas en marcas de referencia, con ejemplos.' }
};
const STATUS = { nuevo: 'Nuevo', revisado: 'Revisado', utilizado: 'Utilizado', descartado: 'Descartado' };
const KINDS  = { inspiracion: 'Inspiración', idea: 'Idea para Smileat', duda: 'Duda', nota: 'Nota' };
const ITEM_KIND = { noticia: 'Noticia', campana: 'Campaña', evento: 'Evento', anuncio: 'Anuncios', tendencia: 'Tendencia' };
const MAX_PHOTOS = 6;

const state = {
  sb: null, session: null, ready: false, loadError: null, isAdmin: false,
  editions: [], items: [], statuses: new Map(), counts: new Map(),
  filters: { month: '', status: '', q: '' }
};

/* ---------- utilidades ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid); }
  return el;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const monthLabel = m => m ? cap(new Date(m + 'T00:00:00Z').toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })).replace(' de ', ' de ') : '';
const fmtDate = d => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const initials = n => (n || '?').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const statusOf = it => (state.statuses.get(it.id) || {}).status || 'nuevo';
const emailOk = e => /^[^@\s]+@smileat\.com$/i.test(e || '');
let toastTimer;
function toast(msg, err) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div', { class: 'toast' + (err ? ' err' : ''), role: 'status' }, msg);
  document.body.append(t); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 4000);
}
function show(...nodes) { $app.replaceChildren(...nodes); }

async function signedMap(bucket, paths) {
  const map = new Map(); paths = [...new Set(paths)].filter(Boolean);
  if (!paths.length) return map;
  const { data, error } = await state.sb.storage.from(bucket).createSignedUrls(paths, 3600);
  if (error || !data) return map;
  data.forEach(r => { if (r.signedUrl) map.set(r.path, r.signedUrl); });
  return map;
}

/* ---------- datos ---------- */
async function loadAll() {
  const sb = state.sb;
  const [ed, it, st, cm, adm] = await Promise.all([
    sb.from('editions').select('*').order('month', { ascending: false }),
    sb.from('items').select('*').order('sort'),
    sb.from('item_status').select('*'),
    sb.from('comments').select('item_id'),
    sb.rpc('is_admin')
  ]);
  for (const r of [ed, it, st, cm]) if (r.error) throw r.error;
  state.editions = ed.data; state.items = it.data;
  state.statuses = new Map(st.data.map(s => [s.item_id, s]));
  state.counts = new Map(); cm.data.forEach(c => state.counts.set(c.item_id, (state.counts.get(c.item_id) || 0) + 1));
  state.isAdmin = adm.data === true;
  if (!state.filters.month || !state.editions.some(e => e.month === state.filters.month)) state.filters.month = (state.editions[0] || {}).month || '';
}

/* ---------- estructura común ---------- */
function shell(main, active) {
  const email = state.session.user.email;
  const link = (href, text, key) => h('a', { href, class: active === key ? 'on' : '' }, text);
  return [
    h('header', { class: 'top' }, h('div', { class: 'w' },
      h('a', { class: 'brand', href: '#/' }, h('img', { src: 'assets/img/logo.png', alt: 'Smileat' }), 'Competitive Intelligence'),
      h('nav', {}, link('#/', 'Inicio', 'home'), Object.entries(CATS).map(([k, c]) => link('#/c/' + k, c.name, k))),
      h('div', { class: 'who' }, h('span', { title: email }, email), h('button', { class: 'btn ghost sm', onclick: () => state.sb.auth.signOut() }, 'Salir')))),
    h('main', { class: 'w' }, main),
    h('footer', {}, h('div', { class: 'w' }, 'Smileat Competitive Intelligence. Uso interno.'))
  ];
}

function monthSelect(onchange) {
  const sel = h('select', { 'aria-label': 'Mes', onchange: e => { state.filters.month = e.target.value; onchange(); } },
    h('option', { value: '' }, 'Todos los meses'),
    state.editions.map(e => h('option', { value: e.month, selected: e.month === state.filters.month }, monthLabel(e.month))));
  return sel;
}

/* ---------- vistas ---------- */
function renderLogin(msg) {
  show(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('img', { class: 'logo', src: 'assets/img/logo.png', alt: 'Smileat' }),
    h('h1', {}, 'Competitive Intelligence'),
    h('div', { class: 'chars', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map(i => h('img', { src: `assets/img/personaje-${i}.png`, alt: '' }))),
    h('p', {}, 'Novedades de la competencia, ideas e inspiración para el equipo de Smileat.'),
    msg && h('p', { class: 'msg err', style: 'padding:0 0 16px' }, msg),
    h('button', { class: 'btn', onclick: signIn }, 'Entrar con Google'),
    h('p', { class: 'small' }, 'Acceso solo con cuenta @smileat.com'))));
}
async function signIn() {
  const { error } = await state.sb.auth.signInWithOAuth({ provider: 'google', options: {
    redirectTo: location.origin + location.pathname, queryParams: { hd: 'smileat.com', prompt: 'select_account' } } });
  if (error) toast('No se pudo iniciar sesión: ' + error.message, true);
}

function renderSetup() {
  show(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('h1', {}, 'Falta configurar'),
    h('p', {}, 'Rellena SUPABASE_URL y SUPABASE_ANON_KEY en config.js. Los pasos están en el README.'))));
}

function viewHome() {
  const f = state.filters;
  const ed = state.editions.find(e => e.month === f.month);
  const items = state.items.filter(i => !f.month || i.edition === f.month);
  const brands = new Set(items.map(i => i.brand).filter(Boolean));
  const ncomments = items.reduce((n, i) => n + (state.counts.get(i.id) || 0), 0);
  const pending = items.filter(i => statusOf(i) === 'nuevo').length;
  const bub = (cls, c, n, label) => h('div', { class: 'bub ' + cls, style: `--c:${c}` }, h('b', {}, n), h('span', {}, label));

  return [
    h('section', { class: 'mast' },
      h('div', {},
        h('div', { class: 'ed' }, monthSelect(route)),
        h('h1', {}, ed ? ed.title : 'Sin edición para este periodo'),
        h('div', { class: 'chars', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map(i => h('img', { src: `assets/img/personaje-${i}.png`, alt: '' })))),
      h('div', { class: 'stats' },
        bub('b-blue', 'var(--blue)', items.length, 'novedades'),
        bub('b-navy', 'var(--navy)', brands.size, 'marcas'),
        bub('b-dgreen', '#2e7d3a', ncomments, 'comentarios')),
      ed && ed.summary_html && h('div', { class: 'summary' }, h('h3', {}, 'Resumen de la edición'), h('div', { html: ed.summary_html }),
        h('div', { class: 'stats-line' }, 'Estado del mes:', ...Object.keys(STATUS).map(s => {
          const n = items.filter(i => statusOf(i) === s).length;
          return h('span', { class: 'chip ' + s }, `${STATUS[s]} · ${n}`);
        }), pending ? h('span', {}, `${pending} pendientes de revisar`) : null))),
    h('section', { class: 'sec' }, h('h2', {}, 'Categorías', h('a', { href: '#/c/todo' }, 'Ver todas las novedades →')),
      h('div', { class: 'cats' }, Object.entries(CATS).map(([k, c]) => {
        const n = items.filter(i => i.category === k).length;
        return h('a', { class: 'cat', href: '#/c/' + k },
          h('div', { class: 'bb ' + c.bb }, h('img', { src: 'assets/img/' + c.icon, alt: '' })),
          h('div', {}, h('h3', {}, c.name), h('small', {}, n === 1 ? '1 novedad' : `${n} novedades`)));
      })))
  ];
}

function matches(it, q) {
  if (!q) return true;
  const hay = [it.title, it.summary, it.brand, it.market].filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function viewList(key) {
  const cat = CATS[key] || { name: 'Todas las novedades', color: 'var(--blue)', icon: 'icono-innovacion.png', intro: 'Todo el contenido de la edición, de todas las categorías.' };
  const rows = h('div', {}), count = h('span', { class: 'count' });
  const f = state.filters;
  function draw() {
    const list = state.items.filter(i => (key === 'todo' || i.category === key) && (!f.month || i.edition === f.month)
      && (!f.status || statusOf(i) === f.status) && matches(i, f.q))
      .sort((a, b) => a.sort - b.sort);
    count.textContent = list.length === 1 ? '1 resultado' : `${list.length} resultados`;
    rows.replaceChildren(...(list.length ? list.map(rowFor) : [h('p', { class: 'empty' }, 'No hay novedades con estos filtros.')]));
  }
  const rowFor = i => {
    const c = CATS[i.category], s = statusOf(i), n = state.counts.get(i.id) || 0;
    return h('a', { class: 'row', href: '#/i/' + encodeURIComponent(i.slug), style: `--c:${c.color}` },
      h('div', {}, h('span', { class: 'tag' }, h('img', { src: 'assets/img/' + c.icon, alt: '' }), (key === 'todo' ? c.name + ' · ' : '') + (ITEM_KIND[i.kind] || '')),
        h('h3', {}, i.title), i.summary && h('small', {}, i.summary)),
      h('div', { class: 'm' }, [i.brand, i.market].filter(Boolean).join(', ')),
      h('div', { class: 'd' }, i.date_label || '', h('div', { class: 'meta' }, h('span', { class: 'chip ' + s }, STATUS[s]), n ? h('span', { class: 'nc' }, `💬 ${n}`) : null)));
  };
  const q = h('input', { type: 'search', placeholder: 'Buscar marca, mercado o tema…', value: f.q, 'aria-label': 'Buscar', oninput: e => { f.q = e.target.value; draw(); } });
  const st = h('select', { 'aria-label': 'Estado', onchange: e => { f.status = e.target.value; draw(); } },
    h('option', { value: '' }, 'Cualquier estado'), Object.entries(STATUS).map(([k, v]) => h('option', { value: k, selected: f.status === k }, v)));
  draw();
  return [
    h('section', { class: 'sec', style: 'padding-top:36px' },
      h('h1', { style: 'font-size:48px;margin-bottom:6px' }, cat.name),
      h('p', { style: 'font-size:16px;margin:0;color:var(--blue)' }, cat.intro),
      h('div', { class: 'filters' }, monthSelect(draw), st, q, count)),
    h('section', { class: 'sec', style: 'padding-top:12px' }, rows)
  ];
}

function viewItem(slug) {
  const it = state.items.find(i => i.slug === slug);
  if (!it) return [h('p', { class: 'msg' }, 'No se ha encontrado esta novedad. ', h('a', { href: '#/' }, 'Volver al inicio'))];
  const c = CATS[it.category];
  const fi = h('dl', { class: 'fi' });
  const add = (k, v) => { if (v) fi.append(h('dt', {}, k), h('dd', {}, v)); };
  add('Marca', it.brand); add('Mercado', it.market); add('Fecha', it.date_label);
  if ((it.sources || []).length) fi.append(h('dt', {}, 'Fuentes'),
    h('dd', {}, it.sources.map((s, i) => [i ? h('br') : null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--blue);font-weight:600' }, s.label + ' ↗')])));
  const gallery = h('div', { class: 'gallery hidden' });
  if ((it.images || []).length) signedMap('contenido', it.images.map(x => x.path)).then(map => {
    gallery.classList.remove('hidden');
    gallery.replaceChildren(...it.images.map(x => {
      const url = map.get(x.path);
      return h('figure', {}, url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: url, alt: x.caption || '', loading: 'lazy' })) : h('div', { class: 'nofile' }, 'Imagen no disponible'),
        x.caption && h('figcaption', {}, x.caption));
    }));
  });
  return [
    h('a', { class: 'back', href: '#/c/' + it.category }, '← ' + c.name),
    h('article', { class: 'art' },
      h('div', {},
        h('span', { class: 'tag', style: `--c:${c.color};font-size:14px` }, h('img', { src: 'assets/img/' + c.icon, alt: '' }),
          [c.name, ITEM_KIND[it.kind], it.market].filter(Boolean).join(' · ')),
        h('h1', {}, it.title),
        h('div', { class: 'body', html: it.body_html || '' }),
        gallery,
        commentsSection(it)),
      h('aside', {}, fi.children.length ? fi : null, statusPanel(it)))
  ];
}

/* ---------- estados ---------- */
function statusPanel(it) {
  const box = h('div', { class: 'stat-panel' });
  function draw() {
    const cur = state.statuses.get(it.id), s = (cur || {}).status || 'nuevo';
    const used = h('input', { type: 'text', maxlength: 300, placeholder: '¿Dónde se ha utilizado? (campaña, anuncio, reunión…)', value: (cur || {}).used_in || '', 'aria-label': 'Dónde se ha utilizado',
      onchange: e => save('utilizado', e.target.value) });
    box.replaceChildren(h('h4', {}, 'Estado de esta novedad'),
      h('div', { class: 'pills' }, Object.entries(STATUS).map(([k, v]) =>
        h('button', { class: 'pill-btn' + (s === k ? ' on' : ''), 'aria-pressed': String(s === k), onclick: () => save(k, k === 'utilizado' ? (cur || {}).used_in : null) }, v))),
      s === 'utilizado' ? used : null,
      cur && cur.updated_by_email ? h('div', { class: 'by' }, `Actualizado por ${cur.updated_by_email} · ${fmtDate(cur.updated_at)}`) : null);
  }
  async function save(status, used_in) {
    const { data, error } = await state.sb.from('item_status')
      .upsert({ item_id: it.id, status, used_in: (used_in || '').trim() || null }, { onConflict: 'item_id' }).select().single();
    if (error) return toast('No se pudo guardar el estado: ' + error.message, true);
    state.statuses.set(it.id, data); draw(); toast('Estado guardado');
  }
  draw();
  return box;
}

/* ---------- comentarios ---------- */
function commentsSection(it) {
  const list = h('div', {}), title = h('h2', {}, 'Comentarios e inspiración');
  const me = state.session.user.id;
  async function load() {
    const { data, error } = await state.sb.from('comments').select('*').eq('item_id', it.id).order('created_at', { ascending: true });
    if (error) { list.replaceChildren(h('p', { class: 'msg err' }, 'No se pudieron cargar los comentarios: ' + error.message)); return; }
    state.counts.set(it.id, data.length);
    title.textContent = `Comentarios e inspiración (${data.length})`;
    const urls = await signedMap('comentarios', data.flatMap(c => c.photos || []));
    list.replaceChildren(...(data.length ? data.map(c => cmNode(c, urls)) : [h('p', { class: 'empty', style: 'padding:20px 0' }, 'Aún no hay comentarios. Sé la primera persona en aportar una idea.')]));
  }
  function cmNode(c, urls) {
    const mine = c.user_id === me;
    return h('div', { class: 'cm' }, h('div', { class: 'av', 'aria-hidden': 'true' }, initials(c.author_name)),
      h('div', {},
        h('div', { class: 'cm-head' }, h('b', {}, c.author_name || c.author_email), h('span', { class: 'chip k-' + c.kind }, KINDS[c.kind] || c.kind), fmtDate(c.created_at),
          (mine || state.isAdmin) ? h('button', { class: 'del', onclick: () => del(c) }, 'Eliminar') : null),
        h('p', { class: 'cm-body' }, c.body),
        (c.photos || []).length ? h('div', { class: 'cm-photos' }, c.photos.map(p => urls.get(p) ? h('a', { href: urls.get(p), target: '_blank', rel: 'noopener' }, h('img', { src: urls.get(p), alt: 'Foto adjunta', loading: 'lazy' })) : null)) : null));
  }
  async function del(c) {
    if (!confirm('¿Eliminar este comentario y sus fotos?')) return;
    if ((c.photos || []).length) await state.sb.storage.from('comentarios').remove(c.photos);
    const { error } = await state.sb.from('comments').delete().eq('id', c.id);
    if (error) return toast('No se pudo eliminar: ' + error.message, true);
    load();
  }

  // formulario
  let picked = [];
  const ta = h('textarea', { placeholder: 'Comparte una inspiración, una idea para Smileat o una duda…', maxlength: 4000, 'aria-label': 'Comentario' });
  const kind = h('select', { 'aria-label': 'Tipo' }, Object.entries(KINDS).map(([k, v]) => h('option', { value: k }, v)));
  const previews = h('div', { class: 'previews' });
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden', onchange: e => {
    for (const f of e.target.files) { if (picked.length >= MAX_PHOTOS) { toast(`Máximo ${MAX_PHOTOS} fotos por comentario`, true); break; } picked.push(f); }
    e.target.value = ''; drawPreviews(); } });
  const send = h('button', { class: 'btn', onclick: post }, 'Publicar');
  function drawPreviews() {
    previews.replaceChildren(...picked.map((f, i) => h('div', { class: 'pv' },
      h('img', { src: URL.createObjectURL(f), alt: 'Vista previa' }),
      h('button', { 'aria-label': 'Quitar foto', onclick: () => { picked.splice(i, 1); drawPreviews(); } }, '×'))));
  }
  async function post() {
    const body = ta.value.trim();
    if (!body) return toast('Escribe un comentario', true);
    send.disabled = true; send.textContent = 'Publicando…';
    const uploaded = [];
    try {
      for (const f of picked) {
        const blob = await shrink(f);
        const path = `${me}/${crypto.randomUUID()}.jpg`;
        const { error } = await state.sb.storage.from('comentarios').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error; uploaded.push(path);
      }
      const { error } = await state.sb.from('comments').insert({ item_id: it.id, kind: kind.value, body, photos: uploaded });
      if (error) throw error;
      ta.value = ''; picked = []; drawPreviews(); await load(); toast('Comentario publicado');
    } catch (e) {
      if (uploaded.length) state.sb.storage.from('comentarios').remove(uploaded);
      toast('No se pudo publicar: ' + (e.message || e), true);
    } finally { send.disabled = false; send.textContent = 'Publicar'; }
  }
  load();
  return h('section', { class: 'comments' }, title,
    h('div', { class: 'cform' }, ta, previews,
      h('div', { class: 'bar' }, kind, h('button', { class: 'btn ghost sm', onclick: () => file.click() }, '📷 Añadir fotos'), file, h('span', { class: 'grow' }), send)),
    list);
}

// Reduce la foto (máx. 1600 px, JPEG) para ahorrar almacenamiento.
async function shrink(file, max = 1600) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('Formato de imagen no admitido (usa JPG, PNG o WebP)'); }
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('No se pudo procesar la imagen')), 'image/jpeg', 0.85));
}

/* ---------- enrutado ---------- */
function route() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return renderSetup();
  if (!state.session) return renderLogin();
  if (!emailOk(state.session.user.email)) {
    return show(h('div', { class: 'login' }, h('div', { class: 'login-card' }, h('h1', {}, 'Acceso no autorizado'),
      h('p', {}, `La cuenta ${state.session.user.email} no pertenece a Smileat. Entra con tu cuenta @smileat.com.`),
      h('button', { class: 'btn', onclick: () => state.sb.auth.signOut() }, 'Cambiar de cuenta'))));
  }
  if (state.loadError) return show(...shell(h('p', { class: 'msg err' }, 'No se pudieron cargar los datos: ' + state.loadError), ''));
  if (!state.ready) return show(h('p', { class: 'loading' }, 'Cargando…'));
  const parts = (location.hash || '#/').split('/');
  let main, active = 'home';
  if (parts[1] === 'c' && parts[2]) { const k = decodeURIComponent(parts[2]); main = viewList(k); active = k; }
  else if (parts[1] === 'i' && parts[2]) { const it = state.items.find(i => i.slug === decodeURIComponent(parts[2])); main = viewItem(decodeURIComponent(parts[2])); active = it ? it.category : ''; }
  else main = viewHome();
  show(...shell(main, active));
  if (!(parts[1] === 'c' || parts[1] === 'i')) window.scrollTo(0, 0);
}

async function onSession(session) {
  const prev = state.session && state.session.user.id;
  state.session = session;
  if (!session) { state.ready = false; state.loadError = null; return route(); }
  if (!emailOk(session.user.email)) return route();
  if (prev === session.user.id && state.ready) return;
  state.ready = false; route();
  try { await loadAll(); state.loadError = null; } catch (e) { state.loadError = e.message || String(e); }
  state.ready = true; route();
}

(async function boot() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return renderSetup();
  state.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  window.addEventListener('hashchange', route);
  state.sb.auth.onAuthStateChange((_ev, session) => { setTimeout(() => onSession(session), 0); });
  const { data } = await state.sb.auth.getSession();
  await onSession(data.session);
})();
})();
