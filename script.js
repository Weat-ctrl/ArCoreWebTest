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
const moveDirection = new THREE.Vector2();
const moveSpeed = 4;
let targetRotation = 0;
let isMoving = false;
const gravity = -9.8;
let velocityY = 0;

// Improved model loading without XMLHttpRequest errors
async function loadModel(url) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            resolve,
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
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        // Load Monk
        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        scene.add(monk);
        positionMonkOnFloor();
        setupAnimations(monkGLTF);
        setupJoystick();
        animate();
    } catch (error) {
        console.error("Loading error:", error);
    }
}

// Enhanced terrain collision
function positionMonkOnFloor() {
    if (!skycastleModel || !monk) return;
    
    // Create multiple rays around the character for better collision
    const rayOrigin = monk.position.clone();
    rayOrigin.y += 0.5; // Start slightly above feet
    
    const rayDirections = [
        new THREE.Vector3(0, -1, 0), // Center
        new THREE.Vector3(0.5, -1, 0), // Right
        new THREE.Vector3(-0.5, -1, 0), // Left
        new THREE.Vector3(0, -1, 0.5), // Front
        new THREE.Vector3(0, -1, -0.5) // Back
    ];
    
    const raycaster = new THREE.Raycaster();
    let lowestPoint = monk.position.y;
    
    rayDirections.forEach(dir => {
        raycaster.set(rayOrigin, dir.normalize());
        const intersects = raycaster.intersectObject(skycastleModel, true);
        
        if (intersects.length > 0) {
            const groundY = intersects[0].point.y;
            if (groundY < lowestPoint) {
                lowestPoint = groundY;
            }
        }
    });
    
    // Apply gravity and ground collision
    if (monk.position.y > lowestPoint + 0.1) {
        velocityY += gravity * clock.getDelta();
    } else {
        velocityY = 0;
        monk.position.y = lowestPoint + 0.1; // Small offset to prevent sinking
    }
    
    monk.position.y += velocityY * clock.getDelta();
}

function setupAnimations(gltf) {
    if (!gltf.animations?.length) return;
    
    mixer = new THREE.AnimationMixer(monk);
    
    // Find animations (case insensitive)
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
        // Corrected joystick orientation (now matches screen direction)
        moveDirection.set(
            data.vector.x,  // Left/Right
            -data.vector.y  // Forward/Back (inverted to match screen)
        );
        
        // Calculate target rotation based on joystick direction
        targetRotation = Math.atan2(moveDirection.x, moveDirection.y);
        
        // Animation control
        if (!isMoving) {
            idleAction.fadeOut(0.2);
            runAction.reset().fadeIn(0.2).play();
            currentAction = runAction;
            isMoving = true;
        }
    });

    joystick.on('end', () => {
        moveDirection.set(0, 0);
        if (isMoving) {
            runAction.fadeOut(0.2);
            idleAction.reset().fadeIn(0.2).play();
            currentAction = idleAction;
            isMoving = false;
        }
    });
}

function updateCharacter(delta) {
    if (!monk || !skycastleModel) return;
    
    // Apply movement if joystick is active
    if (moveDirection.length() > 0) {
        // Calculate movement vector based on current rotation
        const moveX = moveDirection.x * moveSpeed * delta;
        const moveZ = moveDirection.y * moveSpeed * delta;
        
        // Create movement vector relative to camera
        const moveVector = new THREE.Vector3(moveX, 0, moveZ);
        moveVector.applyQuaternion(camera.quaternion);
        moveVector.y = 0; // Keep movement horizontal
        
        // Update position
        monk.position.x += moveVector.x;
        monk.position.z += moveVector.z;
        
        // Only rotate if actually moving (not just pushing joystick slightly)
        if (moveDirection.length() > 0.3) {
            // Calculate rotation based on camera-relative movement
            const angle = Math.atan2(moveVector.x, moveVector.z);
            monk.rotation.y = angle;
        }
    }
    
    // Keep character on terrain
    positionMonkOnFloor();
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
