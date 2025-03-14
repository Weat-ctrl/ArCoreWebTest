import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.146.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.146.0/examples/jsm/loaders/GLTFLoader.js';
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
import { Hands } from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';

// --- Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// --- Variables ---
let pigeon, mixer, animations;
let hitCount = 0;
const maxHits = 5;
let smokeParticles;

// --- Model Loading ---
function loadPigeon() {
  const loader = new GLTFLoader();
  loader.load('https://Weat-ctrl.github.io/ArCoreWebTest/pigeon.gltf', (gltf) => {
    pigeon = gltf.scene;
    scene.add(pigeon);
    pigeon.scale.set(0.5, 0.5, 0.5);
    pigeon.position.set(0, -1, -2);
    mixer = new THREE.AnimationMixer(pigeon);
    animations = gltf.animations;

    pigeon.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          map: child.material.map,
          color: 0xffffff,
        });
      }
    });

    playAnimation('Flying_Idle');
  });
}

function playAnimation(name) {
  if (!mixer || !animations) return;
  const clip = THREE.AnimationClip.findByName(animations, name);
  if (clip) {
    const action = mixer.clipAction(clip);
    action.reset().play();
  }
}

// --- Particle System ---
function setupParticleSystem() {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  for (let i = 0; i < 20; i++) {
    const x = THREE.MathUtils.randFloatSpread(1);
    const y = THREE.MathUtils.randFloatSpread(1);
    const z = THREE.MathUtils.randFloatSpread(1);
    vertices.push(x, y, z);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.PointsMaterial({ color: 0x00aaff, size: 0.05 });
  smokeParticles = new THREE.Points(geometry, material);
  scene.add(smokeParticles);
  smokeParticles.visible = false;
}

function particleBurst() {
  if (!smokeParticles || !pigeon) return;
  smokeParticles.position.copy(pigeon.position);
  smokeParticles.visible = true;
  setTimeout(() => { smokeParticles.visible = false; }, 500);
}

// --- Camera Setup ---
async function startCamera() {
  const video = document.getElementById('video');
  const cameraObj = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480,
  });
  cameraObj.start();

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });

  hands.onResults(onResults);
}

// --- onResults Function ---
function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    if (isPeaceSign(landmarks)) {
      hitPigeon();
    }
  }
}

// --- Gesture Detection ---
function isPeaceSign(landmarks) {
  return (
    landmarks[8].y < landmarks[7].y &&
    landmarks[12].y < landmarks[11].y &&
    landmarks[16].y > landmarks[13].y &&
    landmarks[20].y > landmarks[17].y
  );
}

// --- Hit Pigeon ---
function hitPigeon() {
  if (hitCount >= maxHits) return;
  hitCount++;
  console.log(`Hit count: ${hitCount}`);
  pigeon.traverse((child) => {
    if(child.isMesh){
      child.material.color.set(0xff0000)
      setTimeout(()=>{child.material.color.set(0xffffff)},200)
    }
  });
  playAnimation('HitReact');
  particleBurst();
  if (hitCount === maxHits) {
    setTimeout(() => {
      playAnimation('Death');
    }, 1000);
  }
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(0.01);
  renderer.render(scene, camera);
}

// --- Initialization ---
loadPigeon();
setupParticleSystem();
startCamera();
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
