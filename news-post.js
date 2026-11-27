// News pages. One file, three jobs:
//  1. the all-news page (/news): a grid of every post,
//  2. each post's own page (/news/<title-words>): GitHub Pages cannot make a file for every new post, so the "page not found" screen
//     recognises /news/<name>, asks the service for that post and draws it in place (a post that does not exist still gets the normal 404),
//  3. small helpers (cards) used by both.
(function(){
  var F=window.NewsFmt;if(!F)return;
  var Q=new URLSearchParams(location.search),local=location.hostname==="localhost"&&Q.get("api");
  var API=String(local||window.DS_API||"").replace(/\/+$/,"");
  var keep=local?"?api="+encodeURIComponent(Q.get("api")):"";   // only for local testing: carry the test service along in links
  var esc=F.esc,day=function(t){return new Date(t).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})};
  var focus=function(p){return"object-position:"+(+p.fx>=0?+p.fx:50)+"% "+(+p.fy>=0?+p.fy:50)+"%"};
  var imgUrl=function(p){return API+"/api/news/img/"+p.cover};
  var crest='<img class="lh" src="/images/logo-horde.png" alt="" width="487" height="512"><img class="la" src="/images/logo-alliance.png" alt="" width="487" height="512">';

  function card(p){
    var pic=p.cover?'<img src="'+esc(imgUrl(p))+'" alt="" loading="lazy" decoding="async" style="'+focus(p)+'">':'<span class="ncnone" aria-hidden="true">'+crest+'</span>';
    return'<a class="ncard" href="/news/'+encodeURIComponent(p.slug)+keep+'"><span class="ncimg">'+pic+'</span><span class="nctext"><span class="ncdate">'+esc(day(p.at))+'</span>'
      +'<strong class="nctitle">'+esc(p.title)+'</strong><span class="ncex">'+esc(F.excerpt(p.body,200))+'</span><span class="ncgo">Read more &rarr;</span></span></a>';
  }
  var cards=function(list){return'<div class="ngrid">'+list.map(card).join("")+"</div>"};

  function page(p,others){
    var cap='<div class="ncap"><div class="npdate">'+esc(day(p.at))+(p.edited?" \u00B7 updated "+esc(day(p.edited)):"")+'</div><h1 class="nstitle">'+esc(p.title)+"</h1></div>";
    var head=p.cover
      ?'<header class="nphead"><img class="nbg" src="'+esc(imgUrl(p))+'" alt="" style="'+focus(p)+'" fetchpriority="high" decoding="async"><div class="nshade"></div>'+cap+"</header>"
      :'<header class="nphead nocover"><div class="nbg nbg-none" aria-hidden="true">'+crest+'</div><div class="nshade"></div>'+cap+"</header>";
    return'<article class="npage"><a class="nback" href="/news'+keep+'">&larr; All news</a>'+head
      +(p.body?'<div class="npbody nmd">'+(p.md?F.render(p.body,API):"<p>"+esc(p.body).replace(/\n/g,"<br>")+"</p>")+"</div>":"")
      +'<div class="npactions"><button type="button" class="btn ghost" data-copy>Copy link</button></div>'
      +(others.length?'<section class="npmore"><h2>More news</h2>'+cards(others.slice(0,3))+'<p><a class="nall" href="/news'+keep+'">All news &rarr;</a></p></section>':"")+"</article>";
  }

  var get=function(path){return fetch(API+path,{cache:"no-store"}).then(function(r){return r.ok?r.json():null})};

  // 1. all-news page
  var arch=document.getElementById("newsarchive");
  if(arch&&API)get("/api/news?t="+Date.now()).then(function(j){
    var list=(j&&j.news)||[];
    arch.innerHTML=list.length?cards(list):'<p class="muted">No news yet. Check back soon.</p>';
  }).catch(function(){arch.innerHTML='<p class="muted">The news could not be loaded right now. Try again in a moment.</p>'});

  // 2. a post's own page, drawn inside the page-not-found screen
  var lost=document.getElementById("nlost"),m=location.pathname.match(/^\/news\/([^\/]+)\/?$/);
  if(lost&&location.pathname==="/news/"){location.replace("/news"+keep+location.hash);return}
  if(!lost||!m||!API)return;
  var main=lost.parentNode,title0=document.title;
  lost.hidden=true;
  Promise.all([get("/api/news/post/"+encodeURIComponent(decodeURIComponent(m[1]))+"?t="+Date.now()),get("/api/news?limit=5&t="+Date.now())]).then(function(r){
    var p=r[0]&&r[0].post;if(!p){lost.hidden=false;return}
    var others=((r[1]&&r[1].news)||[]).filter(function(x){return x.id!==p.id});
    document.title=p.title+" \u2013 Dirty Socks";
    var d=document.querySelector('meta[name="description"]');if(d)d.setAttribute("content",F.excerpt(p.body,160)||p.title);
    var w=document.createElement("div");w.id="npost";w.innerHTML=page(p,others);main.insertBefore(w,lost);
    w.addEventListener("click",function(e){
      var b=e.target.closest&&e.target.closest("[data-copy]");if(!b)return;
      var done=function(ok){b.textContent=ok?"Link copied":"Press Ctrl+C to copy the address bar";setTimeout(function(){b.textContent="Copy link"},2200)};
      try{navigator.clipboard.writeText(location.origin+"/news/"+p.slug).then(function(){done(true)},function(){done(false)})}catch(x){done(false)}
    });
  }).catch(function(){lost.hidden=false;document.title=title0});
})();
