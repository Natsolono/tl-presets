/* Энциклопедия: предметы и умения. Адреса: #items, #item/<id>, #skills, #skill/<id>. */
const DATA = '../data/', IC = '../data/ic/';
const SLOT_GROUPS = [
  ['Weapon', 'Оружие'], ['Head', 'Шлем'], ['Chest', 'Нагрудник'], ['Hands', 'Перчатки'], ['Legs', 'Поножи'], ['Feet', 'Сапоги'], ['Cape', 'Плащ'],
  ['Necklace', 'Ожерелье'], ['Earring', 'Серьга'], ['Ring', 'Кольцо'], ['Bracelet', 'Браслет'], ['Belt', 'Пояс']
];
const GRADE_ORDER = ['Common', 'Uncommon', 'Rare', 'Rare2', 'Epic', 'Epic2', 'Legendary'];
const SK_TYPE = { Basic: 'Базовая атака', Active: 'Активное', Defensive: 'Защитное', Passive: 'Пассивное' };
const PAGE = 60;
let ITEMS = [], SKILLS = null, byItem = new Map(), bySkill = new Map();
const IF = Object.assign({ q: '', slot: '', w: '', grade: '', tier: '', src: '', sort: 'gs' }, store.get('db-if', {}));
const SF = Object.assign({ q: '', w: '', type: '' }, store.get('db-sf', {}));
let iview = [], ishown = 0, lastFocus = null;

const itemSub = it => [it.cat && W_RU[it.cat] ? W_RU[it.cat] : SLOT_RU[it.slot] || it.slot, GRADE_RU[it.g] || it.g, it.tier && !/T\d$/.test(GRADE_RU[it.g] || '') ? it.tier.toUpperCase() : null, it.set ? it.set.replace(/^Комплект /, '') : null].filter(Boolean).join(' · ');
const baseGS = it => itemCP(it, it.mx, [], false);

