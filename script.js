// Scene setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

// Camera
const camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    1000
);
camera.position.set(13, 48, 63);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// OrbitControls
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

// GLB Loader
const loader = new THREE.GLTFLoader();
let model;

// Function to handle loading progress
function onProgress(xhr) {
    if (xhr.lengthComputable) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    } else {
        // Show just the bytes loaded if total is unknown
        console.log(xhr.loaded + ' bytes loaded');
    }
}

// Load skycastle model
loader.load(
    'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    function (gltf) {
        model = gltf.scene;
        scene.add(model);
        
        model.position.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        
        model.traverse(function(node) {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
    },
    onProgress, // Use the progress handler we defined
    function (error) {
        console.error('Error loading skycastle GLB model:', error);
    }
);

// Load monk model at specific position
loader.load(
    // Replace with your monk GLB path
    'https://weat-ctrl.github.io/ArCoreWebTest/monk.gltf',
    function (gltf) {
        const monk = gltf.scene;
        scene.add(monk);
        
        // Set position as requested
        monk.position.set(6.18, 29.792, 24.658);
        
        // Adjust scale if needed
        monk.scale.set(1, 1, 1);
        
        monk.traverse(function(node) {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
    },
    onProgress, // Reuse the same progress handler
    function (error) {
        console.error('Error loading monk GLB model:', error);
    }
);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start animation
animate();
