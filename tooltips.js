// Shared item tooltips: any element with data-tip="Item name" shows a WoW-style box on hover (tap on touch screens).
// Data comes from item-stats.json. Call DSTips.ready(cb) to redraw once the data has loaded.
(function () {
  const css = `.tip{position:fixed;z-index:80;max-width:min(340px,calc(100vw - 24px));background:#0b0d14;border:1px solid #3a3f52;border-radius:6px;padding:10px 12px;box-shadow:0 8px 28px rgba(0,0,0,.6);font-size:.85rem;line-height:1.45;pointer-events:none;color:#f2f2f2;font-weight:400;text-align:left;text-transform:none;letter-spacing:0}
.tip[hidden]{display:none}.tip .tn{font-weight:700;font-size:.95rem;margin-bottom:2px}
.tip .tl{display:flex;justify-content:space-between;gap:16px}
.tip .c-chalk{color:#f2f2f2}.tip .c-q2{color:#1eff00}.tip .c-fog{color:#9aa0b4}
.q0{color:#9d9d9d}.q1{color:#fff}.q2{color:#1eff00}.q3{color:#4a9bff}.q4{color:#c06bff}.q5{color:#ff8000}
a[data-wowhead]{color:#c9a8ff;text-decoration:underline dotted rgba(255,255,255,.3);text-underline-offset:3px}
.has-tip{cursor:help;text-decoration:underline dotted rgba(255,255,255,.3);text-underline-offset:3px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; document.body.appendChild(tip);
  let items = {}, ids = {}; const waiting = [];
  const key = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function show(el, x, y) {
    const it = items[el.dataset.tip]; if (!it) return;
    tip.innerHTML = `<div class="tn q${it.q}">${esc(el.dataset.tip)}</div>` + it.lines.map(l => l.l != null ? `<div class="tl c-${l.c}"><span>${esc(l.l)}</span><span>${esc(l.r)}</span></div>` : `<div class="c-${l.c}">${esc(l.t)}</div>`).join("");
    tip.hidden = false; const r = tip.getBoundingClientRect();
    let left = x + 16, top = y + 16;
    if (left + r.width > innerWidth - 8) left = Math.max(8, x - r.width - 16);
    if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8);
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  const find = e => e.target.closest && e.target.closest("[data-tip].has-tip");
  document.addEventListener("mousemove", e => { const t = find(e); if (t) show(t, e.clientX, e.clientY); else tip.hidden = true; });
  document.addEventListener("click", e => {
    const t = find(e);
    if (t && matchMedia("(hover:none)").matches) { const r = t.getBoundingClientRect(); show(t, r.left, r.bottom - 16); clearTimeout(window._tt); window._tt = setTimeout(() => tip.hidden = true, 4000); }
    else if (!t) tip.hidden = true;
  });
  addEventListener("scroll", () => tip.hidden = true, { passive: true });
  // Items our stats source doesn't have (e.g. Tier 0.5 sets) fall back to Wowhead's own hover tooltips, loaded only when needed.
  let whLoaded = false;
  function wowhead() {
    if (whLoaded) { try { window.$WowheadPower && window.$WowheadPower.refreshLinks(); } catch (e) {} return; }
    whLoaded = true;
    window.whTooltips = { colorLinks: true, iconizeLinks: false, renameLinks: false };
    const s = document.createElement("script"); s.src = "https://wow.zamimg.com/js/tooltips.js"; s.async = true; document.head.appendChild(s);
  }
  // Wowhead's own tooltip is preferred whenever we know the item ID (from item-ids.json or item-stats.json).
  const wh = n => ids[key(n)] || (items[n] && items[n].id);
  fetch("item-ids.json").then(r => r.ok ? r.json() : null).then(j => { if (j) { Object.entries(j).forEach(([k, v]) => ids[key(k)] = v); waiting.forEach(f => f()); } }).catch(() => {});
  fetch("item-stats.json").then(r => r.ok ? r.json() : null).then(j => { if (j && j.items) { items = j.items; waiting.forEach(f => f()); } }).catch(() => {});
  window.DSTips = {
    has: n => !!items[n],
    q: n => items[n] ? items[n].q : 1,
    ready: f => { waiting.push(f); if (Object.keys(items).length) f(); },
    // Wrap every item name inside a longer line ("A / B", "A (Horde: B)", "Name (where it drops)").
    line: str => {
      let paren = false, horde = false;
      return String(str).split(/( \/ |\(Horde: |\(|\))/).map(t => {
        if (t === "(Horde: ") { paren = true; horde = true; return esc(t); }
        if (t === "(") { paren = true; horde = false; return esc(t); }
        if (t === ")") { paren = false; horde = false; return esc(t); }
        if (t === " / ") return esc(t);
        const n = t.trim();
        return n && (!paren || horde) && (items[n] || wh(n)) ? esc(t.slice(0, t.indexOf(n))) + window.DSTips.span(n) + esc(t.slice(t.indexOf(n) + n.length)) : esc(t);
      }).join("");
    },
    // Wrap an item name in a tooltip span (plain text if there is no data for it).
    span: n => !wh(n) ? `<span${items[n] ? ` class="has-tip q${items[n].q}"` : ""} data-tip="${esc(n)}">${esc(n)}</span>` : (setTimeout(wowhead, 0), `<a href="https://www.wowhead.com/forever/item=${wh(n)}" target="_blank" rel="noopener" data-wowhead="item=${wh(n)}&domain=forever">${esc(n)}</a>`),
  };
})();