/* ---------- предметы ---------- */
function itemsUI() {
  const box = $('#islot'); box.innerHTML = '';
  const chip = (v, t, extra) => { const b = el('button', 'chip', t); b.type = 'button'; b.dataset.v = v; if (extra) b.append(el('small', null, extra)); b.onclick = () => { if (v.startsWith('w:')) { IF.slot = 'Weapon'; IF.w = IF.w === v.slice(2) ? '' : v.slice(2); } else { IF.slot = IF.slot === v && !IF.w ? '' : v; IF.w = ''; } applyItems(); }; return b; };
  SLOT_GROUPS.forEach(([v, t]) => box.append(chip(v, t)));
  [...WEAPONS, 'Orb'].forEach(w => box.append(chip('w:' + w, W_RU[w])));
  const g = $('#igrade'); GRADE_ORDER.forEach(k => { if (ITEMS.some(i => i.g === k)) { const o = el('option', null, GRADE_RU[k] || k); o.value = k; g.append(o); } });
  const s = $('#isrc'); Object.entries(SRC_RU).forEach(([k, t]) => { const o = el('option', null, t); o.value = k; s.append(o); });
  let qt; $('#iq').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { IF.q = e.target.value; applyItems(); }, 150); };
  $('#isort').onchange = e => { IF.sort = e.target.value; applyItems(); };
  $('#igrade').onchange = e => { IF.grade = e.target.value; applyItems(); };
  $('#itier').onchange = e => { IF.tier = e.target.value; applyItems(); };
  $('#isrc').onchange = e => { IF.src = e.target.value; applyItems(); };
  $('#ireset').onclick = () => { Object.assign(IF, { q: '', slot: '', w: '', grade: '', tier: '', src: '', sort: 'gs' }); applyItems(); };
  $('#imore').onclick = () => renderItems();
}
function applyItems() {
  store.set('db-if', IF);
  $('#iq').value = IF.q; $('#isort').value = IF.sort; $('#igrade').value = IF.grade; $('#itier').value = IF.tier; $('#isrc').value = IF.src;
  $$('#islot .chip').forEach(b => { const v = b.dataset.v; b.setAttribute('aria-pressed', v.startsWith('w:') ? IF.w === v.slice(2) : (IF.slot === v && !IF.w)); });
  const q = IF.q.trim().toLowerCase();
  iview = ITEMS.filter(it => {
    if (IF.slot && it.slot !== IF.slot && !(IF.slot === 'Cape' && it.slot === 'Cloak')) return false;
    if (IF.w && it.cat !== IF.w) return false;
    if (IF.grade && it.g !== IF.grade) return false;
    if (IF.tier && it.tier !== IF.tier) return false;
    if (IF.src && !it.src.some(s => s[0] === IF.src)) return false;
    if (q && !it._q.includes(q)) return false;
    return true;
  });
  const by = { gs: (a, b) => (b._gs || 0) - (a._gs || 0) || a.n.localeCompare(b.n, 'ru'), name: (a, b) => a.n.localeCompare(b.n, 'ru'),
    grade: (a, b) => GRADE_ORDER.indexOf(b.g) - GRADE_ORDER.indexOf(a.g) || a.n.localeCompare(b.n, 'ru'), lvl: (a, b) => (b.lvl || 0) - (a.lvl || 0) || a.n.localeCompare(b.n, 'ru') };
  iview.sort(by[IF.sort] || by.gs);
  $('#icount').textContent = iview.length ? `Найдено: ${nf(iview.length)}` : 'Ничего не найдено';
  $('#ilist').innerHTML = ''; ishown = 0; renderItems();
}
function renderItems() {
  const ul = $('#ilist');
  if (!iview.length) { ul.append(el('li', 'empty', 'Под эти фильтры предметов нет. Попробуйте убрать часть условий.')); $('#imore').hidden = true; return; }
  const f = document.createDocumentFragment();
  iview.slice(ishown, ishown + PAGE).forEach(it => {
    const li = el('li'); const a = el('a', 'row'); a.href = '#item/' + encodeURIComponent(it.id);
    a.append(icon(IC, it.ic, ''));
    const mid = el('div'); mid.append(el('div', 'nm g-' + it.g, it.n), el('div', 'sub', itemSub(it))); a.append(mid);
    const gs = el('div', 'gs'); gs.append(el('b', null, it._gs != null ? nf(it._gs) : '—'), 'GS'); a.append(gs);
    li.append(a); f.append(li);
  });
  ul.append(f); ishown = Math.min(iview.length, ishown + PAGE);
  $('#imore').hidden = ishown >= iview.length; $('#imore').textContent = `Показать ещё (${nf(iview.length - ishown)})`;
}
function itemCard(it) {
  const body = el('div', 'card-body'); let ench = it.mx, tlv = 4, res = false;
  const head = el('div', 'head'); head.append(icon(IC, it.ic, it.n, 'lg'));
  const hm = el('div'); hm.append(el('div', 'meta', itemSub(it)));
  if (it.lvl) hm.append(el('div', 'meta', 'Уровень персонажа: ' + it.lvl));
  head.append(hm); body.append(head);
  // заточка и статы
  const s1 = el('div', 'sec'); s1.append(el('h3', null, 'Характеристики'));
  const sl = el('div', 'slider'); const rng = el('input'); rng.type = 'range'; rng.min = 0; rng.max = it.mx || 0; rng.value = ench; rng.id = 'enchR';
  const lbl = el('label', 'sr-only', 'Заточка'); lbl.htmlFor = 'enchR'; const out = el('output', null, '+' + ench); out.htmlFor = 'enchR';
  sl.append(lbl, rng, out); if (it.mx) s1.append(sl);
  const stats = el('div'); s1.append(stats);
  const gsBox = el('div', 'kv'); s1.append(gsBox);
  const draw = () => {
    stats.innerHTML = ''; out.textContent = '+' + ench;
    statRows(itemStats(it, ench)).forEach(([k, v]) => { const r = el('div', 'kv'); r.append(el('span', null, k), el('b', null, v)); stats.append(r); });
    const g = itemCP(it, ench, it.tr.length ? [tlv, tlv, tlv] : [], res);
    gsBox.innerHTML = ''; gsBox.append(el('span', null, 'GS (заточка +' + ench + (it.tr.length ? ', 3 трейта ур. ' + tlv : '') + (res ? ', резонанс' : '') + ')'), el('b', null, g != null ? nf(g) : 'нет данных'));
  };
  rng.oninput = () => { ench = +rng.value; draw(); };
  body.append(s1);
  // трейты
  if (it.tr.length) {
    const s2 = el('div', 'sec'); s2.append(el('h3', null, 'Трейты — можно выбрать до 3'));
    const ts = el('div', 'slider'); const tr = el('input'); tr.type = 'range'; tr.min = 1; tr.max = 4; tr.value = tlv; tr.id = 'trR';
    const tl = el('label', 'sr-only', 'Уровень трейтов'); tl.htmlFor = 'trR'; const to = el('output', null, 'ур. ' + tlv);
    ts.append(tl, tr, to); s2.append(ts);
    const list = el('div'); s2.append(list);
    const drawT = () => { list.innerHTML = ''; to.textContent = 'ур. ' + tlv; it.tr.forEach(t => { const d = META.traits[t]; const r = el('div', 'kv'); r.append(el('span', null, lab(d ? d.s : t)), el('b', null, d ? fmtVal(d.s, traitValue(t, tlv)) : '')); list.append(r); }); };
    tr.oninput = () => { tlv = +tr.value; drawT(); draw(); }; drawT();
    body.append(s2);
  }
  if (it.res.length) {
    const s3 = el('div', 'sec'); s3.append(el('h3', null, 'Резонанс — один из вариантов'));
    const lab2 = el('label', 'kv'); const cb = el('input'); cb.type = 'checkbox'; cb.onchange = () => { res = cb.checked; draw(); };
    lab2.append(el('span', null, 'Учитывать открытый резонанс в GS'), cb); s3.append(lab2);
    const tags = el('div', 'tags'); it.res.forEach(r => Object.entries(r).forEach(([k, v]) => tags.append(el('span', 'tag', lab(k) + ' ' + fmtVal(k, v))))); s3.append(tags);
    body.append(s3);
  }
  if (it.set) {
    const s4 = el('div', 'sec'); s4.append(el('h3', null, it.set));
    it.sb.forEach(b => { const r = el('div', 'kv'); r.append(el('span', null, b.p + ' предм.'), el('b', null, b.t || Object.entries(b.s).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', '))); s4.append(r); });
    body.append(s4);
  }
  if (it.perk) { const s5 = el('div', 'sec'); s5.append(el('h3', null, 'Особое умение: ' + (it.perk.n || ''))); s5.append(el('p', 'note', it.perk.d || '')); body.append(s5); }
  if (it.rs) { const s6 = el('div', 'sec'); s6.append(el('h3', null, 'Руны')); s6.append(el('p', 'note', 'Гнёзд для рун: ' + it.rs)); body.append(s6); }
  if (it.src.length) {
    const s7 = el('div', 'sec'); s7.append(el('h3', null, 'Где добыть')); const ul = el('ul', 'src');
    it.src.forEach(([t, n, boss, loc]) => ul.append(el('li', null, [SRC_RU[t] || t, n, boss && boss !== n ? boss : '', loc].filter(Boolean).join(' · '))));
    s7.append(ul); body.append(s7);
  }
  if (it.d) body.append(el('p', 'note', it.d));
  draw();
  return body;
}

