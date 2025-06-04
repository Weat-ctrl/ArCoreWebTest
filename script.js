import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

// Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Black background for easier visibility of text

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
let mixer, idleAction, runAction, attack1Action, attack2Action, currentAction; // Now properly scoped
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
const gestureQueue = ['✊', '✋', '☝️', '👎', '👍', '✌️']; // Available gestures (emoji order matters)
let currentGestureIndex = 0;
let lastGestureProcessedTime = 0; // Tracks when the *last* valid gesture was processed and moved to next
const GESTURE_DEBOUNCE_MS = 1000; // Time to wait after a successful gesture before allowing *any* new gesture recognition
const GESTURE_FLASH_DURATION_MS = 700; // How long the correct gesture stays green

let lastAttackAnimation = null; // Re-introduced for alternation

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
        // *** Disable monk rendering ***
        monk.visible = false;
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
        // If no animations, ensure mixer is still defined for safety, but actions might be null
        mixer = new THREE.AnimationMixer(monk);
        idleAction = null;
        runAction = null;
        attack1Action = null;
        attack2Action = null;
        currentAction = null;
        return;
    }

    mixer = new THREE.AnimationMixer(monk);

    // More robust way to find animations, using a fallback to the first animation if specific names aren't found
    const findAnimation = (names, fallback) => {
        for (const name of names) {
            const action = gltf.animations.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
            if (action) return mixer.clipAction(action);
        }
        return fallback ? mixer.clipAction(fallback) : null;
    };

    idleAction = findAnimation(['idle', 'stand'], gltf.animations[0]);
    runAction = findAnimation(['run', 'walk'], gltf.animations[0]); // Added 'walk' as a common alternative
    // IMPORTANT: Use the exact names from your GLTF file if known, or common patterns
    attack1Action = findAnimation(['attack', 'attack1', 'punch'], gltf.animations[0]); // Assuming 'Attack' as the primary attack
    attack2Action = findAnimation(['attack2', 'kick', 'special'], gltf.animations[0]); // Assuming 'Attack2' as the secondary attack

    // Ensure they are not null, if no suitable animation was found, default to idleAction
    if (!idleAction) {
        console.warn("Idle animation not found, creating a dummy action.");
        idleAction = mixer.clipAction(new THREE.AnimationClip('dummyIdle', 0, [])); // Create an empty clip
        idleAction.play(); // Play dummy action to set currentAction
    }
    if (!runAction) {
        console.warn("Run animation not found, falling back to Idle.");
        runAction = idleAction;
    }
    if (!attack1Action) {
        console.warn("Attack animation (Attack or Attack1) not found, falling back to Idle.");
        attack1Action = idleAction;
    }
    if (!attack2Action) {
        console.warn("Attack2 animation not found, falling back to Attack1.");
        attack2Action = attack1Action; // Fallback to Attack1 if Attack2 isn't present
    }

    // Set initial action
    idleAction.play();
    currentAction = idleAction;
    lastAttackAnimation = attack2Action; // Initialize to attack2 so the first attack is attack1

    // Listener to return to idle/run after attack animations complete
    mixer.addEventListener('finished', (e) => {
        if ((e.action === attack1Action || e.action === attack2Action) && currentAction === e.action) {
            if (!isMoving) {
                currentAction?.fadeOut(0.2);
                idleAction?.reset().fadeIn(0.2).play();
                currentAction = idleAction;
            } else {
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
        if (!isMoving) {
            isMoving = true;
            if (currentAction !== runAction && runAction) { // Ensure runAction exists
                currentAction?.fadeOut(0.2);
                runAction?.reset().fadeIn(0.2).play();
                currentAction = runAction;
            }
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        isMoving = false;
        if (currentAction !== idleAction && idleAction) { // Ensure idleAction exists
            currentAction?.fadeOut(0.2);
            idleAction?.reset().fadeIn(0.2).play();
            currentAction = idleAction;
        }
    });
}

function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', resetMonkPosition);
}

// *** Setup Gesture Recognizer ***
async function setupGestureRecognizer() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    gestureRecognizer = await GestureRecognizer.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath: "https://weat-ctrl.github.io/ArCoreWebTest/gesture_recognizer.task"
            },
            runningMode: "VIDEO",
            numHands: 1
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
            enableWebcam = true;
            console.log("Webcam loaded successfully.");
            trackingStatus.textContent = 'Webcam active. Waiting for gesture...';
            gestureDisplay.style.display = 'block'; // Show the gesture display container
            displayCurrentGesture(); // Call this to show the first gesture
            videoElement.play();
            recognizeGestures(); // Start gesture recognition loop
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
        trackingStatus.textContent = 'Camera access denied or error!';
        trackingStatus.style.color = '#ff0000';
        gestureDisplay.style.display = 'none';
    }
}

