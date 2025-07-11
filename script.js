import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

console.log("SCRIPT START: script.js is loading!");

// Scene Setup
const container = document.getElementById('canvas-container');
console.log("Container element:", container);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Black background for easier visibility of text
console.log("Three.js Scene initialized.");

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// Adjusted camera offset - fine-tune these values
const cameraOffset = new THREE.Vector3(0, 4, -6); // Higher, a bit closer to monk's back
console.log("Camera created.");

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: false }); // Antialias false for performance
const renderWidth = window.innerWidth * 0.5; // Render at 50% width
const renderHeight = window.innerHeight * 0.5; // Render at 50% height
renderer.setSize(renderWidth, renderHeight, false); // false means don't update style automatically
renderer.domElement.style.width = '100%'; // Stretch back to full size
renderer.domElement.style.height = '100%'; // Stretch back to full size
renderer.shadowMap.enabled = false; // Disable shadow mapping
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

    // Match the WebGL renderer's internal resolution
    css2dRenderer.setSize(renderWidth, renderHeight);
    css2dRenderer.domElement.style.position = 'absolute';
    css2dRenderer.domElement.style.top = '0px';
    css2dRenderer.domElement.style.pointerEvents = 'none'; // Allows clicks to pass through to the canvas
    css2dRenderer.domElement.style.width = '100%';
    css2dRenderer.domElement.style.height = '100%';
    
    const hudContainer = document.getElementById('hud-container');
    console.log("HUD Container element:", hudContainer); // Check if hud-container is found

    if (hudContainer) {
        hudContainer.appendChild(css2dRenderer.domElement);
        console.log("CSS2DRenderer DOM element appended to hud-container.");
    } else {
        console.error("Error: #hud-container not found! Appending CSS2DRenderer to body as fallback.");
        document.body.appendChild(css2dRenderer.domElement);
    }
    
    hud = new THREE.Object3D();
    camera.add(hud); // KEY CHANGE: Make HUD a child of the camera for screen-fixed behavior
    console.log("HUD Object3D added as child of camera.");

    // Get the actual HTML elements
    trackingStatusElement = document.getElementById('tracking-status');
    gestureDisplayElement = document.getElementById('gesture-display');
    healthBarContainerElement = document.getElementById('health-bar-container');
    healthBarFillElement = document.getElementById('health-bar-fill');

    console.log("HTML elements found:", { trackingStatusElement, gestureDisplayElement, healthBarContainerElement, healthBarFillElement });

    // Create CSS2DObjects for the HTML elements
    trackingStatus2D = new CSS2DObject(trackingStatusElement);
    hud.add(trackingStatus2D);

    gestureDisplay2D = new CSS2DObject(gestureDisplayElement);
    hud.add(gestureDisplay2D);

    healthBar2D = new CSS2DObject(healthBarContainerElement);
    hud.add(healthBar2D);

    // Initial positioning (relative to camera's local space) - will be refined in resize
    // These values are small because they are local to the camera's space.
    const hudZ = -0.5; // Constant depth in front of camera, small negative value
    trackingStatus2D.position.set(-0.8, 0.4, hudZ); // Top-left
    gestureDisplay2D.position.set(0, 0, hudZ); // Center
    healthBar2D.position.set(0.8, 0.4, hudZ); // Top-right

} catch (e) {
    console.error("ERROR DURING CSS2DRenderer SETUP:", e);
}
console.log("Finished CSS2DRenderer setup attempt.");
// --- END CSS2DRenderer Debug Block ---

// Example health variable (for later use)
let playerHealth = 100;

// Physics
const clock = new THREE.Clock();
const gravity = -15;
let velocityY = 0;
const monkHeight = 2; // Monk is invisible, but this is used for physics if he were to interact with ground
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

// --- Magical Effects ---
const activeEffects = []; // To keep track of effects for animation

// Function to create a glowing orb effect
function createGlowingOrb(position) {
    const orbGeometry = new THREE.SphereGeometry(0.2, 8, 8); // Simplified geometry
    const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.0 }); // Orange color
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    orb.position.copy(position);
    scene.add(orb);

    const pointLight = new THREE.PointLight(0xffa500, 0, 5); // Reduced distance
    pointLight.position.copy(position);
    scene.add(pointLight);

    let progress = 0; // 0 to 1, for fade in/out
    const duration = 1.0; // seconds

    activeEffects.push({
        type: 'orb',
        object: orb,
        light: pointLight,
        startTime: Date.now(),
        duration: duration,
        update: function() {
            const elapsed = (Date.now() - this.startTime) / 1000;
            progress = Math.min(1, elapsed / this.duration);

            if (progress < 0.5) { // Fade in
                this.object.material.opacity = progress * 2;
                this.light.intensity = progress * 2 * 2; // Max intensity 4
            } else { // Fade out
                this.object.material.opacity = (1 - progress) * 2;
                this.light.intensity = (1 - progress) * 2 * 2;
            }

            if (progress >= 1) {
                scene.remove(this.object);
                scene.remove(this.light);
                this.object.geometry.dispose();
                this.object.material.dispose();
                return true; // Indicate completion
            }
            return false; // Not yet complete
        }
    });
}

