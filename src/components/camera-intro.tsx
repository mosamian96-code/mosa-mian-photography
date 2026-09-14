"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { usePrefersReducedMotion } from "@/lib/motion";

type Phase = "idle" | "entering" | "fading" | "done";

const EASE = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic, matches --ease-settle's decelerate feel

/** Full-screen landing overlay: a procedurally-built modern mirrorless camera --
 * original geometry only, no logos or brand-specific colors (a real product's design
 * is trademarked/trade-dress territory; this uses only generic camera-anatomy
 * conventions shared across the whole category: a grip, a mode dial, a ridged lens,
 * an EVF hump) -- idles in front of a black ground under real environment lighting so
 * the glass and metal actually read as glass and metal. Clicking the shutter orbits
 * the view around the body (a true cylindrical sweep, not a straight dolly through
 * it) to the back screen, which shows the same hero photo as the real homepage so the
 * screen "lighting up" reads as the actual site coming into view, then hands off to
 * the real homepage already rendered underneath. Skipped outright under
 * prefers-reduced-motion, same rule as the cursor ring and magnetic button. */
export function CameraIntro({ heroUrl }: { heroUrl: string | null }) {
  const reduced = usePrefersReducedMotion();
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const skippedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (reduced) return;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const FOV_DEG = 34;
    const camera = new THREE.PerspectiveCamera(FOV_DEG, window.innerWidth / window.innerHeight, 0.1, 100);

    // Distance is derived from the viewport's aspect ratio, not a fixed constant --
    // a narrow phone-portrait screen has a much tighter horizontal FOV than a
    // desktop's wide screen at the same vertical FOV, so a distance tuned for
    // desktop let the model overflow the sides on mobile. Backing off further
    // whenever the narrower axis is the limiting one keeps the whole model in frame
    // on any aspect ratio.
    function idleDistance() {
      const aspect = window.innerWidth / window.innerHeight;
      const vFov = (FOV_DEG * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      const limitingFov = Math.min(vFov, hFov);
      const objectRadius = 1.55; // roughly half the model's widest extent (body + lens)
      return (objectRadius / Math.tan(limitingFov / 2)) * 1.55;
    }

    const idleCamPos = new THREE.Vector3(0, 1.4, idleDistance());
    camera.position.copy(idleCamPos);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // Real environment reflections, not just directional lights -- this is what
    // makes metal read as metal and glass read as glass instead of flat matte color.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 1.3);
    rim.position.set(-4, 2, -4);
    scene.add(rim);
    const shutterGlow = new THREE.PointLight(0xffd9a0, 1, 2.5);

    const body = new THREE.MeshPhysicalMaterial({ color: 0x19191b, metalness: 0.4, roughness: 0.55, clearcoat: 0.3 });
    const grip = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, metalness: 0.05, roughness: 0.92 });
    const trim = new THREE.MeshPhysicalMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3, clearcoat: 0.5 });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xd7231f, metalness: 0.15, roughness: 0.35, clearcoat: 0.7 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0d1a2e,
      metalness: 0,
      roughness: 0.015,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 3.2,
      reflectivity: 1,
    });

    const camGroup = new THREE.Group();
    scene.add(camGroup);

    // -- Body: a flat modern mirrorless silhouette (no pentaprism hump, a shallow EVF
    // bump instead) with a grip bulge on the right, and a two-tone split -- silver top
    // and bottom decks over a black leatherette-textured main panel -- the retro
    // styling cue this was asked for, built from scratch rather than traced from any
    // one product. --
    const bodyMesh = new THREE.Mesh(roundedBox(2.0, 1.35, 0.82, 0.12), body);
    camGroup.add(bodyMesh);
    const topPlate = new THREE.Mesh(roundedBox(2.02, 0.12, 0.84, 0.04), trim);
    topPlate.position.y = 0.615;
    camGroup.add(topPlate);
    const bottomPlate = new THREE.Mesh(roundedBox(2.02, 0.1, 0.84, 0.04), trim);
    bottomPlate.position.y = -0.625;
    camGroup.add(bottomPlate);

    const evfHump = new THREE.Mesh(roundedBox(0.55, 0.2, 0.55, 0.06), trim);
    evfHump.position.set(-0.35, 0.775, -0.02);
    camGroup.add(evfHump);
    const hotShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.3), trim);
    hotShoe.position.set(-0.35, 0.94, -0.02);
    camGroup.add(hotShoe);
    const eyepiece = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.1), trim);
    eyepiece.position.set(-0.35, 0.76, -0.32);
    camGroup.add(eyepiece);

    // Small AF-assist lamp beside the mount and an unlabeled focus-mode-style toggle
    // on the grip's front face -- generic control-layout details, no engraved text.
    const afLamp = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xfff2cf, emissive: 0xffcf7a, emissiveIntensity: 0.5, roughness: 0.3 }),
    );
    afLamp.position.set(-0.58, 0.18, 0.411);
    camGroup.add(afLamp);

    const switchBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), trim);
    switchBase.rotation.x = Math.PI / 2;
    switchBase.position.set(0.9, 0.05, 0.34);
    camGroup.add(switchBase);
    const switchLever = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.035), body);
    switchLever.position.set(0.9, 0.05, 0.36);
    switchLever.rotation.z = 0.35;
    camGroup.add(switchLever);

    for (const side of [1, -1]) {
      const lug = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 20), trim);
      lug.rotation.y = Math.PI / 2;
      lug.position.set(side * 1.02, 0.45, 0.2);
      camGroup.add(lug);
    }

    // -- Lens: mount ring, ridged aperture collar, barrel, ridged focus collar, front
    // trim, and the glass last, with a real air gap so it never z-fights, and real
    // material response so it actually looks like glass under the env lighting. --
    const lensMount = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 48), trim);
    lensMount.rotation.x = Math.PI / 2;
    lensMount.position.set(0, -0.05, 0.42);
    camGroup.add(lensMount);

    const apertureBase = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.39, 0.14, 48), body);
    apertureBase.rotation.x = Math.PI / 2;
    apertureBase.position.set(0, -0.05, 0.52);
    camGroup.add(apertureBase);
    addRidgeCollar(camGroup, trim, 0.37, 0.12, apertureBase.position, 40, "z");

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.32, 48), body);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.05, 0.74);
    camGroup.add(barrel);

    const focusBase = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.22, 48), grip);
    focusBase.rotation.x = Math.PI / 2;
    focusBase.position.set(0, -0.05, 0.98);
    camGroup.add(focusBase);
    addRidgeCollar(camGroup, body, 0.345, 0.2, focusBase.position, 44, "z");

    // Distance-scale band: a thin raised ring with small index ticks, sitting between
    // the aperture and focus rings -- every real lens has one; ours just carries no
    // engraved numbers.
    const scaleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.348, 0.348, 0.05, 48), body);
    scaleBase.rotation.x = Math.PI / 2;
    scaleBase.position.set(0, -0.05, 0.885);
    camGroup.add(scaleBase);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.022, 0.01), trim);
      tick.position.set(Math.sin(a) * 0.35, -0.05 + Math.cos(a) * 0.35, 0.885);
      tick.rotation.z = a;
      camGroup.add(tick);
    }

    // Filter thread: fine, dense grooves right at the front rim -- denser and
    // shallower than the grip ridges elsewhere, reading as a screw thread rather than
    // a hand-grip surface.
    const lensTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.33, 0.06, 48), trim);
    lensTrim.rotation.x = Math.PI / 2;
    lensTrim.position.set(0, -0.05, 1.12);
    camGroup.add(lensTrim);
    addRidgeCollar(camGroup, body, 0.305, 0.05, lensTrim.position, 72, "z");

    const lensGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 48), glass);
    lensGlass.rotation.x = Math.PI / 2;
    lensGlass.position.set(0, -0.05, 1.17);
    camGroup.add(lensGlass);

    // A dedicated catch-light -- environment reflections alone can be subtle enough
    // to still read as "flat black" depending on framing, so this guarantees a real
    // glint on the front element the way every lens product shot has one.
    const catchLight = new THREE.PointLight(0xffffff, 1.4, 1.6);
    catchLight.position.set(-0.15, 0.12, 1.55);
    camGroup.add(catchLight);

    // -- Top deck: a two-dial cluster (a small one, exposure-comp style, and a bigger
    // one, shutter-speed style -- both ridged, neither labeled) and a clearly
    // separate, raised shutter button on the grip -- the one thing that has to read
    // as "click here." --
    // Dark top face, silver ridge edge -- same material as the plate they sit on
    // made them visually merge into it under this lighting; the contrast is what
    // actually reads as "a dial," not the geometry alone.
    // Pulled forward to the top plate's front edge, where a classic dial cluster
    // actually sits -- that puts real side-surface facing the idle camera instead of
    // only a foreshortened top face, so they read without needing a steep top-down
    // angle.
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 32), grip);
    dial.position.set(0.5, 0.68, 0.24);
    camGroup.add(dial);
    addRidgeCollar(camGroup, trim, 0.16, 0.09, dial.position, 22, "y");

    const dialSmall = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 28), grip);
    dialSmall.position.set(0.14, 0.675, 0.22);
    camGroup.add(dialSmall);
    addRidgeCollar(camGroup, trim, 0.1, 0.07, dialSmall.position, 18, "y");

    // Sits on the top plate directly above the (now much shorter) grip, tilted
    // forward a little so its face actually catches the idle camera's angle instead
    // of showing edge-on, and sized/colored (bright red -- a generic record/shutter
    // convention, not tied to any one camera brand) so it can't be missed.
    // Plain flat-top cylinder, no tilt -- the earlier tilt attempt was what caused
    // the wrong face to show ("inside out"); sitting it upright avoids that entirely.
    const shutterBase = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.09, 28), trim);
    shutterBase.position.set(0.72, 0.66, 0.26);
    camGroup.add(shutterBase);
    const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 28), accent);
    shutter.position.set(0.72, 0.735, 0.26);
    camGroup.add(shutter);
    shutterGlow.color.setHex(0xff3b30);
    shutterGlow.position.set(0.72, 0.95, 0.26);
    camGroup.add(shutterGlow);
    // Generous invisible hit target around the small visible shutter cap -- forgiving
    // for an imprecise tap on a tiny 3D button rendered at real-world screen scale.
    const shutterHit = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    shutterHit.position.copy(shutter.position);
    camGroup.add(shutterHit);

    // -- Back panel: the screen, centered on the body's own axis so the reveal
    // orbit's end pose lines up without needing an off-center target. --
    for (const side of [1, -1]) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), trim);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(side * 0.75, 0.15, -0.42);
      camGroup.add(btn);
    }

    const screenBezel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.04), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.6 }));
    screenBezel.position.set(0, -0.05, -0.425);
    camGroup.add(screenBezel);

    const screenTex = heroUrl ? new THREE.TextureLoader().load(heroUrl) : null;
    if (screenTex) screenTex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      map: screenTex,
      emissive: 0xffffff,
      emissiveMap: screenTex,
      emissiveIntensity: 0.15,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.92), screenMat);
    screen.position.set(0, -0.05, -0.44);
    screen.rotation.y = Math.PI;
    camGroup.add(screen);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Reveal path: a true orbit (cylindrical sweep from front to back), not a
    // straight-line dolly -- lerping position directly would cut through the body
    // instead of swinging around it.
    const startRadius = idleCamPos.z;
    const startY = idleCamPos.y;
    const endRadius = 1.3;
    const endY = -0.05;
    const startTarget = new THREE.Vector3(0, 0, 0);
    const endTarget = new THREE.Vector3(0, -0.05, -0.44);

    let raf = 0;
    let enterStart = 0;
    let enterStarted = false;
    const ENTER_MS = 1900;

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      idleCamPos.z = idleDistance();
    }
    window.addEventListener("resize", onResize);

    function updateLabel() {
      if (!labelRef.current) return;
      const p = shutter.getWorldPosition(new THREE.Vector3()).project(camera);
      const x = (p.x * 0.5 + 0.5) * window.innerWidth;
      const y = (1 - (p.y * 0.5 + 0.5)) * window.innerHeight;
      // Clamped to the viewport -- on a narrow phone screen the shutter can sit close
      // enough to the right edge that the label's own width (measured, not guessed)
      // would otherwise run off-screen.
      const labelWidth = labelRef.current.offsetWidth || 180;
      const clampedX = Math.min(x + 22, window.innerWidth - labelWidth - 12);
      labelRef.current.style.transform = `translate(${clampedX}px, ${y - 14}px)`;
    }

    function onPointerDown(e: PointerEvent) {
      if (phaseRef.current !== "idle" || skippedRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(shutterHit, false);
      if (hit.length > 0) {
        enterStarted = false;
        setPhase("entering");
      }
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const phaseNow = phaseRef.current;

      if (phaseNow === "idle") {
        camGroup.rotation.y = Math.sin(now * 0.00025) * 0.32;
        camera.position.lerp(idleCamPos, 0.02);
        camera.lookAt(startTarget);
        updateLabel();
      } else if (phaseNow === "entering" || phaseNow === "fading") {
        // Started lazily on the first tick that actually sees "entering," rather than
        // at click time -- phaseRef only flips after React commits the state update,
        // which can lag a click by a frame or more (worse under dev-mode/HMR
        // overhead), so stamping the clock at click time let the elapsed-time
        // fraction already be >=1 by the first real "entering" tick, making the
        // whole orbit appear to complete instantly instead of over ENTER_MS.
        if (!enterStarted) {
          enterStart = now;
          enterStarted = true;
        }
        const t = Math.min(1, (now - enterStart) / ENTER_MS);
        const e = EASE(t);
        camGroup.rotation.y *= 1 - e;

        const theta = e * Math.PI;
        const radius = THREE.MathUtils.lerp(startRadius, endRadius, e);
        camera.position.set(radius * Math.sin(theta), THREE.MathUtils.lerp(startY, endY, e), radius * Math.cos(theta));
        const lookAt = new THREE.Vector3().lerpVectors(startTarget, endTarget, e);
        camera.lookAt(lookAt);
        screenMat.emissiveIntensity = 0.15 + e * 2.2;
        shutterGlow.intensity = 1 * (1 - e * 0.6);

        if (t >= 1 && phaseNow === "entering") setPhase("fading");
      }

      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      pmrem.dispose();
      renderer.dispose();
      screenTex?.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      mount.removeChild(renderer.domElement);
    };
  }, [reduced, heroUrl]);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => setPhase("done"), 420);
    return () => clearTimeout(timer);
  }, [phase]);

  if (reduced || phase === "done") return null;

  function skip() {
    skippedRef.current = true;
    setPhase("fading");
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black transition-opacity duration-300 ease-out"
      style={{ opacity: phase === "fading" ? 0 : 1 }}
      aria-hidden={phase !== "idle"}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 55% 50% at 50% 55%, rgba(120,140,190,0.28), rgba(120,140,190,0) 70%)",
        }}
      />
      <div ref={mountRef} className="h-full w-full" />

      {phase === "idle" ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-10 px-4 text-center sm:top-16">
            <h1
              className="text-4xl text-white sm:text-6xl"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
            >
              Mosa Mian Photography
            </h1>
          </div>

          <div ref={labelRef} className="pointer-events-none absolute left-0 top-0 flex items-center gap-2">
            <svg width="16" height="12" viewBox="0 0 16 12" className="shrink-0 -scale-x-100 text-white">
              <path d="M15 6H1M7 1 1 6l6 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="whitespace-nowrap rounded bg-black/50 px-2 py-1 text-xs font-medium uppercase tracking-[0.15em] text-white backdrop-blur-sm">
              Click to enter
            </span>
          </div>

          <button
            type="button"
            onClick={skip}
            className="absolute bottom-6 right-6 text-xs uppercase tracking-widest text-white/50 transition-colors hover:text-white"
          >
            Skip
          </button>
        </>
      ) : null}
    </div>
  );
}

