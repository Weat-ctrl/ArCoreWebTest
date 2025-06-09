import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";
// nipplejs is loaded as a global script in index.html, so no import needed here if that's the case.

console.log("SCRIPT START: script.js is loading!");

// Scene Setup
const container = document.getElementById('canvas-container');
console.log("Container element:", container);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Black background for easier visibility of text
console.log("Three.js Scene initialized.");

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraOffset = new THREE.Vector3(0, 3, -8);
console.log("Camera created.");

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);
console.log("WebGL Renderer initialized and appended.");

// --- CSS2DRenderer Setup for HUD ---
let css2dRenderer;
let hud; // Make hud globally accessible for resize handler
let trackingStatus2D, gestureDisplay2D, healthBar2D; // Make these globally accessible too
let trackingStatusElement, gestureDisplayElement, healthBarContainerElement, healthBarFillElement;


console.log("Attempting CSS2DRenderer setup...");
try {
    css2dRenderer = new CSS2DRenderer();
    console.log("CSS2DRenderer instance created.");

    css2dRenderer.setSize(window.innerWidth, window.innerHeight);
    css2dRenderer.domElement.style.position = 'absolute';
    css2dRenderer.domElement.style.top = '0px';
    css2dRenderer.domElement.style.pointerEvents = 'none'; // Allows clicks to pass through to the canvas
    
    const hudContainer = document.getElementById('hud-container');
    console.log("HUD Container element:", hudContainer); // Check if hud-container is found

    if (hudContainer) {
        hudContainer.appendChild(css2dRenderer.domElement);
        console.log("CSS2DRenderer DOM element appended to hud-container.");
    } else {
        console.error("Error: #hud-container not found! Appending CSS2DRenderer to body as fallback.");
        document.body.appendChild(css2dRenderer.domElement);
    }
    
    // Create a Three.js Object3D to hold all our CSS2DObjects
    hud = new THREE.Object3D();
    scene.add(hud);
    console.log("HUD Object3D added to scene.");

    // Get the actual HTML elements
    trackingStatusElement = document.getElementById('tracking-status');
    gestureDisplayElement = document.getElementById('gesture-display');
    healthBarContainerElement = document.getElementById('health-bar-container');
    healthBarFillElement = document.getElementById('health-bar-fill');

    console.log("HTML elements found:", { trackingStatusElement, gestureDisplayElement, healthBarContainerElement, healthBarFillElement });

    // Create CSS2DObjects for the HTML elements
    // These positions are in 3D world coordinates.
    // For a screen-fixed HUD, it's often best to make the HUD itself a child of the camera,
    // so its local position (0,0,0) is the camera's position.
    // Then adjust positions relative to the camera.
    // For now, these are rough estimates for placing them in the scene for visibility.
    // We'll adjust them in the resize listener for true responsiveness.
    trackingStatus2D = new CSS2DObject(trackingStatusElement);
    hud.add(trackingStatus2D);
    console.log("trackingStatus2D created and added.");

    gestureDisplay2D = new CSS2DObject(gestureDisplayElement);
    hud.add(gestureDisplay2D);
    console.log("gestureDisplay2D created and added.");

    healthBar2D = new CSS2DObject(healthBarContainerElement);
    hud.add(healthBar2D);
    console.log("healthBar2D created and added.");

    // Set initial positions (will be adjusted in resize handler)
    // The resize handler will be called automatically after init, so these might be redundant initially.
    trackingStatus2D.position.set(-5, 3, -10); // Example initial world position
    gestureDisplay2D.position.set(0, 0, -10); // Example initial world position
    healthBar2D.position.set(5, 3, -10); // Example initial world position


} catch (e) {
    console.error("ERROR DURING CSS2DRenderer SETUP:", e);
    // If an error occurs here, ensure the rest of the script still tries to run
    // though the HUD might not work.
}
console.log("Finished CSS2DRenderer setup attempt.");
// --- END CSS2DRenderer Debug Block ---


