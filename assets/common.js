/* Общие помощники страниц: DOM, хранилище, форматирование статов, иконки. */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const toast = t => { const e = $('#toast'); if (!e) return; e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1900); };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } }
};
const nf = n => Number(n || 0).toLocaleString('ru-RU');
const W_RU = { Sword: 'Меч и щит', Sword2h: 'Двуручный меч', Dagger: 'Кинжалы', Bow: 'Длинный лук', Crossbow: 'Арбалеты', Staff: 'Посох', Wand: 'Жезл', Spear: 'Копьё', Orb: 'Сфера' };
const WEAPONS = ['Sword', 'Sword2h', 'Dagger', 'Bow', 'Crossbow', 'Staff', 'Wand', 'Spear'];
const GRADE_RU = { Common: 'Обычный', Uncommon: 'Необычный', Rare: 'Редкий', Rare2: 'Редкий T2', Epic: 'Эпический', Epic2: 'Эпический T2', Legendary: 'Легендарный', Heroic: 'Героический' };
const SLOT_RU = { Weapon: 'Оружие', Head: 'Шлем', Chest: 'Нагрудник', Hands: 'Перчатки', Legs: 'Поножи', Feet: 'Сапоги', Cloak: 'Плащ', Cape: 'Плащ', Necklace: 'Ожерелье', Earring: 'Серьга', Ring: 'Кольцо', Bracelet: 'Браслет', Belt: 'Пояс' };
const SRC_RU = { boss: 'Босс', dungeon: 'Подземелье', mob: 'Монстры', box: 'Сундук / коробка', craft: 'Создание', currency: 'Обмен на валюту' };

let META = null;
async function loadMeta(base) { if (!META) META = await (await fetch(base + 'meta.json')).json(); return META; }
const lab = k => (META && META.labels[k]) || String(k || '').replace(/_/g, ' ');
function fmtVal(k, raw) {
  if (raw == null || isNaN(raw)) return '';
  const f = (META && META.fmt[k]) || { mul: 1, suffix: '' };
  const v = raw * (f.mul || 1);
  const r = Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : Math.round(v * 10) / 10;
  return (f.sign && r > 0 ? '+' : '') + r.toLocaleString('ru-RU') + (f.suffix || '');
}
function traitValue(id, lvl) {
  const t = META.traits[id]; if (!t) return 0;
  const c = t.c || []; const l = Math.max(1, Math.min(lvl || 1, c.length || 1));
  return c.length <= 4 ? (c[l - 1] || 0) : (t.b || 0) + (c[l - 1] || 0);
}
/* GS (Combat Power) предмета по шаблону: база + заточка + сумма уровней трейтов + открытый резонанс */
function itemCP(it, ench, traitLevels, resOpen) {
  const t = it && it.cp && META.cp[it.cp]; if (!t) return null;
  const e = t.by_enchant_level || []; const tr = t.by_trait_level || [];
  const sumT = (traitLevels || []).reduce((a, b) => a + (+b || 0), 0);
  return (t.base || 0) + (e[Math.min(ench || 0, e.length - 1)] || 0) + (tr[Math.min(sumT, tr.length - 1)] || 0) + (resOpen ? (t.resonance || 0) : 0);
}
function icon(path, name, alt, cls) {
  const c = 'ic' + (cls ? ' ' + cls : '');
  if (!name) { const s = el('span', c + ' miss', '?'); s.setAttribute('aria-hidden', 'true'); return s; }
  const i = el('img', c); i.loading = 'lazy'; i.alt = alt || ''; i.src = path + name;
  i.onerror = () => { const s = el('span', c + ' miss', '?'); s.setAttribute('aria-hidden', 'true'); i.replaceWith(s); };
  return i;
}
/* значения стата предмета на уровне заточки */
function itemStats(it, ench) {
  const lv = String(ench ?? it.mx); const out = {};
  const add = (k, v) => { if (typeof v === 'number') out[k] = (out[k] || 0) + v; };
  for (const [k, v] of Object.entries(it.b || {})) add(k, v + (((it.be || {})[lv] || {})[k] || 0));
  for (const [k, v] of Object.entries(it.x || {})) add(k, v + (((it.xe || {})[lv] || {})[k] || 0));
  for (const [k, v] of Object.entries((it.be || {})[lv] || {})) if (!(k in (it.b || {}))) add(k, v);
  for (const [k, v] of Object.entries((it.xe || {})[lv] || {})) if (!(k in (it.x || {}))) add(k, v);
  return out;
}
/* строки статов для показа: урон оружия «мин~макс» одной строкой, как в игре */
function statRows(st) {
  const s = { ...st }; const rows = [];
  [['attack_power_main_hand', 'bonus_attack_power_main_hand', 'Базовый урон'], ['attack_power_off_hand', 'bonus_attack_power_off_hand', 'Урон доп. оружия']].forEach(([ap, bn, t]) => {
    if (s[ap] != null || s[bn] != null) { const a = s[ap] || 0, b = s[bn] || 0; rows.push([t, `${nf(b + 1)}~${nf(a + b)}`]); delete s[ap]; delete s[bn]; }
  });
  Object.entries(s).forEach(([k, v]) => rows.push([lab(k), fmtVal(k, v)]));
  return rows;
}
