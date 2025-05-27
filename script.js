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
const moveSpeed = 8;
let isMoving = false;

// Initial Position
const initialMonkPosition = new THREE.Vector3(6.18, 29.792, 24.658);

// Bounding Box
const monkBox = new THREE.Box3();

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
        scene.add(skycastleModel);

        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        scene.add(monk);
        monk.scale.set(0.5, 0.5, 0.5);
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

function snapToGround() {
    if (!monk || !skycastleModel) return;

    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(0, -1, 0));
    raycaster.far = 20;

    const intersects = raycaster.intersectObject(skycastleModel, true);
    if (intersects.length > 0) {
        monk.position.y = intersects[0].point.y + monkHeight / 2 + groundOffset;
        velocityY = 0;
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
    runAction = mixer.clipAction(gltf.animations.find(a => /run/i.test(a.name)));

    // Set animation speeds
    idleAction.timeScale = 1.0;
    runAction.timeScale = 1.5;

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
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        isMoving = false;
        if (currentAction !== idleAction) {
            currentAction.fadeOut(0.2);
            idleAction.reset().fadeIn(0.2).play();
            currentAction = idleAction;
        }
    });
}

function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', resetMonkPosition);
}

function updateMovement(delta) {
    if (!monk || moveDirection.length() === 0) return;

    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();

    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));

    const moveX = moveDirection.x * moveSpeed * delta;
    const moveZ = -moveDirection.y * moveSpeed * delta;

    const newPos = monk.position.clone();
    newPos.x += cameraRight.x * moveX + cameraForward.x * moveZ;
    newPos.z += cameraRight.z * moveX + cameraForward.z * moveZ;

    const raycaster = new THREE.Raycaster();
    raycaster.set(newPos.clone().add(new THREE.Vector3(0, monkHeight / 2, 0)), new THREE.Vector3(0, -1, 0));
    raycaster.far = 5;
    const groundHits = raycaster.intersectObject(skycastleModel, true);

    if (groundHits.length > 0) {
        monk.position.copy(newPos);

        if (moveDirection.length() > 0.3) {
            const moveAngle = Math.atan2(
                cameraRight.x * moveX + cameraForward.x * moveZ,
                cameraRight.z * moveX + cameraForward.z * moveZ
            );
            monk.rotation.y = moveAngle;
        }

        if (currentAction !== runAction) {
            currentAction?.fadeOut(0.2);
            runAction?.reset().fadeIn(0.2).play();
            currentAction = runAction;
        }

        isMoving = true;
    }
}

function checkGround() {
    if (!monk || !skycastleModel) return false;

    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position.clone().add(new THREE.Vector3(0, monkHeight / 2, 0)), new THREE.Vector3(0, -1, 0));
    raycaster.far = 10;

    const intersects = raycaster.intersectObject(skycastleModel, true);
    const wasGrounded = intersects.length > 0;

    const delta = clock.getDelta();

    if (!wasGrounded) {
        velocityY += gravity * delta;
        monk.position.y += velocityY * delta;

        if (velocityY < -2) {
            snapToGround();
        }
    } else {
        if (velocityY < 0) {
            monk.position.y = intersects[0].point.y + monkHeight / 2 + groundOffset;
        }
        velocityY = 0;
    }

    return wasGrounded;
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
    checkGround();
    updateCamera();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
    