// Example health variable (for later use)
let playerHealth = 100;

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
    return new Promise((resolve, reject) => { // Added reject for proper error handling
        const loader = new GLTFLoader(); // Use GLTFLoader directly
        loader.load(
            url,
            (gltf) => resolve(gltf),
            undefined, // onProgress
            (error) => {
                console.warn(`Failed to load model from ${url}. Creating fallback. Error:`, error);
                // Instead of just resolving with a fallback, you might want to reject
                // for critical models like the monk, or handle fallback specifically.
                resolve(createFallbackModel()); // Still resolve with fallback for now
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
    console.log("init() function called.");
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
    console.log("Lights added.");

    try {
        console.log("Attempting to load models...");
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
            }
        });
        scene.add(skycastleModel);
        console.log("Skycastle loaded.");

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
        console.log("Monk loaded and hidden.");


        setupAnimations(monkGLTF);
        console.log("Animations setup.");
        setupJoystick();
        console.log("Joystick setup.");
        setupResetButton();
        console.log("Reset button setup.");
        await setupGestureRecognizer(); // Initialize gesture recognizer
        console.log("Gesture Recognizer setup complete.");
        
        // Initial call to resize handler to correctly position HUD elements
        window.dispatchEvent(new Event('resize')); 

        animate();
        console.log("Animation loop started.");
    } catch (error) {
        console.error("Initialization error:", error);
        if (trackingStatusElement) { // Check if element exists before updating
            trackingStatusElement.textContent = `Error initializing: ${error.message}`;
            trackingStatusElement.style.color = '#ff0000';
        }
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
        mixer = new THREE.AnimationMixer(monk);
        idleAction = null;
        runAction = null;
        attack1Action = null;
        attack2Action = null;
        currentAction = null;
        return;
    }

    mixer = new THREE.AnimationMixer(monk);

    const findAnimation = (names, fallback) => {
        for (const name of names) {
            const action = gltf.animations.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
            if (action) return mixer.clipAction(action);
        }
        return fallback ? mixer.clipAction(fallback) : null;
    };

    idleAction = findAnimation(['idle', 'stand'], gltf.animations[0]);
    runAction = findAnimation(['run', 'walk'], gltf.animations[0]);
    attack1Action = findAnimation(['attack', 'attack1', 'punch'], gltf.animations[0]);
    attack2Action = findAnimation(['attack2', 'kick', 'special'], gltf.animations[0]);

    if (!idleAction) {
        console.warn("Idle animation not found, creating a dummy action.");
        idleAction = mixer.clipAction(new THREE.AnimationClip('dummyIdle', 0, []));
        idleAction.play();
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
        attack2Action = attack1Action;
    }

    idleAction.play();
    currentAction = idleAction;
    lastAttackAnimation = attack2Action;

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
    console.log("Gesture Recognizer initialized.");

    videoElement = document.createElement('video');
    videoElement.style.display = 'none';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    document.body.appendChild(videoElement);
    console.log("Video element created.");

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            enableWebcam = true;
            console.log("Webcam loaded successfully. Stream active.");
            if (trackingStatusElement) trackingStatusElement.textContent = 'Webcam active. Waiting for gesture...';
            if (gestureDisplayElement) gestureDisplayElement.style.display = 'block';
            if (healthBarContainerElement) healthBarContainerElement.style.display = 'block';
            
            displayCurrentGesture();
            videoElement.play();
            recognizeGestures();
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
        if (trackingStatusElement) {
            trackingStatusElement.textContent = 'Camera access denied or error!';
            trackingStatusElement.style.color = '#ff0000';
        }
        if (gestureDisplayElement) gestureDisplayElement.style.display = 'none';
        if (healthBarContainerElement) healthBarContainerElement.style.display = 'none';
    }
}

// *** Gesture Recognition Loop ***
let lastVideoTime = -1;
async function recognizeGestures() {
    if (!gestureRecognizer || !enableWebcam || !videoElement || !videoElement.videoWidth) {
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
        if (results.gestures[0] && results.gestures[0][0]) {
             detectedCategoryName = results.gestures[0][0].categoryName;
             detectedEmoji = gestureEmojiMap[detectedCategoryName] || '';
        }
    }

    if (trackingStatusElement) trackingStatusElement.textContent = `Tracking: ${detectedEmoji || '...'}`;
    if (gestureDisplayElement) gestureDisplayElement.textContent = currentExpectedEmoji;

    if (detectedEmoji === currentExpectedEmoji && (currentTime - lastGestureProcessedTime >= GESTURE_DEBOUNCE_MS)) {
        playerHealth = Math.min(100, playerHealth + 5);
        updateHealthBar();
    } else if (detectedEmoji !== '' && detectedEmoji !== 'None' && detectedEmoji !== currentExpectedEmoji && (currentTime - lastGestureProcessedTime >= GESTURE_DEBOUNCE_MS)) {
        playerHealth = Math.max(0, playerHealth - 5);
        updateHealthBar();
    }
    
    if (!gestureDisplayElement) return; // Prevent errors if element is null

    if (currentTime - lastGestureProcessedTime < GESTURE_DEBOUNCE_MS) {
        if (detectedEmoji !== currentExpectedEmoji && detectedEmoji !== '') {
            gestureDisplayElement.style.color = 'red';
        } else if (detectedEmoji === currentExpectedEmoji) {
            gestureDisplayElement.style.color = 'green';
        } else {
             gestureDisplayElement.style.color = 'rgba(255,255,255,0.7)';
        }
        return;
    }

    if (detectedEmoji === currentExpectedEmoji) {
        gestureDisplayElement.style.color = 'green';
        console.log(`Correct gesture '${detectedCategoryName}' (${detectedEmoji}) performed!`);

        let nextAttackAction;
        if (lastAttackAnimation === attack1Action) {
            nextAttackAction = attack2Action;
        } else {
            nextAttackAction = attack1Action;
        }
        lastAttackAnimation = nextAttackAction;

        if (currentAction !== nextAttackAction && nextAttackAction) {
            currentAction?.fadeOut(0.2);
            nextAttackAction.reset().fadeIn(0.2).play();
            currentAction = nextAttackAction;
        }

        lastGestureProcessedTime = currentTime;

        setTimeout(() => {
            currentGestureIndex = (currentGestureIndex + 1) % gestureQueue.length;
            displayCurrentGesture();
        }, GESTURE_FLASH_DURATION_MS);

    } else if (detectedEmoji !== '' && detectedEmoji !== 'None') {
        gestureDisplayElement.style.color = 'red';
        setTimeout(() => {
            if (gestureDisplayElement.style.color === 'red') {
                 gestureDisplayElement.style.color = 'rgba(255,255,255,0.7)';
            }
        }, 200);
    } else {
        gestureDisplayElement.style.color = 'rgba(255,255,255,0.7)';
    }
}

