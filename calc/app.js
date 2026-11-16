'use strict';
/* T2 build calculator. Items/traits/labels: build.tlwg.ru. Attribute tables: Fury Lab (with author's permission). */
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1800); };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Хранилище браузера недоступно'); } }
};

const SLOTS = [
  ['weapon1', 'Оружие 1', 'Weapon'], ['weapon2', 'Оружие 2', 'Weapon'], ['head', 'Шлем', 'Head'], ['chest', 'Нагрудник', 'Chest'],
  ['hands', 'Перчатки', 'Hands'], ['legs', 'Поножи', 'Legs'], ['feet', 'Сапоги', 'Feet'], ['cloak', 'Плащ', 'Cape'],
  ['necklace', 'Ожерелье', 'Necklace'], ['earring', 'Серьга', 'Earring'], ['ring1', 'Кольцо 1', 'Ring'], ['ring2', 'Кольцо 2', 'Ring'],
  ['bracelet', 'Браслет', 'Bracelet'], ['belt', 'Пояс', 'Belt']
];
const ATTRS = [['Str', 'STR', 'Сила', 'str'], ['Dex', 'DEX', 'Ловкость', 'dex'], ['Int', 'INT', 'Мудрость', 'Int'], ['Per', 'PER', 'Восприятие', 'per'], ['Con', 'CON', 'Стойкость', 'con']];
const COST = [[20, 1], [30, 2], [40, 4], [50, 8], [60, 16], [70, 32], [1e4, 64]];
const POINTS = 54;
const TRI = ['melee', 'range', 'magic'];
const ALL_EXPAND = ['evasion', 'critical_defense', 'critical_attack', 'accuracy', 'double_attack', 'double_defense', 'armor'];
const WEAPON_ONLY_MAIN = new Set(['attack_power_main_hand', 'bonus_attack_power_main_hand', 'attack_speed_main_hand', 'attack_range_main_hand', 'attack_power_off_hand', 'bonus_attack_power_off_hand', 'off_hand_attack_chance']);
const BONUS_SOURCES = ['Руна', 'Артефакт', 'Мастерство', 'Серьга', 'Бафф', 'Прочее'];

let D = null, byId = new Map();
let B = blank();

function blank() {
  return { name: '', combo: 'Dagger', equip: {}, earSet: null, attr: { Str: 10, Dex: 10, Int: 10, Per: 10, Con: 10 }, bonus: [] };
}

/* ---------- formatting ---------- */
const lab = k => (D.labels[k] || k).trim();
function fmtVal(k, raw) {
  const f = D.fmt[k] || { mul: 1, suffix: '' };
  let v = raw * f.mul;
  const r = Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : Math.round(v * 10) / 10;
  const s = r.toLocaleString('ru-RU').replace(/ /g, ' ');
  return (f.sign && r > 0 ? '+' : '') + s + (f.suffix || '');
}
const toRaw = (k, disp) => { const f = D.fmt[k] || { mul: 1 }; return Math.round(disp / (f.mul || 1)); };
const toDisp = (k, raw) => { const f = D.fmt[k] || { mul: 1 }; return Math.round(raw * (f.mul || 1) * 100) / 100; };

/* ---------- engine ---------- */
function traitValue(id, lvl) {
  const t = D.traits[id]; if (!t) return 0;
  const c = t.c || []; const l = Math.max(1, Math.min(lvl || 1, c.length || 1));
  return c.length <= 4 ? (c[l - 1] || 0) : (t.b || 0) + (c[l - 1] || 0);
}
function add(o, k, v) { if (!v || typeof v !== 'number') return; o[k] = (o[k] || 0) + v; }
function attrCost(v) { let n = Math.max(0, v - 10), used = 0, prev = 0, c = 0; for (const [lim, cost] of COST) { const t = Math.min(n, lim - prev); c += t * cost; n -= t; prev = lim; if (!n) break; } return c; }
function nextCost(v) { const n = Math.max(0, v - 10) + 1; return (COST.find(([lim]) => n <= lim) || COST[COST.length - 1])[1]; }

