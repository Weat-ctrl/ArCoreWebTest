// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// First-person camera (initial position same as your working example)
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(13, 48, 63); // Matches your working position

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Physics & Movement
const gravity = -0.2; // Slower gravity for mobile
let velocityY = 0;
let isOnGround = false;
const moveSpeed = 0.1; // Slower for touch controls
let floorY = 0; // Will be set after GLB loads

// Touch controls
const touchJoystick = {
    active: false,
    startX: 0,
    startY: 0,
    moveX: 0,
    moveY: 0
};

// Load GLB model
const loader = new THREE.GLTFLoader();
loader.load(
    'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    (gltf) => {
        const model = gltf.scene;
        scene.add(model);

        // Set floor level (from your working example)
        const box = new THREE.Box3().setFromObject(model);
        floorY = box.min.y; // Camera will fall to this height
        console.log("Floor level:", floorY); // Debug log
    },
    undefined,
    (error) => console.error("Model load error:", error)
);

// Touch movement (mobile controls)
document.addEventListener('touchstart', (e) => {
    touchJoystick.active = true;
    touchJoystick.startX = e.touches[0].clientX;
    touchJoystick.startY = e.touches[0].clientY;
});

document.addEventListener('touchmove', (e) => {
    if (!touchJoystick.active) return;
    touchJoystick.moveX = e.touches[0].clientX - touchJoystick.startX;
    touchJoystick.moveY = e.touches[0].clientY - touchJoystick.startY;
});

document.addEventListener('touchend', () => {
    touchJoystick.active = false;
    touchJoystick.moveX = touchJoystick.moveY = 0;
});

// Update player position (gravity + movement)
function updatePlayer() {
    // Apply gravity
    velocityY += gravity;
    camera.position.y += velocityY;

    // Check if player hit the floor
    if (camera.position.y <= floorY + 1.8) { // 1.8 = player height
        camera.position.y = floorY + 1.8;
        velocityY = 0;
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // Movement from touch controls
    if (touchJoystick.active) {
        const moveX = touchJoystick.moveX * 0.01; // Sensitivity
        const moveY = touchJoystick.moveY * 0.01;

        // Move forward/backward relative to camera
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

        // Apply movement
        camera.position.addScaledVector(forward, moveY * moveSpeed);
        camera.position.addScaledVector(right, moveX * moveSpeed);
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    updatePlayer();
    renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
