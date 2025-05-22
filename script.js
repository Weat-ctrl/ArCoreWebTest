// Scene Setup
const container = document.getElementById('canvas-container');
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

// Physics
const clock = new THREE.Clock();
const gravity = -15; // Stronger gravity for better snapping
let velocityY = 0;
const monkHeight = 2;
const groundOffset = 0.1;

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction;
const moveSpeed = 8; // Faster movement
const initialPosition = new THREE.Vector3(6.18, 50, 24.658); // Start higher to ensure ground snap

// Load Models
async function init() {
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Load Skycastle
    try {
        const skycastle = await new Promise((resolve) => {
            new THREE.GLTFLoader().load(
                'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
                resolve,
                undefined,
                () => resolve({ scene: new THREE.Group() })
            );
        });
        skycastleModel = skycastle.scene;
        scene.add(skycastleModel);
    } catch (e) {
        console.error("Skycastle load error:", e);
    }

    // Load Monk
    try {
        const monkGLTF = await new Promise((resolve) => {
            new THREE.GLTFLoader().load(
                'https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf',
                resolve,
                undefined,
                () => resolve({ scene: new THREE.Group(), animations: [] })
            );
        });
        
        monk = monkGLTF.scene;
        scene.add(monk);
        monk.position.copy(initialPosition);
        
        // Setup animations
        if (monkGLTF.animations?.length) {
            mixer = new THREE.AnimationMixer(monk);
            idleAction = mixer.clipAction(monkGLTF.animations.find(a => /idle/i.test(a.name)) || mixer.clipAction(monkGLTF.animations[0]);
            runAction = mixer.clipAction(monkGLTF.animations.find(a => /run|walk/i.test(a.name)) || idleAction;
            idleAction.play();
        }
    } catch (e) {
        console.error("Monk load error:", e);
    }

    setupJoystick();
    setupResetButton();
    animate();
}

// Corrected Joystick Controls
function setupJoystick() {
    const joystick = nipplejs.create({
        zone: document.getElementById('joystick-wrapper'),
        mode: 'static',
        position: { left: '60px', bottom: '60px' },
        size: 100
    });

    joystick.on('move', (evt, data) => {
        // CORRECTED: Natural joystick directions
        const forward = -data.vector.y; // Pull down = positive forward
        const right = data.vector.x;
        
        // Move relative to camera
        const cameraForward = new THREE.Vector3();
        camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        cameraForward.normalize();
        
        const cameraRight = new THREE.Vector3().crossVectors(
            new THREE.Vector3(0, 1, 0),
            cameraForward
        );
        
        // Apply movement
        monk.position.add(
            cameraForward.multiplyScalar(forward * moveSpeed * 0.05)
        );
        monk.position.add(
            cameraRight.multiplyScalar(right * moveSpeed * 0.05)
        );
        
        // Face movement direction
        if (Math.abs(forward) > 0.1 || Math.abs(right) > 0.1) {
            const targetAngle = Math.atan2(right, forward);
            monk.rotation.y = targetAngle;
            
            if (runAction) {
                runAction.play();
                if (idleAction) idleAction.stop();
            }
        }
    });

    joystick.on('end', () => {
        if (runAction) runAction.stop();
        if (idleAction) idleAction.play();
    });
}

// Enhanced Ground Collision
function updatePhysics() {
    if (!monk || !skycastleModel) return;
    
    // Multiple raycasts for better collision
    const origins = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.5, 0, 0),
        new THREE.Vector3(-0.5, 0, 0),
        new THREE.Vector3(0, 0, 0.5),
        new THREE.Vector3(0, 0, -0.5)
    ];
    
    let onGround = false;
    let lowestPoint = Infinity;
    
    origins.forEach(offset => {
        const raycaster = new THREE.Raycaster(
            monk.position.clone().add(offset),
            new THREE.Vector3(0, -1, 0)
        );
        
        const intersects = raycaster.intersectObject(skycastleModel, true);
        if (intersects[0]?.distance < monkHeight) {
            onGround = true;
            lowestPoint = Math.min(lowestPoint, intersects[0].point.y);
        }
    });
    
    // Apply gravity/snapping
    if (!onGround) {
        velocityY += gravity * clock.getDelta();
    } else {
        velocityY = 0;
        monk.position.y = lowestPoint + monkHeight/2 + groundOffset;
    }
    
    monk.position.y += velocityY * clock.getDelta();
}

// Reset Function
function setupResetButton() {
    document.getElementById('reset-btn').addEventListener('click', () => {
        monk.position.copy(initialPosition);
        velocityY = 0;
    });
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updatePhysics();
    
    // Camera follow
    const targetPos = monk.position.clone()
        .add(new THREE.Vector3(0, 3, -8));
    camera.position.lerp(targetPos, 0.1);
    camera.lookAt(monk.position);
    
    renderer.render(scene, camera);
}

// Start
init();
