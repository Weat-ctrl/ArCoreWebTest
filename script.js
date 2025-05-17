// Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// Camera (Third-person view)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraOffset = new THREE.Vector3(0, 3, -8); // Camera position relative to character

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Animation System
const clock = new THREE.Clock();
let mixer, idleAction, runAction, currentAction;
let monk, skycastleModel;

// Movement
const moveDirection = new THREE.Vector3();
const moveSpeed = 4;
const rotationSpeed = 0.1;

// Load Models
const loader = new THREE.GLTFLoader();
loader.setResponseType('arraybuffer');

// Load Skycastle
loader.load(
    'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    (gltf) => {
        skycastleModel = gltf.scene;
        scene.add(skycastleModel);
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        
        // Then load Monk
        loadMonk();
    },
    undefined,
    (error) => console.error("Skycastle error:", error)
);

function loadMonk() {
    loader.load(
        'https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf',
        (gltf) => {
            monk = gltf.scene;
            scene.add(monk);
            positionMonkOnFloor();
            setupAnimations(gltf);
            setupJoystick();
        },
        undefined,
        (error) => console.error("Monk error:", error)
    );
}

// Position monk on skycastle floor
function positionMonkOnFloor() {
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(6.18, 100, 24.658), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(skycastleModel, true);
    
    if (intersects.length > 0) {
        monk.position.set(6.18, intersects[0].point.y, 24.658);
    } else {
        monk.position.set(6.18, 0, 24.658);
    }
}

// Animation Setup
function setupAnimations(gltf) {
    mixer = new THREE.AnimationMixer(monk);
    
    // Assuming animations are named "Idle" and "Run"
    idleAction = mixer.clipAction(gltf.animations.find(a => a.name.includes("Idle")));
    runAction = mixer.clipAction(gltf.animations.find(a => a.name.includes("Run")));
    
    idleAction.play();
    currentAction = idleAction;
}

// Virtual Joystick
function setupJoystick() {
    const joystick = nipplejs.create({
        zone: document.getElementById('joystick-wrapper'),
        mode: 'static',
        position: { left: '60px', bottom: '60px' },
        size: 100,
        color: 'rgba(255,255,255,0.5)'
    });

    joystick.on('move', (evt, data) => {
        const angle = data.angle.radian;
        moveDirection.x = Math.sin(angle) * data.force;
        moveDirection.z = -Math.cos(angle) * data.force;
        
        if (currentAction !== runAction) {
            idleAction.fadeOut(0.2);
            runAction.reset().fadeIn(0.2).play();
            currentAction = runAction;
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0, 0);
        runAction.fadeOut(0.2);
        idleAction.reset().fadeIn(0.2).play();
        currentAction = idleAction;
    });
}

// Update camera to follow monk
function updateCamera() {
    if (!monk) return;
    
    const targetPosition = monk.position.clone().add(cameraOffset);
    camera.position.lerp(targetPosition, 0.1); // Smooth follow
    camera.lookAt(monk.position);
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    // Update animations
    if (mixer) mixer.update(delta);
    
    // Update character position and rotation
    if (monk && moveDirection.length() > 0) {
        monk.position.x += moveDirection.x * delta * moveSpeed;
        monk.position.z += moveDirection.z * delta * moveSpeed;
        
        // Rotate character to face movement direction
        const targetRotation = Math.atan2(moveDirection.x, -moveDirection.z);
        monk.rotation.y = THREE.MathUtils.lerp(monk.rotation.y, targetRotation, rotationSpeed);
    }
    
    updateCamera();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

animate();
