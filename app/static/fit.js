import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SKINS = ["#f3d3bf", "#e7b892", "#c68642", "#8d5524", "#5c3317", "#3b2214"];
const MODEL_URL = "/assets/models/avatar.glb";
const POSE_CLIP = { rest: "Idle", wave: "Victory", walk: "Walk", sit: "SitDown" };
const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;

function blankTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function installBodyShader(material, blank, state) {
  material.customProgramCacheKey = () => "anatomical-body-v6";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFat = { value: state.fat };
    shader.uniforms.uSpan = { value: state.span };
    shader.uniforms.uFoot = { value: state.foot };
    shader.uniforms.uShoulder = { value: state.shoulder };
    shader.uniforms.uHips = { value: state.hips };
    shader.uniforms.uHasFace = { value: 0 };
    shader.uniforms.uFaceMap = { value: blank };
    shader.vertexShader = `varying float vY01;\nvarying float vFront;\nvarying vec3 vBind;\nuniform float uFat;\nuniform float uSpan;\nuniform float uFoot;\nuniform float uShoulder;\nuniform float uHips;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <skinning_vertex>",
      `float yBind = clamp((transformed.y - uFoot) / uSpan, 0.0, 1.0);
      float axialBind = length(transformed.xz);
      float coreBind = 1.0 - smoothstep(0.13, 0.26, axialBind);
      float shoulderBand = smoothstep(0.66, 0.74, yBind) * (1.0 - smoothstep(0.80, 0.86, yBind));
      float hipBand = smoothstep(0.40, 0.48, yBind) * (1.0 - smoothstep(0.56, 0.64, yBind));
      float widen = ((uShoulder - 1.0) * shoulderBand + (uHips - 1.0) * hipBand) * coreBind;
      transformed.x *= 1.0 + widen;
      transformed.z *= 1.0 + widen * 0.4;
      #include <skinning_vertex>
      float y01 = clamp((position.y - uFoot) / uSpan, 0.0, 1.0);
      float axial = length(position.xz);
      float core = 1.0 - smoothstep(0.14, 0.24, axial);
      float waist = smoothstep(0.46, 0.54, y01) * (1.0 - smoothstep(0.60, 0.68, y01));
      float torso = smoothstep(0.42, 0.50, y01) * (1.0 - smoothstep(0.78, 0.86, y01));
      float legs = smoothstep(0.06, 0.16, y01) * (1.0 - smoothstep(0.46, 0.54, y01));
      float amount = uFat * core * (waist * 0.08 + torso * 0.04 + legs * 0.03);
      if (y01 > 0.84) amount = 0.0;
      transformed += normalize(objectNormal) * amount;
      vY01 = y01;
      vFront = objectNormal.z;
      vBind = position.xyz;`
    );
    shader.fragmentShader = `varying float vY01;\nvarying float vFront;\nvarying vec3 vBind;\nuniform float uHasFace;\nuniform sampler2D uFaceMap;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      if (uHasFace > 0.5 && vY01 > 0.84 && vFront > 0.2) {
        vec2 faceUv = vec2(vBind.x / 0.11 + 0.5, (vY01 - 0.84) / 0.16);
        vec4 face = texture2D(uFaceMap, clamp(faceUv, 0.0, 1.0));
        float edge = smoothstep(0.0, 0.06, faceUv.x) * smoothstep(0.0, 0.06, 1.0 - faceUv.x);
        edge *= smoothstep(0.0, 0.04, faceUv.y) * smoothstep(0.0, 0.05, 1.0 - faceUv.y);
        float cover = edge * smoothstep(0.2, 0.75, vFront) * smoothstep(0.15, 0.55, face.a);
        diffuseColor.rgb = mix(diffuseColor.rgb, face.rgb, cover);
      }`
    );
    material.userData.shader = shader;
  };
}

const POSES = {
  rest: {},
  wave: {
    upperarm_r: [0.15, 0.2, -1.55],
    lowerarm_r: [0, 0, -0.85],
    hand_r: [0.2, 0.1, -0.2],
    clavicle_r: [0, 0, -0.25],
    spine_02: [0.05, -0.08, 0],
  },
  walk: {
    thigh_l: [0.55, 0, 0.04],
    thigh_r: [-0.4, 0, -0.04],
    calf_l: [-0.7, 0, 0],
    calf_r: [-0.2, 0, 0],
    upperarm_l: [0.45, 0, 0.2],
    upperarm_r: [-0.4, 0, -0.15],
    lowerarm_l: [0, 0.35, 0],
    lowerarm_r: [0, -0.25, 0],
    spine_01: [0.06, 0.18, 0],
    spine_02: [0.04, 0.08, 0],
  },
  sit: {
    thigh_l: [-0.5728, -0.0631, 0.288, 0.7648],
    thigh_r: [-0.5728, 0.0631, -0.288, 0.7648],
    calf_l: [-0.0394, 0.0663, 0.6201, 0.7807],
    calf_r: [0.0394, -0.0663, 0.6201, 0.7807],
  },
};

function paintSurface(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || geometry.getAttribute("uv")) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const spanX = Math.max(0.001, box.max.x - box.min.x);
  const spanY = Math.max(0.001, box.max.y - box.min.y);
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    let across = (position.getX(index) - box.min.x) / spanX;
    if (normal && normal.getZ(index) < 0) across = 1 - across;
    uvs[index * 2] = Math.min(1, Math.max(0, across));
    uvs[index * 2 + 1] = Math.min(1, Math.max(0, (position.getY(index) - box.min.y) / spanY));
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function hairMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.renderOrder = 3;
  return mesh;
}

function portraitGeometry() {
  const geometry = new THREE.PlaneGeometry(0.74, 0.98, 10, 1);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const across = position.getX(index) / 0.37;
    position.setZ(index, -across * across * 0.07);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeGarment(source, blankMap, metrics) {
  const geometry = source.geometry.clone();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    position.setXYZ(index, x + normal.getX(index) * 0.012, y + normal.getY(index) * 0.012, z + normal.getZ(index) * 0.012);
    let across = Math.min(0.98, Math.max(0.02, 0.5 + x / 0.46));
    if (normal.getZ(index) < 0) across = 1 - across;
    const y01 = (y - metrics.foot) / metrics.span;
    uvs[index * 2] = across;
    uvs[index * 2 + 1] = Math.min(1, Math.max(0, y01));
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const material = new THREE.MeshPhysicalMaterial({
    map: blankMap,
    color: "#ffffff",
    roughness: 0.74,
    metalness: 0,
    transparent: true,
    alphaTest: 0.22,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    depthWrite: false,
  });
  material.customProgramCacheKey = () => "draped-garment-v2";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHasTop = { value: 0 };
    shader.uniforms.uHasBottom = { value: 0 };
    shader.uniforms.uHasShoe = { value: 0 };
    shader.uniforms.uTopMap = { value: blankMap };
    shader.uniforms.uBottomMap = { value: blankMap };
    shader.uniforms.uShoeMap = { value: blankMap };
    shader.uniforms.uFoot = { value: metrics.foot };
    shader.uniforms.uSpan = { value: metrics.span };
    shader.vertexShader = `varying float vGarmentY;\nuniform float uFoot;\nuniform float uSpan;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <skinning_vertex>",
      `#include <skinning_vertex>
      vGarmentY = clamp((position.y - uFoot) / uSpan, 0.0, 1.0);`
    );
    shader.fragmentShader = `varying float vGarmentY;\nuniform float uHasTop;\nuniform float uHasBottom;\nuniform float uHasShoe;\nuniform sampler2D uTopMap;\nuniform sampler2D uBottomMap;\nuniform sampler2D uShoeMap;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      vec4 draped = vec4(0.0);
      if (uHasShoe > 0.5 && vGarmentY < 0.11) draped = texture2D(uShoeMap, vMapUv);
      else if (uHasBottom > 0.5 && vGarmentY < 0.56) draped = texture2D(uBottomMap, vMapUv);
      else if (uHasTop > 0.5 && vGarmentY > 0.45 && vGarmentY < 0.83) draped = texture2D(uTopMap, vMapUv);
      if (draped.a < 0.22) discard;
      diffuseColor = draped;`
    );
    material.userData.shader = shader;
  };
  const draped = new THREE.SkinnedMesh(geometry, material);
  draped.bind(source.skeleton, source.bindMatrix);
  draped.castShadow = true;
  draped.frustumCulled = false;
  draped.visible = false;
  draped.renderOrder = 2;
  return draped;
}

