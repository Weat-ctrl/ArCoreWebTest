import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

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
let mixer, idleAction, runAction, attack1Action, attack2Action, currentAction;
const moveDirection = new THREE.Vector2();
const moveSpeed = 20;
let isMoving = false;

// Initial Position
const initialMonkPosition = new THREE.Vector3(6.18, 29.792, 24.658);

// Hand Tracking / Gesture Recognition
let gestureRecognizer;
let videoElement;
const trackingStatus = document.getElementById('tracking-status');
const gestureDisplay = document.getElementById('gesture-display');

let enableWebcam = false; // Flag to control webcam activation

// Gesture Queue
const gestureQueue = ['✊', '✋', '☝️', '👎', '👍', '✌️']; // Available gestures
let currentGestureIndex = 0;
let lastRecognizedGesture = null;
let lastGestureUpdateTime = 0;
const GESTURE_COOLDOWN_MS = 500; // Time before same gesture can be re-recognized

let lastAttackAnimation = null; // To alternate between attack1 and attack2

// Model Loader
function loadModel(url) {
    return new Promise((resolve) => {
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => resolve(gltf),
            undefined,
            (error) => {
                console.warn(`Failed to load model from ${url}. Creating fallback. Error:`, error);
                resolve(createFallbackModel());
            }
        );
    });
}

function createFallbackModel() {
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    return { scene: box, animations: [] };
}

// Initialize
async function init() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    try {
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
            }
        });
        scene.add(skycastleModel);

        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        monk.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
            }
        });
        scene.add(monk);
        monk.scale.set(0.5, 0.5, 0.5);
        monk.position.copy(initialMonkPosition);
        snapToGround();

        setupAnimations(monkGLTF);
        setupJoystick();
        setupResetButton();
        await setupGestureRecognizer(); // Initialize gesture recognizer
        animate();
    } catch (error) {
        console.error("Initialization error:", error);
        trackingStatus.textContent = `Error initializing: ${error.message}`;
        trackingStatus.style.color = '#ff0000';
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
    if (currentAction !== idleAction) {
        currentAction?.fadeOut(0.2);
        idleAction?.reset().fadeIn(0.2).play();
        currentAction = idleAction;
    }
    isMoving = false;
    moveDirection.set(0, 0);
}

function setupAnimations(gltf) {
    if (!gltf.animations?.length) {
        console.warn("No animations found in GLTF model.");
        return;
    }

    mixer = new THREE.AnimationMixer(monk);

    idleAction = mixer.clipAction(gltf.animations.find(a => /idle|stand/i.test(a.name)) || gltf.animations[0]);
    runAction = mixer.clipAction(gltf.animations.find(a => /run/i.test(a.name)) || gltf.animations[0]);

    // Find and assign attack animations
    attack1Action = mixer.clipAction(gltf.animations.find(a => /attack|Attack1|punch/i.test(a.name)) || gltf.animations[0]);
    attack2Action = mixer.clipAction(gltf.animations.find(a => /attack2|kick|special/i.test(a.name)) || gltf.animations[0]);

    // Ensure they exist, fallback if not
    if (!attack1Action) {
        console.warn("Attack1 animation not found. Falling back to idle.");
        attack1Action = idleAction;
    }
    if (!attack2Action) {
        console.warn("Attack2 animation not found. Falling back to idle.");
        attack2Action = idleAction;
    }

    if (idleAction) {
        idleAction.play();
        currentAction = idleAction;
    } else {
        console.warn("Idle animation not found, character may not animate.");
    }

    // Listener to return to idle after attack animations complete
    mixer.addEventListener('finished', (e) => {
        if ((e.action === attack1Action || e.action === attack2Action) && currentAction === e.action) {
            if (!isMoving) { // Only return to idle if not currently moving
                 currentAction?.fadeOut(0.2);
                 idleAction?.reset().fadeIn(0.2).play();
                 currentAction = idleAction;
            } else { // If moving, return to run animation
                 currentAction?.fadeOut(0.2);
                 runAction?.reset().fadeIn(0.2).play();
                 currentAction = runAction;
            }
        }
    });
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
        moveDirection.set(data.vector.x, data.vector.y);
        if (!isMoving) { // Transition to run only if not already moving
            isMoving = true;
            if (currentAction !== runAction && runAction) {
                currentAction?.fadeOut(0.2);
                runAction?.reset().fadeIn(0.2).play();
                currentAction = runAction;
            }
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        isMoving = false;
        if (currentAction !== idleAction && idleAction) {
            currentAction?.fadeOut(0.2);
            idleAction?.reset().fadeIn(0.2).play();
            currentAction = idleAction;
        }
    });
}

function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', resetMonkPosition);
}

// *** NEW: Setup Gesture Recognizer ***
async function setupGestureRecognizer() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    gestureRecognizer = await GestureRecognizer.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/gesture_recognizer.task"
            },
            runningMode: "VIDEO",
            numHands: 1 // Only recognize one hand for simplicity
        }
    );

    videoElement = document.createElement('video');
    videoElement.style.display = 'none';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    document.body.appendChild(videoElement);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            enableWebcam = true; // Enable webcam processing only after metadata loads
            console.log("Webcam loaded successfully.");
            trackingStatus.textContent = 'Webcam active. Waiting for gesture...';
            gestureDisplay.style.display = 'block'; // Show the gesture display
            displayNextGestureInQueue(); // Show the first gesture
            videoElement.play(); // Explicitly play after onloadedmetadata
            recognizeGestures(); // Start gesture recognition loop
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
        trackingStatus.textContent = 'Camera access denied or error!';
        trackingStatus.style.color = '#ff0000';
        gestureDisplay.style.display = 'none'; // Hide gesture display if camera fails
    }
}

