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
const gravity = -30;
let velocityY = 0;
const monkHeight = 2;
const groundOffset = 0.1;
const raycastDistance = 10;
const stepHeight = 0.5; // Maximum height the monk can step up
const edgeLookahead = 0.8;
const collisionPrecision = 0.1;
let collisionCheckTimer = 0;

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction, currentAction;
const moveDirection = new THREE.Vector2();
const moveSpeed = 8;
let isMoving = false;
let isGrounded = false;
let lastValidPosition = new THREE.Vector3();

// Initialize monk at specific position
const initialMonkPosition = new THREE.Vector3(6.18, 29.792, 24.658);

// Simple model loader
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    try {
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        
        // Enable all children to receive shadows
        skycastleModel.traverse(child => {
            if (child.isMesh) {
                child.receiveShadow = true;
                child.castShadow = true;
            }
        });
        
        scene.add(skycastleModel);

        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        scene.add(monk);
        monk.scale.set(0.5, 0.5, 0.5);

        monk.position.copy(initialMonkPosition);
        snapToGround();
        lastValidPosition.copy(monk.position);

        setupAnimations(monkGLTF);
        setupJoystick();
        setupResetButton();

        animate();
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

function snapToGround() {
    if (!monk || !skycastleModel) return;

    const rayOrigins = [
        new THREE.Vector3(0, 2, 0),    // Center
        new THREE.Vector3(0.5, 2, 0),  // Right
        new THREE.Vector3(-0.5, 2, 0), // Left
        new THREE.Vector3(0, 2, 0.5),  // Front
        new THREE.Vector3(0, 2, -0.5)  // Back
    ];

    let lowestPoint = Infinity;
    let foundGround = false;

    rayOrigins.forEach(offset => {
        const raycaster = new THREE.Raycaster();
        const origin = monk.position.clone().add(offset);
        raycaster.set(origin, new THREE.Vector3(0, -1, 0));
        raycaster.far = raycastDistance;

        const intersects = raycaster.intersectObject(skycastleModel, true);
        if (intersects.length > 0) {
            foundGround = true;
            lowestPoint = Math.min(lowestPoint, intersects[0].point.y);
        }
    });

    if (foundGround) {
        monk.position.y = lowestPoint + monkHeight / 2 + groundOffset;
        isGrounded = true;
        velocityY = 0;
        lastValidPosition.copy(monk.position);
    }
}

function resetMonkPosition() {
    if (!monk) return;
    monk.position.copy(initialMonkPosition);
    snapToGround();
    velocityY = 0;
}

function setupAnimations(gltf) {
    if (!gltf.animations?.length) return;

    mixer = new THREE.AnimationMixer(monk);

    idleAction = mixer.clipAction(gltf.animations.find(a => /idle|stand/i.test(a.name)) || gltf.animations[0]);
    runAction = mixer.clipAction(gltf.animations.find(a => /run|walk/i.test(a.name)) || gltf.animations[1] || gltf.animations[0]);

    runAction.setEffectiveTimeScale(8);
    idleAction.play();
    currentAction = idleAction;
}

function setupJoystick() {
    const joystick = nipplejs.create({
        zone: document.getElementById('joystick-wrapper'),
        mode: 'static',
        position: { left: '60px', bottom: '60px' },
        size: 100,
        color: 'rgba(255,255,255,0.5)'
    });

    joystick.on('move', (evt, data) => {
        moveDirection.set(data.vector.x, -data.vector.y);
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

function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', resetMonkPosition);
}

function checkGround() {
    if (!monk || !skycastleModel) return false;

    const rayOrigins = [
        new THREE.Vector3(0, monkHeight/2, 0),    // Center
        new THREE.Vector3(0.3, monkHeight/2, 0),  // Right
        new THREE.Vector3(-0.3, monkHeight/2, 0), // Left
        new THREE.Vector3(0, monkHeight/2, 0.3),  // Front
        new THREE.Vector3(0, monkHeight/2, -0.3)  // Back
    ];

    let lowestPoint = Infinity;
    let foundGround = false;

    rayOrigins.forEach(offset => {
        const raycaster = new THREE.Raycaster();
        const origin = monk.position.clone().add(offset);
        raycaster.set(origin, new THREE.Vector3(0, -1, 0));
        raycaster.far = raycastDistance;

        const intersects = raycaster.intersectObject(skycastleModel, true);
        if (intersects.length > 0) {
            foundGround = true;
            lowestPoint = Math.min(lowestPoint, intersects[0].point.y);
        }
    });

    if (foundGround) {
        const groundY = lowestPoint;
        const distanceToGround = monk.position.y - (groundY + monkHeight/2 + groundOffset);
        
        // If we're within step height, step up
        if (distanceToGround < stepHeight && distanceToGround > -0.1) {
            monk.position.y = groundY + monkHeight/2 + groundOffset;
            isGrounded = true;
            velocityY = 0;
            lastValidPosition.copy(monk.position);
            return true;
        }
    }
    
    isGrounded = false;
    return false;
}

function checkEdgeAhead() {
    if (!monk || !skycastleModel || moveDirection.length() === 0) return false;

    const moveDirection3D = new THREE.Vector3(moveDirection.x, 0, -moveDirection.y).normalize();
    const rayOffsets = [
        new THREE.Vector3(0, 0, 0),           // Center
        new THREE.Vector3(0.3, 0, 0),         // Right
        new THREE.Vector3(-0.3, 0, 0),        // Left
        new THREE.Vector3(0, 0, 0.3),         // Front
        new THREE.Vector3(0, 0, -0.3)         // Back
    ];

    let edgeFound = false;

    rayOffsets.forEach(offset => {
        const rayStart = monk.position.clone()
            .add(new THREE.Vector3(0, monkHeight/2, 0))
            .add(moveDirection3D.clone().multiplyScalar(edgeLookahead))
            .add(offset);

        const raycaster = new THREE.Raycaster();
        raycaster.set(rayStart, new THREE.Vector3(0, -1, 0));
        raycaster.far = raycastDistance;

        const intersects = raycaster.intersectObject(skycastleModel, true);
        if (intersects.length === 0) {
            edgeFound = true;
        }
    });

    return edgeFound;
}

function updateMovement(delta) {
    if (!monk) return;

    collisionCheckTimer += delta;
    if (collisionCheckTimer >= collisionPrecision) {
        checkGround();
        collisionCheckTimer = 0;
    }

    // Apply gravity
    if (!isGrounded) {
        velocityY += gravity * delta;
    } else {
        velocityY = Math.max(velocityY, 0);
    }

    // Movement logic
    if (isGrounded || velocityY < 0) {
        if (moveDirection.length() > 0) {
            const cameraForward = new THREE.Vector3();
            camera.getWorldDirection(cameraForward);
            cameraForward.y = 0;
            cameraForward.normalize();

            const cameraRight = new THREE.Vector3();
            cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));

            const moveX = moveDirection.x * moveSpeed * delta;
            const moveZ = -moveDirection.y * moveSpeed * delta;

            const prevPosition = monk.position.clone();

            // Check for edge ahead before moving
            const edgeAhead = checkEdgeAhead();
            
            if (!edgeAhead) {
                monk.position.x += cameraRight.x * moveX + cameraForward.x * moveZ;
                monk.position.z += cameraRight.z * moveX + cameraForward.z * moveZ;
            }

            // Verify we didn't move through geometry
            if (collisionCheckTimer === 0) {
                if (!checkGround()) {
                    // Revert movement if we fell through
                    monk.position.copy(prevPosition);
                    if (!isGrounded) {
                        // If we're falling, restore last valid position
                        monk.position.copy(lastValidPosition);
                        velocityY = 0;
                        isGrounded = true;
                    }
                } else {
                    // Update last valid position if movement was successful
                    lastValidPosition.copy(monk.position);
                }
            }

            if (moveDirection.length() > 0.3) {
                const moveAngle = Math.atan2(
                    cameraRight.x * moveX + cameraForward.x * moveZ,
                    cameraRight.z * moveX + cameraForward.z * moveZ
                );
                monk.rotation.y = moveAngle;
            }
        }
    }

    // Apply vertical movement
    monk.position.y += velocityY * delta;

    // Final ground check to prevent falling through
    if (collisionCheckTimer === 0 && !checkGround() && isGrounded) {
        monk.position.copy(lastValidPosition);
        velocityY = 0;
        isGrounded = true;
    }
}

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

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    if (mixer) mixer.update(delta);
    updateMovement(delta);
    updateCamera();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
