import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';
import { buildPlan, balance, round, alternativesFor, swapExercise, relativeTo,
         applyWeek, retally, BLOCK, fmtMins, fmtRest } from './plan.js';

/* ============================================================
   Kinetic Atlas — 873 exercises mapped onto a real anatomical model

   Exercises: yuhonas/free-exercise-db (public domain)
   Anatomy:   BodyExplorer anatomy.glb — 467 named muscle meshes.
              BodyParts3D, © The Database Center for Life Science,
              CC BY-SA 2.1 Japan. Z-Anatomy by Gauthier Kervyn,
              CC BY-SA 4.0. Source is Z-up in millimetres.
   ============================================================ */

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const MUSCLES = [
  'abdominals','abductors','adductors','biceps','calves','chest','forearms','glutes',
  'hamstrings','lats','lower back','middle back','neck','quadriceps','shoulders','traps','triceps'
];

const BACK_MUSCLES = new Set(['glutes','hamstrings','lats','middle back','lower back','traps','triceps','calves']);

const MUSCLE_FN = {
  'abdominals': 'trunk flexion and core bracing',
  'abductors': 'moving the leg away from the midline and stabilizing the pelvis',
  'adductors': 'drawing the leg toward the midline',
  'biceps': 'elbow flexion and forearm supination',
  'calves': 'ankle plantar flexion — the push off the ground',
  'chest': 'horizontal pressing and drawing the arms across the body',
  'forearms': 'grip strength and wrist control',
  'glutes': 'hip extension and drive out of the bottom position',
  'hamstrings': 'hip extension and knee flexion',
  'lats': 'pulling the arms down and back toward the torso',
  'lower back': 'spinal extension and keeping the trunk rigid under load',
  'middle back': 'scapular retraction — squeezing the shoulder blades together',
  'neck': 'head stability and cervical movement',
  'quadriceps': 'knee extension',
  'shoulders': 'raising and rotating the arm',
  'traps': 'elevating and stabilizing the shoulder girdle',
  'triceps': 'elbow extension and lockout strength'
};

/* The specimen is red, so selection must contrast with tissue rather than
   compete with it: teal for the primary mover, amber for assisting. */
const C = {
  base:      new THREE.Color('#9e4437'),
  dim:       new THREE.Color('#7c4034'),
  primary:   new THREE.Color('#3fd8c6'),
  secondary: new THREE.Color('#efa733'),
  covLow:    new THREE.Color('#3c2f2b'),
  covHigh:   new THREE.Color('#3fd8c6'),
};

/* ============================================================
   Renderer / scene
   ============================================================ */
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
camera.position.set(0.62, 1.18, 3.35);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.90, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.2;
controls.maxDistance = 5.5;
controls.maxPolarAngle = Math.PI / 2 + 0.14;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;

/* environment: warm studio gradient, drives PBR reflections */
(function buildEnv() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 16;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 16);
  grd.addColorStop(0, '#cfd8dd');
  grd.addColorStop(0.42, '#5d5751');
  grd.addColorStop(1, '#17140f');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
})();

scene.add(new THREE.HemisphereLight(0xdfe6ea, 0x30271f, 0.42));
const key = new THREE.DirectionalLight(0xfff2e2, 2.5);
key.position.set(1.9, 3.2, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -1.1; key.shadow.camera.right = 1.1;
key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -0.3;
key.shadow.bias = -0.0006;
key.shadow.radius = 5;
scene.add(key);
const fill = new THREE.DirectionalLight(0x9fb6cc, 0.5);
fill.position.set(-2.6, 1.6, 1.4);
scene.add(fill);
/* rim separates the figure from the dark ground */
const rim = new THREE.DirectionalLight(0xbfe6df, 1.5);
rim.position.set(-1.4, 2.2, -2.8);
scene.add(rim);

/* pedestal */
const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.60, 0.66, 0.10, 72),
  new THREE.MeshStandardMaterial({ color: 0x2a2521, roughness: 0.95, metalness: 0 })
);
pedestal.position.y = -0.05;
pedestal.receiveShadow = true;
scene.add(pedestal);

/* ============================================================
   Build the figure
   ============================================================ */
const body = new THREE.Group();
scene.add(body);

/* unassigned parts: hand and foot intrinsics, larynx, eye, pelvic floor,
   diaphragm, intercostals, ligaments. Rendered as neutral deep tissue. */
const tissueMat = new THREE.MeshStandardMaterial({
  color: 0x7c4038, roughness: 0.9, metalness: 0.0,
  envMapIntensity: 0.3, side: THREE.DoubleSide,
});

const muscleGroups = {};
let pickMeshes = [];
let modelReady = false;

for (const name of MUSCLES) {
  /* small deterministic variation per group, as in an anatomy plate */
  const seed = MUSCLES.indexOf(name);
  const jitter = ((seed * 37) % 11) / 11 - 0.5;
  const base = C.base.clone().offsetHSL(jitter * 0.016, jitter * 0.05, jitter * 0.03);
  const mat = new THREE.MeshStandardMaterial({
    color: base.clone(), roughness: 0.86, metalness: 0.0,
    envMapIntensity: 0.45, side: THREE.DoubleSide,
    emissive: 0x000000, emissiveIntensity: 0,
  });
  muscleGroups[name] = { mat, base, meshes: [], state: 'base' };
}

/* A real scanned human head (Lee Perry-Smith, CC BY 3.0) fitted over the
   region the cadaver's facial muscles occupied. Rendered untextured, so it
   reads as a sculpted bust rather than a photoreal face on a flayed body. */
function addScannedHead(box) {
  const target = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  gltfLoader.load('./data/head.glb', (g) => {
    let src = null;
    g.scene.traverse(o => { if (o.isMesh && !src) src = o; });
    if (!src) return;

    /* the scan is a bust: clip its shoulders off so only head and neck show */
    const cut = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const head = new THREE.Mesh(src.geometry, new THREE.MeshStandardMaterial({
      color: 0x9d846f, roughness: 0.74, metalness: 0.0, envMapIntensity: 0.45,
      clippingPlanes: [cut], clipShadows: true, side: THREE.DoubleSide,
    }));
    head.castShadow = true;
    head.receiveShadow = true;

    /* fit the scan's own bounds to the head region */
    head.geometry.computeBoundingBox();
    const b = head.geometry.boundingBox;
    const size = b.getSize(new THREE.Vector3());
    const mid = b.getCenter(new THREE.Vector3());
    const scale = (target.y * HEAD_FIT.scale) / size.y;
    head.scale.setScalar(scale);
    head.position.set(
      centre.x - mid.x * scale,
      box.max.y - (b.max.y * scale) + target.y * HEAD_FIT.dropY,
      centre.z - mid.z * scale + target.z * HEAD_FIT.pushZ,
    );
    cut.constant = -(box.min.y - target.y * HEAD_FIT.neckCut);
    body.add(head);
  });
}

function setStatus(text) {
  const el = document.getElementById('stageStatus');
  if (el) { el.textContent = text || ''; el.hidden = !text; }
}

setStatus('Loading anatomical model…');

