// Equilibrium (concours, Sagres, Portugal). Maquette tirée du modèle SketchUp du projet (export STL d'Yves, « MODEL 9 ») :
// le triangle du projet est gardé fidèle ; le site (pointe de Sagres, falaises en courbes) vient du même modèle ; la mer autour est ajoutée.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { toCreasedNormals, mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function css(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// lit le modèle : sommets en uint16 rangés par axe, puis indices codés en écarts, le tout compressé (gzip)
async function loadModel(url) {
  const meta = await (await fetch(url)).json();
  const bin = atob(meta.gz), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(ds).arrayBuffer();
  const nv = meta.nv, q = new Uint16Array(buf, 0, nv * 3);
  const P = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) P[i * 3 + a] = meta.lo[a] + q[a * nv + i] * meta.sc[a];
  let off = nv * 6; const parts = {};
  for (const [name, n, k] of meta.parts) {
    const d = new Int32Array(buf.slice(off, off + n * k * 4)); off += n * k * 4;
    const ix = new Uint32Array(n * k); let acc = 0;
    for (let i = 0; i < d.length; i++) { acc += d[i]; ix[i] = acc; }
    parts[name] = ix;
  }
  return { P, parts, meta };
}

export function mount(host, opts = {}) {
  const th = document.documentElement.dataset.theme;
  const dark = th === "dark" || (th !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const C = {
    paper: new THREE.Color(css("--bg", dark ? "#1a1918" : "#ffffff")), // fond = fond du site : on ne voit pas le cadre
    model: new THREE.Color(dark ? "#1d2023" : "#fdfcfa"),
    city: new THREE.Color(dark ? "#272b2f" : "#e2ddd3"),
    screen: new THREE.Color(dark ? "#3f5a6a" : "#a9a49c"),
    ink: new THREE.Color(dark ? "#9fd6f4" : "#1d1b19"),
    brick: new THREE.Color(css("--brick", "#b46a5a")),
    sage: new THREE.Color(dark ? "#2c4a3a" : "#cdd6c4"),
    ballast: new THREE.Color(dark ? "#202427" : "#e2ddd5"),
    // code couleur des photobioréacteurs : le vert des microalgues
    algae: new THREE.Color(dark ? "#5f8571" : "#8fb59c"),
    park: new THREE.Color(dark ? "#1b221e" : "#e1e8d9"),
    water: new THREE.Color(dark ? "#26394a" : "#c9dce8"),
    glass: new THREE.Color(dark ? "#5d7280" : "#cfdde4"),
  };

  const W = () => host.clientWidth, H = () => host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.capture });
  renderer.setPixelRatio(Math.min(2, Math.max(1.5, devicePixelRatio || 1))); // sur écran standard, rendu suréchantillonné : traits plus fins
  const LK = 0.68; // intensité des traits (Yves : arêtes plus fines, « scalpel »)
  renderer.setSize(W(), H());
  renderer.setClearColor(C.paper);
  host.appendChild(renderer.domElement);
  if (dark) renderer.domElement.style.filter = "drop-shadow(0 0 2px rgba(130,200,238,.18))";   // nuit : palette et halo du globe

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.paper, 450, 1500);   // la mer se fond dans le fond de la page : pas de cadre visible
  const camera = new THREE.PerspectiveCamera(34, W() / H(), 1, 8000);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 20;
  controls.maxDistance = 2600;
  controls.maxPolarAngle = Math.PI * 0.62;
  // contre-plongée : l'orbite peut descendre jusqu'au ras du sol, sans passer dessous
  controls.addEventListener("change", () => { const mn = 3; if (camera.position.y < mn) camera.position.y = mn; });

  scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x3a3835 : 0xe9e4dc, dark ? 1.2 : 1.75));
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.0 : 1.2);
  sun.position.set(-0.45, 1, 0.55); scene.add(sun);

  // ombres portées (comme Sospesa) : posées une fois la maquette chargée, cadrées sur la scène
  function shadows() {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const b = new THREE.Box3(); scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox); } });
    const c = b.isEmpty() ? controls.target.clone() : b.getCenter(new THREE.Vector3()), s = b.isEmpty() ? new THREE.Vector3(800, 0, 800) : b.getSize(new THREE.Vector3());
    const h = Math.min(650, Math.max(120, Math.max(s.x, s.z) / 2));
    const d = new THREE.Vector3(-0.45, 1, 0.55).normalize();
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); renderer.shadowMap.autoUpdate = false;   // scène fixe : ombres calculées une fois, pas à chaque image
    sun.target.position.copy(c); scene.add(sun.target); sun.position.copy(c).addScaledVector(d, 1500);
    const sc = sun.shadow.camera; sc.left = -h; sc.right = h; sc.top = h; sc.bottom = -h; sc.near = 10; sc.far = 3500; sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; [].concat(o.material).forEach((m) => { if (m) m.needsUpdate = true; }); } });
    renderer.shadowMap.needsUpdate = true;
  }

  const wait = document.createElement("div");
  wait.className = "g3-load"; wait.textContent = "Chargement de la maquette…";
  wait.style.cssText = "pointer-events:none;transition:opacity .6s;opacity:0";
  host.appendChild(wait);
  // on arrive sur l'image : la maquette se charge derrière, sans écran d'attente
  let loaded = false;

  let alive = true;
  const fade = [];
  loadModel(new URL("../data/equilibrium.json?v=1", import.meta.url)).then(({ P, parts, meta }) => {
    if (!alive) return;
    const pos = new THREE.BufferAttribute(P, 3);
    const mesh = (ix, color, extra = {}) => {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", pos); g.setIndex(new THREE.BufferAttribute(ix, 1));
      // normales par face, calculées d’un coup (comme Agri) : le lissage des arêtes coûtait plusieurs secondes au chargement
      const g2 = g.toNonIndexed(); g2.computeVertexNormals(); g.dispose();
      const m = new THREE.MeshLambertMaterial(Object.assign({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, extra));
      scene.add(new THREE.Mesh(g2, m));
    };
    const lines = (ix, color, op, near = 1e9, lo = 0.25) => {
      op *= LK;
      const g = new THREE.BufferGeometry(); g.setAttribute("position", pos); g.setIndex(new THREE.BufferAttribute(ix, 1));
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: op });
      fade.push({ m, op, near, lo });
      scene.add(new THREE.LineSegments(g, m));
    };
    mesh(parts.c, C.city);
    // la mer : un grand plan au niveau de l'eau (le bloc du modèle ne couvrait que le cadre du site)
    { const sea = new THREE.Mesh(new THREE.CircleGeometry(4200, 96).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: C.water }));
      sea.position.y = -0.05; scene.add(sea); }
    // le trait de côte : bords de l'eau du modèle, sans les bords du cadre
    if (parts.w) { const w = parts.w, cnt = new Map(), key = (a, b) => a < b ? a + "_" + b : b + "_" + a;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < w.length; i++) { const v = w[i] * 3; x0 = Math.min(x0, P[v]); x1 = Math.max(x1, P[v]); z0 = Math.min(z0, P[v + 2]); z1 = Math.max(z1, P[v + 2]); }
      const onB = (v) => Math.abs(P[v] - x0) < 0.5 || Math.abs(P[v] - x1) < 0.5 || Math.abs(P[v + 2] - z0) < 0.5 || Math.abs(P[v + 2] - z1) < 0.5;
      for (let i = 0; i < w.length; i += 3) for (const [a, b] of [[w[i], w[i + 1]], [w[i + 1], w[i + 2]], [w[i + 2], w[i]]]) { const k = key(a, b); cnt.set(k, (cnt.get(k) || 0) + 1); }
      const sh = []; for (const [k, n] of cnt) if (n === 1) { const [a, b] = k.split("_").map(Number); if (onB(a * 3) && onB(b * 3)) continue; for (const v of [a, b]) sh.push(P[v * 3], P[v * 3 + 1] + 0.35, P[v * 3 + 2]); }
      const gs = new THREE.BufferGeometry(); gs.setAttribute("position", new THREE.Float32BufferAttribute(sh, 3));
      const ms = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: (dark ? 0.9 : 0.75) * LK }); fade.push({ m: ms, op: (dark ? 0.9 : 0.75) * LK, near: 1e9, lo: 0.7 });
      scene.add(new THREE.LineSegments(gs, ms)); }
    mesh(parts.p, C.model);
    lines(parts.cl, C.ink, dark ? 0.45 : 0.36);
    // la résille de la tour est très dense : ses traits s'effacent avec la distance
    lines(parts.pl, C.ink, dark ? 0.95 : 0.8, 600, 0.7);   // arêtes du projet : bien lisibles, à peine estompées au loin
    // montants et petits détails : visibles de près seulement
    if (parts.pd) lines(parts.pd, C.ink, dark ? 0.62 : 0.48, 160, 0);   // marches, garde-corps : de près seulement
    wait.style.opacity = 0; setTimeout(() => wait.remove(), 700);
    shadows();
    if (!MEDIA.ensemble) heroC.style.opacity = 1;   // pas encore de rendu : la maquette s'affiche directement
    loaded = true; controls.enabled = true; if (hero) prepCut(hero); else if (!KEEP) heroIn("ensemble");
  }).catch(() => { wait.textContent = "Maquette indisponible"; });


  let lifeStep = null;
  const lineMat = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.42 * LK });

  let labOn = true;
  const labels_ = (on) => { labOn = on; };
  /* ---------- étiquettes : le programme, d'après la notice du projet ---------- */
  const labels = [   // les trois pointes (notice d'Yves) : cap Saint-Vincent / ciel, forteresse de Beliche / terre, forteresse de Sagres / mer
    { t: "Ciel", s: "pointe vers le cap Saint-Vincent", p: [-45.1, 53, -3.7], st: 64 },
    { t: "Terre", s: "ancrée dans le sol, vers la forteresse de Beliche", p: [43.6, 53, -49.9], st: 78 },
    { t: "Mer", s: "s’élance vers la forteresse de Sagres", p: [37.3, 38, 49.1], st: 24 },
  ].map((l) => {
    const d = document.createElement("div"); d.className = "g3-lab";
    d.innerHTML = "<b>" + l.t + "</b><span>" + l.s + "</span>"; if (l.st) d.style.setProperty("--st", l.st + "px"); host.appendChild(d);
    return Object.assign(l, { el: d, v: new THREE.Vector3(...l.p) });
  });
  const lv = new THREE.Vector3();
  function placeLabels() {
    const w = W(), h = H(), c = camera.position;
    // caméra dans le bâtiment : pas d'étiquettes
    const inside = false;
    labels.forEach((l) => {
      lv.copy(l.v).project(camera);
      const vis = lv.z < 1 && Math.abs(lv.x) < 1.05 && Math.abs(lv.y) < 1.05;
      l.el.style.opacity = labOn && vis && !inside && !anim && !hero ? 1 : 0;
      l.el.style.transform = "translate(" + ((lv.x + 1) / 2 * w) + "px," + ((1 - lv.y) / 2 * h) + "px) translate(-50%,-100%)";
    });
  }

  /* ---------- vues ---------- */
  const views = {
    // depuis la mer, au sud-est : la pointe, ses falaises et le triangle posé au bord
    ensemble: { pos: [175, 125, 235], tgt: [-5, 38, 5], fov: 36.4 },   // fov du rendu 3:2 (52,5° en horizontal)
    // caméras d'Yves (touche C, 26/10), en attente de leurs rendus
    montee: { pos: [35.1, 53.4, -49.7], tgt: [28.6, 38.6, 58.3], fov: 36.4 },
    ciel: { pos: [3.1, 277.4, -1.3], tgt: [10.3, 54, 12.6], fov: 36.4 },
    pointe: { pos: [81.9, 87.4, 1.5], tgt: [38.2, 40.6, 43.1], fov: 36.4 },
    arrivee: { pos: [41.7, 53.8, -39.9], tgt: [6.1, 52.6, -29.3], fov: 36.4 },
  };

  /* ---------- image rendue posée sur la maquette ; elle se désagrège au premier geste ---------- */
  const RENDU = new URL("../img/rendu/", import.meta.url);
  const MEDIA = { ensemble: { img: "equilibrium_ensemble.jpg" }, ciel: { img: "equilibrium_ciel.jpg?v=2" }, montee: { img: "equilibrium_montee.jpg?v=4" }, arrivee: { img: "equilibrium_arrivee.jpg?v=3" }, pointe: { img: "equilibrium_pointe.jpg?v=4" } };   // autres rendus à venir
  const heroC = document.createElement("canvas"); heroC.className = "g3-hero"; host.appendChild(heroC);
  const hx = heroC.getContext("2d");
  let hero = null, lastPtr = null;
  const srcCache = {}, mInfo = {};
  function loadMedia(name) {
    if (srcCache[name]) return srcCache[name];
    const m = MEDIA[name];
    return (srcCache[name] = new Promise((res) => {
      const img = new Image();
      img.onload = () => { const out = { img, w: img.naturalWidth, h: img.naturalHeight }; mInfo[name] = out; (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(out)); };
      img.onerror = () => res(null);
      img.src = new URL(m.img, RENDU).href;
    }));
  }
  const heroFov = (f, name) => 2 * Math.atan(Math.tan((f * Math.PI) / 360) * Math.min(1, ((mInfo[name] && mInfo[name].w / mInfo[name].h) || 1.5) / (W() / H()))) * 180 / Math.PI;
  function makeCells(w0, h0, ox, oy, rnd) {
    const cells = [], cols = 18, rows = Math.max(1, Math.round((cols * h0) / w0)), cw = w0 / cols, ch = h0 / rows;
    const split = (x, y, w, h, d) => {
      if (d < 3 && rnd() < (d === 0 ? 0.7 : 0.45)) { const a = w / 2, b = h / 2; split(x, y, a, b, d + 1); split(x + a, y, a, b, d + 1); split(x, y + b, a, b, d + 1); split(x + a, y + b, a, b, d + 1); }
      else cells.push({ x, y, w, h });
    };
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) split(j * cw, i * ch, cw, ch, 0);
    const md = Math.hypot(Math.max(ox, w0 - ox), Math.max(oy, h0 - oy));
    cells.forEach((c) => {
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      c.d = Math.min(1, (Math.hypot(cx - ox, cy - oy) / md) * 0.85 + rnd() * 0.18); c.dx = (cx - ox) / md; c.dy = (cy - oy) / md;
    });
    return cells;
  }
  function heroOut() {
    if (!loaded) return;
    if (!hero || hero.mode === "out") return;
    const p = lastPtr || [W() / 2, H() / 2];
    Object.assign(hero, { mode: "out", t0: performance.now(), ox: p[0], oy: p[1], cells: null }); lastPtr = null;
  }
  function heroIn(name) {
    if (!MEDIA[name]) return;
    loadMedia(name).then((m) => {
      if (!m && !loaded) wait.style.opacity = 1;
      if (!m || !alive || anim) return;
      camera.fov = heroFov(views[name].fov || 34, name); camera.updateProjectionMatrix();
      hero = { name, m, mode: "in", t0: performance.now(), born: performance.now(), ox: W() / 2, oy: H() / 2, seed: 7, cells: null };
      if (loaded) prepCut(hero); else hero.mode = "show";
      heroC.style.opacity = 1;
    });
  }
  // métamorphose : chaque arête file sur elle-même vers un de ses bouts et s'efface, l'image monte en fondu uniforme
  const streakU = { value: 0 }, nonIdx = new Map();
  function prepStreak() {
    scene.traverse((o) => {
      if (!o.isLineSegments || o.userData.st) return; o.userData.st = 1;
      let g = o.geometry;
      if (!g.attributes.lt) {
        if (nonIdx.has(g)) g = nonIdx.get(g);
        else {
          const src = g; if (g.index) g = g.toNonIndexed();
          const n = g.attributes.position.count, lt = new Float32Array(n), r = mulberry((n % 997) + 3);
          for (let i = 0; i + 1 < n; i += 2) { const f = r() < 0.5; lt[i] = f ? 1 : 0; lt[i + 1] = f ? 0 : 1; }
          g.setAttribute("lt", new THREE.BufferAttribute(lt, 1)); nonIdx.set(src, g);
        }
        o.geometry = g;
      }
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m.userData.st) return; m.userData.st = 1;
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uStreak = streakU;
          sh.vertexShader = "attribute float lt;\nvarying float vLt;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vLt = lt;");
          sh.fragmentShader = "uniform float uStreak;\nvarying float vLt;\n" + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  if (vLt > 1.0 - uStreak) discard;\n  diffuseColor.a *= 1.0 - 0.6 * uStreak;");
        };
        m.needsUpdate = true;
      });
    });
  }
  /* ---------- coupe qui avance : le rendu se révèle du premier plan vers le fond,
     d'après la profondeur de la maquette vue de la même caméra ; les traits restent un instant comme un calque ---------- */
  const CUT = { sweep: 1.8, hold: 0.1, fade: 0.9, soft: 0.07 };
  function prepCut(hr) {
    if (reduce) return;
    try {
      controls.update(); camera.updateMatrixWorld();
      const dw = 320, dh = Math.max(1, Math.round(dw * H() / W()));
      // 1. profondeur (MeshDepthMaterial, packée RGBA), lue à basse définition
      const rt = new THREE.WebGLRenderTarget(dw, dh);
      const bg = scene.background, ov = scene.overrideMaterial, cc = new THREE.Color(), ca = renderer.getClearAlpha();
      renderer.getClearColor(cc);
      scene.background = null; scene.overrideMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(scene, camera);
      const px = new Uint8Array(dw * dh * 4); renderer.readRenderTargetPixels(rt, 0, 0, dw, dh, px);
      scene.overrideMaterial.dispose(); scene.overrideMaterial = ov; rt.dispose();
      const n = camera.near, f = camera.far, dep = new Float32Array(dw * dh), vals = [];
      const ray = new THREE.Vector3(), fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      let g0 = 0; try { g0 = groundH(controls.target.x, controls.target.z) || 0; } catch (e) {}
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const i = ((dh - 1 - y) * dw + x) * 4; // lignes lues de bas en haut
        const z = px[i] / 4294967296 + px[i + 1] / 16777216 + px[i + 2] / 65536 + px[i + 3] / 256; // unpackRGBAToDepth
        if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) {
          // pas de géométrie : on prolonge le sol (plan horizontal), le ciel reste au fond
          ray.set((x + 0.5) / dw * 2 - 1, 1 - (y + 0.5) / dh * 2, 0.5).unproject(camera).sub(camera.position).normalize();
          if (ray.y < -1e-3) { const t = (g0 - camera.position.y) / ray.y, d = t * ray.dot(fwd); dep[y * dw + x] = d; vals.push(d); }
          else dep[y * dw + x] = -1;
          continue;
        }
        const d = (n * f) / (f - Math.min(1, z) * (f - n)); // distance à la caméra (m)
        dep[y * dw + x] = d; vals.push(d);
      }
      vals.sort((p, q) => p - q);
      const lo = Math.log(Math.max(0.5, vals[Math.floor(vals.length * 0.02)] || 1)), hi = Math.log(vals[Math.floor(vals.length * 0.97)] || 100), sp = Math.max(0.2, hi - lo);
      for (let i = 0; i < dep.length; i++) dep[i] = dep[i] < 0 ? 1.12 : Math.min(1.08, Math.max(0, (Math.log(dep[i]) - lo) / sp));
      const mc = document.createElement("canvas"); mc.width = dw; mc.height = dh;
      hr.cut = { dep, mc, mx: mc.getContext("2d"), img: new ImageData(dw, dh) };
      // 2. traits seuls (sans surfaces), pour le calque final
      const lw = Math.round(W() * Math.min(2, devicePixelRatio || 1)), lh = Math.round(H() * Math.min(2, devicePixelRatio || 1));
      const rl = new THREE.WebGLRenderTarget(lw, lh, { samples: 4 }), hid = [];
      scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite) && o.visible) { o.visible = false; hid.push(o); } });
      renderer.setRenderTarget(rl); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
      const lp = new Uint8Array(lw * lh * 4); renderer.readRenderTargetPixels(rl, 0, 0, lw, lh, lp);
      hid.forEach((o) => { o.visible = true; }); rl.dispose();
      renderer.setRenderTarget(null); renderer.setClearColor(cc, ca); scene.background = bg;
      const lc = document.createElement("canvas"); lc.width = lw; lc.height = lh; const lx = lc.getContext("2d"), li = lx.createImageData(lw, lh);
      for (let y = 0; y < lh; y++) { const s0 = (lh - 1 - y) * lw * 4, d0 = y * lw * 4; for (let x = 0; x < lw * 4; x += 4) li.data[d0 + x + 3] = lp[s0 + x + 3]; }
      lx.putImageData(li, 0, 0);
      const ink = getComputedStyle(host).getPropertyValue("--ink").trim() || "#141414";
      lx.globalCompositeOperation = "source-in"; lx.fillStyle = ink; lx.fillRect(0, 0, lw, lh);
      hr.cut.lines = lc; hr.lines = lc; // gardé pour la sortie
    } catch (err) { renderer.setRenderTarget(null); hr.cut = null; }
  }
  function cutMask(c, s, band, f = 0) {   // f : fondu de fond, l'image monte partout même si la profondeur est mal lue
    const d = c.img.data, dep = c.dep, k = 1 / CUT.soft;
    for (let i = 0, j = 0; i < dep.length; i++, j += 4) {
      const v = dep[i];
      if (band) { const b = Math.max(0, 1 - Math.abs(v - s) * 60); d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = 230 * b; }
      else { d[j] = d[j + 1] = d[j + 2] = 0; d[j + 3] = 255 * Math.max(f, Math.min(1, Math.max(0, (s - v) * k))); }
    }
    c.mx.putImageData(c.img, 0, 0);
    return c.mc;
  }
  let heroFreeze = null; // test : fige l'effet à t secondes
  function drawHero(now) {
    if (!hero) return;
    // un à-coup (préparation du passage, décodage de l'image) met le fondu en pause au lieu de le sauter
    if (heroFreeze == null && hero.mode !== "show") {
      if (hero.lm !== hero.mode) { hero.lm = hero.mode; if (hero.mode === "in") hero.t0 = now; }
      else if (now - hero.last > 50) hero.t0 += now - hero.last - 16;
      hero.last = now;
    }
    if (heroFreeze != null && hero.mode !== "show") now = hero.t0 + heroFreeze * 1000;
    const dpr = Math.min(2, devicePixelRatio || 1), Wc = Math.round(W() * dpr), Hc = Math.round(H() * dpr);
    if (heroC.width !== Wc || heroC.height !== Hc) { heroC.width = Wc; heroC.height = Hc; hero.cells = null; }
    const m = hero.m, src = m.img, w = m.w, h = m.h;
    // la maquette suit le léger zoom de l'image, pour rester calée dessous
    const z = hero.mode === "out" ? hero.z || 1 : !reduce ? 1 + 0.035 * (0.5 - 0.5 * Math.cos(((now - hero.born) / 18000) * Math.PI * 2)) : 1;
    hero.z = z; if (camera.zoom !== z) { camera.zoom = z; camera.updateProjectionMatrix(); }
    const sc = Math.max(Wc / w, Hc / h) * z, ix = (Wc - w * sc) / 2, iy = (Hc - h * sc) / 2;
    hx.clearRect(0, 0, Wc, Hc);
    if (hero.mode === "show") { hx.drawImage(src, ix, iy, w * sc, h * sc); return; }
    prepStreak();
    if (hero.mode === "in" && hero.cut) {
      const T = (now - hero.t0) / 1000, c = hero.cut, q = Math.min(1, T / CUT.sweep);
      const s = -0.1 + (q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2) * 1.35;
      streakU.value = 0;
      hx.drawImage(src, ix, iy, w * sc, h * sc);
      hx.globalCompositeOperation = "destination-in"; hx.imageSmoothingEnabled = true; hx.drawImage(cutMask(c, s, false, q * q * (3 - 2 * q)), 0, 0, Wc, Hc);
      hx.globalCompositeOperation = "source-over";
      // calque : les traits de la maquette restent posés sur le rendu, puis s'effacent
      const la = 0.65 * (T < CUT.sweep + CUT.hold ? 1 : Math.max(0, 1 - (T - CUT.sweep - CUT.hold) / CUT.fade));
      if (c.lines && la > 0) { hx.globalAlpha = la; hx.drawImage(c.lines, 0, 0, Wc, Hc); hx.globalAlpha = 1; }
      // le front de coupe : un trait lumineux qui traverse la scène
      if (q < 1) { hx.globalCompositeOperation = "lighter"; hx.globalAlpha = 0.75 * Math.sin(Math.PI * q); hx.drawImage(cutMask(c, s, true), 0, 0, Wc, Hc); hx.globalAlpha = 1; hx.globalCompositeOperation = "source-over"; }
      if (T > CUT.sweep + CUT.hold + CUT.fade) { hero.mode = "show"; hero.cut = null; }
      return;
    }
    // sortie au geste : fondu calque, sans balayage. L'image s'efface vite, les traits restent un instant puis partent
    if (hero.mode === "out" && hero.lines) {
      const T = (now - hero.t0) / 1000, qi = Math.min(1, T / 0.35), ql = Math.min(1, T / 0.7);
      streakU.value = 0;
      hx.globalAlpha = Math.pow(1 - qi, 2); hx.drawImage(src, ix, iy, w * sc, h * sc);
      hx.globalAlpha = 0.65 * (1 - ql * ql); hx.drawImage(hero.lines, 0, 0, Wc, Hc); hx.globalAlpha = 1;
      if (T > 0.7) { if (m.video) m.video.pause(); hero = null; hx.clearRect(0, 0, Wc, Hc); heroC.style.opacity = 0; }
      return;
    }
    const T = (now - hero.t0) / 1000, DUR = hero.mode === "in" ? 1.7 : 0.25, q = Math.min(1, T / DUR);
    const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2, a = hero.mode === "in" ? e : Math.pow(1 - q, 3); // sortie : l’image lâche tout de suite (0,25 s)
    streakU.value = Math.min(1, a * 1.2);
    hx.globalAlpha = a; hx.drawImage(src, ix, iy, w * sc, h * sc); hx.globalAlpha = 1;
    if (hero.mode === "out" && T > DUR) { hero = null; hx.clearRect(0, 0, Wc, Hc); heroC.style.opacity = 0; streakU.value = 0; }
    else if (hero.mode === "in" && T > DUR) hero.mode = "show";
  }
  const ptr = (e) => { const r = host.getBoundingClientRect(); lastPtr = [e.clientX - r.left, e.clientY - r.top]; };
  host.addEventListener("pointerdown", ptr, true); host.addEventListener("wheel", ptr, { capture: true, passive: true });

  let anim = null;
  function fly(name, dur = 4200) {
    const v = views[name], hv = !!MEDIA[name];
    heroOut(); camera.zoom = 1;
    anim = { t0: performance.now(), dur, p0: camera.position.clone(), t0v: controls.target.clone(), p1: new THREE.Vector3(...v.pos), t1: new THREE.Vector3(...v.tgt), f0: camera.fov, f1: hv ? heroFov(v.fov, name) : v.fov, hero: hv ? name : null };
    // l’image se charge pendant le vol : le cadrage final suit son vrai format, sans saut à l’arrivée
    if (hv) loadMedia(name).then((m) => { if (m && anim && anim.hero === name) anim.f1 = heroFov(v.fov, name); });
    controls.maxPolarAngle = Math.PI * (v.polar || 0.62);
    controls.minDistance = 20;
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  camera.position.set(...views.ensemble.pos); controls.target.set(...views.ensemble.tgt);
  camera.fov = views.ensemble.fov; camera.updateProjectionMatrix();

  let running = true, raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (anim) {
      const k = ease(Math.min(1, (now - anim.t0) / anim.dur));
      camera.position.lerpVectors(anim.p0, anim.p1, k);
      controls.target.lerpVectors(anim.t0v, anim.t1, k);
      camera.fov = anim.f0 + (anim.f1 - anim.f0) * k; camera.updateProjectionMatrix();
      if (k >= 1) { const hn = anim.hero; anim = null; if (hn) heroIn(hn); }
    }
    controls.update();
    if (lifeStep && !reduce) { const dt = Math.min(0.05, (now - (tick.last || now)) / 1000); lifeStep(dt); }
    tick.last = now;
    const dc = camera.position.distanceTo(controls.target);
    for (const f of fade) { const k = f.near / dc; f.m.opacity = f.op * Math.min(1, Math.max(f.lo ?? 0.25, f.lo === 0 ? (k - 0.5) * 2 : k)); f.m.visible = f.m.opacity > 0.01; }
    renderer.render(scene, camera);
    drawHero(now);
    placeLabels();
  }
  raf = requestAnimationFrame(tick);
  // changement jour/nuit : la page est redessinée, on reprend la caméra là où elle était, sans image
  const KEEP = host.__keep || null; host.__keep = null;
  if (KEEP) { controls.autoRotate = false; camera.position.fromArray(KEEP.p); controls.target.fromArray(KEEP.t); camera.fov = KEEP.f; camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); if (KEEP.name && typeof MEDIA !== "undefined" && MEDIA[KEEP.name]) loadMedia(KEEP.name).then((m) => { if (m && alive && !hero) { hero = { name: KEEP.name, m, mode: "show", born: performance.now(), ox: W() / 2, oy: H() / 2, seed: 7, cells: null }; if (loaded) prepCut(hero); heroC.style.opacity = 1; } }); }
  else { heroIn("ensemble"); if (!loaded) controls.enabled = false; }
  controls.addEventListener("start", () => { anim = null; heroOut(); });

  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
  ro.observe(host);
  const io = new IntersectionObserver((es) => {
    const on = es[0].isIntersecting;
    if (on && !running) { running = true; raf = requestAnimationFrame(tick); }
    if (!on && running) { running = false; cancelAnimationFrame(raf); }
  });
  io.observe(host);

  host.__g3 = { camera, controls, scene, fly, views, out: () => heroOut(), freeze: (t) => { heroFreeze = t; } };
  return {
    fly, labels: labels_,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose(); renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.domElement.remove(); wait.remove(); heroC.remove(); labels.forEach((l) => l.el.remove());
    },
  };
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
