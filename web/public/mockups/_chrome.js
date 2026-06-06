/* Shared behavior for the audience cuts (theme switch, split-flap, odometer,
   sparkline). The interviewer cut keeps its own inline copy; the other three
   include this. Throwaway-mockup helpers — small and dependency-free. */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__voyReduce = reduce;

  /* split-flap: render any .flap[data-flap] as individual flap cells */
  document.querySelectorAll('.flap[data-flap]').forEach(el => {
    const txt = el.getAttribute('data-flap');
    el.innerHTML = '';
    for (const ch of txt) { const b = document.createElement('b'); b.textContent = ch; el.appendChild(b); }
  });

  /* odometer count-up (ease-out-quart) on .odo[data-odo] */
  window.__voyCountUp = function (el) {
    const target = +el.getAttribute('data-odo');
    const pre = el.getAttribute('data-prefix') || '';
    const suf = el.getAttribute('data-suffix') || '';
    if (reduce) { el.textContent = pre + target.toLocaleString() + suf; return; }
    const dur = 1100, t0 = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = pre + Math.round(target * e).toLocaleString() + suf;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  };
  function startOdos(delay) { setTimeout(() => document.querySelectorAll('.odo').forEach(window.__voyCountUp), reduce ? 0 : delay); }
  startOdos(700);

  /* sparkline: fill .spark[data-spark="9,14,7,…"] */
  document.querySelectorAll('.spark[data-spark]').forEach(spark => {
    const data = spark.getAttribute('data-spark').split(',').map(Number);
    const max = Math.max(...data);
    data.forEach(v => { const i = document.createElement('i'); i.style.height = (3 + (v / max) * 11) + 'px'; spark.appendChild(i); });
  });

  /* theme switcher */
  const themes = document.getElementById('themes');
  if (themes) {
    const saved = (() => { try { return localStorage.getItem('voy-theme'); } catch (e) { return null; } })() || 'amber';
    function setTheme(name) {
      document.documentElement.dataset.theme = name;
      try { localStorage.setItem('voy-theme', name); } catch (e) {}
      themes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === name)));
    }
    themes.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
    setTheme(saved);
  }
})();
