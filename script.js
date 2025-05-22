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
const gravity = -15;
let velocityY = 0;
const monkHeight = 2;
const groundOffset = 0.1;

// Character
let monk, skycastleModel;
let mixer, idleAction, runAction;
const moveSpeed = 8;
const initialPosition = new THREE.Vector3(6.18, 50, 24.658);

// Safe model loader
async function loadModel(url) {
    return new Promise((resolve) => {
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => {
                if (gltf && gltf.scene) {
                    resolve(gltf);
                } else {
                    console.warn('Loaded model has no scene, using fallback');
                    resolve({ scene: new THREE.Group(), animations: [] });
                }
            },
            undefined,
            (error) => {
                console.error('Error loading model:', url, error);
                resolve({ scene: new THREE.Group(), animations: [] });
            }
        );
    });
}

// Initialize
async function init() {
    // Basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Load Skycastle
    try {
        const skycastle = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb');
        skycastleModel = skycastle.scene;
        if (skycastleModel instanceof THREE.Object3D) {
            scene.add(skycastleModel);
        } else {
            console.warn('Invalid skycastle model, using fallback');
            skycastleModel = new THREE.Group();
            scene.add(skycastleModel);
        }
    } catch (e) {
        console.error("Skycastle initialization error:", e);
        skycastleModel = new THREE.Group();
        scene.add(skycastleModel);
    }

    // Load Monk
    try {
        const monkGLTF = await loadModel('https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf');
        monk = monkGLTF.scene;
        
        if (monk instanceof THREE.Object3D) {
            scene.add(monk);
            monk.position.copy(initialPosition);
            
            // Setup animations safely
            if (monkGLTF.animations && Array.isArray(monkGLTF.animations)) {
                mixer = new THREE.AnimationMixer(monk);
                
                // Safe animation finding
                const findAnimation = (regex) => {
                    try {
                        return monkGLTF.animations.find(a => regex.test(a.name));
                    } catch {
                        return null;
                    }
                };
                
                idleAction = mixer.clipAction(findAnimation(/idle/i) || monkGLTF.animations[0]);
                runAction = mixer.clipAction(findAnimation(/run|walk/i) || idleAction);
                
                if (idleAction) idleAction.play();
            }
        } else {
            console.warn('Invalid monk model, using fallback');
            monk = new THREE.Group();
            scene.add(monk);
        }
    } catch (e) {
        console.error("Monk initialization error:", e);
        monk = new THREE.Group();
        scene.add(monk);
    }

    setupJoystick();
    setupResetButton();
    animate();
}

// Joystick Controls
function setupJoystick() {
    try {
        const joystick = nipplejs.create({
            zone: document.getElementById('joystick-wrapper'),
            mode: 'static',
            position: { left: '60px', bottom: '60px' },
            size: 100
        });

        joystick.on('move', (evt, data) => {
            if (!monk) return;
            
            const forward = -data.vector.y;
            const right = data.vector.x;
            
            const cameraForward = new THREE.Vector3();
            camera.getWorldDirection(cameraForward);
            cameraForward.y = 0;
            cameraForward.normalize();
            
            const cameraRight = new THREE.Vector3().crossVectors(
                new THREE.Vector3(0, 1, 0),
                cameraForward
            );
            
            monk.position.add(
                cameraForward.multiplyScalar(forward * moveSpeed * 0.05)
            );
            monk.position.add(
                cameraRight.multiplyScalar(right * moveSpeed * 0.05)
            );
            
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
    } catch (e) {
        console.error("Joystick setup error:", e);
    }
}

// Ground Collision
function updatePhysics() {
    if (!monk || !skycastleModel || !(monk instanceof THREE.Object3D)) return;
    
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
        if (intersects[0] && intersects[0].distance < monkHeight) {
            onGround = true;
            lowestPoint = Math.min(lowestPoint, intersects[0].point.y);
        }
    });
    
    if (!onGround) {
        velocityY += gravity * clock.getDelta();
    } else {
        velocityY = 0;
        monk.position.y = lowestPoint + monkHeight/2 + groundOffset;
    }
    
    monk.position.y += velocityY * clock.getDelta();
}

// Reset Button
function setupResetButton() {
    const btn = document.getElementById('reset-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (monk instanceof THREE.Object3D) {
                monk.position.copy(initialPosition);
                velocityY = 0;
            }
        });
    }
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updatePhysics();
    
    const targetPos = monk && monk instanceof THREE.Object3D 
        ? monk.position.clone().add(new THREE.Vector3(0, 3, -8)) 
        : new THREE.Vector3(13, 48, 63);
    
    camera.position.lerp(targetPos, 0.1);
    if (monk instanceof THREE.Object3D) camera.lookAt(monk.position);
    
    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
init();
