import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.155.0/examples/jsm/loaders/GLTFLoader.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 5;

// Load GLB Scene
const gltfLoader = new GLTFLoader();
gltfLoader.load('https://weat-ctrl.github.io/ArCoreWebTest/scenes/so_small.glb', (gltf) => {
    scene.add(gltf.scene);
}, undefined, (error) => {
    console.error('Error loading GLB scene:', error);
});

// Load GLB Skybox
gltfLoader.load('https://weat-ctrl.github.io/ArCoreWebTest/scenes/skybox.glb', (gltf) => {
    const skybox = gltf.scene.children[0]; // Assuming the box is the first child
    const skyboxScale = 1000; // Adjust the scale as needed to surround your scene
    skybox.scale.set(skyboxScale, skyboxScale, skyboxScale);
    scene.add(skybox);
}, undefined, (error) => {
    console.error('Error loading GLB skybox:', error);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();

// Resize handling
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