const draco = new DRACOLoader().setDecoderPath('./vendor/draco/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);

/* head placement, tuned by eye against the cadaver's neck */
const HEAD_FIT = { scale: 1.30, dropY: 0.02, pushZ: 0.0, neckCut: 0.04 };

gltfLoader.load('./data/anatomy.glb', async (gltf) => {
  const root = gltf.scene;

  /* source is Z-up, in millimetres */
  root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(0.001);
  root.updateMatrixWorld(true);

  let map = {};
  try {
    map = await fetch('./data/muscle_group_map.json').then(r => r.json());
  } catch { /* every mesh falls back to neutral tissue */ }

  /* exact-name lookup: mesh name -> one of the 17 labels.
     GLTFLoader sanitizes node names, so "left biceps brachii"
     arrives as "left_biceps_brachii" — normalize both sides. */
  const norm = (s) => (s || '').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const nameToGroup = new Map();
  for (const [group, names] of Object.entries(map)) {
    for (const n of names) nameToGroup.set(norm(n), group);
  }

  root.traverse((o) => {
    if (!o.isMesh) return;
    const group = nameToGroup.get(norm(o.name));
    if (group && muscleGroups[group]) {
      o.material = muscleGroups[group].mat;
      o.userData.muscle = group;
      muscleGroups[group].meshes.push(o);
      pickMeshes.push(o);
    } else {
      o.material = tissueMat;
    }
    o.castShadow = true;
    o.receiveShadow = true;
  });

  /* The source is a cadaver, so the head is exposed facial musculature.
     Hide those meshes; a scanned head replaces them below. Named muscles
     stay untouched — neck muscles run past the chin and must stay clickable. */
  const facial = [];
  {
    const full = new THREE.Box3().setFromObject(root);
    const H = full.max.y - full.min.y;
    const chin = full.max.y - 0.145 * H;
    const each = new THREE.Box3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      each.setFromObject(o);
      const span = each.max.y - each.min.y;
      const inHead = each.min.y > chin
        || ((each.min.y + each.max.y) / 2 > chin && span < 0.05 * H);
      if (inHead) { o.visible = false; facial.push(o); }
    });
    pickMeshes = pickMeshes.filter(m => m.visible);
  }

  /* stand the figure on the pedestal and centre it */
  const box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  root.position.x -= centre.x;
  root.position.z -= centre.z;
  root.position.y -= box.min.y;
  body.add(root);
  root.updateMatrixWorld(true);

  /* now that the figure is in its final place, fit the head to it */
  if (facial.length) {
    const headBox = new THREE.Box3();
    const each = new THREE.Box3();
    for (const o of facial) headBox.union(each.setFromObject(o));
    addScannedHead(headBox);
  }

  /* frame to the model's real height */
  const height = box.max.y - box.min.y;
  controls.target.set(0, height * 0.50, 0);
  camera.position.set(height * 0.30, height * 0.56, height * 2.15);
  const shadowCam = key.shadow.camera;
  shadowCam.top = height * 1.3; shadowCam.bottom = -height * 0.2;
  shadowCam.left = -height * 0.6; shadowCam.right = height * 0.6;
  shadowCam.updateProjectionMatrix();

  modelReady = true;
  setStatus('');
  applyMuscleColors();
  /* honour a facing requested while the model was still downloading */
  if (pendingFace !== null) { const b = pendingFace; pendingFace = null; faceSide(b); }
}, (evt) => {
  if (evt.total) setStatus(`Loading anatomical model… ${Math.round((evt.loaded / evt.total) * 100)}%`);
}, () => {
  setStatus('Could not load the anatomical model. Reload to retry.');
});

/* ============================================================
   Highlight state
   ============================================================ */
let activePrimary = new Set();
let activeSecondary = new Set();
let hoveredMuscle = null;

function applyMuscleColors() {
  const anySelection = activePrimary.size + activeSecondary.size > 0;
  for (const [name, g] of Object.entries(muscleGroups)) {
    if (activePrimary.has(name)) {
      g.mat.color.copy(C.primary);
      g.mat.emissive.copy(C.primary);
      g.state = 'primary';
    } else if (activeSecondary.has(name)) {
      g.mat.color.copy(C.secondary);
      g.mat.emissive.copy(C.secondary);
      g.mat.emissiveIntensity = 0.14;
      g.state = 'secondary';
    } else {
      g.mat.color.copy(anySelection ? C.dim : g.base);
      g.mat.emissive.set(0x000000);
      g.mat.emissiveIntensity = 0;
      g.state = 'base';
    }
  }
}

/* Coverage: paint every muscle by how many exercises train it as the primary
   mover, turning the body from a picker into a read-out. */
function applyCoverage() {
  const max = Math.max(1, ...Object.values(muscleCounts));
  for (const [name, g] of Object.entries(muscleGroups)) {
    const t = Math.pow((muscleCounts[name] || 0) / max, 0.6);
    g.mat.color.copy(C.covLow).lerp(C.covHigh, t);
    g.mat.emissive.copy(C.covHigh);
    g.mat.emissiveIntensity = 0.05 + 0.16 * t;
    g.state = 'coverage';
  }
}

function setCoverage(on) {
  coverageOn = on;
  document.getElementById('viewCoverage').classList.toggle('on', on);
  document.getElementById('legend').hidden = on;
  document.getElementById('legendCoverage').hidden = !on;
  if (on) {
    document.getElementById('covMax').textContent =
      Math.max(0, ...Object.values(muscleCounts)) + '';
    applyCoverage();
  } else {
    applyMuscleColors();
  }
}

function setHighlight(primaries, secondaries) {
  if (coverageOn) setCoverage(false);
  activePrimary = new Set(primaries.filter(m => muscleGroups[m]));
  activeSecondary = new Set(secondaries.filter(m => muscleGroups[m] && !activePrimary.has(m)));
  applyMuscleColors();
}

/* ============================================================
   Camera tween
   ============================================================ */
let tween = null;
function tweenAzimuth(targetAz) {
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const from = sph.theta;
  let delta = targetAz - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  tween = { from, delta, phi: sph.phi, r: sph.radius, t: 0 };
}
function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / 0.75);
  const e = 1 - Math.pow(1 - tween.t, 3);
  camera.position
    .setFromSpherical(new THREE.Spherical(tween.r, tween.phi, tween.from + tween.delta * e))
    .add(controls.target);
  if (tween.t >= 1) tween = null;
}

const autoRotateBox = document.getElementById('autoRotate');
autoRotateBox.addEventListener('change', () => { controls.autoRotate = autoRotateBox.checked; });
function pauseAutoRotate() { controls.autoRotate = false; autoRotateBox.checked = false; }
/* one Flip button instead of Front/Back: the camera already turns itself
   when a selection lands, so this only needs to toggle the other side */
let facingBack = false;
let pendingFace = null;   /* a restored URL can ask to turn before the model exists */
function faceSide(back) {
  facingBack = back;
  if (!modelReady) { pendingFace = back; return; }
  pauseAutoRotate();
  tweenAzimuth(back ? Math.PI : 0);
}
document.getElementById('viewFlip').addEventListener('click', () => faceSide(!facingBack));
document.getElementById('viewReset').addEventListener('click', () => {
  facingBack = false;
  pauseAutoRotate();
  tweenAzimuth(0.14);
});
document.getElementById('viewCoverage').addEventListener('click', () => setCoverage(!coverageOn));
controls.addEventListener('start', () => { tween = null; });

