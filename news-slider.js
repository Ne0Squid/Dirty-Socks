// Home page news slider: the latest posts as big slides (cover photo, bold title, a short teaser and Read More), with dots, arrows, swipe and keys.
// It moves on its own every few seconds, but stops when you hover, focus or touch it, can be paused, and never moves for people who ask for reduced motion.
(function(){
  var sec=document.getElementById("news"),box=document.getElementById("newslist");
  if(!sec||!box||!window.NewsFmt)return;
  var Q=new URLSearchParams(location.search);
  var API=String((location.hostname==="localhost"&&Q.get("api"))||window.DS_API||"").replace(/\/+$/,"");
  if(!API)return;
  var keep=location.hostname==="localhost"&&Q.get("api")?"?api="+encodeURIComponent(Q.get("api")):"";   // only for local testing: carry the test service along in links
  var SLIDES=5,EVERY=7000,reduced=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  var esc=window.NewsFmt.esc;

  function build(posts){
    var n=posts.length,cur=0,timer=null,stopped=reduced||n<2,hover=false;
    box.innerHTML='<div class="nslider" role="region" aria-roledescription="carousel" aria-label="Latest news" tabindex="0">'
      +posts.map(function(p,i){return window.NewsFmt.slide(p,API,{eager:i===0,href:"/news/"+encodeURIComponent(p.slug||"")+keep})}).join("")
      +(n>1?'<button type="button" class="nnav prev" aria-label="Previous news">\u2039</button><button type="button" class="nnav next" aria-label="Next news">\u203A</button>'
        +'<div class="ndots">'+(reduced?"":'<button type="button" class="npause" aria-label="Pause the slideshow">\u275A\u275A</button>')
        +posts.map(function(p,i){return'<button type="button" class="nd" data-i="'+i+'" aria-label="Show news '+(i+1)+' of '+n+': '+esc(p.title)+'"></button>'}).join("")+'</div>':"")
      +'</div>';
    var root=box.firstChild,slides=[].slice.call(root.querySelectorAll(".nslide")),dots=[].slice.call(root.querySelectorAll(".nd")),pause=root.querySelector(".npause");
    slides.forEach(function(el,i){el.setAttribute("role","group");el.setAttribute("aria-roledescription","slide");el.setAttribute("aria-label",(i+1)+" of "+n)});
    function show(i){
      cur=(i+n)%n;
      slides.forEach(function(el,k){el.classList.toggle("on",k===cur);el.setAttribute("aria-hidden",String(k!==cur))});
      dots.forEach(function(d,k){d.setAttribute("aria-current",String(k===cur))});
    }
    function stopTimer(){if(timer){clearInterval(timer);timer=null}}
    function startTimer(){stopTimer();if(!stopped&&!hover&&!document.hidden)timer=setInterval(function(){show(cur+1)},EVERY)}
    function user(i){stopped=true;stopTimer();setPause();show(i)}   // once someone steers it, it stays where they put it
    function setPause(){if(pause){var on=!stopped;pause.textContent=on?"\u275A\u275A":"\u25B6";pause.setAttribute("aria-label",on?"Pause the slideshow":"Play the slideshow")}}
    show(0);setPause();startTimer();
    if(n>1){
      root.addEventListener("click",function(e){
        var b=e.target.closest&&e.target.closest("button");if(!b)return;
        if(b.classList.contains("nd"))user(+b.getAttribute("data-i"));
        else if(b.classList.contains("prev"))user(cur-1);
        else if(b.classList.contains("next"))user(cur+1);
        else if(b===pause){stopped=!stopped;setPause();startTimer()}
      });
      root.addEventListener("keydown",function(e){
        if(e.target.closest&&e.target.closest("a"))if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
        if(e.key==="ArrowRight"){e.preventDefault();user(cur+1)}else if(e.key==="ArrowLeft"){e.preventDefault();user(cur-1)}
        else if(e.key==="Home"){e.preventDefault();user(0)}else if(e.key==="End"){e.preventDefault();user(n-1)}
      });
      root.addEventListener("mouseenter",function(){hover=true;stopTimer()});root.addEventListener("mouseleave",function(){hover=false;startTimer()});
      root.addEventListener("focusin",stopTimer);root.addEventListener("focusout",function(){startTimer()});
      document.addEventListener("visibilitychange",startTimer);
      var x0=null,y0=0;   // swipe
      root.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse")return;x0=e.clientX;y0=e.clientY;stopTimer()});
      root.addEventListener("pointerup",function(e){
        if(x0===null)return;var dx=e.clientX-x0,dy=e.clientY-y0;x0=null;
        if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)user(dx<0?cur+1:cur-1);else startTimer();
      });
      root.addEventListener("pointercancel",function(){x0=null;startTimer()});
    }
    var all=sec.querySelector(".nall");if(all&&keep)all.setAttribute("href","/news"+keep);
    sec.hidden=false;
    if(location.hash==="#news")sec.scrollIntoView();
  }
  fetch(API+"/api/news?limit="+SLIDES+"&t="+Date.now(),{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(j){
    if(j&&Array.isArray(j.news)&&j.news.length)build(j.news);
  }).catch(function(){});
})();
