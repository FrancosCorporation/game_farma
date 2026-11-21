// Testa as colisões do movimento livre pelo controlador POV real, sem renderer.
import assert from 'node:assert/strict';
import * as THREE from 'three';

const listeners = new Map();
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = {
  pointerLockElement: null,
  addEventListener: (name, listener) => listeners.set(name, listener),
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener() {},
};

const { createPOV } = await import('../src/scene/pov.js');
const camera = new THREE.PerspectiveCamera();
let tick;
const pov = createPOV({
  camera,
  addTicker: (listener) => { tick = listener; },
  canvas: { addEventListener() {} },
  povControl: {},
});

const key = (type, value) => listeners.get(type)({
  key: value,
  target: null,
  preventDefault() {},
});
const step = (frames) => {
  for (let i = 0; i < frames; i++) tick(1 / 60, i / 60);
};

// A gôndola esquerda termina em z≈−0,6. Com folga corporal de 0,25 m,
// caminhar em z=−0,5 deve ser bloqueado até o limite x≈−8,3 do AABB.
key('keydown', 'd');
camera.position.set(-8.4, 1.6, -0.5);
step(60);
key('keyup', 'd');
assert.ok(camera.position.x <= -8.3, `gôndola deve bloquear em z=-0,5 (x=${camera.position.x})`);

// O corredor ao lado da mesma gôndola continua transitável.
key('keydown', 'd');
camera.position.set(-7, 1.6, -0.5);
step(15);
key('keyup', 'd');
assert.ok(camera.position.x > -6.5, `corredor livre deve permitir avanço (x=${camera.position.x})`);

// A frente da vitrine excede o centro geométrico do GLB; o AABB inclui 0,25 m.
key('keydown', 'd');
camera.position.set(7.23, 1.6, -1.5);
step(15);
key('keyup', 'd');
assert.ok(camera.position.x < 7.65, `vitrine deve bloquear antes do vidro (x=${camera.position.x})`);

// A CPU fica no piso, fora da projeção do balcão, e precisa do próprio AABB.
key('keydown', 'w');
camera.position.set(-1.55, 1.6, 3.2);
step(30);
key('keyup', 'w');
assert.ok(camera.position.z >= 2.75, `CPU deve bloquear a aproximação (z=${camera.position.z})`);

// O balcão bloqueia o avanço frontal, mas deixa a passagem lateral aberta.
key('keydown', 'w');
camera.position.set(0, 1.6, 2.7);
step(60);
key('keyup', 'w');
assert.ok(camera.position.z >= 2.27, `balcão deve bloquear a aproximação (z=${camera.position.z})`);

key('keydown', 'w');
camera.position.set(-3.5, 1.6, 2.7);
step(30);
key('keyup', 'w');
assert.ok(camera.position.z < 1.5, `desvio lateral do balcão deve permanecer livre (z=${camera.position.z})`);

// O AABB adicional da CPU não pode fechar os POVs computador ou mesa.
key('keydown', 'a');
camera.position.set(0, 1.6, 2.7);
step(20);
key('keyup', 'a');
assert.ok(camera.position.x < -0.7, `acesso ao computador continua livre (x=${camera.position.x})`);
key('keydown', 'd');
camera.position.set(0, 1.6, 2.45);
step(50);
key('keyup', 'd');
assert.ok(camera.position.x > 2, `acesso à mesa continua livre (x=${camera.position.x})`);

// Os atendentes ambientais também ocupam espaço no salão. Bounds skinned
// medidos no runtime, com a mesma folga corporal usada nos demais AABBs.
key('keydown', 'd');
camera.position.set(-6.2, 1.6, 1.9);
step(60);
key('keyup', 'd');
assert.ok(camera.position.x <= -5.76, `atendente do balcão deve impedir atravessamento (x=${camera.position.x})`);

// O corredor em frente ao atendente continua livre para circulação.
key('keydown', 'd');
camera.position.set(-6.2, 1.6, 2.5);
step(30);
key('keyup', 'd');
assert.ok(camera.position.x > -5, `passagem ao lado do atendente do balcão permanece livre (x=${camera.position.x})`);

key('keydown', 'a');
camera.position.set(6.2, 1.6, 1.9);
step(60);
key('keyup', 'a');
assert.ok(camera.position.x >= 5.78, `atendente da gôndola deve impedir atravessamento (x=${camera.position.x})`);

// Há passagem frontal ao lado do atendente da gôndola sem cruzar seu footprint.
key('keydown', 'w');
camera.position.set(6.2, 1.6, 3);
step(60);
key('keyup', 'w');
assert.ok(camera.position.z < 1.5, `passagem ao lado do atendente da gôndola permanece livre (z=${camera.position.z})`);

// O direcional móvel usa o mesmo motor e as mesmas colisões do WASD. Saindo
// pela direita do balcão e da mesa lateral, o farmacêutico alcança o salão.
pov.irPara('paciente', { instantaneo: true });
pov.setTouchDirection('d', true);
step(96);
pov.setTouchDirection('d', false);
assert.ok(camera.position.x > 3.92, `direcional deve permitir contornar a mesa lateral (x=${camera.position.x})`);
pov.setTouchDirection('w', true);
step(35);
pov.setTouchDirection('w', false);
assert.ok(camera.position.z < 1.5, `direcional deve sair da frente do balcão para o salão (z=${camera.position.z})`);
const stoppedZ = camera.position.z;
step(12);
assert.equal(camera.position.z, stoppedZ, 'soltar o direcional deve parar a caminhada');

console.log('PASS  colisão cobre a extremidade da gôndola com margem corporal');
console.log('PASS  corredor adjacente à gôndola permanece transitável');
console.log('PASS  vitrine e CPU têm folga de colisão sobre os bounds reais');
console.log('PASS  balcão bloqueia o avanço e mantém passagem lateral');
console.log('PASS  caminhos livres dos POVs computador e mesa permanecem transitáveis');
console.log('PASS  atendentes bloqueiam o atravessamento e preservam corredores laterais');
console.log('PASS  direcional de toque contorna balcão/mesa e para ao soltar');
