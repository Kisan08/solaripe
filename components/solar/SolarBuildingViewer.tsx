"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * SolarBuildingViewer
 * ---------------------------------------------------------------------------
 * Reusable 3D building + rooftop solar visualizer for Solaripe / Wattflow.
 *
 * Feed it:
 *  - a roof footprint polygon (in meters, local coordinates)
 *  - a roof pitch (degrees)
 *  - a target panel count (or it derives one from kWp)
 *  - optional building height + satellite texture URL
 *
 * It renders the same clean, stylized look validated in the prototype:
 * flat-shaded building, gable roof, dark panel array, soft shadow.
 *
 * Drop this into Next.js as a client component:
 *   <SolarBuildingViewer roofPolygon={points} pitchDeg={12} kWp={10.5} />
 * ---------------------------------------------------------------------------
 */

export interface RoofPoint {
  x: number; // meters, local coordinate space (same space as the 2D designer)
  z: number;
}

export interface SolarBuildingViewerProps {
  /** Footprint polygon of the roof, in meters. Reuse the same points the 2D designer stores. */
  roofPolygon: RoofPoint[];
  /** Roof pitch in degrees (0 = flat). */
  pitchDeg?: number;
  /** Target system size in kWp — used to derive panel count if panelCount isn't given. */
  kWp?: number;
  /** Explicit panel count, overrides kWp-derived count if provided. */
  panelCount?: number;
  /** Wattage per panel, used only for the kWp -> panel count estimate. Default 580. */
  panelWattage?: number;
  /** Wall height in meters. Default 4. */
  buildingHeight?: number;
  /** Optional satellite/ground image URL to drape under the building. */
  groundTextureUrl?: string;
  /** Real-world width/height in meters that groundTextureUrl covers (required if groundTextureUrl is set). */
  groundTextureSizeMeters?: { width: number; height: number };
  /** Called once with a PNG data URL snapshot, e.g. to drop into a ReportLab/PDF quotation as the hero image. */
  onSnapshot?: (dataUrl: string) => void;
  className?: string;
}

// ---- geometry helpers -------------------------------------------------------

function polygonBounds(points: RoofPoint[]) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function panelCountFromKWp(kWp: number, panelWattage: number) {
  return Math.max(1, Math.ceil((kWp * 1000) / panelWattage));
}

// Lay out `count` panels in a grid that fits inside the roof footprint,
// mirroring the polygon-clip auto-fill logic from the 2D designer (simplified
// to a bounding-box grid here — swap in the real clipping fill for production).
function layoutPanelGrid(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  count: number,
  panelW = 1.0,
  panelH = 1.6,
  gap = 0.08
) {
  const availW = bounds.maxX - bounds.minX - 1.2; // margin from eaves
  const availH = bounds.maxZ - bounds.minZ - 1.2;
  const cols = Math.max(1, Math.floor((availW + gap) / (panelW + gap)));
  const rows = Math.max(1, Math.ceil(count / cols));

  const totalW = cols * (panelW + gap) - gap;
  const totalH = Math.min(rows, Math.ceil(availH / (panelH + gap))) * (panelH + gap) - gap;
  const startX = -totalW / 2 + panelW / 2;
  const startZ = -totalH / 2 + panelH / 2;

  const positions: { x: number; z: number }[] = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < count; r++) {
    for (let c = 0; c < cols && placed < count; c++) {
      positions.push({
        x: startX + c * (panelW + gap),
        z: startZ + r * (panelH + gap),
      });
      placed++;
    }
  }
  return { positions, panelW, panelH };
}

// ---- component ---------------------------------------------------------------

