// Debug startup
console.log("Script loading started");

// Scene Setup
const container = document.getElementById('canvas-container');
if (!container) {
    console.error("Missing canvas container!");
    alert("Error: Missing canvas container!");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(13, 48, 63);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// Debug axes
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Physics
const clock = new THREE.Clock();
const gravity = -9.8;
let velocityY = 0;
const monkHeight = 2;
const groundOffset = 0.1;

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction;
const moveSpeed = 5;
const initialPosition = new THREE.Vector3(6.18, 50, 24.658); // Start higher for ground snap
let joystick;

// Model loader
async function loadModel(url) {
    try {
        const gltf = await new THREE.GLTFLoader().loadAsync(url);
        return gltf;
    } catch (error) {
        console.error("Error loading model:", url, error);
        // Fallback cube
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ 
            color: url.includes('Monk') ? 0xff0000 : 0x0000ff 
        });
        return { scene: new THREE.Mesh(geometry, material), animations: [] };
    }
}

// Initialize VirtualJoystick
function initJoystick() {
    if (typeof VirtualJoystick === 'undefined') {
        console.error("VirtualJoystick not loaded!");
        return null;
    }

    const container = document.getElementById('joystick-container');
    if (!container) {
        console.error("Joystick container not found!");
        return null;
    }

    return new VirtualJoystick({
        container: container,
        mouseSupport: true,
        stationaryBase: true,
        baseX: 50,
        baseY: window.innerHeight - 50,
        limitStickTravel: true,
        stickRadius: 40
    });
}

// Initialize
async function init() {
    console.log("Initializing scene...");
    
    // Load models
    try {
        const [skycastle, monkGLTF] = await Promise.all([
            loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb'),
            loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf')
        ]);

        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);

        monk = monkGLTF.scene;
        monk.scale.set(0.5, 0.5, 0.5);
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

        // Initialize joystick
        joystick = initJoystick();
        if (!joystick) {
            alert("Joystick initialization failed! Check console.");
        }

        setupResetButton();
        animate();
    } catch (error) {
        console.error("Initialization error:", error);
        alert("Initialization failed! Check console.");
    }
}

// Movement system
function updateMovement(delta) {
    if (!monk || !joystick) return;

    // Get joystick input (correctly oriented)
    const forward = -joystick.deltaY() / 50; // Forward/back
    const right = joystick.deltaX() / 50;    // Left/right

    // Camera-relative movement
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();

    const cameraRight = new THREE.Vector3().crossVectors(
        new THREE.Vector3(0, 1, 0),
        cameraForward
    );

    // Calculate movement
    const moveX = right * moveSpeed * delta;
    const moveZ = forward * moveSpeed * delta;

    // Apply movement
    const prevPosition = monk.position.clone();
    monk.position.x += cameraRight.x * moveX + cameraForward.x * moveZ;
    monk.position.z += cameraRight.z * moveX + cameraForward.z * moveZ;

    // Rotate character
    if (Math.abs(forward) > 0.1 || Math.abs(right) > 0.1) {
        const targetAngle = Math.atan2(
            cameraRight.x * moveX + cameraForward.x * moveZ,
            cameraRight.z * moveX + cameraForward.z * moveZ
        );
        monk.rotation.y = targetAngle;
    }

    // Animation control
    if ((Math.abs(forward) > 0.1 || Math.abs(right) > 0.1) && runAction) {
        if (!runAction.isRunning()) {
            idleAction?.fadeOut(0.2);
            runAction.reset().fadeIn(0.2).play();
        }
        // Sync animation speed with movement speed
        const speed = Math.sqrt(moveX * moveX + moveZ * moveZ);
        runAction.setEffectiveTimeScale(speed * 2);
    } else if (idleAction) {
        runAction?.fadeOut(0.2);
        idleAction.reset().fadeIn(0.2).play();
    }
}

// Ground collision
function updatePhysics() {
    if (!monk || !skycastleModel) return;

    const raycaster = new THREE.Raycaster(
        monk.position.clone().add(new THREE.Vector3(0, monkHeight/2, 0)),
        new THREE.Vector3(0, -1, 0)
    );
    const intersects = raycaster.intersectObject(skycastleModel, true);

    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        if (monk.position.y > groundY + monkHeight/2 + groundOffset) {
            velocityY += gravity * clock.getDelta();
        } else {
            velocityY = 0;
            monk.position.y = groundY + monkHeight/2 + groundOffset;
        }
    } else {
        velocityY += gravity * clock.getDelta();
    }

    monk.position.y += velocityY * clock.getDelta();
}

// Camera follow
function updateCamera() {
    if (!monk) return;

    const targetPos = monk.position.clone()
        .add(new THREE.Vector3(0, 3, -8));
    
    camera.position.lerp(targetPos, 0.1);
    camera.lookAt(monk.position);
}

// Reset button
function setupResetButton() {
    const btn = document.getElementById('reset-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (monk) {
                monk.position.copy(initialPosition);
                velocityY = 0;
            }
        });
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updateMovement(delta);
    updatePhysics();
    updateCamera();
    renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the app
init();
