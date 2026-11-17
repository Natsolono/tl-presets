'use strict';
const DATA = '../data/', IC = '../data/ic/';
const SLOTS = [
  ['weapon1', 'Основное оружие', 'Weapon'], ['weapon2', 'Второе оружие', 'Weapon'], ['head', 'Шлем', 'Head'], ['chest', 'Нагрудник', 'Chest'],
  ['hands', 'Перчатки', 'Hands'], ['legs', 'Поножи', 'Legs'], ['feet', 'Сапоги', 'Feet'], ['cloak', 'Плащ', 'Cape'],
  ['necklace', 'Ожерелье', 'Necklace'], ['earring', 'Серьга', 'Earring'], ['ring1', 'Кольцо 1', 'Ring'], ['ring2', 'Кольцо 2', 'Ring'],
  ['bracelet', 'Браслет', 'Bracelet'], ['belt', 'Пояс', 'Belt']
];
const ATTRS = [['Str', 'STR', 'Сила', 'str'], ['Dex', 'DEX', 'Ловкость', 'dex'], ['Int', 'INT', 'Мудрость', 'Int'], ['Per', 'PER', 'Восприятие', 'per'], ['Con', 'CON', 'Стойкость', 'con']];
const COST = [[20, 1], [30, 2], [40, 4], [50, 8], [60, 16], [70, 32], [1e4, 64]];
const POINTS = 54, MAX_ACT = 12, MAX_PAS = 8, SPEC_CAP = 100;
const TRI = ['melee', 'range', 'magic'];
const ALL_EXPAND = ['evasion', 'critical_defense', 'critical_attack', 'accuracy', 'double_attack', 'double_defense', 'armor'];
const WEAPON_ONLY_MAIN = new Set(['attack_power_main_hand', 'bonus_attack_power_main_hand', 'attack_speed_main_hand', 'attack_range_main_hand', 'attack_power_off_hand', 'bonus_attack_power_off_hand', 'off_hand_attack_chance']);
const BONUS_SOURCES = ['Руна', 'Артефакт', 'Мастерство', 'Бафф', 'Прочее'];
const GRADE_ORDER = ['Common', 'Uncommon', 'Rare', 'Rare2', 'Epic', 'Epic2', 'Legendary'];
/* мастерство оружия: ключ дерева, ступени, тип урона оружия */
const MS_KEY = { Sword: 'SW_SH', Sword2h: 'SW2', Dagger: 'DA', Crossbow: 'CR', Bow: 'BO', Staff: 'ST', Wand: 'WA_GR', Spear: 'SP' };
const MS_TIER = [['Normal', 'Ступень 1'], ['High', 'Ступень 2'], ['Rare', 'Ступень 3'], ['Hero', 'Ступень 4']];
const MS_CAP = 200, MAX_COMMON = 4;
const WTYPE = { Sword: 'melee', Sword2h: 'melee', Dagger: 'melee', Spear: 'melee', Bow: 'range', Crossbow: 'range', Staff: 'magic', Wand: 'magic' };
/* общие умения мастерства, которые модель DPS умеет считать */
const MS_PROC = { WM_Common_SKILL_002: { pct: 2.4, cd: 5, hits: 7, n: 'Небесная кара' }, WM_Common_SKILL_009: { pct: 2.1, cd: 6, n: 'Опадающие лепестки' } };

let ITEMS = [], byId = new Map(), SK = [], bySk = new Map(), STAT_KEYS = [];
let MS = { weapons: {}, common: [] }, msNode = new Map(), msCommon = new Map();
let VIS = {};
let AFX_DATA = { slots: [], items: {}, sets: [] };
let RUNES = {};
let _afxPickSlot = null;
let _activeLoadout = 0;
let _runePickSlot = null, _runePickIdx = -1, _rerenderEditorRunes = null;
let B = blank();

function blank() {
  return { v: 2, name: '', w: ['Staff', 'Dagger'], equip: {}, afx: {}, attr: { Str: 10, Dex: 10, Int: 10, Per: 10, Con: 10 }, bonus: [],
    sk: { a: [], p: [], d: null, lv: {}, sp: {} }, ms: { t: {}, c: [] }, dps: { time: 60 } };
}
/* старые ссылки калькулятора: {combo:'Dagger'|'Bow'} → посох + это оружие */
function normalize(o) {
  const b = Object.assign(blank(), JSON.parse(JSON.stringify(o || {})));
  if (!o || !o.w) b.w = ['Staff', (o && o.combo) || 'Dagger'];
  // старый формат: комплект серьги текстом → настоящая серьга этого комплекта
  if (o && o.earSet && !b.equip.earring) { const key = x => String(x || '').toLowerCase().split(/\s+/).slice(0, 2).join(' '); const ear = ITEMS.find(i => i.slot === 'Earring' && i.set === o.earSet) || ITEMS.find(i => i.slot === 'Earring' && i.set && key(i.set) === key(o.earSet)); if (ear) b.equip.earring = { id: ear.id, ench: ear.mx, traits: [], res: null }; }
  delete b.combo; delete b.earSet;
  b.sk = Object.assign({ a: [], p: [], d: null, lv: {}, sp: {} }, b.sk || {});
  b.dps = Object.assign(blank().dps, b.dps || {});
  if (!b.afx || typeof b.afx !== 'object') b.afx = {};
  b.ms = Object.assign({ t: {}, c: [] }, b.ms || {});
  for (const [wk, nodes] of Object.entries(b.ms.t)) { for (const id of Object.keys(nodes || {})) if (!msNode.has(id)) delete nodes[id]; if (!nodes || !Object.keys(nodes).length) delete b.ms.t[wk]; }
  b.ms.c = (b.ms.c || []).filter(id => msCommon.has(id)).slice(0, MAX_COMMON);
  for (const k of Object.keys(b.equip)) if (!byId.has(b.equip[k].id)) delete b.equip[k];
  return b;
}

/* ---------- расчёт ---------- */
function add(o, k, v) { if (!v || typeof v !== 'number') return; o[k] = (o[k] || 0) + v; }
function attrCost(v) { let n = Math.max(0, v - 10), prev = 0, c = 0; for (const [lim, cost] of COST) { const t = Math.min(n, lim - prev); c += t * cost; n -= t; prev = lim; if (!n) break; } return c; }
function nextCost(v) { const n = Math.max(0, v - 10) + 1; return (COST.find(([lim]) => n <= lim) || COST[COST.length - 1])[1]; }
const toRaw = (k, disp) => { const f = META.fmt[k] || { mul: 1 }; return Math.round(disp / (f.mul || 1)); };
const pct = (k, raw) => raw * ((META.fmt[k] || { mul: 1 }).mul || 1); // значение в единицах показа (%, с)