// *** Gesture Recognition Loop ***
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

// *** Process Gesture Results ***
const gestureEmojiMap = {
    "Closed_Fist": "✊",
    "Open_Palm": "✋",
    "Pointing_Up": "☝️",
    "Thumb_Down": "👎",
    "Thumb_Up": "👍",
    "Victory": "✌️",
    "None": ""
};

function onGestureResults(results) {
    const currentTime = Date.now();
    const currentExpectedEmoji = gestureQueue[currentGestureIndex];
    let detectedEmoji = '';
    let detectedCategoryName = 'None';

    if (results.gestures.length > 0) {
        // Ensure there's a recognized gesture and it has a category name
        if (results.gestures[0] && results.gestures[0][0]) {
             detectedCategoryName = results.gestures[0][0].categoryName;
             detectedEmoji = gestureEmojiMap[detectedCategoryName] || '';
        }
    }

    trackingStatus.textContent = `Tracking: ${detectedEmoji || '...'}`;
    gestureDisplay.textContent = currentExpectedEmoji; // Always display the target gesture

    // Check if enough time has passed since the last successful gesture
    if (currentTime - lastGestureProcessedTime < GESTURE_DEBOUNCE_MS) {
        // If within debounce period, ignore new detections for progression, but still show wrong gesture
        if (detectedEmoji !== currentExpectedEmoji && detectedEmoji !== '') {
            gestureDisplay.style.color = 'red';
        } else if (detectedEmoji === currentExpectedEmoji) {
            // Keep it green if it's the right one and still debouncing
            gestureDisplay.style.color = 'green';
        } else {
             // Revert to default if no hand or 'None' detected
             gestureDisplay.style.color = 'rgba(255,255,255,0.7)';
        }
        return; // Exit early if we are debouncing
    }

    // If we reach here, we are outside the debounce period, so we can process a new gesture for progression
    if (detectedEmoji === currentExpectedEmoji) {
        gestureDisplay.style.color = 'green';
        console.log(`Correct gesture '${detectedCategoryName}' (${detectedEmoji}) performed!`);

        // *** Trigger Monk Attack (now properly alternating) ***
        let nextAttackAction;
        if (lastAttackAnimation === attack1Action) {
            nextAttackAction = attack2Action;
        } else {
            nextAttackAction = attack1Action;
        }
        lastAttackAnimation = nextAttackAction; // Store which attack was just played

        if (currentAction !== nextAttackAction && nextAttackAction) { // Ensure nextAttackAction is not null
            currentAction?.fadeOut(0.2);
            nextAttackAction.reset().fadeIn(0.2).play(); // Use .play() on the action
            currentAction = nextAttackAction;
        }

        lastGestureProcessedTime = currentTime; // Mark this time as when a successful gesture was processed

        setTimeout(() => {
            currentGestureIndex = (currentGestureIndex + 1) % gestureQueue.length;
            displayCurrentGesture(); // Move to next gesture and reset color
        }, GESTURE_FLASH_DURATION_MS);

    } else if (detectedEmoji !== '' && detectedEmoji !== 'None') {
        // Only flash red for explicitly wrong gestures, not for "None" or no hand detected
        gestureDisplay.style.color = 'red';
        setTimeout(() => {
            if (gestureDisplay.style.color === 'red') { // Only revert if still red
                 gestureDisplay.style.color = 'rgba(255,255,255,0.7)';
            }
        }, 200);
    } else {
        // If no relevant gesture is detected (e.g., hand not visible, "None" gesture),
        // ensure the display color is the default for the *target* gesture.
        gestureDisplay.style.color = 'rgba(255,255,255,0.7)';
    }
}


// *** Function to display the currently targeted gesture from the queue ***
function displayCurrentGesture() {
    gestureDisplay.textContent = gestureQueue[currentGestureIndex];
    gestureDisplay.style.display = 'block'; // Ensure it's visible
    gestureDisplay.style.color = 'rgba(255,255,255,0.7)'; // Ensure default color for the next gesture
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
