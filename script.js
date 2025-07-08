import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Removed MediaPipe imports for now, as we are focusing on loading screen.
// import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

// Placeholder for SPE. You'll replace this with the actual SPE library file later.
// For now, it's just to prevent errors.
class ShaderParticleEngine {
    constructor(scene) { this.scene = scene; }
    update(delta) {}
    createGlowingOrb() {}
    createParticleBurst() {}
    createLightningStrike() {}
}

// Import Enemy Types (will be created in later steps)
// import { Enemy } from './enemy.js';
// import { Goleling } from './goleling.js';
// import { Dragon } from './dragon.js';
// import { OrcSkull } from './miniBoss.js';
// import { Cleric } = './boss.js';


console.log("SCRIPT START: script.js is loading!");

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Black background initially

// Camera (initial placeholder, will be set up fully later)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraOffset = new THREE.Vector3(0, 4, -6); // Will be relative to monk
camera.position.set(0, 50, 0); // Initial position for loading screen

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: false });
const renderWidth = window.innerWidth;
const renderHeight = window.innerHeight;
renderer.setSize(renderWidth, renderHeight, false);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- CSS2DRenderer Setup for HUD (elements will be hidden initially) ---
let css2dRenderer;
let hud;
let trackingStatus2D, gestureDisplay2D, healthBar2D, gameMessage2D;
let trackingStatusElement, gestureDisplayElement, healthBarContainerElement, healthBarFillElement, gameMessageElement;
let loadingScreen, loadingBarFill, loadingText; // References to loading screen HTML elements

try {
    css2dRenderer = new CSS2DRenderer();
    css2dRenderer.setSize(renderWidth, renderHeight);
    css2dRenderer.domElement.style.position = 'absolute';
    css2dRenderer.domElement.style.top = '0px';
    css2dRenderer.domElement.style.pointerEvents = 'none'; // Essential for interaction with underlying canvas
    css2dRenderer.domElement.style.width = '100%';
    css2dRenderer.domElement.style.height = '100%';

    const hudContainer = document.getElementById('hud-container');
    if (hudContainer) {
        hudContainer.appendChild(css2dRenderer.domElement);
    } else {
        document.body.appendChild(css2dRenderer.domElement);
    }

    // These elements exist in HTML, we'll get references to them
    trackingStatusElement = document.getElementById('tracking-status');
    gestureDisplayElement = document.getElementById('gesture-display');
    healthBarContainerElement = document.getElementById('health-bar-container');
    healthBarFillElement = document.getElementById('health-bar-fill');
    gameMessageElement = document.getElementById('game-message');

    // Create CSS2DObjects and add them to a HUD group for camera attachment
    // (Actual positioning will be done in animate loop relative to camera)
    hud = new THREE.Object3D();
    camera.add(hud);

    trackingStatus2D = new CSS2DObject(trackingStatusElement); hud.add(trackingStatus2D);
    gestureDisplay2D = new CSS2DObject(gestureDisplayElement); hud.add(gestureDisplay2D);
    healthBar2D = new CSS2DObject(healthBarContainerElement); hud.add(healthBar2D);
    gameMessage2D = new CSS2DObject(gameMessageElement); hud.add(gameMessage2D);

    // Get loading screen elements
    loadingScreen = document.getElementById('loading-screen');
    loadingBarFill = document.getElementById('loading-bar-fill');
    loadingText = document.getElementById('loading-text');

} catch (e) {
    console.error("ERROR DURING CSS2DRenderer SETUP:", e);
}


// --- Game State Variables (minimal for now) ---
let gameRunning = false; // Game starts paused during loading
const clock = new THREE.Clock();
let monk, skycastleModel; // References to main scene objects
let particleEngine; // Placeholder for SPE instance

// --- Audio System ---
let audioListener;
let soundManager; // Custom sound manager instance
let loadingAudio, ambientAudio; // Specific audio references

class SoundManager {
    constructor(listener) {
        this.listener = listener;
        // Use the common audioLoader passed from the main script which is linked to LoadingManager
        this.audioLoader = audioLoader;
        this.sounds = {};
        this.currentMusic = null; // To track currently playing music track
    }

    // Loads a sound and stores it by name.
    async loadSound(name, url, isMusic = false, loop = false) {
        try {
            const buffer = await this.audioLoader.loadAsync(url);
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(buffer);
            sound.setLoop(loop);
            sound.setVolume(isMusic ? 0.3 : 0.7); // Music usually softer
            this.sounds[name] = sound;
            console.log(`Sound loaded: ${name}`);
            return sound;
        } catch (error) {
            console.error(`Error loading sound ${name} from ${url}:`, error);
            return null;
        }
    }