/** A ring of small raised teeth around a cylindrical surface -- reused for the top
 * dial (axis "y", teeth spread in the XZ plane) and the lens collars (axis "z", teeth
 * spread in the XY plane, running along the barrel). */
function addRidgeCollar(
  parent: THREE.Group,
  material: THREE.Material,
  radius: number,
  height: number,
  center: THREE.Vector3,
  count: number,
  axis: "y" | "z",
) {
  const tooth =
    axis === "y" ? new THREE.BoxGeometry(0.022, height * 0.9, 0.04) : new THREE.BoxGeometry(0.04, 0.022, height * 0.9);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const mesh = new THREE.Mesh(tooth, material);
    if (axis === "y") {
      mesh.position.set(center.x + Math.sin(a) * radius, center.y, center.z + Math.cos(a) * radius);
      mesh.rotation.y = a;
    } else {
      mesh.position.set(center.x + Math.sin(a) * radius, center.y + Math.cos(a) * radius, center.z);
      mesh.rotation.z = a;
    }
    parent.add(mesh);
  }
}

/** A box with its 12 edges chamfered -- three.js has no built-in rounded-box
 * primitive, and a plain BoxGeometry reads as a cardboard prop under studio lighting;
 * this is the one thing separating "placeholder cube" from "product render." */
function roundedBox(width: number, height: number, depth: number, radius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = width / 2 - radius;
  const h = height / 2 - radius;
  shape.moveTo(-w, -h - radius);
  shape.lineTo(w, -h - radius);
  shape.quadraticCurveTo(w + radius, -h - radius, w + radius, -h);
  shape.lineTo(w + radius, h);
  shape.quadraticCurveTo(w + radius, h + radius, w, h + radius);
  shape.lineTo(-w, h + radius);
  shape.quadraticCurveTo(-w - radius, h + radius, -w - radius, h);
  shape.lineTo(-w - radius, -h);
  shape.quadraticCurveTo(-w - radius, -h - radius, -w, -h - radius);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelThickness: radius,
    bevelSize: radius,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geometry.center();
  return geometry;
}
