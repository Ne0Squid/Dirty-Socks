// Post-News page: the editor for news posts (formatting toolbar, preview, pictures) and the list of posts with Edit / Delete.
// Only accounts the service allows to post ever see anything here; everyone else (and anyone not signed in) gets the page-not-found view.
// The page never says who those people are or what group they belong to.
(function(){
  var main=document.getElementById("pn-main"),nf=document.getElementById("pn-nf"),formBox=document.getElementById("newsform"),listBox=document.getElementById("newslist"),okBox=document.getElementById("pn-ok");
  if(!main||!nf)return;
  var Q=new URLSearchParams(location.search);
  var API=String((location.hostname==="localhost"&&Q.get("api"))||window.DS_API||"").replace(/\/+$/,"");
  var tok=null;try{tok=localStorage.getItem("ds-session")}catch(e){}
  var posts=[],admin=false,editing=null,confirming=null,BODY_MAX=8000,DRAFT="ds-news-draft",TITLE=document.title,cvView=window.innerWidth<700?"phone":"desktop";
  var keep=location.hostname==="localhost"&&Q.get("api")?"?api="+encodeURIComponent(Q.get("api")):"";   // only for local testing: carry the test service along in links
  var esc=function(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
  var day=function(t){return new Date(t).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})};
  var auth=function(extra){var h={Authorization:"Bearer "+tok};for(var k in extra)h[k]=extra[k];return h};
  var fmt=function(src){return window.NewsFmt?window.NewsFmt.render(src,API):"<p>"+esc(src)+"</p>"};
  function showErr(form,msg){var e=form.querySelector(".nerr");e.textContent=msg;e.hidden=!msg}
  function say(msg){okBox.hidden=!msg;if(msg){okBox.innerHTML=msg;okBox.scrollIntoView({block:"nearest"})}}

  // ---- the editor ----
  var BAR=[["bold","<b>B</b>","Bold (Ctrl+B)","Bold"],["italic","<i>I</i>","Italic (Ctrl+I)","Italic"],["h","H","Heading","Heading"],["ul","• List","Bulleted list","Bulleted list"],["ol","1. List","Numbered list","Numbered list"],["quote","“","Quote","Quote"],["link","Link","Link","Link"],["hr","—","Divider line","Divider line"],["image","Picture","Add a picture","Add a picture"]];
  function loadDraft(){try{return JSON.parse(localStorage.getItem(DRAFT)||"null")||{}}catch(e){return{}}}
  function saveDraft(form){if(form.getAttribute("data-form")!=="new")return;try{var e=form.elements,t=e.title.value,b=e.body.value;if(t||b||e.cover.value)localStorage.setItem(DRAFT,JSON.stringify({title:t,body:b,cover:e.cover.value,fx:e.fx.value,fy:e.fy.value}));else localStorage.removeItem(DRAFT)}catch(x){}}
  function clearDraft(){try{localStorage.removeItem(DRAFT)}catch(e){}}
  function formHtml(p){
    var id=p?p.id:"new",d=p?{title:p.title,body:p.body,cover:p.cover,fx:p.fx,fy:p.fy}:loadDraft();
    var fx=+d.fx>=0?+d.fx:50,fy=+d.fy>=0?+d.fy:50;
    return '<form class="card nform" data-form="'+esc(id)+'" novalidate>'+(p?"":'<h3>Post news</h3>')
      +'<label>Title<input type="text" name="title" maxlength="120" required value="'+esc(d.title||"")+'"></label>'
      +'<div class="ncover"><div class="ncv-head"><strong>Cover photo</strong><span class="muted">Shown behind the title on the home page slider. Add one to make the post stand out.</span></div>'
      +'<input type="hidden" name="cover" value="'+esc(d.cover||"")+'"><input type="hidden" name="fx" value="'+fx+'"><input type="hidden" name="fy" value="'+fy+'">'
      +'<input type="file" data-cover-file accept="image/png,image/jpeg,image/webp,image/gif" hidden>'
      +'<div class="ncv-views" role="group" aria-label="Preview size"><span class="muted">Preview:</span><button type="button" data-cvview="desktop" aria-pressed="true">Computer</button><button type="button" data-cvview="phone" aria-pressed="false">Phone</button></div>'
      +'<div class="ncv-stage" data-drop></div>'
      +'<div class="ncv-ctl"><button type="button" data-cv="pick"></button><button type="button" data-cv="remove" hidden>Remove cover</button><span class="nstat ncv-stat" role="status"></span></div>'
      +'<div class="ncv-pos" hidden><label for="cvx-'+esc(id)+'">Move left / right</label><input id="cvx-'+esc(id)+'" type="range" min="0" max="100" value="'+fx+'" data-cvpos="fx"><label for="cvy-'+esc(id)+'">Move up / down</label><input id="cvy-'+esc(id)+'" type="range" min="0" max="100" value="'+fy+'" data-cvpos="fy"></div>'
      +'<p class="muted nhelp">The site crops the photo to fit, so check both sizes and slide it until the important part shows. Big photos are shrunk for you.</p></div>'
      +'<div class="ned"><div class="nbar" role="toolbar" aria-label="Formatting">'
      +BAR.map(function(b){return'<button type="button" data-fmt="'+b[0]+'" title="'+b[2]+'" aria-label="'+b[3]+'">'+b[1]+'</button>'}).join("")
      +'<input type="file" data-file accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>'
      +'<span class="ntabs"><button type="button" data-tab="write" aria-pressed="true">Write</button><button type="button" data-tab="preview" aria-pressed="false">Preview</button></span></div>'
      +'<textarea name="body" rows="9" maxlength="'+BODY_MAX+'" placeholder="Write your news here. Select text and use the buttons above to format it.">'+esc(d.body||"")+'</textarea>'
      +'<div class="nprev nmd" hidden></div>'
      +'<div class="nfoot"><span class="nstat" role="status"></span><span class="ncount"></span></div></div>'
      +'<label class="chk"><input type="checkbox" name="pinned"'+(p&&p.pinned?" checked":"")+'> Pin to the top</label>'
      +'<p class="nerr" role="alert" hidden></p>'
      +'<div class="nbtns"><button class="btn" type="submit">'+(p?"Save changes":"Post news")+'</button>'+(p?'<button class="btn ghost" type="button" data-a="cancel">Cancel</button>':"")+'</div>'
      +'<p class="muted nhelp">Pictures: use the Picture button, or paste or drag them into the box. Type a caption between the [ ] after adding one.</p></form>';
  }
  function ta(f){return f.elements.body}
  function edit(t,a,b,text,selA,selB){   // replace [a,b) with text (keeps undo working where the browser allows it), then select selA..selB
    t.focus();t.setSelectionRange(a,b);
    var done=false;try{done=document.execCommand("insertText",false,text)}catch(e){}
    if(!done||t.value.slice(a,a+text.length)!==text)t.setRangeText(text,a,b,"end");
    t.setSelectionRange(selA,selB);t.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function wrap(t,pre,post,ph){
    var v=t.value,a=t.selectionStart,b=t.selectionEnd;
    if(a!==b&&v.slice(a-pre.length,a)===pre&&v.slice(b,b+post.length)===post){edit(t,a-pre.length,b+post.length,v.slice(a,b),a-pre.length,b-pre.length);return}   // already wrapped: take it off
    var sel=v.slice(a,b)||ph;edit(t,a,b,pre+sel+post,a+pre.length,a+pre.length+sel.length);
  }
  function prefixLines(t,re,mk){
    var v=t.value,a=t.selectionStart,b=t.selectionEnd,ls=v.lastIndexOf("\n",a-1)+1,le=v.indexOf("\n",b);if(le<0)le=v.length;
    var block=v.slice(ls,le).split("\n"),real=block.filter(function(l){return l.trim()}),n=0,text;
    if(!real.length){text=mk(0);edit(t,ls,le,text,ls+text.length,ls+text.length);return}
    var all=real.every(function(l){return re.test(l)});
    text=block.map(function(l){return !l.trim()?l:all?l.replace(re,""):mk(n++)+l}).join("\n");
    edit(t,ls,le,text,ls,ls+text.length);
  }
  function padded(t,tok,caret){   // put tok on its own line, with a blank line around it
    var v=t.value,a=t.selectionStart,b=t.selectionEnd,ls=v.lastIndexOf("\n",a-1)+1,le=v.indexOf("\n",b);if(le<0)le=v.length;
    if(/^\s*!\[[^\]\n]*\]\(img:[a-z0-9]{6,40}\)\s*$/.test(v.slice(ls,le)))a=b=le;   // the caret is in a picture line (maybe typing its caption): go after it, never inside it
    var before=v.slice(0,a),after=v.slice(b);
    var pre=!before||/\n\n$/.test(before)?"":/\n$/.test(before)?"\n":"\n\n",post=!after||/^\n\n/.test(after)?"":/^\n/.test(after)?"\n":"\n\n";
    if(!after)post="\n\n";
    var pos=a+pre.length+(caret==null?tok.length:caret);
    edit(t,a,b,pre+tok+post,pos,pos);
  }
  function link(t){
    var v=t.value,a=t.selectionStart,b=t.selectionEnd,sel=v.slice(a,b),pre,txt,url;
    if(/^https?:\/\/\S+$/.test(sel)){edit(t,a,b,"[link]("+sel+")",a+1,a+5);return}
    txt=sel||"link text";edit(t,a,b,"["+txt+"](https://)",a+txt.length+3,a+txt.length+11);
  }
  function tool(form,name){
    var t=ta(form);
    if(name==="bold")wrap(t,"**","**","bold text");
    else if(name==="italic")wrap(t,"*","*","italic text");
    else if(name==="h")prefixLines(t,/^#{1,3}\s+/,function(){return"## "});
    else if(name==="ul")prefixLines(t,/^\s*[-*+]\s+/,function(){return"- "});
    else if(name==="ol")prefixLines(t,/^\s*\d+[.)]\s+/,function(i){return(i+1)+". "});
    else if(name==="quote")prefixLines(t,/^>\s?/,function(){return"> "});
    else if(name==="link")link(t);
    else if(name==="hr")padded(t,"---");
    else if(name==="image")form.querySelector("[data-file]").click();
  }
  function setTab(form,tab){
    var prev=tab==="preview",t=ta(form),box=form.querySelector(".nprev");
    form.querySelectorAll("[data-tab]").forEach(function(b){b.setAttribute("aria-pressed",String(b.getAttribute("data-tab")===tab))});
    form.querySelectorAll("[data-fmt]").forEach(function(b){b.disabled=prev});
    t.hidden=prev;box.hidden=!prev;
    if(prev){var title=form.elements.title.value.trim();box.innerHTML=(title?"<h3>"+esc(title)+"</h3>":"")+(t.value.trim()?fmt(t.value):'<p class="muted">Nothing to preview yet.</p>')}
    else t.focus();
  }
  function count(form){
    var n=ta(form).value.length,c=form.querySelector(".ncount");
    c.textContent=n>BODY_MAX*0.8?n+" / "+BODY_MAX:"";c.classList.toggle("over",n>=BODY_MAX);
  }
  // pictures: shrink in the browser (longest side 1600px), then upload, then drop a ![](img:ID) line into the text
  var IMG_MAX=780000,EDGE=1600;
  function toBlob(c,type,q){return new Promise(function(r){c.toBlob(r,type,q)})}
  function shrink(file,edge){
    edge=edge||EDGE;
    if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))return Promise.reject(new Error("Use a JPEG, PNG, WebP or GIF picture."));
    if(file.type==="image/gif")return file.size<=IMG_MAX?Promise.resolve(file):Promise.reject(new Error("That GIF is over 780 KB. Use a smaller or shorter one."));
    return new Promise(function(res,rej){
      var url=URL.createObjectURL(file),im=new Image();
      im.onerror=function(){URL.revokeObjectURL(url);rej(new Error("That picture could not be opened."))};
      im.onload=function(){
        URL.revokeObjectURL(url);
        var w=im.naturalWidth,h=im.naturalHeight,long=Math.max(w,h);
        if(file.size<=400000&&long<=edge)return res(file);   // already small: keep it exactly as it is
        var base=Math.min(1,edge/long),tries=[[1,.86],[1,.74],[.8,.7],[.65,.65],[.5,.6]],i=0;
        (function next(){
          var t=tries[i++];if(!t)return rej(new Error("Could not make that picture small enough. Try a smaller one."));
          var c=document.createElement("canvas");c.width=Math.max(1,Math.round(w*base*t[0]));c.height=Math.max(1,Math.round(h*base*t[0]));
          var g=c.getContext("2d");g.drawImage(im,0,0,c.width,c.height);
          toBlob(c,"image/webp",t[1]).then(function(b){
            if(b&&b.type==="image/webp")return b;
            g.globalCompositeOperation="destination-over";g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);   // no WebP here: JPEG, with a white background behind any transparency
            return toBlob(c,"image/jpeg",t[1]);
          }).then(function(b){if(b&&b.size<=IMG_MAX)res(b);else next()});
        })();
      };
      im.src=url;
    });
  }
  function upload(blob){
    return fetch(API+"/api/news/image",{method:"POST",headers:auth({"Content-Type":blob.type}),body:blob}).then(function(r){
      return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(r.status===401?"Your login expired. Log in again to add pictures.":(j&&j.error)||"The picture did not upload. Try again.");return j});
    });
  }
  function addFiles(form,files){
    files=[].slice.call(files||[]).filter(function(f){return/^image\//.test(f.type)});
    if(!files.length)return;
    var st=form.querySelector(".nstat"),t=ta(form);
    form._busy=(form._busy||0)+files.length;showErr(form,"");
    files.reduce(function(p,f,k){return p.then(function(){
      st.textContent="Uploading picture "+(k+1)+" of "+files.length+"…";
      return shrink(f).then(upload).then(function(j){padded(t,"![](img:"+j.id+")",2)}).catch(function(e){showErr(form,e&&e.message||"Could not add that picture.")}).then(function(){form._busy--});
    })},Promise.resolve()).then(function(){st.textContent=form._busy?st.textContent:""});
  }


  // ---- cover photo: a live preview of the home page slide, a picker, and two sliders for what stays in view ----
  function drawCover(form){
    var e=form.elements,stage=form.querySelector(".ncv-stage"),has=!!e.cover.value;
    var draft={title:e.title.value.trim()||"Your title goes here",body:e.body.value.trim()||"The first couple of sentences of your message show here, under the title.",slug:"preview"};
    if(has){draft.cover=e.cover.value;draft.fx=+e.fx.value;draft.fy=+e.fy.value}
    stage.innerHTML='<div class="nslider ncv-slider'+(cvView==="phone"?" ph":"")+'">'+window.NewsFmt.slide(draft,API,{href:"",eager:true})+'</div>';
    stage.querySelector(".nslide").classList.add("on");
    form.querySelector("[data-cv=pick]").textContent=has?"Change photo":"Add a cover photo";
    form.querySelector("[data-cv=remove]").hidden=!has;form.querySelector(".ncv-pos").hidden=!has;
    form.querySelectorAll("[data-cvview]").forEach(function(b){b.setAttribute("aria-pressed",String(b.getAttribute("data-cvview")===cvView))});
  }
  function syncCover(form){   // title or message changed: update the preview text without redrawing the picture
    var s=form.querySelector(".ncv-stage .nslide");if(!s)return;
    var e=form.elements,t=s.querySelector(".nstitle"),x=s.querySelector(".nsex");
    t.textContent=e.title.value.trim()||"Your title goes here";
    x.textContent=window.NewsFmt.excerpt(e.body.value)||"The first couple of sentences of your message show here, under the title.";
  }
  function setCover(form,id){var e=form.elements;e.cover.value=id||"";if(!id){e.fx.value=50;e.fy.value=50;form.querySelectorAll("[data-cvpos]").forEach(function(r){r.value=50})}drawCover(form);saveDraft(form)}
  function addCover(form,file){
    if(!file||!/^image\//.test(file.type))return;
    var st=form.querySelector(".ncv-stat");form._busy=(form._busy||0)+1;showErr(form,"");st.textContent="Uploading cover\u2026";
    shrink(file,1920).then(upload).then(function(j){setCover(form,j.id)}).catch(function(e){showErr(form,e&&e.message||"Could not add that picture.")}).then(function(){form._busy--;st.textContent=""});
  }

  // ---- posts ----
  function postHtml(p){
    if(editing===p.id)return formHtml(p);
    var tools='<div class="ntools">'+(confirming===p.id
      ?'<span>Delete this post?</span><button type="button" class="danger" data-a="del-yes" data-id="'+esc(p.id)+'">Yes, delete</button><button type="button" data-a="del-no">Cancel</button>'
      :'<button type="button" data-a="edit" data-id="'+esc(p.id)+'">Edit</button><button type="button" data-a="del" data-id="'+esc(p.id)+'">Delete</button><a class="ntlink" href="/news/'+encodeURIComponent(p.slug)+keep+'">View page</a>')+'</div>';
    var body=!p.body?"":p.md?'<div class="nbody nmd">'+fmt(p.body)+'</div>':'<p class="nbody">'+esc(p.body)+'</p>';
    return '<article class="card npost'+(p.pinned?" pinned":"")+'"><div class="nmeta">'+(p.pinned?'<span class="npin">Pinned</span>':"")+'<span>'+esc(day(p.at))+(p.edited?" \u00B7 edited":"")+'</span>'+(p.cover?'<span>\u00B7 has a cover photo</span>':'<span>\u00B7 no cover photo</span>')+'</div>'
      +'<h3>'+esc(p.title)+'</h3>'+body+tools+'</article>';
  }
  function drawList(){
    listBox.innerHTML=posts.length?'<div class="nlist">'+posts.map(postHtml).join("")+'</div>':'<p class="muted">No posts yet. Your first one will show up here.</p>';
    listBox.querySelectorAll("form[data-form]").forEach(function(f){count(f);drawCover(f)});
  }
  function drawForm(){formBox.innerHTML=formHtml(null);formBox.querySelectorAll("form[data-form]").forEach(function(f){count(f);drawCover(f)})}
  function reload(){
    return fetch(API+"/api/news?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(!j||!Array.isArray(j.news))return;
      posts=j.news;drawList();
    }).catch(function(){});
  }
  function save(form){
    var id=form.getAttribute("data-form"),isNew=id==="new",f=new FormData(form),btn=form.querySelector("button[type=submit]");
    var title=String(f.get("title")||"").trim();
    if(!title){showErr(form,"Give the post a title.");return}
    if(form._busy){showErr(form,"Wait for the picture to finish uploading.");return}
    showErr(form,"");btn.disabled=true;
    fetch(API+"/api/news"+(isNew?"":"?id="+encodeURIComponent(id)),{method:isNew?"POST":"PUT",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({title:title,body:String(f.get("body")||""),pinned:!!f.get("pinned"),cover:String(f.get("cover")||""),fx:Number(f.get("fx")),fy:Number(f.get("fy"))})})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,status:r.status,j:j}})})
      .then(function(res){
        btn.disabled=false;
        if(!res.ok){showErr(form,res.status===401?"Your login expired. Log in again to post.":(res.j&&res.j.error)||"Could not save that. Try again.");return}
        editing=null;
        if(isNew){clearDraft();drawForm()}
        var u="/news/"+encodeURIComponent((res.j.post&&res.j.post.slug)||"")+keep;
        say(isNew?'Posted. It is on the home page slider and has its own page now. <a href="'+u+'">Open the post page</a>':'Changes saved. <a href="'+u+'">Open the post page</a>');
        return reload();
      }).catch(function(){btn.disabled=false;showErr(form,"Could not reach the server. Try again.")});
  }
  main.addEventListener("submit",function(e){var f=e.target.closest&&e.target.closest("form[data-form]");if(!f)return;e.preventDefault();if(admin)save(f)});
  main.addEventListener("input",function(e){
    var f=e.target.closest&&e.target.closest("form[data-form]");if(!f)return;
    var pos=e.target.getAttribute&&e.target.getAttribute("data-cvpos");
    if(pos){f.elements[pos].value=e.target.value;var im=f.querySelector(".ncv-stage .nbg");if(im&&im.tagName==="IMG")im.style.objectPosition=f.elements.fx.value+"% "+f.elements.fy.value+"%";saveDraft(f);return}
    count(f);saveDraft(f);if(e.target.name==="title"||e.target.name==="body")syncCover(f);if(!okBox.hidden)say("");
  });
  main.addEventListener("change",function(e){
    if(!e.target.matches)return;
    var f=e.target.closest("form[data-form]");if(!f||!admin)return;
    if(e.target.matches("input[data-file]")){addFiles(f,e.target.files);e.target.value=""}
    else if(e.target.matches("input[data-cover-file]")){addCover(f,e.target.files[0]);e.target.value=""}
  });
  main.addEventListener("keydown",function(e){
    if(!admin||!(e.ctrlKey||e.metaKey)||e.altKey||!e.target.matches||!e.target.matches("textarea[name=body]"))return;
    var k=String(e.key).toLowerCase(),f=e.target.closest("form[data-form]");
    if(k==="b"||k==="i"){e.preventDefault();tool(f,k==="b"?"bold":"italic")}
  });
  main.addEventListener("paste",function(e){
    if(!admin||!e.target.matches||!e.target.matches("textarea[name=body]"))return;
    var files=[].slice.call((e.clipboardData&&e.clipboardData.files)||[]).filter(function(f){return/^image\//.test(f.type)});
    if(files.length){e.preventDefault();addFiles(e.target.closest("form[data-form]"),files)}
  });
  main.addEventListener("dragover",function(e){
    if(!admin||!e.target.closest||!e.dataTransfer||[].indexOf.call(e.dataTransfer.types||[],"Files")<0)return;
    if(e.target.matches("textarea[name=body]"))e.preventDefault();
    var z=e.target.closest("[data-drop]");if(z){e.preventDefault();z.classList.add("drag")}
  });
  main.addEventListener("dragleave",function(e){var z=e.target.closest&&e.target.closest("[data-drop]");if(z&&!z.contains(e.relatedTarget))z.classList.remove("drag")});
  main.addEventListener("drop",function(e){   // a picture dropped on the cover preview becomes the cover
    var z=admin&&e.target.closest&&e.target.closest("[data-drop]");if(!z)return;z.classList.remove("drag");
    var f=z.closest("form[data-form]"),file=[].slice.call((e.dataTransfer&&e.dataTransfer.files)||[]).filter(function(x){return/^image\//.test(x.type)})[0];
    if(f&&file){e.preventDefault();addCover(f,file)}
  });
  main.addEventListener("drop",function(e){
    if(!admin||!e.target.matches||!e.target.matches("textarea[name=body]"))return;
    var files=[].slice.call((e.dataTransfer&&e.dataTransfer.files)||[]).filter(function(f){return/^image\//.test(f.type)});
    if(files.length){e.preventDefault();addFiles(e.target.closest("form[data-form]"),files)}
  });
  main.addEventListener("click",function(e){
    var cv=e.target.closest&&e.target.closest("[data-cv],[data-cvview]");
    if(cv&&admin){
      var cf=cv.closest("form[data-form]");
      if(cf){
        if(cv.hasAttribute("data-cvview")){cvView=cv.getAttribute("data-cvview");document.querySelectorAll("#pn-main form[data-form]").forEach(drawCover)}
        else if(cv.getAttribute("data-cv")==="pick")cf.querySelector("[data-cover-file]").click();
        else setCover(cf,"");
        return;
      }
    }
    var t=e.target.closest&&e.target.closest("[data-fmt],[data-tab]");
    if(t&&admin){var form=t.closest("form[data-form]");if(form){if(t.hasAttribute("data-tab"))setTab(form,t.getAttribute("data-tab"));else tool(form,t.getAttribute("data-fmt"));return}}
    var b=e.target.closest&&e.target.closest("[data-a]");if(!b||!admin)return;
    var a=b.getAttribute("data-a"),id=b.getAttribute("data-id");
    if(a==="edit"){editing=id;confirming=null;drawList()}
    else if(a==="cancel"){editing=null;drawList()}
    else if(a==="del"){confirming=id;editing=null;drawList()}
    else if(a==="del-no"){confirming=null;drawList()}
    else if(a==="del-yes"){
      fetch(API+"/api/news?id="+encodeURIComponent(confirming),{method:"DELETE",headers:auth()}).then(function(r){confirming=null;if(r.ok)say("Post deleted.");return reload()}).catch(function(){confirming=null;drawList()});
    }
  });

  // ---- who may see this page ----
  function notFound(){main.hidden=true;nf.hidden=false;document.title=TITLE}
  function allow(){
    admin=true;nf.hidden=true;main.hidden=false;document.title="Post News \u2013 Dirty Socks";
    drawForm();reload();
  }
  if(!API||!tok){notFound();return}
  fetch(API+"/api/me",{headers:auth()}).then(function(r){return r.ok?r.json():null}).then(function(m){
    if(m&&m.webAdmin===true)allow();else notFound();
  }).catch(notFound);
})();
