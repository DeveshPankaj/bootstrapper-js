export default /* glsl */`
precision mediump float;

uniform float uTime;
uniform float uRadius;

varying vec3 vPosition;
varying vec2 vUv;


void main() {
    vec3 color = vec3(1, 0, 1);

    vec2 uv = vUv;
    uv -= vec2(0.5);
    uv *= 2.0;

    vec3 val = vec3(step(uRadius, length(uv)));
    gl_FragColor = vec4(val, 1.0);

}
`