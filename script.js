// Set up Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Variables
let pigeonModel;
let hitCount = 0;
const maxHits = 5;
let smokeParticles;
let mixer; // Animation mixer
let animations = {}; // Store animations
let currentAction; // Current animation action

// Load the Pigeon.gltf model
const loader = new THREE.GLTFLoader();
const pigeonModelUrl = 'https://raw.githubusercontent.com/Weat-ctrl/ArCoreWebTest/main/Pigeon.gltf'; // Replace with your GitHub raw URL
loader.load(
  pigeonModelUrl,
  (gltf) => {
    pigeonModel = gltf.scene;
    scene.add(pigeonModel);

    // Set up animations
    mixer = new THREE.AnimationMixer(pigeonModel);
    animations = {
      Flying_Idle: mixer.clipAction(gltf.animations.find((clip) => clip.name === 'Flying_Idle')),
      HitReact: mixer.clipAction(gltf.animations.find((clip) => clip.name === 'HitReact')),
      Death: mixer.clipAction(gltf.animations.find((clip) => clip.name === 'Death')),
    };

    // Start with Flying_Idle animation
    currentAction = animations.Flying_Idle;
    currentAction.play();
  },
  undefined,
  (error) => {
    console.error('Error loading GLTF model:', error);
  }
);

// Set up Three.js particle system
function setupParticleSystem() {
  const particleCount = 100;
  const particles = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 2; // x
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2; // y
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 2; // z
  }

  particles.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

  const particleMaterial = new THREE.PointsMaterial({
    size: 0.1,
    color: 0xffffff, // White color for puff effect
    transparent: true,
    opacity: 0.5,
  });

  smokeParticles = new THREE.Points(particles, particleMaterial);
  scene.add(smokeParticles);
}

// Access the front camera using WebRTC
async function startFrontCamera() {
  const constraints = {
    video: {
      facingMode: 'user',
      width: window.innerWidth,
      height: window.innerHeight,
      frameRate: 15,
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const video = document.createElement('video');
  video.srcObject = stream;
  video.play();

  // Create a texture from the video feed
  const videoTexture = new THREE.VideoTexture(video);
  const videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture });
  const videoGeometry = new THREE.PlaneGeometry(16, 9); // Adjust aspect ratio as needed
  const videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
  videoMesh.position.set(0, 0, -10); // Move the camera feed plane further back
  scene.add(videoMesh);

  // Initialize MediaPipe Hands
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults(onResults);

  // Start processing the video feed
  let lastFrameTime = 0;
  const frameRate = 15;
  const camera = new Camera(video, {
    onFrame: async () => {
      const now = performance.now();
      if (now - lastFrameTime >= 1000 / frameRate) {
        await hands.send({ image: video });
        lastFrameTime = now;
      }
    },
    width: window.innerWidth,
    height: window.innerHeight,
  });
  camera.start();
}

// Handle hand landmarks
function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // Check for peace sign gesture
    if (isPeaceSign(landmarks)) {
      hitPigeon();
    }
  }
}

// Detect peace sign gesture
function isPeaceSign(landmarks) {
  const indexFinger = landmarks[8];
  const middleFinger = landmarks[12];
  const ringFinger = landmarks[16];
  const pinkyFinger = landmarks[20];

  return (
    indexFinger.y < middleFinger.y && // Index and middle fingers are up
    ringFinger.y > middleFinger.y && // Ring and pinky fingers are down
    pinkyFinger.y > middleFinger.y
  );
}

// Hit the pigeon
function hitPigeon() {
  if (hitCount >= maxHits) return;

  hitCount++;
  console.log(`Hit count: ${hitCount}`);

  // Play HitReact animation
  currentAction.stop();
  currentAction = animations.HitReact;
  currentAction.reset().play();

  // Change model color to red temporarily
  pigeonModel.traverse((child) => {
    if (child.isMesh) {
      child.material.color.set(0xff0000);
    }
  });
  setTimeout(() => {
    pigeonModel.traverse((child) => {
      if (child.isMesh) {
        child.material.color.set(0xffffff); // Reset color
      }
    });
  }, 200);

  // Add particle effect
  addParticleEffect();

  // On fifth hit, play Death animation and disappear
  if (hitCount === maxHits) {
    currentAction.stop();
    currentAction = animations.Death;
    currentAction.reset().play();

    currentAction.clampWhenFinished = true;
    currentAction.loop = THREE.LoopOnce;
    currentAction.play();

    setTimeout(() => {
      pigeonModel.visible = false;
      addParticleEffect(); // Final puff of particles
    }, 2000); // Adjust delay to match Death animation duration
  }
}

// Add particle effect
function addParticleEffect() {
  const positions = smokeParticles.geometry.attributes.position.array;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (Math.random() - 0.5) * 2; // x
    positions[i + 1] = (Math.random() - 0.5) * 2; // y
    positions[i + 2] = (Math.random() - 0.5) * 2; // z
  }

  smokeParticles.geometry.attributes.position.needsUpdate = true;
}

// Render loop
function animate() {
  requestAnimationFrame(animate);

  // Update animation mixer
  if (mixer) {
    mixer.update(0.01);
  }

  // Render the scene
  renderer.render(scene, camera);
}

// Start the front camera and animation
startFrontCamera();
setupParticleSystem();
animate();

// Handle window resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
