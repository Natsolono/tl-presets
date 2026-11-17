'use strict';
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1800); };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно — не страшно */ } }
};

const WEAPONS = ['Sword', 'Sword2h', 'Dagger', 'Bow', 'Crossbow', 'Staff', 'Wand', 'Spear'];
const W_RU = { Sword: 'Меч и щит', Sword2h: 'Двуручный меч', Dagger: 'Кинжалы', Bow: 'Длинный лук', Crossbow: 'Арбалеты', Staff: 'Посох', Wand: 'Жезл', Spear: 'Копьё', Orb: 'Сфера' };
const ROLES = [['', 'Все'], ['dps', 'Урон'], ['tank', 'Танк'], ['support', 'Поддержка']];
const MODES = [['', 'Все'], ['pve', 'PvE'], ['pvp', 'PvP'], ['mixed', 'PvE + PvP']];
const ROLE_RU = { dps: 'Урон', tank: 'Танк', support: 'Поддержка' };
const MODE_RU = { pve: 'PvE', pvp: 'PvP', mixed: 'PvE + PvP' };
const SLOT_RU = { weapon1: 'Оружие 1', weapon2: 'Оружие 2', head: 'Шлем', chest: 'Нагрудник', hands: 'Перчатки', legs: 'Поножи', feet: 'Сапоги', cloak: 'Плащ', necklace: 'Ожерелье', earring: 'Серьга', ring1: 'Кольцо 1', ring2: 'Кольцо 2', bracelet: 'Браслет', belt: 'Пояс' };
const SLOT_ORDER = Object.keys(SLOT_RU);
const ATTR = [['Str', 'Сила'], ['Dex', 'Ловкость'], ['Int', 'Мудрость'], ['Per', 'Восприятие'], ['Con', 'Стойкость']];
const MS_W = { SW2: 'Двуручный меч', SP: 'Копьё', DA: 'Кинжалы', BO: 'Длинный лук', ST: 'Посох', WA_GR: 'Жезл', SW_SH: 'Меч и щит', CR: 'Арбалеты', OR: 'Сфера' };
const MS_TIER = { Normal: 'Обычный', High: 'Высший', Rare: 'Редкий', Hero: 'Героический' };
const MS_TYPE = { Attack: 'атака', Defense: 'защита', Def: 'защита', Util: 'польза', Tactic: 'тактика', Tac: 'тактика', TacticAttack: 'тактика + атака', AttackUtil: 'атака + польза', UtilDefense: 'польза + защита', DefenseTactic: 'защита + тактика' };
const RUNE_RU = { Attack: 'атаки', Defense: 'защиты', All: 'универсальная', Assist: 'поддержки' };
const PAGE = 48;

let CAT = [], D = null, view = [], shown = 0;
const F = Object.assign({ q: '', w: [], role: '', mode: '', sort: 'top' }, store.get('tlb-filters', {})); delete F.calc;

/* ---------- форматирование ---------- */
const nf = n => Number(n || 0).toLocaleString('ru-RU');
const lab = k => (D && D.labels[k]) || humanStat(k);
function humanStat(k) { return String(k || '').replace(/^october:earring-trait:/, '').replace(/_/g, ' '); }
function fmtVal(k, raw) {
  if (raw == null) return '';
  const f = (D && D.fmt[k]) || { mul: 1, suffix: '' };
  const v = raw * (f.mul || 1);
  const r = Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : Math.round(v * 10) / 10;
  return (f.sign && r > 0 ? '+' : '') + r.toLocaleString('ru-RU') + (f.suffix || '');
}
function icon(name, alt, small) {
  if (!name) { const s = el('span', 'ic miss' + (small ? ' sm' : ''), '?'); s.setAttribute('aria-hidden', 'true'); return s; }
  const i = el('img', 'ic' + (small ? ' sm' : '')); i.loading = 'lazy'; i.alt = alt || ''; i.src = '../data/ic/' + name;
  i.onerror = () => { const s = el('span', 'ic miss' + (small ? ' sm' : ''), '?'); i.replaceWith(s); };
  return i;
}
const clsName = w => w.map(x => W_RU[x] || x).join(' + ');
const traitStat = t => (D.traits[t]) || (String(t).includes(':') ? String(t).split(':').pop() : null);
function msNode(id) {
  const m = String(id).match(/^([A-Za-z0-9]+?)_(Normal|High|Rare|Hero)_([A-Za-z]+?)(?:_Skill)?_(\d+)$/);
  if (!m) return String(id).replace(/_/g, ' ');
  const skill = /_Skill_\d+$/.test(id);
  return `${MS_TIER[m[2]] || m[2]} · ${MS_TYPE[m[3]] || m[3]}${skill ? ' (умение)' : ''} №${+m[4]}`;
}

