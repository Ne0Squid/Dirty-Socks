// Horde / Alliance toggle. Horde is the default red look; Alliance switches the accent colour to blue
// and swaps the banner. The choice is remembered in the browser. Light/dark still follows the device.
(function () {
  var KEY = "dirty-socks-faction", root = document.documentElement;
  // From this moment the raid-release banners replace the regular ones (switched early; the countdown date is separate, in index.html).
  var RAIDS_OPEN = new Date("2026-11-20T00:00:00");
  function banners() {
    return new Date() >= RAIDS_OPEN
      ? { horde: "images/Raid-Horde.jpg", alliance: "images/Raid-Alliance.jpg" }
      : { horde: null, alliance: "images/Banner-Alliance.jpg" };
  }
  function saved() { try { var v = localStorage.getItem(KEY); return v === "alliance" ? "alliance" : "horde"; } catch (e) { return "horde"; } }
  function save(f) { try { localStorage.setItem(KEY, f); } catch (e) {} }

  var css = document.createElement("style");
  css.textContent =
    'html:root{--glow:224,72,63}html:root[data-faction="alliance"]{--glow:106,166,255}' +
    'html:root body{background-image:radial-gradient(ellipse 1200px 620px at 50% 700px,rgba(var(--glow),.26),transparent 70%),radial-gradient(ellipse 800px 700px at 0% 100%,rgba(var(--glow),.16),transparent 70%),radial-gradient(ellipse 800px 700px at 100% 60%,rgba(var(--glow),.13),transparent 70%);background-repeat:no-repeat}' +
    '.hero.banner{border-bottom:0}.banner{position:relative}.banner::after{content:"";position:absolute;left:0;right:0;bottom:0;height:clamp(40px,8vw,90px);background:linear-gradient(to bottom,rgba(15,17,23,0),var(--bg));pointer-events:none}' +
    'html:root[data-faction="alliance"]{--accent:#1f4fa3;--accent-text:#ffffff}' +
    '@media (prefers-color-scheme:dark){html:root[data-faction="alliance"]:not([data-theme="light"]){--accent:#6aa6ff;--accent-text:#08111f}}' +
    'html:root[data-faction="alliance"][data-theme="dark"]{--accent:#6aa6ff;--accent-text:#08111f}' +
    '.faction-toggle{display:inline-flex;border:1px solid var(--line);border-radius:99px;overflow:hidden;background:var(--bg)}' +
    '.faction-toggle button{border:0;background:none;color:var(--muted);font:inherit;font-size:.82rem;font-weight:600;padding:4px 14px;cursor:pointer;line-height:1.4}' +
    '.faction-toggle button:hover{color:var(--text)}' +
    '.faction-toggle button[aria-pressed="true"]{color:#fff}' +
    '.faction-toggle button[data-f="horde"][aria-pressed="true"]{background:#b3241f}' +
    '.faction-toggle button[data-f="alliance"][aria-pressed="true"]{background:#2a5db0}' +
    '.banner{position:relative}.banner .faction-toggle{position:absolute;top:10px;right:10px;z-index:2;background:rgba(12,14,20,.62);border-color:rgba(255,255,255,.28);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,.35)}' +
    '@media (max-width:600px){.banner .faction-toggle{top:6px;right:6px}.banner .faction-toggle button{font-size:.68rem;padding:3px 9px}}' +
    '.banner .faction-toggle button{color:#e8e2d2}.banner .faction-toggle button:hover{color:#fff}' +
    '.faction-toggle button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}';
  document.head.appendChild(css);

  var current = saved();
  root.setAttribute("data-faction", current);

  var ALLIANCE_POS = "center 55%";
  function preload() { var b = banners(); for (var k in b) if (b[k]) { var im = new Image(); im.src = b[k]; } }
  function banner(f, instant) {
    var img = document.querySelector(".banner img");
    if (!img) return;
    if (!img.getAttribute("data-horde")) img.setAttribute("data-horde", img.getAttribute("src"));
    var target = banners()[f] || img.getAttribute("data-horde"), pos = f === "alliance" ? ALLIANCE_POS : "";
    function set() { img.src = target; img.style.objectPosition = pos; }
    if (instant || img.getAttribute("src") === target && img.style.objectPosition === pos) { set(); return; }
    img.style.transition = "opacity .16s ease"; img.style.opacity = "0";
    setTimeout(function () { set(); img.style.opacity = "1"; }, 170);
  }
  window.dsBanner = function () { banner(current, true); };
  preload();
  function addon(f) {
    var img = document.querySelector(".addon-link img");
    if (!img) return;
    if (!img.getAttribute("data-horde")) img.setAttribute("data-horde", img.getAttribute("src"));
    img.src = f === "alliance" ? "images/waypath-button-alliance.svg" : img.getAttribute("data-horde");
  }
  function apply(f) {
    current = f; root.setAttribute("data-faction", f); save(f); banner(f); addon(f);
    var btns = document.querySelectorAll(".faction-toggle button");
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", String(btns[i].getAttribute("data-f") === f));
  }
  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector(".banner") || document.querySelector("nav");
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
