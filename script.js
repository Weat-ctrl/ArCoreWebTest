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
const gravity = -25; // Stronger gravity
let velocityY = 0;
const monkHeight = 1.8;
const groundOffset = 0.05;

// Movement
let monk, skycastleModel;
let mixer, idleAction, runAction;
const moveSpeed = 0.2; // Adjusted for proper speed

// Initialize
async function init() {
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Load Skycastle
    skycastleModel = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
    scene.add(skycastleModel);

    // Load Monk
    const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
    monk = monkGLTF.scene;
    scene.add(monk);
    
    // Position monk and snap to ground
    monk.position.set(6.18, 50, 24.658); // Start high
    snapToGround();
    
    // Setup animations
    if (monkGLTF.animations?.length) {
        mixer = new THREE.AnimationMixer(monk);
        idleAction = mixer.clipAction(monkGLTF.animations[0]);
        runAction = mixer.clipAction(monkGLTF.animations[1] || monkGLTF.animations[0]);
        runAction.timeScale = 1.5; // Speed up animation
        idleAction.play();
    }

    setupJoystick();
    setupResetButton();
    animate();
}

// CORRECTED Joystick Controls
function setupJoystick() {
    const joystick = nipplejs.create({
        zone: document.getElementById('joystick-wrapper'),
        mode: 'static',
        position: { left: '60px', bottom: '60px' },
        size: 100
    });

    joystick.on('move', (evt, data) => {
        // CORRECTED DIRECTIONS:
        const forward = data.vector.y;  // Now: Pull UP = forward
        const right = -data.vector.x;   // Now: Right = right
        
        // Get camera forward direction (without vertical)
        const cameraForward = new THREE.Vector3();
        camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        cameraForward.normalize();
        
        // Calculate movement direction
        const moveX = right * moveSpeed;
        const moveZ = forward * moveSpeed;
        
        // Apply movement relative to camera
        monk.position.x += cameraForward.x * moveZ + cameraForward.z * moveX;
        monk.position.z += cameraForward.z * moveZ - cameraForward.x * moveX;
        
        // Rotate character to face movement direction
        if (Math.abs(forward) > 0.1 || Math.abs(right) > 0.1) {
            const targetAngle = Math.atan2(moveX, moveZ);
            monk.rotation.y = targetAngle;
            
            // Play run animation
            if (runAction) {
                runAction.play();
                if (idleAction) idleAction.stop();
            }
        }
    });

    joystick.on('end', () => {
        // Return to idle
        if (runAction) runAction.stop();
        if (idleAction) idleAction.play();
    });
}

// Enhanced ground snapping
function snapToGround() {
    if (!monk || !skycastleModel) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position.clone().add(new THREE.Vector3(0, 10, 0)), 
              new THREE.Vector3(0, -1, 0));
    
    const intersects = raycaster.intersectObject(skycastleModel, true);
    if (intersects.length > 0) {
        monk.position.y = intersects[0].point.y + monkHeight + groundOffset;
        velocityY = 0;
    }
}

// Physics update
function updatePhysics() {
    if (!monk || !skycastleModel) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.set(monk.position.clone().add(new THREE.Vector3(0, monkHeight/2, 0)), 
              new THREE.Vector3(0, -1, 0));
    
    const intersects = raycaster.intersectObject(skycastleModel, true);
    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        if (monk.position.y > groundY + monkHeight) {
            velocityY += gravity * clock.getDelta();
        } else {
            velocityY = 0;
            monk.position.y = groundY + monkHeight + groundOffset;
        }
    } else {
        velocityY += gravity * clock.getDelta();
    }
    
    monk.position.y += velocityY * clock.getDelta();
}

// Reset function
function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', () => {
        monk.position.set(6.18, 50, 24.658);
        snapToGround();
    });
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updatePhysics();
    
    // Camera follow
    if (monk) {
        const targetPos = monk.position.clone()
            .add(new THREE.Vector3(0, 3, -8));
        camera.position.lerp(targetPos, 0.1);
        camera.lookAt(monk.position);
    }
    
    renderer.render(scene, camera);
}

// Model loader with error handling
async function loadModel(url) {
    return new Promise((resolve) => {
        new THREE.GLTFLoader().load(url, resolve, undefined, 
            () => resolve({ scene: new THREE.Group(), animations: [] }));
    });
}

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
init();
