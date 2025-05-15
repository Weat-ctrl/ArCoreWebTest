// Scene setup
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

// OrbitControls (optional, disable if you want pure camera parenting)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Animation mixer and clock (for animations)
const clock = new THREE.Clock();
let mixer;

// Function to land the monk on the skycastle floor
function positionMonkOnFloor(monk, skycastle) {
    const raycaster = new THREE.Raycaster();
    const startPos = new THREE.Vector3(6.18, 100, 24.658); // High Y to shoot ray downward
    const direction = new THREE.Vector3(0, -1, 0); // Ray points downward

    raycaster.set(startPos, direction);
    const intersects = raycaster.intersectObject(skycastle, true);

    if (intersects.length > 0) {
        const floorY = intersects[0].point.y;
        monk.position.set(6.18, floorY, 24.658);
    } else {
        console.warn("Floor not found, using default Y position");
        monk.position.set(6.18, 0, 24.658); // Fallback
    }
}

// Load skycastle first
let skycastleModel;
const loader = new THREE.GLTFLoader();

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

        // Now load the monk
        loader.load(
            'https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf', // Ensure correct path/capitalization
            (gltf) => {
                const monk = gltf.scene;
                scene.add(monk);

                // 1. Land monk on floor
                positionMonkOnFloor(monk, skycastleModel);

                // 2. Play idle animation
                mixer = new THREE.AnimationMixer(monk);
                const clips = gltf.animations;
                const idleClip = clips.find(clip => clip.name.toLowerCase().includes('idle'));
                if (idleClip) mixer.clipAction(idleClip).play();

                // 3. Attach camera to monk
                const cameraOffset = new THREE.Vector3(0, 2, -5); // Adjust as needed
                monk.add(camera);
                camera.position.copy(cameraOffset);
                controls.target.copy(monk.position);
            },
            undefined,
            (error) => console.error("Monk load error:", error)
        );
    },
    undefined,
    (error) => console.error("Skycastle load error:", error)
);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta); // Update animations
    controls.update(); // Required if using OrbitControls
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate(); // Start