/* ============================================================
   Raycast: hover + click
   ============================================================ */
const raycaster = new THREE.Raycaster();
const pointerV = new THREE.Vector2();
const hoverLabel = document.getElementById('hoverLabel');
let downPos = null;

function pick(e) {
  if (!modelReady) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerV.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerV.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerV, camera);
  const hits = raycaster.intersectObjects(pickMeshes, false);
  return hits.length ? hits[0].object.userData.muscle : null;
}

viewport.addEventListener('pointermove', (e) => {
  const m = pick(e);
  if (m !== hoveredMuscle) {
    if (hoveredMuscle && muscleGroups[hoveredMuscle].state === 'base') {
      muscleGroups[hoveredMuscle].mat.emissive.set(0x000000);
      muscleGroups[hoveredMuscle].mat.emissiveIntensity = 0;
    }
    hoveredMuscle = m;
    if (m && muscleGroups[m].state === 'base') {
      muscleGroups[m].mat.emissive.copy(C.primary);
      muscleGroups[m].mat.emissiveIntensity = 0.14;
    }
  }
  viewport.classList.toggle('point', !!m);
  if (m) {
    const rect = viewport.getBoundingClientRect();
    hoverLabel.style.left = (e.clientX - rect.left) + 'px';
    hoverLabel.style.top = (e.clientY - rect.top) + 'px';
    const n = muscleCounts[m];
    hoverLabel.textContent = n ? `${m} · ${n}` : m;
    hoverLabel.classList.add('on');
  } else {
    hoverLabel.classList.remove('on');
  }
});
viewport.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; viewport.classList.add('dragging'); });
viewport.addEventListener('pointerup', (e) => {
  viewport.classList.remove('dragging');
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 5) return;
  const m = pick(e);
  if (m) selectMuscleFilter(m);
});
viewport.addEventListener('pointerleave', () => hoverLabel.classList.remove('on'));

/* ============================================================
   Render loop
   ============================================================ */
const clock = new THREE.Clock();
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(viewport);
resize();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  stepTween(dt);
  controls.update();
  if (!coverageOn) {
    for (const name of activePrimary) {
      muscleGroups[name].mat.emissiveIntensity = 0.22 + 0.10 * Math.sin(t * 2.6);
    }
  }
  renderer.render(scene, camera);
});

/* ============================================================
   Data + UI
   ============================================================ */
const $ = (id) => document.getElementById(id);
const exListEl = $('exList'), listFoot = $('listFoot'), resultCount = $('resultCount');
const stageLabel = $('stageLabel');

let ALL = [];
let filters = { q: '', muscle: '', equipment: '', level: '', category: '', role: 'primary', sort: 'recommended' };
let muscleCounts = {};   /* primary-mover count per muscle, for coverage paint */
let coverageOn = false;
let selectedId = null;
let crossfadeTimer = null;

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const fMuscle = $('fMuscle');
for (const m of MUSCLES) {
  const o = document.createElement('option');
  o.value = m; o.textContent = cap(m);
  fMuscle.appendChild(o);
}

exListEl.innerHTML = '<div class="list-empty">Loading exercise library…</div>';

/* one retry: the model download runs concurrently and can starve this */
function loadExercises(attempt = 0) {
  return fetch('./data/exercises.json')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch((err) => {
      if (attempt >= 2) throw err;
      return new Promise(res => setTimeout(res, 400 * (attempt + 1)))
        .then(() => loadExercises(attempt + 1));
    });
}

loadExercises()
  .catch((err) => {
    exListEl.innerHTML = '<div class="list-empty">Could not load the exercise library. Reload to retry.</div>';
    throw err;
  })
  .then(data => {
    ALL = data;
    const equip = [...new Set(data.map(e => e.equipment).filter(e => e && e !== 'None'))].sort();
    const fEq = $('fEquipment');
    for (const eq of equip) {
      const o = document.createElement('option');
      o.value = eq; o.textContent = cap(eq);
      fEq.appendChild(o);
    }

    /* primary-mover counts drive coverage paint and hover read-outs */
    muscleCounts = {};
    for (const m of MUSCLES) muscleCounts[m] = 0;
    for (const e of data) for (const m of e.primaryMuscles) if (m in muscleCounts) muscleCounts[m]++;

    buildEquipChips(data);
    initPlanner();
    const wantEx = readUrl();
    applyFiltersToControls();
    refreshList();
    if (wantEx) {
      const ex = data.find(e => e.id === wantEx);
      if (ex) selectExercise(ex);
    } else if (filters.muscle) {
      previewMuscle(filters.muscle);
    }
  })
  .catch(() => { /* already reported */ });

/* Movement pattern, derived from the exercise name, mechanic and force.
   The dataset has no pattern field, so this is inference — it returns null
   rather than guessing when nothing matches. */
const PATTERNS = [
  ['hinge',           /deadlift|good morning|hip thrust|glute bridge|swing|rdl|romanian|hyperextension|back extension|clean|snatch/i],
  ['squat',           /squat|leg press|hack|sissy/i],
  ['lunge',           /lunge|split squat|step[- ]?up|bulgarian/i],
  ['vertical pull',   /pull[- ]?up|chin[- ]?up|pulldown|lat pull/i],
  ['horizontal pull', /row|face pull|rear delt/i],
  ['vertical push',   /overhead press|shoulder press|military|push press|handstand|jerk/i],
  ['horizontal push', /bench press|push[- ]?up|chest press|dip|fly|flye/i],
  ['carry',           /carry|farmer|walk|hold|plank/i],
  ['pullover',        /pullover/i],
  ['rotation',        /twist|rotation|russian|wood ?chop|oblique/i],
];
function patternOf(e) {
  for (const [name, re] of PATTERNS) if (re.test(e.name)) return name;
  if (e.category === 'stretching') return 'mobility';
  if (e.category === 'cardio') return 'conditioning';
  if (e.mechanic === 'isolation') return 'isolation';
  return null;
}

/* How the selected muscle is used by an exercise: it either drives the
   movement, only assists it, or is not involved. */
function roleOf(e, muscle) {
  if (!muscle) return null;
  if (e.primaryMuscles.includes(muscle)) return 'primary';
  if (e.secondaryMuscles.includes(muscle)) return 'assists';
  return null;
}

