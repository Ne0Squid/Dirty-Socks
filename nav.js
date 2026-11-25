// Shared site navigation: one list of links for every page, so the menu looks the same everywhere.
(function(){
  var nav=document.querySelector("nav");if(!nav)return;
  var page=(location.pathname.split("/").pop()||"index.html");
  var home=page==="index.html";
  var sections=[["Guild Stats","#stats"],["Race to 60","#race"],["Roster","#roster"],["Professions","#professions","profnav"],["Dungeons","#dungeons"],["Raid Progression","#raidprog"]];
  var main=home?sections:[["Home","index.html"]]; // other pages just offer a way back home
  var pages=[["Patch Notes","hotfixes.html"],["Hall of Fame","hall-of-fame.html"],["Raid Roster","raid-roster.html"]];
  var a=function(l,href,id){return '<a href="'+href+'"'+(id?' id="'+id+'" hidden':'')+(href===page?' class="here"':'')+'>'+l+'</a>'};
  nav.innerHTML='<div class="navmain">'+main.map(function(l){return a(l[0],l[1],l[2])}).join("")+'</div><div class="navpages">'+pages.map(function(l){return a(l[0],l[1])}).join("")+'</div>';
  var css=document.createElement("style");
  css.textContent='nav{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--surface)}'
  +'nav a{text-decoration:none;font-weight:600;font-size:.9rem;color:var(--muted)}nav a:hover,nav a.here{color:var(--accent)}'
  +'.menu-btn{display:none}.navmain,.navpages{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}'
  +'@media (min-width:1100px){nav{justify-content:space-between;flex-wrap:nowrap}.navpages{padding-left:22px;border-left:1px solid var(--line)}}'
  +'@media (max-width:720px){nav{flex-direction:column;align-items:stretch;gap:0;padding:6px 20px}.navmain,.navpages{display:contents}'
  +'.menu-btn{display:flex;align-items:center;justify-content:center;gap:8px;background:none;border:0;color:var(--text);font:inherit;font-weight:600;font-size:.95rem;padding:8px;cursor:pointer}'
  +'.menu-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}'
  +'nav a{display:none;padding:11px 4px;border-top:1px solid var(--line);text-align:center;font-size:.95rem}nav.open a:not([hidden]){display:block}}';
  document.head.appendChild(css);
  // Mobile: the link row collapses behind a Menu button.
  var btn=document.createElement("button");btn.type="button";btn.className="menu-btn";
  btn.setAttribute("aria-expanded","false");btn.setAttribute("aria-label","Toggle menu");btn.textContent="☰ Menu";
  nav.insertBefore(btn,nav.firstChild);
  var set=function(o){nav.classList.toggle("open",o);btn.setAttribute("aria-expanded",String(o));btn.textContent=o?"✕ Close":"☰ Menu"};
  btn.addEventListener("click",function(){set(!nav.classList.contains("open"))});
  nav.addEventListener("click",function(e){if(e.target.closest("a"))set(false)});
})();
