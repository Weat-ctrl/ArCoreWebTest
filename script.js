import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.146.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.146.0/examples/jsm/loaders/GLTFLoader.js';
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
import { Hands } from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';

// --- Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// --- Variables ---
let pigeon, mixer, animations;
let hitCount = 0;
const maxHits = 5;
let smokeParticles;

// --- Model Loading ---
function loadPigeon() {
    const loader = new GLTFLoader();
    loader.load('https://Weat-ctrl.github.io/ArCoreWebTest/Pigeon.gltf', (gltf) => {
        pigeon = gltf.scene;
        scene.add(pigeon);
        pigeon.scale.set(0.5, 0.5, 0.5);
        pigeon.position.set(0, 0, -2);
        mixer = new THREE.AnimationMixer(pigeon);
        animations = gltf.animations;

        pigeon.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: child.material.map,
                    color: 0xffffff,
                });
            }
        });

        playAnimation('Flying_Idle');
    });
}

function playAnimation(name) {
    if (!mixer || !animations) return;
    const clip = THREE.AnimationClip.findByName(animations, name);
    if (clip) {
        const action = mixer.clipAction(clip);
        action.reset().play();
    }
}

// --- Particle System ---
function setupParticleSystem() {
    const particleCount = 50;
    const particles = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = (Math.random() - 0.5) * 2;
        particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2;
        particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }

    particles.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        size: 0.1,
        color: 0x00aaff,
        transparent: true,
        opacity: 0.5,
    });

    smokeParticles = new THREE.Points(particles, particleMaterial);
    scene.add(smokeParticles);
}

// --- Camera Setup ---
async function startFrontCamera() {
    const video = document.getElementById('video');
    const constraints = {
        video: {
            facingMode: 'user',
            width: 640,
            height: 480,
            frameRate: 15,
        },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.play();

    const videoTexture = new THREE.VideoTexture(video);
    const videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture });
    const videoGeometry = new THREE.PlaneGeometry(16, 9);
    const videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
    videoMesh.position.set(0, 0, -10);
    scene.add(videoMesh);

    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    hands.onResults(onResults);

    let lastFrameTime = 0;
    const frameRate = 15;
    const cameraObj = new Camera(video, {
        onFrame: async () => {
            const now = performance.now();
            if (now - lastFrameTime >= 1000 / frameRate) {
                await hands.send({ image: video });
                lastFrameTime = now;
            }
        },
        width: 640,
        height: 480,
    });
    cameraObj.start();
}

// --- onResults Function ---
function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        if (isPeaceSign(landmarks)) {
            hitPigeon();
        }
    }
}

// --- Gesture Detection ---
function isPeaceSign(landmarks) {
    return (
        landmarks[8].y < landmarks[7].y &&
        landmarks[12].y < landmarks[11].y &&
        landmarks[16].y > landmarks[13].y &&
        landmarks[20].y > landmarks[17].y
    );
}

// --- Hit Pigeon ---
function hitPigeon() {
    if (hitCount >= maxHits) return;
    hitCount++;
    console.log(`Hit count: ${hitCount}`);
    pigeon.traverse((child) => {
        if (child.isMesh) {
            child.material.color.set(0xff0000);
            setTimeout(() => { child.material.color