function compute(b) {
  const s = {}; const notes = []; const A = META.attr;
  const main = b.equip.weapon1 && byId.get(b.equip.weapon1.id);
  for (const [k, v] of Object.entries(A.base)) add(s, k, v);
  add(s, 'hp_max', A.lvl.hp_max); add(s, 'cost_max', A.lvl.cost_max);
  const sets = new Map(), setItem = new Map(); let gs = 0, gsN = 0;
  for (const [slot] of SLOTS) {
    const e = b.equip[slot]; if (!e) continue; const it = byId.get(e.id); if (!it) continue;
    const put = (k, v) => { if (slot === 'weapon2' && WEAPON_ONLY_MAIN.has(k)) return; add(s, k, v); };
    for (const [k, v] of Object.entries(itemStats(it, e.ench ?? it.mx))) put(k, v);
    for (const t of (e.traits || [])) { const d = META.traits[t.id]; if (d && it.tr.includes(t.id)) add(s, d.s, traitValue(t.id, t.lvl)); }
    if (e.res != null && it.res[e.res]) for (const [k, v] of Object.entries(it.res[e.res])) add(s, k, v);
    if (it.set) { sets.set(it.set, (sets.get(it.set) || 0) + 1); setItem.set(it.set, it); }
    const g = itemCP(it, e.ench ?? it.mx, (e.traits || []).map(t => t.lvl), e.res != null); if (g != null) { gs += g; gsN++; }
  }
  for (const r of b.bonus) if (r.stat && r.val) add(s, r.stat, toRaw(r.stat, +r.val));
  // руны в гнёздах снаряжения
  for (const [slot, e] of Object.entries(b.equip)) {
    if (!e || !e.runes) continue;
    for (const runeId of e.runes) {
      if (!runeId) continue;
      const rune = RUNES[runeId]; if (!rune || !rune.s) continue;
      const put = (k, v) => { if (slot === 'weapon2' && WEAPON_ONLY_MAIN.has(k)) return; add(s, k, v); };
      for (const [k, v] of Object.entries(rune.s)) put(k, v);
    }
  }
  const activeSets = [];
  for (const [name, n] of sets) {
    const it = setItem.get(name);
    for (const bn of it.sb) if (bn.p <= n) { for (const [k, v] of Object.entries(bn.s)) add(s, k === 'base_damage' ? 'bonus_attack_power_main_hand' : k, v); activeSets.push({ name, p: bn.p, n, t: bn.t || '', s: bn.s }); }
  }
  // артефакты: сетовые бонусы
  if (AFX_DATA.sets.length) {
    const afxCnt = new Map();
    for (const itemId of Object.values(b.afx || {})) {
      if (!itemId) continue;
      for (const sd of AFX_DATA.sets) {
        if (Object.values(sd.items).includes(itemId)) { afxCnt.set(sd.id, (afxCnt.get(sd.id) || 0) + 1); break; }
      }
    }
    for (const [setId, cnt] of afxCnt) {
      const sd = AFX_DATA.sets.find(s => s.id === setId); if (!sd) continue;
      for (const bn of sd.b) if (bn.p <= cnt && bn.s) for (const [k, v] of Object.entries(bn.s)) if (v) add(s, k, v);
    }
  }
  // пассивные умения с бонусами к характеристикам
  for (const id of b.sk.p) { const sk = bySk.get(id); if (sk && sk.st) for (const x of sk.st) add(s, x.key, (x.levels || [])[(b.sk.lv[id] || 15) - 1] ?? x.value); }
  // мастерство: статы узлов на выбранном уровне (только деревья текущих двух оружий)
  for (const w of b.w) { const nodes = b.ms.t[MS_KEY[w]] || {}; for (const [id, lv] of Object.entries(nodes)) { const n = msNode.get(id); const L = n && n.lv && n.lv[Math.min(lv, n.lv.length) - 1]; if (L) for (const x of L.stats || []) add(s, x.stat, x.value); } }
  if (b.ms.c.includes('WM_Common_SKILL_007')) ['str', 'dex', 'Int', 'per', 'con'].forEach(k => add(s, k, 1));
  if (s.int) { add(s, 'Int', s.int); delete s.int; }
  // атрибуты: строка таблицы — накопленные значения; пороги добавляем только для статов, которых нет в строке
  const tot = {};
  for (const [key, , , st] of ATTRS) tot[key] = (b.attr[key] || 10) + (s[st] || 0);
  const wkey = main ? String(main.cat).toLowerCase() : 'none';
  for (const [key, up] of ATTRS) {
    const conv = A.conv[up]; const v = Math.min(tot[key], conv.length); if (v <= 0) continue;
    const row = conv[v - 1].stats;
    for (const [k, val] of Object.entries(row)) {
      if (val && typeof val === 'object') add(s, k === 'attack_powers' ? 'attack_power_main_hand' : 'bonus_attack_power_main_hand', val[wkey] ?? val.none ?? 0);
      else add(s, k, val);
    }
    for (const m of A.ms) {
      if (m.attribute !== up || tot[key] < m.count) continue;
      const mrow = (conv[Math.min(m.count, conv.length) - 1] || {}).stats || {};
      for (const bn of m.bonuses) if (!(bn.stat in mrow)) add(s, bn.stat, bn.value);
    }
  }
  for (const a of activeSets) {
    let m;
    if ((m = a.t.match(/устойчивости \(ближний бой, дальний бой, магия\) повышаются на (\d+) ед\. за каждые 10 ед\. восприятия/))) { const v = Math.round(+m[1] * tot.Per / 10); TRI.forEach(t => add(s, t + '_critical_defense', v)); }
    if ((m = a.t.match(/Базовый урон основного оружия повышается на (\d+) ед\., если показатель стойкости персонажа составляет (\d+)/))) { if (tot.Con >= +m[2]) add(s, 'bonus_attack_power_main_hand', +m[1]); else notes.push(`${a.name}: нужна Стойкость ${m[2]}+`); }
    if ((m = a.t.match(/ловкости персонажа составляет (\d+) ед\. и выше, скорость восстановления умений повышается на (\d+)%/))) { if (tot.Dex >= +m[1]) add(s, 'skill_cooldown_modifier', +m[2] * 100); }
    if ((m = a.t.match(/За каждые 10 ед\. стойкости персонажа скорость его атаки повышается на (\d+)%/))) add(s, 'attack_speed_modifier', +m[1] * 100 * Math.floor(tot.Con / 10));
  }
  for (const x of ALL_EXPAND) { const k = 'all_' + x; if (s[k]) { TRI.forEach(t => add(s, `${t}_${x}`, s[k])); delete s[k]; } }
  if (s.evasion) { TRI.forEach(t => add(s, t + '_evasion', s.evasion)); delete s.evasion; }
  const pts = ATTRS.reduce((a, [k]) => a + attrCost(b.attr[k] || 10), 0);
  return { s, tot, sets: activeSets, notes, pts, main, gs, gsN };
}

/* ---------- DPS: урон из текста умения на выбранном уровне/специализации ---------- */
function skillText(id) {
  const sk = bySk.get(id); if (!sk) return '';
  const L = sk.lv[(B.sk.lv[id] || sk.lv.length) - 1] || sk;
  const chosen = B.sk.sp[id] || [];
  for (const sp of chosen) { const t = (L.sp && L.sp[sp]) || ''; if (/базового урона/.test(t) && /^Персонаж/.test(t)) return t; }
  return L.d || sk.d || '';
}
function parseDamage(text) {
  const m = text.match(/(\d+(?:[.,]\d+)?)% базового урона(?: \+ (\d+) ед\.)?/); if (!m) return null;
  let hits = 1; const h = text.match(/сери[юи] из (\d+)/) || text.match(/(\d+) (?:удар|раз)[а-я]* подряд/) || text.match(/наносит (\d+) удар/);
  if (h) hits = +h[1];
  return { pct: parseFloat(m[1].replace(',', '.')) / 100, flat: +(m[2] || 0), hits };
}
function simulate(R) {
  const s = R.s; const d = B.dps;
  const mn = (s.bonus_attack_power_main_hand || 0) + 1, mx = (s.attack_power_main_hand || 0) + (s.bonus_attack_power_main_hand || 0);
  if (!R.main) return { err: 'Выберите основное оружие — от него считается базовый урон.' };
  const avg = (mn + mx) / 2;
  const wt = WTYPE[B.w[0]] || 'melee';
  const crit    = pct(wt + '_critical_attack', s[wt + '_critical_attack'] || 0);
  const heavy   = pct(wt + '_double_attack',   s[wt + '_double_attack']   || 0);
  const critDmg = 50 + pct('critical_damage_dealt_modifier', s.critical_damage_dealt_modifier || 0);
  const typeMod = pct(wt + '_damage_dealt_modifier', s[wt + '_damage_dealt_modifier'] || 0);
  const mult = (1 + (crit / 100) * (critDmg / 100)) * (1 + heavy / 100) * (1 + typeMod / 100);
  const cdr = 1 + pct('skill_cooldown_modifier', s.skill_cooldown_modifier || 0) / 100;
  const haste = 1 + pct('attack_speed_modifier', s.attack_speed_modifier || 0) / 100;
  const swing = Math.max(0.3, pct('attack_speed_main_hand', s.attack_speed_main_hand || 1000) / haste);
  const list = [];
  for (const id of B.sk.a) {
    const sk = bySk.get(id); if (!sk || sk.cat === 'Basic') continue;
    const L = sk.lv[(B.sk.lv[id] || sk.lv.length) - 1] || sk; const dm = parseDamage(skillText(id)); if (!dm || !L.cd) continue;
    const hit = dm.hits * (dm.pct * avg + dm.flat) * mult; const ct = Math.max(0.5, L.ct || 1);
    list.push({ id, n: sk.n, dmg: hit, cd: L.cd / cdr, ct, ready: 0, casts: 0, total: 0 });
  }
  list.sort((a, b) => b.dmg / b.ct - a.dmg / a.ct);
  let t = 0, auto = 0, autoN = 0; const T = Math.max(10, Math.min(600, +d.time || 60));
  const procs = B.ms.c.filter(id => MS_PROC[id]).map(id => Object.assign({ id, last: -1e9, cnt: 0, casts: 0, total: 0 }, MS_PROC[id]));
  const onHit = (skill) => { for (const p of procs) { if (p.hits) { if (!skill) continue; p.cnt++; if (p.cnt < p.hits || t - p.last < p.cd) continue; p.cnt = 0; } else if (t - p.last < p.cd) continue; p.last = t; p.casts++; p.total += p.pct * avg * mult; } };
  while (t < T) {
    const r = list.find(x => x.ready <= t);
    if (r) { r.casts++; r.total += r.dmg; r.ready = t + r.cd; onHit(true); t += r.ct; continue; }
    const next = Math.min(...list.map(x => x.ready), Infinity);
    if (next - t >= swing || !list.length) { auto += avg * mult; autoN++; onHit(false); t += swing; } else t = next;
  }
  const total = list.reduce((a, x) => a + x.total, 0) + auto + procs.reduce((a, p) => a + p.total, 0);
  return { T, total, dps: total / T, list, auto, autoN, avg, swing, cdr, crit, heavy, critDmg, typeMod, wt, procs, skipped: B.sk.a.filter(id => { const sk = bySk.get(id); return sk && sk.cat !== 'Basic' && !list.find(x => x.id === id); }).length };
}

