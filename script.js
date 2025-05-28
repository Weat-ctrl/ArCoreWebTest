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
const handMeshScale = 0.05;
const handDepth = 0.5;
let handsDetected = false;

// Create a status indicator
const trackingStatus = document.createElement('div');
trackingStatus.id = 'tracking-status';
trackingStatus.textContent = 'Searching for hands...';
document.body.appendChild(trackingStatus);

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
        await setupHandTracking();
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

    idleAction.timeScale = 12.0;
    runAction.timeScale = 12.5;

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
    // Remove old hand meshes
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
    
    // Create hand landmarks
    for (const landmarks of results.multiHandLandmarks) {
        createHandLandmarks(landmarks);
    }
}

function createHandLandmarks(landmarks) {
    // Create joints
    for (let i = 0; i < landmarks.length; i++) {
        const landmark = landmarks[i];
        
        const geometry = new THREE.SphereGeometry(handMeshScale * 1.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8
        });
        const sphere = new THREE.Mesh(geometry, material);
        
        // Position relative to camera
        const x = (landmark.x - 0.5) * 2 * camera.aspect;
        const y = -(landmark.y - 0.5) * 2;
        const z = -handDepth;
        
        sphere.position.set(x, y, z);
        sphere.position.applyMatrix4(camera.projectionMatrixInverse);
        
        scene.add(sphere);
        handMeshes.push(sphere);
    }
    
    // Create bones
    const connections = [
        [0, 1, 2, 3, 4],         // Thumb
        [0, 5, 6, 7, 8],         // Index finger
        [0, 9, 10, 11, 12],      // Middle finger
        [0, 13, 14, 15, 16],     // Ring finger
        [0, 17, 18, 19, 20],     // Pinky
        [5, 9, 13, 17]            // Palm base
    ];
    
    for (const connection of connections) {
        for (let i = 0; i < connection.length - 1; i++) {
            const startIdx = connection[i];
            const endIdx = connection[i + 1];
            
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];
            
            const startX = (start.x - 0.5) * 2 * camera.aspect;
            const startY = -(start.y - 0.5) * 2;
            const startZ = -handDepth;
            
            const endX = (end.x - 0.5) * 2 * camera.aspect;
            const endY = -(end.y - 0.5) * 2;
            const endZ = -handDepth;
            
            const startVec = new THREE.Vector3(startX, startY, startZ)
                .applyMatrix4(camera.projectionMatrixInverse);
            const endVec = new THREE.Vector3(endX, endY, endZ)
                .applyMatrix4(camera.projectionMatrixInverse);
            
            const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
            const material = new THREE.LineBasicMaterial({ 
                color: 0x00ff00,
                transparent: true,
                opacity: 0.8,
                linewidth: 2
            });
            const line = new THREE.Line(geometry, material);
            
            scene.add(line);
            handMeshes.push(line);
        }
    }
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
