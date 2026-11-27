(function(){
  var d=document,h=d.documentElement;h.setAttribute("data-xmas","1");
  // snow
  var c=d.createElement("canvas");c.id="xsnow";d.body.appendChild(c);
  var x=c.getContext("2d"),W,H,flakes=[];
  function size(){W=c.width=innerWidth;H=c.height=innerHeight;}
  size();addEventListener("resize",size);
  var n=innerWidth<700?45:90;
  for(var i=0;i<n;i++)flakes.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2.2+.8,s:Math.random()*.7+.35,d:Math.random()*6});
  var t=0;
  (function f(){t+=.01;x.clearRect(0,0,W,H);x.fillStyle="rgba(255,255,255,.85)";
    flakes.forEach(function(p){p.y+=p.s;p.x+=Math.sin(t+p.d)*.4;if(p.y>H+4){p.y=-4;p.x=Math.random()*W}
      x.beginPath();x.arc(p.x,p.y,p.r,0,6.283);x.fill()});
    requestAnimationFrame(f)})();
  // ribbon
  var r=d.createElement("div");r.className="xribbon";r.textContent="Happy Winter Veil from Dirty Socks";
  var nav=d.querySelector("nav");if(nav&&nav.parentNode)nav.parentNode.insertBefore(r,nav);
  // santa hats on splash logos
  d.querySelectorAll(".splash .sl").forEach(function(img){
    var w=d.createElement("span");w.className="xlogo "+(img.className.match(/sl-\w+/)||[""])[0];img.parentNode.insertBefore(w,img);w.appendChild(img);
    var s=d.createElementNS("http://www.w3.org/2000/svg","svg");s.setAttribute("viewBox","0 0 100 100");s.setAttribute("class","xhat");
    s.innerHTML='<path d="M12 78 Q18 20 62 12 Q56 34 84 62 Q88 70 84 80 Z" fill="#c8372d"/><path d="M8 74 Q50 92 90 74 L92 88 Q50 104 6 88 Z" fill="#fff"/><circle cx="66" cy="12" r="9" fill="#fff"/>';
    w.appendChild(s);
  });
})();
