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

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction, currentAction;
const moveDirection = new THREE.Vector2();
const moveSpeed = 10; // FIXED: Increased from 4 to 10
let isMoving = false;

// Initialize monk at specific position
const initialMonkPosition = new THREE.Vector3(6.18, 29.792, 24.658);

// Simple model loader without XMLHttpRequest issues
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

// Initialize
async function init() {
    // Basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    try {
        // Load Skycastle
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);
        
        // Load Monk
        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        scene.add(monk);
        
        // Set initial position
        monk.position.copy(initialMonkPosition);
        snapToGround();
        
        // Setup systems
        setupAnimations(monkGLTF);
        setupJoystick();
        setupResetButton();
        
        animate();
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

// Snap character to ground
function snapToGround() {
    if (!monk || !skycastleModel) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position.clone().add(new THREE.Vector3(0, 10, 0)), 
                new THREE.Vector3(0, -1, 0));
    
    const intersects = raycaster.intersectObject(skycastleModel, true);
    if (intersects.length > 0) {
        monk.position.y = intersects[0].point.y + monkHeight/2 + groundOffset;
    }
}

// Reset position
function resetMonkPosition() {
    if (!monk) return;
    monk.position.copy(initialMonkPosition);
    snapToGround();
    velocityY = 0;
}

// Setup animations
function setupAnimations(gltf) {
    if (!gltf.animations?.length) return;
    
    mixer = new THREE.AnimationMixer(monk);
    
    // Find animations
    idleAction = mixer.clipAction(
        gltf.animations.find(a => /idle|stand/i.test(a.name)) || gltf.animations[0]
    );
    runAction = mixer.clipAction(
        gltf.animations.find(a => /run|walk/i.test(a.name)) || gltf.animations[1] || gltf.animations[0]
    );

    idleAction.play();
    currentAction = idleAction;
}

// Joystick controls
function setupJoystick() {
    const joystick = nipplejs.create({
        zone: document.getElementById('joystick-wrapper'),
        mode: 'static',
        position: { left: '60px', bottom: '60px' },
        size: 100,
        color: 'rgba(255,255,255,0.5)'
    });

    joystick.on('move', (evt, data) => {
        moveDirection.set(
            data.vector.x,   // FIXED: removed '-' from y to correct direction
            data.vector.y
        );

        if (!isMoving) {
            idleAction?.fadeOut(0.2);
            runAction?.reset().fadeIn(0.2).play();
            currentAction = runAction;
            isMoving = true;
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        if (isMoving) {
            runAction?.fadeOut(0.2);
            idleAction?.reset().fadeIn(0.2).play();
            currentAction = idleAction;
            isMoving = false;
        }
    });
}

// Reset button
function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', resetMonkPosition);
}

// Movement system
function updateMovement(delta) {
    if (!monk || moveDirection.length() === 0) return;
    
    // Get camera-relative directions
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(new THREE.Vector3(0, 1, 0), cameraForward);
    
    // Calculate movement
    const moveX = moveDirection.x * moveSpeed * delta;
    const moveZ = moveDirection.y * moveSpeed * delta;
    
    // Apply movement
    const prevPosition = monk.position.clone();
    monk.position.x += cameraRight.x * moveX + cameraForward.x * moveZ;
    monk.position.z += cameraRight.z * moveX + cameraForward.z * moveZ;
    
    // Check collision
    if (!checkTerrainCollision()) {
        monk.position.copy(prevPosition);
    }
    
    // Rotate character
    if (moveDirection.length() > 0.3) {
        const moveAngle = Math.atan2(
            cameraRight.x * moveX + cameraForward.x * moveZ,
            cameraRight.z * moveX + cameraForward.z * moveZ
        );
        monk.rotation.y = moveAngle;
    }
}

// Terrain collision
function checkTerrainCollision() {
    if (!monk || !skycastleModel) return true;
    
    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position.clone().add(new THREE.Vector3(0, monkHeight/2, 0)), 
                new THREE.Vector3(0, -1, 0));
    
    const intersects = raycaster.intersectObject(skycastleModel, true);
    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        if (monk.position.y > groundY + monkHeight/2) {
            velocityY += gravity * clock.getDelta();
        } else {
            velocityY = 0;
            monk.position.y = groundY + monkHeight/2 + groundOffset;
        }
    } else {
        velocityY += gravity * clock.getDelta();
    }
    
    monk.position.y += velocityY * clock.getDelta();
    return intersects.length > 0;
}

// Camera system
function updateCamera() {
    if (!monk) return;
    
    const behind = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(monk.quaternion)
        .multiplyScalar(Math.abs(cameraOffset.z));
    
    const targetPosition = monk.position.clone()
        .add(behind)
        .add(new THREE.Vector3(0, cameraOffset.y, 0));
    
    camera.position.lerp(targetPosition, 0.1);
    camera.lookAt(monk.position);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updateMovement(delta);
    updateCamera();
    renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the app
init();
