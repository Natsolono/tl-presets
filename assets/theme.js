/* Тема: подключается в <head> БЕЗ defer — применяет тему до отрисовки (без вспышки белого).
   Режимы: light | dark | system. Выбор хранится в localStorage («tl-theme»). */
(function () {
  var KEY = 'tl-theme', root = document.documentElement, mq = window.matchMedia('(prefers-color-scheme: dark)');
  function read() {
    var m = null;
    try { m = localStorage.getItem(KEY); if (!m) { var old = localStorage.getItem('t2calc-theme'); if (old) m = JSON.parse(old); } } catch (e) {}
    return m === 'light' || m === 'dark' ? m : 'system';
  }
  function syncMeta() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) meta.content = bg;
  }
  function apply(mode, animate) {
    var dark = mode === 'dark' || (mode === 'system' && mq.matches);
    if (animate) { root.classList.add('theme-anim'); clearTimeout(apply.t); apply.t = setTimeout(function () { root.classList.remove('theme-anim'); }, 260); }
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themeMode = mode;
    if (document.readyState !== 'loading') syncMeta();
    var btns = document.querySelectorAll('.theme-switch button');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.mode === mode ? 'true' : 'false');
  }
  var mode = read();
  apply(mode, false);
  mq.addEventListener && mq.addEventListener('change', function () { if (read() === 'system') apply('system', true); });

  var ICON = {
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  var LABEL = { light: 'Светлая тема', system: 'Как в системе', dark: 'Тёмная тема' };
  function mount() {
    var boxes = document.querySelectorAll('[data-theme-switch]');
    for (var b = 0; b < boxes.length; b++) {
      var box = boxes[b]; box.className = 'theme-switch'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Тема оформления'); box.innerHTML = '';
      ['light', 'system', 'dark'].forEach(function (m) {
        var btn = document.createElement('button'); btn.type = 'button'; btn.dataset.mode = m;
        btn.title = LABEL[m]; btn.setAttribute('aria-label', LABEL[m]); btn.innerHTML = ICON[m];
        btn.addEventListener('click', function () { try { localStorage.setItem(KEY, m); localStorage.removeItem('t2calc-theme'); } catch (e) {} apply(m, true); });
        box.appendChild(btn);
      });
    }
    apply(read(), false); syncMeta();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.TLTheme = { apply: apply, read: read };
})();