function filtered() {
  const q = filters.q.toLowerCase();
  const rows = ALL.filter(e => {
    if (filters.muscle) {
      const role = roleOf(e, filters.muscle);
      if (!role) return false;
      if (filters.role === 'primary' && role !== 'primary') return false;
    }
    if (filters.equipment && e.equipment !== filters.equipment) return false;
    if (filters.level && e.level !== filters.level) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (q) {
      const hay = (e.name + ' ' + e.primaryMuscles.join(' ') + ' ' + e.secondaryMuscles.join(' ') + ' ' + (e.equipment || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return sortRows(rows);
}

const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };

/* Alphabetical puts "3/4 Sit-Up" first out of 873, which is close to random.
   Recommended ranks movers over assisters, then compounds over isolation. */
function sortRows(rows) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (filters.sort === 'az') return rows.sort(byName);
  if (filters.sort === 'level') {
    return rows.sort((a, b) =>
      (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9) || byName(a, b));
  }
  return rows.sort((a, b) => {
    if (filters.muscle) {
      const ra = roleOf(a, filters.muscle) === 'primary' ? 0 : 1;
      const rb = roleOf(b, filters.muscle) === 'primary' ? 0 : 1;
      if (ra !== rb) return ra - rb;
    }
    const ca = a.mechanic === 'compound' ? 0 : a.mechanic === 'isolation' ? 1 : 2;
    const cb = b.mechanic === 'compound' ? 0 : b.mechanic === 'isolation' ? 1 : 2;
    if (ca !== cb) return ca - cb;
    const la = LEVEL_RANK[a.level] ?? 9, lb = LEVEL_RANK[b.level] ?? 9;
    if (la !== lb) return la - lb;
    return byName(a, b);
  });
}

const LIST_CAP = 140;
function refreshList() {
  syncRoleRow();
  const rows = filtered();
  resultCount.textContent = rows.length;
  exListEl.textContent = '';
  if (!rows.length) {
    exListEl.innerHTML = '<div class="list-empty">No exercises match these filters.<br>Loosen one and try again.</div>';
    listFoot.textContent = '';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const e of rows.slice(0, LIST_CAP)) {
    const b = document.createElement('button');
    b.className = 'exitem' + (e.id === selectedId ? ' selected' : '');
    b.setAttribute('role', 'option');
    const role = roleOf(e, filters.muscle);
    const tag = role === 'assists' ? `<span class="rtag">assists</span>` : '';
    b.innerHTML = `<span class="lvl lvl-${e.level}"></span>
      <span><span class="ex-name">${e.name}</span>${tag}<br><span class="ex-sub">${e.primaryMuscles.join(', ') || e.category}</span></span>`;
    b.addEventListener('click', () => selectExercise(e));
    frag.appendChild(b);
  }
  exListEl.appendChild(frag);
  listFoot.textContent = rows.length > LIST_CAP
    ? `Showing ${LIST_CAP} of ${rows.length} — refine to narrow down`
    : `${rows.length} exercise${rows.length === 1 ? '' : 's'}`;
  const sel = exListEl.querySelector('.exitem.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

/* Equipment is the real constraint on what you can do right now, so the
   common options sit in reach instead of inside a dropdown. */
const CHIP_EQUIP = ['body only', 'dumbbell', 'barbell', 'cable', 'machine', 'bands', 'kettlebells'];
function buildEquipChips(data) {
  const row = $('equipRow');
  if (!row) return;
  const present = new Set(data.map(e => e.equipment));
  const mk = (value, label) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.equip = value;
    b.textContent = label;
    b.addEventListener('click', () => {
      filters.equipment = filters.equipment === value ? '' : value;
      $('fEquipment').value = filters.equipment;
      refreshList();
      syncEquipChips();
    });
    row.appendChild(b);
  };
  mk('', 'Any');
  for (const eq of CHIP_EQUIP) if (present.has(eq)) mk(eq, cap(eq));
  syncEquipChips();
}
function syncEquipChips() {
  document.querySelectorAll('.chip').forEach(c =>
    c.classList.toggle('on', (c.dataset.equip || '') === filters.equipment));
}

/* push restored URL state back into the controls */
function applyFiltersToControls() {
  $('search').value = filters.q;
  $('fMuscle').value = filters.muscle;
  $('fEquipment').value = filters.equipment;
  $('fLevel').value = filters.level;
  $('fSort').value = filters.sort;
  document.querySelectorAll('.navpill').forEach(p =>
    p.classList.toggle('active', (p.dataset.cat || '') === filters.category));
  document.querySelectorAll('.segbtn').forEach(b =>
    b.classList.toggle('active', b.dataset.role === filters.role));
  syncEquipChips();
}

$('clearChip').addEventListener('click', clearAll);
$('fSort').addEventListener('change', (e) => { filters.sort = e.target.value; refreshList(); });
$('search').addEventListener('input', (e) => { filters.q = e.target.value.trim(); refreshList(); });
fMuscle.addEventListener('change', (e) => {
  filters.muscle = e.target.value;
  if (!selectedId) previewMuscle(filters.muscle);
  refreshList();
});
$('fEquipment').addEventListener('change', (e) => { filters.equipment = e.target.value; refreshList(); syncEquipChips(); });
document.querySelectorAll('.segbtn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.segbtn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  filters.role = b.dataset.role;
  refreshList();
}));
$('fLevel').addEventListener('change', (e) => { filters.level = e.target.value; refreshList(); });
document.querySelectorAll('.navpill').forEach(p => p.addEventListener('click', () => {
  document.querySelectorAll('.navpill').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  filters.category = p.dataset.cat;
  refreshList();
}));

function syncRoleRow() {
  const row = document.getElementById('roleRow');
  if (!row) return;
  row.hidden = !filters.muscle;
  if (filters.muscle) document.getElementById('roleLabel').textContent = `Trains ${filters.muscle}`;
  syncClearChip();
  writeUrl();
}

/* One obvious way out of any filtered state. Clicking the body sets a filter,
   so the way back must live on the stage, not only in the dropdown. */
function syncClearChip() {
  const chip = document.getElementById('clearChip');
  if (!chip) return;
  const bits = [];
  if (filters.muscle) bits.push(filters.muscle);
  if (filters.equipment) bits.push(filters.equipment);
  if (filters.level) bits.push(filters.level);
  if (filters.category) bits.push(filters.category);
  if (filters.q) bits.push(`“${filters.q}”`);
  if (selectedId) {
    const ex = ALL.find(e => e.id === selectedId);
    if (ex) bits.unshift(ex.name);
  }
  chip.hidden = bits.length === 0;
  document.getElementById('clearChipText').textContent = bits.join(' · ');
}

function clearAll() {
  filters = { q: '', muscle: '', equipment: '', level: '', category: '', role: 'primary', sort: filters.sort };
  selectedId = null;
  document.getElementById('search').value = '';
  document.getElementById('fMuscle').value = '';
  document.getElementById('fEquipment').value = '';
  document.getElementById('fLevel').value = '';
  document.querySelectorAll('.navpill').forEach(p => p.classList.toggle('active', !p.dataset.cat));
  document.querySelectorAll('.segbtn').forEach(b => b.classList.toggle('active', b.dataset.role === 'primary'));
  hideDetail();
  setHighlight([], []);
  stageLabel.textContent = 'Full body';
  refreshList();
  syncEquipChips();
}

/* ---------- URL state: filters survive a reload and can be shared ---------- */
function writeUrl() {
  const p = new URLSearchParams();
  for (const k of ['q', 'muscle', 'equipment', 'level', 'category']) if (filters[k]) p.set(k, filters[k]);
  if (filters.role !== 'primary') p.set('role', filters.role);
  if (filters.sort !== 'recommended') p.set('sort', filters.sort);
  if (selectedId) p.set('ex', selectedId);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of ['q', 'muscle', 'equipment', 'level', 'category', 'role', 'sort']) {
    const v = p.get(k);
    if (v) filters[k] = v;
  }
  return p.get('ex');
}

document.querySelectorAll('.segbtn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.segbtn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  filters.role = b.dataset.role;
  refreshList();
}));

