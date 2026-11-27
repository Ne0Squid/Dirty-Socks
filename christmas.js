/* Dirty Socks — Winter Veil / Christmas theme builder. Everything is generated here so the HTML pages stay untouched. */
(function(){
  var d=document,h=d.documentElement,NS="http://www.w3.org/2000/svg";
  if(h.hasAttribute("data-xmas"))return;
  h.setAttribute("data-xmas","1");
  var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
  function el(tag,cls,html){var e=d.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  var SF='<i class="xsf"></i>';

  /* ---------- ribbon ---------- */
  (function(){
    var now=new Date(),xm=new Date(now.getFullYear(),11,25),days=Math.ceil((xm-now)/864e5);
    var msg=days>1?days+" days until Christmas":days===1?"Christmas is tomorrow":days===0?"Merry Christmas!":"";
    var r=el("div","xribbon",SF+'<span>Happy <b>Winter Veil</b> from Dirty Socks</span>'+(msg?'<span class="xd">&middot; '+msg+'</span>':'')+SF);
    var nav=d.querySelector("nav");if(nav&&nav.parentNode)nav.parentNode.insertBefore(r,nav);
  })();

  /* ---------- string lights + hanging baubles under the nav ---------- */
  var cols=["#ff3b30","#ffc83d","#35c46a","#3d9bff","#ff7ac0"],orn=[["#e0392f","#7a120d"],["#f4c552","#8a6410"],["#4aa3ff","#143f7a"],["#35c46a","#0e5128"]];
  function buildLights(nav,box){
    var W=nav.clientWidth,span=W<640?78:116,n=Math.ceil(W/span)+2,H=58,k=0,o=0;
    var s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true"><defs>';
    cols.forEach(function(c,i){s+='<radialGradient id="xg'+i+'"><stop offset="0" stop-color="'+c+'" stop-opacity=".85"/><stop offset=".45" stop-color="'+c+'" stop-opacity=".3"/><stop offset="1" stop-color="'+c+'" stop-opacity="0"/></radialGradient>'});
    orn.forEach(function(c,i){s+='<radialGradient id="xo'+i+'" cx=".33" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="'+c[0]+'"/><stop offset="1" stop-color="'+c[1]+'"/></radialGradient>'});
    s+='</defs>';
    var wire="",bulbs="",ob="";
    for(var i=0;i<n;i++){
      var x0=i*span-span*.4,x2=x0+span,dep=11+(i%2)*5,cx=x0+span/2,cy=1+dep*2;
      wire+='M'+x0+' 1Q'+cx+' '+cy+' '+x2+' 1';
      [.14,.38,.62,.86].forEach(function(t){
        var u=1-t,x=u*u*x0+2*u*t*cx+t*t*x2,y=u*u*1+2*u*t*cy+t*t*1;
        var tx=2*u*(cx-x0)+2*t*(x2-cx),ty=2*u*(cy-1)+2*t*(1-cy),a=Math.atan2(ty,tx)*180/Math.PI*.6;
        var ci=k%cols.length;
        bulbs+='<g class="xb k'+(k%4)+'" transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+') rotate('+a.toFixed(1)+')"><circle cx="0" cy="9" r="12" fill="url(#xg'+ci+')"/><rect x="-2" y="-1" width="4" height="5" rx="1" fill="#10261a"/><path d="M-3.3 3.5Q-4.6 10.5 0 13Q4.6 10.5 3.3 3.5Z" fill="'+cols[ci]+'"/><ellipse cx="-1.2" cy="7" rx=".9" ry="2" fill="#fff" opacity=".55"/></g>';
        k++;
      });
      if(i%3===1){
        var ux=x0+span/2,uy=1+dep,len=7+(o%3)*5,r=7.5,oc=o%orn.length;
        ob+='<g class="xo k'+(o%3)+'" style="transform-origin:'+ux.toFixed(1)+'px '+uy.toFixed(1)+'px"><line x1="'+ux+'" y1="'+uy+'" x2="'+ux+'" y2="'+(uy+len)+'" stroke="#c9b27a" stroke-width="1"/><rect x="'+(ux-2.5)+'" y="'+(uy+len)+'" width="5" height="3.5" rx="1" fill="#d8b24a"/><circle cx="'+ux+'" cy="'+(uy+len+3.5+r)+'" r="'+r+'" fill="url(#xo'+oc+')"/></g>';
        o++;
      }
    }
    s+='<path class="xw" d="'+wire+'"/>'+ob+bulbs+'</svg>';
    box.innerHTML=s;
  }
  (function(){
    var nav=d.querySelector("nav");if(!nav)return;
    var box=el("div","xlights");nav.appendChild(box);
    buildLights(nav,box);
    var t,lw=nav.clientWidth;
    addEventListener("resize",function(){clearTimeout(t);t=setTimeout(function(){if(nav.clientWidth!==lw){lw=nav.clientWidth;buildLights(nav,box)}},120)});
  })();

  /* ---------- santa hats ---------- */
  var HATS='<svg class="xhat" viewBox="0 0 130 100" aria-hidden="true"><defs><linearGradient id="xhb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f05a4d"/><stop offset=".55" stop-color="#cf3328"/><stop offset="1" stop-color="#8e1f19"/></linearGradient><linearGradient id="xht" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfdbea"/></linearGradient><radialGradient id="xhp" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#c3d2e4"/></radialGradient></defs>'
   +'<path d="M14 76C16 36 46 8 82 15C104 20 118 40 114 66L102 80Z" fill="url(#xhb)"/>'
   +'<path d="M30 74C36 44 54 24 78 22C70 36 62 54 64 76Z" fill="#fff" opacity=".12"/>'
   +'<path d="M84 18C104 26 114 46 108 72L102 80C106 58 100 38 84 18Z" fill="#5c0f0a" opacity=".3"/>'
   +'<rect x="3" y="68" width="108" height="23" rx="11.5" fill="url(#xht)"/>'
   +'<g fill="#fff" opacity=".9"><circle cx="9" cy="72" r="3.4"/><circle cx="22" cy="90" r="3.2"/><circle cx="46" cy="91" r="3"/><circle cx="76" cy="91" r="3.2"/><circle cx="102" cy="89" r="3.6"/><circle cx="108" cy="76" r="3.2"/><circle cx="6" cy="84" r="3.2"/></g>'
   +'<g fill="#b9c9dc" opacity=".55"><circle cx="30" cy="80" r="1.6"/><circle cx="60" cy="78" r="1.4"/><circle cx="88" cy="81" r="1.6"/></g>'
   +'<circle cx="114" cy="68" r="12" fill="url(#xhp)"/><g fill="#fff"><circle cx="105" cy="65" r="4"/><circle cx="122" cy="72" r="4"/><circle cx="112" cy="79" r="4"/></g></svg>';
  var hn=0;
  d.querySelectorAll(".splash .sl, nav .logo").forEach(function(img){
    var m=img.className.match(/(?:sl|logo)-(?:horde|alliance)/),w=el("span","xlogo "+(m?m[0]:""));
    img.parentNode.insertBefore(w,img);w.appendChild(img);hn++;w.insertAdjacentHTML("beforeend",HATS.replace(/(xh[btp])(?=["\)])/g,"$1"+hn));
  });

  /* ---------- hero: pine garland corners, warm glow, snowy drift ---------- */
  function garland(){
    var R=rng(7),P0=[-12,-16],C=[180,170],P2=[372,-16],cols=["#1c5836","#256f42","#154a2c","#35884f","#2a7a47"],g="",needles="";
    function B(t){var u=1-t;return[u*u*P0[0]+2*u*t*C[0]+t*t*P2[0],u*u*P0[1]+2*u*t*C[1]+t*t*P2[1]]}
    function T(t){var u=1-t;return Math.atan2(2*u*(C[1]-P0[1])+2*t*(P2[1]-C[1]),2*u*(C[0]-P0[0])+2*t*(P2[0]-C[0]))}
    for(var t=0;t<=1;t+=.0105){
      var p=B(t),a=T(t),taper=.45+.55*Math.sin(Math.PI*Math.min(1,t*1.02)),len;
      for(var side=-1;side<=1;side+=2){
        for(var j=0;j<2;j++){
          len=(15+R()*14)*taper;var ang=a+side*(.55+R()*.9),ex=p[0]+Math.cos(ang)*len,ey=p[1]+Math.sin(ang)*len;
          needles+='<path d="M'+p[0].toFixed(1)+' '+p[1].toFixed(1)+'L'+ex.toFixed(1)+' '+ey.toFixed(1)+'" stroke="'+cols[(R()*cols.length)|0]+'" stroke-width="'+(2+R()*1.6).toFixed(1)+'" stroke-linecap="round"/>';
        }
      }
    }
    var stem='M'+P0[0]+' '+P0[1]+'Q'+C[0]+' '+C[1]+' '+P2[0]+' '+P2[1];
    var deco="",oc=[["#e0392f","#7a120d"],["#f4c552","#8a6410"],["#4aa3ff","#143f7a"],["#e0392f","#7a120d"],["#f4c552","#8a6410"]];
    [[.17,8,0],[.31,8.5,1],[.5,9.5,2],[.69,8.5,3],[.83,8,4]].forEach(function(o){var p=B(o[0]);
      deco+='<circle cx="'+p[0].toFixed(1)+'" cy="'+(p[1]+7).toFixed(1)+'" r="'+o[1]+'" fill="url(#xgo'+o[2]+')"/><rect x="'+(p[0]-2.5).toFixed(1)+'" y="'+(p[1]-1.5).toFixed(1)+'" width="5" height="4" rx="1" fill="#d8b24a"/>'});
    [.24,.4,.6,.76].forEach(function(t){var p=B(t);deco+='<g fill="#c8201a"><circle cx="'+(p[0]-4)+'" cy="'+(p[1]+3)+'" r="3"/><circle cx="'+(p[0]+3)+'" cy="'+(p[1]+4)+'" r="3"/><circle cx="'+p[0]+'" cy="'+(p[1]+8)+'" r="3"/></g><g fill="#fff" opacity=".6"><circle cx="'+(p[0]-5)+'" cy="'+(p[1]+2)+'" r=".9"/><circle cx="'+(p[0]+2)+'" cy="'+(p[1]+3)+'" r=".9"/></g>'});
    var fl="";[.12,.24,.4,.6,.76,.88].forEach(function(t,i){var p=B(t);fl+='<g class="xtw k'+(i%3)+'"><circle cx="'+p[0].toFixed(1)+'" cy="'+(p[1]-3).toFixed(1)+'" r="9" fill="url(#xgl)"/><circle cx="'+p[0].toFixed(1)+'" cy="'+(p[1]-3).toFixed(1)+'" r="2.2" fill="#fff6d6"/></g>'});
    function bowAt(p,sc){return'<g transform="translate('+p[0].toFixed(1)+' '+(p[1]+2).toFixed(1)+') scale('+sc+')">'+BOW+'</g>'}
    var BOW='<path d="M0 0C-26-18-34 6-18 12C-8 14-2 6 0 0Z" fill="#c8201a"/><path d="M0 0C26-18 34 6 18 12C8 14 2 6 0 0Z" fill="#d83a30"/><path d="M-2 4L-16 36L-7 31L-2 40Z" fill="#a51a14"/><path d="M2 4L16 34L7 30L2 38Z" fill="#b8231b"/><circle cx="0" cy="2" r="6" fill="#e8483c"/><path d="M-4 0Q0 -3 4 0" stroke="#fff" stroke-opacity=".5" fill="none"/>';
    var grads=oc.map(function(c,i){return'<radialGradient id="xgo'+i+'" cx=".33" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".2" stop-color="'+c[0]+'"/><stop offset="1" stop-color="'+c[1]+'"/></radialGradient>'}).join("");
    return'<svg class="xg" viewBox="-14 -10 400 150" aria-hidden="true"><defs>'+grads+'<radialGradient id="xgl"><stop offset="0" stop-color="#ffd987" stop-opacity=".9"/><stop offset="1" stop-color="#ffd987" stop-opacity="0"/></radialGradient></defs><path d="'+stem+'" stroke="#2d1d10" stroke-width="4" fill="none" stroke-linecap="round"/>'+needles+deco+fl+bowAt(B(.07),1)+bowAt(B(.93),.8)+'</svg>';
  }
  var sp=d.querySelector(".splash");
  if(sp){
    var back=el("div","xback",'<svg class="xdrift" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="xd1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7fbff"/><stop offset="1" stop-color="#c5d8ef"/></linearGradient><linearGradient id="xd2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb8d8"/><stop offset="1" stop-color="#6d8bb3"/></linearGradient></defs><path d="M0 70C120 38 240 52 360 62C520 76 640 30 800 44C960 58 1100 78 1240 50C1320 36 1390 44 1440 54V120H0Z" fill="url(#xd2)" opacity=".75"/><path d="M0 92C150 64 280 80 430 88C580 96 700 62 860 74C1020 86 1160 100 1300 76C1370 66 1410 70 1440 76V120H0Z" fill="url(#xd1)"/></svg>');
    var front=el("div","xfront",garland().replace('class="xg"','class="xg l"')+garland().replace('class="xg"','class="xg r"').replace(/id="(xg\w*|xgo\d|xgl)"/g,'id="$1b"').replace(/url\(#(xg\w*|xgo\d|xgl)\)/g,'url(#$1b)'));
    sp.insertBefore(back,sp.firstChild);sp.appendChild(front);
  }

  /* ---------- footer ---------- */
  var fb=d.querySelector(".fbrand");
  if(fb)fb.appendChild(el("div","xftag",SF+"Happy Winter Veil &amp; Merry Christmas"+SF));

  /* ---------- snow (two depth layers, gentle wind gusts) ---------- */
  var c=el("canvas");c.id="xsnow";c.setAttribute("aria-hidden","true");d.body.appendChild(c);
  var x=c.getContext("2d"),W=0,H=0,dpr=1,fl=[],on=true,last=0,t=0;
  try{on=localStorage.getItem("ds-snow")!=="off"}catch(e){}
  function size(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;c.width=W*dpr;c.height=H*dpr;x.setTransform(dpr,0,0,dpr,0,0)}
  size();addEventListener("resize",size);
  var N=innerWidth<700?70:150;
  for(var i=0;i<N;i++){var z=Math.pow(Math.random(),1.6);fl.push({x:Math.random()*W,y:Math.random()*H,z:z,r:.7+z*2.6,v:28+z*70,p:Math.random()*6.28,s:.4+Math.random()*.8})}
  function frame(ts){
    requestAnimationFrame(frame);
    var dt=Math.min(.05,(ts-last)/1000||0);last=ts;
    if(!on||reduce){return}
    t+=dt;x.clearRect(0,0,W,H);
    var gust=Math.sin(t*.22)*14+Math.sin(t*.07)*10;
    for(var i=0;i<fl.length;i++){
      var f=fl[i];f.y+=f.v*dt;f.x+=(Math.sin(t*f.s+f.p)*12+gust*(.4+f.z))*dt;
      if(f.y>H+6){f.y=-6;f.x=Math.random()*W}
      if(f.x>W+6)f.x=-6;else if(f.x<-6)f.x=W+6;
      x.globalAlpha=.35+f.z*.6;x.fillStyle="#fff";
      x.beginPath();x.arc(f.x,f.y,f.r,0,6.2832);x.fill();
      if(f.z>.8){x.globalAlpha=.12;x.beginPath();x.arc(f.x,f.y,f.r*2.2,0,6.2832);x.fill()}
    }
    x.globalAlpha=1;
  }
  requestAnimationFrame(frame);
  var b=el("button","xtoggle",SF);b.type="button";b.title="Snow on/off";b.setAttribute("aria-label","Toggle snow");
  function paint(){b.setAttribute("aria-pressed",on?"true":"false");c.style.display=on?"":"none";if(!on)x.clearRect(0,0,W,H)}
  b.addEventListener("click",function(){on=!on;try{localStorage.setItem("ds-snow",on?"on":"off")}catch(e){}paint()});
  paint();d.body.appendChild(b);
})();
