// script.js
let camera, scene, renderer, player;
let moveTouch = { x: 0, y: 0 };
let lookTouch = { x: 0, y: 0 };
const MOVE_SPEED = 0.1;
const LOOK_SENSITIVITY = 0.02;

function init() {
    // 1. Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

    // 3. Renderer with mobile optimizations
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1 : window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 4. Player (invisible collision capsule)
    player = new THREE.Group();
    const geometry = new THREE.CapsuleGeometry(0.3, 1.6, 4, 8);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x0000ff,
        visible: false // Hide collision mesh
    });
    player.add(new THREE.Mesh(geometry, material));
    scene.add(player);

    // 5. Attach camera to player
    player.add(camera);

    // 6. Lighting setup
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(5, 10, 5);
    scene.add(ambient, directional);

    // 7. Load GLB terrain
    new THREE.GLTFLoader().load(
        'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb',
        gltf => {
            gltf.scene.traverse(child => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: child.material.color,
                        roughness: 0.8
                    });
                    child.receiveShadow = true;
                }
            });
            scene.add(gltf.scene);
        },
        undefined,
        err => console.error('Terrain load failed:', err)
    );

    // 8. Touch controls
    setupTouchControls();
    animate();
}

function setupTouchControls() {
    const moveZone = document.getElementById('move-zone');
    const lookZone = document.getElementById('look-zone');
    
    // Common handler
    const handleTouch = (zone, store) => e => {
        const rect = zone.getBoundingClientRect();
        const touch = e.touches[0];
        store.x = (touch.clientX - rect.left) / rect.width * 2 - 1;
        store.y = (touch.clientY - rect.top) / rect.height * 2 - 1;
    };

    // Movement zone
    moveZone.addEventListener('touchmove', handleTouch(moveZone, moveTouch));
    moveZone.addEventListener('touchend', () => moveTouch.x = moveTouch.y = 0);

    // Look zone
    lookZone.addEventListener('touchmove', handleTouch(lookZone, lookTouch));
    lookZone.addEventListener('touchend', () => lookTouch.x = lookTouch.y = 0);
}

function animate() {
    requestAnimationFrame(animate);

    // Update movement
    player.position.x += moveTouch.x * MOVE_SPEED;
    player.position.z += moveTouch.y * MOVE_SPEED;

    // Update rotation
    player.rotation.y -= lookTouch.x * LOOK_SENSITIVITY;
    camera.rotation.x = THREE.MathUtils.clamp(
        camera.rotation.x - lookTouch.y * LOOK_SENSITIVITY,
        -Math.PI/3,
        Math.PI/3
    );

    renderer.render(scene, camera);
}

// Start after ensuring DOM is ready
if (document.readyState === 'complete') init();
else window.addEventListener('load', init);