function previewMuscle(muscle) {
  if (muscle) {
    setHighlight([muscle], []);
    stageLabel.textContent = cap(muscle);
    faceSide(BACK_MUSCLES.has(muscle));
  } else {
    setHighlight([], []);
    stageLabel.textContent = 'Full body';
  }
}

function selectMuscleFilter(muscle) {
  fMuscle.value = muscle;
  filters.muscle = muscle;
  selectedId = null;
  hideDetail();
  previewMuscle(muscle);
  refreshList();
}

/* ============================================================
   Detail panel
   ============================================================ */
function hideDetail() {
  $('detailBody').hidden = true;
  $('detailEmpty').hidden = false;
  if (crossfadeTimer) { clearInterval(crossfadeTimer); crossfadeTimer = null; }
}

function selectExercise(e) {
  selectedId = e.id;
  refreshList();

  setHighlight(e.primaryMuscles, e.secondaryMuscles);
  const all = [...e.primaryMuscles, ...e.secondaryMuscles];
  if (all.length) {
    const backScore = all.filter(m => BACK_MUSCLES.has(m)).length;
    faceSide(backScore > all.length / 2);
  }
  stageLabel.textContent = e.name;

  $('detailEmpty').hidden = true;
  $('detailBody').hidden = false;
  $('detailPanel').scrollTop = 0;
  $('dOverline').textContent = [e.category, e.force].filter(x => x && x !== 'None').join(' · ') || 'movement';
  $('dTitle').textContent = e.name;
  $('dEpithet').textContent = e.primaryMuscles.length
    ? 'Targets the ' + e.primaryMuscles.join(' & ')
    : cap(e.category);

  const badges = [`<span class="badge hot">${e.level}</span>`];
  if (e.equipment && e.equipment !== 'None') badges.push(`<span class="badge">${e.equipment}</span>`);
  if (e.mechanic && e.mechanic !== 'None') badges.push(`<span class="badge">${e.mechanic}</span>`);
  if (e.force && e.force !== 'None') badges.push(`<span class="badge">${e.force}</span>`);
  $('dBadges').innerHTML = badges.join('');

  const fA = $('frameA'), fB = $('frameB'), tag = $('frameTag'), fb = $('moverFallback');
  fb.hidden = true; fA.style.display = ''; fB.style.display = '';
  const onerr = () => { fb.hidden = false; fA.style.display = 'none'; fB.style.display = 'none'; };
  fA.onerror = onerr; fB.onerror = onerr;
  fA.src = IMG_BASE + e.images[0];
  fB.src = IMG_BASE + (e.images[1] || e.images[0]);
  fB.style.opacity = 0;
  tag.textContent = 'Start';
  if (crossfadeTimer) clearInterval(crossfadeTimer);
  let atEnd = false;
  crossfadeTimer = setInterval(() => {
    atEnd = !atEnd;
    fB.style.opacity = atEnd ? 1 : 0;
    tag.textContent = atEnd ? 'End' : 'Start';
  }, 1500);

  /* some rows list a muscle as both primary and secondary — show it once */
  const tags = [];
  for (const m of e.primaryMuscles) tags.push(`<button class="mtag primary" data-m="${m}">${m}</button>`);
  for (const m of assistOf(e)) tags.push(`<button class="mtag secondary" data-m="${m}">${m}</button>`);
  $('dMuscles').innerHTML = tags.join('') || '<span class="badge">full body</span>';
  $('dMuscles').querySelectorAll('.mtag').forEach(b =>
    b.addEventListener('click', () => selectMuscleFilter(b.dataset.m)));

  /* at a glance, before the wall of text */
  const pattern = patternOf(e);
  const glance = [
    ['Pattern', pattern || '—'],
    ['Mechanic', e.mechanic && e.mechanic !== 'None' ? e.mechanic : '—'],
    ['Equipment', e.equipment && e.equipment !== 'None' ? e.equipment : 'none'],
    ['Level', e.level],
  ];
  $('dGlance').innerHTML = glance
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  const steps = (e.instructions || []).filter(s => s && s.trim());
  $('dSteps').innerHTML = steps.length
    ? steps.map(s => `<li>${s}</li>`).join('')
    : '<li>No written steps for this one. Follow the start and end frames above.</li>';
  $('dStepCount').textContent = steps.length ? `${steps.length} steps` : '';
  $('dStepsWrap').open = false;

  $('dImpactText').textContent = impactText(e);
  syncClearChip();
  writeUrl();
}

const assistOf = (e) => e.secondaryMuscles.filter(m => !e.primaryMuscles.includes(m));

function impactText(e) {
  const parts = [];
  const kind = [e.mechanic && e.mechanic !== 'None' ? e.mechanic : null,
                e.force && e.force !== 'None' ? e.force : null].filter(Boolean).join(' ');
  if (e.primaryMuscles.length) {
    const fn = MUSCLE_FN[e.primaryMuscles[0]];
    parts.push(`${kind ? cap(kind) + ' movement. ' : ''}Primary load falls on the ${e.primaryMuscles.join(' and ')}, responsible for ${fn}.`);
  } else {
    parts.push(`${kind ? cap(kind) + ' movement. ' : ''}A general ${e.category} drill without a single primary mover.`);
  }
  const assists = assistOf(e);
  if (assists.length) {
    parts.push(`The ${assists.join(', ')} assist${assists.length === 1 ? 's' : ''} to stabilize and complete the pattern.`);
  }
  return parts.join(' ');
}

/* ============================================================
   Planner mode
   ============================================================ */
const PLAN_EQUIP = ['body only', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebells',
                    'bands', 'e-z curl bar', 'exercise ball', 'medicine ball'];
const INJURIES = ['knee', 'shoulder', 'lower back'];

let planMode = false;
let planPriority = new Set();
let planEquip = new Set();
let planInjury = new Set();
let planDays = 4, planMinutes = 60, planVariety = 0, weekIndex = 0;
let basePlan = null;   /* the block's week 1 */
let lastPlan = null;   /* week currently displayed */

const LOG_KEY = 'kinetic-atlas-log';
const loadLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch { return {}; } };
const saveLog = (l) => { try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch {} };
let trainingLog = loadLog();

function segNum(host, values, initial, onPick) {
  host.innerHTML = '';
  for (const v of values) {
    const b = document.createElement('button');
    b.className = 'segbtn' + (v === initial ? ' active' : '');
    b.textContent = v;
    b.addEventListener('click', () => {
      [...host.children].forEach(c => c.classList.remove('active'));
      b.classList.add('active');
      onPick(v);
    });
    host.appendChild(b);
  }
}

