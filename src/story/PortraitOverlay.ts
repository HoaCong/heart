import * as THREE from "three";

type PortraitKey = "girl" | "boy" | "couple";

interface PortraitInput {
  texture: THREE.Texture;
  scaleY: number;
}

interface PortraitSet {
  girl: PortraitInput;
  boy: PortraitInput;
  couple: PortraitInput;
}

export class PortraitOverlay {
  private readonly meshes: Record<
    PortraitKey,
    THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  >;

  constructor(scene: THREE.Scene, portraits: PortraitSet) {
    this.meshes = {
      girl: this.createPortraitMesh(
        portraits.girl.texture,
        portraits.girl.scaleY,
      ),
      boy: this.createPortraitMesh(portraits.boy.texture, portraits.boy.scaleY),
      couple: this.createPortraitMesh(
        portraits.couple.texture,
        portraits.couple.scaleY,
      ),
    };

    scene.add(this.meshes.girl, this.meshes.boy, this.meshes.couple);
  }

  setOpacities(girl: number, boy: number, couple: number): void {
    this.setMeshOpacity(this.meshes.girl, girl);
    this.setMeshOpacity(this.meshes.boy, boy);
    this.setMeshOpacity(this.meshes.couple, couple);
  }

  private createPortraitMesh(
    texture: THREE.Texture,
    scaleY: number,
  ): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const img = texture.image as { width: number; height: number };
    const aspect = img.width / img.height;
    const scaleX = scaleY * aspect;

    const geometry = new THREE.PlaneGeometry(scaleX * 2, scaleY * 2);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      alphaTest: 0.06,
      blending: THREE.NormalBlending,
      premultipliedAlpha: false,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, -0.14);
    mesh.visible = false;
    mesh.renderOrder = 0;

    return mesh;
  }

  private setMeshOpacity(
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
    value: number,
  ): void {
    const opacity = Math.min(1, Math.max(0, value));
    mesh.material.opacity = opacity;
    mesh.visible = opacity > 0.001;
  }
}
