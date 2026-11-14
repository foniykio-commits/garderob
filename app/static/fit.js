import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const SKINS = ["#f3d3bf", "#e7b892", "#c68642", "#8d5524", "#5c3317", "#3b2214"];

function clothMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#f4efe6",
    roughness: 0.62,
    metalness: 0.04,
    transparent: true,
    opacity: 1,
  });
}

function skinMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.02 });
}

function part(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function mount(container, initial) {
  const width = container.clientWidth || 320;
  const height = container.clientHeight || 480;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#171410");
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 30);
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight("#fff4e8", 0.85));
  const key = new THREE.DirectionalLight("#fff7ee", 1.35);
  key.position.set(1.6, 3.2, 2.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#e4c59a", 0.45);
  rim.position.set(-2.2, 1.6, -1.4);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 16),
    new THREE.MeshStandardMaterial({ color: "#0c0b09", roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const skin = skinMaterial(SKINS[initial.skin] || SKINS[2]);
  const shirtMat = clothMaterial();
  const pantsMat = clothMaterial();
  const shoeMat = clothMaterial();
  shoeMat.color.set("#2a2622");
  const figure = new THREE.Group();
  const shirt = new THREE.Group();
  const pants = new THREE.Group();
  const shoes = new THREE.Group();
  shirt.userData.mats = [shirtMat];
  pants.userData.mats = [pantsMat];
  shoes.userData.mats = [shoeMat];

  const head = part(new THREE.SphereGeometry(0.13, 12, 8), skin, 0, 1.58, 0);
  head.material = skin.clone();
  head.rotation.y = Math.PI;
  const neck = part(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), skin, 0, 1.44, 0);
  const torso = part(new THREE.CylinderGeometry(0.16, 0.15, 0.42, 8), skin, 0, 1.18, 0);
  const hip = part(new THREE.CylinderGeometry(0.15, 0.14, 0.16, 8), skin, 0, 0.9, 0);
  const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.48, 8);
  const armL = part(armGeo, skin, -0.24, 1.16, 0);
  const armR = part(armGeo, skin, 0.24, 1.16, 0);
  const thighGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.4, 8);
  const calfGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.36, 8);
  const thighL = part(thighGeo, skin, -0.09, 0.62, 0);
  const thighR = part(thighGeo, skin, 0.09, 0.62, 0);
  const calfL = part(calfGeo, skin, -0.09, 0.24, 0);
  const calfR = part(calfGeo, skin, 0.09, 0.24, 0);
  figure.add(head, neck, torso, hip, armL, armR, thighL, thighR, calfL, calfR);
  const hairMat = new THREE.MeshStandardMaterial({ color: "#1a120e", roughness: 0.55 });
  const capGeo = new THREE.SphereGeometry(0.145, 10, 8);
  const sideGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const lockGeo = new THREE.BoxGeometry(0.07, 0.32, 0.04);
  const bunGeo = new THREE.SphereGeometry(0.065, 8, 6);
  function hairMesh(geometry, x, y, z) {
    const mesh = new THREE.Mesh(geometry, hairMat);
    mesh.position.set(x, y, z);
    return mesh;
  }
  const hairStyles = {
    short: new THREE.Group(),
    medium: new THREE.Group(),
    long: new THREE.Group(),
    bun: new THREE.Group(),
  };
  hairStyles.short.add(hairMesh(capGeo, 0, 1.66, -0.01));
  hairStyles.medium.add(hairMesh(capGeo, 0, 1.66, -0.01), hairMesh(sideGeo, -0.11, 1.5, 0), hairMesh(sideGeo, 0.11, 1.5, 0));
  hairStyles.long.add(hairMesh(capGeo, 0, 1.66, -0.01), hairMesh(lockGeo, -0.09, 1.36, -0.05), hairMesh(lockGeo, 0.09, 1.36, -0.05));
  hairStyles.bun.add(hairMesh(capGeo, 0, 1.64, -0.01), hairMesh(bunGeo, 0, 1.78, -0.03));
  for (const group of Object.values(hairStyles)) {
    group.visible = false;
    figure.add(group);
  }
  let shownHair = "";
  function applyHair(style, color) {
    const name = hairStyles[style] ? style : "short";
    if (name !== shownHair) {
      shownHair = name;
      for (const [key, group] of Object.entries(hairStyles)) group.visible = key === name;
    }
    hairMat.color.set(color || "#1a120e");
  }

  const shirtTorso = part(new THREE.CylinderGeometry(0.185, 0.172, 0.46, 8), shirtMat, 0, 1.18, 0.02);
  const sleeveGeo = new THREE.CylinderGeometry(0.06, 0.052, 0.34, 8);
  const sleeveL = part(sleeveGeo, shirtMat, -0.25, 1.22, 0);
  const sleeveR = part(sleeveGeo, shirtMat, 0.25, 1.22, 0);
  shirt.add(shirtTorso, sleeveL, sleeveR);

  const pantsHip = part(new THREE.CylinderGeometry(0.175, 0.16, 0.2, 8), pantsMat, 0, 0.9, 0.02);
  const pantsThighGeo = new THREE.CylinderGeometry(0.098, 0.078, 0.42, 8);
  const pantsCalfGeo = new THREE.CylinderGeometry(0.074, 0.06, 0.36, 8);
  const pantsThighL = part(pantsThighGeo, pantsMat, -0.09, 0.62, 0.01);
  const pantsThighR = part(pantsThighGeo, pantsMat, 0.09, 0.62, 0.01);
  const pantsCalfL = part(pantsCalfGeo, pantsMat, -0.09, 0.26, 0.01);
  const pantsCalfR = part(pantsCalfGeo, pantsMat, 0.09, 0.26, 0.01);
  pants.add(pantsHip, pantsThighL, pantsThighR, pantsCalfL, pantsCalfR);

  const shoeGeo = new THREE.BoxGeometry(0.12, 0.07, 0.22);
  const shoeL = part(shoeGeo, shoeMat, -0.09, 0.05, 0.03);
  const shoeR = part(shoeGeo, shoeMat, 0.09, 0.05, 0.03);
  shoes.add(shoeL, shoeR);
  figure.add(shirt, pants, shoes);
  scene.add(figure);

  const shaped = [torso, hip, thighL, thighR, calfL, calfR, shirtTorso, pantsHip, pantsThighL, pantsThighR, pantsCalfL, pantsCalfR];
  const loader = new THREE.TextureLoader();
  let yaw = 0.45;
  let pitch = 0.12;
  let dist = 3.5;
  const pointers = new Map();
  let pinch = 0;
  let frame = 0;
  let stopped = false;

  function placeCamera() {
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      1.05 + Math.sin(pitch) * dist * 0.45,
      Math.cos(yaw) * Math.cos(pitch) * dist
    );
    camera.lookAt(0, 1.02, 0);
  }

  function applyShape(next) {
    const width = 0.78 + (Number(next.body) || 0) / 100 * 0.62;
    const depth = 0.86 + (Number(next.body) || 0) / 100 * 0.35;
    const tall = (Number(next.height) || 170) / 170;
    figure.scale.set(1, tall, 1);
    for (const mesh of shaped) mesh.scale.set(width, 1, depth);
    const tone = SKINS[Number(next.skin)] || SKINS[2];
    skin.color.set(tone);
    if (!head.material.map) head.material.color.set(tone);
  }

  let faceUrl = "";
  function applyFace(url) {
    const nextUrl = url || "";
    if (nextUrl === faceUrl) return;
    faceUrl = nextUrl;
    if (!faceUrl) {
      if (head.material.map) head.material.map.dispose();
      head.material.map = null;
      head.material.color.copy(skin.color);
      head.material.needsUpdate = true;
      return;
    }
    loader.load(faceUrl, (texture) => {
      if (stopped || faceUrl !== nextUrl) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      if (head.material.map) head.material.map.dispose();
      head.material.map = texture;
      head.material.color.set("#ffffff");
      head.material.needsUpdate = true;
    });
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
      texture.anisotropy = 1;
      for (const material of group.userData.mats) {
        if (material.map) material.map.dispose();
        material.map = texture;
        material.needsUpdate = true;
      }
    });
  }

  const worn = { top: null, bottom: null, shoe: null };
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
        const scale = 1 + group.userData.pulse * 0.07;
        group.scale.set(scale, scale, scale);
        for (const material of group.userData.mats) material.opacity = 1 - group.userData.pulse * 0.45;
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
      pitch = Math.max(-0.35, Math.min(0.75, pitch + (event.clientY - previous.y) * 0.007));
      return;
    }
    const points = [...pointers.values()];
    const gap = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (pinch) dist = Math.max(2.15, Math.min(5.4, dist * (pinch / gap)));
    pinch = gap;
  }
  function onPointerEnd(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
  }
  function onWheel(event) {
    event.preventDefault();
    dist = Math.max(2.15, Math.min(5.4, dist + event.deltaY * 0.002));
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerEnd);
  renderer.domElement.addEventListener("pointercancel", onPointerEnd);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  const observer = new ResizeObserver(() => {
    const nextWidth = container.clientWidth || 320;
    const nextHeight = container.clientHeight || 480;
    camera.aspect = nextWidth / nextHeight;
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
