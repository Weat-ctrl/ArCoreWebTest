import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import VirtualJoystick from './VirtualJoystick.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccff);
scene.fog = new THREE.Fog(0x88ccff, 10, 50);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6; // Approximate eye level

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('scene-container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Player capsule
const playerGeometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
const playerMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x00aaff,
    transparent: true,
    opacity: 0.7
});
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.y = 1.5; // Start above ground
player.castShadow = true;
scene.add(player);

// Add camera to player
player.add(camera);
camera.position.set(0, 0.6, 0); // Offset from capsule center

// Physics variables
const gravity = -9.8;
const velocity = new THREE.Vector3();
let isGrounded = false;

// Movement variables
const moveSpeed = 5;
const jumpForce = 5;
const moveDirection = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

// Load GLB terrain
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
        
        // Center player on terrain if needed
        player.position.set(0, 2, 0);
    },
    undefined,
    (error) => {
        console.error('Error loading terrain:', error);
    }
);

// Controls
const controls = new PointerLockControls(camera, document.body);

// Lock controls on click
document.addEventListener('click', () => {
    controls.lock();
});

// Keyboard controls
document.addEventListener('keydown', (event) => {
    switch(event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y = jumpForce; break;
    }
});

document.addEventListener('keyup', (event) => {
    switch(event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
});

// Touch controls
const joystickLeft = new VirtualJoystick({
    container: document.getElementById('joystick-left'),
    radius: 50
});

const joystickRight = new VirtualJoystick({
    container: document.getElementById('joystick-right'),
    radius: 50
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Collision detection (simplified)
function checkCollisions() {
    // Simple ground check (raycast downward)
    const raycaster = new THREE.Raycaster(
        player.position,
        new THREE.Vector3(0, -1, 0),
        0,
        1.1 // Slightly more than capsule height/2
    );
    
    const intersects = raycaster.intersectObject(terrain || scene);
    isGrounded = intersects.length > 0;
    
    // Simple wall collision (would need proper implementation)
    // This just prevents falling through terrain
    if (!isGrounded) {
        velocity.y += gravity * 0.016; // Apply gravity (frame-rate independent)
    } else {
        velocity.y = 0;
        canJump = true;
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    if (controls.isLocked) {
        const delta = 0.016; // Approximate 60fps delta
        
        // Keyboard movement
        moveDirection.z = Number(moveForward) - Number(moveBackward);
        moveDirection.x = Number(moveRight) - Number(moveLeft);
        moveDirection.normalize();
        
        // Apply joystick input
        if (joystickLeft.deltaX !== 0 || joystickLeft.deltaY !== 0) {
            moveDirection.x = joystickLeft.deltaX / 50;
            moveDirection.z = -joystickLeft.deltaY / 50;
        }
        
        // Apply movement
        const moveDistance = moveSpeed * delta;
        const moveVector = new THREE.Vector3();
        
        if (moveDirection.z !== 0) {
            moveVector.add(
                new THREE.Vector3()
                .setFromMatrixColumn(camera.matrix, 0)
                .multiplyScalar(moveDirection.x * moveDistance)
            );
            
            moveVector.add(
                new THREE.Vector3()
                .setFromMatrixColumn(camera.matrix, 2)
                .multiplyScalar(moveDirection.z * moveDistance)
                .negate()
            );
        }
        
        // Apply joystick right for look (if needed)
        if (joystickRight.deltaX !== 0) {
            controls.rotateX(-joystickRight.deltaY * 0.002);
            controls.rotateY(-joystickRight.deltaX * 0.002);
        }
        
        // Update position
        player.position.add(moveVector);
        player.position.y += velocity.y * delta;
        
        // Check collisions
        checkCollisions();
    }
    
    renderer.render(scene, camera);
}

animate();
