// Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraOffset = new THREE.Vector3(0, 3, -8); // This is the offset for the *scene camera* from the monk

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

// *** Crucial adjustments for hand size and placement ***
const HAND_JOINT_RADIUS = 0.005; // Very small spheres for joints
const HAND_BONE_THICKNESS = 1;   // Line thickness (1px is most reliable)
const HAND_DEPTH_SCALING_FACTOR = 10; // How much to scale MediaPipe's 'z' to fit your scene
                                    // Larger value pushes hand further back.
                                    // This is the key to making the hand appear smaller/further.
const HAND_X_OFFSET = 0;           // Optional: slight horizontal adjustment for hands
const HAND_Y_OFFSET = 0;           // Optional: slight vertical adjustment for hands

let handsDetected = false;
let videoElement; // Declare a variable for your video element

// Create a status indicator
const trackingStatus = document.getElementById('tracking-status'); // Get existing element

// Model Loader
function loadModel(url) {
    return new Promise((resolve) => {
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => resolve(gltf),
            undefined,
            () => {
                console.warn(`Failed to load model from ${url}. Creating fallback.`);
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
    return { scene: box, animations: [] }; // Ensure fallback has animations array
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
        // Ensure skycastle can receive shadows
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
            }
        });
        scene.add(skycastleModel);

        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        // Ensure monk can cast shadows
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
        await setupHandTracking(); // This will now handle its own video
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
    // Reset animation to idle if moving
    if (currentAction !== idleAction) {
        currentAction?.fadeOut(0.2);
        idleAction?.reset().fadeIn(0.2).play();
        currentAction = idleAction;
    }
    isMoving = false;
    moveDirection.set(0, 0); // Clear joystick input
}

function setupAnimations(gltf) {
    if (!gltf.animations?.length) {
        console.warn("No animations found in GLTF model.");
        return;
    }

    mixer = new THREE.AnimationMixer(monk);

    idleAction = mixer.clipAction(gltf.animations.find(a => /idle|stand/i.test(a.name)) || gltf.animations[0]);
    runAction = mixer.clipAction(gltf.animations.find(a => /run/i.test(a.name)) || gltf.animations[0]); // Fallback to first animation

    // Adjust timeScale for appropriate speed
    if (idleAction) idleAction.timeScale = 1.0; // Default to 1.0, adjust as needed
    if (runAction) runAction.timeScale = 1.5; // Default to 1.5, adjust as needed

    if (idleAction) {
        idleAction.play();
        currentAction = idleAction;
    } else {
        console.warn("Idle animation not found, character may not animate.");
    }
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
        isMoving = true;

        if (currentAction !== runAction && runAction) {
            currentAction?.fadeOut(0.2);
            runAction?.reset().fadeIn(0.2).play();
            currentAction = runAction;
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

    // Create a video element manually
    videoElement = document.createElement('video');
    videoElement.style.display = 'none'; // Keep it hidden
    videoElement.autoplay = true;
    videoElement.playsInline = true; // Important for mobile devices
    document.body.appendChild(videoElement); // Append to body, not canvas-container

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); // Use 'user' for front camera
        videoElement.srcObject = stream;
        await videoElement.play();

        // Use a requestAnimationFrame loop to send frames to MediaPipe
        const sendFrameToMediaPipe = async () => {
            if (videoElement.readyState >= 2) { // Ensure video is ready (HAVE_CURRENT_DATA or higher)
                await handLandmarker.send({ image: videoElement });
            }
            requestAnimationFrame(sendFrameToMediaPipe);
        };
        sendFrameToMediaPipe();

    } catch (err) {
        console.error("Error accessing camera:", err);
        trackingStatus.textContent = 'Camera access denied or error!';
        trackingStatus.style.color = '#ff0000';
    }
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

// *** MODIFIED createHandLandmarks function for improved scaling and positioning ***
function createHandLandmarks(landmarks) {
    // Define a point to unproject against, giving the "distance" of the hand overlay
    // This value essentially determines how far *behind* the camera the hand appears,
    // thereby controlling its perceived size relative to the scene.
    // A larger Z value here will make the hands appear smaller.
    const referenceZ = -10; // Start far behind the camera for small hands

    // Create joints (spheres)
    for (let i = 0; i < landmarks.length; i++) {
        const landmark = landmarks[i];

        const geometry = new THREE.SphereGeometry(HAND_JOINT_RADIUS, 8, 8); // Very small spheres
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8,
            depthTest: false // Render on top of existing scene
        });
        const sphere = new THREE.Mesh(geometry, material);

        // Convert MediaPipe normalized coordinates to Three.js normalized device coordinates (NDC)
        // MediaPipe X and Y are [0,1], Z is relative depth (0 near, negative further)
        const ndcX = (landmark.x - 0.5) * 2;
        const ndcY = -(landmark.y - 0.5) * 2; // Invert Y as Three.js Y is up, MediaPipe Y is down

        // MediaPipe's 'z' is relative depth. We want to scale it and add it to our referenceZ
        // to place the hands in the correct relative depth within the scene.
        // A larger HAND_DEPTH_SCALING_FACTOR will mean less relative depth variation from MediaPipe's Z,
        // making the hand appear flatter, but its overall distance controlled by referenceZ.
        // If landmark.z is negative, `-landmark.z` will be positive.
        const unprojectedZ = referenceZ + (-landmark.z * HAND_DEPTH_SCALING_FACTOR);

        const vec = new THREE.Vector3(ndcX + HAND_X_OFFSET, ndcY + HAND_Y_OFFSET, unprojectedZ);
        vec.unproject(camera); // Transform from NDC to world coordinates

        sphere.position.copy(vec);

        scene.add(sphere);
        handMeshes.push(sphere);
    }

    // Create bones (lines connecting landmarks)
    const connections = [
        [0, 1, 2, 3, 4],         // Thumb
        [0, 5, 6, 7, 8],         // Index finger
        [0, 9, 10, 11, 12],      // Middle finger
        [0, 13, 14, 15, 16],     // Ring finger
        [0, 17, 18, 19, 20],     // Pinky
        [5, 9, 13, 17]            // Palm base (Wrist to base of fingers)
    ];

    for (const connection of connections) {
        for (let i = 0; i < connection.length - 1; i++) {
            const startIdx = connection[i];
            const endIdx = connection[i + 1];

            const startLandmark = landmarks[startIdx];
            const endLandmark = landmarks[endIdx];

            // Project start landmark
            const startUnprojectedZ = referenceZ + (-startLandmark.z * HAND_DEPTH_SCALING_FACTOR);
            const startVec = new THREE.Vector3(
                (startLandmark.x - 0.5) * 2 + HAND_X_OFFSET,
                -(startLandmark.y - 0.5) * 2 + HAND_Y_OFFSET,
                startUnprojectedZ
            );
            startVec.unproject(camera);

            // Project end landmark
            const endUnprojectedZ = referenceZ + (-endLandmark.z * HAND_DEPTH_SCALING_FACTOR);
            const endVec = new THREE.Vector3(
                (endLandmark.x - 0.5) * 2 + HAND_X_OFFSET,
                -(endLandmark.y - 0.5) * 2 + HAND_Y_OFFSET,
                endUnprojectedZ
            );
            endVec.unproject(camera);

            const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
            const material = new THREE.LineBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.8,
                linewidth: HAND_BONE_THICKNESS, // Keep linewidth at 1 for consistent cross-browser thin lines
                depthTest: false // Render on top of existing scene
            });
            const line = new THREE.Line(geometry, material);

            scene.add(line);
            handMeshes.push(line);
        }
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