function pickerRow(host, names, set, onToggle) {
  for (const name of names) {
    const b = document.createElement('button');
    b.className = 'pick';
    b.dataset.v = name;
    b.textContent = cap(name);
    b.addEventListener('click', () => {
      set.has(name) ? set.delete(name) : set.add(name);
      b.classList.toggle('on');
      if (onToggle) onToggle(name);
    });
    host.appendChild(b);
  }
}

function initPlanner() {
  segNum($('pfDays'), [2, 3, 4, 5, 6], 4, v => { planDays = v; });
  segNum($('pfMinutes'), [30, 45, 60, 75], 60, v => { planMinutes = v; });

  const present = new Set(ALL.map(e => e.equipment && e.equipment !== 'None' ? e.equipment : 'body only'));
  pickerRow($('pfEquip'), PLAN_EQUIP.filter(e => present.has(e)), planEquip);
  pickerRow($('pfInjury'), INJURIES, planInjury);

  const mu = $('pfMuscles');
  for (const m of MUSCLES) {
    const b = document.createElement('button');
    b.className = 'pick';
    b.dataset.muscle = m;
    b.textContent = cap(m);
    b.addEventListener('click', () => togglePriority(m));
    mu.appendChild(b);
  }

  $('pfGo').addEventListener('click', () => generateWeek(0));
  $('pfShuffle').addEventListener('click', () => generateWeek(planVariety + 1));
  $('weekCopy').addEventListener('click', copyWeek);
}

function togglePriority(m) {
  planPriority.has(m) ? planPriority.delete(m) : planPriority.add(m);
  document.querySelectorAll('#pfMuscles .pick').forEach(b =>
    b.classList.toggle('on', planPriority.has(b.dataset.muscle)));
  setHighlight([...planPriority], []);
  stageLabel.textContent = planPriority.size
    ? `Priority: ${[...planPriority].join(', ')}` : 'Full body';
}

function generateWeek(variety = 0) {
  planVariety = variety;
  weekIndex = 0;
  basePlan = buildPlan(ALL, {
    days: planDays, minutes: planMinutes,
    level: $('pfLevel').value, goal: $('pfGoal').value,
    equipment: [...planEquip], priority: [...planPriority],
    difficulty: $('pfDifficulty').value,
    injuries: [...planInjury],
    includeMobility: $('pfMobility').checked,
    variety,
  });
  showWeek(0);
  $('pfShuffle').hidden = false;
}

function showWeek(i) {
  weekIndex = i;
  lastPlan = applyWeek(basePlan, i);
  retally(lastPlan);
  renderWeek(lastPlan);
  paintVolume(lastPlan);
}

function renderWeek(plan) {
  $('weekSplit').textContent = plan.split;
  const direct = plan.sessions.reduce((s, d) => s + d.items.reduce((n, i) => n + i.sets, 0), 0);
  const bal = balance(plan.volume);
  const totalMins = Math.round(plan.duration.reduce((a, b) => a + b, 0) / 60);
  $('weekNote').textContent =
    `${plan.sessions.length} sessions · ${direct} direct sets · ~${totalMins} min total · push ${bal.push} vs pull ${bal.pull} · posterior ${bal.posterior} vs anterior ${bal.anterior}`;

  /* four-week block */
  $('weekTabs').innerHTML = BLOCK.map((b, i) =>
    `<button class="segbtn${i === weekIndex ? ' active' : ''}" data-w="${i}">Wk ${b.week}${b.deload ? ' ·﻿ deload' : ''}</button>`).join('');
  $('weekTabs').querySelectorAll('.segbtn').forEach(b =>
    b.addEventListener('click', () => showWeek(+b.dataset.w)));
  $('weekSpec').textContent = plan.weekSpec ? plan.weekSpec.rirNote : '';

  const warn = plan.warnings.length
    ? `<div class="warnbox"><span class="callout-title">Where this week falls short</span>${
        plan.warnings.map(w => `<p>${w.text}</p>`).join('')}</div>` : '';

  const patterns = `<div class="patbox">
      <span class="overline">Movement patterns covered</span>
      <div class="patrow">${plan.patterns.map(p =>
        `<span class="pat${p.present ? ' on' : ''}">${p.label}</span>`).join('')}</div>
    </div>`;

  const days = plan.sessions.map((s, di) => `
    <div class="daycard">
      <div class="dayhead">
        <span class="dayname">${plan.schedule[di] || ''} · ${s.name}</span>
        <span class="daymeta">${s.items.length} exercises · ~${fmtMins(plan.duration[di])}</span>
        <button class="startbtn" data-day="${di}">Start</button>
      </div>
      ${s.items.map((it, ii) => {
        const prev = trainingLog[logKey(it)];
        return `
        <div class="planrow${it.priority ? ' prio' : ''}">
          <div class="pr-main">
            <button class="pr-name" data-ex="${it.exercise.id}">${it.exercise.name}</button>
            <span class="pr-sub">${it.muscle} · ${it.exercise.mechanic || 'compound'}${
              it.warmups ? ` · ${it.warmups} warm-up${it.warmups > 1 ? 's' : ''}` : ''}</span>
            <span class="pr-log">
              <input class="loadin" type="text" inputmode="decimal" placeholder="load"
                     data-k="${logKey(it)}" value="${prev ? prev.load : ''}">
              ${prev ? `<span class="prevload">last ${prev.load}</span>` : ''}
            </span>
          </div>
          <div class="pr-rx">
            <b>${it.sets}×${it.reps}</b>
            <span>${fmtRest(it.restSec)} · ${it.rir}</span>
          </div>
          <button class="swapbtn" data-d="${di}" data-i="${ii}" aria-label="Swap exercise">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>
          </button>
        </div>`; }).join('')}
      ${s.finisher ? `<div class="planrow finisher">
          <div class="pr-main"><span class="pr-name-static">${s.finisher.exercise.name}</span>
          <span class="pr-sub">mobility finisher</span></div>
          <div class="pr-rx"><b>${s.finisher.sets}×${s.finisher.reps}</b></div>
        </div>` : ''}
    </div>`).join('');

  const rows = MUSCLES.map(m => [m, plan.volume[m] || 0]).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(r => r[1]));
  const volTable = `
    <div class="volblock">
      <span class="overline">Weekly sets and frequency</span>
      ${rows.map(([m, v]) => `
        <div class="volrow${planPriority.has(m) ? ' prio' : ''}">
          <span class="vm">${m}</span>
          <span class="vbar"><i style="width:${(v / max) * 100}%"></i></span>
          <span class="vn">${round(v)}</span>
          <span class="vf">${plan.actualFreq[m] || 0}×</span>
        </div>`).join('')}
      <p class="volnote">Secondary involvement counts as half a set. Around 10–20 sets a week drives
        growth for a trained muscle; roughly 4–6 maintains. Two or more sessions per muscle beats one.</p>
    </div>`;

  $('weekBody').innerHTML = warn + patterns + days + volTable;

  $('weekBody').querySelectorAll('.pr-name').forEach(b =>
    b.addEventListener('click', () => {
      const ex = ALL.find(e => e.id === b.dataset.ex);
      if (ex) showPlanExercise(ex);
    }));
  $('weekBody').querySelectorAll('.swapbtn').forEach(b =>
    b.addEventListener('click', () => openSwap(b, +b.dataset.d, +b.dataset.i)));
  $('weekBody').querySelectorAll('.startbtn').forEach(b =>
    b.addEventListener('click', () => {
      const saved = restoreRun();
      startRun(+b.dataset.day, saved && saved.dayIndex === +b.dataset.day ? saved : null);
    }));
  $('weekBody').querySelectorAll('.loadin').forEach(inp =>
    inp.addEventListener('change', () => {
      const v = inp.value.trim();
      if (v) trainingLog[inp.dataset.k] = { load: v, at: new Date().toISOString().slice(0, 10) };
      else delete trainingLog[inp.dataset.k];
      saveLog(trainingLog);
    }));
}