function compute(b) {
  const s = {}; const notes = [];
  const main = b.equip.weapon1 && byId.get(b.equip.weapon1.id);
  for (const [k, v] of Object.entries(D.attr.base)) add(s, k, v);
  add(s, 'hp_max', D.attr.lvl.hp_max); add(s, 'cost_max', D.attr.lvl.cost_max);
  const sets = new Map(); const setItem = new Map();
  for (const [slot] of SLOTS) {
    const e = b.equip[slot]; if (!e) continue; const it = byId.get(e.id); if (!it) continue;
    const lv = String(e.ench ?? it.mx);
    const isOff = slot === 'weapon2';
    const put = (k, v) => { if (isOff && WEAPON_ONLY_MAIN.has(k)) return; add(s, k, v); };
    for (const [k, v] of Object.entries(it.b)) put(k, v + ((it.be[lv] || {})[k] || 0));
    for (const [k, v] of Object.entries(it.x)) put(k, v + ((it.xe[lv] || {})[k] || 0));
    for (const [k, v] of Object.entries(it.xe[lv] || {})) if (!(k in it.x)) put(k, v);
    for (const [k, v] of Object.entries(it.be[lv] || {})) if (!(k in it.b)) put(k, v);
    for (const t of (e.traits || [])) { const d = D.traits[t.id]; if (d && it.tr.includes(t.id)) add(s, d.s, traitValue(t.id, t.lvl)); }
    if (e.res != null && it.res[e.res]) for (const [k, v] of Object.entries(it.res[e.res])) add(s, k, v);
    if (it.set) { sets.set(it.set, (sets.get(it.set) || 0) + 1); setItem.set(it.set, it); }
  }
  if (b.earSet) { const it = D.items.find(x => x.set === b.earSet); if (it) { sets.set(b.earSet, (sets.get(b.earSet) || 0) + 1); setItem.set(b.earSet, it); } }
  for (const r of b.bonus) if (r.stat && r.val) add(s, r.stat, toRaw(r.stat, +r.val));
  // set stat bonuses (attribute-granting ones first)
  const activeSets = [];
  for (const [name, n] of sets) {
    const it = setItem.get(name);
    for (const bn of it.sb) if (bn.p <= n) { for (const [k, v] of Object.entries(bn.s)) add(s, k === 'base_damage' ? 'bonus_attack_power_main_hand' : k, v); activeSets.push({ name, p: bn.p, n, t: bn.t, s: bn.s }); }
  }
  // attributes
  const tot = {};
  for (const [key, , , st] of ATTRS) tot[key] = (b.attr[key] || 10) + (s[st] || 0);
  const wkey = main ? main.cat.toLowerCase() : 'none';
  for (const [key, up] of ATTRS) {
    const conv = D.attr.conv[up]; const v = Math.min(tot[key], conv.length); if (v <= 0) continue;
    const row = conv[v - 1].stats;
    for (const [k, val] of Object.entries(row)) {
      if (val && typeof val === 'object') { const tgt = k === 'attack_powers' ? 'attack_power_main_hand' : 'bonus_attack_power_main_hand'; add(s, tgt, val[wkey] ?? val.none ?? 0); }
      else add(s, k, val);
    }
  }
  // T2 milestones (count 80) are not part of the per-point table
  for (const m of D.attr.ms) {
    if (m.tier !== 't2') continue; const a = ATTRS.find(x => x[1] === m.attribute); if (!a || tot[a[0]] < m.count) continue;
    for (const bn of m.bonuses) add(s, bn.stat, bn.value);
  }
  // conditional set passives (parsed from in-game text)
  for (const a of activeSets) {
    let m;
    if ((m = a.t.match(/устойчивости \(ближний бой, дальний бой, магия\) повышаются на (\d+) ед\. за каждые 10 ед\. восприятия/))) {
      const v = Math.round(+m[1] * 10 * tot.Per / 10); TRI.forEach(t => add(s, t + '_critical_defense', v));
    }
    if ((m = a.t.match(/Базовый урон основного оружия повышается на (\d+) ед\., если показатель стойкости персонажа составляет (\d+)/))) {
      if (tot.Con >= +m[2]) add(s, 'bonus_attack_power_main_hand', +m[1]); else notes.push(`${a.name}: нужна Стойкость ${m[2]}+`);
    }
    if ((m = a.t.match(/ловкости персонажа составляет (\d+) ед\. и выше, скорость восстановления умений повышается на (\d+)%/))) {
      if (tot.Dex >= +m[1]) add(s, 'skill_cooldown_modifier', +m[2] * 100);
    }
    if ((m = a.t.match(/За каждые 10 ед\. стойкости персонажа скорость его атаки повышается на (\d+)%/))) add(s, 'attack_speed_modifier', +m[1] * 100 * Math.floor(tot.Con / 10));
  }
  // expand all_* into melee/range/magic
  for (const x of ALL_EXPAND) {
    const k = 'all_' + x; if (s[k]) { TRI.forEach(t => add(s, `${t}_${x}`, s[k])); delete s[k]; }
  }
  if (s.evasion) { TRI.forEach(t => add(s, t + '_evasion', s.evasion)); delete s.evasion; }
  const pts = ATTRS.reduce((a, [k]) => a + attrCost(b.attr[k] || 10), 0);
  return { s, tot, sets: activeSets, notes, pts, main };
}