// *** Function to display the currently targeted gesture from the queue ***
function displayCurrentGesture() {
    if (gestureDisplayElement) { // Check if element exists
        gestureDisplayElement.textContent = gestureQueue[currentGestureIndex];
        gestureDisplayElement.style.display = 'block';
        gestureDisplayElement.style.color = 'rgba(255,255,255,0.7)';
    }
}

// Function to update the health bar
function updateHealthBar() {
    if (healthBarFillElement) { // Check if element exists
        healthBarFillElement.style.width = `${playerHealth}%`;
        let color;
        if (playerHealth > 70) {
            color = '#4CAF50'; // Green
        } else if (playerHealth > 30) {
            color = '#FFC107'; // Yellow
        } else {
            color = '#F44336'; // Red
        }
        healthBarFillElement.style.backgroundColor = color;
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
    
    // Only call css2dRenderer.render if it was successfully initialized
    if (css2dRenderer) {
        css2dRenderer.render(scene, camera); // Render the CSS2D content as well
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (css2dRenderer && trackingStatus2D && healthBar2D) {
        css2dRenderer.setSize(window.innerWidth, window.innerHeight);

        // Positioning CSS2DObjects for a screen-fixed HUD.
        // It's often easier to make the HUD Object3D (hud) a child of the camera.
        // Then, the positions of trackingStatus2D, gestureDisplay2D, healthBar2D
        // are relative to the camera's local coordinate system.

        // Example: If HUD is child of camera, (0,0,0) is camera center.
        // To place elements in screen corners, you might need to manually calculate
        // positions based on camera frustum and viewport size, or just use trial-and-error
        // with small world coordinates if the hud is sufficiently far from camera.

        // Let's assume hud remains at scene origin for now, and we adjust child positions
        // to approximate screen corners. This is still a compromise for truly fixed 2D HUD.
        // For true 2D fixed HUD, the hud object should be a child of the camera.
        // For this code, we'll try to put them in the visible frustum.

        // Adjust these values based on your desired layout and camera's FOV/aspect
        // These are *world coordinates* where the 2D elements will appear.
        // They will be positioned relative to the center of the camera's view (if hud is parented to camera)
        // or relative to the scene's origin if hud is at (0,0,0).
        // Let's make them children of the camera for a true screen-fixed effect.
        // This requires a small change in setup:
        // Instead of `scene.add(hud);`, use `camera.add(hud);`
        // Then hud elements' local positions are relative to the camera.

        // For now, let's just make sure they are visible roughly where intended in 3D space:
        // (These values are placeholders, you'll need to fine-tune based on your scene)
        const depth = -5; // Z-position: how far in front of the camera the HUD appears (smaller means closer)
        const aspectRatio = window.innerWidth / window.innerHeight;
        const vFOV = camera.fov * Math.PI / 180; // convert fov to radians
        const height = 2 * Math.tan( vFOV / 2 ) * Math.abs(depth); // visible height at depth
        const width = height * aspectRatio; // visible width at depth

        // Top-left
        if (trackingStatus2D) trackingStatus2D.position.set(-width / 2 + 1, height / 2 - 0.5, depth);
        // Center
        if (gestureDisplay2D) gestureDisplay2D.position.set(0, 0, depth);
        // Top-right
        if (healthBar2D) healthBar2D.position.set(width / 2 - 1, height / 2 - 0.5, depth);
    }
});


console.log("Calling init().");
init();
console.log("End of script.js.");
