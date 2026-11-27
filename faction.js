// Horde / Alliance toggle. Horde is the default red look; Alliance switches the accent colour to blue
// (and the Waypath button art). The choice is remembered in the browser. Light/dark still follows the device.
(function () {
  var KEY = "dirty-socks-faction", root = document.documentElement;
  function saved() { try { var v = localStorage.getItem(KEY); return v === "alliance" ? "alliance" : "horde"; } catch (e) { return "horde"; } }
  function save(f) { try { localStorage.setItem(KEY, f); } catch (e) {} }

  var css = document.createElement("style");
  css.textContent =
    'html:root{--glow:224,72,63}html:root[data-faction="alliance"]{--glow:106,166,255}' +
    'html:root[data-faction="alliance"]{--accent:#1f4fa3;--accent-text:#ffffff}' +
    '@media (prefers-color-scheme:dark){html:root[data-faction="alliance"]:not([data-theme="light"]){--accent:#629df5;--accent-text:#050b16}}' +
    'html:root[data-faction="alliance"][data-theme="dark"]{--accent:#629df5;--accent-text:#050b16}' +
    '.faction-toggle{display:inline-flex;border:1px solid var(--line);border-radius:99px;overflow:hidden;background:var(--bg)}' +
    '.faction-toggle button{border:0;background:none;color:var(--muted);font:inherit;font-size:.82rem;font-weight:600;padding:4px 14px;cursor:pointer;line-height:1.4}' +
    '.faction-toggle button:hover{color:var(--text)}' +
    '.faction-toggle button[aria-pressed="true"]{color:#fff}' +
    '.faction-toggle button[data-f="horde"][aria-pressed="true"]{background:#b3241f}' +
    '.faction-toggle button[data-f="alliance"][aria-pressed="true"]{background:#2a5db0}' +
    '.faction-toggle button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}';
  document.head.appendChild(css);

  var current = saved();
  root.setAttribute("data-faction", current);

  function addon(f) {
    var img = document.querySelector(".addon-link img");
    if (!img) return;
    if (!img.getAttribute("data-horde")) img.setAttribute("data-horde", img.getAttribute("src"));
    img.src = f === "alliance" ? "images/waypath-button-alliance.svg" : img.getAttribute("data-horde");
  }
  function apply(f) {
    current = f; root.setAttribute("data-faction", f); save(f); addon(f);
    var btns = document.querySelectorAll(".faction-toggle button");
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", String(btns[i].getAttribute("data-f") === f));
  }
  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector("nav");
    if (nav) {
      var box = document.createElement("div");
      box.className = "faction-toggle"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Choose your faction");
      box.innerHTML = '<button type="button" data-f="horde">Horde</button><button type="button" data-f="alliance">Alliance</button>';
      box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) apply(b.getAttribute("data-f")); });
      nav.appendChild(box);
    }
    apply(current);
  });
})();