/* ---------- умения ---------- */
function skillsUI() {
  const box = $('#sweap'); box.innerHTML = '';
  WEAPONS.forEach(w => { const b = el('button', 'chip', W_RU[w]); b.type = 'button'; b.dataset.v = w; b.onclick = () => { SF.w = SF.w === w ? '' : w; applySkills(); }; box.append(b); });
  const t = $('#stype'); t.innerHTML = ''; [['', 'Все'], ['Basic', 'Базовые атаки'], ['Active', 'Активные'], ['Defensive', 'Защитные'], ['Passive', 'Пассивные']].forEach(([v, s]) => { const o = el('option', null, s); o.value = v; t.append(o); });
  let qt; $('#sq').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { SF.q = e.target.value; applySkills(); }, 150); };
  $('#stype').onchange = e => { SF.type = e.target.value; applySkills(); };
  $('#sreset').onclick = () => { Object.assign(SF, { q: '', w: '', type: '' }); applySkills(); };
}
function applySkills() {
  store.set('db-sf', SF);
  $('#sq').value = SF.q; $('#stype').value = SF.type;
  $$('#sweap .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === SF.w));
  const q = SF.q.trim().toLowerCase();
  const list = SKILLS.filter(s => (!SF.w || s.w === SF.w) && (!SF.type || s.cat === SF.type) && (!q || s._q.includes(q)))
    .sort((a, b) => WEAPONS.indexOf(a.w) - WEAPONS.indexOf(b.w) || Object.keys(SK_TYPE).indexOf(a.cat) - Object.keys(SK_TYPE).indexOf(b.cat) || a.n.localeCompare(b.n, 'ru'));
  $('#scount').textContent = list.length ? `Найдено: ${nf(list.length)}` : 'Ничего не найдено';
  const ul = $('#slist'); ul.innerHTML = '';
  if (!list.length) { ul.append(el('li', 'empty', 'Таких умений нет. Попробуйте другой запрос.')); return; }
  const f = document.createDocumentFragment();
  list.forEach(s => {
    const li = el('li'); const a = el('a', 'row'); a.href = '#skill/' + encodeURIComponent(s.id);
    a.append(icon(IC, s.ic, ''));
    const mid = el('div'); mid.append(el('div', 'nm', s.n), el('div', 'sub', [W_RU[s.w] || s.w, SK_TYPE[s.cat] || s.cat].join(' · '))); a.append(mid);
    const r = el('div', 'gs'); const last = s.lv[s.lv.length - 1] || s;
    r.append(el('b', null, last.cd ? last.cd + ' с' : '—'), 'перезарядка'); a.append(r);
    li.append(a); f.append(li);
  });
  ul.append(f);
}
function skillCard(s) {
  const body = el('div', 'card-body'); const maxL = s.lv.length || 1; let lv = maxL;
  const head = el('div', 'head'); head.append(icon(IC, s.ic, s.n, 'lg'));
  const hm = el('div'); hm.append(el('div', 'meta', [W_RU[s.w] || s.w, SK_TYPE[s.cat] || s.cat, s.dmg ? 'урон: ' + ({ Melee: 'ближний бой', Range: 'дальний бой', Magic: 'магия' }[s.dmg] || s.dmg) : ''].filter(Boolean).join(' · ')));
  head.append(hm); body.append(head);
  const s1 = el('div', 'sec'); s1.append(el('h3', null, 'Уровень умения'));
  const sl = el('div', 'slider'); const rng = el('input'); rng.type = 'range'; rng.min = 1; rng.max = maxL; rng.value = lv; rng.id = 'skR';
  const l1 = el('label', 'sr-only', 'Уровень умения'); l1.htmlFor = 'skR'; const out = el('output', null, lv);
  sl.append(l1, rng, out); if (maxL > 1) s1.append(sl);
  const params = el('div'); const desc = el('p', 'note'); s1.append(params, desc); body.append(s1);
  const s2 = el('div', 'sec'); const specs = el('div', 'specs');
  if (s.sp.length) { s2.append(el('h3', null, 'Специализации')); s2.append(specs); body.append(s2); }
  if (s.st) {
    const s3 = el('div', 'sec'); s3.append(el('h3', null, 'Бонусы к характеристикам')); const box = el('div'); s3.append(box); body.append(s3);
    s._stBox = box;
  }
  const draw = () => {
    const L = s.lv[lv - 1] || s; out.textContent = lv;
    params.innerHTML = '';
    const kv = (k, v) => { if (v == null || v === '' || v === 0) return; const r = el('div', 'kv'); r.append(el('span', null, k), el('b', null, v)); params.append(r); };
    kv('Перезарядка', L.cd ? L.cd + ' с' : null); kv('Мана', L.mp || null); kv('Время применения', L.ct ? L.ct + ' с' : null); kv('Дальность', s.rng ? s.rng + ' м' : null);
    desc.textContent = L.d || s.d || 'Описания нет.';
    specs.innerHTML = '';
    s.sp.forEach(p => {
      const c = el('div', 'spec'); c.append(icon(IC, p.ic, '', 'sm'));
      const t = el('div'); t.append(el('b', null, p.n)); const meta = [p.cost != null ? 'стоимость ' + p.cost : '', p.ul ? 'с ур. ' + p.ul : ''].filter(Boolean).join(' · '); if (meta) t.append(el('br'), el('small', null, meta));
      c.append(t, el('p', null, (L.sp && L.sp[p.id]) || p.d || '')); specs.append(c);
    });
    if (s._stBox) { s._stBox.innerHTML = ''; s.st.forEach(x => { const v = (x.levels || [])[lv - 1] ?? x.value; const r = el('div', 'kv'); r.append(el('span', null, lab(x.key)), el('b', null, fmtVal(x.key, v))); s._stBox.append(r); }); }
  };
  rng.oninput = () => { lv = +rng.value; draw(); };
  draw(); return body;
}

/* ---------- маршруты и карточка ---------- */
async function ensureSkills() {
  if (SKILLS) return;
  $('#slist').innerHTML = ''; $('#slist').append(el('li', 'empty', 'Загружаю умения…'));
  SKILLS = await (await fetch(DATA + 'skills.json')).json();
  SKILLS.forEach(s => { s._q = (s.n + ' ' + s.d + ' ' + s.sp.map(p => p.n).join(' ')).toLowerCase(); bySkill.set(s.id, s); });
  skillsUI();
}
function openCard(title, gradeCls, body) {
  const d = $('#card'); $('#cardTitle').textContent = title; $('#cardTitle').className = gradeCls || '';
  const old = $('#cardBody'); body.id = 'cardBody'; old.replaceWith(body);
  if (!d.open) { lastFocus = document.activeElement; d.showModal(); }
  body.scrollTop = 0;
}
function closeCard() { const d = $('#card'); if (d.open) d.close(); }
async function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const [kind, id] = h.split('/');
  const skills = kind === 'skills' || kind === 'skill';
  $('#itemsView').hidden = skills; $('#skillsView').hidden = !skills;
  $('#tabItems').setAttribute('aria-selected', !skills); $('#tabSkills').setAttribute('aria-selected', skills);
  if (skills) { await ensureSkills(); applySkills(); }
  if (kind === 'item' && id) { const it = byItem.get(id); if (it) { document.title = it.n + ' · Энциклопедия'; return openCard(it.n, 'g-' + it.g, itemCard(it)); } toast('Предмет не найден'); }
  else if (kind === 'skill' && id) { const s = bySkill.get(id); if (s) { document.title = s.n + ' · Энциклопедия'; return openCard(s.n, '', skillCard(s)); } toast('Умение не найдено'); }
  document.title = 'Энциклопедия предметов и умений';
  closeCard();
}
function cardUI() {
  const d = $('#card');
  const back = () => { history.pushState(null, '', location.hash.startsWith('#skill') ? '#skills' : '#items'); route(); };
  $('#cardClose').onclick = back; $('#cardOk').onclick = back;
  d.addEventListener('cancel', e => { e.preventDefault(); back(); });
  d.addEventListener('click', e => { if (e.target === d) back(); });
  d.addEventListener('close', () => { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
  $('#cardShare').onclick = () => navigator.clipboard.writeText(location.href).then(() => toast('Ссылка скопирована'), () => prompt('Ссылка:', location.href));
}

async function init() {
  await loadMeta(DATA);
  ITEMS = await (await fetch(DATA + 'items.json')).json();
  ITEMS.forEach(it => {
    it._gs = baseGS(it); byItem.set(it.id, it);
    it._q = [it.n, it.set || '', ...Object.keys(it.x || {}).map(lab), ...Object.keys(it.b || {}).map(lab), ...it.tr.map(t => lab((META.traits[t] || {}).s))].join(' ').toLowerCase();
  });
  $('#built').textContent = 'Обновлено ' + new Date(META.built).toLocaleDateString('ru-RU') + '.';
  itemsUI(); applyItems(); cardUI();
  window.addEventListener('hashchange', route); route();
}
init().catch(e => { console.error(e); $('#ilist').append(el('li', 'empty', 'Не удалось загрузить базу. Обновите страницу.')); });
