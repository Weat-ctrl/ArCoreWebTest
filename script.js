// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// Camera - starts 1.8 units above floor (player height)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(13, 1.8, 63); // Adjusted for y=0 floor

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Physics
const gravity = -0.15; // Softer gravity for mobile
let velocityY = 0;
const floorY = 0; // Floor is now at y=0 after model adjustment
const playerHeight = 1.8;

// Touch controls
const touch = {
    active: false,
    startX: 0,
    startY: 0,
    moveX: 0,
    moveY: 0
};

// Load and reposition model (Key Fix: Option 1)
const loader = new THREE.GLTFLoader();
loader.load(
    'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    (gltf) => {
        const model = gltf.scene;
        
        // Reposition model upward so its original floor (-90.07) is now at y=0
        model.position.y = 90.07;
        scene.add(model);

        // Debug: Visualize floor (green grid at y=0)
        const floorHelper = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshBasicMaterial({ 
                color: 0x00ff00, 
                wireframe: true,
                transparent: true,
                opacity: 0.3
            })
        );
        floorHelper.rotation.x = -Math.PI / 2;
        scene.add(floorHelper);
    },
    undefined,
    (error) => console.error("Model error:", error)
);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Touch controls
document.addEventListener('touchstart', (e) => {
    touch.active = true;
    touch.startX = e.touches[0].clientX;
    touch.startY = e.touches[0].clientY;
});

document.addEventListener('touchmove', (e) => {
    if (!touch.active) return;
    touch.moveX = e.touches[0].clientX - touch.startX;
    touch.moveY = e.touches[0].clientY - touch.startY;
});

document.addEventListener('touchend', () => {
    touch.active = false;
    touch.moveX = touch.moveY = 0;
});

// Movement and physics
function update() {
    // Apply gravity
    velocityY += gravity;
    camera.position.y += velocityY;

    // Floor collision
    if (camera.position.y < floorY + playerHeight) {
        camera.position.y = floorY + playerHeight;
        velocityY = 0;
    }

    // Movement (relative to camera direction)
    if (touch.active) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        
        // Move forward/backward
        camera.position.addScaledVector(forward, touch.moveY * -0.001);
        // Strafe left/right
        camera.position.addScaledVector(right, touch.moveX * 0.001);
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}
animate();

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
