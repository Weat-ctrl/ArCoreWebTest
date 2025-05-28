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
const gravity = -15;
let velocityY = 0;
const monkHeight = 2;
const groundOffset = 0.1;

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction, currentAction;
const moveDirection = new THREE.Vector2();
const moveSpeed = 20;
let isMoving = false;

// Initial Position
const initialMonkPosition = new THREE.Vector3(6.18, 29.792, 24.658);

// Hand Tracking
let handLandmarker;
let handMeshes = [];
const handMeshScale = 0.1; // Increased scale
const handDepth = 1.5; // Increased depth
let handsDetected = false;
const trackingStatus = document.getElementById('tracking-status');

// Model Loader
function loadModel(url) {
    return new Promise((resolve) => {
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => resolve(gltf),
            undefined,
            () => resolve(createFallbackModel())
        );
    });
}

function createFallbackModel() {
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    return { scene: box };
}

// Initialize
async function init() {
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    try {
        // Load models
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);

        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        scene.add(monk);
        monk.scale.set(0.5, 0.5, 0.5);
        monk.position.copy(initialMonkPosition);
        snapToGround();

        // Setup systems
        setupAnimations(monkGLTF);
        setupJoystick();
        setupResetButton();
        await setupHandTracking();
        
        // Start animation loop
        animate();
    } catch (error) {
        console.error("Initialization error:", error);
        trackingStatus.textContent = "Initialization failed";
    }
}

// Hand Tracking Setup
async function setupHandTracking() {
    handLandmarker = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });
    
    handLandmarker.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });
    
    handLandmarker.onResults(onHandResults);
    
    const camera = new Camera(document.getElementById('canvas-container'), {
        onFrame: async () => {
            await handLandmarker.send({image: camera.video});
        },
        width: 1280,
        height: 720
    });
    camera.start();
}

function onHandResults(results) {
    // Clear previous hand meshes
    handMeshes.forEach(mesh => scene.remove(mesh));
    handMeshes = [];
    
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        handsDetected = false;
        trackingStatus.textContent = 'No hands detected';
        trackingStatus.style.color = '#ff5555';
        return;
    }
    
    handsDetected = true;
    trackingStatus.textContent = `${results.multiHandLandmarks.length} hand(s) detected`;
    trackingStatus.style.color = '#55ff55';
    
    // Create hand visuals
    results.multiHandLandmarks.forEach(landmarks => {
        createHandJoints(landmarks);
        createHandBones(landmarks);
    });
}

function createHandJoints(landmarks) {
    const jointMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.9
    });
    
    landmarks.forEach((landmark, i) => {
        // Create larger spheres for palm and fingertips
        let size = handMeshScale;
        if (i === 0) size *= 2.5; // Palm base larger
        if ([4, 8, 12, 16, 20].includes(i)) size *= 1.8; // Fingertips larger
        
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const sphere = new THREE.Mesh(geometry, jointMaterial);
        
        // Position in 3D space
        const x = (landmark.x - 0.5) * 2 * camera.aspect;
        const y = -(landmark.y - 0.5) * 2;
        const z = -handDepth;
        
        sphere.position.set(x, y, z);
        sphere.position.applyMatrix4(camera.projectionMatrixInverse);
        
        scene.add(sphere);
        handMeshes.push(sphere);
    });
}

function createHandBones(landmarks) {
    const boneMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aa00,
        transparent: true,
        opacity: 0.9
    });
    
    // Finger connections
    const connections = [
        [0, 1, 2, 3, 4],    // Thumb
        [0, 5, 6, 7, 8],     // Index
        [0, 9, 10, 11, 12],  // Middle
        [0, 13, 14, 15, 16], // Ring
        [0, 17, 18, 19, 20], // Pinky
        [5, 9, 13, 17]       // Palm knuckles
    ];
    
    connections.forEach(connection => {
        for (let i = 0; i < connection.length - 1; i++) {
            const startIdx = connection[i];
            const endIdx = connection[i + 1];
            
            const startLandmark = landmarks[startIdx];
            const endLandmark = landmarks[endIdx];
            
            // Convert to 3D coordinates
            const startPos = new THREE.Vector3(
                (startLandmark.x - 0.5) * 2 * camera.aspect,
                -(startLandmark.y - 0.5) * 2,
                -handDepth
            ).applyMatrix4(camera.projectionMatrixInverse);
            
            const endPos = new THREE.Vector3(
                (endLandmark.x - 0.5) * 2 * camera.aspect,
                -(endLandmark.y - 0.5) * 2,
                -handDepth
            ).applyMatrix4(camera.projectionMatrixInverse);
            
            // Create bone cylinder
            const boneLength = startPos.distanceTo(endPos);
            const boneGeometry = new THREE.CylinderGeometry(
                handMeshScale, // Radius
                handMeshScale,
                boneLength,   // Height
                8            // Segments
            );
            boneGeometry.rotateZ(Math.PI/2); // Orient horizontally
            
            const bone = new THREE.Mesh(boneGeometry, boneMaterial);
            
            // Position at midpoint
            bone.position.lerpVectors(startPos, endPos, 0.5);
            
            // Rotate to point from start to end
            bone.quaternion.setFromUnitVectors(
                new THREE.Vector3(1, 0, 0),
                new THREE.Vector3().subVectors(endPos, startPos).normalize()
            );
            
            scene.add(bone);
            handMeshes.push(bone);
        }
    });
}

// [Rest of your existing functions (snapToGround, resetMonkPosition, setupAnimations, 
//  setupJoystick, setupResetButton, updateMovement, checkGround, updateCamera, animate)
// remain exactly the same as in your original code]

// Initialize the app
init();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
