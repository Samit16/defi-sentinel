"use client";

import { useEffect, useRef } from "react";

const TUNING = Object.freeze({
  ambientFlowSpeed: 0.075,
  lightFieldScale: 2.05,
  domainWarpStrength: 1.35,
  lightCoverage: 0.72,
  brightness: 0.2,
  highlightIntensity: 1.8,
  cyanBalance: 0.90,
  blueBalance: 0.70,
  whiteBalance: 0.85,
  pixelSpacing: 8.2,
  visibilityThreshold: 0.54,
  renderPixelSize: 2.5,
  targetFps: 30
});

const vertexSource = `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_viewport;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_flowSpeed;
uniform float u_fieldScale;
uniform float u_warpStrength;
uniform float u_coverage;
uniform float u_brightness;
uniform float u_highlights;
uniform vec3 u_colorBalance;
uniform float u_pitch;
uniform float u_threshold;
out vec4 outColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
  for (int octave = 0; octave < 3; octave++) {
    total += amplitude * valueNoise(p);
    p = turn * p;
    amplitude *= 0.5;
  }
  return total / 0.875;
}

void main() {
  vec2 cssPos = (gl_FragCoord.xy / u_resolution) * u_viewport;
  vec2 gridPos = cssPos / u_pitch;
  vec2 cellCenter = (floor(gridPos) + 0.5) * u_pitch;
  vec2 cellLocal = fract(gridPos) - 0.5;
  float pixelShape = 1.0 - smoothstep(0.29, 0.41, length(cellLocal));
  if (pixelShape <= 0.001) {
    outColor = vec4(0.0);
    return;
  }

  float aspect = u_viewport.x / max(u_viewport.y, 1.0);
  float time = u_time * u_flowSpeed;
  vec2 p = vec2((cellCenter.x / u_viewport.x - 0.5) * aspect,
                cellCenter.y / u_viewport.y - 0.5) * u_fieldScale;

  vec2 warpA = vec2(
    fbm(p * 0.78 + vec2(time * 0.21, time * 0.12)),
    fbm(p * 0.78 + vec2(4.7, -2.8) + vec2(-time * 0.16, time * 0.19))
  );
  vec2 warpB = vec2(
    fbm(p * 0.72 + (warpA - 0.5) * 2.4 + vec2(-1.9, 3.4) + vec2(time * 0.10, -time * 0.13)),
    fbm(p * 0.72 + (warpA - 0.5) * 2.4 + vec2(2.6, 1.1) + vec2(-time * 0.14, -time * 0.09))
  );
  vec2 q = p + (warpB - 0.5) * 2.0 * u_warpStrength;

  float basinNoise = fbm(q * 0.78 + vec2(-time * 0.13, time * 0.09));
  float foldNoise = fbm(q * 1.12 + vec2(3.2, -1.7) + vec2(time * 0.08, time * 0.12));
  float fineNoise = fbm(q * 1.82 + vec2(-2.4, 5.1) - vec2(time * 0.10, -time * 0.07));
  float folds = 1.0 - abs(2.0 * foldNoise - 1.0);
  float field = clamp(basinNoise * 0.58 + folds * 0.29 + fineNoise * 0.13, 0.0, 1.0);

  float threshold = u_threshold + (0.5 - u_coverage) * 0.22;
  float light = smoothstep(threshold - 0.055, threshold + 0.19, field);
  if (light <= 0.004) {
    outColor = vec4(0.0);
    return;
  }

  float colorFlow = 0.5 + 0.5 * sin(q.x * 1.2 - q.y * 0.9 + time * 0.23);
  float primaryRegion = clamp(u_colorBalance.y * (0.28 + 0.64 * colorFlow), 0.0, 0.92);
  float accentRegion = clamp(u_colorBalance.x * (0.26 + 0.70 * (1.0 - colorFlow)), 0.0, 0.95);
  // Matching landing page palette: deep dark teal, rich pine/emerald, vivid cyan-mint, and bright mint (#66d9bb / #4DF0A8)
  vec3 deepTeal = vec3(0.015, 0.085, 0.08);
  vec3 richPine = vec3(0.03, 0.28, 0.22);
  vec3 mutedMint = vec3(0.20, 0.55, 0.44);
  vec3 brightMint = vec3(0.35, 0.88, 0.68);
  vec3 color = mix(deepTeal, richPine, primaryRegion);
  color = mix(color, mix(mutedMint, brightMint, colorFlow), accentRegion);

  float pearlBand = smoothstep(threshold + 0.10, 0.84, field);
  float pearl = clamp(pearlBand * u_colorBalance.z * u_highlights, 0.0, 0.93);
  color = mix(color, vec3(0.86, 0.98, 0.94), pearl);
  float brightCore = smoothstep(threshold + 0.08, 0.88, field);
  float alpha = pixelShape * light * u_brightness * mix(0.62, 1.0, brightCore);
  alpha = min(alpha, 0.82);
  outColor = vec4(color, alpha);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Liquid pixel background shader could not compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function PixelFieldCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power"
    });
    if (!gl) return;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!vertexShader || !fragmentShader || !program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Liquid pixel background shader could not link:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    const vao = gl.createVertexArray();
    if (!vao) return;
    gl.bindVertexArray(vao);
    gl.useProgram(program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);

    const uniform = name => gl.getUniformLocation(program, name);
    const uniforms = {
      viewport: uniform("u_viewport"), resolution: uniform("u_resolution"),
      time: uniform("u_time"), flowSpeed: uniform("u_flowSpeed"),
      fieldScale: uniform("u_fieldScale"), warpStrength: uniform("u_warpStrength"),
      coverage: uniform("u_coverage"), brightness: uniform("u_brightness"),
      highlights: uniform("u_highlights"), colorBalance: uniform("u_colorBalance"),
      pitch: uniform("u_pitch"), threshold: uniform("u_threshold")
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let animationFrame = 0;
    let lastFrame = 0;
    let isDisposed = false;

    function resize() {
      if (isDisposed) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.ceil(width / TUNING.renderPixelSize));
      canvas.height = Math.max(1, Math.ceil(height / TUNING.renderPixelSize));
      gl.viewport(0, 0, canvas.width, canvas.height);
      scheduleFrame();
    }

    function scheduleFrame() {
      if (!animationFrame && !document.hidden && !isDisposed) {
        animationFrame = requestAnimationFrame(render);
      }
    }

    function render(timestamp) {
      animationFrame = 0;
      if (document.hidden || isDisposed) return;
      if (timestamp - lastFrame >= 1000 / TUNING.targetFps) {
        lastFrame = timestamp;
        const now = performance.now() / 1000;

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.uniform2f(uniforms.viewport, width, height);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform1f(uniforms.time, now);
        gl.uniform1f(uniforms.flowSpeed, TUNING.ambientFlowSpeed * (reducedMotion ? 0.45 : 1));
        gl.uniform1f(uniforms.fieldScale, TUNING.lightFieldScale);
        gl.uniform1f(uniforms.warpStrength, TUNING.domainWarpStrength);
        gl.uniform1f(uniforms.coverage, TUNING.lightCoverage);
        gl.uniform1f(uniforms.brightness, TUNING.brightness);
        gl.uniform1f(uniforms.highlights, TUNING.highlightIntensity);
        gl.uniform3f(uniforms.colorBalance, TUNING.cyanBalance, TUNING.blueBalance, TUNING.whiteBalance);
        gl.uniform1f(uniforms.pitch, TUNING.pixelSpacing);
        gl.uniform1f(uniforms.threshold, TUNING.visibilityThreshold);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!isDisposed) {
        animationFrame = requestAnimationFrame(render);
      }
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else {
        scheduleFrame();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleFrame();

    return () => {
      isDisposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
    };
  }, []);

  return <canvas ref={canvasRef} id="pixelFieldCanvas" aria-hidden="true"></canvas>;
}