export function mount(container, initial) {
  const width = container.clientWidth || 320;
  const height = container.clientHeight || 480;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#14110e");
  scene.fog = new THREE.Fog("#14110e", 7, 14);
  const camera = new THREE.PerspectiveCamera(26, width / Math.max(height, 1), 0.05, 40);
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.5));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = "none";
  container.replaceChildren(renderer.domElement);

  scene.background = new THREE.Color("#d7e2f1");
  scene.add(new THREE.HemisphereLight("#ffffff", "#b7c6da", 1.45));
  const key = new THREE.DirectionalLight("#ffffff", 2.7);
  key.position.set(1.2, 3.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 8;
  key.shadow.camera.left = -1.2;
  key.shadow.camera.right = 1.2;
  key.shadow.camera.top = 2.2;
  key.shadow.camera.bottom = -0.2;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#e7f1ff", 1.05);
  fill.position.set(-2.1, 1.6, 1.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight("#ffffff", 0.7);
  rim.position.set(-0.8, 2.2, -2.6);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, mobile ? 32 : 48),
    new THREE.MeshStandardMaterial({ color: "#f7f9fc", roughness: 0.72, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const figure = new THREE.Group();
  scene.add(figure);
  const blank = blankTexture();
  const bodyState = { fat: 0, span: 1.68, foot: 0, shoulder: 1, hips: 1 };
  const skin = new THREE.MeshPhysicalMaterial({
    color: SKINS[initial.skin] || SKINS[2],
    roughness: 0.46,
    metalness: 0,
    sheen: 0.42,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#ffc7b4"),
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
  });
  installBodyShader(skin, blank, bodyState);
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: initial.hairColor || "#1a120e",
    roughness: 0.5,
    metalness: 0.02,
    sheen: 0.4,
    sheenRoughness: 0.45,
    sheenColor: "#4a3428",
  });
  const hairAnchor = new THREE.Group();
  const hairStyles = { short: new THREE.Group(), medium: new THREE.Group(), long: new THREE.Group(), bun: new THREE.Group() };
  const cap = new THREE.SphereGeometry(0.55, 22, 16);
  const shortCap = hairMesh(cap, hairMat);
  shortCap.position.y = 0.66;
  shortCap.scale.set(0.92, 0.42, 0.95);
  hairStyles.short.add(shortCap);
  const mediumCap = hairMesh(cap, hairMat);
  mediumCap.position.y = 0.72;
  mediumCap.scale.set(0.96, 0.46, 1);
  const side = new THREE.SphereGeometry(0.18, 14, 12);
  const sideL = hairMesh(side, hairMat);
  const sideR = hairMesh(side, hairMat);
  sideL.position.set(-0.38, 0.05, 0.02);
  sideR.position.set(0.38, 0.05, 0.02);
  hairStyles.medium.add(mediumCap, sideL, sideR);
  const longCap = hairMesh(cap, hairMat);
  longCap.position.y = 0.72;
  longCap.scale.set(0.94, 0.44, 1);
  const lock = new THREE.CapsuleGeometry(0.07, 0.55, 4, 8);
  const lockL = hairMesh(lock, hairMat);
  const lockR = hairMesh(lock, hairMat);
  lockL.position.set(-0.28, -0.35, -0.16);
  lockR.position.set(0.28, -0.35, -0.16);
  hairStyles.long.add(longCap, lockL, lockR);
  const bunCap = hairMesh(cap, hairMat);
  bunCap.position.y = 0.66;
  bunCap.scale.set(0.9, 0.4, 0.95);
  const bun = hairMesh(new THREE.SphereGeometry(0.2, 16, 12), hairMat);
  bun.position.set(0, 0.72, -0.08);
  hairStyles.bun.add(bunCap, bun);
  for (const group of Object.values(hairStyles)) {
    group.visible = false;
    hairAnchor.add(group);
  }
  const frameMat = new THREE.MeshStandardMaterial({ color: "#1c1c1c", roughness: 0.28, metalness: 0.45 });
  const lensMat = new THREE.MeshStandardMaterial({ color: "#223044", roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.42 });
  const glassesStyles = { round: new THREE.Group(), square: new THREE.Group(), sun: new THREE.Group() };
  const roundL = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 18), frameMat);
  const roundR = roundL.clone();
  roundL.position.set(-0.2, 0.16, 0.46);
  roundR.position.set(0.2, 0.16, 0.46);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), frameMat);
  bridge.position.set(0, 0.18, 0.46);
  glassesStyles.round.add(roundL, roundR, bridge);
  const squareL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.03), frameMat);
  const squareR = squareL.clone();
  squareL.position.set(-0.2, 0.16, 0.46);
  squareR.position.set(0.2, 0.16, 0.46);
  const squareBridge = bridge.clone();
  glassesStyles.square.add(squareL, squareR, squareBridge);
  const sunL = new THREE.Mesh(new THREE.CircleGeometry(0.15, 18), lensMat);
  const sunR = sunL.clone();
  sunL.position.set(-0.2, 0.16, 0.47);
  sunR.position.set(0.2, 0.16, 0.47);
  const sunRingL = roundL.clone();
  const sunRingR = roundR.clone();
  glassesStyles.sun.add(sunL, sunR, sunRingL, sunRingR, bridge.clone());
  let shownGlasses = "";
  for (const group of Object.values(glassesStyles)) {
    group.visible = false;
    group.scale.setScalar(1.25);
    group.traverse((object) => {
      if (object.isMesh) object.renderOrder = 4;
    });
    hairAnchor.add(group);
  }
  const hatMat = new THREE.MeshStandardMaterial({ color: "#2c3138", roughness: 0.72, metalness: 0.04 });
  const hatStyles = { cap: new THREE.Group(), beanie: new THREE.Group(), hood: new THREE.Group() };
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.2, 16), hatMat);
  crown.position.set(0, 0.64, 0.02);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.035, 0.28), hatMat);
  brim.position.set(0, 0.52, 0.22);
  hatStyles.cap.add(crown, brim);
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), hatMat);
  beanie.scale.set(1, 0.58, 1);
  beanie.position.set(0, 0.66, 0);
  hatStyles.beanie.add(beanie);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), hatMat);
  hood.scale.set(1.05, 0.86, 0.78);
  hood.position.set(0, 0.4, -0.08);
  hatStyles.hood.add(hood);
  const beardStyles = { stubble: new THREE.Group(), beard: new THREE.Group(), mustache: new THREE.Group() };
  const stubble = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hairMat);
  stubble.scale.set(1.3, 0.55, 0.45);
  stubble.position.set(0, -0.08, 0.5);
  beardStyles.stubble.add(stubble);
  const beard = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), hairMat);
  beard.position.set(0, -0.16, 0.48);
  beardStyles.beard.add(beard);
  const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06), hairMat);
  mustache.position.set(0, 0.02, 0.56);
  beardStyles.mustache.add(mustache);
  let shownHat = "";
  let shownBeard = "";
  for (const group of [...Object.values(hatStyles), ...Object.values(beardStyles)]) {
    group.visible = false;
    hairAnchor.add(group);
  }
  const portraitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const portrait = new THREE.Mesh(portraitGeometry(), portraitMat);
  portrait.position.set(0, 0.12, 0.5);
  portrait.visible = false;
  portrait.renderOrder = 2;
  hairAnchor.add(portrait);
  scene.add(hairAnchor);

  const loader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();
  let yaw = 0.4;
  let pitch = 0.06;
  let dist = 3.6;
  let lookY = 0.9;
  let modelSpan = 1.68;
  let placedHeight = 0;
  let ready = false;
  let shownHair = "";
  let headBone = null;
  let skeleton = null;
  let cloth = null;
  let poseName = initial.pose || "rest";
  let mixer = null;
  let currentAction = null;
  const outfit = { face: null, shirt: null, pants: null, skinTone: null };
  const poseEuler = new THREE.Euler();
  const poseQuat = new THREE.Quaternion();
  const clock = new THREE.Clock();
  let pending = initial;
  let frame = 0;
  let stopped = false;
  const pointers = new Map();
  let pinch = 0;
  const worn = { top: "", bottom: "", shoe: "", face: "" };
  const maps = { top: null, bottom: null, shoe: null, face: null };

  function placeCamera() {
    const orbit = Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * orbit * dist, lookY + Math.sin(pitch) * dist, Math.cos(yaw) * orbit * dist);
    camera.lookAt(0, lookY, 0);
  }

  function uniform(name) {
    return skin.userData.shader?.uniforms[name];
  }

  function applyShape(next) {
    const heightCm = Math.min(220, Math.max(140, Number(next.height) || 170));
    const weightKg = Math.min(180, Math.max(35, Number(next.weight) || 45 + ((Number(next.body) || 40) / 100) * 90));
    const meters = heightCm / 100;
    const bmi = weightKg / (meters * meters);
    const fat = Math.max(-0.28, Math.min(0.9, (bmi - 22.5) / 12));
    const scale = meters / modelSpan;
    const build = Math.min(1.24, Math.max(0.84, 1 + (bmi - 22.5) * 0.016));
    figure.scale.set(scale * build, scale, scale * build);
    bodyState.fat = fat;
    const fatUniform = uniform("uFat");
    if (fatUniform) fatUniform.value = fat;
    const shoulder = Math.min(1.25, Math.max(0.8, Number(next.shoulder) || 1));
    const hips = Math.min(1.25, Math.max(0.8, Number(next.hips) || 1));
    bodyState.shoulder = shoulder;
    bodyState.hips = hips;
    const shoulderUniform = uniform("uShoulder");
    const hipUniform = uniform("uHips");
    if (shoulderUniform) shoulderUniform.value = shoulder;
    if (hipUniform) hipUniform.value = hips;
    lookY = meters * 0.42;
    if (placedHeight !== heightCm) {
      placedHeight = heightCm;
      dist = meters * 3.6;
    }
    hairAnchor.scale.setScalar(0.68 * (heightCm / 170));
    const tone = next.skinHex || SKINS[Number(next.skin)] || SKINS[2];
    if (outfit.skinTone) outfit.skinTone.color.set(tone);
    if (outfit.face && !outfit.face.map) outfit.face.color.set(tone);
    skin.color.set(tone);
  }

  function applyHair(style, color) {
    hairMat.color.set(color || "#1a120e");
    if (modelHasHair) {
      shownHair = "";
      for (const group of Object.values(hairStyles)) group.visible = false;
      return;
    }
    const name = hairStyles[style] ? style : "short";
    if (name !== shownHair) {
      shownHair = name;
      for (const [key, group] of Object.entries(hairStyles)) group.visible = key === name;
    }
  }

  function applyGlasses(kind) {
    const name = glassesStyles[kind] ? kind : "none";
    if (name === shownGlasses) return;
    shownGlasses = name;
    for (const [key, group] of Object.entries(glassesStyles)) group.visible = key === name;
  }

  function applyHat(kind) {
    const name = hatStyles[kind] ? kind : "none";
    if (name === shownHat) return;
    shownHat = name;
    for (const [key, group] of Object.entries(hatStyles)) group.visible = key === name;
  }

  function applyBeard(kind) {
    const name = beardStyles[kind] ? kind : "none";
    if (name === shownBeard) return;
    shownBeard = name;
    for (const [key, group] of Object.entries(beardStyles)) group.visible = key === name;
  }

  function clothUniform(name) {
    return cloth?.material?.userData?.shader?.uniforms[name];
  }

  function dress(material, texture, fallback) {
    if (!material) return;
    material.map = texture || null;
    material.color.set(texture ? "#ffffff" : fallback);
    material.needsUpdate = true;
  }

  function assignMap(slot, texture) {
    const previous = maps[slot];
    if (previous && previous !== texture) previous.dispose();
    maps[slot] = texture;
    if (slot === "face") {
      portraitMat.map = texture || null;
      portraitMat.needsUpdate = true;
      portrait.visible = Boolean(texture);
      if (outfit.face) {
        outfit.face.opacity = texture ? 0 : 1;
        outfit.face.transparent = Boolean(texture);
        outfit.face.depthWrite = !texture;
        if (!texture) outfit.face.color.set(skin.color);
        outfit.face.needsUpdate = true;
      }
      return;
    }
    if (slot === "top") {
      dress(outfit.shirt, texture, "#6d4c7d");
      return;
    }
    if (slot === "bottom") {
      dress(outfit.pants, texture, "#2c3440");
      return;
    }
    const flag = { top: "uHasTop", bottom: "uHasBottom", shoe: "uHasShoe" }[slot];
    const sampler = { top: "uTopMap", bottom: "uBottomMap", shoe: "uShoeMap" }[slot];
    const has = clothUniform(flag);
    const map = clothUniform(sampler);
    if (has) has.value = texture ? 1 : 0;
    if (map) map.value = texture || blank;
    if (cloth) cloth.visible = Boolean(maps.top || maps.bottom || maps.shoe);
  }

  function syncClothUniforms() {
    const pairs = [
      ["top", "uHasTop", "uTopMap"],
      ["bottom", "uHasBottom", "uBottomMap"],
      ["shoe", "uHasShoe", "uShoeMap"],
    ];
    for (const [slot, flag, sampler] of pairs) {
      const has = clothUniform(flag);
      const map = clothUniform(sampler);
      if (!has || !map) return;
      has.value = maps[slot] ? 1 : 0;
      map.value = maps[slot] || blank;
    }
    if (cloth) cloth.visible = Boolean(maps.top || maps.bottom || maps.shoe);
  }

  function applyPose(time) {
    if (!skeleton) return;
    const pose = POSES[poseName] || POSES.rest;
    figure.position.y = poseName === "sit" ? -0.37 * Math.max(figure.scale.y, 0.2) : 0;
    const breathe = Math.sin(time * 1.35) * 0.035;
    for (const bone of skeleton.bones) {
      const rest = bone.userData.rest;
      if (!rest) continue;
      bone.quaternion.copy(rest);
      const extra = pose[bone.name] || [0, 0, 0];
      if (extra.length === 4) {
        poseQuat.set(extra[0], extra[1], extra[2], extra[3]);
        bone.quaternion.multiply(poseQuat);
        continue;
      }
      let x = extra[0];
      let y = extra[1];
      let z = extra[2];
      if (bone.name === "spine_02" || bone.name === "spine_03") x += breathe;
      if (bone.name === "clavicle_l") z += breathe * 0.35;
      if (bone.name === "clavicle_r") z -= breathe * 0.35;
      if (!x && !y && !z) continue;
      poseEuler.set(x, y, z);
      poseQuat.setFromEuler(poseEuler);
      bone.quaternion.multiply(poseQuat);
    }
  }

  function wear(slot, url) {
    if ((url || "") === worn[slot]) return;
    worn[slot] = url || "";
    if (!url) {
      assignMap(slot, null);
      return;
    }
    const requested = url;
    loader.load(url, (texture) => {
      if (stopped || worn[slot] !== requested) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      assignMap(slot, texture);
    });
  }

  function applyClothes(next) {
    const topUrl = next.topUrl || "";
    const bottomUrl = next.bottomUrl || (next.dress ? topUrl : "");
    wear("top", topUrl);
    wear("bottom", bottomUrl);
    wear("shoe", next.shoeUrl || "");
    wear("face", next.faceUrl || "");
  }

  function apply(next) {
    pending = next;
    poseName = next.pose || "rest";
    if (!ready) return;
    applyShape(next);
    applyHair(next.hair, next.hairColor);
    applyGlasses(next.glasses);
    applyHat(next.hat);
    applyBeard(next.beard);
    applyClothes(next);
    playPose(poseName);
  }

  let shownPose = "";

  function playPose(name) {
    if (!mixer || shownPose === name) return;
    shownPose = name;
    const found = THREE.AnimationClip.findByName(playPose.clips || [], POSE_CLIP[name] || "Idle");
    if (!found) return;
    const next = mixer.clipAction(found);
    next.reset();
    if (name === "sit") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    if (currentAction && currentAction !== next) currentAction.fadeOut(0.2);
    next.fadeIn(0.2).play();
    currentAction = next;
  }

  function animate() {
    if (stopped) return;
    if (mixer) mixer.update(clock.getDelta());
    else applyPose(clock.getElapsedTime());
    syncClothUniforms();
    if (headBone) {
      headBone.getWorldPosition(hairAnchor.position);
      hairAnchor.position.y += 0.015 * figure.scale.y;
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
      pitch = Math.max(-1.45, Math.min(1.45, pitch + (event.clientY - previous.y) * 0.008));
      return;
    }
    const points = [...pointers.values()];
    const gap = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (pinch) dist = Math.max(1.4, Math.min(7, dist * (pinch / gap)));
    pinch = gap;
  }
  function onPointerEnd(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
  }
  function onWheel(event) {
    event.preventDefault();
    dist = Math.max(1.4, Math.min(7, dist + event.deltaY * 0.002));
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

  let loadedScene = null;
  let modelHasHair = false;
  let modelUrl = initial.modelUrl || MODEL_URL;

  function dropScene(target) {
    const shared = new Set(Object.values(maps).filter(Boolean));
    target.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      const materials = [].concat(object.material || []);
      for (const material of materials) {
        if (material.map && !shared.has(material.map)) material.map.dispose?.();
        material.dispose?.();
      }
    });
  }

  function loadAvatar(url) {
    modelUrl = url || MODEL_URL;
    gltfLoader.load(
      modelUrl,
      (gltf) => {
        if (stopped) return;
        let mesh = null;
        gltf.scene.traverse((object) => {
          if (object.isSkinnedMesh && !mesh) mesh = object;
        });
        if (!mesh) return;
        if (loadedScene) {
          figure.remove(loadedScene);
          dropScene(loadedScene);
        }
        outfit.skinTone = null;
        outfit.face = null;
        outfit.shirt = null;
        outfit.pants = null;
        modelHasHair = false;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        bodyState.foot = box.min.y;
        bodyState.span = Math.max(0.4, box.max.y - box.min.y);
        modelSpan = bodyState.span;
        const span = uniform("uSpan");
        const foot = uniform("uFoot");
        if (span) span.value = bodyState.span;
        if (foot) foot.value = bodyState.foot;
        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
          const materials = [].concat(object.material);
          for (const material of materials) {
            material.metalness = 0;
            if (material.name === "Skin" || material.name === "Face") material.roughness = 0.4;
            if (material.name === "Face" || material.name === "Shirt" || material.name === "Pants" || material.name === "Black") paintSurface(object.geometry);
            if (material.name === "Skin") outfit.skinTone = material;
            if (material.name === "Face") outfit.face = material;
            if (material.name === "Shirt") outfit.shirt = material;
            if (material.name === "Pants" || (material.name === "Black" && !outfit.pants)) outfit.pants = material;
            if (material.name === "Hair") modelHasHair = true;
          }
        });
        if (outfit.skinTone) outfit.skinTone.color.set(SKINS[pending.skin] || SKINS[2]);
        if (outfit.face) outfit.face.color.set(SKINS[pending.skin] || SKINS[2]);
        if (outfit.shirt && !outfit.shirt.map) outfit.shirt.color.set("#6d4c7d");
        if (outfit.pants && !outfit.pants.map) outfit.pants.color.set("#2c3440");
        figure.add(gltf.scene);
        loadedScene = gltf.scene;
        skeleton = mesh.skeleton;
        for (const bone of skeleton.bones) bone.userData.rest = bone.quaternion.clone();
        headBone = skeleton.bones.find((bone) => bone.name === "Head" || bone.name === "head") || null;
        if (currentAction) currentAction.stop();
        currentAction = null;
        shownPose = "";
        mixer = new THREE.AnimationMixer(gltf.scene);
        playPose.clips = gltf.animations;
        ready = true;
        shownHair = "";
        apply(pending);
      },
      undefined,
      () => {
        if (!stopped && !loadedScene) container.insertAdjacentHTML("beforeend", `<p class="boot">3D tana yuklanmadi. Internetni tekshiring.</p>`);
      }
    );
  }

  loadAvatar(modelUrl);

  applyHair(initial.hair, initial.hairColor);
  animate();

  async function projections() {
    if (!ready) return [];
    const shots = [
      ["old", 0, 0.04],
      ["orqa", Math.PI, 0.04],
      ["chap", Math.PI / 2, 0.04],
      ["ong", -Math.PI / 2, 0.04],
      ["tepa", 0.15, 1.28],
      ["past", 0.15, -1.12],
    ];
    const saved = {
      yaw, pitch, dist, aspect: camera.aspect,
      width: container.clientWidth || 320,
      height: container.clientHeight || 480,
      fog: scene.fog,
    };
    const frames = [];
    const target = new THREE.WebGLRenderTarget(1024, 1024);
    const pixels = new Uint8Array(1024 * 1024 * 4);
    const sheet = document.createElement("canvas");
    sheet.width = 1024;
    sheet.height = 1024;
    const context = sheet.getContext("2d", { willReadFrequently: true });
    scene.fog = null;
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    const shotDist = Math.max(saved.dist, lookY * 3.35, 3.2);
    try {
      for (const [name, shotYaw, shotPitch] of shots) {
        yaw = shotYaw;
        pitch = shotPitch;
        dist = shotDist;
        applyPose(clock.getElapsedTime());
        syncClothUniforms();
        if (headBone) {
          headBone.getWorldPosition(hairAnchor.position);
          hairAnchor.position.y += 0.015 * figure.scale.y;
        }
        figure.updateMatrixWorld(true);
        placeCamera();
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, 1024, 1024, pixels);
        renderer.setRenderTarget(null);
        const image = context.createImageData(1024, 1024);
        for (let row = 0; row < 1024; row += 1) {
          const source = (1023 - row) * 1024 * 4;
          image.data.set(pixels.subarray(source, source + 1024 * 4), row * 1024 * 4);
        }
        context.putImageData(image, 0, 0);
        const blob = await new Promise((resolve) => sheet.toBlob(resolve, "image/png"));
        if (blob) frames.push({ name: `${name}.png`, blob });
      }
    } finally {
      target.dispose();
      yaw = saved.yaw;
      pitch = saved.pitch;
      dist = saved.dist;
      scene.fog = saved.fog;
      camera.aspect = saved.width / Math.max(saved.height, 1);
      camera.updateProjectionMatrix();
      placeCamera();
    }
    return frames;
  }

  return {
    update(next) {
      apply(next);
    },
    useAvatar(url) {
      if (!url || url === modelUrl) return;
      loadAvatar(url);
    },
    projections,
    dispose() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerEnd);
      renderer.domElement.removeEventListener("pointercancel", onPointerEnd);
      renderer.domElement.removeEventListener("wheel", onWheel);
      for (const texture of Object.values(maps)) texture?.dispose();
      blank.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        const materials = object.material ? [].concat(object.material) : [];
        for (const material of materials) material.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