/* ---------- rendering ---------- */
function itemLine(it) {
  const st = { ...it.x }; const keys = Object.keys(st).slice(0, 4);
  return keys.map(k => `${lab(k)} ${fmtVal(k, st[k])}`).join(' · ');
}
function renderSlots() {
  const box = $('#slots'); box.innerHTML = '';
  for (const [slot, name, type] of SLOTS) {
    const e = B.equip[slot]; const it = e && byId.get(e.id);
    const btn = el('button', 'slot' + (it ? '' : ' empty')); btn.type = 'button';
    btn.append(el('span', 'sl', name));
    if (slot === 'earring') {
      btn.append(el('span', 'nm', B.earSet ? 'Серьга · ' + B.earSet.replace(/^Комплект /, '') : 'Серьга (статы вручную)'));
      btn.append(el('span', 'meta', 'Статы — в «Доп. бонусах» · нажмите, чтобы указать комплект'));
      btn.onclick = openEarring;
    }
    else if (it) {
      const nm = el('span', 'nm g-' + it.g, it.n); btn.append(nm);
      const tr = (e.traits || []).length; const rs = e.res != null ? ' · резонанс' : '';
      btn.append(el('span', 'meta', `+${e.ench ?? it.mx} · трейты ${tr}/3${rs}${it.set ? ' · ' + it.set.replace(/^Комплект /, '') : ''}`));
      btn.onclick = () => openEditor(slot);
    } else { btn.append(el('span', 'nm', 'Пусто — выбрать')); btn.onclick = () => openPicker(slot); }
    box.append(btn);
  }
}
function renderAttrs(R) {
  const box = $('#attrs'); box.innerHTML = '';
  for (const [key, , ru] of ATTRS) {
    const card = el('div', 'attr');
    const t = el('div', 't'); t.append(el('span', null, ru), el('span', null, 'ещё ' + nextCost(B.attr[key]) + ' оч.'));
    const v = el('div', 'v'); v.textContent = R.tot[key]; const sm = el('small', null, ` (${B.attr[key]} + ${R.tot[key] - B.attr[key]})`); v.append(sm);
    const ctl = el('div', 'ctl');
    const minus = el('button', 'ghost', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Убавить: ' + ru); minus.onclick = () => { if (B.attr[key] > 10) { B.attr[key]--; update(); } };
    const plus = el('button', 'ghost', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Прибавить: ' + ru); plus.onclick = () => { const c = compute(B); if (c.pts + nextCost(B.attr[key]) <= POINTS) { B.attr[key]++; update(); } else toast('Не хватает очков'); };
    ctl.append(minus, plus); card.append(t, v, ctl); box.append(card);
  }
  const left = POINTS - R.pts; const p = $('#pointsLeft'); p.textContent = `осталось ${left} / ${POINTS}`; p.classList.toggle('bad', left < 0);
}
let STAT_KEYS = [];
function renderBonuses() {
  const box = $('#bonuses'); box.innerHTML = '';
  B.bonus.forEach((r, i) => {
    const row = el('div', 'bonus');
    const src = el('select'); src.setAttribute('aria-label', 'Источник бонуса'); BONUS_SOURCES.forEach(x => { const o = el('option', null, x); o.value = x; src.append(o); }); src.value = r.src || 'Руна';
    src.onchange = () => { r.src = src.value; save(); };
    const st = el('select', 'stat'); st.setAttribute('aria-label', 'Характеристика'); const o0 = el('option', null, 'Стат…'); o0.value = ''; st.append(o0);
    STAT_KEYS.forEach(k => { const o = el('option', null, lab(k)); o.value = k; st.append(o); }); st.value = r.stat || '';
    st.onchange = () => { r.stat = st.value; update(); };
    const v = el('input'); v.type = 'number'; v.step = 'any'; v.value = r.val ?? ''; v.placeholder = 'значение'; v.setAttribute('aria-label', 'Значение бонуса');
    v.oninput = () => { r.val = v.value; update(false); };
    const del = el('button', 'ghost danger', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Удалить бонус'); del.onclick = () => { B.bonus.splice(i, 1); update(); };
    row.append(src, st, v, del); box.append(row);
  });
}
function kv(k, v) { const d = el('div', 'kv'); d.append(el('span', null, k), el('b', null, v)); return d; }
function tri(title, base, s) {
  const d = el('div', 'tri'); d.append(el('span', null, title));
  TRI.forEach(t => d.append(el('b', null, fmtVal(`${t}_${base}`, s[`${t}_${base}`] || 0)))); return d;
}
function renderSummary(R) {
  const s = R.s; const box = $('#summary'); box.innerHTML = '';
  const g1 = el('div', 'grp'); g1.append(el('h3', null, 'Защита'));
  const h = el('div', 'tri h'); h.append(el('span'), el('span', null, 'ближ.'), el('span', null, 'дальн.'), el('span', null, 'магия')); g1.append(h);
  g1.append(tri('Уклонение', 'evasion', s), tri('Устойчивость', 'critical_defense', s), tri('Защита', 'armor', s), tri('Уст. к мощн. атакам', 'double_defense', s));
  g1.append(kv('Макс. здоровье', fmtVal('hp_max', s.hp_max || 0)), kv('Снижение урона', fmtVal('damage_reduction', s.damage_reduction || 0)),
    kv('Сопротивление умениям', fmtVal('skill_power_resistance', s.skill_power_resistance || 0)), kv('Сопротивление крит. урону', fmtVal('critical_damage_taken_modifier', s.critical_damage_taken_modifier || 0)));
  const g2 = el('div', 'grp'); g2.append(el('h3', null, 'Атака'));
  const h2 = el('div', 'tri h'); h2.append(el('span'), el('span', null, 'ближ.'), el('span', null, 'дальн.'), el('span', null, 'магия')); g2.append(h2);
  g2.append(tri('Шанс крит. удара', 'critical_attack', s), tri('Меткость', 'accuracy', s), tri('Шанс мощн. атаки', 'double_attack', s));
  const mn = (s.bonus_attack_power_main_hand || 0) + 1, mx = (s.attack_power_main_hand || 0) + (s.bonus_attack_power_main_hand || 0);
  g2.append(kv('Базовый урон (осн. оружие)', R.main ? `${mn}~${mx}` : '—'),
    kv('Скорость атаки', fmtVal('attack_speed_modifier', s.attack_speed_modifier || 0)),
    kv('Скорость восст. умений', fmtVal('skill_cooldown_modifier', s.skill_cooldown_modifier || 0)),
    kv('Повышение урона умений', fmtVal('skill_power_amplification', s.skill_power_amplification || 0)),
    kv('Крит. урон', fmtVal('critical_damage_dealt_modifier', s.critical_damage_dealt_modifier || 0)),
    kv('Дополнит. урон', fmtVal('damage_reduction_penetration', s.damage_reduction_penetration || 0)),
    kv('Макс. мана', fmtVal('cost_max', s.cost_max || 0)));
  box.append(g1, g2);
  if (R.notes.length) { const n = el('p', 'hint'); n.textContent = R.notes.join('; '); box.append(n); }
  const all = $('#allStats'); all.innerHTML = '';
  Object.keys(s).filter(k => s[k] && D.labels[k]).sort((a, b) => lab(a).localeCompare(lab(b), 'ru')).forEach(k => all.append(kv(lab(k), fmtVal(k, s[k]))));
  const si = $('#setInfo'); si.innerHTML = '';
  if (!R.sets.length) si.append(el('p', 'hint', 'Нет собранных комплектов.'));
  R.sets.forEach(a => { const p = el('div', 'kv'); p.append(el('span', null, `${a.name.replace(/^Комплект /, '')} (${a.p})`), el('b', null, a.t ? a.t.slice(0, 120) : Object.entries(a.s).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', '))); si.append(p); });
  $('#gs').textContent = Object.keys(B.equip).length + ' / 13';
}

/* ---------- picker / editor ---------- */
let pickSlot = null;
function slotType(slot) { return SLOTS.find(s => s[0] === slot)[2]; }
function candidates(slot) {
  const type = slotType(slot);
  return D.items.filter(it => {
    if (it.slot !== type) return false;
    if (slot === 'weapon1') return it.cat === 'Staff';
    if (slot === 'weapon2') return it.cat === B.combo;
    if (slot === 'ring1' || slot === 'ring2') { const other = B.equip[slot === 'ring1' ? 'ring2' : 'ring1']; if (other && baseName(byId.get(other.id)?.n) === baseName(it.n)) return false; }
    return true;
  });
}
const baseName = n => (n || '').toLowerCase().split(/\s+/).filter(w => !/^(укреплённ|прочн)/.test(w)).join(' ');
function openPicker(slot) {
  pickSlot = slot; $('#pickTitle').textContent = 'Выбор: ' + SLOTS.find(s => s[0] === slot)[1];
  $('#pickSearch').value = ''; renderPick(); $('#picker').showModal(); $('#pickSearch').focus();
}
function renderPick() {
  const q = $('#pickSearch').value.trim().toLowerCase(); const box = $('#pickList'); box.innerHTML = '';
  const list = candidates(pickSlot).filter(it => !q || it.n.toLowerCase().includes(q) || [...Object.keys(it.x), ...it.tr.map(t => D.traits[t]?.s || '')].some(k => lab(k).toLowerCase().includes(q)));
  list.sort((a, b) => a.n.localeCompare(b.n, 'ru'));
  if (!list.length) box.append(el('p', 'hint', 'Ничего не найдено.'));
  list.forEach(it => {
    const b = el('button', 'pick'); b.type = 'button';
    b.append(el('div', 'nm g-' + it.g, it.n));
    b.append(el('div', 'st', `${D.grades[it.g] || it.g}${it.tier ? ' · ' + it.tier.toUpperCase() : ''}${it.set ? ' · ' + it.set.replace(/^Комплект /, '') : ''}`));
    b.append(el('div', 'st', itemLine(it)));
    b.onclick = () => {
      B.equip[pickSlot] = { id: it.id, ench: it.mx, traits: [], res: null };
      $('#picker').close(); update(); openEditor(pickSlot);
    };
    box.append(b);
  });
}
let edSlot = null;
function openEarring() {
  edSlot = 'earring'; $('#edTitle').textContent = 'Серьга'; $('#edTitle').className = '';
  const body = $('#edBody'); body.innerHTML = '';
  body.append(el('p', 'hint', 'Серёг нет в базе предметов build.tlwg.ru. Впишите статы серьги в «Доп. бонусах» (источник «Серьга»), а здесь укажите, к какому комплекту она относится — тогда она засчитается в бонус сета.'));
  const sel = el('select'); sel.setAttribute('aria-label', 'Комплект серьги'); const o0 = el('option', null, 'Без комплекта'); o0.value = ''; sel.append(o0);
  D.jsets.forEach(n => { const o = el('option', null, n.replace(/^Комплект /, '')); o.value = n; sel.append(o); });
  sel.value = B.earSet || ''; sel.onchange = () => { B.earSet = sel.value || null; update(false); };
  body.append(sel);
  $('#edRemove').hidden = true; $('#edChange').hidden = true;
  $('#editor').showModal();
}
function openEditor(slot) {
  $('#edRemove').hidden = false; $('#edChange').hidden = false;
  edSlot = slot; const e = B.equip[slot]; const it = byId.get(e.id);
  $('#edTitle').textContent = it.n; $('#edTitle').className = 'g-' + it.g;
  const body = $('#edBody'); body.innerHTML = '';
  const sec1 = el('div', 'ed-sec'); sec1.append(el('h4', null, 'Заточка'));
  const r1 = el('div', 'ed-row'); const rng = el('input'); rng.type = 'range'; rng.setAttribute('aria-label', 'Заточка'); rng.min = 0; rng.max = it.mx; rng.value = e.ench ?? it.mx;
  const out = el('b', null, '+' + rng.value); rng.oninput = () => { e.ench = +rng.value; out.textContent = '+' + rng.value; update(false); };
  r1.append(rng, out); sec1.append(r1);
  const base = el('div', 'ed-stats'); const lv = String(e.ench ?? it.mx);
  base.textContent = [...Object.entries(it.b), ...Object.entries(it.x)].filter(([k]) => D.labels[k]).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v + ((it.be[lv] || {})[k] || 0) + ((it.xe[lv] || {})[k] || 0))).join(' · ');
  sec1.append(base); body.append(sec1);
  if (it.tr.length) {
    const sec = el('div', 'ed-sec'); sec.append(el('h4', null, 'Трейты (до 3)'));
    it.tr.forEach(t => {
      const d = D.traits[t]; const cur = (e.traits || []).find(x => x.id === t);
      const row = el('div', 'ed-row'); const lb = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!cur;
      lb.append(cb, document.createTextNode(' ' + lab(d.s)));
      const lvl = el('select'); lvl.setAttribute('aria-label', 'Уровень трейта'); const n = Math.min(4, (d.c || []).length || 1);
      for (let i = 1; i <= n; i++) { const o = el('option', null, `ур. ${i} · ${fmtVal(d.s, traitValue(t, i))}`); o.value = i; lvl.append(o); }
      lvl.value = cur ? cur.lvl : n;
      cb.onchange = () => {
        e.traits = e.traits || [];
        if (cb.checked) { if (e.traits.length >= 3) { cb.checked = false; return toast('Максимум 3 трейта'); } e.traits.push({ id: t, lvl: +lvl.value }); }
        else e.traits = e.traits.filter(x => x.id !== t);
        update(false);
      };
      lvl.onchange = () => { const x = (e.traits || []).find(y => y.id === t); if (x) { x.lvl = +lvl.value; update(false); } };
      row.append(lb, lvl); sec.append(row);
    });
    body.append(sec);
  }
  if (it.res.length) {
    const sec = el('div', 'ed-sec'); sec.append(el('h4', null, 'Резонанс'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Резонанс'); const o0 = el('option', null, 'Не открыт'); o0.value = ''; sel.append(o0);
    it.res.forEach((r, i) => { const o = el('option', null, Object.entries(r).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', ')); o.value = i; sel.append(o); });
    sel.value = e.res ?? ''; sel.onchange = () => { e.res = sel.value === '' ? null : +sel.value; update(false); };
    sec.append(sel); body.append(sec);
  }
  if (it.sb.length) {
    const sec = el('div', 'ed-sec'); sec.append(el('h4', null, 'Комплект: ' + it.set.replace(/^Комплект /, '')));
    it.sb.forEach(bn => sec.append(el('div', 'ed-stats', `${bn.p} шт.: ` + (bn.t || Object.entries(bn.s).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', ')))));
    body.append(sec);
  }
  if (it.rs) body.append(el('p', 'hint', `Гнёзд для рун: ${it.rs}. Бонусы рун добавьте в «Доп. бонусах».`));
  $('#editor').showModal();
}
$('#editor').addEventListener('close', () => {
  const v = $('#editor').returnValue;
  if (edSlot === 'earring') return update();
  if (v === 'remove') { delete B.equip[edSlot]; update(); }
  else if (v === 'change') { openPicker(edSlot); }
  else update();
});

