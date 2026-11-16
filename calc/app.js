'use strict';
/* Конструктор T2-билдов для всех классов. Данные: ../data/ (tl-build.ru + build.tlwg.ru, с разрешения). */
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

let ITEMS = [], byId = new Map(), SK = [], bySk = new Map(), STAT_KEYS = [];
let B = blank();

function blank() {
  return { v: 2, name: '', w: ['Staff', 'Dagger'], equip: {}, attr: { Str: 10, Dex: 10, Int: 10, Per: 10, Con: 10 }, bonus: [],
    sk: { a: [], p: [], d: null, lv: {}, sp: {} }, dps: { time: 60, crit: 30, critDmg: 50, heavy: 15 } };
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
  const activeSets = [];
  for (const [name, n] of sets) {
    const it = setItem.get(name);
    for (const bn of it.sb) if (bn.p <= n) { for (const [k, v] of Object.entries(bn.s)) add(s, k === 'base_damage' ? 'bonus_attack_power_main_hand' : k, v); activeSets.push({ name, p: bn.p, n, t: bn.t || '', s: bn.s }); }
  }
  // пассивные умения с бонусами к характеристикам
  for (const id of b.sk.p) { const sk = bySk.get(id); if (sk && sk.st) for (const x of sk.st) add(s, x.key, (x.levels || [])[(b.sk.lv[id] || 15) - 1] ?? x.value); }
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
  const mult = (1 + (d.crit / 100) * (d.critDmg / 100)) * (1 + d.heavy / 100);
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
  while (t < T) {
    const r = list.find(x => x.ready <= t);
    if (r) { r.casts++; r.total += r.dmg; r.ready = t + r.cd; t += r.ct; continue; }
    const next = Math.min(...list.map(x => x.ready), Infinity);
    if (next - t >= swing || !list.length) { auto += avg * mult; autoN++; t += swing; } else t = next;
  }
  const total = list.reduce((a, x) => a + x.total, 0) + auto;
  return { T, total, dps: total / T, list, auto, autoN, avg, swing, cdr, skipped: B.sk.a.filter(id => { const sk = bySk.get(id); return sk && sk.cat !== 'Basic' && !list.find(x => x.id === id); }).length };
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
  out.append(kv('Урон за ' + r.T + ' с', nf(Math.round(r.total))), kv('Средний базовый урон', nf(Math.round(r.avg))), kv('Перезарядка умений', '÷ ' + r.cdr.toFixed(2)), kv('Автоатака раз в', r.swing.toFixed(2) + ' с'));
  const rows = [...r.list.filter(x => x.casts).sort((a, b) => b.total - a.total).map(x => [x.n, x.casts, x.total]), ['Автоатаки', r.autoN, r.auto]];
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
  if (it.rs) body.append(el('p', 'hint', `Гнёзд для рун: ${it.rs}. Бонусы рун добавьте в «Доп. бонусах».`));
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
function save() { store.set('t2calc-current', B); }
function update(full = true) {
  const R = compute(B);
  if (full) { renderSlots(); renderBonuses(); }
  renderAttrs(R); renderSummary(R); renderDps(R); save();
  if (!full) renderSlots();
}
function enc(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(s)))); }
const shareUrl = () => location.origin + location.pathname + '#b=' + enc(B);
function load(o) {
  B = normalize(o);
  fillWeapons(); $('#buildName').value = B.name || '';
  ['time', 'crit', 'critDmg', 'heavy'].forEach(k => { $('#d' + k[0].toUpperCase() + k.slice(1)).value = B.dps[k]; });
  update(); renderSkills();
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
  const [items, skills] = await Promise.all([fetch(DATA + 'items.json').then(r => r.json()), fetch(DATA + 'skills.json').then(r => r.json())]);
  ITEMS = items; SK = skills;
  ITEMS.forEach(it => { byId.set(it.id, it); it._gs = itemCP(it, it.mx, [], false); it._q = [it.n, it.set || '', ...Object.keys({ ...it.b, ...it.x }).map(lab), ...it.tr.map(t => lab((META.traits[t] || {}).s))].join(' ').toLowerCase(); });
  SK.forEach(s => bySk.set(s.id, s));
  STAT_KEYS = Object.keys(META.labels).filter(k => !/^(adjust_|gathering_|dash_|glide_|swim_|earn_|spend_|additional_|pv_p_|aggro_|aura_|polymorph_)/.test(k)).filter(k => !/_immune$/.test(k)).sort((a, b) => lab(a).localeCompare(lab(b), 'ru'));
  const pg = $('#pickGrade'); GRADE_ORDER.forEach(g => { const o = el('option', null, GRADE_RU[g] || g); o.value = g; pg.append(o); });
  const presets = await fetch('presets.json').then(r => r.ok ? r.json() : []).catch(() => []);
  presets.forEach((p, i) => { const o = el('option', null, p.name); o.value = i; $('#presetSel').append(o); });
  $('#presetSel').onchange = e => { const p = presets[+e.target.value]; if (p) { load(p); toast('Пресет загружен'); } e.target.value = ''; };
  $('#w1Sel').onchange = e => { B.w[0] = e.target.value; delete B.equip.weapon1; pruneSkills(); fillWeapons(); update(); renderSkills(); };
  $('#w2Sel').onchange = e => { B.w[1] = e.target.value; delete B.equip.weapon2; pruneSkills(); fillWeapons(); update(); renderSkills(); };
  $('#buildName').oninput = e => { B.name = e.target.value; save(); };
  $('#newBtn').onclick = () => { if (confirm('Очистить текущую сборку?')) { load(blank()); } };
  $('#addBonus').onclick = () => { B.bonus.push({ src: 'Руна', stat: '', val: '' }); update(); };
  $('#saveBtn').onclick = () => { const list = store.get('t2calc-saved', []); const name = B.name || prompt('Название сборки:', 'Мой билд'); if (!name) return; B.name = name; $('#buildName').value = name; list.push(JSON.parse(JSON.stringify(B))); store.set('t2calc-saved', list); renderSaved(); toast('Сохранено'); };
  $('#shareBtn').onclick = () => { const u = shareUrl(); navigator.clipboard.writeText(u).then(() => toast('Ссылка скопирована'), () => prompt('Ссылка на сборку:', u)); };
  $('#exportBtn').onclick = () => { const u = shareUrl(); $('#exText').value = exportText(); $('#exLink').value = u; $('#exEmbed').value = `<iframe src="${u}" width="100%" height="900" style="border:0" title="${(B.name || 'Билд').replace(/"/g, '')} — конструктор T2-билдов" loading="lazy"></iframe>`; $('#exportDlg').showModal(); };
  $('#exCopyText').onclick = () => navigator.clipboard.writeText($('#exText').value).then(() => toast('Текст скопирован'));
  $('#exCopyEmbed').onclick = () => navigator.clipboard.writeText($('#exEmbed').value).then(() => toast('Код скопирован'));
  $('#pickSearch').oninput = renderPick; $('#pickGrade').onchange = renderPick;
  [['#dTime', 'time'], ['#dCrit', 'crit'], ['#dCritDmg', 'critDmg'], ['#dHeavy', 'heavy']].forEach(([s, k]) => { $(s).oninput = e => { B.dps[k] = +e.target.value || 0; renderDps(compute(B)); save(); }; });
  const h = location.hash.match(/#b=(.+)/);
  if (h) { try { load(dec(h[1])); history.replaceState(null, '', location.pathname); renderSaved(); return; } catch (e) { toast('Не удалось открыть ссылку'); } }
  const cur = store.get('t2calc-current', null);
  if (cur) load(cur); else if (presets[0]) load(presets[0]); else load(blank());
  renderSaved();
}
function pruneSkills() {
  const ok = id => { const s = bySk.get(id); return s && B.w.includes(s.w); };
  B.sk.a = B.sk.a.filter(ok); B.sk.p = B.sk.p.filter(ok); if (B.sk.d && !ok(B.sk.d)) B.sk.d = null;
  for (const id of Object.keys(B.sk.sp)) if (!ok(id)) delete B.sk.sp[id];
}
init().catch(e => { console.error(e); toast('Не удалось загрузить данные. Обновите страницу.'); });
