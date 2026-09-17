import * as THREE from 'three';

export function concreteTexture(tileSizeM = 1.2) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a7ada8';
  ctx.fillRect(0, 0, 512, 512);
  let seed = 37;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.065)' : 'rgba(50,57,55,0.045)';
    ctx.fillRect(random() * 512, random() * 512, 1 + random() * 3, 1 + random() * 3);
  }
  ctx.strokeStyle = 'rgba(70,80,78,0.06)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / tileSizeM, 1 / tileSizeM);
  texture.anisotropy = 8;
  return texture;
}

export function moduleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#889394';
  ctx.fillRect(0, 0, 384, 768);
  // Representative 144 half-cell appearance; electrical properties come from equipment.
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 6; col++) {
      const x = col * 64 + 1, y = row * 32 + 1;
      ctx.fillStyle = (row + col) % 3 === 0 ? '#102a38' : '#122e3e';
      ctx.fillRect(x, y, 62, 30);
      ctx.strokeStyle = 'rgba(167,185,193,0.38)';
      ctx.lineWidth = 0.6;
      for (let bus = 1; bus < 7; bus++) {
        ctx.beginPath(); ctx.moveTo(x + bus * 9, y); ctx.lineTo(x + bus * 9, y + 30); ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function disposeSceneObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
      materials.add(material);
      Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
    });
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  textures.forEach(t => t.dispose());
}
