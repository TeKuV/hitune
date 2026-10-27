// Casque modelise en 3D (three.js), sans photo ni marque : coques satinees, arceau, coussinets en cuir proteine.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const LED = { 0: 0x8e8e93, 1: 0x0a84ff, 2: 0x30d158 };

function buildHeadphones() {
  const root = new THREE.Group();

  const shell = new THREE.MeshPhysicalMaterial({ color: 0x3b3e45, roughness: 0.42, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const plate = new THREE.MeshPhysicalMaterial({ color: 0x2a2c31, roughness: 0.28, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9cbd0, roughness: 0.22, metalness: 1 });
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x1d1e21, roughness: 0.72, sheen: 1, sheenRoughness: 0.5, sheenColor: 0x5a5c62 });
  const mesh = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.95 });
  const led = new THREE.MeshStandardMaterial({ color: 0x0a84ff, emissive: 0x0a84ff, emissiveIntensity: 2.2 });

  // Arceau : demi-ellipse extrudee, coussin sous l'arceau
  const arcPoints = (rx, ry, from, to) => new THREE.EllipseCurve(0, 0, rx, ry, from * Math.PI, to * Math.PI)
    .getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const band = new THREE.CatmullRomCurve3(arcPoints(0.92, 1.02, 0.08, 0.92));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(band, 160, 0.055, 28, false), shell));
  const pad = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints(0.84, 0.93, 0.22, 0.78)), 120, 0.05, 24, false), leather);
  pad.scale.z = 1.6;
  root.add(pad);

  for (const side of [-1, 1]) {
    const cup = new THREE.Group();
    const endX = side * 0.92 * Math.cos(0.08 * Math.PI);
    const endY = 1.02 * Math.sin(0.08 * Math.PI);

    // Coulisse en metal brosse
    const slider = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.36, 0.05, 4, 0.02), metal);
    slider.position.set(endX + side * 0.01, endY - 0.2, 0);
    root.add(slider);

    // Fourche
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.028, 16, 64, Math.PI), shell);
    yoke.rotation.set(0, side * Math.PI / 2, Math.PI);
    yoke.position.set(endX + side * 0.02, endY - 0.38, 0);
    root.add(yoke);

    // Coque : profil de revolution, bord arrondi
    const profile = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      profile.push(new THREE.Vector2(0.4 * Math.sin(t * Math.PI / 2) + 0.001, 0.18 * (1 - Math.cos(t * Math.PI / 2))));
    }
    profile.push(new THREE.Vector2(0.41, 0.2), new THREE.Vector2(0.41, 0.26));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), shell);
    body.rotation.z = side * Math.PI / 2;
    cup.add(body);

    // Le dome de la coque pointe vers l'exterieur (side), son bord vers la tete (-side).
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.02, 96), plate);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * 0.004;
    cup.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.008, 12, 96), metal);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.012;
    cup.add(ring);

    // Coussinet : tore aplati en cuir, grille acoustique au centre
    const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.11, 32, 96), leather);
    cushion.rotation.y = Math.PI / 2;
    cushion.scale.set(1, 1, 0.9);
    cushion.position.x = -side * 0.32;
    cup.add(cushion);
    const grille = new THREE.Mesh(new THREE.CircleGeometry(0.24, 64), mesh);
    grille.rotation.y = -side * Math.PI / 2;
    grille.position.x = -side * 0.27;
    cup.add(grille);

    cup.scale.y = 1.18;
    cup.position.set(endX + side * 0.06, endY - 0.72, 0);
    cup.userData.side = side;
    root.add(cup);

    if (side === 1) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 16), led);
      dot.position.set(endX + 0.06 - 0.01, endY - 1.08, 0.18);
      root.add(dot);
      root.userData.led = led;
    }
  }

  root.position.y = 0.05;
  return root;
}

/** Monte le casque 3D dans un conteneur. Renvoie { setMode } ; leve une erreur sans WebGL. */
export function mountHeadphones(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0.15, 4.4);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 3, 3);
  scene.add(key);
  // Lumiere de contour : detache la silhouette du fond, surtout en mode sombre
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0);
  rim.position.set(-2.5, 1.5, -3);
  scene.add(rim);
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const tone = () => {
    rim.intensity = dark.matches ? 3.2 : 1.2;
    scene.environmentIntensity = dark.matches ? 1.35 : 1;
  };
  dark.addEventListener('change', tone);
  tone();

  const model = buildHeadphones();
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  // Ombre de contact douce, peinte une fois sur un canevas
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.02;
  scene.add(shadow);

  // Rotation au doigt avec elan, puis retour doux vers la pose de trois quarts
  const rest = -0.45;
  let yaw = rest;
  let vel = 0;
  let pitch = 0.08;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let idle = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastT = performance.now();
    vel = 0;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) {
      return;
    }
    const now = performance.now();
    const dx = (e.clientX - lastX) / el.clientWidth * Math.PI * 1.4;
    yaw += dx;
    vel = dx / Math.max(1, now - lastT) * 16;
    lastX = e.clientX;
    lastT = now;
    idle = 0;
  });
  const up = () => { dragging = false; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) {
      return;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(container);

  let pulse = 0;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (visible) {
      if (!dragging) {
        yaw += vel;
        vel *= Math.pow(0.04, dt);
        idle += dt;
        if (idle > 1.6 && Math.abs(vel) < 0.002) {
          yaw += (rest - yaw) * (1 - Math.pow(0.12, dt));
        }
      }
      const t = now / 1000;
      const float = reduceMotion.matches ? 0 : Math.sin(t * 1.1) * 0.025;
      pivot.rotation.set(pitch + float * 0.6, yaw, 0);
      model.position.y = 0.05 + float;
      shadow.material.opacity = 1 - float * 4;
      pulse = Math.max(0, pulse - dt * 1.6);
      model.userData.led.emissiveIntensity = 1.6 + pulse * 3;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return {
    setMode(mode) {
      const color = LED[mode] ?? LED[0];
      model.userData.led.color.setHex(color);
      model.userData.led.emissive.setHex(color);
      pulse = 1;
      if (!dragging && !reduceMotion.matches) {
        vel += 0.06;
        idle = 0;
      }
    },
  };
}
