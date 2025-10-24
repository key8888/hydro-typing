import * as THREE from 'three';

const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b1020');

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(6, 5, 8);
camera.lookAt(0, 0, 0);

const light1 = new THREE.DirectionalLight(0xffffff, 1.0);
light1.position.set(2, 6, 4);
scene.add(light1, new THREE.AmbientLight(0xffffff, 0.3));

// 地面＆グリッド
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: '#0e1428', metalness: 0.1, roughness: 0.9 })
);
plane.rotation.x = -Math.PI/2;
scene.add(plane);

const grid = new THREE.GridHelper(20, 20, 0x3a5677, 0x1f2e44);
grid.material.opacity = 0.35;
grid.material.transparent = true;
scene.add(grid);

// 壁（シンプルにバウンディングだけ）
const bounds = { minX: -9.5, maxX: 9.5, minZ: -9.5, maxZ: 9.5 };

// ボール
const ballGeo = new THREE.SphereGeometry(0.35, 32, 16);
const ballMat = new THREE.MeshStandardMaterial({ color: '#00d4ff', metalness: 0.2, roughness: 0.3 });
const ball = new THREE.Mesh(ballGeo, ballMat);
ball.position.set(-7, 0.35, -7);
scene.add(ball);

// ゴール
const goalR = 0.6;
const goalGeo = new THREE.CylinderGeometry(goalR, goalR, 0.05, 32);
const goalMat = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#553300', emissiveIntensity: 0.3 });
const goal = new THREE.Mesh(goalGeo, goalMat);
goal.position.set(7, 0.03, 7);
scene.add(goal);

// リサイズ
function resize() {
  const holder = canvas.parentElement;
  const w = holder.clientWidth;
  const h = holder.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

// ========= ゲーム状態 =========
let vel = new THREE.Vector2(0, 0); // XZ 平面（x,z）
let speed = 2.0;                    // ユーザー設定速度
let dir   = new THREE.Vector2(1, 0);// ユーザー設定方向
let running = false;
let time = 0;
let onTickUser = null;

// HUD 通知（テンプレの runtime が購読）
function updateHudLabel(state='Ready') { window.__cg.onHud?.(time, state); }

// API: 方向指定
function setDirection(dOrVec) {
  if (typeof dOrVec === 'number') {
    // deg: 0°= +X 方向、反時計回り
    const rad = dOrVec * Math.PI / 180;
    dir.set(Math.cos(rad), Math.sin(rad));
  } else if (dOrVec && typeof dOrVec.x === 'number' && typeof dOrVec.z === 'number') {
    dir.set(dOrVec.x, dOrVec.z);
    if (dir.lengthSq() === 0) dir.set(1,0);
  } else {
    throw new Error('setDirection: number(deg) or {x,z} expected');
  }
  dir.normalize();
}

// API: 速度
function setSpeed(s) {
  if (typeof s !== 'number' || !isFinite(s) || s <= 0) throw new Error('setSpeed: positive number expected');
  speed = s;
}

// API: 毎フレームフック
function onTick(fn) { onTickUser = (typeof fn === 'function') ? fn : null; }

// API: ゲーム開始（状態リセット）
function startGame() {
  time = 0;
  running = true;
  // 初期位置は固定、必要なら API 追加でカスタム化可能
  ball.position.set(-7, 0.35, -7);
  // 速度ベクトルを決定
  vel.copy(dir).multiplyScalar(speed);
  updateHudLabel('Running');
}

// ゲームロジック
function physics(dt) {
  if (!running) return;

  // 位置更新（XZ）
  ball.position.x += vel.x * dt;
  ball.position.z += vel.y * dt;

  // 壁で反射
  if (ball.position.x < bounds.minX) { ball.position.x = bounds.minX; vel.x *= -1; }
  if (ball.position.x > bounds.maxX) { ball.position.x = bounds.maxX; vel.x *= -1; }
  if (ball.position.z < bounds.minZ) { ball.position.z = bounds.minZ; vel.y *= -1; }
  if (ball.position.z > bounds.maxZ) { ball.position.z = bounds.maxZ; vel.y *= -1; }

  // ゴール判定（XZ 距離）
  const dx = ball.position.x - goal.position.x;
  const dz = ball.position.z - goal.position.z;
  if (dx*dx + dz*dz <= (goalR*goalR)) {
    running = false;
    updateHudLabel('Goal!');
  }
}

// ループ
const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta(); // 秒
  if (running) {
    time += dt;
    updateHudLabel('Running');
  }
  physics(dt);
  if (onTickUser) {
    try { onTickUser(dt); } catch(e) { /* ユーザーエラーは握りつぶす */ }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// 共有 API
const api = {
  setDirection,
  setSpeed,
  startGame,
  onTick
};

// グローバル（テンプレ runtime から拾う）
window.__cg = {
  api,
  onHud: null  // runtime 側が代入する（timeと状態を表示）
};
