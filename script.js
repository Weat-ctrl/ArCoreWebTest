// =============== INITIALIZATION ===============
console.log('[INIT] Starting Three.js scene');

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccff);
scene.fog = new THREE.Fog(0x88ccff, 10, 50);

// Renderer (WebGL with mobile optimizations)
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
renderer.physicallyCorrectLights = true;
document.getElementById('scene-container').appendChild(renderer.domElement);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0);

// =============== OPTIMIZED LIGHTING ===============
function setupLights() {
    // 1. Ambient Light (base illumination)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // 2. Directional Light (main shadow-casting light)
    const sunLight = new THREE.DirectionalLight(0xfff4e6, 0.8);
    sunLight.position.set(5, 10, 7);
    sunLight.castShadow = true;
    
    // Optimized shadow settings for mobile
    sunLight.shadow.mapSize.width = 1024;  // Lower resolution for performance
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 30;
    sunLight.shadow.camera.left = -10;
    sunLight.shadow.camera.right = 10;
    sunLight.shadow.camera.top = 10;
    sunLight.shadow.camera.bottom = -10;
    sunLight.shadow.bias = -0.001; // Reduce shadow artifacts
    
    scene.add(sunLight);

    // 3. Fill Light (reduces harsh shadows)
    const fillLight = new THREE.DirectionalLight(0xccffff, 0.3);
    fillLight.position.set(-5, 5, 5);
    scene.add(fillLight);

    // 4. Player-attached light (ensures visibility)
    const playerLight = new THREE.SpotLight(0xffffff, 0.4, 15, Math.PI/3, 0.5);
    playerLight.position.set(0, 2, 0);
    playerLight.castShadow = false;
    player.add(playerLight);
}
setupLights();

// =============== PLAYER SETUP ===============
const player = new THREE.Group();
const capsuleGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
const capsuleMaterial = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    roughness: 0.3,
    metalness: 0.1
});
const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
capsule.castShadow = true;
player.add(capsule);
scene.add(player);

// Camera setup
const cameraPivot = new THREE.Group();
cameraPivot.position.set(0, 0.6, 0);
player.add(cameraPivot);
cameraPivot.add(camera);

// =============== TERRAIN LOADING ===============
let terrain, groundMesh;
const loader = new THREE.GLTFLoader();

loader.load(
    'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    (gltf) => {
        terrain = gltf.scene;
        
        // Configure shadows for all meshes
        terrain.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
                
                // Identify ground mesh by name
                if (node.name.includes('object_18')) {
                    groundMesh = node;
                    node.material.roughness = 0.8; // Make ground less shiny
                } else {
                    node.castShadow = true;
                }
            }
        });
        
        scene.add(terrain);
        console.log('[LOAD] Terrain loaded with shadow support');
    },
    undefined,
    (error) => {
        console.error('[ERROR] Terrain loading failed:', error);
        createFallbackGround();
    }
);

function createFallbackGround() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ 
            color: 0x228822,
            roughness: 0.9
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

// =============== TOUCH CONTROLS ===============
function initControls() {
    // Movement Joystick
    new VirtualJoystick({
        container: document.getElementById('joystick-move'),
        onMove: (x, y) => {
            const angle = Math.atan2(x, y) + player.rotation.y;
            const speed = 0.1;
            player.position.x += Math.sin(angle) * speed;
            player.position.z += Math.cos(angle) * speed;
        }
    });

    // Look Joystick
    new VirtualJoystick({
        container: document.getElementById('joystick-look'),
        onMove: (x, y) => {
            player.rotation.y -= x * 0.02;
            cameraPivot.rotation.x = THREE.MathUtils.clamp(
                cameraPivot.rotation.x - y * 0.02,
                -Math.PI/3,
                Math.PI/3
            );
        }
    });
}

// =============== ANIMATION LOOP ===============
function animate() {
    requestAnimationFrame(animate);
    
    // Update any dynamic lights here if needed
    if (player.children[2]) { // Player light
        player.children[2].position.copy(camera.position);
    }
    
    renderer.render(scene, camera);
}
animate();

// =============== WINDOW RESIZE ===============
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start controls after slight delay (ensure DOM is ready)
setTimeout(initControls, 500);