    // Plays a sound by name. If already playing (and not looping), it will restart.
    playSound(name, volume = 1.0) {
        const sound = this.sounds[name];
        if (sound) {
            if (sound.isPlaying) {
                if (!sound.getLoop()) { // Restart if it's a non-looping effect
                    sound.stop();
                    sound.setVolume(volume);
                    sound.play();
                }
            } else {
                sound.setVolume(volume);
                sound.play();
            }
        } else {
            console.warn(`Sound '${name}' not found.`);
        }
    }

    // Stops a sound by name.
    stopSound(name) {
        const sound = this.sounds[name];
        if (sound && sound.isPlaying) {
            sound.stop();
        }
    }

    // Handles smooth transitions between background music tracks.
    playMusic(musicName, crossfadeDuration = 2.0) {
        const targetMusic = this.sounds[musicName];
        if (!targetMusic || this.currentMusic === targetMusic) return; // Already playing this music

        console.log(`Transitioning to music: ${musicName}`);

        if (this.currentMusic) {
            // Fade out current music
            gsap.to(this.currentMusic.gain.gain, {
                value: 0,
                duration: crossfadeDuration,
                onComplete: () => {
                    this.currentMusic.stop();
                }
            });
        }

        // Fade in new music
        targetMusic.setVolume(0); // Start new music quietly
        targetMusic.play();
        gsap.to(targetMusic.gain.gain, {
            value: targetMusic.getVolume(), // Fade to its intended volume (set in loadSound)
            duration: crossfadeDuration
        });
        this.currentMusic = targetMusic;
    }

    // Stops all currently playing sounds and music.
    stopAllSounds() {
        for (const name in this.sounds) {
            if (this.sounds[name].isPlaying) {
                this.sounds[name].stop();
            }
        }
        this.currentMusic = null;
    }
}


// --- Asset Loaders & Loading Manager ---
const loadingManager = new THREE.LoadingManager();
// IMPORTANT: Pass the loadingManager to the loaders!
const gltfLoader = new GLTFLoader(loadingManager);
const audioLoader = new THREE.AudioLoader(loadingManager); // Now linked to the manager

// Define assets to load for the initial screen and ambient music
const assetsToLoad = {
    'skycastle': 'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
    'monk': 'https://weat-ctrl.github.io/ArCoreWebTest/Monk.gltf', // Monk model
    'loading_music': 'https://weat-ctrl.github.io/ArCoreWebTest/gamescore/loading.mp3',
    'ambient_music': 'https://weat-ctrl.github.io/ArCoreWebTest/gamescore/ambient2.mp3',
    // We'll add other assets (enemies, SFX) in later steps
};
const loadedAssets = {}; // Cache for loaded assets

// Loading Manager Callbacks
loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const progress = (itemsLoaded / itemsTotal) * 100;
    loadingBarFill.style.width = `${progress}%`;
    loadingText.textContent = `Loading... ${Math.round(progress)}%`;
    console.log(`Loading progress: ${url} - ${itemsLoaded}/${itemsTotal} (${Math.round(progress)}%)`);
};

