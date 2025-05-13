// Wait for DOM to fully load
document.addEventListener('DOMContentLoaded', () => {
    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById("sceneCanvas"),
        antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Load JSON scene
    const objectLoader = new THREE.ObjectLoader();
    fetch('https://weat-ctrl.github.io/ArCoreWebTest/scene.json')
        .then(response => response.json())
        .then(data => {
            const loadedScene = objectLoader.parse(data);
            scene.add(loadedScene);
        })
        .catch(error => console.error("Error loading JSON:", error));

    // Load GLB terrain
    const gltfLoader = new THREE.GLTFLoader();
    gltfLoader.load(
        'https://weat-ctrl.github.io/ArCoreWebTest/scenes/skycastle.glb', 
        (gltf) => {
            scene.add(gltf.scene);
        },
        undefined, // No progress callback
        (error) => console.error("Error loading GLB:", error)
    );

    // Create a green capsule (player)
    const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(1, 2),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    );
    scene.add(capsule);
    camera.position.set(0, 2, 5);
    capsule.add(camera);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();
});
