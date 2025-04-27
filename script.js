// script.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/jsm/loaders/GLTFLoader.js';
import VirtualJoystick from './VirtualJoystick.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccff);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('scene-container').appendChild(renderer.domElement);

// Player capsule
const player = new THREE.Group();
const capsuleGeometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
const capsuleMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x00aaff,
    transparent: true,
    opacity: 0.7
});
const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
player.add(capsule);
scene.add(player);

// Camera positioning
const cameraPivot = new THREE.Group();
cameraPivot.position.set(0, 1.6, 0);
player.add(cameraPivot);
cameraPivot.add(camera);

// Movement variables
const moveSpeed = 3;
let touchYaw = 0;
let touchPitch = 0;

// Load terrain
const loader = new GLTFLoader();
let terrain;

loader.load(
    'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    (gltf) => {
        terrain = gltf.scene;
        terrain.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
                node.castShadow = true;
            }
        });
        scene.add(terrain);
    },
    undefined,
    (error) => console.error(error)
);

// Setup joysticks
const moveJoystick = new VirtualJoystick({
    container: document.getElementById('joystick-move')
});

const lookJoystick = new VirtualJoystick({
    container: document.getElementById('joystick-look')
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Movement
    const moveX = moveJoystick.deltaX / 50;
    const moveZ = -moveJoystick.deltaY / 50;
    
    if (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0) {
        const angle = Math.atan2(moveX, moveZ) + touchYaw;
        const moveDistance = moveSpeed * 0.016;
        
        player.position.x += Math.sin(angle) * moveDistance;
        player.position.z += Math.cos(angle) * moveDistance;
    }

    // Camera look
    const lookX = lookJoystick.deltaX / 100;
    const lookY = lookJoystick.deltaY / 100;
    
    touchYaw += lookX;
    touchPitch = THREE.MathUtils.clamp(touchPitch + lookY, -Math.PI/3, Math.PI/3);
    
    player.rotation.y = touchYaw;
    cameraPivot.rotation.x = touchPitch;

    renderer.render(scene, camera);
}

animate();
