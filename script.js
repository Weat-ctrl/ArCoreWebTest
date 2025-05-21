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
const moveSpeed = 4;
let isMoving = false;

// Load Models
async function loadModel(url) {
    return new Promise((resolve, reject) => {
        new THREE.GLTFLoader().load(
            url,
            resolve,
            undefined,
            reject
        );
    });
}

// Initialize
async function init() {
    try {
        // Load Skycastle
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        // Load Monk
        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.glb');
        monk = monkGLTF.scene;
        scene.add(monk);
        
        // Setup systems
        resetMonkPosition();
        setupAnimations(monkGLTF);
        setupJoystick();
        setupResetButton();
        animate();
    } catch (error) {
        console.error("Loading error:", error);
    }
}

// Reset position
function resetMonkPosition() {
    if (!monk || !skycastleModel) return;
    
    monk.position.set(0, 10, 0);
    findGround();
}

// Find ground below character
function findGround() {
    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(skycastleModel, true);
    
    if (intersects.length > 0) {
        monk.position.y = intersects[0].point.y + monkHeight/2 + groundOffset;
        velocityY = 0;
    }
}

// Enhanced collision detection
function checkTerrainCollision() {
    const rays = [
        new THREE.Vector3(0, -1, 0),    // Center
        new THREE.Vector3(0.5, -1, 0),  // Right
        new THREE.Vector3(-0.5, -1, 0), // Left
        new THREE.Vector3(0, -1, 0.5),  // Front
        new THREE.Vector3(0, -1, -0.5)  // Back
    ];
    
    const raycaster = new THREE.Raycaster();
    const rayOrigin = monk.position.clone();
    rayOrigin.y += monkHeight/2;
    
    let onGround = false;
    let groundY = -Infinity;
    
    rays.forEach(dir => {
        raycaster.set(rayOrigin, dir.normalize());
        const intersects = raycaster.intersectObject(skycastleModel, true);
        
        if (intersects.length > 0 && intersects[0].distance <= monkHeight) {
            onGround = true;
            groundY = Math.max(groundY, intersects[0].point.y);
        }
    });
    
    // Apply gravity
    if (!onGround) {
        velocityY += gravity * clock.getDelta();
    } else {
        velocityY = 0;
        monk.position.y = groundY + monkHeight/2 + groundOffset;
    }
    
    monk.position.y += velocityY * clock.getDelta();
    return onGround;
}

// Animation system
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
        // Correct joystick mapping (pull down = move forward)
        moveDirection.set(
            data.vector.x,    // Left/Right
            -data.vector.y   // Forward/Back
        );
        
        // Animation control
        if (!isMoving) {
            idleAction.fadeOut(0.2);
            runAction.reset().fadeIn(0.2).play();
            currentAction = runAction;
            isMoving = true;
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        if (isMoving) {
            runAction.fadeOut(0.2);
            idleAction.reset().fadeIn(0.2).play();
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
    
    // Calculate movement vector
    const moveX = moveDirection.x * moveSpeed * delta;
    const moveZ = moveDirection.y * moveSpeed * delta;
    
    // Apply movement relative to camera
    const prevPosition = monk.position.clone();
    monk.position.x += cameraRight.x * moveX + cameraForward.x * moveZ;
    monk.position.z += cameraRight.z * moveX + cameraForward.z * moveZ;
    
    // Verify new position
    if (!checkTerrainCollision()) {
        monk.position.copy(prevPosition);
    }
    
    // Rotate to face movement direction
    if (moveDirection.length() > 0.3) {
        const moveAngle = Math.atan2(
            cameraRight.x * moveX + cameraForward.x * moveZ,
            cameraRight.z * moveX + cameraForward.z * moveZ
        );
        monk.rotation.y = moveAngle;
    }
}

// Camera system
function updateCamera() {
    if (!monk) return;
    
    // Calculate camera position behind character
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
