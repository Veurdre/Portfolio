/* Page Agence : la molette des 47 projets à gauche, la fiche du projet à droite. Tout tient dans l'écran. */
(function(){
  var $=function(id){return document.getElementById(id)};if(!$("agW"))return;
  var HM="https://hamonic-masson.com/projet/",AG=[],W=null,k0=-1;
  function im(p,t){if(p.img&&p.img.length)return "img/agx/"+p.img[0]+".jpg";if(p.im)return "img/ag/"+p.im+".jpg";return ""}
  function show(k){if(k===k0)return;k0=k;var p=AG[k],D=$("agD"),src=im(p),conf=!p.u;
    D.classList.remove("vis");
    D.innerHTML='<figure class="agp-f'+(conf?' conf':'')+(src?'':' none')+'">'+(src?'<img src="'+src+'" alt="'+p.t.replace(/"/g,"&quot;")+'">':'<span class="agp-no">Pas d’image</span>')+
      (conf?'<button type="button" class="stamp" title="Lever le secret"><b>Confidentiel</b><small>non publié par l’agence</small></button>':'')+'</figure>'+
      '<div class="agp-t"><p class="eb">'+p.y+' · '+p.c+'</p><h3>'+p.t+'</h3></div>'+
      '<dl class="agp-dl"><div><dt>Programme</dt><dd>'+p.n+'</dd></div><div><dt>Surface</dt><dd>'+p.s+'</dd></div><div><dt>Phase</dt><dd>'+p.ph+'</dd></div>'+(p.st?'<div><dt>Statut</dt><dd>'+p.st+'</dd></div>':'')+'<div><dt>Rôle</dt><dd>'+p.r+'</dd></div></dl>'+
      '<div class="agp-n">'+(p.u?'<a class="lk" href="'+HM+p.u+'" target="_blank" rel="noopener">Fiche sur hamonic-masson.com ↗</a>':'<span></span>')+
      '<span class="ct"><button type="button" class="pv" aria-label="Projet précédent">‹</button><span>'+String(k+1).padStart(2,"0")+' / '+AG.length+'</span><button type="button" class="nx" aria-label="Projet suivant">›</button></span></div>';
    var st=D.querySelector(".stamp");if(st)st.onclick=function(){D.querySelector("figure").classList.toggle("open")};
    D.querySelector(".pv").onclick=function(){W.go(k-1)};D.querySelector(".nx").onclick=function(){W.go(k+1)};
    requestAnimationFrame(function(){D.classList.add("vis")});
    var y=p.y.slice(0,4);document.querySelectorAll("#agY button").forEach(function(b){b.classList.toggle("on",b.dataset.y===y)})}
  var built=false;
  function build(){if(built||$("v-agence").hidden||!AG.length)return;built=true;
    var rh=32,av=innerWidth<=760?0:$("agW").parentNode.clientHeight-$("agY").offsetHeight-40,rows=7;
    // la molette prend toute la hauteur disponible, à côté de l'image
    for(var n=7;n<=31;n+=2){var st=Math.PI/(n+1),hh=2*(rh/Math.sin(st))*Math.sin(st*(n-1)/2)+rh;if(hh<=av)rows=n}
    W=YMWheel($("agW"),AG.map(function(p){return {html:"<i>"+p.y.slice(0,4)+"</i><b>"+p.t+"</b><span>"+(p.t!==p.c?p.c:"")+"</span>"}}),{rows:rows,rowH:rh,onCenter:show,onPick:show})}
  new MutationObserver(build).observe($("v-agence"),{attributes:true,attributeFilter:["hidden"]});
  fetch("data/globe/agence.json").then(function(r){return r.json()}).then(function(j){AG=j.p;$("agCount").textContent=AG.length;
    // frise : une année par case, un trait par projet
    var ys=[];AG.forEach(function(p,k){var y=p.y.slice(0,4),e=ys.filter(function(e){return e[0]===y})[0];if(e)e[2]++;else ys.push([y,k,1])});
    $("agY").innerHTML=ys.map(function(e){return '<button type="button" data-y="'+e[0]+'" data-k="'+e[1]+'" title="'+e[0]+' : '+e[2]+' projet'+(e[2]>1?'s':'')+'"><b>'+e[0].slice(2)+'</b><i>'+'<s></s>'.repeat(e[2])+'</i></button>'}).join("");
    document.querySelectorAll("#agY button").forEach(function(b){b.onclick=function(){W&&W.go(+b.dataset.k)}});
    build();
    addEventListener("keydown",function(e){if(!W||$("v-agence").hidden||/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;if(document.activeElement===$("agW"))return;
      if(e.key==="ArrowDown"||e.key==="ArrowRight"){W.go(W.get()+1)}else if(e.key==="ArrowUp"||e.key==="ArrowLeft"){W.go(W.get()-1)}})});
})();
