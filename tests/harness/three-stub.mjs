/**
 * Тестовая замена three: вся настоящая математика и геометрия,
 * но WebGLRenderer заменён заглушкой (в Node нет WebGL).
 */
import * as T from '../../node_modules/three/build/three.module.js';

export const {
  ACESFilmicToneMapping,
  BackSide,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  TorusGeometry,
  Vector3,
} = T;

export const renderCalls = { count: 0, scenes: [] };

export class WebGLRenderer {
  constructor(params = {}) {
    this.domElement = params.canvas || document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.outputColorSpace = '';
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
    this.capabilities = { isWebGL2: true, getMaxAnisotropy: () => 4 };
    this.info = { render: { calls: 0, triangles: 0 } };
    this._size = { width: 1, height: 1 };
  }
  setPixelRatio() {}
  setSize(w, h) {
    this._size = { width: w, height: h };
  }
  getSize(target) {
    return Object.assign(target || {}, this._size);
  }
  setClearColor() {}
  render(scene) {
    renderCalls.count++;
    if (renderCalls.scenes.length < 5) renderCalls.scenes.push(scene);
  }
  dispose() {}
  compile() {}
}