loadingManager.onLoad = async () => {
    console.log("All initial assets loaded!");
    // Stop the loading music
    if (loadingAudio && loadingAudio.isPlaying) {
        loadingAudio.stop();
    }

    // --- DEBUGGING CONSOLE LOGS ---
    console.log("DEBUG: Contents of loadedAssets:", loadedAssets);
    console.log("DEBUG: loadedAssets.skycastle:", loadedAssets.skycastle);
    console.log("DEBUG: loadedAssets.monk:", loadedAssets.monk);
    // ----------------------------------------

    // IMPORTANT: Check if gsap is defined before using it
    if (typeof gsap === 'undefined') {
        console.error("GSAP is not defined! Loading screen cannot fade out.");
        loadingScreen.style.display = 'none'; // Fallback: immediately hide if GSAP isn't there
        document.body.classList.add('loaded');
        
        // Resume AudioContext on user interaction for mobile browser policies
        if (audioListener && audioListener.context.state === 'suspended') {
            try {
                await audioListener.context.resume();
                soundManager.playMusic('ambient_music', 0); // No crossfade
            } catch (e) {
                console.warn("Could not resume AudioContext without GSAP:", e);
            }
        } else {
             soundManager.playMusic('ambient_music', 0); // No crossfade
        }

        gameRunning = true; // Enable game logic
        initSceneContent(); // Initialize the scene even without GSAP fade
        return; // Exit if GSAP is missing
    }

    console.log("GSAP is available, fading out loading screen.");
    // Fade out loading screen using GSAP
    gsap.to(loadingScreen, {
        opacity: 0,
        duration: 1.5, // Fade out over 1.5 seconds
        onComplete: async () => {
            loadingScreen.style.display = 'none'; // Hide the screen completely
            document.body.classList.add('loaded'); // Add class to body to show canvas
            
            // Resume AudioContext on user interaction for mobile browser policies
            if (audioListener && audioListener.context.state === 'suspended') {
                try {
                    await audioListener.context.resume();
                    console.log("AudioContext resumed.");
                    soundManager.playMusic('ambient_music'); // Start ambient music
                } catch (e) {
                    console.warn("Could not resume AudioContext (user interaction required):", e);
                    // You might want to show a "Click to start" message here
                }
            } else {
                 soundManager.playMusic('ambient_music'); // Play music if context is already running
            }

            gameRunning = true; // Enable game logic
            // Initialize the rest of the scene after loading is complete
            initSceneContent();
        }
    });
};

// --- Preload Assets Function ---
async function preloadAssets() {
    // Initialize AudioListener and SoundManager *before* loading audio
    audioListener = new THREE.AudioListener();
    camera.add(audioListener); // Add listener to camera
    soundManager = new SoundManager(audioListener); // Pass the audioLoader instance

    // Load the loading music separately and play it immediately
    loadingAudio = new THREE.Audio(audioListener);
    try {
        const loadingBuffer = await audioLoader.loadAsync(assetsToLoad.loading_music);
        loadingAudio.setBuffer(loadingBuffer);
        loadingAudio.setLoop(true);
        loadingAudio.setVolume(0.5);
        loadingAudio.play();
        console.log("Loading music started.");
    } catch (e) {
        console.error("Failed to play loading music:", e);
    }


    const loadPromises = [];
    for (const key in assetsToLoad) {
        const url = assetsToLoad[key];
        if (url.endsWith('.gltf') || url.endsWith('.glb')) {
            // This promise stores the GLTF object (which contains the .scene)
            loadPromises.push(gltfLoader.loadAsync(url).then(gltf => {
                // --- ADDED DEBUG LOG HERE ---
                console.log(`DEBUG: GLTF loaded for key '${key}' from URL '${url}':`, gltf);
                // ----------------------------
                loadedAssets[key] = gltf;
            }));
        } else if (url.endsWith('.mp3')) {
            // Load other sounds into the SoundManager (ambient music, SFX, etc.)
            // Skip loading_music here as it's handled above
            if (key !== 'loading_music') {
                // This promise stores the THREE.Audio object
                loadPromises.push(soundManager.loadSound(key, url, key.includes('music'), key.includes('music')));
            }
        }
        // Add other asset types (textures etc.) here if needed
    }
    // Use loadingManager to track progress of all promises
    await Promise.all(loadPromises.map(p => {
        // Wrap promises to feed into LoadingManager's progress correctly
        return p.catch(error => {
            console.error(`Failed to load asset from ${error.request.responseURL || url}:`, error);
            return null; // Don't block if one asset fails, but report it and return null
        });
    }));
}


// --- Scene Content Initialization (after loading) ---
async function initSceneContent() {
    console.log("initSceneContent() function called. Building the scene.");

    // Setup Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);
    console.log("Lights added.");

    try {
        // Load Skycastle (now from loadedAssets cache)
        // This is where the error likely originates if loadedAssets.skycastle is undefined
        if (!loadedAssets.skycastle) {
            console.error("Error: skycastle model is not in loadedAssets. Cannot initialize scene content.");
            return; // Stop initialization if critical asset is missing
        }
        skycastleModel = loadedAssets.skycastle.scene;
        skycastleModel.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
                node.castShadow = true;
            }
        });
        scene.add(skycastleModel);
        console.log("Skycastle added to scene.");

        // Load Monk (now from loadedAssets cache)
        // This is where the error likely originates if loadedAssets.monk is undefined
        if (!loadedAssets.monk) {
             console.error("Error: monk model is not in loadedAssets. Cannot initialize scene content.");
             return; // Stop initialization if critical asset is missing
        }
        monk = loadedAssets.monk.scene;
        monk.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
            }
        });
        scene.add(monk);
        monk.scale.set(0.5, 0.5, 0.5);
        monk.position.set(0, 30, 0); // Initial position
        monk.visible = false; // Monk is invisible
        snapToGround(monk, 2); // Assuming monkHeight is 2
        console.log("Monk added to scene and hidden.");

        // Initialize SPE (placeholder for now)
        particleEngine = new ShaderParticleEngine(scene);

        // Setup other elements (joystick, gesture recognition, etc.)
        // These will be filled in during later steps.
        setupJoystick();
        // setupGestureRecognizer();
        // updateHealthBar();
        // displayCurrentGesture();

        // Start game loop
        animate();
        console.log("Animation loop started.");
    } catch (error) {
        console.error("Error initializing scene content:", error);
    }
}


