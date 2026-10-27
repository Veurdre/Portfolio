// Gare de Varèse (S7, 2013-2014). La passerelle vient du modèle SketchUp du projet (export STL allégé).
// L'environnement est redessiné en simple : sol, voies, bâtiments et arbres relevés sur le même modèle.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function css(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// axe de la passerelle (repère de la scène : x est, y haut, z sud)
const A3 = new THREE.Vector3(-55, 0, -71), B3 = new THREE.Vector3(37, 0, 69);
const U = B3.clone().sub(A3).normalize();            // le long de la passerelle
const N = new THREE.Vector3(U.z, 0, -U.x);           // perpendiculaire horizontale
const along = (s, t = 0, y = 0) => A3.clone().addScaledVector(U, s).addScaledVector(N, t).setY(y);

export function mount(host, opts = {}) {
  const th = document.documentElement.dataset.theme;
  const dark = th === "dark" || (th !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  // mode nuit : même palette que le globe (traits bleu clair sur fond anthracite, léger halo)
  const C = {
    paper: new THREE.Color(css("--bg", dark ? "#1a1918" : "#ffffff")), // fond = fond du site : on ne voit pas le cadre
    model: new THREE.Color(dark ? "#1d2023" : "#fbfaf7"),
    white: new THREE.Color(dark ? "#232a30" : "#ffffff"),
    ink: new THREE.Color(dark ? "#9fd6f4" : "#1d1b19"),
    brick: new THREE.Color(css("--brick", "#b46a5a")),
    ground: new THREE.Color(dark ? "#1b1c1d" : "#efebe4"),
    ballast: new THREE.Color(dark ? "#202427" : "#e2ddd5"),
    sage: new THREE.Color(dark ? "#2c4a3a" : "#cdd6c4"),
    paver: new THREE.Color(dark ? "#1f2225" : "#f9f7f3"),
    park: new THREE.Color(dark ? "#1b221e" : "#e3e8dc"),
    road: new THREE.Color(dark ? "#222528" : "#dcd7cf"),
  };

  const W = () => host.clientWidth, H = () => host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true, preserveDrawingBuffer: !!opts.capture });
  renderer.setPixelRatio(Math.min(2, Math.max(1.5, devicePixelRatio || 1))); // sur écran standard, rendu suréchantillonné : traits plus fins
  const LK = 0.68; // intensité des traits (Yves : arêtes plus fines, « scalpel »)
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(C.paper);
  host.appendChild(renderer.domElement);
  if (dark) renderer.domElement.style.filter = "drop-shadow(0 0 2px rgba(130,200,238,.18))";

  const scene = new THREE.Scene();
  const fgV = [];
  scene.fog = new THREE.Fog(C.paper, 230, 560);

  const camera = new THREE.PerspectiveCamera(32, W() / H(), 0.5, 2000);
  camera.position.set(-420, 300, 380);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 8, 0);
  controls.minDistance = 12;
  controls.maxDistance = 420;
  controls.maxPolarAngle = Math.PI * 0.62;
  // contre-plongée : l'orbite peut descendre jusqu'au ras du sol, sans passer dessous
  controls.addEventListener("change", () => { const mn = Math.max(1.5, (typeof groundH === "function" ? groundH(camera.position.x, camera.position.z) : 0) + 1.5); if (camera.position.y < mn) camera.position.y = mn; });
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;

  const hemi = new THREE.HemisphereLight(0xffffff, dark ? 0x222222 : 0xd6cec3, dark ? 1.15 : 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.3 : 1.9);
  sun.position.set(-120, 150, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.far = 500;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.4;
  scene.add(sun);

  // coupe : un plan vertical dans l'axe de la passerelle, qui enlève la moitié tournée vers nous
  const clip = new THREE.Plane(N.clone(), 600);
  const clips = [clip];

  const lineMat = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: dark ? 0.92 : 0.62 * LK, clippingPlanes: clips });   // nuit : arêtes du projet bien marquées
  const modelMat = new THREE.MeshLambertMaterial({
    color: C.model, flatShading: true, side: THREE.DoubleSide, clippingPlanes: clips, clipShadows: true,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const pocheU = { value: 0 }, inkU = { value: C.ink.clone().lerp(C.paper, dark ? 0.15 : 0.0) };
  function poche(m) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPoche = pocheU; sh.uniforms.uInk = inkU;
      sh.fragmentShader = "uniform float uPoche;\nuniform vec3 uInk;\n" + sh.fragmentShader.replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n  if (!gl_FrontFacing && uPoche > 0.5) gl_FragColor = vec4(uInk, 1.0);");
    };
    return m;
  }
  poche(modelMat);
  const mats = {};
  function mat(key, color, extra = {}) {
    if (!mats[key]) mats[key] = poche(new THREE.MeshLambertMaterial(Object.assign({ color, clippingPlanes: clips, clipShadows: true }, extra)));
    return mats[key];
  }

  /* ---------- rendu réaliste : chaque réglage a sa valeur maquette et sa valeur rendu ---------- */
  const look = [], col = (h) => new THREE.Color(h);
  function twin(obj, key, v1) {
    const v0 = obj[key] && obj[key].isColor ? obj[key].clone() : obj[key];
    look.push({ obj, key, v0, v1: typeof v1 === "string" ? col(v1) : v1 });
  }
  let lookNow = 0;
  function setLook(k) {
    if (k === lookNow) return; lookNow = k;
    look.forEach((l) => { const v = k ? l.v1 : l.v0; if (v && v.isColor) l.obj[l.key].copy(v); else l.obj[l.key] = v; });
    renderer.setClearColor(k ? SKY_LOW : C.paper);
  }
  const SKY_LOW = col("#e3e8e8");
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { a: { value: SKY_LOW }, b: { value: col("#8fb1d3") } },
    vertexShader: "varying vec3 vP;\nvoid main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 a; uniform vec3 b; varying vec3 vP;\nvoid main(){ float h = clamp(vP.y * 1.8 + 0.02, 0.0, 1.0); gl_FragColor = vec4(mix(a, b, pow(h, 0.65)), 1.0);\n#include <colorspace_fragment>\n}",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 16), skyM);
  sky.visible = false; sky.renderOrder = -1; scene.add(sky);
  twin(sky, "visible", true);
  twin(scene.fog, "color", "#dde3e4"); twin(scene.fog, "near", 260); twin(scene.fog, "far", 950);
  twin(hemi, "color", "#d4e3f1"); twin(hemi, "groundColor", "#7d7260"); twin(hemi, "intensity", 1.25);
  twin(sun, "color", "#ffefd6"); twin(sun, "intensity", 3.4);
  twin(lineMat, "opacity", 0.06);
  twin(modelMat, "color", "#b3aea5");

  const root = new THREE.Group(), life = new THREE.Group();
  // couches de l'éclaté : 0 socle, puis par tronçon niveau bas, niveau haut, toiture
  const layerG = [], LIFT = [0, 4, 11, 20];
  const lvOf = (L) => (L === 0 ? 0 : ((L - 1) % 3) + 1);
  for (let L = 0; L < 10; L++) { const g = new THREE.Group(); g.userData.lift = LIFT[lvOf(L)]; layerG.push(g); }
  scene.add(root, life, ...layerG);

  // message de chargement discret
  const wait = document.createElement("div");
  wait.className = "g3-load";
  wait.textContent = "Chargement de la maquette…";
  wait.style.cssText = "pointer-events:none;transition:opacity .6s;opacity:0";
  host.appendChild(wait);
  // on arrive sur l'image : la maquette se charge derrière, sans écran d'attente
  let loaded = false;

  let alive = true, groundH = () => 0, zoneAt = () => 0;
  const base = new URL("../data/", import.meta.url);
  Promise.all([
    fetch(new URL("varese.json", base)).then((r) => r.json()),
    fetch(new URL("varese_env.json", base)).then((r) => r.json()),
  ]).then(([meta, env]) => {
    const bin = atob(meta.b64), buf = new ArrayBuffer(bin.length), u8 = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (!alive) return;
    build(meta, buf);
    buildEnv(env);
    buildTrains(env.tracks);
    buildWalkers();
    wait.style.opacity = 0;
    loaded = true; controls.enabled = true; if (hero) prepCut(hero); else if (!KEEP) heroIn("parvis");
    setTimeout(() => wait.remove(), 700);
  }).catch(() => { wait.textContent = "Maquette indisponible"; });

  function build(meta, buf) {
    const nv = meta.nv, nf = meta.nf, ne = meta.ne;
    const q = new Uint16Array(buf, 0, nv * 3);
    let off = nv * 6; if (nv % 2) off += 6;
    const F = new Uint32Array(buf, off, nf * 3); off += nf * 12;
    const E = new Uint32Array(buf, off, ne * 2);
    const pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = meta.lo[k] + q[i * 3 + k] * meta.sc[k];
    const P = new THREE.BufferAttribute(pos, 3);
    let f0 = 0, e0 = 0;
    meta.fl.forEach((fl, L) => {
      const nfL = Array.isArray(fl) ? fl[0] + fl[1] : fl;
      const neL = meta.el[L];
      if (nfL) {
        const g = new THREE.BufferGeometry(); g.setAttribute("position", P);
        g.setIndex(new THREE.BufferAttribute(F.subarray(f0 * 3, (f0 + nfL) * 3), 1));
        const m = new THREE.Mesh(g, modelMat); m.castShadow = true; m.receiveShadow = true; layerG[L].add(m);
      }
      if (neL) {
        const eg = new THREE.BufferGeometry(); eg.setAttribute("position", P);
        eg.setIndex(new THREE.BufferAttribute(E.subarray(e0 * 2, (e0 + neL) * 2), 1));
        layerG[L].add(new THREE.LineSegments(eg, lineMat));
      }
      f0 += nfL; e0 += neL;
    });
  }

  /* ---------- environnement simplifié ---------- */
  function buildEnv(env) {
    const G = env.ground, nx = G.nx, ny = G.ny;
    const gp = new Float32Array(nx * ny * 3);
    for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
      const k = (i * nx + j) * 3; gp[k] = G.x0 + j * G.g; gp[k + 1] = G.h[i * nx + j]; gp[k + 2] = G.z0 - i * G.g;
    }
    const gi = [];
    for (let i = 0; i < ny - 1; i++) for (let j = 0; j < nx - 1; j++) {
      const a = i * nx + j, b = a + 1, c = a + nx, d = c + 1; gi.push(a, c, b, b, c, d);
    }
    // teinte par zone : parvis minéral, parc urbain, route
    const zc = [C.ground, C.paver, C.park, C.road], gc = new Float32Array(nx * ny * 3);
    for (let i = 0; i < nx * ny; i++) { const c = zc[(G.zone && G.zone[i]) || 0]; gc[i * 3] = c.r; gc[i * 3 + 1] = c.g; gc[i * 3 + 2] = c.b; }
    const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(gp, 3)); gg.setAttribute("color", new THREE.BufferAttribute(gc, 3)); gg.setIndex(gi); gg.computeVertexNormals();
    const gm = new THREE.Mesh(gg, mat("ground", 0xffffff, { side: THREE.DoubleSide, vertexColors: true }));
    gm.receiveShadow = true; root.add(gm);
    // version rendu : pierre claire, gazon, asphalte, avec un léger grain
    const zr = [col("#8e9670"), col("#c9c5bc"), col("#66844a"), col("#4c4e51")], gr = new Float32Array(nx * ny * 3), nz = mulberry(41);
    for (let i = 0; i < nx * ny; i++) {
      const z = (G.zone && G.zone[i]) || 0, c = zr[z], j = 1 + (nz() - 0.5) * (z === 2 || z === 0 ? 0.16 : 0.05);
      gr[i * 3] = c.r * j; gr[i * 3 + 1] = c.g * j; gr[i * 3 + 2] = c.b * j;
    }
    const ggR = new THREE.BufferGeometry(); ggR.setAttribute("position", gg.getAttribute("position")); ggR.setAttribute("normal", gg.getAttribute("normal"));
    ggR.setAttribute("color", new THREE.BufferAttribute(gr, 3)); ggR.setIndex(gg.getIndex());
    const gmR = new THREE.Mesh(ggR, mat("groundR", 0xffffff, { side: THREE.DoubleSide, vertexColors: true }));
    gmR.receiveShadow = true; gmR.visible = false; root.add(gmR);
    twin(gm, "visible", false); twin(gmR, "visible", true);
    zoneAt = (x, z) => {
      const j = Math.round((x - G.x0) / G.g), i = Math.round((G.z0 - z) / G.g);
      return i < 0 || j < 0 || i >= ny || j >= nx || !G.zone ? 0 : G.zone[i * nx + j];
    };
    groundH = (x, z) => {
      const fj = (x - G.x0) / G.g, fi = (G.z0 - z) / G.g;
      const j = Math.max(0, Math.min(nx - 2, Math.floor(fj))), i = Math.max(0, Math.min(ny - 2, Math.floor(fi)));
      const a = Math.min(1, Math.max(0, fj - j)), b = Math.min(1, Math.max(0, fi - i)), h = G.h;
      return (h[i * nx + j] * (1 - a) + h[i * nx + j + 1] * a) * (1 - b) + (h[(i + 1) * nx + j] * (1 - a) + h[(i + 1) * nx + j + 1] * a) * b;
    };
    // calepinage du parvis, axe de la route, piste cyclable
    const seg = (arr, opacity, color = C.ink) => {
      const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      const lm = new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity * LK * (dark ? 1.3 : 1)), clippingPlanes: clips });
      root.add(new THREE.LineSegments(g2, lm)); return lm;
    };
    if (env.paving) { const m = seg(env.paving.flat(), dark ? 0.16 : 0.14); twin(m, "color", "#8f877b"); twin(m, "opacity", 0.35); }
    if (env.road) { const r = []; for (let i = 0; i + 1 < env.road.length; i += 2) r.push(...env.road[i], ...env.road[i + 1]); const m = seg(r, dark ? 0.35 : 0.3); twin(m, "color", "#f4f3ee"); twin(m, "opacity", 0.85); }
    if (env.bike) { const r = []; for (let i = 0; i + 1 < env.bike.length; i++) r.push(...env.bike[i], ...env.bike[i + 1]); const m = seg(r, 0.8, C.brick); twin(m, "color", "#9a5a48"); }
    // cheminements secondaires du parc (interprétation) : ils maillent la piste principale
    { const PATHS = [[[-47.47, 71.57], [-12, 58], [25, 42], [65, 26], [105, 6], [128, -15], [138, -45], [143.7, -71.17]], [[42.05, -10.42], [50, 10], [55, 29.5]], [[-18.32, 23.18], [-12, 40], [-6, 55.5]], [[116.09, -38.0], [86, -64], [70, -80]], [[-85.43, 98.36], [-98, 78], [-110, 62]]], r = [];
      for (const pl of PATHS) {
        const cv = new THREE.CatmullRomCurve3(pl.map(([x, z]) => new THREE.Vector3(x, 0, z)));
        const pts = cv.getPoints(pl.length * 14);
        for (const q of pts) q.y = groundH(q.x, q.z) + 0.08;
        for (let i = 0; i + 1 < pts.length; i++) r.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      }
      const m = seg(r, 0.65, C.brick); twin(m, "color", "#9a5a48"); }
    // dépose-minute : bus et voitures en volumes simples
    if (env.veh) {
      const busG = new THREE.BoxGeometry(12, 3.2, 2.55), carG = new THREE.BoxGeometry(4.3, 1.5, 1.8);
      const busE = new THREE.EdgesGeometry(busG), carE = new THREE.EdgesGeometry(carG);
      env.veh.forEach((v) => {
        const bus = v[3] === "bus", gm2 = bus ? busG : carG, h2 = bus ? 1.6 + 0.3 : 0.75 + 0.2;
        const m = new THREE.Mesh(gm2, mat("veh", C.white)); m.position.set(v[0], v[1] + h2, v[2]); m.rotation.y = v[4]; m.castShadow = true; root.add(m);
        const e = new THREE.LineSegments(bus ? busE : carE, lineMat); e.position.copy(m.position); e.rotation.copy(m.rotation); root.add(e); fgV.push(m, e);
      });
    }
    // trame légère tous les 20 m, posée sur le relief
    const gl = [], step = 5;
    for (let i = 0; i < ny; i += step) for (let j = 0; j < nx - 1; j++) { const a = (i * nx + j) * 3, b = a + 3; gl.push(gp[a], gp[a + 1] + 0.05, gp[a + 2], gp[b], gp[b + 1] + 0.05, gp[b + 2]); }
    for (let j = 0; j < nx; j += step) for (let i = 0; i < ny - 1; i++) { const a = (i * nx + j) * 3, b = a + nx * 3; gl.push(gp[a], gp[a + 1] + 0.05, gp[a + 2], gp[b], gp[b + 1] + 0.05, gp[b + 2]); }
    const glg = new THREE.BufferGeometry(); glg.setAttribute("position", new THREE.Float32BufferAttribute(gl, 3));
    const grid = new THREE.LineSegments(glg, new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: dark ? 0.07 : 0.06, clippingPlanes: clips }));
    root.add(grid); twin(grid, "visible", false);

    // voies : ballast clair et deux rails fins
    const railMat = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.75 * LK, clippingPlanes: clips });
    twin(railMat, "color", "#4a4642"); twin(railMat, "opacity", 0.9);
    env.tracks.forEach((t) => {
      const curve = new THREE.CatmullRomCurve3(t.p.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      const n = Math.ceil(curve.getLength() / 3), bal = [], bi = [], r1 = [], r2 = [];
      const pt = new THREE.Vector3(), tg = new THREE.Vector3();
      for (let i = 0; i <= n; i++) {
        curve.getPointAt(i / n, pt); curve.getTangentAt(i / n, tg);
        const nx2 = -tg.z, nz2 = tg.x, l = Math.hypot(nx2, nz2) || 1, ux = nx2 / l, uz = nz2 / l;
        bal.push(pt.x + ux * 1.7, pt.y + 0.12, pt.z + uz * 1.7, pt.x - ux * 1.7, pt.y + 0.12, pt.z - uz * 1.7);
        if (i < n) { const a = i * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        r1.push(pt.x + ux * 0.72, pt.y + 0.3, pt.z + uz * 0.72); r2.push(pt.x - ux * 0.72, pt.y + 0.3, pt.z - uz * 0.72);
      }
      const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(bal, 3)); bg.setIndex(bi); bg.computeVertexNormals();
      const bm = new THREE.Mesh(bg, mat("ballast", C.ballast, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      bm.receiveShadow = true; root.add(bm);
      [r1, r2].forEach((r) => { const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(r, 3)); root.add(new THREE.Line(lg, railMat)); });
    });

    // bâtiments : volumes blancs simples aux emplacements du modèle
    const unit = new THREE.BoxGeometry(1, 1, 1), unitE = new THREE.EdgesGeometry(unit);
    ["#e6dac5", "#d6c5a9", "#ede6da"].forEach((h, i) => twin(mat("bat" + i, C.white, { side: THREE.DoubleSide }), "color", h));
    env.buildings.forEach((b, bi) => {
      const m = new THREE.Mesh(unit, mat("bat" + (bi % 3)));
      m.scale.set(b[3], b[5], b[4]); m.position.set(b[0], b[1] + b[5] / 2, b[2]); m.rotation.y = -b[6];
      m.castShadow = true; m.receiveShadow = true; root.add(m);
      const e = new THREE.LineSegments(unitE, lineMat); e.scale.copy(m.scale); e.position.copy(m.position); e.rotation.copy(m.rotation); root.add(e);
    });

    // arbres : couronnes facettées aux emplacements du modèle
    const crownGeo = new THREE.IcosahedronGeometry(2.6, 0), crownE = new THREE.EdgesGeometry(crownGeo);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 5);
    const crownR = new THREE.IcosahedronGeometry(2.6, 1), cp = crownR.getAttribute("position"), jr = mulberry(77);
    for (let i = 0; i < cp.count; i++) { const f = 0.86 + jr() * 0.26; cp.setXYZ(i, cp.getX(i) * f, cp.getY(i) * f * 0.92, cp.getZ(i) * f); }
    crownR.computeVertexNormals();
    const crownMs = ["#5d7843", "#6c8a4d", "#51683c"].map((h, i) => { const m = mat("crown" + i, C.sage, { flatShading: true }); twin(m, "color", h); return m; });
    const trunkM = mat("trunk", C.ink); twin(trunkM, "color", "#4a3d31");
    twin(mat("ballast"), "color", "#8b8378");
    twin(mat("veh", C.white), "color", "#c4c8cc");
    const tr = mulberry(5);
    env.trees.forEach((t) => {
      const k = Math.min(1.4, Math.max(0.55, t[3] / 6.4)), h = 4.2 * k;
      const tk = new THREE.Mesh(trunkGeo, trunkM); tk.scale.set(1, h, 1); tk.position.set(t[0], t[1] + h / 2, t[2]); root.add(tk);
      const c = new THREE.Mesh(crownGeo, crownMs[Math.floor(tr() * 3)]); c.scale.setScalar(k); c.position.set(t[0], t[1] + h + 1.2 * k, t[2]); c.rotation.y = tr() * 3;
      c.castShadow = true; root.add(c); twin(c, "geometry", crownR);
      const e = new THREE.LineSegments(crownE, lineMat); e.scale.copy(c.scale); e.position.copy(c.position); e.rotation.copy(c.rotation); root.add(e);
    });
  }

  /* ---------- coupe : le terrain coupé est poché en noir, rien ne se voit sous le sol ---------- */
  // une chape par section : terrain coupé (profil du sol) + passerelle coupée (sections calculées sur le plan)
  const caps = [];
  function buildCap(list) {
    (Array.isArray(list) ? list : []).forEach((cd) => {
      const n = new THREE.Vector3(...cd.n), e = new THREE.Vector3(...cd.e), n0 = cd.k + 0.05;
      const inPlane = (w, y) => [e.x * w + n.x * n0, y, e.z * w + n.z * n0];
      const top = [], v = [], idx = [];
      for (let w = -420; w <= 420; w += 2) {
        const q = inPlane(w, 0), h = groundH(q[0], q[2]);
        top.push(q[0], h + 0.02, q[2]); v.push(q[0], h, q[2], q[0], -9, q[2]);
      }
      for (let i = 0; i + 1 < v.length / 6; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.Group(), fill = new THREE.MeshBasicMaterial({ color: inkU.value, side: THREE.DoubleSide }), ink = new THREE.LineBasicMaterial({ color: inkU.value });
      const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); gg.setIndex(idx); g.add(new THREE.Mesh(gg, fill));
      const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(top, 3)); g.add(new THREE.Line(lg, ink));
      const tv = []; cd.tris.forEach((t) => { for (let j = 0; j < 3; j++) tv.push(...inPlane(t[j * 2], t[j * 2 + 1])); });
      const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.Float32BufferAttribute(tv, 3)); g.add(new THREE.Mesh(tg, fill));
      const lv = []; cd.lines.forEach((l) => { lv.push(...inPlane(l[0], l[1]), ...inPlane(l[2], l[3])); });
      const lg2 = new THREE.BufferGeometry(); lg2.setAttribute("position", new THREE.Float32BufferAttribute(lv, 3)); g.add(new THREE.LineSegments(lg2, ink));
      g.visible = false; g.userData = { n, k: cd.k }; scene.add(g); caps.push(g);
    });
  }

  /* ---------- trains : ils suivent les voies relevées dans le modèle ---------- */
  const trains = [];
  const carGeo = new THREE.BoxGeometry(2.9, 3.5, 23.5);
  const carEdge = new THREE.EdgesGeometry(carGeo);
  const bandGeo = new THREE.BoxGeometry(2.95, 0.45, 23.5);
  function buildTrains(tracks) {
    twin(mat("train", C.white), "color", "#eceeee");
    // voies A et C : trains qui passent ; voies B : terminus derrière le fronton, les trains arrivent, s'arrêtent, repartent
    const spec = [
      { i: 0, cars: 5, speed: 13, phase: 0, dir: 1 },
      { i: 1, cars: 4, speed: 12, phase: 0.5, dir: -1 },
      { i: 4, cars: 6, speed: 15, phase: 0.3, dir: 1 },
      { i: 3, cars: 4, term: true, speed: 13, dwell: 28, pause: 22, phase: 0.2 },
      { i: 2, cars: 4, term: true, parked: true },
    ];
    spec.forEach((s) => {
      const pts = ((tracks[s.i] || {}).p || []).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      if (pts.length < 4) return;
      const curve = new THREE.CatmullRomCurve3(pts);
      const len = curve.getLength();
      const cars = [];
      for (let i = 0; i < s.cars; i++) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(carGeo, mat("train", C.white)); b.position.y = 2.15; b.castShadow = true; g.add(b);
        const e = new THREE.LineSegments(carEdge, lineMat); e.position.y = 2.15; g.add(e);
        const band = new THREE.Mesh(bandGeo, mat("band", C.brick)); band.position.y = 1.35; g.add(band);
        g.visible = false;
        life.add(g); cars.push(g);
      }
      const gap = 24.5, stop = 14, D = len - stop + 10;
      trains.push(Object.assign(s, { curve, len, cars, gap, stop, D }));
    });
  }
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Vector3();
  function putCar(tr, g, x) {
    if (x < 1 || x > tr.len - 1) { g.visible = false; return; }
    const u0 = x / tr.len, u1 = Math.min(1, u0 + 2 / tr.len);
    tr.curve.getPointAt(u0, tmpP); tr.curve.getPointAt(u1, tmpQ);
    g.position.copy(tmpP); g.lookAt(tmpQ.x, tmpP.y, tmpQ.z); g.visible = true;
  }
  function placeTrains(now) {
    const t = now / 1000;
    trains.forEach((tr) => {
      if (tr.term) {
        // position de la tête, mesurée depuis le heurtoir
        let head;
        if (tr.parked) head = tr.stop;
        else {
          const tA = (2 * tr.D) / tr.speed, cyc = 2 * tA + tr.dwell + tr.pause;
          const k = (t + tr.phase * cyc) % cyc;
          if (k < tA) { const u = k / tA; head = tr.stop + tr.D * (1 - u) * (1 - u); }
          else if (k < tA + tr.dwell) head = tr.stop;
          else if (k < 2 * tA + tr.dwell) { const u = (k - tA - tr.dwell) / tA; head = tr.stop + tr.D * u * u; }
          else head = 1e9;
        }
        tr.cars.forEach((g, i) => putCar(tr, g, head + 12 + i * tr.gap));
        return;
      }
      const loop = tr.len + tr.cars.length * tr.gap + 200; // le train sort, une pause, puis revient
      const d = (t * tr.speed + tr.phase * loop) % loop;
      tr.cars.forEach((g, i) => {
        const x = d - i * tr.gap;
        putCar(tr, g, tr.dir > 0 ? x : tr.len - x);
      });
    });
  }

  /* ---------- passants sur les plateaux de la passerelle ---------- */
  const rnd = mulberry(11);
  const people = [];
  const pGeo = new THREE.CapsuleGeometry(0.25, 1.15, 2, 6);
  const pMat = mat("person", C.ink.clone().lerp(C.paper, 0.3)); twin(pMat, "color", "#4a4540");
  const decks = [[2, 46, 8.0], [54, 92, 11.8], [100, 150, 15.5]];
  decks.forEach(([s0, s1, y], j) => {
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(pGeo, pMat); p.visible = false; life.add(p); // passants masqués (retour d’Yves)
      people.push({ p, s: s0 + rnd() * (s1 - s0), t: (rnd() - 0.5) * 9, v: (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 0.6), s0, s1, y });
    }
  });
  // passants sur le parvis
  const walkers = [];
  function buildWalkers() {
    const r2 = mulberry(23);
    for (let n = 0, tries = 0; n < 34 && tries < 4000; tries++) {
      const x = -150 + r2() * 160, z = -90 + r2() * 110;
      if (zoneAt(x, z) !== 1) continue;
      const p = new THREE.Mesh(pGeo, pMat); p.visible = false; life.add(p); // passants masqués (retour d’Yves)
      const a = r2() * Math.PI * 2, v = 0.7 + r2() * 0.7;
      walkers.push({ p, x, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v }); n++;
    }
  }
  function placeWalkers(dt) {
    walkers.forEach((o) => {
      let nx2 = o.x + o.vx * dt, nz2 = o.z + o.vz * dt;
      if (zoneAt(nx2, nz2) !== 1) { o.vx = -o.vx; o.vz = -o.vz; nx2 = o.x; nz2 = o.z; }
      o.x = nx2; o.z = nz2; o.p.position.set(o.x, groundH(o.x, o.z) + 0.85, o.z);
    });
  }
  function placePeople(dt) {
    placeWalkers(dt);
    people.forEach((o) => {
      o.s += o.v * dt;
      if (o.s < o.s0 || o.s > o.s1) { o.v *= -1; o.s = Math.min(o.s1, Math.max(o.s0, o.s)); }
      o.p.position.copy(along(o.s, o.t, o.y + 0.85 + burst * LIFT[2]));
    });
  }

  let labOn = true;
  const labels_ = (on) => { labOn = on; };
  /* ---------- étiquettes ---------- */
  const labels = [
    { t: "Gravir", s: "depuis le parvis", p: along(4, 0, 18) },
    { t: "Franchir", s: "les voies", p: along(72, 0, 22) },
    { t: "Connecter", s: "les quartiers, par le jardin", p: along(140, 0, 26) },
  ].map((l) => {
    const d = document.createElement("div");
    d.className = "g3-lab";
    d.innerHTML = "<b>" + l.t + "</b><span>" + l.s + "</span>";
    host.appendChild(d);
    return Object.assign(l, { el: d });
  });

  /* ---------- vues ---------- */
  // les volumes du premier plan (bus et voitures de la dépose-minute) masquent le projet sur la vue « parvis » : ils s’effacent seulement là
  const setFg = (name) => fgV.forEach((o) => { o.visible = name !== "parvis" && name !== "parvis2"; });
  const mid = along(80, 0, 10);
  const views = {
    ensemble: { pos: [-140, 105, 150], tgt: [0, 8, 0] },
    // même point de vue que la perspective du projet : depuis le parvis, vers le croisement passerelle / voies
    parvis: { pos: [-126.1, 7.5, -38.9], tgt: [-23.1, 6.5, -18.7], fov: 46 },
    // variante de test (CAM d'Yves, 2026-10-26) : plus de recul, projet dégagé du premier plan
    parvis2: { pos: [-165.5, 12.3, -71.6], tgt: [44.1, 5.3, 7.1], fov: 33 },
    // la nef : l’espace ouvert sous la passerelle, où le parc traverse
    hall: { pos: along(74, -5.5, 1.6).toArray(), tgt: along(150, -5, 3.2).toArray(), fov: 60 },
    // au-dessus du parc : la façade longue vue par-dessus la canopée, cadrée sur la 2e capture d’Yves (2026-10-25), avec la voie ferrée.
    // recalée le 2026-10-26 sur le nouveau rendu ChatGPT (16:9) : varese_parc.jpg
    parc: { pos: [177.1, 14.5, -145.7], tgt: [-8.9, 0.5, -0.8], fov: 28.5 },
  };
  // rendu : occultation ambiante (GTAO) et tonalité filmique, chargées au premier usage
  let comp = null, compP = null, ao = null;
  function ensureComposer() {
    if (compP) return compP;
    const A = "three/addons/postprocessing/";
    // GTAO retiré : il noircissait la passerelle (géométrie ouverte du modèle SketchUp)
    compP = Promise.all(["EffectComposer", "RenderPass", "OutputPass"].map((n) => import(A + n + ".js"))).then(([a, b, d]) => {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      comp = new a.EffectComposer(renderer, rt);
      comp.addPass(new b.RenderPass(scene, camera));
      comp.addPass(new d.OutputPass());
      comp.setPixelRatio(renderer.getPixelRatio()); comp.setSize(W(), H());
    }).catch(() => { comp = null; });
    return compP;
  }
  function draw(k) {
    k = 0;   // la maquette garde sa palette pendant le passage vers le rendu : pas de ciel, le fond reste celui de la page (Yves)
    setLook(k);
    if (k && comp) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
      comp.render(); renderer.toneMapping = THREE.NoToneMapping;
    } else renderer.render(scene, camera);
  }
  // passage maquette ⇄ rendu : un balayage de gauche à droite
  let wipe = null, lookTo = 0;
  const wipeEl = document.createElement("div"); wipeEl.className = "g3-wipe"; host.appendChild(wipeEl);
  function real(on) {
    const k = on ? 1 : 0; if (k === lookTo) return;
    const go = () => { const from = lookTo; lookTo = k; wipe = reduce ? null : { t0: performance.now(), dur: 1500, from, to: k }; };
    if (k) ensureComposer().then(go); else go();
  }
  let anim = null, cut = 0, cutTo = 0, burst = 0, burstTo = 0, sec = -1;
  /* ---------- image rendue (IA, animée) posée sur la maquette ; elle se désagrège au premier geste ---------- */
  const RENDU = new URL("../img/rendu/", import.meta.url);
  // prov : image provisoire, en attendant les rendus d'Yves ; le format est lu sur l'image
  const MEDIA = {
    ensemble: { img: "varese_ensemble.jpg", video: "varese_ensemble.mp4", prov: false },
    parvis: { img: "varese_parvis.jpg", video: "varese_parvis.mp4", prov: false },
    hall: { img: "varese_hall.jpg", video: "varese_hall.mp4", prov: false },
    parc: { img: "varese_parc.jpg?v=4", prov: false },
  };
  const heroC = document.createElement("canvas"); heroC.className = "g3-hero"; host.appendChild(heroC);
  const hx = heroC.getContext("2d");
  const heroTag = document.createElement("div"); heroTag.className = "g3-tag"; host.appendChild(heroTag);
  let hero = null, lastPtr = null;
  const srcCache = {}, mInfo = {};
  function loadMedia(name) {
    if (srcCache[name]) return srcCache[name];
    const m = MEDIA[name];
    return (srcCache[name] = new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const out = { img, w: img.naturalWidth, h: img.naturalHeight, video: null }; mInfo[name] = out;
        if (m.video) {
          const v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
          v.addEventListener("canplay", () => { if (!out.video) { out.video = v; if (hero && hero.m === out) v.play().catch(() => {}); } }, { once: true });
          v.src = new URL(m.video, RENDU).href;
        }
        (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(out));
      };
      img.onerror = () => res(null);
      img.src = new URL(m.img, RENDU).href;
    }));
  }
  const heroFov = (f, name) => 2 * Math.atan(Math.tan((f * Math.PI) / 360) * Math.min(1, ((mInfo[name] && mInfo[name].w / mInfo[name].h) || (MEDIA[name] && MEDIA[name].ar) || 16 / 9) / (W() / H()))) * 180 / Math.PI;
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
    Object.assign(hero, { mode: "out", t0: performance.now(), ox: p[0], oy: p[1], cells: null });
    heroTag.style.opacity = 0; lastPtr = null;
  }
  function heroIn(name) {
    if (!MEDIA[name]) return;
    loadMedia(name).then((m) => {
      if (!m && !loaded) wait.style.opacity = 1;
      if (!m || !alive || anim) return;
      // le cadrage suit le format réel de l'image (16:9, 3:2…)
      camera.fov = heroFov(views[name].fov || 32, name); camera.updateProjectionMatrix();
      hero = { name, m, mode: "in", t0: performance.now(), born: performance.now(), ox: W() / 2, oy: H() / 2, seed: 7, cells: null };
      if (loaded) prepCut(hero); else hero.mode = "show";
      if (m.video) m.video.play().catch(() => {});
      heroC.style.opacity = 1;
      heroTag.textContent = MEDIA[name].prov ? "image provisoire · le rendu IA viendra ici" : ""; heroTag.style.opacity = MEDIA[name].prov ? 1 : 0;
    });
  }
  let heroFreeze = null; // test : fige l'effet à t secondes
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
    const m = hero.m, src = m.video && m.video.readyState >= 2 ? m.video : m.img, w = m.video && src === m.video ? m.video.videoWidth : m.w, h = m.video && src === m.video ? m.video.videoHeight : m.h;
    const z = 1; // pas de zoom lent : l’image doit rester calée sur la maquette
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
    if (hero.mode === "out" && T > DUR) { if (m.video) m.video.pause(); hero = null; hx.clearRect(0, 0, Wc, Hc); heroC.style.opacity = 0; streakU.value = 0; }
    else if (hero.mode === "in" && T > DUR) hero.mode = "show";
  }
  const ptr = (e) => { const r = host.getBoundingClientRect(); lastPtr = [e.clientX - r.left, e.clientY - r.top]; };
  host.addEventListener("pointerdown", ptr, true); host.addEventListener("wheel", ptr, { capture: true, passive: true });

  function fly(name, dur = 4200) {
    const v = views[name]; setFg(name);
    const hv = !!MEDIA[name], ar = W() / H(), kk = hv || name === "parvis" ? 1 : ar < 1 ? 1.8 : ar < 1.4 ? 1.3 : 1;
    heroOut();
    const t1 = new THREE.Vector3(...v.tgt), p1 = new THREE.Vector3(...v.pos).sub(t1).multiplyScalar(kk).add(t1);
    anim = { t0: performance.now(), dur, p0: camera.position.clone(), t0v: controls.target.clone(), p1, t1, f0: camera.fov, f1: hv ? heroFov(v.fov || 32, name) : v.fov || 32, hero: hv ? name : null };
    // l’image se charge pendant le vol : le cadrage final suit son vrai format, sans saut à l’arrivée
    if (hv) loadMedia(name).then((m) => { if (m && anim && anim.hero === name) anim.f1 = heroFov(v.fov || 32, name); });
    controls.autoRotate = false;
    if (v.cut !== undefined && caps[v.cut]) {
      if (v.cut !== sec) { sec = v.cut; cut = 0; clip.normal.copy(caps[sec].userData.n); }
      cutTo = 1;
    } else cutTo = 0;
    burstTo = 0;
    controls.maxPolarAngle = name === "parvis" ? Math.PI * 0.62 : Math.PI * 0.62;
    if (name === "ensemble" && !hv) setTimeout(() => { if (!anim) controls.autoRotate = true; }, dur + 200);
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  let running = true, raf = 0, last = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { controls.autoRotate = false; camera.position.set(...views.ensemble.pos); controls.target.set(...views.ensemble.tgt); }
  // départ : posé sur la vue depuis le parvis, sous son image rendue
  controls.autoRotate = false;
  camera.position.set(...views.parvis.pos); controls.target.set(...views.parvis.tgt);
  controls.maxPolarAngle = Math.PI * 0.62;
  camera.fov = heroFov(views.parvis.fov, "parvis"); camera.updateProjectionMatrix();

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (anim) {
      const k = ease(Math.min(1, (now - anim.t0) / anim.dur));
      camera.position.lerpVectors(anim.p0, anim.p1, k);
      controls.target.lerpVectors(anim.t0v, anim.t1, k);
      camera.fov = anim.f0 + (anim.f1 - anim.f0) * k; camera.updateProjectionMatrix();
      if (k >= 1) { const hn = anim.hero; anim = null; if (hn) heroIn(hn); }
    }
    cut += (cutTo - cut) * Math.min(1, dt * 2.2);
    // on garde les points où N·p + c >= 0 (la moitié opposée à la caméra en coupe)
    const kc = sec >= 0 ? -caps[sec].userData.k : 600;
    clip.constant = 600 + (kc - 600) * cut;
    burst += (burstTo - burst) * Math.min(1, dt * 2.4);
    layerG.forEach((g) => { g.position.y = burst * g.userData.lift; });
    caps.forEach((g, i) => {
      g.visible = i === sec && cut > 0.6;
      if (g.visible) g.position.copy(g.userData.n).multiplyScalar(-clip.constant - g.userData.k);
    });

    if (!reduce) { placeTrains(now); placePeople(dt); }
    else if (trains.length && !trains.placed) { placeTrains(40000); trains.placed = true; placePeople(0); }
    controls.update();
    if (wipe) {
      const e = ease(Math.min(1, Math.max(0, (now - wipe.t0) / wipe.dur))), w0 = W(), h0 = H(), xe = Math.round(e * w0);
      draw(wipe.from);
      if (xe > 0) { renderer.setScissorTest(true); renderer.setScissor(0, 0, xe, h0); draw(wipe.to); renderer.setScissorTest(false); }
      wipeEl.style.opacity = e < 1 ? 1 : 0; wipeEl.style.transform = "translateX(" + xe + "px)";
      if (e >= 1) wipe = null;
    } else draw(lookTo);
    drawHero(now);
    const w = W(), h = H();
    labels.forEach((l) => {
      const v = l.p.clone(); v.y += burst * LIFT[3]; v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      l.el.style.opacity = labOn && vis && !(sec === 2 && cut > 0.3) && !lookTo && !hero ? 1 : 0;
      l.el.style.transform = "translate(" + ((v.x + 1) / 2 * w) + "px," + ((1 - v.y) / 2 * h) + "px) translate(-50%,-100%)";
    });
  }
  raf = requestAnimationFrame(tick);

  // changement jour/nuit : la page est redessinée, on reprend la caméra là où elle était, sans image
  const KEEP = host.__keep || null; host.__keep = null;
  if (KEEP) { controls.autoRotate = false; camera.position.fromArray(KEEP.p); controls.target.fromArray(KEEP.t); camera.fov = KEEP.f; camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); if (KEEP.name && typeof MEDIA !== "undefined" && MEDIA[KEEP.name]) loadMedia(KEEP.name).then((m) => { if (m && alive && !hero) { hero = { name: KEEP.name, m, mode: "show", born: performance.now(), ox: W() / 2, oy: H() / 2, seed: 7, cells: null }; if (loaded) prepCut(hero); heroC.style.opacity = 1; } }); }
  else { heroIn("parvis"); if (!loaded) controls.enabled = false; }
  controls.addEventListener("start", () => { anim = null; controls.autoRotate = false; heroOut(); });

  const ro = new ResizeObserver(() => {
    renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix();
    if (comp) comp.setSize(W(), H());
  });
  ro.observe(host);

  // ne calcule rien quand la vue n'est pas à l'écran
  const io = new IntersectionObserver((es) => {
    const on = es[0].isIntersecting;
    if (on && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    if (!on && running) { running = false; cancelAnimationFrame(raf); }
  });
  io.observe(host);

  host.__g3 = { camera, controls, caps, scene, real, fly, views, fg: setFg, gh: (x, z) => groundH(x, z), freeze: (t) => { heroFreeze = t; }, out: (x, y) => { lastPtr = [x, y]; heroOut(); }, zone: (x, z) => zoneAt(x, z) };
  return {
    fly, real, labels: labels_,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose(); renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.domElement.remove(); labels.forEach((l) => l.el.remove()); wait.remove(); wipeEl.remove(); heroC.remove(); heroTag.remove();
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