/* ---------- отрисовка: слоты ---------- */
function itemLine(it) { return statRows({ ...it.b, ...it.x }).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · '); }
function renderSlots() {
  const box = $('#slots'); box.innerHTML = '';
  for (const [slot, name] of SLOTS) {
    const e = B.equip[slot]; const it = e && byId.get(e.id);
    const btn = el('button', 'slot' + (it ? '' : ' empty')); btn.type = 'button';
    btn.append(icon(IC, it && it.ic, '', 'sm'));
    const t = el('span', 'txt'); t.append(el('span', 'sl', slot === 'weapon1' ? W_RU[B.w[0]] : slot === 'weapon2' ? W_RU[B.w[1]] : name));
    if (it) {
      t.append(el('span', 'nm g-' + it.g, it.n));
      const g = itemCP(it, e.ench ?? it.mx, (e.traits || []).map(x => x.lvl), e.res != null);
      t.append(el('span', 'meta', `+${e.ench ?? it.mx} · трейты ${(e.traits || []).length}/3${e.res != null ? ' · резонанс' : ''}${g != null ? ' · GS ' + g : ''}`));
      btn.setAttribute('aria-label', `${name}: ${it.n}, изменить`);
      btn.onclick = () => openEditor(slot);
    } else { t.append(el('span', 'nm', 'Пусто — выбрать')); btn.setAttribute('aria-label', `${name}: выбрать предмет`); btn.onclick = () => openPicker(slot); }
    btn.append(t); box.append(btn);
  }
}
function renderAttrs(R) {
  const box = $('#attrs'); box.innerHTML = '';
  for (const [key, , ru, st] of ATTRS) {
    const base = B.attr[key] || 10, gear = (R.s[st] || 0), c = el('div', 'attr');
    const t = el('div', 't'); t.append(el('span', null, ru), el('span', null, 'ещё ' + nextCost(base) + ' оч.')); c.append(t);
    const v = el('div', 'v', String(base + gear)); v.append(el('small', null, ` (${base} + ${gear})`)); c.append(v);
    const ctl = el('div', 'ctl');
    const minus = el('button', 'ghost', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Убавить: ' + ru); minus.disabled = base <= 10; minus.onclick = () => { if (B.attr[key] > 10) { B.attr[key]--; update(); } };
    const plus = el('button', 'ghost', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Прибавить: ' + ru); plus.onclick = () => { if (R.pts + nextCost(B.attr[key]) <= POINTS) { B.attr[key]++; update(); } else toast('Не хватает очков'); };
    ctl.append(minus, plus); c.append(ctl); box.append(c);
  }
  const left = POINTS - R.pts; const p = $('#pointsLeft'); p.textContent = `осталось ${left} / ${POINTS}`; p.classList.toggle('bad', left < 0);
}
function tri(label, key, s) { const r = el('div', 'tri'); r.append(el('span', null, label)); TRI.forEach(t => r.append(el('b', null, fmtVal(t + '_' + key, s[t + '_' + key] || 0)))); return r; }
function kv(k, v) { const r = el('div', 'kv'); r.append(el('span', null, k), el('b', null, v)); return r; }
function renderSummary(R) {
  const s = R.s; const box = $('#summary'); box.innerHTML = '';
  const hdr = () => { const h = el('div', 'tri h'); h.append(el('span'), el('span', null, 'ближ.'), el('span', null, 'дальн.'), el('span', null, 'магия')); return h; };
  const g1 = el('div', 'grp'); g1.append(el('h3', null, 'Защита'), hdr(), tri('Уклонение', 'evasion', s), tri('Устойчивость', 'critical_defense', s), tri('Защита', 'armor', s), tri('Уст. к мощн. атакам', 'double_defense', s));
  g1.append(kv('Макс. здоровье', fmtVal('hp_max', s.hp_max || 0)), kv('Снижение урона', fmtVal('damage_reduction', s.damage_reduction || 0)), kv('Сопротивление умениям', fmtVal('skill_power_resistance', s.skill_power_resistance || 0)));
  const g2 = el('div', 'grp'); g2.append(el('h3', null, 'Атака'), hdr(), tri('Шанс крит. удара', 'critical_attack', s), tri('Меткость', 'accuracy', s), tri('Шанс мощн. атаки', 'double_attack', s));
  const mn = (s.bonus_attack_power_main_hand || 0) + 1, mx = (s.attack_power_main_hand || 0) + (s.bonus_attack_power_main_hand || 0);
  g2.append(kv('Базовый урон (осн. оружие)', R.main ? `${nf(mn)}~${nf(mx)}` : '—'), kv('Скорость атаки', fmtVal('attack_speed_modifier', s.attack_speed_modifier || 0)),
    kv('Скорость восст. умений', fmtVal('skill_cooldown_modifier', s.skill_cooldown_modifier || 0)), kv('Повышение урона умений', fmtVal('skill_power_amplification', s.skill_power_amplification || 0)),
    kv('Крит. урон', fmtVal('critical_damage_dealt_modifier', s.critical_damage_dealt_modifier || 0)), kv('Макс. мана', fmtVal('cost_max', s.cost_max || 0)));
  box.append(g1, g2);
  if (R.notes.length) box.append(el('p', 'hint', R.notes.join('; ')));
  const all = $('#allStats'); all.innerHTML = '';
  Object.keys(s).filter(k => s[k] && META.labels[k]).sort((a, b) => lab(a).localeCompare(lab(b), 'ru')).forEach(k => all.append(kv(lab(k), fmtVal(k, s[k]))));
  const si = $('#setInfo'); si.innerHTML = '';
  if (!R.sets.length) si.append(el('p', 'hint', 'Нет собранных комплектов.'));
  R.sets.forEach(a => si.append(kv(`${a.name.replace(/^Комплект /, '')} (${a.p})`, a.t ? a.t.slice(0, 140) : Object.entries(a.s).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', '))));
  $('#gs').textContent = Object.keys(B.equip).length + ' / ' + SLOTS.length;
  $('#gsTotal').textContent = R.gsN ? nf(R.gs) : '—';
}
function renderDps(R) {
  const out = $('#dpsOut'); out.innerHTML = ''; const r = simulate(R);
  if (r.err) { out.append(el('p', 'hint', r.err)); $('#dpsVal').textContent = '—'; return; }
  $('#dpsVal').textContent = nf(Math.round(r.dps)) + ' / с';
  const wtLabel = ({ melee: 'ближний бой', range: 'дальний бой', magic: 'магия' })[r.wt] || r.wt;
  out.append(kv('Урон за ' + r.T + ' с', nf(Math.round(r.total))), kv('Средний базовый урон', nf(Math.round(r.avg))),
    kv('Шанс крита (' + wtLabel + ')', Math.round(r.crit * 10) / 10 + '%'),
    kv('Шанс мощной атаки (' + wtLabel + ')', Math.round(r.heavy * 10) / 10 + '%'),
    kv('Крит. урон', Math.round(r.critDmg * 10) / 10 + '%'),
    kv('Перезарядка умений', '÷ ' + r.cdr.toFixed(2)), kv('Автоатака раз в', r.swing.toFixed(2) + ' с'));
  if (r.typeMod) out.append(kv('Урон (' + wtLabel + ')', (r.typeMod > 0 ? '+' : '') + Math.round(r.typeMod * 10) / 10 + '%'));
  const rows = [...r.list.filter(x => x.casts).sort((a, b) => b.total - a.total).map(x => [x.n, x.casts, x.total]), ...r.procs.filter(p => p.casts).map(p => [p.n + ' (мастерство)', p.casts, p.total]), ['Автоатаки', r.autoN, r.auto]];
  const tb = el('table', 'dps-t'); const th = el('tr'); ['Источник', 'Раз', 'Доля'].forEach(t => th.append(el('th', null, t))); const thead = el('thead'); thead.append(th); tb.append(thead);
  const tbody = el('tbody'); rows.forEach(([n, c, t]) => { const tr = el('tr'); tr.append(el('td', null, n), el('td', null, String(c)), el('td', null, r.total ? Math.round(t / r.total * 100) + '%' : '—')); tbody.append(tr); }); tb.append(tbody);
  out.append(tb);
  if (!B.sk.a.length) out.append(el('p', 'hint', 'Отметьте активные умения в блоке «Умения» — пока считаются только автоатаки.'));
  else if (r.skipped) out.append(el('p', 'hint', `Не учтено умений без прямого урона в описании: ${r.skipped}.`));
}

/* ---------- умения ---------- */
function specCost() { let c = 0; for (const [id, list] of Object.entries(B.sk.sp)) { const sk = bySk.get(id); if (!sk) continue; for (const sp of list) c += (sk.sp.find(x => x.id === sp) || {}).cost || 0; } return c; }
function renderSkills() {
  const box = $('#skills'); box.innerHTML = '';
  const avail = SK.filter(s => B.w.includes(s.w));
  const groups = [['Активные', 'a', s => s.cat === 'Active', MAX_ACT], ['Пассивные', 'p', s => s.cat === 'Passive', MAX_PAS], ['Защитное', 'd', s => s.cat === 'Defensive', 1]];
  const used = specCost();
  $('#skCount').textContent = `акт. ${B.sk.a.length}/${MAX_ACT} · пасс. ${B.sk.p.length}/${MAX_PAS}`;
  const sp = $('#spPts'); sp.textContent = `специализации ${used}/${SPEC_CAP}`; sp.classList.toggle('bad', used > SPEC_CAP);
  for (const [title, key, f, max] of groups) {
    const list = avail.filter(f).sort((a, b) => B.w.indexOf(a.w) - B.w.indexOf(b.w) || a.n.localeCompare(b.n, 'ru'));
    const sec = el('div', 'sk-grp'); sec.append(el('h3', null, title));
    const grid = el('div', 'sk-grid');
    list.forEach(s => {
      const on = key === 'd' ? B.sk.d === s.id : B.sk[key].includes(s.id);
      const card = el('div', 'skc' + (on ? ' on' : ''));
      const tg = el('button', 'sk-tg'); tg.type = 'button'; tg.setAttribute('aria-pressed', on);
      tg.append(icon(IC, s.ic, '', 'sm'));
      const tt = el('span', 'sk-t'); tt.append(el('b', null, s.n), el('small', null, W_RU[s.w] || s.w)); tg.append(tt);
      tg.onclick = () => {
        if (key === 'd') B.sk.d = on ? null : s.id;
        else if (on) { B.sk[key] = B.sk[key].filter(x => x !== s.id); delete B.sk.sp[s.id]; }
        else { if (B.sk[key].length >= max) return toast(`Не больше ${max}: сначала снимите другое умение`); B.sk[key].push(s.id); B.sk.lv[s.id] = B.sk.lv[s.id] || s.lv.length || 15; }
        update(false); renderSkills();
      };
      card.append(tg);
      if (on) {
        const ctl = el('div', 'sk-ctl');
        if (s.lv.length > 1) {
          const sel = el('select'); sel.setAttribute('aria-label', 'Уровень умения ' + s.n);
          for (let i = 1; i <= s.lv.length; i++) { const o = el('option', null, 'ур. ' + i); o.value = i; sel.append(o); }
          sel.value = B.sk.lv[s.id] || s.lv.length; sel.onchange = () => { B.sk.lv[s.id] = +sel.value; update(false); renderSkills(); }; ctl.append(sel);
        }
        if (s.sp.length && key !== 'p') {
          const chips = el('div', 'sp-chips'); const cur = B.sk.sp[s.id] || [];
          s.sp.forEach(p => {
            const c = el('button', 'sp-chip'); c.type = 'button'; const pon = cur.includes(p.id); c.setAttribute('aria-pressed', pon);
            c.append(icon(IC, p.ic, '', 'xs'), document.createTextNode(`${p.n} · ${p.cost ?? '?'}`));
            c.title = ((s.lv[(B.sk.lv[s.id] || s.lv.length) - 1] || {}).sp || {})[p.id] || p.d || '';
            c.onclick = () => { const l = B.sk.sp[s.id] || []; B.sk.sp[s.id] = pon ? l.filter(x => x !== p.id) : [...l, p.id]; if (!B.sk.sp[s.id].length) delete B.sk.sp[s.id]; update(false); renderSkills(); };
            chips.append(c);
          });
          ctl.append(chips);
        }
        card.append(ctl);
      }
      const det = el('details', 'sk-d'); det.append(el('summary', null, 'Описание'));
      const L = s.lv[(B.sk.lv[s.id] || s.lv.length) - 1] || s;
      const meta = [L.cd ? 'перезарядка ' + L.cd + ' с' : '', L.mp ? 'мана ' + L.mp : '', L.ct ? 'каст ' + L.ct + ' с' : ''].filter(Boolean).join(' · ');
      if (meta) det.append(el('p', 'muted', meta));
      det.append(el('p', null, L.d || s.d || ''));
      (B.sk.sp[s.id] || []).forEach(id => { const p = s.sp.find(x => x.id === id); if (p) { const q = el('p'); q.append(el('b', null, p.n + ': '), document.createTextNode((L.sp || {})[id] || p.d || '')); det.append(q); } });
      card.append(det); grid.append(card);
    });
    sec.append(grid); box.append(sec);
  }
}

/* ---------- мастерство ---------- */
const msUsed = wk => Object.values(B.ms.t[wk] || {}).reduce((a, v) => a + v, 0);
const msTag = n => (n.n.match(/^\[([^\]]+)\]/) || [])[1] || '';
const signed = (k, v) => { const f = fmtVal(k, v); return v > 0 && f[0] !== '+' ? '+' + f : f; };
function msStatText(n, lv) { const L = n.lv && n.lv[Math.max(1, lv) - 1]; const st = (L && L.stats) || n.st || []; return st.length ? st.map(x => `${x.label || lab(x.stat)} ${signed(x.stat, x.value)}`).join(' · ') : ''; }
function setNode(wk, n, lv) {
  const tree = B.ms.t[wk] = B.ms.t[wk] || {}; const cur = tree[n.id] || 0; lv = Math.max(0, Math.min(n.max, lv));
  if (lv > cur && msUsed(wk) + (lv - cur) > MS_CAP) { toast(`В дереве не больше ${MS_CAP} очков`); return; }
  if (lv) tree[n.id] = lv; else delete tree[n.id];
  if (!Object.keys(tree).length) delete B.ms.t[wk];
  update(false); renderMastery();
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function makeMasteryTree(wk, tr) {
  const vis = VIS[wk] || {};
  const wrap = el('div', 'ms-svgtree');

  /* header */
  const h = el('div', 'ms-svgtree-h');
  h.append(icon(IC, tr.ic, tr.n, 'sm'), el('b', null, tr.n), el('span', 'pill', `${msUsed(wk)} / ${MS_CAP}`));
  const clr = el('button', 'ghost', 'Сбросить'); clr.type = 'button';
  clr.onclick = () => { delete B.ms.t[wk]; update(false); renderMastery(); };
  h.append(clr);
  wrap.append(h);

  /* SVG */
  const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'ms-svg', role: 'img', 'aria-label': 'Дерево мастерства ' + tr.n });

  /* defs: glow filter */
  const defs = svgEl('defs');
  const filt = svgEl('filter', { id: 'msglow-' + wk, x: '-40%', y: '-40%', width: '180%', height: '180%' });
  const fblur = svgEl('feGaussianBlur', { stdDeviation: '1.2', result: 'blur' });
  const fcmp = svgEl('feComposite', { in: 'SourceGraphic', in2: 'blur', operator: 'over' });
  filt.append(fblur, fcmp); defs.append(filt); svg.append(defs);

  /* background */
  svg.append(svgEl('circle', { cx: 50, cy: 50, r: 50, fill: '#080e1a' }));
  /* ring gradients */
  for (const [r, op] of [[48, 0.5], [42, 0.3], [32, 0.25], [21, 0.2]]) {
    svg.append(svgEl('circle', { cx: 50, cy: 50, r, fill: 'none', stroke: '#2a3f5f', 'stroke-width': r === 48 ? '0.6' : '0.3', opacity: op }));
  }

  /* links */
  for (const [from, to, color, pts] of (vis.links || [])) {
    if (!pts || pts.length < 2) continue;
    svg.append(svgEl('path', {
      d: 'M' + pts.map(p => `${p[0]},${p[1]}`).join('L'),
      stroke: color, 'stroke-width': '0.55', fill: 'none', opacity: '0.3'
    }));
  }

  /* center weapon icon */
  svg.append(svgEl('circle', { cx: 50, cy: 50, r: 7.5, fill: '#0d1830', stroke: '#c89a2a', 'stroke-width': '1.2' }));
  if (tr.ic) {
    const img = svgEl('image', { href: IC + tr.ic, x: 44, y: 44, width: 12, height: 12 });
    svg.append(img);
  }

  /* nodes */
  const nodeVis = vis.nodes || {};
  for (const n of tr.nodes) {
    const lv = (B.ms.t[wk] || {})[n.id] || 0;
    const nv = nodeVis[n.id] || {};
    const color = nv.co || '#7a8ea8';
    const sh = nv.sh || 'c';
    const active = lv > 0;
    const isHero = n.id.includes('_Hero_');
    const size = isHero ? 3.8 : (sh !== 'c') ? 2.9 : 2.3;
    const fill = active ? color : '#121d2e';
    const stroke = active ? color : '#2d3f54';
    const filtAttr = active ? { filter: `url(#msglow-${wk})` } : {};

    const g = svgEl('g', { class: 'ms-node' + (active ? ' on' : ''), 'data-id': n.id });
    g.style.cursor = 'pointer';

    /* visual shape */
    let vis_el;
    if (sh === 'd') {
      vis_el = svgEl('rect', { x: n.x - size, y: n.y - size, width: size * 2, height: size * 2,
        transform: `rotate(45,${n.x},${n.y})`, fill, stroke, 'stroke-width': '0.5', ...filtAttr });
    } else if (sh === 's') {
      vis_el = svgEl('rect', { x: n.x - size, y: n.y - size, width: size * 2, height: size * 2,
        fill, stroke, 'stroke-width': '0.5', ...filtAttr });
    } else {
      vis_el = svgEl('circle', { cx: n.x, cy: n.y, r: size, fill, stroke, 'stroke-width': '0.5', ...filtAttr });
    }
    g.append(vis_el);

    /* level badge */
    if (n.max > 1) {
      const txt = svgEl('text', { x: n.x, y: n.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': '2', 'font-weight': '700', fill: active ? '#fff' : '#3a4f65', 'pointer-events': 'none' });
      txt.textContent = active ? String(lv) : '';
      g.append(txt);
    }

    /* transparent hit zone (easier to click) */
    const hit = svgEl('circle', { cx: n.x, cy: n.y, r: Math.max(5, size + 2.5), fill: 'transparent', stroke: 'none' });
    g.append(hit);

    /* tooltip */
    const title = svgEl('title');
    const st = msStatText(n, lv || 1);
    title.textContent = n.n.replace(/^\[[^\]]+\]\s*/, '') + ` ${lv}/${n.max}` + (st ? '\n' + st : '') + (n.t ? '\n' + n.t.split('\n')[0].slice(0, 120) : '');
    g.append(title);

    /* interactions */
    g.addEventListener('click', () => setNode(wk, n, lv >= n.max ? 0 : lv + 1));
    g.addEventListener('contextmenu', e => { e.preventDefault(); setNode(wk, n, Math.max(0, lv - 1)); });

    svg.append(g);
  }

  wrap.append(svg);

  /* per-tree stats summary */
  const sum = {};
  for (const [id, lv] of Object.entries(B.ms.t[wk] || {})) {
    const nd = msNode.get(id); const L = nd && nd.lv && nd.lv[lv - 1];
    if (L) for (const x of L.stats || []) sum[x.stat] = (sum[x.stat] || 0) + x.value;
  }
  const keys = Object.keys(sum).filter(k => sum[k]);
  if (keys.length) {
    const det = el('details', 'ms-treesum'); det.append(el('summary', null, 'Что даёт мастерство'));
    keys.sort((a, b) => lab(a).localeCompare(lab(b), 'ru')).forEach(k => det.append(kv(lab(k), signed(k, sum[k]))));
    wrap.append(det);
  }

  return wrap;
}

function renderMastery() {
  const box = $('#mastery'); if (!box) return;
  box.innerHTML = '';
  $('#msPts').textContent = B.w.map(w => `${W_RU[w]} ${msUsed(MS_KEY[w])}/${MS_CAP}`).join(' · ');

  /* weapon SVG trees */
  const trees = el('div', 'ms-trees');
  for (const w of B.w) {
    const wk = MS_KEY[w]; const tr = MS.weapons[wk]; if (!tr) continue;
    trees.append(makeMasteryTree(wk, tr));
  }
  box.append(trees);

  /* common mastery */
  const det = el('details', 'ms-tree');
  const sm = el('summary'); sm.append(el('b', null, 'Общие умения мастерства'), el('span', 'pill', `${B.ms.c.length} / ${MAX_COMMON}`)); det.append(sm);
  det.append(el('p', 'hint', `До ${MAX_COMMON} умений. Уровень, на котором открывается умение, указан для справки.`));
  const grid = el('div', 'ms-grid');
  MS.common.forEach(c => {
    const on = B.ms.c.includes(c.id); const card = el('div', 'msn' + (on ? ' on' : ''));
    const h = el('div', 'msn-h'); h.append(icon(IC, c.ic, '', 'sm'));
    const tt = el('div', 'msn-t'); tt.append(el('b', null, c.n), el('small', null, `открывается на ${c.req} ур.${MS_PROC[c.id] ? ' · учитывается в DPS' : c.id === 'WM_Common_SKILL_007' ? ' · учитывается в статах' : ''}`));
    h.append(tt); card.append(h);
    const tg = el('button', 'sp-chip', on ? 'Взято' : 'Взять'); tg.type = 'button'; tg.setAttribute('aria-pressed', on);
    tg.onclick = () => { if (on) B.ms.c = B.ms.c.filter(x => x !== c.id); else { if (B.ms.c.length >= MAX_COMMON) return toast(`Не больше ${MAX_COMMON}: сначала уберите другое`); B.ms.c.push(c.id); } update(false); renderMastery(); };
    card.append(tg);
    const d = el('details', 'sk-d'); d.append(el('summary', null, 'Описание'), el('p', null, c.t || '')); card.append(d);
    grid.append(card);
  });
  det.append(grid); box.append(det);
}

/* ---------- выбор и настройка предметов ---------- */
let pickSlot = null;
function candidates(slot) {
  const type = SLOTS.find(s => s[0] === slot)[2];
  return ITEMS.filter(it => {
    if (it.slot !== type && !(type === 'Cape' && it.slot === 'Cloak')) return false;
    if (slot === 'weapon1') return it.cat === B.w[0];
    if (slot === 'weapon2') return it.cat === B.w[1];
    if (slot === 'ring1' || slot === 'ring2') { const o = B.equip[slot === 'ring1' ? 'ring2' : 'ring1']; if (o && o.id === it.id) return false; }
    return true;
  });
}
function openPicker(slot) {
  pickSlot = slot; $('#pickTitle').textContent = 'Выбор: ' + (slot === 'weapon1' ? W_RU[B.w[0]] : slot === 'weapon2' ? W_RU[B.w[1]] : SLOTS.find(s => s[0] === slot)[1]);
  $('#pickSearch').value = ''; renderPick(); $('#picker').showModal(); $('#pickSearch').focus();
}
function renderPick() {
  const q = $('#pickSearch').value.trim().toLowerCase(); const g = $('#pickGrade').value; const box = $('#pickList'); box.innerHTML = '';
  const list = candidates(pickSlot).filter(it => (!g || it.g === g) && (!q || it._q.includes(q)));
  list.sort((a, b) => (b._gs || 0) - (a._gs || 0) || a.n.localeCompare(b.n, 'ru'));
  if (!list.length) box.append(el('p', 'hint', 'Ничего не найдено. Попробуйте другой запрос или редкость.'));
  list.slice(0, 200).forEach(it => {
    const b = el('button', 'pick'); b.type = 'button';
    b.append(icon(IC, it.ic, '', 'sm'));
    const t = el('span', 'txt'); t.append(el('span', 'nm g-' + it.g, it.n), el('span', 'st', [GRADE_RU[it.g] || it.g, it._gs != null ? 'GS ' + it._gs : '', it.set ? it.set.replace(/^Комплект /, '') : ''].filter(Boolean).join(' · ')), el('span', 'st', itemLine(it)));
    b.append(t);
    b.onclick = () => { B.equip[pickSlot] = { id: it.id, ench: it.mx, traits: [], res: null }; $('#picker').close(); update(); openEditor(pickSlot); };
    box.append(b);
  });
}
let edSlot = null;
function openEditor(slot) {
  edSlot = slot; const e = B.equip[slot]; const it = byId.get(e.id);
  $('#edTitle').textContent = it.n; $('#edTitle').className = 'g-' + it.g;
  const body = $('#edBody'); body.innerHTML = '';
  const sec1 = el('div', 'ed-sec'); sec1.append(el('h3', null, 'Заточка'));
  const r1 = el('div', 'ed-row'); const rng = el('input'); rng.type = 'range'; rng.min = 0; rng.max = it.mx; rng.value = e.ench ?? it.mx; rng.setAttribute('aria-label', 'Заточка');
  const out = el('b', null, '+' + rng.value); r1.append(rng, out); sec1.append(r1);
  const base = el('div', 'ed-stats'); sec1.append(base);
  const drawBase = () => { base.textContent = statRows(itemStats(it, e.ench ?? it.mx)).map(([k, v]) => k + ' ' + v).join(' · '); };
  rng.oninput = () => { e.ench = +rng.value; out.textContent = '+' + rng.value; drawBase(); update(false); };
  drawBase(); body.append(sec1);
  if (it.tr.length) {
    const sec = el('div', 'ed-sec'); sec.append(el('h3', null, 'Трейты (до 3)'));
    it.tr.forEach(t => {
      const d = META.traits[t]; if (!d) return; const cur = (e.traits || []).find(x => x.id === t);
      const row = el('div', 'ed-row'); const lb = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!cur;
      lb.append(cb, document.createTextNode(' ' + lab(d.s)));
      const lvl = el('select'); lvl.setAttribute('aria-label', 'Уровень трейта ' + lab(d.s));
      for (let i = 1; i <= 4; i++) { const o = el('option', null, `ур. ${i} · ${fmtVal(d.s, traitValue(t, i))}`); o.value = i; lvl.append(o); }
      lvl.value = cur ? cur.lvl : 4;
      cb.onchange = () => { e.traits = e.traits || []; if (cb.checked) { if (e.traits.length >= 3) { cb.checked = false; return toast('Максимум 3 трейта'); } e.traits.push({ id: t, lvl: +lvl.value }); } else e.traits = e.traits.filter(x => x.id !== t); update(false); };
      lvl.onchange = () => { const x = (e.traits || []).find(y => y.id === t); if (x) { x.lvl = +lvl.value; update(false); } };
      row.append(lb, lvl); sec.append(row);
    });
    body.append(sec);
  }
  if (it.res.length) {
    const sec = el('div', 'ed-sec'); sec.append(el('h3', null, 'Резонанс'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Резонанс'); const o0 = el('option', null, 'Не открыт'); o0.value = ''; sel.append(o0);
    it.res.forEach((r, i) => { const o = el('option', null, Object.entries(r).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', ')); o.value = i; sel.append(o); });
    sel.value = e.res ?? ''; sel.onchange = () => { e.res = sel.value === '' ? null : +sel.value; update(false); };
    sec.append(sel); body.append(sec);
  }
  if (it.sb.length) {
    const sec = el('div', 'ed-sec'); sec.append(el('h3', null, it.set));
    it.sb.forEach(bn => sec.append(el('div', 'ed-stats', `${bn.p} шт.: ` + (bn.t || Object.entries(bn.s).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', ')))));
    body.append(sec);
  }
  if (it.perk) { const sec = el('div', 'ed-sec'); sec.append(el('h3', null, 'Особое умение: ' + (it.perk.n || ''))); sec.append(el('div', 'ed-stats', it.perk.d || '')); body.append(sec); }
  if (it.rs > 0) {
    if (!e.runes || !Array.isArray(e.runes) || e.runes.length !== it.rs) e.runes = Array(it.rs).fill(null);
    const runesSec = el('div', 'ed-sec');
    _rerenderEditorRunes = () => {
      runesSec.innerHTML = '';
      const det = el('details', 'rune-det'); det.open = true;
      const sm = el('summary'); sm.append(el('b', null, 'Руны'), el('span', 'pill', `${e.runes.filter(Boolean).length} / ${it.rs}`)); det.append(sm);
      const rows = el('div', 'rune-rows');
      for (let i = 0; i < it.rs; i++) {
        const runeId = e.runes[i]; const rune = runeId ? RUNES[runeId] : null;
        const row = el('div', 'rune-row');
        const btn = el('button', 'rune-btn ghost', ''); btn.type = 'button';
        if (rune) {
          btn.append(el('span', 'rune-name g-' + rune.g, rune.n));
          const stats = Object.entries(rune.s).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', ');
          btn.append(el('span', 'rune-stats', stats));
          const rm = el('button', 'ghost danger rune-rm', '×'); rm.type = 'button'; rm.setAttribute('aria-label', 'Снять руну');
          rm.onclick = ev => { ev.stopPropagation(); e.runes[i] = null; update(false); _rerenderEditorRunes(); };
          row.append(btn, rm);
        } else {
          btn.append(el('span', 'rune-empty', `Гнездо ${i + 1} · выбрать руну`));
          row.append(btn);
        }
        btn.onclick = () => openRunePicker(it, i);
        rows.append(row);
      }
      det.append(rows); runesSec.append(det);
    };
    _rerenderEditorRunes();
    body.append(runesSec);
  }
  const more = el('a', 'text-link', 'Подробнее в энциклопедии →'); more.href = '../db/#item/' + encodeURIComponent(it.id); more.target = '_blank'; body.append(more);
  $('#editor').showModal();
}
$('#editor').addEventListener('close', () => { const v = $('#editor').returnValue; if (v === 'remove') { delete B.equip[edSlot]; update(); } else if (v === 'change') openPicker(edSlot); else update(); });