// --- Player Helper Functions (simplified for now) ---
function snapToGround(object, height) {
    if (!object || !skycastleModel) return;
    const raycaster = new THREE.Raycaster();
    // Start raycast slightly above the object, point down
    raycaster.set(object.position.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(0, -1, 0));
    raycaster.far = 20; // Check a reasonable distance

    const intersects = raycaster.intersectObject(skycastleModel, true);
    if (intersects.length > 0) {
        // Set object's Y position to the intersection point's Y plus half its height
        object.position.y = intersects[0].point.y + height / 2 + 0.1; // Add small offset
    }
}

// Placeholder for joystick setup (to be filled in later)
let joystick;
function setupJoystick() {
    // Dummy setup to avoid errors for now
    console.log("Joystick setup placeholder.");
    const joystickWrapper = document.getElementById('joystick-wrapper');
    if (joystickWrapper) {
        joystickWrapper.innerHTML = '';
    }
}

// Placeholder for gesture recognizer setup (to be filled in later)
// let gestureRecognizer;
// let videoElement;
// let enableWebcam = false;
// async function setupGestureRecognizer() { console.log("Gesture Recognizer setup placeholder."); }

// Placeholder for health bar update (to be filled in later)
// function updateHealthBar() { console.log("Health bar update placeholder."); }

// Placeholder for gesture display (to be filled in later)
// function displayCurrentGesture() { console.log("Gesture display placeholder."); }


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (gameRunning) {
        // Update Monk, enemies, and game logic here in later steps
        // For now, just update camera
        updateCamera();
    }

    // Always update particle engine regardless of gameRunning state for lingering effects
    if (particleEngine) particleEngine.update(delta);

    renderer.render(scene, camera);
    if (css2dRenderer) {
        // Keep HUD elements relative to camera (placeholder positions for now)
        const hudZ = -0.5; // Z position in camera space
        if (trackingStatus2D) trackingStatus2D.position.set(-0.8, 0.4, hudZ); // Top-left area
        if (healthBar2D) healthBar2D.position.set(0.8, 0.4, hudZ); // Top-right area
        if (gestureDisplay2D) gestureDisplay2D.position.set(0, -0.4, hudZ); // Bottom-center area
        if (gameMessage2D) gameMessage2D.position.set(0, 0, hudZ); // Center screen
        css2dRenderer.render(scene, camera);
    }
}

// Simple camera update function for initial view
function updateCamera() {
    // For loading screen, just keep camera still or simple orbit
    // Once monk is loaded, it will follow the monk
    if (monk) {
         // Follow the monk (simplified for this stage)
         const relativeCameraOffset = cameraOffset.clone();
         const targetPosition = monk.position.clone().add(relativeCameraOffset);
         camera.position.lerp(targetPosition, 0.1);
         camera.lookAt(monk.position.clone().add(new THREE.Vector3(0, 1, 0))); // Look slightly above monk
    } else {
        // If monk not loaded yet, just show an empty scene
        camera.position.set(0, 50, 0); // Keep camera up high
        camera.lookAt(scene.position);
    }
}


// --- Window Resizing ---
window.addEventListener('resize', () => {
    const newRenderWidth = window.innerWidth;
    const newRenderHeight = window.innerHeight;

    camera.aspect = newRenderWidth / newRenderHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newRenderWidth, newRenderHeight, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    if (css2dRenderer) {
        css2dRenderer.setSize(newRenderWidth, newRenderHeight);
        css2dRenderer.domElement.style.width = '100%';
        css2dRenderer.domElement.style.height = '100%';
    }
});

// Start the asset preloading process when the script loads
preloadAssets();
