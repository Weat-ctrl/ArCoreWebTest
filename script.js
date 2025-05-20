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
const moveDirection = new THREE.Vector2(); // Using Vector2 for simpler joystick math
const moveSpeed = 4;
let targetRotation = 0;

// Fixed loading issue
function loadModel(url, onLoad) {
    return new Promise((resolve, reject) => {
        new THREE.GLTFLoader().load(
            url,
            (gltf) => {
                onLoad?.(gltf);
                resolve(gltf);
            },
            (xhr) => {
                const percent = xhr.lengthComputable 
                    ? (xhr.loaded / xhr.total * 100) + '% loaded' 
                    : xhr.loaded + ' bytes loaded';
                console.log(percent);
            },
            reject
        );
    });
}

async function init() {
    try {
        // Load Skycastle
        const skycastle = await loadModel(
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
            }
        );

        // Load Monk
        const monkGLTF = await loadModel(
            'https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf',
            (gltf) => {
                monk = gltf.scene;
                scene.add(monk);
                positionMonkOnFloor();
                setupAnimations(gltf);
            }
        );

        setupJoystick();
        animate();
    } catch (error) {
        console.error("Loading error:", error);
    }
}

function positionMonkOnFloor() {
    if (!skycastleModel || !monk) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(6.18, 100, 24.658), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(skycastleModel, true);
    
    monk.position.set(
        6.18,
        intersects[0]?.point.y || 0,
        24.658
    );
}

function setupAnimations(gltf) {
    if (!gltf.animations?.length) {
        console.warn("No animations found");
        return;
    }

    mixer = new THREE.AnimationMixer(monk);
    
    // Flexible animation detection
    const animations = gltf.animations;
    idleAction = mixer.clipAction(
        animations.find(a => /idle|stand/i.test(a.name)) || animations[0]
    );
    runAction = mixer.clipAction(
        animations.find(a => /run|walk/i.test(a.name)) || animations[1] || animations[0]
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
        // Convert joystick angle to movement direction
        const angle = data.angle.radian;
        moveDirection.set(
            Math.sin(angle) * data.force,
            -Math.cos(angle) * data.force
        );
        
        // Calculate target rotation (in radians)
        targetRotation = Math.atan2(moveDirection.x, moveDirection.y);
        
        // Switch to run animation
        if (currentAction !== runAction && runAction) {
            idleAction.fadeOut(0.2);
            runAction.reset().fadeIn(0.2).play();
            currentAction = runAction;
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        if (runAction) runAction.fadeOut(0.2);
        idleAction.reset().fadeIn(0.2).play();
        currentAction = idleAction;
    });
}

function updateCharacter(delta) {
    if (!monk) return;
    
    // Apply movement if joystick is active
    if (moveDirection.length() > 0) {
        const moveX = moveDirection.x * moveSpeed * delta;
        const moveZ = moveDirection.y * moveSpeed * delta;
        
        monk.position.x += moveX;
        monk.position.z += moveZ;
        
        // Smooth rotation towards movement direction
        monk.rotation.y = THREE.MathUtils.lerp(
            monk.rotation.y,
            targetRotation,
            Math.min(1, 10 * delta) // Smoothing factor
        );
    }
}

function updateCamera() {
    if (!monk) return;
    
    // Calculate camera position behind character
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
    updateCharacter(delta);
    updateCamera();
    renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start everything
init();
