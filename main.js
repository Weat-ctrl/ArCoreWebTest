// Setup scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("sceneCanvas") });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Load JSON scene
const loader = new THREE.ObjectLoader();
fetch('scene.json')
    .then(response => response.json())
    .then(data => {
        const loadedScene = loader.parse(data);
        scene.add(loadedScene);
    })
    .catch(error => console.error("Error loading JSON:", error));

// Load GLB terrain
const gltfLoader = new THREE.GLTFLoader();
gltfLoader.load('https://weat-ctrl.github.io/ArCoreWebTest/skycastle.glb', (gltf) => {
    scene.add(gltf.scene);
});

// Create capsule and attach camera
const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(1, 2),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 })
);
scene.add(capsule);
camera.position.set(0, 2, 5);
capsule.add(camera);

// Add lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1).normalize();
scene.add(light);

// Render loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