const logKey = (it) => `${it.exercise.id}`;

function copyWeek(){
  if (!lastPlan) return;
  const lines = [`${lastPlan.split} — ${lastPlan.weekSpec ? lastPlan.weekSpec.label : 'Week 1'}`, ''];
  lastPlan.sessions.forEach((s, i) => {
    lines.push(`${lastPlan.schedule[i] || ''} — ${s.name} (~${fmtMins(lastPlan.duration[i])})`);
    for (const it of s.items) {
      lines.push(`  ${it.exercise.name} — ${it.sets}×${it.reps} @ ${it.rir}, rest ${fmtRest(it.restSec)}${it.warmups ? `, ${it.warmups} warm-up sets` : ''}`);
    }
    if (s.finisher) lines.push(`  ${s.finisher.exercise.name} — ${s.finisher.sets}×${s.finisher.reps}`);
    lines.push('');
  });
  lines.push('Sets, reps, rest and RIR are standard training guidance, not from the exercise dataset.');
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const b = $('weekCopy'); const t = b.textContent;
    b.textContent = 'Copied'; setTimeout(() => { b.textContent = t; }, 1400);
  });
}

/* Paint the week against each muscle's own goal rather than the biggest
   number in the week: "am I short here?" is the useful question. */
const C_UNDER = new THREE.Color('#8a3b32');
const C_OVER  = new THREE.Color('#efa733');

function paintVolume(plan) {
  coverageOn = false;
  const { volume, target } = plan;
  for (const [name, g] of Object.entries(muscleGroups)) {
    const goal = planPriority.has(name) ? target : 6;
    const ratio = (volume[name] || 0) / goal;
    let col, glow;
    if (ratio < 0.6) { col = C_UNDER; glow = 0.05 + 0.10 * ratio; }
    else if (ratio > 1.35) { col = C_OVER; glow = 0.18; }
    else { col = C.covHigh; glow = 0.20; }
    g.mat.color.copy(col);
    g.mat.emissive.copy(col);
    g.mat.emissiveIntensity = glow;
    g.state = 'coverage';
  }
  document.getElementById('legend').hidden = true;
  const cov = document.getElementById('legendCoverage');
  cov.hidden = false;
  cov.innerHTML = `
    <span class="lg">Volume vs target</span>
    <span class="lg"><i class="dot" style="background:#8a3b32"></i>Under</span>
    <span class="lg"><i class="dot" style="background:#3fd8c6"></i>On target</span>
    <span class="lg"><i class="dot" style="background:#efa733"></i>Over</span>`;
  stageLabel.textContent = 'Weekly volume';
}

function setPlanMode(on) {
  planMode = on;
  $('plannerPanel').hidden = !on;
  $('libraryPanel').hidden = on;
  $('weekPanel').hidden = !on;
  $('detailPanel').hidden = on;
  $('planBack').hidden = true;
  $('modeBtn').textContent = on ? 'Browse library' : 'Plan a week';
  $('modeBtn').classList.toggle('on', on);
  if (!on) {
    document.getElementById('legend').hidden = false;
    document.getElementById('legendCoverage').hidden = true;
    setHighlight([], []);
    stageLabel.textContent = 'Full body';
  } else {
    setHighlight([...planPriority], []);
  }
}
$('modeBtn').addEventListener('click', () => setPlanMode(!planMode));

/* ---------- swapping ---------- */
function openSwap(btn, dayIndex, itemIndex) {
  const row = btn.closest('.planrow');
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains('swapbox')) { existing.remove(); return; }
  document.querySelectorAll('.swapbox').forEach(el => el.remove());

  const item = lastPlan.sessions[dayIndex].items[itemIndex];
  const box = document.createElement('div');
  box.className = 'swapbox';
  row.insertAdjacentElement('afterend', box);

  let relative = 'all';
  const draw = () => {
    const alts = alternativesFor(lastPlan, item.muscle, item.exercise, { relative });
    const tabs = ['all', 'easier', 'same', 'harder'].map(r =>
      `<button class="swaptab${r === relative ? ' on' : ''}" data-r="${r}">${
        r === 'all' ? 'All' : r === 'same' ? 'Same level' : cap(r)}</button>`).join('');
    box.innerHTML = `
      <span class="swaphead">Swap ${item.muscle} exercise · currently ${item.exercise.level}</span>
      <div class="swaptabs">${tabs}</div>` + (alts.length
        ? alts.map((e, i) => {
            const rel = relativeTo(e, item.exercise);
            return `<button class="swapopt" data-i="${i}">
              <span class="so-name">${e.name}<span class="so-rel ${rel}">${rel === 'same' ? e.level : rel}</span></span>
              <span class="so-meta">${e.equipment && e.equipment !== 'None' ? e.equipment : 'body only'} · ${e.mechanic || 'n/a'} · ${e.level}</span>
            </button>`;
          }).join('')
        : `<p class="swapnone">Nothing ${relative === 'all' ? '' : relative + ' '}available for ${item.muscle} with the equipment and difficulty selected.</p>`);

    box.querySelectorAll('.swaptab').forEach(t =>
      t.addEventListener('click', () => { relative = t.dataset.r; draw(); }));
    box.querySelectorAll('.swapopt').forEach(b =>
      b.addEventListener('click', () => {
        /* mutate the block's base week so the change survives week switching */
        swapExercise(basePlan, dayIndex, itemIndex, alts[+b.dataset.i]);
        showWeek(weekIndex);
      }));
  };
  draw();
}

/* Inspecting an exercise from the plan must not strand you in browse mode. */
function showPlanExercise(ex) {
  $('weekPanel').hidden = true;
  $('detailPanel').hidden = false;
  $('planBack').hidden = false;
  selectExercise(ex);
  $('detailPanel').scrollTop = 0;
}

function backToWeek() {
  $('planBack').hidden = true;
  $('detailPanel').hidden = true;
  hideDetail();
  $('weekPanel').hidden = false;
  if (lastPlan) { renderWeek(lastPlan); paintVolume(lastPlan); }
}

$('planBack').addEventListener('click', backToWeek);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && planMode && !$('planBack').hidden) backToWeek();
});

/* ============================================================
   Workout runner — the interface used while training.
   Big targets, one exercise at a time, a rest clock that starts
   itself, and progress that survives a mid-session reload.
   ============================================================ */
