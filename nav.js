// Shared site navigation: logo + guild name on the left, one list of links (identical on every page) on the right.
(function(){
  var nav=document.querySelector("nav");if(!nav)return;
  var page=(location.pathname.split("/").pop()||"index.html");
  var links=[["Home","index.html"],["Roster","raid-roster.html"],["Hall of Fame","hall-of-fame.html"],["Pre-Raid BiS","bis.html"],["Dungeon Loot","dungeon-loot.html"],["Patch Notes","hotfixes.html"],["Recruitment","recruitment.html"]];
  var a=function(l){return '<a href="'+l[1]+'"'+(l[1]===page?' class="here" aria-current="page"':'')+'>'+l[0]+'</a>'};
  nav.innerHTML='<a class="brand" href="index.html" aria-label="Dirty Socks – home">'
    +'<img class="logo logo-horde" src="images/logo-horde-sm.png" alt="" width="44" height="46">'
    +'<img class="logo logo-alliance" src="images/logo-alliance-sm.png" alt="" width="44" height="46">'
    +'</a>'
    +'<div class="navlinks">'+links.map(a).join("")+'</div>';
  var css=document.createElement("style");
  css.textContent='html{scroll-padding-top:72px;scrollbar-width:none;-ms-overflow-style:none}html::-webkit-scrollbar{display:none}'
  +'nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:50;display:flex;align-items:center;justify-content:center;gap:12px 28px;flex-wrap:wrap;padding:8px max(20px,env(safe-area-inset-left,0px)) 8px max(20px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line);background:var(--surface)}'
  +'nav .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text)}'
  +'nav .logo{height:50px;width:auto;display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))}'
  +'html:root:not([data-faction="alliance"]) nav .logo-alliance,html:root[data-faction="alliance"] nav .logo-horde{display:none}'
  +'nav .brand:focus-visible,nav .navlinks a:focus-visible,.menu-btn:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}'
  +'.navlinks{display:flex;gap:26px;flex-wrap:wrap;justify-content:center}'
  +'.navlinks a{text-decoration:none;font-weight:600;font-size:.92rem;color:var(--muted);padding:6px 0;border-bottom:2px solid transparent}'
  +'.navlinks a:hover{color:var(--text)}.navlinks a.here{color:var(--accent);border-bottom-color:var(--accent)}'
  +'nav .faction-toggle{position:absolute;right:max(20px,env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);background:var(--bg)}'
  +'.menu-btn{display:none}'
  +'@media (max-width:1160px){nav{flex-wrap:wrap;justify-content:space-between}nav .faction-toggle{position:static!important;transform:none!important;order:2;margin-left:auto}.menu-btn{order:3;margin-left:0!important}nav .brand{order:1}.navlinks{order:4}.menu-btn{display:flex;align-items:center;gap:8px;background:none;border:1px solid var(--line);border-radius:6px;color:var(--text);font:inherit;font-weight:600;font-size:.9rem;padding:7px 12px;cursor:pointer}'
  +'.navlinks{display:none;flex-basis:calc(100% + 40px);flex-direction:column;gap:0;margin:2px -20px -8px;border-top:1px solid var(--line)}nav.open .navlinks{display:flex}'
  +'.navlinks a{padding:12px 20px;border-bottom:1px solid var(--line);text-align:left;font-size:.98rem}.navlinks a.here{border-bottom-color:var(--line);background:rgba(127,127,127,.1)}}'
  +'@media (max-width:420px){nav .logo{height:42px}}';
  document.head.appendChild(css);
  // Small screens: the links collapse behind a Menu button.
  var btn=document.createElement("button");btn.type="button";btn.className="menu-btn";
  btn.setAttribute("aria-expanded","false");btn.setAttribute("aria-label","Toggle menu");btn.textContent="☰ Menu";
  nav.insertBefore(btn,nav.querySelector(".navlinks"));
  var set=function(o){nav.classList.toggle("open",o);btn.setAttribute("aria-expanded",String(o));btn.textContent=o?"✕ Close":"☰ Menu"};
  btn.addEventListener("click",function(){set(!nav.classList.contains("open"))});
  nav.addEventListener("click",function(e){if(e.target.closest(".navlinks a"))set(false)});
})();
