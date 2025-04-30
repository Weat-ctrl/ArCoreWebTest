// Configuration
const CONFIG = {
    playerHeight: 1.8, // Human eye level in meters
    terrainSearchHeight: 100, // How far up to look for terrain
    safeSpawnDistance: 5 // Spawn distance from terrain center
};

let camera, scene, renderer, player, terrain;
let moveTouch = { x: 0, y: 0 };
let lookTouch = { x: 0, y: 0 };

function init() {
    // 1. Basic Three.js setup
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 2. Temporary visual reference (debug)
    const grid = new THREE.GridHelper(100, 100);
    scene.add(grid);

    // 3. Load terrain with automatic scaling
    new THREE.GLTFLoader().load(
        'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
        gltf => {
            terrain = gltf.scene;
            
            // Calculate terrain bounds
            const bbox = new THREE.Box3().setFromObject(terrain);
            const center = bbox.getCenter(new THREE.Vector3());
            const size = bbox.getSize(new THREE.Vector3());
            
            console.log(`Terrain dimensions: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`);

            // Position terrain at ground level
            terrain.position.y -= bbox.min.y;
            scene.add(terrain);

            // 4. Position player at highest point + safe distance
            findSpawnPosition(center, size);
        },
        undefined,
        err => console.error('Terrain load failed:', err)
    );

    // 5. Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0.5, 1, 0.5);
    scene.add(light, new THREE.AmbientLight(0x404040));

    // 6. Controls
    setupTouchControls();
    animate();
}

function findSpawnPosition(center, size) {
    // Create player after terrain is loaded
    player = new THREE.Group();
    
    // 1. Find highest point near terrain center
    const raycaster = new THREE.Raycaster();
    raycaster.far = CONFIG.terrainSearchHeight;
    
    const startPoint = new THREE.Vector3(
        center.x,
        center.y + size.y,
        center.z
    );
    
    raycaster.set(startPoint, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(terrain, true);
    
    if (intersects.length > 0) {
        const groundPoint = intersects[0].point;
        
        // 2. Position player above ground
        player.position.set(
            groundPoint.x + CONFIG.safeSpawnDistance,
            groundPoint.y + CONFIG.playerHeight,
            groundPoint.z + CONFIG.safeSpawnDistance
        );
        
        console.log(`Player spawned at: ${player.position.toArray().map(v => v.toFixed(1))}`);
    } else {
        // Fallback position
        player.position.set(0, CONFIG.playerHeight, 5);
        console.warn('Using fallback spawn position');
    }
    
    // 3. Add camera to player
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);
    player.add(camera);
    scene.add(player);
}

// ... (keep existing touch controls and animate functions from previous example)
