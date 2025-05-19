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

// Remove this line - it's not needed and causes the error
// loader.setResponseType('arraybuffer'); 

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
        loadMonk();
    },
    (xhr) => console.log((xhr.loaded / xhr.total * 100) + '% loaded'),
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
        (xhr) => console.log((xhr.loaded / xhr.total * 100) + '% loaded'),
        (error) => console.error("Monk error:", error)
    );
}

function positionMonkOnFloor() {
    if (!skycastleModel || !monk) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(6.18, 100, 24.658), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(skycastleModel, true);
    
    if (intersects.length > 0) {
        monk.position.set(6.18, intersects[0].point.y, 24.658);
    } else {
        monk.position.set(6.18, 0, 24.658);
    }
}

function setupAnimations(gltf) {
    if (!gltf.animations || gltf.animations.length === 0) {
        console.warn("No animations found in GLTF");
        return;
    }
    
    mixer = new THREE.AnimationMixer(monk);
    
    // Find animations (adjust names as needed)
    const animations = gltf.animations;
    idleAction = mixer.clipAction(
        animations.find(a => a.name.toLowerCase().includes('idle')) || animations[0]
    );
    runAction = mixer.clipAction(
        animations.find(a => a.name.toLowerCase().includes('run')) || animations[animations.length > 1 ? 1 : 0]
    );
    
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
        const angle = data.angle.radian;
        moveDirection.x = Math.sin(angle) * data.force;
        moveDirection.z = -Math.cos(angle) * data.force;
        
        if (currentAction !== runAction && runAction) {
            idleAction.fadeOut(0.2);
            runAction.reset().fadeIn(0.2).play();
            currentAction = runAction;
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0, 0);
        if (runAction) runAction.fadeOut(0.2);
        idleAction.reset().fadeIn(0.2).play();
        currentAction = idleAction;
    });
}

function updateCamera() {
    if (!monk) return;
    
    const targetPosition = monk.position.clone().add(cameraOffset);
    camera.position.lerp(targetPosition, 0.1);
    camera.lookAt(monk.position);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    
    if (monk && moveDirection.length() > 0) {
        monk.position.x += moveDirection.x * delta * moveSpeed;
        monk.position.z += moveDirection.z * delta * moveSpeed;
        
        const targetRotation = Math.atan2(moveDirection.x, -moveDirection.z);
        monk.rotation.y = THREE.MathUtils.lerp(monk.rotation.y, targetRotation, rotationSpeed);
    }
    
    updateCamera();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
animate();
