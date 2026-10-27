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
  const C = {
    paper: new THREE.Color(dark ? "#1b1a19" : "#f4f1ec"),
    model: new THREE.Color(dark ? "#2a2826" : "#fbfaf7"),
    white: new THREE.Color(dark ? "#34322f" : "#ffffff"),
    ink: new THREE.Color(dark ? "#e9e4de" : "#1d1b19"),
    brick: new THREE.Color(css("--brick", "#b46a5a")),
    ground: new THREE.Color(dark ? "#222120" : "#efebe4"),
    ballast: new THREE.Color(dark ? "#2e2c2a" : "#e2ddd5"),
    sage: new THREE.Color(dark ? "#3c4a3a" : "#cdd6c4"),
  };

  const W = () => host.clientWidth, H = () => host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.capture });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(C.paper);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.paper, 230, 560);

  const camera = new THREE.PerspectiveCamera(32, W() / H(), 0.5, 2000);
  camera.position.set(-420, 300, 380);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 8, 0);
  controls.minDistance = 12;
  controls.maxDistance = 420;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;

  scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x222222 : 0xd6cec3, dark ? 1.15 : 1.55));
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

  const lineMat = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: dark ? 0.6 : 0.62, clippingPlanes: clips });
  const modelMat = new THREE.MeshLambertMaterial({
    color: C.model, flatShading: true, side: THREE.DoubleSide, clippingPlanes: clips, clipShadows: true,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const mats = {};
  function mat(key, color, extra = {}) {
    if (!mats[key]) mats[key] = new THREE.MeshLambertMaterial(Object.assign({ color, clippingPlanes: clips, clipShadows: true }, extra));
    return mats[key];
  }

  const root = new THREE.Group(), roofG = new THREE.Group(), life = new THREE.Group();
  scene.add(root, roofG, life);

  // message de chargement discret
  const wait = document.createElement("div");
  wait.className = "g3-load";
  wait.textContent = "Chargement de la maquette…";
  wait.style.cssText = "pointer-events:none;transition:opacity .6s";
  host.appendChild(wait);

  let alive = true;
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
    wait.style.opacity = 0;
    setTimeout(() => wait.remove(), 700);
  }).catch(() => { wait.textContent = "Maquette indisponible"; });

  function build(meta, buf) {
    const nv = meta.nv, nf = meta.nf, ne = meta.ne, nfr = meta.nfr, ner = meta.ner;
    const q = new Uint16Array(buf, 0, nv * 3);
    let off = nv * 6; if (nv % 2) off += 6;
    const F = new Uint32Array(buf, off, nf * 3); off += nf * 12;
    const E = new Uint32Array(buf, off, ne * 2);
    const pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = meta.lo[k] + q[i * 3 + k] * meta.sc[k];
    const P = new THREE.BufferAttribute(pos, 3);

    // ensemble fixe (tout sauf les toitures)
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", P);
    g.setIndex(new THREE.BufferAttribute(F.subarray(0, (nf - nfr) * 3), 1));
    const mesh = new THREE.Mesh(g, modelMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", P);
    eg.setIndex(new THREE.BufferAttribute(E.subarray(0, (ne - ner) * 2), 1));
    root.add(new THREE.LineSegments(eg, lineMat));

    // toitures (pour la vue éclatée)
    const gr = new THREE.BufferGeometry();
    gr.setAttribute("position", P);
    gr.setIndex(new THREE.BufferAttribute(F.subarray((nf - nfr) * 3), 1));
    const rm = new THREE.Mesh(gr, modelMat); rm.castShadow = true; rm.receiveShadow = true;
    roofG.add(rm);
    const er = new THREE.BufferGeometry();
    er.setAttribute("position", P);
    er.setIndex(new THREE.BufferAttribute(E.subarray((ne - ner) * 2), 1));
    roofG.add(new THREE.LineSegments(er, lineMat));
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
    const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(gp, 3)); gg.setIndex(gi); gg.computeVertexNormals();
    const gm = new THREE.Mesh(gg, mat("ground", C.ground, { side: THREE.DoubleSide }));
    gm.receiveShadow = true; root.add(gm);
    // trame légère tous les 20 m, posée sur le relief
    const gl = [], step = 5;
    for (let i = 0; i < ny; i += step) for (let j = 0; j < nx - 1; j++) { const a = (i * nx + j) * 3, b = a + 3; gl.push(gp[a], gp[a + 1] + 0.05, gp[a + 2], gp[b], gp[b + 1] + 0.05, gp[b + 2]); }
    for (let j = 0; j < nx; j += step) for (let i = 0; i < ny - 1; i++) { const a = (i * nx + j) * 3, b = a + nx * 3; gl.push(gp[a], gp[a + 1] + 0.05, gp[a + 2], gp[b], gp[b + 1] + 0.05, gp[b + 2]); }
    const glg = new THREE.BufferGeometry(); glg.setAttribute("position", new THREE.Float32BufferAttribute(gl, 3));
    root.add(new THREE.LineSegments(glg, new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: dark ? 0.07 : 0.06, clippingPlanes: clips })));

    // voies : ballast clair et deux rails fins
    const railMat = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.75, clippingPlanes: clips });
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
    env.buildings.forEach((b) => {
      const m = new THREE.Mesh(unit, mat("bat", C.white));
      m.scale.set(b[3], b[5], b[4]); m.position.set(b[0], b[1] + b[5] / 2, b[2]); m.rotation.y = -b[6];
      m.castShadow = true; m.receiveShadow = true; root.add(m);
      const e = new THREE.LineSegments(unitE, lineMat); e.scale.copy(m.scale); e.position.copy(m.position); e.rotation.copy(m.rotation); root.add(e);
    });

    // arbres : couronnes facettées aux emplacements du modèle
    const crownGeo = new THREE.IcosahedronGeometry(2.6, 0), crownE = new THREE.EdgesGeometry(crownGeo);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 5);
    const crownM = mat("crown", C.sage, { flatShading: true }), trunkM = mat("trunk", C.ink);
    const tr = mulberry(5);
    env.trees.forEach((t) => {
      const k = Math.min(1.4, Math.max(0.55, t[3] / 6.4)), h = 4.2 * k;
      const tk = new THREE.Mesh(trunkGeo, trunkM); tk.scale.set(1, h, 1); tk.position.set(t[0], t[1] + h / 2, t[2]); root.add(tk);
      const c = new THREE.Mesh(crownGeo, crownM); c.scale.setScalar(k); c.position.set(t[0], t[1] + h + 1.2 * k, t[2]); c.rotation.y = tr() * 3;
      c.castShadow = true; root.add(c);
      const e = new THREE.LineSegments(crownE, lineMat); e.scale.copy(c.scale); e.position.copy(c.position); e.rotation.copy(c.rotation); root.add(e);
    });
  }

  /* ---------- trains : ils suivent les voies relevées dans le modèle ---------- */
  const trains = [];
  const carGeo = new THREE.BoxGeometry(2.9, 3.5, 23.5);
  const carEdge = new THREE.EdgesGeometry(carGeo);
  const bandGeo = new THREE.BoxGeometry(2.95, 0.45, 23.5);
  function buildTrains(tracks) {
    const spec = [
      { i: 0, cars: 5, speed: 13, phase: 0, dir: 1 },
      { i: 1, cars: 4, speed: 12, phase: 0.5, dir: -1 },
      { i: 3, cars: 4, speed: 11, phase: 0.55, dir: -1 },
      { i: 4, cars: 6, speed: 15, phase: 0.3, dir: 1 },
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
      trains.push(Object.assign(s, { curve, len, cars, gap: 24.5 }));
    });
  }
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Vector3();
  function placeTrains(now) {
    trains.forEach((tr) => {
      const loop = tr.len + tr.cars.length * tr.gap + 200; // le train sort, une pause, puis revient
      let d = ((now / 1000) * tr.speed + tr.phase * loop) % loop;
      tr.cars.forEach((g, i) => {
        const x = d - i * tr.gap;
        if (x < 1 || x > tr.len - 1) { g.visible = false; return; }
        const u0 = tr.dir > 0 ? x / tr.len : 1 - x / tr.len;
        const u1 = Math.min(1, Math.max(0, u0 + (tr.dir > 0 ? 2 : -2) / tr.len));
        tr.curve.getPointAt(u0, tmpP); tr.curve.getPointAt(u1, tmpQ);
        g.position.copy(tmpP); g.lookAt(tmpQ.x, tmpP.y, tmpQ.z); g.visible = true;
      });
    });
  }

  /* ---------- passants sur les plateaux de la passerelle ---------- */
  const rnd = mulberry(11);
  const people = [];
  const pGeo = new THREE.CapsuleGeometry(0.25, 1.15, 2, 6);
  const pMat = mat("person", C.ink.clone().lerp(C.paper, 0.3));
  const decks = [[2, 46, 8.0], [54, 92, 11.8], [100, 150, 15.5]];
  decks.forEach(([s0, s1, y], j) => {
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(pGeo, pMat); p.castShadow = true; life.add(p);
      people.push({ p, s: s0 + rnd() * (s1 - s0), t: (rnd() - 0.5) * 9, v: (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 0.6), s0, s1, y });
    }
  });
  function placePeople(dt) {
    people.forEach((o) => {
      o.s += o.v * dt;
      if (o.s < o.s0 || o.s > o.s1) { o.v *= -1; o.s = Math.min(o.s1, Math.max(o.s0, o.s)); }
      o.p.position.copy(along(o.s, o.t, o.y + 0.85));
    });
  }

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
  const mid = along(80, 0, 10);
  const views = {
    ensemble: { pos: [-140, 105, 150], tgt: [0, 8, 0] },
    parvis: { pos: along(-58, -30, 5.7).toArray(), tgt: along(40, 2, 11).toArray() },
    coupe: { pos: mid.clone().addScaledVector(N, -175).setY(16).toArray(), tgt: mid.toArray() },
    eclate: { pos: [-150, 100, 135], tgt: [0, 16, 0] },
  };
  const cutAt = -N.dot(mid) + 1.5; // plan passant juste devant l'axe
  let anim = null, cut = 0, cutTo = 0, burst = 0, burstTo = 0;
  function fly(name, dur = 2400) {
    const v = views[name];
    const ar = W() / H(), kk = name === "parvis" ? 1 : ar < 1 ? 1.8 : ar < 1.4 ? 1.3 : 1;
    const t1 = new THREE.Vector3(...v.tgt), p1 = new THREE.Vector3(...v.pos).sub(t1).multiplyScalar(kk).add(t1);
    anim = { t0: performance.now(), dur, p0: camera.position.clone(), t0v: controls.target.clone(), p1, t1 };
    controls.autoRotate = false;
    cutTo = name === "coupe" ? 1 : 0;
    burstTo = name === "eclate" ? 1 : 0;
    controls.maxPolarAngle = name === "parvis" ? Math.PI * 0.53 : Math.PI * 0.49;
    if (name === "ensemble") setTimeout(() => { if (!anim) controls.autoRotate = true; }, dur + 200);
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  let running = true, raf = 0, last = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { controls.autoRotate = false; camera.position.set(...views.ensemble.pos); controls.target.set(...views.ensemble.tgt); }
  else fly("ensemble", 4200);

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (anim) {
      const k = ease(Math.min(1, (now - anim.t0) / anim.dur));
      camera.position.lerpVectors(anim.p0, anim.p1, k);
      controls.target.lerpVectors(anim.t0v, anim.t1, k);
      if (k >= 1) anim = null;
    }
    cut += (cutTo - cut) * Math.min(1, dt * 2.2);
    // on garde les points où N·p + c >= 0 (la moitié opposée à la caméra en coupe)
    clip.constant = 600 + (cutAt - 600) * cut;
    burst += (burstTo - burst) * Math.min(1, dt * 2.4);
    roofG.position.y = burst * 20;

    if (!reduce) { placeTrains(now); placePeople(dt); }
    else if (trains.length && !trains.placed) { placeTrains(40000); trains.placed = true; placePeople(0); }
    controls.update();
    renderer.render(scene, camera);
    const w = W(), h = H();
    labels.forEach((l) => {
      const v = l.p.clone(); v.y += burst * 20; v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      l.el.style.opacity = vis ? 1 : 0;
      l.el.style.transform = "translate(" + ((v.x + 1) / 2 * w) + "px," + ((1 - v.y) / 2 * h) + "px) translate(-50%,-100%)";
    });
  }
  raf = requestAnimationFrame(tick);

  controls.addEventListener("start", () => { anim = null; controls.autoRotate = false; });

  const ro = new ResizeObserver(() => {
    renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix();
  });
  ro.observe(host);

  // ne calcule rien quand la vue n'est pas à l'écran
  const io = new IntersectionObserver((es) => {
    const on = es[0].isIntersecting;
    if (on && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    if (!on && running) { running = false; cancelAnimationFrame(raf); }
  });
  io.observe(host);

  return {
    fly,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose(); renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.domElement.remove(); labels.forEach((l) => l.el.remove()); wait.remove();
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
