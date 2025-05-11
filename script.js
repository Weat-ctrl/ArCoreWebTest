// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// First-person camera (this is the player's viewpoint)
const camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    1000
);
camera.position.set(13, 48, 63); // Start position (adjust based on your GLB floor)

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Physics & Movement
const gravity = -9.8; // Gravity strength
let velocityY = 0;
let isOnGround = false;
const moveSpeed = 0.2; // Slower for touch controls
let moveDirection = new THREE.Vector3();

// Collision detection
let worldBounds = new THREE.Box3(); // Will be set after GLB loads
const playerHeight = 1.8; // Approx. human height
const playerRadius = 0.5; // Collision radius

// Touch controls
const touchJoystick = {
    active: false,
    startX: 0,
    startY: 0,
    moveX: 0,
    moveY: 0
};

// Load GLB model (with floor detection)
let floorY = 0; // Will be set when GLB loads
const loader = new THREE.GLTFLoader();
loader.load(
    'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    (gltf) => {
        const model = gltf.scene;
        scene.add(model);

        // Set floor level (adjust if your model has a specific floor)
        const box = new THREE.Box3().setFromObject(model);
        floorY = box.min.y;
        worldBounds.copy(box); // Set world bounds for collision

        // Optional: Visualize floor (debug)
        const floorHelper = new THREE.Box3Helper(worldBounds, 0x00ff00);
        scene.add(floorHelper);
    },
    undefined,
    (error) => console.error('Error loading model:', error)
);

// Touch movement controls
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

// Gyroscope controls (optional for mobile look)
window.addEventListener('deviceorientation', (e) => {
    if (!e.alpha) return; // Skip if no gyro support
    
    // Adjust camera rotation based on device tilt
    camera.rotation.y = -e.alpha * (Math.PI / 180); // Left/right
    camera.rotation.x = -e.beta * (Math.PI / 180) * 0.5; // Up/down (limited)
});

// Update player movement & physics
function updatePlayer(deltaTime) {
    // Apply gravity
    velocityY += gravity * deltaTime;
    camera.position.y += velocityY * deltaTime;

    // Check if player hit the floor
    if (camera.position.y <= floorY + playerHeight) {
        camera.position.y = floorY + playerHeight;
        velocityY = 0;
        isOnGround = true;
    } else {
        isOnGround = false;
    }

    // Movement from touch controls
    if (touchJoystick.active) {
        const moveX = touchJoystick.moveX * 0.01; // Sensitivity adjustment
        const moveY = touchJoystick.moveY * 0.01;

        // Calculate movement direction relative to camera
        moveDirection.set(moveX, 0, -moveY).normalize();
        moveDirection.applyQuaternion(camera.quaternion);
        moveDirection.y = 0; // Keep movement horizontal

        // Apply movement
        camera.position.addScaledVector(moveDirection, moveSpeed * deltaTime);
    }

    // Simple collision (prevent walking outside bounds)
    camera.position.x = THREE.MathUtils.clamp(
        camera.position.x,
        worldBounds.min.x + playerRadius,
        worldBounds.max.x - playerRadius
    );
    camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        worldBounds.min.z + playerRadius,
        worldBounds.max.z - playerRadius
    );
}

// Animation loop
let lastTime = 0;
function animate(time) {
    const deltaTime = (time - lastTime) / 1000; // Convert to seconds
    lastTime = time;

    updatePlayer(deltaTime);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
animate();