/* ---------- state ---------- */
function save() { store.set('t2calc-current', B); }
function update(full = true) {
  const R = compute(B);
  if (full) { renderSlots(); renderBonuses(); }
  renderAttrs(R); renderSummary(R); save();
  if (!full) renderSlots();
}
function enc(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(s)))); }
function load(o) {
  B = Object.assign(blank(), JSON.parse(JSON.stringify(o)));
  for (const k of Object.keys(B.equip)) if (!byId.has(B.equip[k].id)) delete B.equip[k];
  $('#comboSel').value = B.combo; $('#buildName').value = B.name || ''; update();
}
function renderSaved() {
  const box = $('#saved'); box.innerHTML = ''; const list = store.get('t2calc-saved', []);
  if (!list.length) box.append(el('p', 'hint', 'Пока пусто. «Сохранить» запомнит текущую сборку в этом браузере.'));
  list.forEach((x, i) => {
    const it = el('div', 'it'); it.append(el('span', null, x.name || 'Без названия'));
    const d = el('div'); const ld = el('button', 'ghost', 'Открыть'); ld.type = 'button'; ld.onclick = () => { load(x); toast('Загружено'); };
    const del = el('button', 'ghost danger', '×'); del.type = 'button'; del.onclick = () => { list.splice(i, 1); store.set('t2calc-saved', list); renderSaved(); };
    d.append(ld, del); it.append(d); box.append(it);
  });
}

