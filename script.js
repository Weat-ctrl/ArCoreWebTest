import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.146.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.146.0/examples/jsm/loaders/GLTFLoader.js';
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
import { Hands } from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';

// --- Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

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
let handsWorker;

// --- Model Loading ---
function loadPigeon() {
  const loader = new GLTFLoader();
  loader.load('https://cdn.jsdelivr.net/gh/Weat-ctrl/ArCoreWebTest/Pigeon.gltf', (gltf) => {
    try {
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
    } catch (error) {
      console.error('Error processing Pigeon.gltf:', error);
    }
  }, (xhr) => {
      //progress
  }, (error) => {
      console.error("An error happened loading the pigeon gltf file", error);
  });
}

function playAnimation(name) {
  try {
    if (!mixer || !animations) return;
    const clip = THREE.AnimationClip.findByName(animations, name);
    if (clip) {
      const action = mixer.clipAction(clip);
      action.reset().play();
    }
  } catch (error) {
    console.error('Error playing animation:', error);
  }
}

// --- Particle System ---
function setupParticleSystem() {
  try {
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
  } catch (error) {
    console.error('Error setting up particle system:', error);
  }
}

function particleBurst() {
  try {
    if (!smokeParticles || !pigeon) return;
    smokeParticles.position.copy(pigeon.position);
    smokeParticles.visible = true;
    setTimeout(() => { smokeParticles.visible = false; }, 500);
  } catch (error) {
    console.error('Error creating particle burst:', error);
  }
}

// --- Web Worker ---
function setupHandsWorker() {
  try {
    handsWorker = new Worker('handsWorker.js');
    handsWorker.onmessage = (event) => {
      onResults(event.data);
    };
  } catch (error) {
    console.error('Error setting up hands worker:', error);
  }
}

// --- onResults Function ---
function onResults(results) {
  try {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      if (isPeaceSign(landmarks)) {
        hitPigeon();
      }
    }
  } catch (error) {
    console.error('Error processing hand results:', error);
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
  try {
    if (hitCount >= maxHits) return;
    hitCount++;
    console.log(`Hit count: ${hitCount}`);
    pigeon.traverse((child) => {
      if (child.isMesh) {
        child.material.color.set(0xff0000);
        setTimeout(() => { child.material.color.set(0xffffff); }, 200);
      }
    });
    playAnimation('HitReact');
    particleBurst();
    if (hitCount === maxHits) {
      setTimeout(() => {
        playAnimation('Death');
      }, 1000);
    }
  } catch (error) {
    console.error('Error hitting pigeon:', error);
  }
}

// --- Camera Setup ---
async function startCamera() {
  try {
    const video = document.createElement('video');
    const cameraObj = new Camera(video, {
      onFrame: async () => {
        handsWorker.postMessage({ image: video });
      },
      width: 640,
      height: 480,
    });
    cameraObj.start();
  } catch (error) {
    console.error('Error starting camera:', error);
  }
}

// --- Animation Loop ---
function animate() {
  try {
    requestAnimationFrame(animate);
    if (mixer) mixer.update(0.01);
    renderer.render(scene, camera);
  } catch (error) {
    console.error('Error in animation loop:', error);
  }
}

// --- Full Screen ---
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

// --- Initialization ---
try {
  loadPigeon();
  setupParticleSystem();
  setupHandsWorker();
  startCamera();
  animate();
} catch (error) {
  console.error('Initialization error:', error);
}

// --- Event Listeners ---
window.addEventListener('resize', () => {
  try {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  } catch (error) {
    console.error('Error resizing window:', error);
  }
});

window.addEventListener('click', toggleFullScreen);
