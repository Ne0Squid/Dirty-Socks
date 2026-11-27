// Shared site navigation: logo + guild name on the left, one list of links (identical on every page) on the right.
(function(){
  var nav=document.querySelector("nav");if(!nav)return;
  // Clean addresses: show /roster instead of /roster.html, and / instead of /index.html (address bar only, no reload).
  var path=location.pathname,clean=path.replace(/\/index\.html$/,"/").replace(/\.html$/,"");
  if(clean!==path&&history.replaceState)history.replaceState(history.state,"",clean+location.search+location.hash);
  var page=clean.replace(/\/+$/,"")||"/";
  var links=[["Home","/"],["Roster","/roster"],["Hall of Fame","/hall-of-fame"],["Recruitment","/recruitment"]];
  var a=function(l){return '<a href="'+l[1]+'"'+(l[1]===page?' class="here" aria-current="page"':'')+'>'+l[0]+'</a>'};
  nav.innerHTML='<a class="brand" href="/" aria-label="Dirty Socks – home">'
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
  +'@media (max-width:1100px){nav{flex-wrap:wrap;justify-content:space-between}nav .faction-toggle{position:static!important;transform:none!important;order:2;margin-left:auto}.menu-btn{order:3;margin-left:0!important}nav .brand{order:1}.navlinks{order:4}.menu-btn{display:flex;align-items:center;gap:8px;background:none;border:1px solid var(--line);border-radius:6px;color:var(--text);font:inherit;font-weight:600;font-size:.9rem;padding:7px 12px;cursor:pointer}'
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
// Account: a Log in button at the left of the bar and, once signed in, your highest-level character with its level.
(function(){
  var nav=document.querySelector("nav");if(!nav)return;
  var script=document.currentScript,base=(script&&script.src)||location.href;
  var KEY="ds-session",CKEY="ds-nav",TTL=10*60*1000;
  var Q=new URLSearchParams(location.search),onSignup=/\/signup(\.html)?\/?$/.test(location.pathname);
  var ls={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}},del:function(k){try{localStorage.removeItem(k)}catch(e){}}};
  // Back from Battle.net: the login hands the session over in the address. Keep it and tidy the address.
  var h=new URLSearchParams(location.hash.slice(1)),gotSession=h.get("session");
  if(gotSession)ls.set(KEY,gotSession);
  if(gotSession||(h.has("error")&&!onSignup)){
    h.delete("session");if(!onSignup)h.delete("error");
    var rest=h.toString();history.replaceState(history.state,"",location.pathname+location.search+(rest?"#"+rest:""));
  }
  function start(){
    var API=((location.hostname==="localhost"&&Q.get("api"))||window.DS_API||"").replace(/\/+$/,"");
    if(!API)return;
    var COLORS={"Death Knight":"#c41e3a","Druid":"#ff7d0a","Hunter":"#abd473","Mage":"#3fc7eb","Paladin":"#f58cba","Priest":"#c8c8c8","Rogue":"#fff569","Shaman":"#0070de","Warlock":"#8788ee","Warrior":"#c79c6e"};
    var esc=function(t){return String(t==null?"":t).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
    var key=function(t){return String(t).toLowerCase().replace(/\s+/g," ")};
    var css=document.createElement("style");
    css.textContent='nav .acct{position:absolute;left:max(20px,env(safe-area-inset-left,0px));top:50%;transform:translateY(-50%);z-index:60}'
    +'.acct-btn{font:inherit;font-size:.82rem;font-weight:600;display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:6px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer;white-space:nowrap;line-height:1.3}'
    +'.acct-btn:hover{border-color:var(--accent);color:var(--accent)}.acct-btn:focus-visible{outline:2px solid var(--accent);outline-offset:3px}'
    +'.acct-dot{width:10px;height:10px;border-radius:50%;flex:none}'
    +'.acct-name{overflow:hidden;text-overflow:ellipsis;max-width:11rem}.acct-lv{color:var(--muted);font-size:.76rem}'
    +'.acct-menu{display:none;position:absolute;top:calc(100% + 8px);left:0;min-width:210px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.45)}'
    +'.acct.open .acct-menu{display:block}'
    +'.acct-who{padding:6px 10px 8px;font-size:.78rem;color:var(--muted);border-bottom:1px solid var(--line);margin-bottom:4px}.acct-who b{display:block;color:var(--text);font-size:.88rem;word-break:break-all}'
    +'.acct-menu a,.acct-menu button{display:block;width:100%;text-align:left;padding:8px 10px;border-radius:6px;border:0;background:none;color:var(--text);font:inherit;font-size:.88rem;text-decoration:none;cursor:pointer}'
    +'.acct-menu a:hover,.acct-menu button:hover{background:rgba(127,127,127,.14);color:var(--accent)}'
    +'@media (max-width:1100px){nav .acct{position:relative;left:auto;top:auto;transform:none;order:1}}'
    +'@media (max-width:520px){.acct-btn{padding:5px 10px;gap:6px}.acct-name{max-width:7.5rem}'
    // On phones the Horde/Alliance switch moves into the opened menu so the login keeps the top row to itself.
    +'nav .faction-toggle{display:none}nav.open .faction-toggle{display:inline-flex;order:5;margin:6px auto 2px 0}}';
    document.head.appendChild(css);
    var box=document.createElement("div");box.className="acct";nav.insertBefore(box,nav.firstChild);
    var cached=function(tok){try{var c=JSON.parse(ls.get(CKEY));return c&&c.t===tok.slice(-16)?c:null}catch(e){return null}};
    function draw(){
      var tok=ls.get(KEY);box.classList.remove("open");
      if(!tok){box.innerHTML='<button type="button" class="acct-btn" data-a="login">Log in</button>';return}
      var c=cached(tok)||{},ch=c.ch,bt=c.bt||"";
      var label=ch?'<i class="acct-dot" style="background:'+(COLORS[ch.c]||"var(--muted)")+'"></i><span class="acct-name">'+esc(ch.n)+'</span><span class="acct-lv">Lv '+esc(ch.l)+'</span>'
        :'<span class="acct-name">'+esc(bt?bt.split("#")[0]:"Signed in")+'</span>';
      box.innerHTML='<button type="button" class="acct-btn" data-a="menu" aria-haspopup="true" aria-expanded="false">'+label+'</button>'
        +'<div class="acct-menu" role="menu"><div class="acct-who">Signed in as<b>'+esc(bt||"your Battle.net account")+'</b>'+(c.officer?'<span>Officer</span>':'')+'</div>'
        +(ch?'<a href="/character?c='+encodeURIComponent(String(ch.n).toLowerCase().replace(/['’]/g,"").replace(/\s+/g,"-"))+(location.hostname==="localhost"&&Q.get("api")?"&api="+encodeURIComponent(Q.get("api")):"")+'" role="menuitem">My character</a>':'')
        +'<a href="/signup" role="menuitem">Raid sign-up</a><button type="button" role="menuitem" data-a="out">Sign out</button></div>';
    }
    function refresh(){
      var tok=ls.get(KEY);if(!tok)return;
      var c=cached(tok);if(c&&Date.now()-c.at<TTL)return;
      var head={Authorization:"Bearer "+tok};
      fetch(API+"/api/me",{headers:head}).then(function(r){
        if(r.status===401){ls.del(KEY);ls.del(CKEY);draw();return null}
        return r.ok?r.json():null;
      }).then(function(m){
        if(!m)return;
        var chars=m.characters||[];
        // Levels from the Battle.net sign-in can be a few days old, so prefer the hourly guild roster when it knows the character.
        return(chars.length?fetch(new URL("guild-data.json",base).href).then(function(r){return r.ok?r.json():{}}).catch(function(){return{}}):Promise.resolve({})).then(function(g){
          var lv={};(g.roster||[]).forEach(function(x){lv[key(x.name+" "+(x.surname||""))]=x.level||0});
          var best=null;
          chars.forEach(function(x){
            var n=x.surname?x.name+" "+x.surname:x.name,l=Math.max(x.level||0,lv[key(n)]||0);
            if(!best||l>best.l)best={n:n,l:l,c:x.cls};
          });
          ls.set(CKEY,JSON.stringify({t:tok.slice(-16),at:Date.now(),bt:m.battletag||"",officer:!!m.officer,ch:best}));
          draw();
        });
      }).catch(function(){});
    }
    box.addEventListener("click",function(e){
      var b=e.target.closest("button");if(!b)return;
      var a=b.getAttribute("data-a");
      if(a==="login"){
        location.href=API+"/auth/login?return="+encodeURIComponent(location.origin+location.pathname+(location.hostname==="localhost"&&Q.get("api")?"?api="+encodeURIComponent(Q.get("api")):""));
      }else if(a==="menu"){
        var open=!box.classList.contains("open");box.classList.toggle("open",open);b.setAttribute("aria-expanded",String(open));
      }else if(a==="out"){
        ls.del(KEY);ls.del(CKEY);
        if(onSignup){location.reload();return}
        draw();
      }
    });
    document.addEventListener("click",function(e){if(!box.contains(e.target))box.classList.remove("open")});
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&box.classList.contains("open")){box.classList.remove("open");var b=box.querySelector("[data-a=menu]");if(b){b.setAttribute("aria-expanded","false");b.focus()}}});
    window.addEventListener("ds-auth",function(){draw();refresh()});
    draw();refresh();
  }
  // Pages that do not load the login address themselves get it from auth-config.js, next to this file.
  if(window.DS_API!==undefined||(location.hostname==="localhost"&&Q.get("api")))start();
  else{var cfg=document.createElement("script");cfg.src=new URL("auth-config.js",base).href;cfg.onload=cfg.onerror=start;document.head.appendChild(cfg)}
})();
// Seasonal theme: Winter Veil / Christmas. Auto-on Dec 1 - Jan 3; ?xmas=1 forces it, ?xmas=off hides it.
(function(){
  var q=location.search,n=new Date(),m=n.getMonth(),dd=n.getDate();
  var season=m===11||(m===0&&dd<=3);
  if(/xmas=off/.test(q)||!(season||/xmas=1/.test(q)))return;
  var l=document.createElement("link");l.rel="stylesheet";l.href="christmas.css";document.head.appendChild(l);
  var j=document.createElement("script");j.src="christmas.js";document.body.appendChild(j);
})();