// Function to create a particle burst effect
function createParticleBurst(position) {
    const particles = [];
    const particleCount = 20; // Reduced from 50
    const particleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 1 }); // Cyan color

    for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 4, 4); // Simplified geometry
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone()); // Clone material for individual opacity
        particle.position.copy(position);
        
        // Give each particle a random velocity
        const speed = Math.random() * 2 + 1; // 1 to 3 units/sec
        const angleX = Math.random() * Math.PI * 2;
        const angleY = Math.random() * Math.PI; // Full 3D sphere spread
        particle.velocity = new THREE.Vector3(
            speed * Math.sin(angleY) * Math.cos(angleX),
            speed * Math.cos(angleY),
            speed * Math.sin(angleY) * Math.sin(angleX)
        );
        scene.add(particle);
        particles.push(particle);
    }

    let progress = 0;
    const duration = 1.5; // seconds

    activeEffects.push({
        type: 'burst',
        objects: particles, // An array of objects
        startTime: Date.now(),
        duration: duration,
        update: function(delta) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            progress = Math.min(1, elapsed / this.duration);

            this.objects.forEach(p => {
                p.position.x += p.velocity.x * delta;
                p.position.y += p.velocity.y * delta;
                p.position.z += p.velocity.z * delta;
                
                // Fade out particles
                p.material.opacity = 1 - progress;
            });

            if (progress >= 1) {
                this.objects.forEach(p => {
                    scene.remove(p);
                    p.geometry.dispose();
                    p.material.dispose();
                });
                return true; // Indicate completion
            }
            return false; // Not yet complete
        }
    });
}

// Model Loader
function loadModel(url) {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
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
    console.log("init() function called.");
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = false; // Disable shadow casting
    scene.add(directionalLight);
    console.log("Lights added.");

    try {
        console.log("Attempting to load models...");
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = false; // Disable shadow receiving
            }
        });
        scene.add(skycastleModel);
        console.log("Skycastle loaded.");

        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        monk.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = false; // Disable shadow casting
            }
        });
        scene.add(monk);
        monk.scale.set(0.5, 0.5, 0.5);
        monk.position.copy(initialMonkPosition);
        // *** Disable monk rendering ***
        monk.visible = false; // Monk is invisible
        snapToGround();
        console.log("Monk loaded and hidden.");

        setupAnimations(monkGLTF); // Animations are still setup for mixer, even if monk is invisible
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
        if (trackingStatusElement) {
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
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 160 }, // Reduced resolution
                height: { ideal: 120 } // Reduced resolution
            }
        });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            enableWebcam = true;
            console.log("Webcam loaded successfully. Stream active.");
            if (trackingStatusElement) trackingStatusElement.textContent = 'Webcam active. Perform the gesture:';
            if (gestureDisplayElement) gestureDisplayElement.style.display = 'block';
            if (healthBarContainerElement) healthBarContainerElement.style.display = 'block';
            
            displayCurrentGesture(); // This will show the first gesture
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
let lastRecognitionTime = 0;
const recognitionInterval = 333; // Recognize every 333ms (~3 FPS)

