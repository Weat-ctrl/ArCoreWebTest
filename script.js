// Set up Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Variables
let cube;
let hitCount = 0;
const maxHits = 5;
let smokeParticles;

// Create a cube
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.set(0, 0, -2); // Position the cube
scene.add(cube);

// Set up Three.js particle system
function setupParticleSystem() {
  const particleCount = 50; // Reduced from 100
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
    color: 0x00aaff, // Blue color
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
      width: 640, // Lower resolution
      height: 480,
      frameRate: 15, // Lower frame rate
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
    modelComplexity: 0, // Use 0 for faster performance
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults(onResults);

  // Start processing the video feed
  let lastFrameTime = 0;
  const frameRate = 15; // Process 15 frames per second
  const camera = new Camera(video, {
    onFrame: async () => {
      const now = performance.now();
      if (now - lastFrameTime >= 1000 / frameRate) {
        await hands.send({ image: video });
        lastFrameTime = now;
      }
    },
    width: 640,
    height: 480,
  });
  camera.start();
}

// Handle hand landmarks
function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // Check for peace sign gesture
    if (isPeaceSign(landmarks)) {
      hitCube();
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

// Hit the cube
function hitCube() {
  if (hitCount >= maxHits) return;

  hitCount++;
  console.log(`Hit count: ${hitCount}`);

  // Change cube color to red temporarily
  cube.material.color.set(0xff0000);
  setTimeout(() => {
    cube.material.color.set(0x00ff00); // Reset color
  }, 200);

  // Add particle effect
  addParticleEffect();

  // On fifth hit, remove the cube
  if (hitCount === maxHits) {
    setTimeout(() => {
      cube.visible = false;
    }, 1000);
  }
}

// Add particle effect
function addParticleEffect() {
  const positions = smokeParticles.geometry.attributes.position.array;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = cube.position.x + (Math.random() - 0.5) * 2; // x
    positions[i + 1] = cube.position.y + (Math.random() - 0.5) * 2; // y
    positions[i + 2] = cube.position.z + (Math.random() - 0.5) * 2; // z
  }

  smokeParticles.geometry.attributes.position.needsUpdate = true;
}

// Render loop
function animate() {
  requestAnimationFrame(animate);

  // Rotate the cube (optional)
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

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
