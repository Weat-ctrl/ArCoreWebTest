// Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraOffset = new THREE.Vector3(0, 3, -8);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// Physics
const clock = new THREE.Clock();
const gravity = -9.8;
let velocityY = 0;
const monkHeight = 2;
const groundOffset = 0.1;

// Debugging
const loadingManager = new THREE.LoadingManager();
loadingManager.onError = (url) => console.error('Error loading:', url);

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction, currentAction;
const moveDirection = new THREE.Vector2();
const moveSpeed = 4;
let isMoving = false;

// Improved model loading with error handling
function loadModel(url) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader(loadingManager);
        loader.load(
            url,
            (gltf) => {
                console.log('Successfully loaded:', url);
                resolve(gltf);
            },
            (xhr) => {
                const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
                console.log(`${percent}% loaded`);
            },
            (error) => {
                console.error('Error loading model:', url, error);
                reject(new Error(`Failed to load ${url}: ${error.message}`));
            }
        );
    });
}

// Initialize
async function init() {
    try {
        // First create a simple scene to show while loading
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        scene.add(directionalLight);

        // Load Skycastle
        console.log('Loading skycastle...');
        const skycastle = await loadModel('skycastle.glb')
            .catch(err => {
                console.error('Skycastle load failed, using fallback', err);
                return createFallbackModel();
            });
        
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        // Load Monk
        console.log('Loading monk...');
        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.glb')
            .catch(err => {
                console.error('Monk load failed, using fallback', err);
                return createFallbackModel();
            });
        
        monk = monkGLTF.scene;
        scene.add(monk);
        
        // Setup systems
        resetMonkPosition();
        setupAnimations(monkGLTF);
        setupJoystick();
        setupResetButton();
        
        console.log('All models loaded successfully');
        animate();
    } catch (error) {
        console.error("Initialization error:", error);
        showErrorScreen();
    }
}

// Fallback model if loading fails
function createFallbackModel() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);
    return { scene: mesh };
}

// Error display
function showErrorScreen() {
    scene.background = new THREE.Color(0x000000);
    const errorText = document.createElement('div');
    errorText.style.position = 'absolute';
    errorText.style.top = '50%';
    errorText.style.left = '50%';
    errorText.style.transform = 'translate(-50%, -50%)';
    errorText.style.color = 'white';
    errorText.style.fontFamily = 'Arial';
    errorText.style.fontSize = '24px';
    errorText.textContent = 'Failed to load models. Please check console.';
    document.body.appendChild(errorText);
}

// [Rest of the functions remain exactly the same as previous solution...]
// (resetMonkPosition, findGround, checkTerrainCollision, setupAnimations, 
// setupJoystick, setupResetButton, updateMovement, updateCamera, animate)

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the app
init();
