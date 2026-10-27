/* Molette des projets d'agence : la liste tourne sur elle-même comme un sélecteur d'iPhone, sans fin, sans défilement de page.
   YMWheel(el, items, {rows, rowH, onCenter(k), onPick(k)}) → {go(k), get(), refresh()} */
(function(){
  var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.YMWheel=function(el,items,o){
    o=o||{};var N=items.length,rows=o.rows||9,rh=o.rowH||24,step=Math.PI/(rows+1),R=rh/Math.sin(step);
    var pos=0,vel=0,target=null,drag=null,raf=0,lastC=-1,idle=0,armed=false;
    el.classList.add("wh");el.tabIndex=0;el.setAttribute("role","listbox");
    el.style.height=Math.round(2*R*Math.sin(step*(rows-1)/2)+rh)+"px";
    var lens=document.createElement("div");lens.className="wh-lens";el.appendChild(lens);
    var E=items.map(function(it,k){var b=document.createElement("button");b.type="button";b.className="wh-it";b.setAttribute("role","option");b.innerHTML=it.html;b.tabIndex=-1;
      b.addEventListener("click",function(e){if(drag&&drag.moved>4)return;if(k===cur()){o.onPick&&o.onPick(k)}else{go(k,true)}});el.appendChild(b);return b});
    function wrap(x){x=((x%N)+N)%N;return x>N/2?x-N:x}
    function cur(){return ((Math.round(pos)%N)+N)%N}
    function draw(){var c=cur();for(var k=0;k<N;k++){var off=wrap(k-pos),a=off*step,b=E[k];
        if(Math.abs(a)>=Math.PI/2-.02){b.style.visibility="hidden";continue}b.style.visibility="";
        var y=R*Math.sin(a),s=Math.cos(a);b.style.transform="translateY("+y.toFixed(2)+"px) translateY(-50%) scaleY("+s.toFixed(3)+")";
        b.style.opacity=(Math.pow(s,2.2)).toFixed(3);b.classList.toggle("on",k===c);b.setAttribute("aria-selected",k===c)}
      if(c!==lastC){lastC=c;o.onCenter&&o.onCenter(c)}}
    function tick(){raf=0;var moving=false;
      if(drag){}else if(target!=null){var d=target-pos;pos+=d*(reduce?1:.2);if(Math.abs(d)<.002){pos=target;target=null;if(armed){armed=false;o.onPick&&o.onPick(cur())}}else moving=true}
      else if(Math.abs(vel)>.002){pos+=vel;vel*=.9;moving=true}
      else if(Math.abs(pos-Math.round(pos))>.001){target=Math.round(pos);moving=true}
      draw();if(moving||drag||target!=null)raf=requestAnimationFrame(tick)}
    function kick(){if(!raf)raf=requestAnimationFrame(tick)}
    function go(k,pick){var d=wrap(k-pos);target=pos+d;vel=0;armed=!!pick;kick()}
    el.addEventListener("wheel",function(e){e.preventDefault();target=null;vel+=e.deltaY/rh*.045;vel=Math.max(-.9,Math.min(.9,vel));kick()},{passive:false});
    el.addEventListener("pointerdown",function(e){drag={y:e.clientY,p:pos,moved:0,t:performance.now(),v:0};target=null;vel=0;kick()});
    el.addEventListener("pointermove",function(e){if(!drag)return;var dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.abs(dy));if(drag.moved>4&&!drag.cap){drag.cap=1;try{el.setPointerCapture(e.pointerId)}catch(_){}}var np=drag.p-dy/rh;var now=performance.now();drag.v=(np-pos)/Math.max(1,now-drag.t)*16;drag.t=now;pos=np;kick()});
    function up(){if(!drag)return;var m=drag.moved;vel=m>4?Math.max(-.9,Math.min(.9,drag.v)):0;setTimeout(function(){drag=null;kick()},0)}
    el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up);
    el.addEventListener("keydown",function(e){if(e.key==="ArrowDown"){e.preventDefault();go(Math.round(pos)+1)}else if(e.key==="ArrowUp"){e.preventDefault();go(Math.round(pos)-1)}else if(e.key==="Enter"||e.key===" "){e.preventDefault();o.onPick&&o.onPick(cur())}});
    draw();
    return {go:go,get:cur,refresh:draw,el:el}};
})();