async function init() {
  D = await (await fetch('data.json')).json();
  D.items.forEach(it => byId.set(it.id, it));
  STAT_KEYS = Object.keys(D.labels)
    .filter(k => !/^(adjust_|gathering_|dash_|glide_|swim_|earn_|spend_|additional_|pv_p_|aggro_|aura_|polymorph_)/.test(k))
    .filter(k => !/_immune$/.test(k) && !/^(bind|blind|petrification|silence|sleep|stun|weaken)_(critical|double)_/.test(k))
    .sort((a, b) => lab(a).localeCompare(lab(b), 'ru'));
  const presets = await fetch('presets.json').then(r => r.ok ? r.json() : []).catch(() => []);
  presets.forEach((p, i) => { const o = el('option', null, p.name); o.value = i; $('#presetSel').append(o); });
  $('#presetSel').onchange = e => { const p = presets[+e.target.value]; if (p) { load(p); toast('Пресет загружен'); } e.target.value = ''; };
  $('#comboSel').onchange = e => { B.combo = e.target.value; const w2 = B.equip.weapon2 && byId.get(B.equip.weapon2.id); if (w2 && w2.cat !== B.combo) delete B.equip.weapon2; update(); };
  $('#buildName').oninput = e => { B.name = e.target.value; save(); };
  $('#newBtn').onclick = () => { if (confirm('Очистить текущую сборку?')) load(blank()); };
  $('#addBonus').onclick = () => { B.bonus.push({ src: 'Руна', stat: '', val: '' }); update(); };
  $('#saveBtn').onclick = () => { const list = store.get('t2calc-saved', []); const name = B.name || prompt('Название сборки:', 'Мой билд'); if (!name) return; B.name = name; $('#buildName').value = name; list.push(JSON.parse(JSON.stringify(B))); store.set('t2calc-saved', list); renderSaved(); toast('Сохранено'); };
  $('#shareBtn').onclick = () => { const url = location.origin + location.pathname + '#b=' + enc(B); navigator.clipboard.writeText(url).then(() => toast('Ссылка скопирована'), () => prompt('Ссылка на сборку:', url)); };
  $('#pickSearch').oninput = renderPick;
  const h = location.hash.match(/#b=(.+)/);
  if (h) { try { load(dec(h[1])); history.replaceState(null, '', location.pathname); return renderSaved(); } catch (e) { toast('Не удалось открыть ссылку'); } }
  const cur = store.get('t2calc-current', null);
  if (cur) load(cur); else if (presets[0]) load(presets[0]); else update();
  renderSaved();
}
init();
