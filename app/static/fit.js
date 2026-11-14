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
  material.customProgramCacheKey = () => "anatomical-body-v1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFat = { value: state.fat };
    shader.uniforms.uSpan = { value: state.span };
    shader.uniforms.uFoot = { value: state.foot };
    shader.uniforms.uHasFace = { value: 0 };
    shader.uniforms.uHasTop = { value: 0 };
    shader.uniforms.uHasBottom = { value: 0 };
    shader.uniforms.uHasShoe = { value: 0 };
    shader.uniforms.uFaceMap = { value: blank };
    shader.uniforms.uTopMap = { value: blank };
    shader.uniforms.uBottomMap = { value: blank };
    shader.uniforms.uShoeMap = { value: blank };
    shader.vertexShader = `varying float vY01;\nvarying float vFront;\nvarying vec3 vBind;\nuniform float uFat;\nuniform float uSpan;\nuniform float uFoot;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <skinning_vertex>",
      `#include <skinning_vertex>
      float y01 = clamp((position.y - uFoot) / uSpan, 0.0, 1.0);
      float waist = smoothstep(0.46, 0.54, y01) * (1.0 - smoothstep(0.60, 0.68, y01));
      float torso = smoothstep(0.42, 0.50, y01) * (1.0 - smoothstep(0.78, 0.86, y01));
      float legs = smoothstep(0.06, 0.16, y01) * (1.0 - smoothstep(0.46, 0.54, y01));
      float arms = smoothstep(0.50, 0.58, y01) * (1.0 - smoothstep(0.78, 0.86, y01));
      float amount = uFat * (waist * 0.11 + torso * 0.055 + legs * 0.04 + arms * 0.035);
      if (y01 > 0.86) amount *= 0.18;
      transformed += normalize(objectNormal) * amount;
      transformed.x += uFat * torso * position.x * 0.06;
      vY01 = y01;
      vFront = objectNormal.z;
      vBind = position.xyz;`
    );
    shader.fragmentShader = `varying float vY01;\nvarying float vFront;\nvarying vec3 vBind;\nuniform float uHasFace;\nuniform float uHasTop;\nuniform float uHasBottom;\nuniform float uHasShoe;\nuniform sampler2D uFaceMap;\nuniform sampler2D uTopMap;\nuniform sampler2D uBottomMap;\nuniform sampler2D uShoeMap;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      vec2 wearUv = clamp(vec2(vBind.x * 1.15 + 0.5, vY01 * 1.05), 0.0, 1.0);
      if (uHasShoe > 0.5 && vY01 < 0.09) {
        diffuseColor.rgb = texture2D(uShoeMap, wearUv).rgb;
      } else if (uHasBottom > 0.5 && vY01 < 0.52) {
        diffuseColor.rgb = texture2D(uBottomMap, wearUv).rgb;
      } else if (uHasTop > 0.5 && vY01 > 0.48 && vY01 < 0.80) {
        diffuseColor.rgb = texture2D(uTopMap, wearUv).rgb;
      }
      if (uHasFace > 0.5 && vY01 > 0.84 && vFront > 0.25) {
        vec2 faceUv = clamp(vec2(vBind.x / 0.11 + 0.5, (vY01 - 0.84) / 0.16), 0.0, 1.0);
        vec3 face = texture2D(uFaceMap, faceUv).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, face, smoothstep(0.25, 0.75, vFront));
      }`
    );
    material.userData.shader = shader;
  };
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
  const bodyState = { fat: 0, span: 1.68, foot: 0 };
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
  let pending = initial;
  let frame = 0;
  let stopped = false;
  const pointers = new Map();
  let pinch = 0;
  const worn = { top: "", bottom: "", shoe: "", face: "" };
  const maps = { top: null, bottom: null, shoe: null, face: null };

  function placeCamera() {
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      lookY + Math.sin(pitch) * dist * 0.35,
      Math.cos(yaw) * Math.cos(pitch) * dist
    );
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
    const fat = Math.max(-0.42, Math.min(0.95, (bmi - 22.5) / 14));
    const scale = meters / modelSpan;
    figure.scale.setScalar(scale);
    bodyState.fat = fat;
    const fatUniform = uniform("uFat");
    if (fatUniform) fatUniform.value = fat;
    lookY = meters * 0.5;
    if (placedHeight !== heightCm) {
      placedHeight = heightCm;
      dist = meters * 2.55;
    }
    hairAnchor.scale.setScalar(0.18 * (heightCm / 170));
    skin.color.set(SKINS[Number(next.skin)] || SKINS[2]);
  }

  function applyHair(style, color) {
    const name = hairStyles[style] ? style : "short";
    if (name !== shownHair) {
      shownHair = name;
      for (const [key, group] of Object.entries(hairStyles)) group.visible = key === name;
    }
    hairMat.color.set(color || "#1a120e");
  }

  function assignMap(slot, texture) {
    const previous = maps[slot];
    if (previous && previous !== texture) previous.dispose();
    maps[slot] = texture;
    const flag = { top: "uHasTop", bottom: "uHasBottom", shoe: "uHasShoe", face: "uHasFace" }[slot];
    const sampler = { top: "uTopMap", bottom: "uBottomMap", shoe: "uShoeMap", face: "uFaceMap" }[slot];
    const has = uniform(flag);
    const map = uniform(sampler);
    if (has) has.value = texture ? 1 : 0;
    if (map) map.value = texture || blank;
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
    if (!ready) return;
    applyShape(next);
    applyHair(next.hair, next.hairColor);
    applyClothes(next);
  }

  function animate() {
    if (stopped) return;
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
      pitch = Math.max(-0.15, Math.min(0.8, pitch + (event.clientY - previous.y) * 0.006));
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
      figure.add(mesh);
      headBone = mesh.skeleton?.bones.find((bone) => bone.name === "head") || null;
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

  return {
    update(next) {
      apply(next);
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
