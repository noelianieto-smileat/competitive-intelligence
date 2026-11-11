/* Smileat Competitive Intelligence · aplicación web (sin dependencias salvo supabase-js) */
(() => {
'use strict';

const CFG = window.APP_CONFIG || {};
// Limpia espacios y barras finales; si pegaron una URL con /rest/v1 o /auth/v1, se queda solo con el dominio del proyecto.
const SB_URL = String(CFG.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1.*$/i, '');
const SB_KEY = String(CFG.SUPABASE_ANON_KEY || '').trim();
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
  filters: { month: '', status: '', q: '', cat: '' }
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
  if (state.filters.month && !state.editions.some(e => e.month === state.filters.month)) state.filters.month = '';
}

/* ---------- estructura común ---------- */
function shell(main, active) {
  const email = state.session.user.email;
  return [
    h('header', { class: 'top' }, h('div', { class: 'w' },
      h('a', { class: 'brand', href: '#/' }, h('img', { src: 'assets/img/logo.png', alt: 'Smileat' }), 'Competitive Intelligence'),
      h('nav', {}, h('a', { href: '#/resumen', class: active === 'resumen' ? 'on' : '' }, 'Resumen mes anterior')),
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
    h('p', {}, 'Inspiración de aquí y de allá para seguir revolucionando el mundo de la alimentación infantil'),
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

/* URLs firmadas con caché (caducan a la hora; se renuevan a los 50 min). */
const urlCache = new Map();
async function signedCached(bucket, paths) {
  const now = Date.now(), key = p => bucket + '/' + p;
  const need = [...new Set(paths)].filter(p => p && !(urlCache.has(key(p)) && now - urlCache.get(key(p)).t < 50 * 60e3));
  if (need.length) { const m = await signedMap(bucket, need); m.forEach((u, p) => urlCache.set(key(p), { u, t: now })); }
  return new Map(paths.map(p => [p, (urlCache.get(key(p)) || {}).u]));
}
const coverPath = it => ((it.images || [])[0] || {}).path;
const byNewest = (a, b) => b.edition.localeCompare(a.edition) || (new Date(b.event_date || b.created_at) - new Date(a.event_date || a.created_at)) || (a.sort - b.sort);
const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'novedad';
const canEdit = it => state.isAdmin || it.created_by === state.session.user.id;

function matches(it, q) {
  if (!q) return true;
  const hay = [it.title, it.summary, it.brand, it.market].filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

/* ---------- piezas compartidas: pestañas y tarjetas ---------- */
function catChips(active) {
  const chip = (k, label, href, color) => h('a', { class: 'fchip' + (active === k ? ' on' : ''), href, style: color ? `--c:${color}` : '' }, label);
  return h('div', { class: 'fchips', role: 'navigation', 'aria-label': 'Categorías' },
    chip('', 'Todas', '#/'), Object.entries(CATS).map(([k, c]) => chip(k, c.name, '#/c/' + k, c.color)));
}
function cardFor(i, covers) {
  const c = CATS[i.category], s = statusOf(i), n = state.counts.get(i.id) || 0;
  const cover = h('div', { class: 'cover' }, h('img', { class: 'ph-icon', src: 'assets/img/' + c.icon, alt: '' }));
  covers.push([i, cover]);
  return h('a', { class: 'card', href: '#/i/' + encodeURIComponent(i.slug), style: `--c:${c.color}` },
    cover, h('span', { class: 'chip st ' + s }, STATUS[s]),
    h('div', { class: 'cb' }, h('span', { class: 'ctag' }, c.name), h('h3', {}, i.title),
      h('small', {}, [i.brand, i.market].filter(Boolean).join(' · ')), n ? h('span', { class: 'nc' }, `💬 ${n}`) : null));
}
function fillCovers(covers) {
  const paths = covers.map(([i]) => coverPath(i)).filter(Boolean);
  if (paths.length) signedCached('contenido', paths).then(map => covers.forEach(([i, el]) => {
    const u = map.get(coverPath(i));
    if (u) el.replaceChildren(h('img', { src: u, alt: '', loading: 'lazy' }));
  }));
}

/* ---------- portada: galería ---------- */
function viewHome() {
  const f = state.filters;
  const ed = f.month && state.editions.find(e => e.month === f.month);
  const grid = h('div', { class: 'grid' }), count = h('span', { class: 'count' });

  function draw() {
    const covers = [];
    const list = state.items.filter(i => (!f.cat || i.category === f.cat) && (!f.month || i.edition === f.month)
      && (!f.status || statusOf(i) === f.status) && matches(i, f.q)).sort(byNewest);
    count.textContent = list.length === 1 ? '1 novedad' : `${list.length} novedades`;
    grid.replaceChildren(...(list.length ? list.map(i => cardFor(i, covers)) : [h('p', { class: 'empty' }, state.items.length ? 'No hay novedades con estos filtros.' : 'Todavía no hay novedades. Añade la primera con el botón de arriba.')]));
    fillCovers(covers);
  }
  const st = h('select', { 'aria-label': 'Estado', onchange: e => { f.status = e.target.value; draw(); } },
    h('option', { value: '' }, 'Cualquier estado'), Object.entries(STATUS).map(([k, v]) => h('option', { value: k, selected: f.status === k }, v)));
  const q = h('input', { type: 'search', placeholder: 'Buscar marca, mercado o tema…', value: f.q, 'aria-label': 'Buscar', oninput: e => { f.q = e.target.value; draw(); } });
  draw();
  return [
    h('section', { class: 'hero' },
      h('div', {}, h('h1', {}, 'Novedades de la competencia'), h('p', { class: 'lead' }, 'Haz clic en una imagen para ver el detalle.')),
      h('button', { class: 'btn', onclick: () => openEditor(null) }, '+ Añadir novedad')),
    catChips(f.cat),
    h('div', { class: 'filters' }, monthSelect(route), st, q, count),
    ed && ed.summary_html ? h('details', { class: 'sumd' }, h('summary', {}, 'Resumen de ' + monthLabel(ed.month).toLowerCase()), h('div', { html: ed.summary_html })) : null,
    grid
  ];
}

/* ---------- resumen del mes anterior ---------- */
function previousEdition() {
  const pad = n => String(n).padStart(2, '0'), now = new Date();
  const cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const pd = new Date(now.getFullYear(), now.getMonth() - 1, 1), prev = `${pd.getFullYear()}-${pad(pd.getMonth() + 1)}-01`;
  return state.editions.find(e => e.month === prev) || state.editions.find(e => e.month < cur) || state.editions[0] || null;
}
function viewResumen() {
  const ed = previousEdition();
  const head = [h('section', { class: 'hero' }, h('div', {}, h('h1', {}, ed ? 'Resumen de ' + monthLabel(ed.month).toLowerCase() : 'Resumen del mes anterior'),
      ed && h('p', { class: 'lead' }, ed.title))), catChips(null)];
  if (!ed) return [...head, h('p', { class: 'empty' }, 'Todavía no hay ninguna edición anterior.')];
  const items = state.items.filter(i => i.edition === ed.month).sort(byNewest);
  const covers = [];
  const blocks = Object.entries(CATS).map(([k, c]) => {
    const n = items.filter(i => i.category === k);
    return h('div', { class: 'rcat', style: `--c:${c.color}` }, h('b', {}, n.length), h('span', {}, c.name));
  });
  const auto = () => h('div', {}, Object.entries(CATS).map(([k, c]) => {
    const n = items.filter(i => i.category === k); if (!n.length) return null;
    return h('div', {}, h('h3', { style: `color:${c.color};margin:12px 0 4px` }, c.name),
      h('ul', { style: 'margin:0;padding-left:20px' }, n.map(i => h('li', {}, h('a', { href: '#/i/' + encodeURIComponent(i.slug), style: 'color:var(--navy);font-weight:600' }, i.title)))));
  }));
  const grid = h('div', { class: 'grid' }, items.map(i => cardFor(i, covers)));
  fillCovers(covers);
  return [...head,
    h('div', { class: 'rcats' }, blocks),
    h('section', { class: 'sumd open' }, ed.summary_html ? h('div', { html: ed.summary_html }) : [h('h3', {}, 'Lo más destacado'), auto()]),
    h('section', { class: 'sec', style: 'padding-top:28px' }, h('h2', {}, 'Novedades del mes',
      h('a', { href: '#/', onclick: () => { state.filters.month = ed.month; } }, 'Ver en la galería →'))),
    grid];
}

/* ---------- detalle ---------- */
function viewItem(slug) {
  const it = state.items.find(i => i.slug === slug);
  if (!it) return [h('p', { class: 'msg' }, 'No se ha encontrado esta novedad. ', h('a', { href: '#/' }, 'Volver al inicio'))];
  const c = CATS[it.category], plain = !it.body_html;
  const fi = h('dl', { class: 'fi' });
  const add = (k, v) => { if (v) fi.append(h('dt', {}, k), h('dd', {}, v)); };
  add('Marca', it.brand); add('Mercado', it.market); add('Fecha', it.date_label); add('Añadido por', it.created_by_name);
  if ((it.sources || []).length) fi.append(h('dt', {}, 'Fuentes'),
    h('dd', {}, it.sources.map((s, i) => [i ? h('br') : null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--blue);font-weight:600' }, s.label + ' ↗')])));
  const gallery = h('div', { class: 'gallery hidden' + (plain ? ' big' : '') });
  if ((it.images || []).length) signedCached('contenido', it.images.map(x => x.path)).then(map => {
    gallery.classList.remove('hidden');
    gallery.replaceChildren(...it.images.map(x => {
      const url = map.get(x.path);
      return h('figure', {}, url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: url, alt: x.caption || '', loading: 'lazy' })) : h('div', { class: 'nofile' }, 'Imagen no disponible'),
        x.caption && h('figcaption', {}, x.caption));
    }));
  });
  const body = plain
    ? h('div', { class: 'body plain' }, it.summary && h('p', { class: 'lede' }, it.summary),
        (it.body_text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => h('p', {}, p)))
    : h('div', { class: 'body', html: it.body_html });
  return [
    h('a', { class: 'back', href: it.category ? '#/c/' + it.category : '#/' }, '← ' + c.name),
    h('article', { class: 'art' },
      h('div', {},
        h('span', { class: 'tag', style: `--c:${c.color};font-size:14px` }, h('img', { src: 'assets/img/' + c.icon, alt: '' }),
          [c.name, ITEM_KIND[it.kind], it.market].filter(Boolean).join(' · ')),
        h('h1', {}, it.title),
        canEdit(it) ? h('div', { class: 'acts' }, h('button', { class: 'btn ghost sm', onclick: () => openEditor(it) }, 'Editar'),
          h('button', { class: 'btn ghost sm danger', onclick: () => deleteItem(it) }, 'Eliminar')) : null,
        plain ? gallery : null,
        body,
        plain ? null : gallery,
        commentsSection(it)),
      h('aside', {}, fi.children.length ? fi : null, statusPanel(it)))
  ];
}

async function deleteItem(it) {
  if (!confirm('¿Eliminar esta novedad con sus fotos, estado y comentarios? No se puede deshacer.')) return;
  const sb = state.sb, me = state.session.user.id;
  const { data: cms } = await sb.from('comments').select('photos').eq('item_id', it.id);
  const { data, error } = await sb.from('items').delete().eq('id', it.id).select();
  if (error) return toast('No se pudo eliminar: ' + error.message, true);
  if (!data || !data.length) return toast('No tienes permiso para eliminar esta novedad', true);
  const mine = p => state.isAdmin || p.startsWith(me + '/');
  const own = (it.images || []).map(x => x.path).filter(p => p && mine(p));
  if (own.length) sb.storage.from('contenido').remove(own);
  const cp = (cms || []).flatMap(c => c.photos || []).filter(mine);
  if (cp.length) sb.storage.from('comentarios').remove(cp);
  await loadAll(); location.hash = '#/'; route(); toast('Novedad eliminada');
}

/* ---------- alta / edición de novedades ---------- */
const MAX_ITEM_PHOTOS = 8;
function openEditor(it) {
  const sb = state.sb, me = state.session.user.id;
  const editing = !!it, legacy = !!(it && it.body_html);
  const today = new Date().toISOString().slice(0, 10);
  const initDate = it ? (it.event_date || it.edition) : today;
  let kept = it ? [...(it.images || [])] : [];
  let picked = [];
  const removed = [];

  const field = (label, input, hint) => h('label', { class: 'fld' }, h('span', {}, label), input, hint ? h('em', {}, hint) : null);
  const fCat = h('select', {}, Object.entries(CATS).map(([k, v]) => h('option', { value: k, selected: it ? it.category === k : (state.filters.cat === k) }, v.name)));
  const fKind = h('select', {}, Object.entries(ITEM_KIND).map(([k, v]) => h('option', { value: k, selected: it ? it.kind === k : k === 'noticia' }, v)));
  const fTitle = h('input', { type: 'text', maxlength: 140, required: true, value: it ? it.title : '', placeholder: 'Ej. Aldi renueva su gama Mamia' });
  const fBrand = h('input', { type: 'text', maxlength: 80, value: it ? it.brand || '' : '', placeholder: 'Ej. Aldi' });
  const fMarket = h('input', { type: 'text', maxlength: 80, value: it ? it.market || '' : '', placeholder: 'Ej. Alemania' });
  const fDate = h('input', { type: 'date', value: initDate });
  const fSummary = h('input', { type: 'text', maxlength: 200, value: it ? it.summary || '' : '', placeholder: 'Una frase (opcional)' });
  const fBody = h('textarea', { maxlength: 20000, rows: 6, placeholder: 'Qué ha pasado, por qué importa para Smileat… (opcional)' }, it ? it.body_text || '' : '');
  const fUrl = h('input', { type: 'url', maxlength: 500, value: it && (it.sources || [])[0] ? it.sources[0].url : '', placeholder: 'https://…' });

  const thumbs = h('div', { class: 'previews' });
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden', onchange: e => {
    for (const f of e.target.files) { if (kept.length + picked.length >= MAX_ITEM_PHOTOS) { toast(`Máximo ${MAX_ITEM_PHOTOS} fotos`, true); break; } picked.push(f); }
    e.target.value = ''; drawThumbs(); } });
  async function drawThumbs() {
    const map = await signedCached('contenido', kept.map(x => x.path));
    thumbs.replaceChildren(
      ...kept.map((x, i) => h('div', { class: 'pv' }, map.get(x.path) ? h('img', { src: map.get(x.path), alt: '' }) : h('div', { class: 'nofile' }, '—'),
        h('button', { type: 'button', 'aria-label': 'Quitar foto', onclick: () => { removed.push(kept.splice(i, 1)[0].path); drawThumbs(); } }, '×'))),
      ...picked.map((f, i) => h('div', { class: 'pv' }, h('img', { src: URL.createObjectURL(f), alt: 'Vista previa' }),
        h('button', { type: 'button', 'aria-label': 'Quitar foto', onclick: () => { picked.splice(i, 1); drawThumbs(); } }, '×'))));
  }
  drawThumbs();

  const saveBtn = h('button', { class: 'btn', type: 'submit' }, editing ? 'Guardar cambios' : 'Publicar');
  const form = h('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': editing ? 'Editar novedad' : 'Añadir novedad', onsubmit: save },
    h('h2', {}, editing ? 'Editar novedad' : 'Añadir novedad'),
    h('div', { class: 'photos' }, h('div', { class: 'phead' }, h('b', {}, 'Fotos'),
      h('button', { type: 'button', class: 'btn ghost sm', onclick: () => file.click() }, '📷 Añadir fotos'), file),
      thumbs, h('small', {}, 'La primera foto será la portada en la galería.')),
    h('div', { class: 'two' }, field('Categoría', fCat), field('Tipo', fKind)),
    field('Título', fTitle),
    h('div', { class: 'two' }, field('Marca', fBrand), field('Mercado', fMarket)),
    h('div', { class: 'two' }, field('Fecha', fDate), field('Enlace a la fuente', fUrl)),
    field('Resumen', fSummary),
    legacy ? h('p', { class: 'small' }, 'Esta novedad tiene el texto con formato del contenido inicial; su detalle solo se cambia desde Supabase.') : field('Detalle', fBody),
    h('div', { class: 'bar' }, h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Cancelar'), saveBtn));
  const back = h('div', { class: 'modal-back', onmousedown: e => { if (e.target === back) close(); } }, form);
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() { document.removeEventListener('keydown', onKey); document.body.classList.remove('noscroll'); back.remove(); }
  document.addEventListener('keydown', onKey);
  document.body.classList.add('noscroll'); document.body.append(back); fTitle.focus();

  async function save(ev) {
    ev.preventDefault();
    const title = fTitle.value.trim(); if (!title) return toast('Escribe un título', true);
    const url = fUrl.value.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) return toast('El enlace debe empezar por http:// o https://', true);
    const date = fDate.value || today, dateChanged = !editing || date !== initDate, month = date.slice(0, 7) + '-01';
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    const uploaded = [];
    try {
      if (dateChanged) { const { error } = await sb.rpc('ensure_edition', { m: month }); if (error) throw error; }
      for (const f of picked) {
        const path = `${me}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from('contenido').upload(path, await shrink(f), { contentType: 'image/jpeg' });
        if (error) throw error; uploaded.push(path);
      }
      let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      const prev = (it && it.sources) || [];
      const first = url ? [{ label: (prev[0] && prev[0].url === url) ? prev[0].label : host, url }] : [];
      const row = { category: fCat.value, kind: fKind.value, title, summary: fSummary.value.trim() || null,
        brand: fBrand.value.trim() || null, market: fMarket.value.trim() || null,
        sources: [...first, ...prev.slice(1)], images: [...kept, ...uploaded.map(path => ({ path, caption: '' }))] };
      if (!legacy) row.body_text = fBody.value.trim() || null;
      if (dateChanged) { row.edition = month; row.event_date = date; row.date_label = fmtDate(date + 'T12:00:00'); }
      let q;
      if (editing) q = sb.from('items').update(row).eq('id', it.id).select().single();
      else q = sb.from('items').insert({ ...row, slug: slugify(title) + '-' + Math.random().toString(36).slice(2, 7) }).select().single();
      const { data, error } = await q;
      if (error) throw error;
      const gone = removed.filter(p => state.isAdmin || p.startsWith(me + '/'));
      if (gone.length) sb.storage.from('contenido').remove(gone);
      await loadAll(); close();
      const target = '#/i/' + encodeURIComponent(data.slug);
      if (location.hash === target) route(); else location.hash = target;
      toast(editing ? 'Cambios guardados' : 'Novedad publicada');
    } catch (e) {
      if (uploaded.length) sb.storage.from('contenido').remove(uploaded);
      toast('No se pudo guardar: ' + (e.message || e), true);
      saveBtn.disabled = false; saveBtn.textContent = editing ? 'Guardar cambios' : 'Publicar';
    }
  }
}

/* ---------- estados ---------- */
function statusPanel(it) {
  const box = h('div', { class: 'stat-panel' });
  function draw() {
    const cur = state.statuses.get(it.id), s = (cur || {}).status || 'nuevo';
    const used = h('input', { type: 'text', maxlength: 300, placeholder: '¿Dónde se ha utilizado? (campaña, anuncio, reunión…)', value: (cur || {}).used_in || '', 'aria-label': 'Dónde se ha utilizado',
      onchange: e => save('utilizado', e.target.value) });
    box.replaceChildren(...[h('h4', {}, 'Estado de esta novedad'),
      h('div', { class: 'pills' }, Object.entries(STATUS).map(([k, v]) =>
        h('button', { class: 'pill-btn' + (s === k ? ' on' : ''), 'aria-pressed': String(s === k), onclick: () => save(k, k === 'utilizado' ? (cur || {}).used_in : null) }, v))),
      s === 'utilizado' ? used : null,
      cur && cur.updated_by_email ? h('div', { class: 'by' }, `Actualizado por ${cur.updated_by_email} · ${fmtDate(cur.updated_at)}`) : null].filter(Boolean));
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
  if (!SB_URL || !SB_KEY) return renderSetup();
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
  if (parts[1] === 'c' && parts[2]) { const k = decodeURIComponent(parts[2]); state.filters.cat = CATS[k] ? k : ''; main = viewHome(); }
  else if (parts[1] === 'resumen') { main = viewResumen(); active = 'resumen'; }
  else if (parts[1] === 'i' && parts[2]) { main = viewItem(decodeURIComponent(parts[2])); }
  else { state.filters.cat = ''; main = viewHome(); }
  show(...shell(main, active));
  if (parts[1] === 'i') window.scrollTo(0, 0);
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
  if (!SB_URL || !SB_KEY) return renderSetup();
  state.sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  window.addEventListener('hashchange', route);
  state.sb.auth.onAuthStateChange((_ev, session) => { setTimeout(() => onSession(session), 0); });
  const { data } = await state.sb.auth.getSession();
  await onSession(data.session);
})();
})();