/* ---------- доп. бонусы ---------- */
function renderBonuses() {
  const box = $('#bonuses'); box.innerHTML = '';
  if (!B.bonus.length) box.append(el('p', 'hint', 'Пока пусто.'));
  B.bonus.forEach((r, i) => {
    const row = el('div', 'bonus');
    const src = el('select'); src.setAttribute('aria-label', 'Источник бонуса'); BONUS_SOURCES.forEach(x => { const o = el('option', null, x); o.value = x; src.append(o); }); src.value = r.src || 'Руна'; src.onchange = () => { r.src = src.value; save(); };
    const st = el('select', 'stat'); st.setAttribute('aria-label', 'Характеристика'); const o0 = el('option', null, 'Стат…'); o0.value = ''; st.append(o0);
    STAT_KEYS.forEach(k => { const o = el('option', null, lab(k)); o.value = k; st.append(o); }); st.value = r.stat || ''; st.onchange = () => { r.stat = st.value; update(); };
    const v = el('input'); v.type = 'number'; v.step = 'any'; v.value = r.val ?? ''; v.placeholder = 'значение'; v.setAttribute('aria-label', 'Значение бонуса'); v.oninput = () => { r.val = v.value; update(false); };
    const del = el('button', 'ghost danger', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Удалить бонус'); del.onclick = () => { B.bonus.splice(i, 1); update(); };
    row.append(src, st, v, del); box.append(row);
  });
}

/* ---------- состояние, ссылки, экспорт ---------- */
function save() { store.set('t2calc-current', B); saveLoadout(); }
function update(full = true) {
  const R = compute(B);
  if (full) { renderSlots(); renderBonuses(); renderArtifacts(); }
  renderAttrs(R); renderSummary(R); renderDps(R); save();
  if (!full) renderSlots();
}
/* ---------- артефакты ---------- */
function renderArtifacts() {
  const box = $('#afxSlots'); if (!box) return;
  box.innerHTML = '';
  const slotOrder = ['gemstone1','gemstone2','talistone1','talistone2','talistone3','talistone4'];
  const slotLabel = { gemstone1:'Соларит', gemstone2:'Лунарит', talistone1:'Талирит I', talistone2:'Талирит II', talistone3:'Талирит III', talistone4:'Талирит IV' };
  const slotIcon = { gemstone1:'☀', gemstone2:'☽', talistone1:'◆', talistone2:'◆', talistone3:'◆', talistone4:'◆' };
  for (const slotId of slotOrder) {
    const itemId = B.afx[slotId] || null;
    const item = itemId ? AFX_DATA.items[itemId] : null;
    const btn = el('button', 'afx-slot ghost', '');
    btn.type = 'button';
    const ico = el('span', 'afx-ico');
    if (item) {
      const img = el('img'); img.loading = 'lazy'; img.alt = ''; img.src = IC + item.ic;
      img.onerror = () => { ico.textContent = slotIcon[slotId]; };
      ico.append(img);
    } else { ico.textContent = slotIcon[slotId]; }
    const info = el('div', 'afx-info');
    info.append(el('span', 'afx-name', item ? item.n : slotLabel[slotId]));
    if (item) { const grade = el('span', 'g-' + item.g); grade.textContent = GRADE_RU[item.g] || item.g; info.append(grade); }
    else { info.append(el('span', 'afx-empty', '(пусто)')); }
    btn.append(ico, info);
    if (item) {
      const rm = el('button', 'ghost afx-rm', '×'); rm.type = 'button'; rm.setAttribute('aria-label', 'Снять');
      rm.onclick = e => { e.stopPropagation(); B.afx[slotId] = null; update(); };
      btn.append(rm);
    }
    btn.onclick = () => openAfxPicker(slotId, slotLabel[slotId]);
    box.append(btn);
  }
  // активные сетовые бонусы и итоговые статы артефактов
  const setBox = $('#afxSets'); if (!setBox) return;
  setBox.innerHTML = '';
  const afxCnt = new Map();
  for (const itemId of Object.values(B.afx || {})) {
    if (!itemId) continue;
    for (const sd of AFX_DATA.sets) {
      if (Object.values(sd.items).includes(itemId)) { afxCnt.set(sd.id, (afxCnt.get(sd.id) || 0) + 1); break; }
    }
  }
  if (!afxCnt.size) return;
  // суммарные статы от артефактных сетов (как "Что даёт мастерство")
  const afxStats = {};
  for (const [setId, cnt] of afxCnt) {
    const sd = AFX_DATA.sets.find(s => s.id === setId); if (!sd) continue;
    for (const bn of sd.b) if (bn.p <= cnt && bn.s) for (const [k, v] of Object.entries(bn.s)) if (v) afxStats[k] = (afxStats[k] || 0) + v;
  }
  const statKeys = Object.keys(afxStats).filter(k => afxStats[k]);
  if (statKeys.length) {
    const det = el('details', 'afx-statdet'); det.open = true;
    det.append(el('summary', null, 'Что дают артефакты'));
    statKeys.sort((a, b) => lab(a).localeCompare(lab(b), 'ru')).forEach(k => det.append(kv(lab(k), fmtVal(k, afxStats[k]))));
    setBox.append(det);
  }
  // бонусы сетов с разбивкой
  for (const [setId, cnt] of afxCnt) {
    const sd = AFX_DATA.sets.find(s => s.id === setId); if (!sd) continue;
    const det = el('details', 'afx-setdet'); det.open = true;
    const sm = el('summary'); sm.append(el('b', null, sd.n), el('span', 'pill', `${cnt} / 6`)); det.append(sm);
    for (const bn of sd.b) {
      const cls = bn.p <= cnt ? 'afx-bn-active' : 'afx-bn-locked';
      const text = (bn.n || `${bn.p} шт.`) + (bn.t ? ': ' + bn.t : (bn.s ? ': ' + Object.entries(bn.s).map(([k,v]) => lab(k) + ' ' + fmtVal(k,v)).join(', ') : ''));
      det.append(el('div', cls, text));
    }
    setBox.append(det);
  }
}
function openAfxPicker(slotId, label) {
  _afxPickSlot = slotId;
  const dlg = $('#afxPicker'); if (!dlg) return;
  dlg.querySelector('#afxPickTitle').textContent = 'Выбрать: ' + label;
  $('#afxPickSearch').value = '';
  renderAfxPick();
  dlg.showModal();
}
function renderAfxPick() {
  const slotId = _afxPickSlot; if (!slotId) return;
  const q = ($('#afxPickSearch').value || '').toLowerCase();
  const list = $('#afxPickList'); list.innerHTML = '';
  const entries = Object.entries(AFX_DATA.items).filter(([, it]) => it.slot === slotId);
  const filtered = q ? entries.filter(([, it]) => it.n.toLowerCase().includes(q)) : entries;
  if (!filtered.length) { list.append(el('p', 'hint', 'Ничего не найдено')); return; }
  for (const [id, it] of filtered) {
    const btn = el('button', 'pick-item' + (B.afx[slotId] === id ? ' active' : ''), '');
    btn.type = 'button';
    const img = el('img', 'ic'); img.loading = 'lazy'; img.alt = ''; img.src = IC + it.ic;
    img.onerror = () => { img.style.display = 'none'; };
    const nameEl = el('span', 'pick-n', it.n);
    const gradeEl = el('span', 'g-' + it.g, GRADE_RU[it.g] || it.g);
    const info = el('span', 'pick-meta'); info.append(nameEl, el('br'), gradeEl);
    btn.append(img, info);
    btn.onclick = () => { B.afx[slotId] = id; update(); $('#afxPicker').close(); };
    list.append(btn);
  }
}
/* ---------- руны ---------- */
function openRunePicker(it, idx) {
  _runePickSlot = it; // it object (not slot key)
  _runePickIdx = idx;
  $('#runePickSearch').value = '';
  $('#runePickCat').value = '';
  renderRunePick();
  $('#runePicker').showModal();
}
function renderRunePick() {
  const q = ($('#runePickSearch').value || '').toLowerCase();
  const cat = ($('#runePickCat').value || '');
  const list = $('#runePickList'); list.innerHTML = '';
  let entries = Object.values(RUNES);
  if (cat) entries = entries.filter(r => r.cat === cat);
  if (q) entries = entries.filter(r => r.n.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q));
  entries.sort((a, b) => GRADE_ORDER.indexOf(b.g) - GRADE_ORDER.indexOf(a.g) || a.n.localeCompare(b.n, 'ru'));
  if (!entries.length) { list.append(el('p', 'hint', 'Ничего не найдено')); return; }
  const e = _runePickSlot ? B.equip[edSlot] : null;
  const curRuneId = e && e.runes ? e.runes[_runePickIdx] : null;
  for (const rune of entries) {
    const btn = el('button', 'pick-item' + (curRuneId === rune.id ? ' active' : ''), ''); btn.type = 'button';
    const nameEl = el('span', 'pick-n g-' + rune.g, rune.n);
    const catEl = el('span', 'pick-meta', GRADE_RU[rune.g] || rune.g);
    const stats = Object.entries(rune.s).map(([k, v]) => lab(k) + ' ' + fmtVal(k, v)).join(', ');
    const statsEl = el('span', 'pick-meta', stats);
    const info = el('span', 'pick-info'); info.append(nameEl, el('span', null, ' · '), catEl, el('br'), statsEl);
    btn.append(info);
    btn.onclick = () => {
      if (e && e.runes) e.runes[_runePickIdx] = rune.id;
      update(false);
      if (_rerenderEditorRunes) _rerenderEditorRunes();
      $('#runePicker').close();
    };
    list.append(btn);
  }
}
/* ---------- лоадауты ---------- */
function saveLoadout() {
  const all = store.get('t2calc-loadouts', [null, null, null]);
  while (all.length < 3) all.push(null);
  all[_activeLoadout] = JSON.parse(JSON.stringify(B));
  store.set('t2calc-loadouts', all);
}
function loadLoadout(idx) {
  saveLoadout();
  _activeLoadout = idx;
  store.set('t2calc-active-loadout', idx);
  const all = store.get('t2calc-loadouts', [null, null, null]);
  const lo = all[idx];
  if (lo) load(lo); else load(blank());
  renderLoadoutTabs();
}
function renderLoadoutTabs() {
  const bar = $('#loadoutBar'); if (!bar) return;
  $$('.loadout-btn', bar).forEach((btn, i) => {
    btn.classList.toggle('active', i === _activeLoadout);
  });
}
function enc(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(s)))); }
const shareUrl = () => location.origin + location.pathname + '#b=' + enc(B);
function load(o) {
  B = normalize(o);
  fillWeapons(); $('#buildName').value = B.name || '';
  $('#dTime').value = B.dps.time ?? 60;
  update(); renderSkills(); renderMastery();
}
function fillWeapons() {
  [['#w1Sel', 0], ['#w2Sel', 1]].forEach(([sel, i]) => {
    const s = $(sel); s.innerHTML = '';
    WEAPONS.forEach(w => { if (w === B.w[1 - i]) return; const o = el('option', null, W_RU[w]); o.value = w; s.append(o); });
    s.value = B.w[i];
  });
}
function exportText() {
  const R = compute(B); const L = [];
  L.push(`${B.name || 'Билд'} — ${W_RU[B.w[0]]} + ${W_RU[B.w[1]]}`);
  L.push(`GS ${R.gsN ? R.gs : '—'} · Сила ${R.tot.Str} · Ловкость ${R.tot.Dex} · Мудрость ${R.tot.Int} · Восприятие ${R.tot.Per} · Стойкость ${R.tot.Con}`);
  L.push(''); L.push('Снаряжение:');
  for (const [slot, name] of SLOTS) { const e = B.equip[slot]; const it = e && byId.get(e.id); if (!it) continue; L.push(`• ${name}: ${it.n} +${e.ench ?? it.mx}` + ((e.traits || []).length ? ' — ' + e.traits.map(t => lab((META.traits[t.id] || {}).s) + ' ' + t.lvl).join(', ') : '')); }
  const nm = id => (bySk.get(id) || {}).n || id;
  if (B.sk.a.length) { L.push(''); L.push('Активные: ' + B.sk.a.map(id => nm(id) + ((B.sk.sp[id] || []).length ? ` (${B.sk.sp[id].map(x => ((bySk.get(id).sp.find(p => p.id === x) || {}).n || x)).join(', ')})` : '')).join('; ')); }
  if (B.sk.p.length) L.push('Пассивные: ' + B.sk.p.map(nm).join('; '));
  if (B.sk.d) L.push('Защитное: ' + nm(B.sk.d));
  const msl = B.w.map(w => [w, msUsed(MS_KEY[w])]).filter(([, v]) => v);
  if (msl.length || B.ms.c.length) L.push('Мастерство: ' + msl.map(([w, v]) => `${W_RU[w]} ${v}`).join(', ') + (B.ms.c.length ? (msl.length ? '; ' : '') + 'общие: ' + B.ms.c.map(id => (msCommon.get(id) || {}).n || id).join(', ') : ''));
  L.push(''); L.push('Открыть в конструкторе: ' + shareUrl());
  return L.join('\n');
}
function renderSaved() {
  const box = $('#saved'); box.innerHTML = ''; const list = store.get('t2calc-saved', []);
  if (!list.length) box.append(el('p', 'hint', 'Пока пусто. «Сохранить билд» запомнит текущую сборку в этом браузере.'));
  list.forEach((x, i) => {
    const it = el('div', 'it'); it.append(el('span', null, (x.name || 'Без названия') + (x.w ? ` · ${W_RU[x.w[0]]} + ${W_RU[x.w[1]]}` : '')));
    const d = el('div'); const ld = el('button', 'ghost', 'Открыть'); ld.type = 'button'; ld.onclick = () => { load(x); toast('Загружено'); };
    const del = el('button', 'ghost danger', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Удалить сохранённый билд'); del.onclick = () => { list.splice(i, 1); store.set('t2calc-saved', list); renderSaved(); };
    d.append(ld, del); it.append(d); box.append(it);
  });
}

async function init() {
  await loadMeta(DATA);
  const [items, skills, ms, msVis, afx, rns] = await Promise.all([
    fetch(DATA + 'items.json').then(r => r.json()),
    fetch(DATA + 'skills.json').then(r => r.json()),
    fetch(DATA + 'mastery.json').then(r => r.json()).catch(() => null),
    fetch(DATA + 'mastery-vis.json').then(r => r.json()).catch(() => null),
    fetch(DATA + 'artifacts.json').then(r => r.json()).catch(() => null),
    fetch(DATA + 'runes.json').then(r => r.json()).catch(() => null)
  ]);
  ITEMS = items; SK = skills;
  if (ms) { MS = ms; for (const tr of Object.values(MS.weapons)) for (const n of tr.nodes) msNode.set(n.id, n); MS.common.forEach(c => msCommon.set(c.id, c)); }
  if (msVis) VIS = msVis;
  if (afx) AFX_DATA = afx;
  if (rns) RUNES = rns;
  ITEMS.forEach(it => { byId.set(it.id, it); it._gs = itemCP(it, it.mx, [], false); it._q = [it.n, it.set || '', ...Object.keys({ ...it.b, ...it.x }).map(lab), ...it.tr.map(t => lab((META.traits[t] || {}).s))].join(' ').toLowerCase(); });
  SK.forEach(s => bySk.set(s.id, s));
  STAT_KEYS = Object.keys(META.labels).filter(k => !/^(adjust_|gathering_|dash_|glide_|swim_|earn_|spend_|additional_|pv_p_|aggro_|aura_|polymorph_)/.test(k)).filter(k => !/_immune$/.test(k)).sort((a, b) => lab(a).localeCompare(lab(b), 'ru'));
  const pg = $('#pickGrade'); GRADE_ORDER.forEach(g => { const o = el('option', null, GRADE_RU[g] || g); o.value = g; pg.append(o); });
  const presets = await fetch('presets.json').then(r => r.ok ? r.json() : []).catch(() => []);
  presets.forEach((p, i) => { const o = el('option', null, p.name); o.value = i; $('#presetSel').append(o); });
  $('#presetSel').onchange = e => { const p = presets[+e.target.value]; if (p) { load(p); toast('Пресет загружен'); } e.target.value = ''; };
  $('#w1Sel').onchange = e => { B.w[0] = e.target.value; delete B.equip.weapon1; pruneSkills(); fillWeapons(); update(); renderSkills(); renderMastery(); };
  $('#w2Sel').onchange = e => { B.w[1] = e.target.value; delete B.equip.weapon2; pruneSkills(); fillWeapons(); update(); renderSkills(); renderMastery(); };
  $('#buildName').oninput = e => { B.name = e.target.value; save(); };
  $('#newBtn').onclick = () => { if (confirm('Очистить текущую сборку?')) { load(blank()); } };
  $('#addBonus').onclick = () => { B.bonus.push({ src: 'Руна', stat: '', val: '' }); update(); };
  $('#saveBtn').onclick = () => { const list = store.get('t2calc-saved', []); const name = B.name || prompt('Название сборки:', 'Мой билд'); if (!name) return; B.name = name; $('#buildName').value = name; list.push(JSON.parse(JSON.stringify(B))); store.set('t2calc-saved', list); renderSaved(); toast('Сохранено'); };
  $('#shareBtn').onclick = () => { const u = shareUrl(); navigator.clipboard.writeText(u).then(() => toast('Ссылка скопирована'), () => prompt('Ссылка на сборку:', u)); };
  if ($('#publishBtn')) {
    $('#publishBtn').onclick = () => {
      const dlg = $('#publishDlg');
      $('#pubName').value = B.name || '';
      $('#pubAuthor').value = '';
      $('#pubStatus').textContent = '';
      dlg.showModal();
    };
    $('#pubOkBtn').onclick = () => {
      const name = $('#pubName').value.trim();
      if (!name) { $('#pubStatus').textContent = 'Введите название билда'; return; }
      const gs = compute(B).gs || 0;
      const payload = {
        name: name,
        description: $('#pubDesc').value.trim(),
        author: $('#pubAuthor').value.trim() || 'Аноним',
        weapon1: B.w[0],
        weapon2: B.w[1],
        build_json: B,
        gs: Math.round(gs)
      };
      $('#pubOkBtn').disabled = true;
      $('#pubStatus').textContent = 'Публикуется…';
      fetch('../api/user_builds.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            $('#pubStatus').innerHTML = 'Опубликовано! <a href="../builds/?user=1" target="_blank">Открыть в каталоге</a>';
            $('#pubOkBtn').disabled = false;
          } else {
            $('#pubStatus').textContent = 'Ошибка: ' + (data.error || 'неизвестная ошибка');
            $('#pubOkBtn').disabled = false;
          }
        })
        .catch(() => { $('#pubStatus').textContent = 'Ошибка соединения'; $('#pubOkBtn').disabled = false; });
    };
  }
  $('#exportBtn').onclick = () => { const u = shareUrl(); $('#exText').value = exportText(); $('#exLink').value = u; $('#exEmbed').value = `<iframe src="${u}" width="100%" height="900" style="border:0" title="${(B.name || 'Билд').replace(/"/g, '')} — конструктор T2-билдов" loading="lazy"></iframe>`; $('#exportDlg').showModal(); };
  $('#exCopyText').onclick = () => navigator.clipboard.writeText($('#exText').value).then(() => toast('Текст скопирован'));
  $('#exCopyEmbed').onclick = () => navigator.clipboard.writeText($('#exEmbed').value).then(() => toast('Код скопирован'));
  $('#pickSearch').oninput = renderPick; $('#pickGrade').onchange = renderPick;
  if ($('#afxPickSearch')) { $('#afxPickSearch').oninput = renderAfxPick; }
  if ($('#afxPicker')) { $('#afxPicker').addEventListener('close', () => { _afxPickSlot = null; }); }
  if ($('#runePicker')) {
    $('#runePicker').addEventListener('close', () => { _runePickSlot = null; _runePickIdx = -1; });
    $('#runePickSearch').oninput = renderRunePick;
    $('#runePickCat').onchange = renderRunePick;
  }
  // лоадауты
  _activeLoadout = store.get('t2calc-active-loadout', 0);
  $$('.loadout-btn').forEach((btn, i) => { btn.onclick = () => loadLoadout(i); });
  [['#dTime', 'time']].forEach(([s, k]) => { $(s).oninput = e => { B.dps[k] = +e.target.value || 0; renderDps(compute(B)); save(); }; });
  const h = location.hash.match(/#b=(.+)/);
  if (h) { try { load(dec(h[1])); history.replaceState(null, '', location.pathname); renderSaved(); return; } catch (e) { toast('Не удалось открыть ссылку'); } }
  const all = store.get('t2calc-loadouts', [null, null, null]);
  const cur = all[_activeLoadout] || store.get('t2calc-current', null);
  if (cur) load(cur); else if (presets[0]) load(presets[0]); else load(blank());
  renderSaved();
  renderLoadoutTabs();
}
function pruneSkills() {
  const ok = id => { const s = bySk.get(id); return s && B.w.includes(s.w); };
  B.sk.a = B.sk.a.filter(ok); B.sk.p = B.sk.p.filter(ok); if (B.sk.d && !ok(B.sk.d)) B.sk.d = null;
  for (const id of Object.keys(B.sk.sp)) if (!ok(id)) delete B.sk.sp[id];
}
init().catch(e => { console.error(e); toast('Не удалось загрузить данные. Обновите страницу.'); });
