import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/libs/lil-gui.module.min.js';
import { RectAreaLightHelper } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/helpers/RectAreaLightHelper.js';
import vertexShader from './vertexShader.js';
import fragmentShader from './fragmentShader.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// Grid Helper
const gridHelper = new THREE.GridHelper(20, 20);
gridHelper.visible = true
scene.add(gridHelper);

const gui = new GUI();
// const cameraFolder = gui.addFolder('Camera');

// Create Shader Material
const geometry = new THREE.SphereGeometry(2, 20, 20);
const material = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    wireframe: true
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Create a custom cursor object (e.g., a small sphere)
const cursorGeometry = new THREE.SphereGeometry(0.2, 16, 16);
const cursorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
const cursorMesh = new THREE.Mesh(cursorGeometry, cursorMaterial);
cursorMesh.visible = false; // Ensure cursor is visible for debugging
scene.add(cursorMesh);

// Create the light and add it to the scene
const pointLight = new THREE.PointLight(0xffffff, 1, 100);
scene.add(pointLight);

// Create the light slab using RectAreaLight
const rectLight = new THREE.RectAreaLight(0xffffff, 5, 10, 5);
rectLight.position.set(0, 5, 0);
rectLight.lookAt(0, 0, 0);
scene.add(rectLight);

// Add a helper to visualize the RectAreaLight
const rectLightHelper = new RectAreaLightHelper(rectLight);
rectLight.add(rectLightHelper);



const lightFolder = gui.addFolder('Rect Area Light');
lightFolder.add(rectLight.position, 'x', -20, 20).name('Position X');
lightFolder.add(rectLight.position, 'y', -20, 20).name('Position Y');
lightFolder.add(rectLight.position, 'z', -20, 20).name('Position Z');
lightFolder.add(rectLight, 'intensity', 0, 10).name('Intensity');
lightFolder.add(rectLight, 'width', 0, 20).name('Width');
lightFolder.add(rectLight, 'height', 0, 20).name('Height');
lightFolder.open();





// Offset distance for the light from the surface
const params = {
    offsetDistance: 1
};

// Add offsetDistance to GUI controls
gui.add(params, 'offsetDistance', 0, 10).name('Light Offset');
gui.add(material, 'wireframe', 0, 10).name('Wireframe');

// Raycaster and mouse vector
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Animate function
const animate = (time_delta) => {
    // Update raycaster
    raycaster.ray.origin.copy(camera.position);
    raycaster.ray.direction.set(mouse.x, mouse.y, 1).unproject(camera).sub(camera.position).normalize();

    // Check for intersection with the mesh
    const intersects = raycaster.intersectObject(mesh);

    if (intersects.length > 0) {
        cursorMesh.position.copy(intersects[0].point);
        // cursorMesh.visible = true; // Show cursor if intersecting

        // Offset the light along the normal of the surface
        const normal = intersects[0].face.normal.clone().normalize();
        const lightOffset = normal.multiplyScalar(params.offsetDistance);
        pointLight.position.copy(intersects[0].point).add(lightOffset);
    } else {
        cursorMesh.visible = false; // Hide cursor if not intersecting
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
};
requestAnimationFrame(animate);

// Mouse move event to update raycaster
document.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
});

// Handle window resizing
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