export default function SolarBuildingViewer({
  roofPolygon,
  pitchDeg = 12,
  kWp,
  panelCount,
  panelWattage = 580,
  buildingHeight = 4,
  groundTextureUrl,
  groundTextureSizeMeters,
  onSnapshot,
  className,
}: SolarBuildingViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || roofPolygon.length < 3) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const bounds = polygonBounds(roofPolygon);
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;

    // ground plane, optionally satellite-textured
    const groundSize = Math.max(spanX, spanZ) * 4;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x9db97a, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    if (groundTextureUrl && groundTextureSizeMeters) {
      new THREE.TextureLoader().load(groundTextureUrl, (tex) => {
        const geo = new THREE.PlaneGeometry(
          groundTextureSizeMeters.width,
          groundTextureSizeMeters.height
        );
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        const patch = new THREE.Mesh(geo, mat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.y = 0.01; // avoid z-fighting with base ground
        patch.receiveShadow = true;
        scene.add(patch);
      });
    }

    // building walls: extrude the actual roof polygon footprint
    // Note: Vector2 y is negated here so that after the rotation below,
    // the footprint's Z axis comes out the right way round (not mirrored).
    const shape = new THREE.Shape(
      roofPolygon.map((p) => new THREE.Vector2(p.x - centerX, -(p.z - centerZ)))
    );
    const wallGeo = new THREE.ExtrudeGeometry(shape, {
      depth: buildingHeight,
      bevelEnabled: false,
    });
    // extrude runs along +Z by default (0 -> depth); rotate -90 about X so that
    // axis becomes +Y (0 -> buildingHeight), i.e. standing upward, not downward.
    wallGeo.rotateX(-Math.PI / 2);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.85 });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls);

    // roof: two pitched planes over the same footprint (gable along Z)
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const rise = (spanZ / 2) * Math.tan(pitchRad);
    const slopeLen = spanZ / 2 / Math.cos(pitchRad);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b5645, roughness: 0.9 });
    const overhang = 0.6;

    const roofGeo = new THREE.BoxGeometry(spanX + overhang * 2, 0.15, slopeLen);
    const slopeFront = new THREE.Mesh(roofGeo, roofMat);
    slopeFront.position.set(0, buildingHeight + rise / 2, -spanZ / 4 - 0.15);
    slopeFront.rotation.x = pitchRad;
    slopeFront.castShadow = true;
    slopeFront.receiveShadow = true;
    scene.add(slopeFront);

    const slopeBack = new THREE.Mesh(roofGeo, roofMat);
    slopeBack.position.set(0, buildingHeight + rise / 2, spanZ / 4 + 0.15);
    slopeBack.rotation.x = -pitchRad;
    slopeBack.castShadow = true;
    slopeBack.receiveShadow = true;
    scene.add(slopeBack);

    // panels on the south-facing slope (slopeBack, tilted toward +Z)
    const resolvedCount =
      panelCount ?? (kWp ? panelCountFromKWp(kWp, panelWattage) : 12);
    const { positions, panelW, panelH } = layoutPanelGrid(
      { minX: -spanX / 2, maxX: spanX / 2, minZ: -spanZ / 2, maxZ: spanZ / 2 },
      resolvedCount
    );

    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a44,
      roughness: 0.35,
      metalness: 0.4,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.5,
      metalness: 0.6,
    });

    positions.forEach(({ x, z }) => {
      // project the flat grid position onto the pitched roof plane
      const localZ = spanZ / 4 + 0.2 + z * Math.cos(pitchRad);
      const localY = buildingHeight + rise / 2 + z * Math.sin(pitchRad) + 0.1;

      const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.04, panelH), panelMat);
      panel.position.set(x, localY, localZ);
      panel.rotation.x = -pitchRad;
      panel.castShadow = true;
      scene.add(panel);

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(panelW + 0.03, 0.02, panelH + 0.03),
        frameMat
      );
      frame.position.copy(panel.position);
      frame.position.y -= 0.03;
      frame.rotation.x = -pitchRad;
      scene.add(frame);
    });

    // lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
    sun.position.set(14, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowSpan = Math.max(spanX, spanZ) * 1.5;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    scene.add(sun);
    scene.add(sun.target);

    // camera + simple orbit controls
    const maxSpan = Math.max(spanX, spanZ);
    let camDist = maxSpan * 2.2 + 6;
    let camAngleY = 0.9;
    let camAngleX = 0.5;

    function updateCamera() {
      camera.position.x = Math.sin(camAngleY) * Math.cos(camAngleX) * camDist;
      camera.position.z = Math.cos(camAngleY) * Math.cos(camAngleX) * camDist;
      camera.position.y = Math.sin(camAngleX) * camDist + buildingHeight / 2;
      camera.lookAt(0, buildingHeight / 2, 0);
    }
    updateCamera();

    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    const dom = renderer.domElement;
    dom.style.cursor = "grab";

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      dom.style.cursor = "grabbing";
    };
    const onPointerUp = () => {
      isDragging = false;
      dom.style.cursor = "grab";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      camAngleY -= dx * 0.006;
      camAngleX = Math.max(0.1, Math.min(1.3, camAngleX + dy * 0.006));
      prevX = e.clientX;
      prevY = e.clientY;
      updateCamera();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camDist = Math.max(maxSpan, Math.min(maxSpan * 6, camDist + e.deltaY * 0.02));
      updateCamera();
    };
    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };

    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);

    let frameId: number;
    let snapshotTaken = false;
    function animate() {
      frameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
      if (!snapshotTaken && onSnapshot) {
        snapshotTaken = true;
        onSnapshot(dom.toDataURL("image/png"));
      }
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      host.removeChild(dom);
    };
  }, [
    roofPolygon,
    pitchDeg,
    kWp,
    panelCount,
    panelWattage,
    buildingHeight,
    groundTextureUrl,
    groundTextureSizeMeters,
    onSnapshot,
  ]);

  return <div ref={hostRef} className={className} style={{ width: "100%", height: "100%" }} />;
}

/**
 * Example usage in a Next.js page/component:
 *
 * <div style={{ width: "100%", height: 420 }}>
 *   <SolarBuildingViewer
 *     roofPolygon={[
 *       { x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }, { x: -5, z: 4 },
 *     ]}
 *     pitchDeg={12}
 *     kWp={10.5}
 *     onSnapshot={(dataUrl) => saveHeroImageForQuotationPdf(dataUrl)}
 *   />
 * </div>
 */
