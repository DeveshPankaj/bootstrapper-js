export default /* glsl */`

// attribute vec3 position;

// uniform mat4 projectionMatrix;
// uniform mat4 modelViewMatrix;
uniform float uTime;

varying vec3 vPosition;
varying vec2 vUv;


void main() {
    vPosition = position;
    vUv = uv;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

}
`