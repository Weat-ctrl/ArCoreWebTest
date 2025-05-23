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
const moveSpeed = 24;
let isMoving = false;
let joystick; // For VirtualJoystick instance

// Initialize monk at specific position
const initialMonkPosition = new THREE.Vector3(6.18, 29.792, 24.658);

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
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    return { scene: new THREE.Mesh(geometry, material), animations: [] };
}

async function init() {
    // Add VirtualJoystick.js script dynamically
    await loadScript('https://cdn.jsdelivr.net/npm/virtual-joystick.js@latest/virtualjoystick.js');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    try {
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);

        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        monk.scale.set(0.5, 0.5, 0.5);
        scene.add(monk);

        monk.position.copy(initialMonkPosition);
        snapToGround();

        setupAnimations(monkGLTF);
        setupJoystick();
        setupResetButton();

        animate();
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

function loadScript(src) {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

function snapToGround() {
    if (!monk || !skycastleModel) return;

    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position.clone().add(new THREE.Vector3(0, 10, 0)), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(skycastleModel, true);
    if (intersects.length > 0) {
        monk.position.y = intersects[0].point.y + monkHeight / 2 + groundOffset;
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

    // Set animation speed to match movement
    runAction.setEffectiveTimeScale(1.5); // Adjust this value to match movement speed
    idleAction.play();
    currentAction = idleAction;
}

function setupJoystick() {
    // Remove any existing joystick
    if (joystick) {
        document.getElementById('joystick-wrapper').innerHTML = '';
    }

    // Create VirtualJoystick
    joystick = new VirtualJoystick({
        container: document.getElementById('joystick-wrapper'),
        mouseSupport: true,
        stationaryBase: true,
        baseX: 60,
        baseY: window.innerHeight - 60,
        limitStickTravel: true,
        stickRadius: 50
    });

    // Style the joystick
    joystick.base.style.border = '2px solid rgba(255,255,255,0.5)';
    joystick.base.style.borderRadius = '50%';
    joystick.stick.style.backgroundColor = 'rgba(255,255,255,0.5)';
    joystick.stick.style.borderRadius = '50%';
}

function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', resetMonkPosition);
}

function updateMovement(delta) {
    if (!monk || !joystick) return;

    // Get joystick input (already correctly oriented)
    moveDirection.set(
        joystick.deltaX() / 50, // Normalize values
        -joystick.deltaY() / 50 // Invert Y axis for correct forward/back
    );

    // Update animation state
    if (moveDirection.length() > 0.1) {
        if (!isMoving) {
            idleAction?.fadeOut(0.2);
            runAction?.reset().fadeIn(0.2).play();
            currentAction = runAction;
            isMoving = true;
        }
        
        // Sync animation speed with movement speed
        const speedFactor = moveDirection.length() * 1.5;
        runAction.setEffectiveTimeScale(speedFactor);
    } else {
        if (isMoving) {
            runAction?.fadeOut(0.2);
            idleAction?.reset().fadeIn(0.2).play();
            currentAction = idleAction;
            isMoving = false;
        }
    }

    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();

    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();

    const moveX = moveDirection.x * moveSpeed * delta;
    const moveZ = moveDirection.y * moveSpeed * delta;

    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(cameraRight, moveX);
    moveVector.addScaledVector(cameraForward, moveZ);

    const prevPosition = monk.position.clone();
    monk.position.add(moveVector);

    // Wall collision
    const forwardRay = new THREE.Raycaster(
        monk.position.clone().add(new THREE.Vector3(0, monkHeight / 2, 0)),
        moveVector.clone().normalize()
    );
    const wallHits = forwardRay.intersectObject(skycastleModel, true);
    if (wallHits.length > 0 && wallHits[0].distance < 1.0) {
        monk.position.copy(prevPosition);
    }

    // Rotate monk
    if (moveDirection.length() > 0.3) {
        monk.rotation.y = Math.atan2(moveVector.x, moveVector.z);
    }
}

function checkTerrainCollision() {
    if (!monk || !skycastleModel) return true;

    const downRay = new THREE.Raycaster(
        monk.position.clone().add(new THREE.Vector3(0, monkHeight / 2, 0)),
        new THREE.Vector3(0, -1, 0)
    );
    const groundHits = downRay.intersectObject(skycastleModel, true);

    if (groundHits.length > 0) {
        const groundY = groundHits[0].point.y;
        if (monk.position.y > groundY + monkHeight / 2 + groundOffset) {
            velocityY += gravity * clock.getDelta();
            monk.position.y += velocityY * clock.getDelta();
        } else {
            velocityY = 0;
            monk.position.y = groundY + monkHeight / 2 + groundOffset;
        }
    } else {
        velocityY += gravity * clock.getDelta();
        monk.position.y += velocityY * clock.getDelta();
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
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);
    updateMovement(delta);
    checkTerrainCollision();
    updateCamera();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Reposition joystick on resize
    if (joystick) {
        joystick.base.style.left = '60px';
        joystick.base.style.bottom = '60px';
    }
});

init();
