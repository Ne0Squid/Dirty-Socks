// News pages. One file, three jobs:
//  1. the all-news page (/news): a grid of every post,
//  2. a post's own page (/news/<title-words>). A built page (scripts/build-news.mjs makes one for every post each night) already holds the
//     post; this script only checks it is still the latest version. A post newer than the last build has no file yet, so the
//     "page not found" screen recognises /news/<name>, asks the service for it and draws it in place (a post that does not exist
//     still gets the normal 404),
//  3. the Copy link button.
(function(){
  var F=window.NewsFmt;if(!F)return;
  var Q=new URLSearchParams(location.search),local=location.hostname==="localhost"&&Q.get("api");
  var API=String(local||window.DS_API||"").replace(/\/+$/,"");
  var keep=local?"?api="+encodeURIComponent(Q.get("api")):"";   // only for local testing: carry the test service along in links
  var opt={api:API,keep:keep};

  var get=function(path){return fetch(API+path,{cache:"no-store"}).then(function(r){return r.ok?r.json():null})};
  var others=function(p){return get("/api/news?limit=5&t="+Date.now()).then(function(j){return((j&&j.news)||[]).filter(function(x){return x.id!==p.id})})};
  function describe(p){var d=document.querySelector('meta[name="description"]');if(d)d.setAttribute("content",F.excerpt(p.body,160)||p.title);document.title=p.title+" – Dirty Socks"}
  function wire(w,slug){
    w.addEventListener("click",function(e){
      var b=e.target.closest&&e.target.closest("[data-copy]");if(!b)return;
      var done=function(ok){b.textContent=ok?"Link copied":"Press Ctrl+C to copy the address bar";setTimeout(function(){b.textContent="Copy link"},2200)};
      try{navigator.clipboard.writeText(location.origin+"/news/"+slug).then(function(){done(true)},function(){done(false)})}catch(x){done(false)}
    });
  }

  // 1. all-news page
  var arch=document.getElementById("newsarchive");
  if(arch&&API)get("/api/news?t="+Date.now()).then(function(j){
    var list=(j&&j.news)||[];
    arch.innerHTML=list.length?F.cards(list,opt):'<p class="muted">No news yet. Check back soon.</p>';
  }).catch(function(){arch.innerHTML='<p class="muted">The news could not be loaded right now. Try again in a moment.</p>'});

  // 2a. a built page: keep it honest. Edited since the last build -> show the new version; removed -> say so.
  var built=document.getElementById("npost");
  if(built&&built.dataset.slug){
    wire(built,built.dataset.slug);
    if(API)fetch(API+"/api/news/post/"+encodeURIComponent(built.dataset.slug)+"?t="+Date.now(),{cache:"no-store"}).then(function(r){
      if(r.status===404){built.innerHTML='<article class="npage"><a class="nback" href="/news'+keep+'">&larr; All news</a><h1 class="nstitle" style="margin:18px 0 8px">This post was removed</h1><p class="muted">It is no longer on the news page. <a href="/news'+keep+'">See the latest news</a>.</p></article>';document.title="Post removed – Dirty Socks";return}
      return r.ok?r.json():null;
    }).then(function(j){
      var p=j&&j.post;if(!p||String(p.edited||p.at)===built.dataset.v)return;
      return others(p).then(function(o){built.innerHTML=F.page(p,o,opt);built.dataset.v=String(p.edited||p.at);describe(p)});
    }).catch(function(){});
    return;
  }

  // 2b. a post with no built page yet, drawn inside the page-not-found screen
  var lost=document.getElementById("nlost"),m=location.pathname.match(/^\/news\/([^\/]+)\/?$/);
  if(lost&&location.pathname==="/news/"){location.replace("/news"+keep+location.hash);return}
  if(!lost||!m||!API)return;
  var main=lost.parentNode,title0=document.title;
  lost.hidden=true;
  Promise.all([get("/api/news/post/"+encodeURIComponent(decodeURIComponent(m[1]))+"?t="+Date.now()),get("/api/news?limit=5&t="+Date.now())]).then(function(r){
    var p=r[0]&&r[0].post;if(!p){lost.hidden=false;return}
    var o=((r[1]&&r[1].news)||[]).filter(function(x){return x.id!==p.id});
    describe(p);
    var w=document.createElement("div");w.id="npost";w.innerHTML=F.page(p,o,opt);main.insertBefore(w,lost);
    wire(w,p.slug);
  }).catch(function(){lost.hidden=false;document.title=title0});
})();