/* ---------- список ---------- */
function filtersUI() {
  const wbox = $('#weapons'); wbox.innerHTML = '';
  WEAPONS.forEach(w => {
    const b = el('button', 'chip', W_RU[w]); b.type = 'button'; b.dataset.w = w;
    b.onclick = () => { const i = F.w.indexOf(w); if (i >= 0) F.w.splice(i, 1); else if (F.w.length < 2) F.w.push(w); apply(); };
    wbox.append(b);
  });
  const seg = (box, list, key) => { box.innerHTML = ''; list.forEach(([v, t]) => { const b = el('button', 'seg-b', t); b.type = 'button'; b.dataset.v = v; b.onclick = () => { F[key] = v; apply(); }; box.append(b); }); };
  seg($('#role'), ROLES, 'role'); seg($('#mode'), MODES, 'mode');
  let qt; $('#q').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { F.q = e.target.value; apply(); }, 150); };
  $('#sort').onchange = e => { F.sort = e.target.value; apply(); };
  $('#reset').onclick = () => { Object.assign(F, { q: '', w: [], role: '', mode: '', sort: 'top' }); apply(); };
  $('#moreBtn').onclick = () => renderMore();
}
function syncUI() {
  $('#q').value = F.q; $('#sort').value = F.sort;
  document.querySelectorAll('#weapons .chip').forEach(b => { const on = F.w.includes(b.dataset.w); b.setAttribute('aria-pressed', on); b.disabled = !on && F.w.length >= 2; });
  document.querySelectorAll('#role button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === F.role));
  document.querySelectorAll('#mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === F.mode));
}
function apply() {
  store.set('tlb-filters', F); syncUI();
  const q = F.q.trim().toLowerCase();
  view = CAT.filter(b => (!q || b.n.toLowerCase().includes(q) || b.a.toLowerCase().includes(q) || b.cls.includes(q))
    && F.w.every(w => b.w.includes(w)) && (!F.role || b.role === F.role) && (!F.mode || b.mode === F.mode));
  const by = { top: (a, b) => b.score - a.score || b.v - a.v, views: (a, b) => b.v - a.v, new: (a, b) => (b.d || '').localeCompare(a.d || '') || b.id - a.id, rating: (a, b) => b.rt - a.rt || b.rc - a.rc };
  view.sort(by[F.sort] || by.top);
  $('#count').textContent = view.length ? `Найдено: ${nf(view.length)}` : 'Ничего не найдено'; $('#siteQ').value = F.q;
  $('#grid').innerHTML = ''; shown = 0; renderMore();
}
function card(b) {
  const a = el('a', 'card'); a.href = '#' + b.id; a.dataset.id = b.id;
  const th = el('div', 'thumb');
  if (b.img) { const i = el('img'); i.loading = 'lazy'; i.alt = ''; i.src = 'img/' + b.id + '.webp'; i.onerror = () => i.replaceWith(el('div', 'ph', clsName(b.w))); th.append(i); }
  else th.append(el('div', 'ph', clsName(b.w)));
  const body = el('div', 'c-body');
  body.append(el('div', 'c-title', b.n || 'Без названия'), el('div', 'c-cls', clsName(b.w)));
  const bd = el('div', 'badges');
  if (b.user) {
    bd.append(el('span', 'bdg bdg-user', 'Пользователь'));
    if (b.gs) bd.append(el('span', 'bdg', 'GS ' + nf(b.gs)));
  } else {
    if (b.role) bd.append(el('span', 'bdg r-' + b.role, ROLE_RU[b.role] || b.role));
    if (b.mode) bd.append(el('span', 'bdg', MODE_RU[b.mode] || b.mode));
    if (b.lo > 1) bd.append(el('span', 'bdg', b.lo + ' варианта'));
  }
  body.append(bd);
  const m = el('div', 'c-meta');
  if (b.user) {
    m.append(el('span', null, '👍 ' + nf(b.rc)), el('span', null, b.a || 'аноним'));
  } else {
    const s1 = el('span'); s1.append('★ ', el('b', null, b.rt ? b.rt.toFixed(1) : '—'), b.rc ? ` (${b.rc})` : ''); m.append(s1);
    m.append(el('span', null, '👁 ' + nf(b.v)), el('span', null, b.a || 'аноним'));
  }
  body.append(m); a.append(th, body); return a;
}
function renderMore() {
  const g = $('#grid');
  if (!view.length) { g.append(el('div', 'empty', 'Под эти фильтры билдов нет. Попробуйте убрать оружие или роль.')); $('#moreBtn').hidden = true; return; }
  const frag = document.createDocumentFragment();
  view.slice(shown, shown + PAGE).forEach(b => frag.append(card(b)));
  g.append(frag); shown = Math.min(view.length, shown + PAGE);
  $('#moreBtn').hidden = shown >= view.length;
  $('#moreBtn').textContent = `Показать ещё (${nf(view.length - shown)})`;
}

/* ---------- билд ---------- */
async function loadDict() { if (!D) D = await (await fetch('dict.json')).json(); }
function section(title, extra) {
  const p = el('section', 'panel'); const h = el('div', 'panel-h'); h.append(el('h2', null, title)); if (extra) h.append(extra); p.append(h); return p;
}
function itemCard(e) {
  const it = D.items[e.id] || {};
  const c = el('div', 'it');
  c.append(icon(it.ic, it.n));
  const info = el('div'); info.append(el('div', 'sl', SLOT_RU[e.s] || e.s));
  const nm = el('div', 'nm ' + (it.g ? 'g-' + it.g : ''), it.n || e.id);
  if (e.e) nm.append(el('span', 'en', '+' + e.e));
  info.append(nm); c.append(info);
  const ul = el('ul');
  (e.t || []).forEach(([t, lv]) => { const li = el('li'); li.append(el('span', null, lab(traitStat(t))), el('span', null, lv ? 'ур. ' + lv : '')); ul.append(li); });
  if (e.r) { const li = el('li', 'res'); li.append(el('span', null, 'Резонанс: ' + (e.r === 1 ? 'открыт' : lab(e.r))), el('span')); ul.append(li); }
  (e.rnd || []).forEach(k => { const li = el('li', 'rnd'); li.append(el('span', null, lab(k)), el('span', null, 'доп. стат')); ul.append(li); });
  (e.ru || []).forEach(([type, grade, st, lv]) => { const li = el('li', 'rune'); li.append(el('span', null, lab(st)), el('span', null, `руна ${RUNE_RU[type] || type || ''} ${grade || ''}${lv ? ' · ур. ' + lv : ''}`.trim())); ul.append(li); });
  if (it.set) { const li = el('li'); li.append(el('span', 'muted', it.set.replace(/^Комплект /, 'Комплект: ')), el('span')); ul.append(li); }
  if (ul.children.length) c.append(ul);
  return c;
}
function skillCard([id, lv, specs]) {
  const s = D.skills[id] || {};
  const c = el('div', 'sk');
  c.append(icon(s.ic, s.n));
  const info = el('div'); info.append(el('div', 'nm', s.n || id));
  const meta = []; if (lv) meta.push('ур. ' + lv); if (s.cd) meta.push('перезарядка ' + s.cd + ' с'); if (s.w) meta.push(W_RU[s.w] || s.w);
  info.append(el('div', 'lv', meta.join(' · '))); c.append(info);
  if (specs && specs.length) {
    const box = el('div', 'specs');
    specs.forEach(sp => { const d = D.specs[sp] || {}; const t = el('span', 'spec'); t.append(icon(d.ic, '', true), document.createTextNode(d.n || sp.replace(/^SkillSet_/, ''))); box.append(t); });
    c.append(box);
  }
  const sd = (specs || []).map(sp => D.specs[sp]).filter(d => d && d.d);
  if (s.d || sd.length) {
    const det = el('details', 'sk-d'); det.append(el('summary', null, 'Описание'));
    if (s.d) det.append(el('p', null, s.d));
    sd.forEach(d => { const p = el('p'); p.append(el('b', null, d.n + ': '), document.createTextNode(d.d)); det.append(p); });
    c.append(det);
  }
  return c;
}
function renderLoadout(box, b, lo) {
  box.innerHTML = '';
  const g = el('div', 'sec-grid'); const left = el('div'); const right = el('div');
  // снаряжение
  const eq = [...lo.eq].sort((x, y) => SLOT_ORDER.indexOf(x.s) - SLOT_ORDER.indexOf(y.s));
  const s1 = section('Снаряжение', el('span', 'pill', eq.length + ' предметов'));
  const eg = el('div', 'eq'); eq.forEach(e => eg.append(itemCard(e))); s1.append(eg); left.append(s1);
  // умения
  const s2 = section('Умения');
  const parts = [['Активные', lo.act], ['Пассивные', lo.pas], ['Защитное', lo.def ? [lo.def] : []]];
  parts.forEach(([t, list]) => { if (!list || !list.length) return; s2.append(el('div', 'sk-h', t)); const gg = el('div', 'skills'); list.forEach(x => gg.append(skillCard(x))); s2.append(gg); });
  s2.append(el('p', 'hint', 'Нажмите «Описание» под умением, чтобы прочитать, что оно делает и как его меняют специализации.'));
  left.append(s2);
  // описание
  if (b.desc) { const s3 = section('Описание от автора'); const d = el('div', 'desc'); d.innerHTML = b.desc; s3.append(d); left.append(s3); wireDescImages(d, b); }
  // характеристики
  const s4 = section('Характеристики', lo.lvl ? el('span', 'pill', 'уровень ' + lo.lvl) : null);
  const ab = el('div', 'attr-bars');
  const mx = Math.max(40, ...ATTR.map(([k]) => +(lo.attr[k] || 0)));
  ATTR.forEach(([k, t]) => { const v = +(lo.attr[k] || 0); const r = el('div', 'ab'); const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(v / mx * 100) + '%'; bar.append(i); r.append(el('span', null, t), bar, el('b', null, v || '—')); ab.append(r); });
  s4.append(ab); right.append(s4);
  // артефакты
  if (lo.art && lo.art.length) {
    const s5 = section('Артефакты'); const ag = el('div', 'art');
    lo.art.forEach(([slot, id, stats]) => {
      const a = (D.arts || {})[id] || {}; const c = el('div', 'it');
      const kind = /^gem/.test(slot) ? 'Самоцвет' : 'Талирит';
      c.append(icon(a.ic, a.n));
      const info = el('div'); info.append(el('div', 'sl', kind + ' ' + (slot.match(/\d+$/) || [''])[0]), el('div', 'nm ' + (a.g ? 'g-' + a.g : ''), a.n || id));
      c.append(info);
      if (stats.length) { const ul = el('ul'); stats.forEach(([k, v]) => { const li = el('li'); li.append(el('span', null, lab(k)), el('span', null, fmtVal(k, v))); ul.append(li); }); c.append(ul); }
      ag.append(c);
    });
    s5.append(ag); right.append(s5);
  }
  // мастерство
  const msNodeMap = lo.ms || {};
  const msWepLvls = lo.msw || {};
  const msCommon = (lo.msc || []).filter(Boolean);
  const msWepKeys = Object.keys(msNodeMap).filter(wk => Object.keys(msNodeMap[wk]).length > 0);
  if (lo.msl != null || msWepKeys.length || msCommon.length) {
    const s6 = section('Мастерство владения оружием', lo.msl ? el('span', 'pill', 'уровень ' + lo.msl) : null);
    if (!msWepKeys.length && !msCommon.length) {
      s6.append(el('p', 'ms-empty', 'Автор пока не вложил очки в T2-мастерство этим оружием.'));
    } else {
      const TIER_ORDER = ['Normal', 'High', 'Rare', 'Hero'];
      const TIER_RU = { Normal: 'Обычный', High: 'Высший', Rare: 'Редкий', Hero: 'Героический' };
      const TIER_CLS = { Normal: 'tn', High: 'th', Rare: 'tr', Hero: 'thr' };
      msWepKeys.forEach(wk => {
        const nodeList = msNodeMap[wk];
        const wName = (D.mw || {})[wk] || MS_W[wk] || wk;
        const wLv = msWepLvls[wk];
        const wb = el('div', 'ms-weapon');
        const wh = el('div', 'ms-whead');
        wh.append(el('b', null, wName));
        if (wLv != null) wh.append(el('span', 'bdg', 'мастерство ' + wLv));
        wb.append(wh);
        const byTier = {};
        Object.entries(nodeList).forEach(([id, lv]) => {
          const m = String(id).match(/^[A-Za-z0-9]+?_(Normal|High|Rare|Hero)_/);
          const tier = m ? m[1] : 'Normal';
          (byTier[tier] || (byTier[tier] = [])).push({ id, lv });
        });
        TIER_ORDER.forEach(tier => {
          if (!byTier[tier]) return;
          const td = el('div', 'ms-tier');
          td.append(el('div', 'ms-tier-h ' + (TIER_CLS[tier] || ''), TIER_RU[tier] || tier));
          const grid = el('div', 'ms-grid');
          byTier[tier].forEach(({ id, lv }) => {
            const nd = (D.ms || {})[id] || {};
            const chip = el('div', 'ms-node');
            if (nd.cat) chip.title = nd.cat;
            chip.append(icon(nd.ic, '', true));
            const nfo = el('div', 'ms-ninfo');
            nfo.append(el('span', 'ms-nname', nd.n || msNode(id)));
            nfo.append(el('span', 'ms-nlv muted', 'ур. ' + lv + (nd.max ? '/' + nd.max : '')));
            chip.append(nfo);
            grid.append(chip);
          });
          td.append(grid); wb.append(td);
        });
        s6.append(wb);
      });
      if (msCommon.length) {
        const cb = el('div', 'ms-weapon');
        cb.append(el('div', 'ms-whead', 'Общие умения мастерства'));
        const grid = el('div', 'ms-grid');
        msCommon.forEach(x => {
          const c = (D.msc || {})[x] || {};
          const chip = el('div', 'ms-node ms-node-wide');
          chip.append(icon(c.ic, '', true));
          const nfo = el('div', 'ms-ninfo');
          nfo.append(el('b', 'ms-nname', c.n || x));
          if (c.t) nfo.append(el('span', 'ms-ndesc muted', c.t));
          chip.append(nfo);
          grid.append(chip);
        });
        cb.append(grid); s6.append(cb);
      }
    }
    right.append(s6);
  }
  g.append(left, right); box.append(g);
}
let lastScroll = 0, lastId = null;
async function showBuild(id, loIdx) {
  if (!$('#listView').hidden) { lastScroll = window.scrollY; }
  lastId = id;
  $('#listView').hidden = true; const v = $('#buildView'); v.hidden = false;
  v.innerHTML = ''; v.append(el('div', 'loading', 'Загружаю билд…')); window.scrollTo(0, 0);
  let b;
  try { await loadDict(); const r = await fetch('../api/build.php?id=' + id); if (!r.ok) throw 0; b = await r.json(); }
  catch (e) { v.innerHTML = ''; v.append(backBtn(), el('p', 'empty', 'Билд не найден.')); return; }
  document.title = (b.n || 'Билд') + ' · T2 Билды';
  v.innerHTML = ''; v.append(backBtn()); GAL = [];
  const hero = el('section', 'hero panel');
  const l = el('div');
  const h1 = el('h1', null, b.n || 'Без названия'); h1.tabIndex = -1; l.append(h1);
  l.append(el('div', 'sub', `${clsName(b.w)} · автор ${b.a || 'аноним'}${b.d ? ' · ' + new Date(b.d + 'T12:00:00').toLocaleDateString('ru-RU') : ''}`));
  const bd = el('div', 'badges');
  if (b.role) bd.append(el('span', 'bdg r-' + b.role, ROLE_RU[b.role] || b.role));
  if (b.mode) bd.append(el('span', 'bdg', MODE_RU[b.mode] || b.mode));
  l.append(bd);
  const sr = el('div', 'stats-row');
  const box = (t, val) => { const x = el('div', 'stat-box'); x.append(el('small', null, t), el('b', null, val)); return x; };
  sr.append(box('Оценка', b.rt ? `★ ${b.rt.toFixed(1)}` : '—'), box('Голосов', nf(b.rc)), box('Просмотров', nf(b.v)), box('Вариантов', b.los.length));
  l.append(sr);
  const act = el('div', 'actions');
  const calcBtn = el('a', 'btn primary', '🧮 Открыть в конструкторе'); calcBtn.hidden = true;
  const share = el('button', 'ghost', '🔗 Скопировать ссылку'); share.type = 'button';
  share.onclick = () => { const u = b.u ? new URL('../' + b.u, location.href).href : location.href; navigator.clipboard.writeText(u).then(() => toast('Ссылка скопирована'), () => prompt('Ссылка на билд:', u)); };
  act.append(calcBtn, share); l.append(act);
  let r;
  if (b.img) {
    r = el('button', 'thumb zoom'); r.type = 'button'; r.setAttribute('aria-label', 'Открыть превью в полном размере');
    const i = el('img'); i.alt = `Превью билда «${b.n || ''}»: ${clsName(b.w)}`; i.src = 'img/' + b.id + '.webp'; i.onerror = () => r.remove(); r.append(i, el('span', 'zoom-ic', '⤢'));
    const k = GAL.push({ src: 'img/full/' + b.id + '.webp', fallback: 'img/' + b.id + '.webp', cap: 'Превью: ' + (b.n || '') }) - 1;
    r.onclick = () => openViewer(k);
  } else { r = el('div', 'thumb'); r.append(el('div', 'ph', 'Превью нет')); }
  hero.append(l, r); v.append(hero);
  const tabs = el('div', 'tabs'); tabs.setAttribute('role', 'tablist');
  const body = el('div');
  const pick = i => {
    const lo = b.los[i] || b.los[0];
    tabs.querySelectorAll('button').forEach((t, k) => t.setAttribute('aria-selected', k === i));
    calcBtn.hidden = !lo.calc; if (lo.calc) calcBtn.href = '../calc/#b=' + lo.calc;
    history.replaceState(null, '', '#' + b.id + (i ? '/' + (i + 1) : ''));
    renderLoadout(body, b, lo);
  };
  if (b.los.length > 1) {
    b.los.forEach((lo, i) => { const t = el('button', 'tab', lo.n || 'Вариант ' + (i + 1)); t.type = 'button'; t.setAttribute('role', 'tab'); t.onclick = () => pick(i); tabs.append(t); });
    v.append(tabs);
  }
  if (!b.los || !b.los.length) { v.append(el('p', 'empty', 'Данные билда повреждены.')); return; }
  v.append(body); pick(Math.min(loIdx || 0, b.los.length - 1));
  v.append(comments(b));
  h1.focus({ preventScroll: true });
}
/* ---------- просмотр картинок в полный размер ---------- */
let GAL = [], gi = 0;
function wireDescImages(box, b) {
  box.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    const k = GAL.push({ src, fallback: src, cap: 'Иллюстрация из описания' }) - 1;
    if (!img.alt) img.alt = 'Иллюстрация из описания билда';
    const btn = el('button', 'zoom inline'); btn.type = 'button'; btn.setAttribute('aria-label', 'Открыть иллюстрацию в полном размере');
    img.replaceWith(btn); btn.append(img); btn.onclick = () => openViewer(k);
  });
}
function openViewer(k) {
  if (!GAL.length) return;
  gi = (k + GAL.length) % GAL.length; const g = GAL[gi]; const im = $('#viewerImg');
  im.onerror = () => { if (im.src.indexOf(g.fallback) < 0) im.src = g.fallback; };
  im.src = g.src; im.alt = g.cap; $('#viewerCap').textContent = g.cap + (GAL.length > 1 ? ` · ${gi + 1} из ${GAL.length}` : '');
  $('#vOpen').href = g.src; $('#vPrev').hidden = $('#vNext').hidden = GAL.length < 2;
  const d = $('#viewer'); if (!d.open) d.showModal();
}
function viewerUI() {
  const d = $('#viewer');
  $('#vClose').onclick = () => d.close();
  $('#vPrev').onclick = () => openViewer(gi - 1); $('#vNext').onclick = () => openViewer(gi + 1);
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') openViewer(gi - 1); if (e.key === 'ArrowRight') openViewer(gi + 1); });
}
/* ---------- комментарии: Giscus (обсуждения GitHub, вход через аккаунт GitHub) ---------- */
const GISCUS = { enabled: true, repo: 'Natsolono/tl-presets', repoId: 'R_kgDOVuSVeg', category: 'Announcements', categoryId: 'DIC_kwDOVuSVes4DLTZD' };
// enabled: true — после установки приложения https://github.com/apps/giscus в репозиторий

const giscusTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark_dimmed' : 'light';
function comments(b) {
  const sec = section('Обсуждение'); const box = el('div', 'giscus');
  sec.append(el('p', 'hint', 'Отзывы и вопросы автору. Чтобы написать, войдите через аккаунт GitHub. Поддерживается форматирование Markdown.'), box);
  const load = async () => {
    if (!GISCUS.enabled) { box.append(el('p', 'hint', 'Комментарии скоро появятся.')); return; }
    const sc = document.createElement('script'); sc.src = 'https://giscus.app/client.js'; sc.async = true; sc.crossOrigin = 'anonymous';
    Object.entries({ 'data-repo': GISCUS.repo, 'data-repo-id': GISCUS.repoId, 'data-category': GISCUS.category, 'data-category-id': GISCUS.categoryId,
      'data-mapping': 'specific', 'data-term': 'Билд ' + b.id + ': ' + (b.n || ''), 'data-strict': '1', 'data-reactions-enabled': '1', 'data-emit-metadata': '0',
      'data-input-position': 'top', 'data-theme': giscusTheme(), 'data-lang': 'ru', 'data-loading': 'lazy' }).forEach(([k, v]) => sc.setAttribute(k, v));
    box.append(sc);
  };
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px' }); io.observe(sec); } else load();
  return sec;
}
new MutationObserver(() => { const f = document.querySelector('iframe.giscus-frame'); if (f) f.contentWindow.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, 'https://giscus.app'); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function backBtn() { const a = el('a', 'btn back', '← Все билды'); a.href = '#'; return a; }
async function showUserBuild(id) {
  if (!$('#listView').hidden) { lastScroll = window.scrollY; }
  lastId = 'u' + id;
  $('#listView').hidden = true; const v = $('#buildView'); v.hidden = false;
  v.innerHTML = ''; v.append(el('div', 'loading', 'Загружаю билд…')); window.scrollTo(0, 0);
  let b;
  try { const r = await fetch('../api/user_build.php?id=' + id); if (!r.ok) throw 0; b = await r.json(); }
  catch (e) { v.innerHTML = ''; v.append(backBtn(), el('p', 'empty', 'Билд не найден.')); return; }
  document.title = (b.name || 'Билд') + ' · T2 Билды';
  v.innerHTML = ''; v.append(backBtn());
  const hero = el('section', 'hero panel');
  const l = el('div');
  const h1 = el('h1', null, b.name || 'Без названия'); h1.tabIndex = -1; l.append(h1);
  const dateStr = b.created_at ? ' · ' + new Date(b.created_at.replace(' ', 'T')).toLocaleDateString('ru-RU') : '';
  l.append(el('div', 'sub', clsName([b.weapon1, b.weapon2]) + ' · автор ' + (b.author || 'аноним') + dateStr));
  const bd = el('div', 'badges');
  bd.append(el('span', 'bdg bdg-user', 'Пользовательский'));
  if (b.gs) bd.append(el('span', 'bdg', 'GS ' + nf(b.gs)));
  l.append(bd);
  const sr = el('div', 'stats-row');
  const statBox = (t, val) => { const x = el('div', 'stat-box'); x.append(el('small', null, t), el('b', null, val)); return x; };
  sr.append(statBox('Голосов', nf(b.votes || 0))); l.append(sr);
  const act = el('div', 'actions');
  let calcHref = '../calc/';
  if (b.build_json) { try { calcHref = '../calc/#b=' + btoa(unescape(encodeURIComponent(JSON.stringify(b.build_json)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch(e) {} }
  const calcBtn = el('a', 'btn primary', '🧮 Открыть в конструкторе'); calcBtn.href = calcHref;
  const voteBtn = el('button', 'ghost', '👍 ' + nf(b.votes || 0)); voteBtn.type = 'button';
  voteBtn.onclick = () => {
    fetch('../api/vote.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id }) })
      .then(r => r.json()).then(d => { voteBtn.textContent = '👍 ' + nf(d.votes); if (d.voted) { voteBtn.disabled = true; toast('Спасибо за голос!'); } else toast('Вы уже голосовали'); })
      .catch(() => toast('Ошибка соединения'));
  };
  const share = el('button', 'ghost', '🔗 Ссылка'); share.type = 'button';
  share.onclick = () => navigator.clipboard.writeText(location.href).then(() => toast('Ссылка скопирована'), () => prompt('Ссылка:', location.href));
  act.append(calcBtn, voteBtn, share); l.append(act);
  const thumb = el('div', 'thumb'); thumb.append(el('div', 'ph', clsName([b.weapon1, b.weapon2])));
  hero.append(l, thumb); v.append(hero);
  if (b.description) { const s = section('Описание от автора'); const d = el('div', 'desc'); d.textContent = b.description; s.append(d); v.append(s); }
  h1.focus({ preventScroll: true });
}
function route() {
  let m;
  if ((m = location.hash.match(/^#u(\d+)/))) return showUserBuild(+m[1]);
  if ((m = location.hash.match(/^#(\d+)(?:\/(\d+))?/))) return showBuild(m[1], m[2] ? +m[2] - 1 : 0);
  document.title = 'Каталог билдов · T2 Билды';
  const wasBuild = !$('#buildView').hidden;
  $('#buildView').hidden = true; $('#listView').hidden = false;
  if (wasBuild) { window.scrollTo(0, lastScroll); const c = lastId && document.querySelector(`.card[data-id="${lastId}"]`); if (c) c.focus({ preventScroll: true }); }
}

async function init() {
  const qp = new URLSearchParams(location.search).get('q');
  if (qp != null) { Object.assign(F, { q: qp, w: [], role: '', mode: '' }); history.replaceState(null, '', location.pathname + location.hash); }
  $('.site-search').addEventListener('submit', e => { e.preventDefault(); F.q = $('#siteQ').value; if (location.hash) location.hash = ''; apply(); $('#grid').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  filtersUI(); viewerUI();
  const c = await (await fetch('../api/builds.php')).json();
  const tlBuilds = c.items.map(b => Object.assign(b, { score: b.rt * Math.min(b.rc, 20) + Math.log10(1 + b.v), cls: (clsName(b.w) + ' ' + b.w.join(' ')).toLowerCase() }));
  let userBuilds = [];
  try {
    const ur = await fetch('../api/user_builds.php?limit=200&sort=votes');
    const ud = await ur.json();
    userBuilds = (ud.builds || []).map(function(b) {
      return { id: 'u' + b.id, _uid: b.id, n: b.name, a: b.author || 'Аноним', w: [b.weapon1, b.weapon2],
        role: '', mode: '', v: 0, rt: 0, rc: b.votes || 0, gs: b.gs || 0, d: (b.created_at || '').slice(0, 10),
        img: false, lo: 0, los: [], score: (b.votes || 0) * 2, user: true,
        cls: (clsName([b.weapon1, b.weapon2]) + ' ' + b.weapon1 + ' ' + b.weapon2).toLowerCase() };
    });
  } catch(e) {}
  CAT = tlBuilds.concat(userBuilds);
  const totalStr = userBuilds.length ? `, пользовательских: ${nf(userBuilds.length)}` : '';
  $('#built').textContent = `Обновлено ${new Date(c.built).toLocaleDateString('ru-RU')}, билдов: ${nf(tlBuilds.length)}${totalStr}.`;
  apply();
  window.addEventListener('hashchange', route); route();
}
init().catch(e => { console.error(e); $('#grid').append(el('div', 'empty', 'Не удалось загрузить каталог. Обновите страницу.')); });
