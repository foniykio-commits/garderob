import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SKINS = ["#f3d3bf", "#e7b892", "#c68642", "#8d5524", "#5c3317", "#3b2214"];
const MODEL_URL = "/assets/models/body.glb";
const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;

function blankTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function installBodyShader(material, blank, state) {
  material.customProgramCacheKey = () => "anatomical-body-v4";
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
      if (uHasFace > 0.5 && vY01 > 0.84 && vFront > 0.25) {
        vec2 faceUv = clamp(vec2(vBind.x / 0.11 + 0.5, (vY01 - 0.84) / 0.16), 0.0, 1.0);
        vec3 face = texture2D(uFaceMap, faceUv).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, face, smoothstep(0.25, 0.75, vFront));
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

function hairMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = "none";
  container.replaceChildren(renderer.domElement);

  scene.add(new THREE.HemisphereLight("#fff6ee", "#4a342c", 0.78));
  const key = new THREE.DirectionalLight("#fff8f2", 2.05);
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
  const fill = new THREE.DirectionalLight("#d5e4ff", 0.42);
  fill.position.set(-2.1, 1.6, 1.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight("#f2d3ae", 0.85);
  rim.position.set(-0.8, 2.2, -2.6);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, mobile ? 32 : 48),
    new THREE.MeshStandardMaterial({ color: "#1b1713", roughness: 0.94, metalness: 0 })
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
  shortCap.position.y = 0.28;
  shortCap.scale.set(0.92, 0.42, 0.95);
  hairStyles.short.add(shortCap);
  const mediumCap = hairMesh(cap, hairMat);
  mediumCap.position.y = 0.4;
  mediumCap.scale.set(0.96, 0.46, 1);
  const side = new THREE.SphereGeometry(0.18, 14, 12);
  const sideL = hairMesh(side, hairMat);
  const sideR = hairMesh(side, hairMat);
  sideL.position.set(-0.38, 0.05, 0.02);
  sideR.position.set(0.38, 0.05, 0.02);
  hairStyles.medium.add(mediumCap, sideL, sideR);
  const longCap = hairMesh(cap, hairMat);
  longCap.position.y = 0.4;
  longCap.scale.set(0.94, 0.44, 1);
  const lock = new THREE.CapsuleGeometry(0.07, 0.55, 4, 8);
  const lockL = hairMesh(lock, hairMat);
  const lockR = hairMesh(lock, hairMat);
  lockL.position.set(-0.28, -0.35, -0.16);
  lockR.position.set(0.28, -0.35, -0.16);
  hairStyles.long.add(longCap, lockL, lockR);
  const bunCap = hairMesh(cap, hairMat);
  bunCap.position.y = 0.36;
  bunCap.scale.set(0.9, 0.4, 0.95);
  const bun = hairMesh(new THREE.SphereGeometry(0.2, 16, 12), hairMat);
  bun.position.set(0, 0.72, -0.08);
  hairStyles.bun.add(bunCap, bun);
  for (const group of Object.values(hairStyles)) {
    group.visible = false;
    hairAnchor.add(group);
  }
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
    figure.scale.setScalar(scale);
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
    lookY = meters * 0.5;
    if (placedHeight !== heightCm) {
      placedHeight = heightCm;
      dist = meters * 2.55;
    }
    hairAnchor.scale.setScalar(0.18 * (heightCm / 170));
    skin.color.set(next.skinHex || SKINS[Number(next.skin)] || SKINS[2]);
  }

  function applyHair(style, color) {
    const name = hairStyles[style] ? style : "short";
    if (name !== shownHair) {
      shownHair = name;
      for (const [key, group] of Object.entries(hairStyles)) group.visible = key === name;
    }
    hairMat.color.set(color || "#1a120e");
  }

  function clothUniform(name) {
    return cloth?.material?.userData?.shader?.uniforms[name];
  }

  function assignMap(slot, texture) {
    const previous = maps[slot];
    if (previous && previous !== texture) previous.dispose();
    maps[slot] = texture;
    if (slot === "face") {
      const has = uniform("uHasFace");
      const map = uniform("uFaceMap");
      if (has) has.value = texture ? 1 : 0;
      if (map) map.value = texture || blank;
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
    applyClothes(next);
  }

  function animate() {
    if (stopped) return;
    applyPose(clock.getElapsedTime());
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

  gltfLoader.load(
    MODEL_URL,
    (gltf) => {
      if (stopped) return;
      let mesh = null;
      gltf.scene.traverse((object) => {
        if (object.isSkinnedMesh && !mesh) mesh = object;
      });
      if (!mesh) return;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      bodyState.foot = box.min.y;
      bodyState.span = Math.max(0.4, box.max.y - box.min.y);
      modelSpan = bodyState.span;
      const span = uniform("uSpan");
      const foot = uniform("uFoot");
      if (span) span.value = bodyState.span;
      if (foot) foot.value = bodyState.foot;
      mesh.material = skin;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      figure.add(gltf.scene);
      skeleton = mesh.skeleton;
      for (const bone of skeleton.bones) bone.userData.rest = bone.quaternion.clone();
      headBone = skeleton.bones.find((bone) => bone.name === "head") || null;
      cloth = makeGarment(mesh, blank, bodyState);
      mesh.parent.add(cloth);
      ready = true;
      apply(pending);
    },
    undefined,
    () => {
      if (!stopped) container.insertAdjacentHTML("beforeend", `<p class="boot">3D tana yuklanmadi. Internetni tekshiring.</p>`);
    }
  );

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
