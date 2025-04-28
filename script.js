// =============== INITIALIZATION CHECKS ===============
console.log('[DEBUG] Starting application initialization');

// Verify Three.js is loaded
if (typeof THREE === 'undefined') {
    console.error('[FATAL] Three.js not loaded. Check your script imports!');
    alert('Failed to load 3D library. Please refresh or check your connection.');
    throw new Error('Three.js dependency missing');
}

// Verify DOM elements exist
const requiredElements = ['scene-container', 'joystick-move', 'joystick-look'];
const missingElements = requiredElements.filter(id => !document.getElementById(id));
if (missingElements.length > 0) {
    console.error(`[FATAL] Missing DOM elements: ${missingElements.join(', ')}`);
    throw new Error('Required DOM elements missing');
}

// =============== SCENE SETUP WITH ERROR HANDLING ===============
let scene, camera, renderer, player, terrain;

try {
    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    console.log('[DEBUG] Scene created successfully');

    // 2. Renderer with WebGL support check
    try {
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.getElementById('scene-container').appendChild(renderer.domElement);
        console.log('[DEBUG] WebGL renderer initialized');
    } catch (webglError) {
        console.error('[FATAL] WebGL initialization failed:', webglError);
        fallbackToCanvas();
    }

    // 3. Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);
    console.log('[DEBUG] Camera configured');

    // =============== PLAYER SETUP ===============
    try {
        player = createPlayerCapsule();
        scene.add(player);
        console.log('[DEBUG] Player capsule created');
    } catch (playerError) {
        console.error('[ERROR] Failed to create player:', playerError);
        createFallbackPlayer();
    }

    // =============== TERRAIN LOADING ===============
    const loader = new THREE.GLTFLoader();
    loader.load(
        'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
        (gltf) => {
            try {
                terrain = gltf.scene;
                terrain.traverse((node) => {
                    if (node.isMesh) {
                        node.receiveShadow = true;
                        node.castShadow = true;
                    }
                });
                scene.add(terrain);
                console.log('[DEBUG] Terrain loaded successfully');
                
                // Start animation only after terrain loads
                initControls();
                animate();
            } catch (terrainError) {
                console.error('[ERROR] Terrain processing failed:', terrainError);
                createFallbackTerrain();
            }
        },
        (progress) => {
            console.log(`[DEBUG] Loading progress: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
        },
        (error) => {
            console.error('[ERROR] Terrain loading failed:', error);
            createFallbackTerrain();
            animate(); // Start anyway with fallback
        }
    );

} catch (initError) {
    console.error('[FATAL] Initialization failed:', initError);
    showErrorUI('Failed to initialize 3D viewer. Please try another browser.');
}

// =============== CORE FUNCTIONS ===============
function createPlayerCapsule() {
    const group = new THREE.Group();
    
    try {
        const geometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.7
        });
        const capsule = new THREE.Mesh(geometry, material);
        group.add(capsule);
        
        // Camera setup
        const cameraPivot = new THREE.Group();
        cameraPivot.position.set(0, 0.6, 0);
        group.add(cameraPivot);
        cameraPivot.add(camera);
        
        return group;
    } catch (error) {
        console.warn('[WARNING] Using fallback player geometry');
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 1.8, 0.5),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        group.add(box);
        return group;
    }
}

function initControls() {
    try {
        console.log('[DEBUG] Initializing touch controls');
        
        // Movement joystick
        const moveJoystick = new VirtualJoystick({
            container: document.getElementById('joystick-move'),
            onMove: (x, y) => {
                player.position.x += x * 0.1;
                player.position.z += y * 0.1;
            }
        });
        
        // Look joystick
        const lookJoystick = new VirtualJoystick({
            container: document.getElementById('joystick-look'),
            onMove: (x, y) => {
                player.rotation.y -= x * 0.02;
                camera.rotation.x = THREE.MathUtils.clamp(
                    camera.rotation.x - y * 0.02,
                    -Math.PI/3,
                    Math.PI/3
                );
            }
        });
        
        console.log('[DEBUG] Controls initialized');
    } catch (controlsError) {
        console.error('[ERROR] Control initialization failed:', controlsError);
    }
}

// =============== FALLBACK SYSTEMS ===============
function fallbackToCanvas() {
    console.warn('[WARNING] Falling back to CanvasRenderer');
    renderer = new THREE.CanvasRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('scene-container').appendChild(renderer.domElement);
    showWarningUI('Your device has limited 3D capabilities');
}

function createFallbackTerrain() {
    console.warn('[WARNING] Creating fallback terrain');
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x00aa00 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
}

function showErrorUI(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        padding: 20px;
        background: #ff4444;
        color: white;
        text-align: center;
        z-index: 1000;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
}

// =============== ANIMATION LOOP ===============
function animate() {
    try {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    } catch (animationError) {
        console.error('[ERROR] Animation loop crashed:', animationError);
    }
}

// =============== WINDOW RESIZE HANDLER ===============
window.addEventListener('resize', () => {
    try {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    } catch (resizeError) {
        console.error('[ERROR] Resize handler failed:', resizeError);
    }
});

console.log('[DEBUG] Application setup complete');
