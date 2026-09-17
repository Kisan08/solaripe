import * as THREE from 'three';

export interface ShadingSurface { id: string; mesh: THREE.Mesh; width: number; depth: number }
export interface ShadingObstacle { mesh: THREE.Mesh; owner?: string }

export async function sampleShading(surfaces: ShadingSurface[], obstacles: ShadingObstacle[], directions: THREE.Vector3[], signal: AbortSignal, progress: (value: number) => void) {
  const bounds = obstacles.map(o => ({ ...o, box: new THREE.Box3().setFromObject(o.mesh) }));
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0.001;
  raycaster.far = Infinity;
  const results: Record<string, number> = {};
  const unlit: string[] = [];
  let lastYield = performance.now();
  for (let index = 0; index < surfaces.length; index++) {
    const surface = surfaces[index];
    surface.mesh.geometry.computeBoundingBox();
    const surfaceY = (surface.mesh.geometry.boundingBox?.max.y ?? 0) + 0.003;
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(surface.mesh.matrixWorld);
    const sun = directions.filter(d => normal.dot(d) > 0);
    if (!sun.length) { unlit.push(surface.id); continue; }
    let blocked = 0, samples = 0;
    for (const direction of sun) {
      for (const x of [-0.4, 0, 0.4]) for (const z of [-0.4, 0, 0.4]) {
        if (signal.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
        const origin = surface.mesh.localToWorld(new THREE.Vector3(x * surface.width, surfaceY, z * surface.depth));
        raycaster.set(origin, direction);
        const hit = bounds.some(o => o.owner !== surface.id && raycaster.ray.intersectsBox(o.box) && raycaster.intersectObject(o.mesh, false).length > 0);
        samples++; if (hit) blocked++;
        if (performance.now() - lastYield > 8) {
          progress(Math.round(index / surfaces.length * 100));
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          lastYield = performance.now();
        }
      }
    }
    results[surface.id] = blocked / samples;
  }
  if (signal.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
  progress(100);
  return { results, unlit };
}