async function recognizeGestures() {
    if (!gestureRecognizer || !enableWebcam || !videoElement || !videoElement.videoWidth) {
        requestAnimationFrame(recognizeGestures);
        return;
    }

    const now = performance.now();
    if (videoElement.currentTime !== lastVideoTime && (now - lastRecognitionTime > recognitionInterval)) {
        const results = gestureRecognizer.recognizeForVideo(videoElement, now);
        onGestureResults(results);
        lastVideoTime = videoElement.currentTime;
        lastRecognitionTime = now;
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

    if (trackingStatusElement) {
        trackingStatusElement.textContent = `Tracking: ${detectedEmoji || '...'}`;
    }
    // Always show the target gesture with a prefix
    if (gestureDisplayElement) {
        gestureDisplayElement.textContent = `Perform: ${currentExpectedEmoji}`;
    }

    // Update health bar (example)
    if (detectedEmoji === currentExpectedEmoji && (currentTime - lastGestureProcessedTime >= GESTURE_DEBOUNCE_MS)) {
        playerHealth = Math.min(100, playerHealth + 5); // Heal on correct gesture
        updateHealthBar();
    } else if (detectedEmoji !== '' && detectedEmoji !== 'None' && detectedEmoji !== currentExpectedEmoji && (currentTime - lastGestureProcessedTime >= GESTURE_DEBOUNCE_MS)) {
        playerHealth = Math.max(0, playerHealth - 5); // Damage on wrong gesture
        updateHealthBar();
    }
    
    if (!gestureDisplayElement) return; // Prevent errors if element is null

    // Check if enough time has passed since the last successful gesture
    if (currentTime - lastGestureProcessedTime < GESTURE_DEBOUNCE_MS) {
        // Debouncing: just show status, don't progress or re-trigger damage/heal
        if (detectedEmoji === currentExpectedEmoji) {
            gestureDisplayElement.style.color = 'lightgreen'; // Use a different green for feedback
        } else if (detectedEmoji !== '' && detectedEmoji !== 'None') {
            gestureDisplayElement.style.color = 'red';
        } else {
            gestureDisplayElement.style.color = 'skyblue'; // Default prompt color
        }
        return;
    }

    // If we reach here, we are outside the debounce period, so we can process a new gesture for progression
    if (detectedEmoji === currentExpectedEmoji) {
        gestureDisplayElement.style.color = 'green'; // Bright green for correct
        console.log(`Correct gesture '${detectedCategoryName}' (${detectedEmoji}) performed!`);

        // --- Magical Effect Triggering ---
        // Use the monk's position as the origin for the effects
        const effectPosition = monk.position.clone();
        
        // Choose an effect based on the gesture or cycle through them
        if (currentGestureIndex % 2 === 0) { // Every other gesture
            createGlowingOrb(effectPosition);
        } else {
            createParticleBurst(effectPosition);
        }
        // --- End Magical Effect Triggering ---

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

        // Flash green, then move to next gesture after delay
        setTimeout(() => {
            currentGestureIndex = (currentGestureIndex + 1) % gestureQueue.length;
            displayCurrentGesture(); // Move to next gesture and reset color
        }, GESTURE_FLASH_DURATION_MS);

    } else if (detectedEmoji !== '' && detectedEmoji !== 'None') {
        gestureDisplayElement.style.color = '#ff0000'; // Bright red for incorrect
        setTimeout(() => {
            if (gestureDisplayElement.style.color === '#ff0000') { // Only revert if still red
                 gestureDisplayElement.style.color = 'skyblue'; // Revert to prompt color
                 if (gestureDisplayElement) gestureDisplayElement.textContent = `Perform: ${currentExpectedEmoji}`; // Revert prompt
            }
        }, 200); // Short flash for wrong gesture
    } else {
        // If no relevant gesture is detected (e.g., hand not visible, "None" gesture),
        // ensure the display color is the default for the *target* gesture.
        gestureDisplayElement.style.color = 'skyblue'; // Default prompt color
    }
}

// *** Function to display the currently targeted gesture from the queue ***
function displayCurrentGesture() {
    if (gestureDisplayElement) { // Check if element exists
        gestureDisplayElement.textContent = `Perform: ${gestureQueue[currentGestureIndex]}`; // Show the instruction
        gestureDisplayElement.style.display = 'block';
        gestureDisplayElement.style.color = 'skyblue'; // Default prompt color
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

let lastFrameTime = 0;
const targetFPS = 30;
const frameTime = 1000 / targetFPS;

function animate(currentTime) {
    requestAnimationFrame(animate);
    if (currentTime - lastFrameTime < frameTime) return;
    lastFrameTime = currentTime;

    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    updateMovement(delta);
    checkGround();
    updateCamera();
    renderer.render(scene, camera);
    
    if (css2dRenderer) {
        css2dRenderer.render(scene, camera);
    }

    // --- Update active effects ---
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const effect = activeEffects[i];
        if (effect.update(delta)) { // Pass delta to effect update
            activeEffects.splice(i, 1); // Remove completed effect
        }
    }
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const newRenderWidth = window.innerWidth * 0.5; // Match the 50% scaling
        const newRenderHeight = window.innerHeight * 0.5;

        camera.aspect = window.innerWidth / window.innerHeight; // Camera aspect still based on full window
        camera.updateProjectionMatrix();

        renderer.setSize(newRenderWidth, newRenderHeight, false); // false to allow CSS scaling
        // Update the CSS to stretch the canvas and CSS2D renderer to fill the window
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';

        if (css2dRenderer) {
            css2dRenderer.setSize(newRenderWidth, newRenderHeight); // Match internal render resolution
            css2dRenderer.domElement.style.width = '100%';
            css2dRenderer.domElement.style.height = '100%';

            // HUD positioning relative to camera's local coordinates.
            // These positions are fixed values, independent of screen resolution.
            // You might need to tweak them depending on your camera's FOV and desired spacing.
            const hudZ = -0.5; // Constant depth in front of camera
            if (trackingStatus2D) trackingStatus2D.position.set(-0.8, 0.4, hudZ);
            if (gestureDisplay2D) gestureDisplay2D.position.set(0, 0, hudZ);
            if (healthBar2D) healthBar2D.position.set(0.8, 0.4, hudZ);
        }
    }, 100);
});

console.log("Calling init().");
init();
console.log("End of script.js.");