const RUN_KEY = 'kinetic-atlas-session';
let run = null;        /* { dayIndex, index, done: {exId: [bool,...]}, date } */
let restTimer = null, restLeft = 0, restTotal = 0;

const todayStr = () => new Date().toISOString().slice(0, 10);
const saveRun = () => { try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch {} };
function restoreRun() {
  try {
    const r = JSON.parse(localStorage.getItem(RUN_KEY));
    if (r && r.date === todayStr()) return r;
  } catch {}
  return null;
}

function startRun(dayIndex, resume) {
  const session = lastPlan.sessions[dayIndex];
  if (!session || !session.items.length) return;
  run = resume || { dayIndex, index: 0, done: {}, date: todayStr() };
  run.dayIndex = dayIndex;
  saveRun();
  $('runOverlay').hidden = false;
  document.body.classList.add('running');
  drawRun();
}

function endRun() {
  stopRest();
  $('runOverlay').hidden = true;
  document.body.classList.remove('running');
  if (lastPlan) renderWeek(lastPlan);
}

const runItems = () => lastPlan.sessions[run.dayIndex].items;
const runItem = () => runItems()[run.index];
const doneArr = (it) => {
  const k = it.exercise.id;
  if (!run.done[k] || run.done[k].length !== it.sets) {
    run.done[k] = Array.from({ length: it.sets }, (_, i) => (run.done[k] || [])[i] || false);
  }
  return run.done[k];
};

function drawRun() {
  const items = runItems();
  const it = runItem();
  const ex = it.exercise;

  $('runDay').textContent = `${lastPlan.schedule[run.dayIndex] || ''} · ${lastPlan.sessions[run.dayIndex].name}`;
  $('runCount').textContent = `Exercise ${run.index + 1} of ${items.length}`;

  const totalSets = items.reduce((n, i) => n + i.sets, 0);
  const doneSets = items.reduce((n, i) => n + doneArr(i).filter(Boolean).length, 0);
  $('runProgressBar').style.transform = `scaleX(${totalSets ? doneSets / totalSets : 0})`;

  $('runName').textContent = ex.name;
  $('runMeta').innerHTML = [
    `<span class="rm accent">${it.sets} × ${it.reps}</span>`,
    `<span class="rm">${it.rir}</span>`,
    `<span class="rm">rest ${fmtRest(it.restSec)}</span>`,
    `<span class="rm">${it.muscle}</span>`,
    it.warmups ? `<span class="rm">${it.warmups} warm-up set${it.warmups > 1 ? 's' : ''} first</span>` : '',
  ].filter(Boolean).join('');

  const a = $('runImgA'), b = $('runImgB');
  a.src = IMG_BASE + ex.images[0];
  b.src = IMG_BASE + (ex.images[1] || ex.images[0]);
  b.style.opacity = 0;
  $('runFrameTag').textContent = 'Start';
  clearInterval(drawRun._fade);
  let atEnd = false;
  drawRun._fade = setInterval(() => {
    atEnd = !atEnd;
    b.style.opacity = atEnd ? 1 : 0;
    $('runFrameTag').textContent = atEnd ? 'End' : 'Start';
  }, 1600);

  /* one row per set, tapping it logs the set and starts the rest clock */
  const done = doneArr(it);
  const prev = trainingLog[it.exercise.id];
  $('runSets').innerHTML = done.map((d, i) => `
    <button class="setrow${d ? ' done' : ''}" data-s="${i}">
      <span class="setno">Set ${i + 1}</span>
      <span class="setrx">${it.reps} reps · ${it.rir}</span>
      <span class="settick">${d ? '✓' : ''}</span>
    </button>`).join('') + `
    <label class="setload">Working load
      <input id="runLoad" type="text" inputmode="decimal" placeholder="${prev ? prev.load : 'e.g. 60kg'}" value="${prev ? prev.load : ''}">
    </label>`;

  $('runSets').querySelectorAll('.setrow').forEach(btn =>
    btn.addEventListener('click', () => toggleSet(+btn.dataset.s)));
  $('runLoad').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (v) trainingLog[it.exercise.id] = { load: v, at: todayStr() };
    else delete trainingLog[it.exercise.id];
    saveLog(trainingLog);
  });

  const steps = (ex.instructions || []).filter(s => s && s.trim());
  $('runStepList').innerHTML = steps.length
    ? steps.map(s => `<li>${s}</li>`).join('')
    : '<li>No written steps. Follow the start and end frames above.</li>';

  $('runSideList').innerHTML = items.map((x, i) => {
    const d = doneArr(x).filter(Boolean).length;
    return `<button class="sideitem${i === run.index ? ' on' : ''}${d === x.sets ? ' complete' : ''}" data-i="${i}">
      <span class="si-name">${x.exercise.name}</span>
      <span class="si-meta">${d}/${x.sets} sets · ${x.muscle}</span>
    </button>`;
  }).join('');
  $('runSideList').querySelectorAll('.sideitem').forEach(b =>
    b.addEventListener('click', () => { run.index = +b.dataset.i; saveRun(); drawRun(); }));

  $('runPrev').disabled = run.index === 0;
  $('runNext').textContent = run.index === items.length - 1 ? 'Finish session' : 'Next exercise';
  setHighlight([it.muscle], it.exercise.secondaryMuscles || []);
}

function toggleSet(i) {
  const it = runItem();
  const done = doneArr(it);
  done[i] = !done[i];
  saveRun();
  if (done[i]) startRest(it.restSec);
  drawRun();
}

/* ---------- rest clock ---------- */
function startRest(secs) {
  stopRest();
  restTotal = secs; restLeft = secs;
  $('runRest').hidden = false;
  tickRest();
  restTimer = setInterval(tickRest, 1000);
}
function tickRest() {
  $('restClock').textContent = `${Math.floor(restLeft / 60)}:${String(restLeft % 60).padStart(2, '0')}`;
  $('restBar').style.transform = `scaleX(${Math.max(0, restLeft / restTotal)})`;
  if (restLeft <= 0) {
    stopRest();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    return;
  }
  restLeft--;
}
function stopRest() {
  clearInterval(restTimer); restTimer = null;
  $('runRest').hidden = true;
}

$('runClose').addEventListener('click', endRun);
$('runPrev').addEventListener('click', () => { if (run.index > 0) { run.index--; saveRun(); drawRun(); } });
$('runNext').addEventListener('click', () => {
  const items = runItems();
  if (run.index < items.length - 1) { run.index++; saveRun(); drawRun(); }
  else endRun();
});
$('runListBtn').addEventListener('click', () => {
  const s = $('runSide');
  s.hidden = !s.hidden;
  $('runListBtn').classList.toggle('on', !s.hidden);
});
$('restSkip').addEventListener('click', stopRest);
$('restPlus').addEventListener('click', () => { restLeft += 30; restTotal += 30; tickRest(); });
document.addEventListener('keydown', (e) => {
  if ($('runOverlay').hidden) return;
  if (e.key === 'Escape') endRun();
  if (e.key === 'ArrowRight') $('runNext').click();
  if (e.key === 'ArrowLeft') $('runPrev').click();
});
