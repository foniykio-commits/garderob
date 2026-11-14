import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const SKINS = ["#f3d3bf", "#e7b892", "#c68642", "#8d5524", "#5c3317", "#3b2214"];
const REF_BMI = 22.86;

const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;
const SIDES = mobile ? 24 : 32;

function bmiOf(heightCm, weightKg) {
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

function girthRadius(heightCm, bmi, perCm, exponent) {
  const ratio = Math.max(0.62, bmi / REF_BMI);
  return (perCm * heightCm * ratio ** exponent) / (2 * Math.PI) / 100;
}

function v(x, y, z) {
  return { x, y, z };
}

function framesAlong(points, radii, depth, inflate) {
  const frames = [];
  let prevNx = 1;
  let prevNy = 0;
  let prevNz = 0;
  let hasPrev = false;
  for (let i = 0; i < points.length; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[Math.min(points.length - 1, i + 1)];
    let tx = p1.x - p0.x;
    let ty = p1.y - p0.y;
    let tz = p1.z - p0.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    tx /= len;
    ty /= len;
    tz /= len;
    let nx = ty;
    let ny = -tx;
    let nz = 0;
    let nlen = Math.hypot(nx, ny, nz);
    if (nlen < 1e-5) {
      nx = -tz;
      ny = 0;
      nz = tx;
      nlen = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= nlen;
    ny /= nlen;
    nz /= nlen;
    if (hasPrev && nx * prevNx + ny * prevNy + nz * prevNz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    prevNx = nx;
    prevNy = ny;
    prevNz = nz;
    hasPrev = true;
    const radius = radii[i] * inflate;
    frames.push({
      cx: points[i].x,
      cy: points[i].y,
      cz: points[i].z,
      nx,
      ny,
      nz,
      bx: ty * nz - tz * ny,
      by: tz * nx - tx * nz,
      bz: tx * ny - ty * nx,
      rx: radius,
      rz: radius * depth,
    });
  }
  return frames;
}

function ribbon(frames, sides) {
  const rings = frames.length;
  const vertCount = rings * sides + 2;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  let p = 0;
  let u = 0;
  for (let s = 0; s < rings; s += 1) {
    const f = frames[s];
    for (let i = 0; i < sides; i += 1) {
      const angle = (i / sides) * Math.PI * 2;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      positions[p++] = f.cx + f.nx * c * f.rx + f.bx * sn * f.rz;
      positions[p++] = f.cy + f.ny * c * f.rx + f.by * sn * f.rz;
      positions[p++] = f.cz + f.nz * c * f.rx + f.bz * sn * f.rz;
      uvs[u++] = i / sides;
      uvs[u++] = rings === 1 ? 0 : s / (rings - 1);
    }
  }
  const first = frames[0];
  const last = frames[rings - 1];
  positions[p++] = first.cx;
  positions[p++] = first.cy;
  positions[p++] = first.cz;
  uvs[u++] = 0.5;
  uvs[u++] = 0;
  positions[p++] = last.cx;
  positions[p++] = last.cy;
  positions[p++] = last.cz;
  uvs[u++] = 0.5;
  uvs[u++] = 1;
  const startCap = rings * sides;
  const endCap = startCap + 1;
  const indices = new Uint16Array((rings - 1) * sides * 6 + sides * 6);
  let k = 0;
  for (let s = 0; s < rings - 1; s += 1) {
    for (let i = 0; i < sides; i += 1) {
      const n = (i + 1) % sides;
      const a = s * sides + i;
      const b = s * sides + n;
      const c = (s + 1) * sides + i;
      const d = (s + 1) * sides + n;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  for (let i = 0; i < sides; i += 1) {
    const n = (i + 1) % sides;
    indices[k++] = startCap;
    indices[k++] = i;
    indices[k++] = n;
    const end = (rings - 1) * sides;
    indices[k++] = endCap;
    indices[k++] = end + n;
    indices[k++] = end + i;
  }
  return { positions, uvs, indices };
}

function merge(parts) {
  let positionCount = 0;
  let uvCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    positionCount += part.positions.length;
    uvCount += part.uvs.length;
    indexCount += part.indices.length;
  }
  const positions = new Float32Array(positionCount);
  const uvs = new Float32Array(uvCount);
  const indices = new Uint16Array(indexCount);
  let positionOffset = 0;
  let uvOffset = 0;
  let indexOffset = 0;
  let base = 0;
  for (const part of parts) {
    positions.set(part.positions, positionOffset);
    uvs.set(part.uvs, uvOffset);
    for (let i = 0; i < part.indices.length; i += 1) indices[indexOffset + i] = part.indices[i] + base;
    positionOffset += part.positions.length;
    uvOffset += part.uvs.length;
    indexOffset += part.indices.length;
    base += part.positions.length / 3;
  }
  return { positions, uvs, indices };
}

function measure(heightCm, bmi) {
  const H = heightCm / 100;
  const g = (perCm, exponent) => girthRadius(heightCm, bmi, perCm, exponent);
  const fat = Math.max(0, (bmi - 21) / 14);
  return {
    H,
    fat,
    neck: g(0.214, 0.35),
    chest: g(0.549, 0.5),
    waist: g(0.469, 0.9),
    hips: g(0.549, 0.55),
    thigh: g(0.309, 0.7),
    calf: g(0.206, 0.4),
    bicep: g(0.183, 0.65),
    wrist: g(0.094, 0.25),
    ankle: g(0.126, 0.3),
    shoulder: 0.118 * H * Math.max(0.62, bmi / REF_BMI) ** 0.15,
    y: {
      ankle: 0.045 * H,
      calf: 0.18 * H,
      knee: 0.285 * H,
      thigh: 0.39 * H,
      crotch: 0.47 * H,
      hip: 0.53 * H,
      waist: 0.6 * H,
      ribs: 0.68 * H,
      chest: 0.735 * H,
      shoulder: 0.818 * H,
      neck: 0.875 * H,
      neckTop: 0.905 * H,
    },
  };
}

function limb(points, radii, depth, inflate, sides) {
  return ribbon(framesAlong(points, radii, depth, inflate), sides);
}

function mirrorX(points) {
  return points.map((point) => v(-point.x, point.y, point.z));
}

function torsoPoints(m) {
  const { y, H, fat } = m;
  return [
    v(0, y.crotch, -0.012 * H),
    v(0, y.hip, -0.018 * H),
    v(0, (y.hip + y.waist) / 2, -0.006 * H),
    v(0, y.waist, 0.02 * H * fat),
    v(0, (y.waist + y.ribs) / 2, 0.012 * H * fat),
    v(0, y.ribs, 0.008 * H),
    v(0, y.chest, 0.02 * H),
    v(0, (y.chest + y.shoulder) / 2, 0.008 * H),
    v(0, y.shoulder, 0),
    v(0, y.neck, 0),
    v(0, y.neckTop, 0),
  ];
}

function torsoRadii(m) {
  return [
    m.hips * 0.96,
    m.hips * 1.02,
    m.hips * 0.9,
    m.waist,
    (m.waist + m.chest) * 0.48,
    m.chest * 0.92,
    m.chest * 1.04,
    m.chest * 0.96,
    m.chest * 0.72,
    m.neck * 1.35,
    m.neck,
  ];
}

function legPoints(m) {
  const x = m.hips * 0.42;
  const { y, H } = m;
  return [
    v(x * 0.72, y.hip + 0.045 * H, -0.008 * H),
    v(x, y.crotch + 0.01 * H, 0),
    v(x * 0.98, y.thigh, 0.006 * H),
    v(x * 0.96, y.knee + 0.025 * H, 0.012 * H),
    v(x * 0.95, y.knee, 0.006 * H),
    v(x * 0.94, (y.knee + y.calf) / 2, -0.008 * H),
    v(x * 0.93, y.calf, -0.012 * H),
    v(x * 0.92, y.ankle + 0.03 * H, -0.004 * H),
    v(x * 0.92, y.ankle, 0),
  ];
}

function legRadii(m) {
  return [m.thigh * 1.05, m.thigh, m.thigh * 0.96, m.thigh * 0.78, m.thigh * 0.7, m.calf * 0.92, m.calf, m.ankle * 1.15, m.ankle];
}

function armPoints(m) {
  const x = m.shoulder * 0.98;
  const { y, H } = m;
  const elbowY = y.shoulder - 0.186 * H;
  const wristY = elbowY - 0.146 * H;
  return [
    v(x * 0.42, y.shoulder - 0.02 * H, 0.01 * H),
    v(x * 0.96, y.shoulder - 0.07 * H, 0.012 * H),
    v(x * 1.04, (y.shoulder + elbowY) / 2, 0.018 * H),
    v(x * 1.06, elbowY, 0.02 * H),
    v(x, (elbowY + wristY) / 2, 0.028 * H),
    v(x * 0.96, wristY, 0.034 * H),
  ];
}

function armRadii(m) {
  return [m.bicep * 0.85, m.bicep, m.bicep * 0.92, m.bicep * 0.78, m.wrist * 1.45, m.wrist];
}

function handPoints(m) {
  const arm = armPoints(m);
  const wrist = arm[arm.length - 1];
  const { H } = m;
  return [
    wrist,
    v(wrist.x, wrist.y - 0.025 * H, wrist.z + 0.012 * H),
    v(wrist.x * 0.98, wrist.y - 0.055 * H, wrist.z + 0.02 * H),
  ];
}

function footPoints(m) {
  const leg = legPoints(m);
  const ankle = leg[leg.length - 1];
  const { H } = m;
  return [
    v(ankle.x, m.y.ankle, -0.012 * H),
    v(ankle.x, 0.038 * H, 0.01 * H),
    v(ankle.x, 0.03 * H, 0.055 * H),
    v(ankle.x, 0.022 * H, 0.105 * H),
    v(ankle.x, 0.016 * H, 0.15 * H),
  ];
}

function skinParts(heightCm, bmi, sides) {
  const m = measure(heightCm, bmi);
  const legs = legPoints(m);
  const arms = armPoints(m);
  return [
    limb(torsoPoints(m), torsoRadii(m), 0.74, 1, sides),
    limb(legs, legRadii(m), 0.9, 1, sides),
    limb(mirrorX(legs), legRadii(m), 0.9, 1, sides),
    limb(arms, armRadii(m), 0.9, 1, sides),
    limb(mirrorX(arms), armRadii(m), 0.9, 1, sides),
    limb(handPoints(m), [m.wrist * 1.1, m.wrist * 1.35, m.wrist * 0.85], 0.55, 1, sides),
    limb(mirrorX(handPoints(m)), [m.wrist * 1.1, m.wrist * 1.35, m.wrist * 0.85], 0.55, 1, sides),
    limb(footPoints(m), [m.ankle, m.ankle * 1.25, m.ankle * 1.45, m.ankle * 1.15, m.ankle * 0.62], 0.52, 1, sides),
    limb(mirrorX(footPoints(m)), [m.ankle, m.ankle * 1.25, m.ankle * 1.45, m.ankle * 1.15, m.ankle * 0.62], 0.52, 1, sides),
  ];
}

function shirtParts(heightCm, bmi, sides) {
  const m = measure(heightCm, bmi);
  const torso = torsoPoints(m).slice(2);
  const radii = torsoRadii(m).slice(2);
  const arms = armPoints(m).slice(0, 5);
  const armR = armRadii(m).slice(0, 5);
  return [
    limb(torso, radii, 0.74, 1.055, sides),
    limb(arms, armR, 0.9, 1.12, sides),
    limb(mirrorX(arms), armR, 0.9, 1.12, sides),
  ];
}

function pantsParts(heightCm, bmi, sides) {
  const m = measure(heightCm, bmi);
  const { y, H } = m;
  const pelvis = [
    v(0, y.waist + 0.015 * H, 0.01 * H * m.fat),
    v(0, (y.waist + y.hip) / 2, 0),
    v(0, y.hip, -0.01 * H),
    v(0, y.crotch + 0.01 * H, 0),
  ];
  const pelvisR = [m.waist * 1.04, (m.waist + m.hips) * 0.52, m.hips * 1.04, m.hips * 0.98];
  const legs = legPoints(m).slice(1);
  const radii = legRadii(m).slice(1);
  return [
    limb(pelvis, pelvisR, 0.76, 1.04, sides),
    limb(legs, radii, 0.9, 1.06, sides),
    limb(mirrorX(legs), radii, 0.9, 1.06, sides),
  ];
}

function shoeParts(heightCm, bmi, sides) {
  const m = measure(heightCm, bmi);
  const radii = [m.ankle * 1.15, m.ankle * 1.45, m.ankle * 1.7, m.ankle * 1.35, m.ankle * 0.78];
  return [
    limb(footPoints(m), radii, 0.62, 1.18, sides),
    limb(mirrorX(footPoints(m)), radii, 0.62, 1.18, sides),
  ];
}

function geometryFor(partFn, heightCm, bmi, sides) {
  const shape = merge(partFn(heightCm, bmi, sides));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(shape.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(shape.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function skinMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0,
    sheen: 0.55,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color("#ffc7b4"),
    clearcoat: 0.14,
    clearcoatRoughness: 0.58,
    side: THREE.FrontSide,
  });
}

function clothMaterial(color, roughness) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.02,
    sheen: 0.32,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color("#f3efe8"),
    clearcoat: 0.04,
    clearcoatRoughness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

function morphMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function hairMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function mount(container, initial) {
  const width = container.clientWidth || 320;
  const height = container.clientHeight || 480;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#14110e");
  scene.fog = new THREE.Fog("#14110e", 6.5, 12);
  const camera = new THREE.PerspectiveCamera(28, width / Math.max(height, 1), 0.08, 30);
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobile,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight("#fff4e8", "#3a2c24", 0.72));
  const key = new THREE.DirectionalLight("#fff8f0", 2.15);
  key.position.set(1.4, 3.4, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 8;
  key.shadow.camera.left = -1.4;
  key.shadow.camera.right = 1.4;
  key.shadow.camera.top = 1.4;
  key.shadow.camera.bottom = -1.4;
  key.shadow.bias = -0.00045;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#d7e2ff", 0.38);
  fill.position.set(-2.2, 1.5, 1.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight("#f0d2a8", 0.7);
  rim.position.set(-1.2, 2.4, -2.4);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, mobile ? 32 : 48),
    new THREE.MeshStandardMaterial({ color: "#1b1713", roughness: 0.94, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const tone = SKINS[initial.skin] || SKINS[2];
  const skin = skinMaterial(tone);
  const headMat = skin.clone();
  const shirtMat = clothMaterial("#f4efe6", 0.78);
  const pantsMat = clothMaterial("#f4efe6", 0.8);
  const shoeMat = clothMaterial("#2a2622", 0.38);
  const hairMat = new THREE.MeshPhysicalMaterial({ color: "#1a120e", roughness: 0.48, metalness: 0.02, sheen: 0.45, sheenRoughness: 0.4, sheenColor: "#4a3428" });

  const figure = new THREE.Group();
  const body = morphMesh(new THREE.BufferGeometry(), skin);
  const shirt = morphMesh(new THREE.BufferGeometry(), shirtMat);
  const pants = morphMesh(new THREE.BufferGeometry(), pantsMat);
  const shoes = morphMesh(new THREE.BufferGeometry(), shoeMat);
  shirt.userData.mats = [shirtMat];
  pants.userData.mats = [pantsMat];
  shoes.userData.mats = [shoeMat];
  shirt.visible = false;
  pants.visible = false;
  shoes.visible = false;

  const headAnchor = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, mobile ? 28 : 36, mobile ? 20 : 28), headMat);
  head.castShadow = true;
  head.receiveShadow = true;
  head.rotation.y = Math.PI;
  const earGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const earL = new THREE.Mesh(earGeo, headMat);
  const earR = new THREE.Mesh(earGeo, headMat);
  earL.position.set(-0.92, -0.05, 0.05);
  earR.position.set(0.92, -0.05, 0.05);
  earL.scale.set(0.55, 0.85, 0.4);
  earR.scale.set(0.55, 0.85, 0.4);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), headMat);
  nose.position.set(0, -0.08, 0.9);
  nose.scale.set(0.7, 0.85, 0.7);
  head.add(earL, earR, nose);

  const hairStyles = { short: new THREE.Group(), medium: new THREE.Group(), long: new THREE.Group(), bun: new THREE.Group() };
  const cap = new THREE.SphereGeometry(0.78, 18, 12);
  hairStyles.short.add(hairMesh(cap, hairMat));
  hairStyles.short.children[0].position.y = 0.28;
  hairStyles.short.children[0].scale.set(1.02, 0.72, 1.02);
  const mediumCap = hairMesh(cap, hairMat);
  mediumCap.position.y = 0.26;
  mediumCap.scale.set(1.04, 0.74, 1.05);
  const sideGeo = new THREE.SphereGeometry(0.34, 12, 10);
  const sideL = hairMesh(sideGeo, hairMat);
  const sideR = hairMesh(sideGeo, hairMat);
  sideL.position.set(-0.62, -0.15, 0.05);
  sideR.position.set(0.62, -0.15, 0.05);
  hairStyles.medium.add(mediumCap, sideL, sideR);
  const longCap = hairMesh(cap, hairMat);
  longCap.position.y = 0.26;
  longCap.scale.set(1.04, 0.72, 1.06);
  const lock = ribbon(
    framesAlong(
      [v(-0.28, 0.15, -0.45), v(-0.34, -0.35, -0.55), v(-0.22, -0.95, -0.42)],
      [0.22, 0.16, 0.07],
      0.7,
      1
    ),
    10
  );
  const lockGeo = new THREE.BufferGeometry();
  lockGeo.setAttribute("position", new THREE.BufferAttribute(lock.positions, 3));
  lockGeo.setAttribute("uv", new THREE.BufferAttribute(lock.uvs, 2));
  lockGeo.setIndex(new THREE.BufferAttribute(lock.indices, 1));
  lockGeo.computeVertexNormals();
  const lockL = hairMesh(lockGeo, hairMat);
  const lockR = hairMesh(lockGeo.clone(), hairMat);
  lockR.scale.x = -1;
  hairStyles.long.add(longCap, lockL, lockR);
  const bunCap = hairMesh(cap, hairMat);
  bunCap.position.y = 0.22;
  bunCap.scale.set(1.02, 0.7, 1.02);
  const bun = hairMesh(new THREE.SphereGeometry(0.34, 14, 12), hairMat);
  bun.position.set(0, 0.72, -0.28);
  hairStyles.bun.add(bunCap, bun);
  for (const group of Object.values(hairStyles)) {
    group.visible = false;
    head.add(group);
  }
  headAnchor.add(head);
  figure.add(body, shirt, pants, shoes, headAnchor);
  scene.add(figure);

  const loader = new THREE.TextureLoader();
  let yaw = 0.35;
  let pitch = 0.08;
  let dist = 3.35;
  let lookY = 0.92;
  const pointers = new Map();
  let pinch = 0;
  let frame = 0;
  let stopped = false;
  let builtKey = "";
  let shownHair = "";
  const worn = { top: null, bottom: null, shoe: null };

  function placeCamera() {
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, lookY + Math.sin(pitch) * dist * 0.42, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(0, lookY, 0);
  }

  function swapGeometry(mesh, partFn, heightCm, bmi) {
    const next = geometryFor(partFn, heightCm, bmi, SIDES);
    mesh.geometry.dispose();
    mesh.geometry = next;
  }

  function placeHead(heightCm, bmi) {
    const H = heightCm / 100;
    const radius = 0.062 * H * Math.max(0.62, bmi / REF_BMI) ** 0.08;
    headAnchor.position.set(0, 0.9 * H + radius * 0.58, 0.012 * H);
    headAnchor.scale.set(radius * 0.94, radius * 1.08, radius * 0.9);
    lookY = 0.48 * H;
  }

  function applyShape(next) {
    const heightCm = Math.min(220, Math.max(140, Number(next.height) || 170));
    const weightKg = Math.min(180, Math.max(35, Number(next.weight) || 45 + ((Number(next.body) || 40) / 100) * 90));
    const bmi = bmiOf(heightCm, weightKg);
    const key = `${heightCm}:${weightKg.toFixed(1)}`;
    if (builtKey !== key) {
      const previousHeight = Number(builtKey.split(":")[0]);
      builtKey = key;
      swapGeometry(body, skinParts, heightCm, bmi);
      swapGeometry(shirt, shirtParts, heightCm, bmi);
      swapGeometry(pants, pantsParts, heightCm, bmi);
      swapGeometry(shoes, shoeParts, heightCm, bmi);
      if (previousHeight !== heightCm) dist = 4.15 * (heightCm / 170);
    }
    placeHead(heightCm, bmi);
    const color = SKINS[Number(next.skin)] || SKINS[2];
    skin.color.set(color);
    if (!headMat.map) headMat.color.copy(skin.color);
  }

  let faceUrl = "";
  function applyFace(url) {
    const nextUrl = url || "";
    if (nextUrl === faceUrl) return;
    faceUrl = nextUrl;
    if (!faceUrl) {
      if (headMat.map) headMat.map.dispose();
      headMat.map = null;
      headMat.color.copy(skin.color);
      headMat.needsUpdate = true;
      return;
    }
    loader.load(faceUrl, (texture) => {
      if (stopped || faceUrl !== nextUrl) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      if (headMat.map) headMat.map.dispose();
      headMat.map = texture;
      headMat.color.set("#ffffff");
      headMat.needsUpdate = true;
    });
  }

  function applyHair(style, color) {
    const name = hairStyles[style] ? style : "short";
    if (name !== shownHair) {
      shownHair = name;
      for (const [key, group] of Object.entries(hairStyles)) group.visible = key === name;
    }
    hairMat.color.set(color || "#1a120e");
  }

  function wear(group, url) {
    const generation = (group.userData.gen || 0) + 1;
    group.userData.gen = generation;
    if (!url) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.userData.pulse = 1;
    loader.load(url, (texture) => {
      if (stopped || generation !== group.userData.gen) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      for (const material of group.userData.mats) {
        if (material.map) material.map.dispose();
        material.map = texture;
        material.color.set("#ffffff");
        material.needsUpdate = true;
      }
    });
  }

  function applyClothes(next) {
    const topUrl = next.topUrl || "";
    const bottomUrl = next.bottomUrl || (next.dress ? topUrl : "");
    const shoeUrl = next.shoeUrl || "";
    if (topUrl !== worn.top) {
      worn.top = topUrl;
      wear(shirt, topUrl);
    }
    if (bottomUrl !== worn.bottom) {
      worn.bottom = bottomUrl;
      wear(pants, bottomUrl);
    }
    if (shoeUrl !== worn.shoe) {
      worn.shoe = shoeUrl;
      wear(shoes, shoeUrl);
    }
  }

  function animate() {
    if (stopped) return;
    for (const group of [shirt, pants, shoes]) {
      const pulse = group.userData.pulse || 0;
      if (pulse > 0) {
        group.userData.pulse = Math.max(0, pulse - 0.035);
        const scale = 1 + group.userData.pulse * 0.04;
        group.scale.set(scale, scale, scale);
        for (const material of group.userData.mats) material.opacity = 1;
      }
    }
    placeCamera();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }

  function onPointerDown(event) {
    renderer.domElement.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  function onPointerMove(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      yaw -= (event.clientX - previous.x) * 0.01;
      pitch = Math.max(-0.2, Math.min(0.85, pitch + (event.clientY - previous.y) * 0.006));
      return;
    }
    const points = [...pointers.values()];
    const gap = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (pinch) dist = Math.max(1.7, Math.min(6.2, dist * (pinch / gap)));
    pinch = gap;
  }
  function onPointerEnd(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
  }
  function onWheel(event) {
    event.preventDefault();
    dist = Math.max(1.7, Math.min(6.2, dist + event.deltaY * 0.002));
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerEnd);
  renderer.domElement.addEventListener("pointercancel", onPointerEnd);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  const observer = new ResizeObserver(() => {
    const nextWidth = container.clientWidth || 320;
    const nextHeight = container.clientHeight || 480;
    camera.aspect = nextWidth / Math.max(nextHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
  });
  observer.observe(container);

  applyShape(initial);
  applyFace(initial.faceUrl || "");
  applyHair(initial.hair, initial.hairColor);
  applyClothes(initial);
  animate();

  return {
    update(next) {
      applyShape(next);
      applyFace(next.faceUrl || "");
      applyHair(next.hair, next.hairColor);
      applyClothes(next);
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerEnd);
      renderer.domElement.removeEventListener("pointercancel", onPointerEnd);
      renderer.domElement.removeEventListener("wheel", onWheel);
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        const materials = object.material ? [].concat(object.material) : [];
        for (const material of materials) {
          if (material.map) material.map.dispose();
          material.dispose?.();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
