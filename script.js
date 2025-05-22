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
const gravity = -25; // Stronger gravity for better snapping
let velocityY = 0;
const monkHeight = 1.8;
const groundOffset = 0.05;
const slopeLimit = 0.7; // 45-degree slope limit

// Movement
const moveDirection = new THREE.Vector2();
const moveSpeed = 5;
let isMoving = false;
const initialPosition = new THREE.Vector3(6.18, 50, 24.658); // Start high for ground snap

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction;

// Improved model loader
async function loadModel(url) {
    return new Promise((resolve) => {
        new THREE.GLTFLoader().load(
            url,
            (gltf) => resolve(gltf),
            undefined,
            () => resolve({ scene: new THREE.Group(), animations: [] })
        );
    });
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

    // Load Skycastle
    try {
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);
    } catch (e) {
        console.error("Skycastle load error:", e);
        skycastleModel = new THREE.Group();
        scene.add(skycastleModel);
    }

    // Load Monk
    try {
        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.glb');
        monk = monkGLTF.scene;
        scene.add(monk);
        monk.position.copy(initialPosition);
        
        // Setup animations
        if (monkGLTF.animations?.length) {
            mixer = new THREE.AnimationMixer(monk);
            idleAction = mixer.clipAction(
                monkGLTF.animations.find(a => /idle/i.test(a.name)) || monkGLTF.animations[0]
            );
            runAction = mixer.clipAction(
                monkGLTF.animations.find(a => /run|walk/i.test(a.name)) || monkGLTF.animations[0]
            );
            idleAction.play();
        }
    } catch (e) {
        console.error("Monk load error:", e);
        monk = new THREE.Mesh(
            new THREE.BoxGeometry(1, 2, 1),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        scene.add(monk);
    }

    setupJoystick();
    setupResetButton();
    animate();
}

// Enhanced collision detection
function updatePhysics() {
    if (!monk || !skycastleModel) return;

    // Multiple raycasts for ground detection
    const rayOrigins = [
        new THREE.Vector3(0, 0, 0),      // Center
        new THREE.Vector3(0.4, 0, 0),    // Right
        new THREE.Vector3(-0.4, 0, 0),   // Left
        new THREE.Vector3(0, 0, 0.4),    // Front
        new THREE.Vector3(0, 0, -0.4)    // Back
    ];

    let onGround = false;
    let groundY = -Infinity;
    let groundNormal = new THREE.Vector3(0, 1, 0);

    // Check ground
    rayOrigins.forEach(offset => {
        const origin = monk.position.clone().add(offset);
        origin.y += monkHeight/2;
        
        const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObject(skycastleModel, true);
        
        if (intersects[0] && intersects[0].distance <= monkHeight) {
            onGround = true;
            groundY = Math.max(groundY, intersects[0].point.y);
            groundNormal = intersects[0].face.normal.clone().normalize();
        }
    });

    // Slope check (prevent climbing steep surfaces)
    const canMoveOnSlope = groundNormal.y > slopeLimit;

    // Apply gravity or snap to ground
    if (!onGround || !canMoveOnSlope) {
        velocityY += gravity * clock.getDelta();
    } else {
        velocityY = 0;
        monk.position.y = groundY + monkHeight/2 + groundOffset;
    }

    monk.position.y += velocityY * clock.getDelta();
    return canMoveOnSlope;
}

// Movement system with collision
function updateMovement(delta) {
    if (!monk || moveDirection.length() === 0) return;

    const canMove = updatePhysics(); // Updates physics and checks slope
    
    if (!canMove) return; // Don't move if on too steep slope

    // Get camera-relative directions
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();

    const cameraRight = new THREE.Vector3().crossVectors(
        new THREE.Vector3(0, 1, 0),
        cameraForward
    );

    // Calculate movement
    const moveX = moveDirection.x * moveSpeed * delta;
    const moveZ = moveDirection.y * moveSpeed * delta;

    // Store previous position for collision response
    const prevPosition = monk.position.clone();

    // Apply movement
    monk.position.x += cameraRight.x * moveX + cameraForward.x * moveZ;
    monk.position.z += cameraRight.z * moveX + cameraForward.z * moveZ;

    // Wall collision check
    const moveVector = new THREE.Vector3(
        monk.position.x - prevPosition.x,
        0,
        monk.position.z - prevPosition.z
    );
    
    if (moveVector.length() > 0.01) {
        const raycaster = new THREE.Raycaster(
            prevPosition.clone().setY(monk.position.y),
            moveVector.clone().normalize()
        );
        const intersects = raycaster.intersectObject(skycastleModel, true);
        
        if (intersects[0] && intersects[0].distance < moveVector.length()) {
            monk.position.copy(prevPosition);
        } else {
            // Face movement direction if valid
            const targetAngle = Math.atan2(
                cameraRight.x * moveX + cameraForward.x * moveZ,
                cameraRight.z * moveX + cameraForward.z * moveZ
            );
            monk.rotation.y = targetAngle;
        }
    }
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
        moveDirection.set(data.vector.x, -data.vector.y); // Corrected directions
        
        if (!isMoving && runAction) {
            idleAction?.fadeOut(0.2);
            runAction.reset().fadeIn(0.2).play();
            isMoving = true;
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        if (isMoving) {
            runAction?.fadeOut(0.2);
            idleAction?.reset().fadeIn(0.2).play();
            isMoving = false;
        }
    });
}

// Reset button
function setupResetButton() {
    const btn = document.getElementById('reset-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            monk.position.copy(initialPosition);
            velocityY = 0;
        });
    }
}

// Camera follow
function updateCamera() {
    if (!monk) return;
    
    const targetPos = monk.position.clone()
        .add(new THREE.Vector3(0, 3, -8));
    
    camera.position.lerp(targetPos, 0.1);
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

// Start
init();