// *** NEW: Gesture Recognition Loop ***
let lastVideoTime = -1;
async function recognizeGestures() {
    if (!gestureRecognizer || !enableWebcam || !videoElement.videoWidth) {
        requestAnimationFrame(recognizeGestures);
        return;
    }

    if (videoElement.currentTime !== lastVideoTime) {
        const results = gestureRecognizer.recognizeForVideo(videoElement, performance.now());
        onGestureResults(results);
        lastVideoTime = videoElement.currentTime;
    }

    requestAnimationFrame(recognizeGestures);
}

// *** NEW: Process Gesture Results ***
function onGestureResults(results) {
    const currentTime = Date.now();

    if (results.gestures.length > 0) {
        const recognizedGesture = results.gestures[0][0].categoryName;
        // console.log("Detected: ", recognizedGesture); // For debugging

        trackingStatus.textContent = `Gesture: ${recognizedGesture}`;
        trackingStatus.style.color = '#55ff55';

        const expectedGesture = gestureQueue[currentGestureIndex];

        // Check if the recognized gesture matches the expected one AND respects cooldown
        if (recognizedGesture === expectedGesture && (currentTime - lastGestureUpdateTime > GESTURE_COOLDOWN_MS || lastRecognizedGesture !== recognizedGesture)) {
            gestureDisplay.textContent = recognizedGesture; // Update emoji to the recognized one
            gestureDisplay.style.color = 'green'; // Change color to green

            console.log(`Correct gesture '${recognizedGesture}' performed!`);
            playMonkAttack(); // Trigger monk attack

            // Move to next gesture in queue after a short delay for visual feedback
            setTimeout(() => {
                currentGestureIndex = (currentGestureIndex + 1) % gestureQueue.length;
                displayNextGestureInQueue();
                gestureDisplay.style.color = 'rgba(255,255,255,0.7)'; // Reset color
            }, 700); // Give time for user to see green and monk animation start

            lastRecognizedGesture = recognizedGesture;
            lastGestureUpdateTime = currentTime;

        } else if (recognizedGesture !== expectedGesture) {
            // Optional: If wrong gesture, briefly flash red or show a "X" emoji
            gestureDisplay.style.color = 'red';
            setTimeout(() => {
                gestureDisplay.style.color = 'rgba(255,255,255,0.7)';
            }, 200);
            lastRecognizedGesture = recognizedGesture; // Update last recognized to prevent repeated red flashes for the same wrong gesture
            lastGestureUpdateTime = currentTime;
        }

    } else {
        trackingStatus.textContent = 'No gesture detected';
        trackingStatus.style.color = '#ff5555';
        lastRecognizedGesture = null; // Clear last recognized if no hand is detected
    }
}

// *** NEW: Display Next Gesture ***
function displayNextGestureInQueue() {
    gestureDisplay.textContent = gestureQueue[currentGestureIndex];
    gestureDisplay.style.display = 'block';
}

// *** NEW: Play Monk Attack Animation ***
function playMonkAttack() {
    let nextAttackAction;
    if (lastAttackAnimation === attack1Action) {
        nextAttackAction = attack2Action;
    } else {
        nextAttackAction = attack1Action;
    }
    lastAttackAnimation = nextAttackAction;

    if (currentAction !== nextAttackAction) {
        currentAction?.fadeOut(0.2);
        nextAttackAction?.reset().fadeIn(0.2).play();
        currentAction = nextAttackAction;
    }
}

function updateMovement(delta) {
    if (!monk || !isMoving) return;

    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();

    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));

    const moveZ = moveDirection.y * moveSpeed * delta;
    const moveX = moveDirection.x * moveSpeed * delta;

    const newPos = monk.position.clone();
    newPos.x += cameraForward.x * moveZ + cameraRight.x * moveX;
    newPos.z += cameraForward.z * moveZ + cameraRight.z * moveX;

    const raycaster = new THREE.Raycaster();
    raycaster.set(newPos.clone().add(new THREE.Vector3(0, monkHeight / 2, 0)), new THREE.Vector3(0, -1, 0));
    raycaster.far = 5;
    const groundHits = raycaster.intersectObject(skycastleModel, true);

    if (groundHits.length > 0) {
        monk.position.copy(newPos);

        const actualMoveVector = new THREE.Vector3(
            cameraForward.x * moveZ + cameraRight.x * moveX,
            0,
            cameraForward.z * moveZ + cameraRight.z * moveX
        );

        if (actualMoveVector.lengthSq() > 0.01) {
            const targetAngle = Math.atan2(actualMoveVector.x, actualMoveVector.z);
            monk.rotation.y = targetAngle;
        }
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

        if (velocityY < -5) {
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

    const relativeCameraOffset = cameraOffset.clone().applyQuaternion(monk.quaternion);
    const targetPosition = monk.position.clone().add(relativeCameraOffset);

    camera.position.lerp(targetPosition, 0.1);
    camera.lookAt(monk.position.clone().add(new THREE.Vector3(0, monkHeight / 4, 0)));
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
