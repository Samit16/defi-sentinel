"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const lerp = (a, b, t) => a + (b - a) * t;

function makeEnvironment(rendererInstance) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x02030a);
  const addPanel = (color, pos, size, emissiveIntensity = 3) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), material);
    mesh.position.set(...pos);
    envScene.add(mesh);
  };
  addPanel(0x4ad8ff, [-3.2, 1.3, -2.4], [1.9, 0.055]);
  addPanel(0xe743d0, [2.5, 1.7, -3.5], [2.3, 0.07], 1.6);
  addPanel(0x4a65ff, [3.1, -1.25, -2.2], [1.7, 0.06]);
  addPanel(0xffd95f, [-2.5, -1.65, -3.1], [1.25, 0.045], 1.2);
  addPanel(0x163eff, [0, 2.6, -4.1], [3.3, 0.035], 2.5);
  const pmrem = new THREE.PMREMGenerator(rendererInstance);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromScene(envScene, 0.035).texture;
  pmrem.dispose();
  envScene.traverse(node => {
    if (node.isMesh) {
      node.geometry.dispose();
      node.material.dispose();
    }
  });
  return env;
}

function physicalMaterial(env) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.02,
    roughness: 0.14,
    transmission: 0.96,
    thickness: 0.32,
    ior: 1.38,
    iridescence: 0.55,
    iridescenceIOR: 1.25,
    iridescenceThicknessRange: [140, 420],
    clearcoat: 0.72,
    clearcoatRoughness: 0.12,
    envMap: env,
    envMapIntensity: 0.85,
    emissive: 0x021612,
    emissiveIntensity: 0.04,
    attenuationColor: new THREE.Color(0x277a66),
    attenuationDistance: 6.0,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: false
  });
  if ("dispersion" in material) material.dispersion = 0.04;
  material.onBeforeCompile = shader => {
    shader.uniforms.uFilmTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCrystalPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCrystalPosition = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCrystalPosition;
        uniform float uFilmTime;
        vec3 crystalHsvToRgb(vec3 c) {
          vec3 p=abs(fract(c.xxx+vec3(0.0,2.0/3.0,1.0/3.0))*6.0-3.0);
          return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);
        }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float filmPhase=vCrystalPosition.x*1.9+vCrystalPosition.y*1.5-vCrystalPosition.z*1.2+sin(vCrystalPosition.z*2.0+vCrystalPosition.x*1.0+uFilmTime*0.9)*1.2+uFilmTime*0.9;
        float mintBand = smoothstep(.60, .96, .5 + .5 * sin(filmPhase));
        float cyanBand = smoothstep(.65, .98, .5 + .5 * sin(filmPhase + 2.1));
        float tealBand = smoothstep(.68, .98, .5 + .5 * sin(filmPhase * .8 + vCrystalPosition.y * 1.1));
        vec3 filmColor = vec3(0.02, 0.06, 0.08);
        filmColor = mix(filmColor, vec3(0.20, 0.85, 0.60), mintBand * 0.45);
        filmColor = mix(filmColor, vec3(0.12, 0.70, 0.85), cyanBand * 0.35);
        filmColor = mix(filmColor, vec3(0.08, 0.45, 0.55), tealBand * 0.30);
        float filmSheen = max(mintBand, max(cyanBand, tealBand));
        diffuseColor.rgb = mix(diffuseColor.rgb, filmColor, .25 + .3 * filmSheen);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.04, 0.22, 0.16) * mintBand * 0.08 + vec3(0.02, 0.14, 0.20) * cyanBand * 0.06;`
      );
    material.userData.iridescenceShader = shader;
  };
  return material;
}

function withIridescentFacets(geometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
    const shimmer = 0.5 + 0.5 * Math.sin(nx * 3.1 - ny * 2.2 + nz * 2.7);
    const hue = 0.45 + 0.06 * Math.sin(nx * 2.1 - ny * 1.7 + nz * 2.5);
    const color = new THREE.Color().setHSL(hue, 0.55, 0.20 + 0.08 * shimmer);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export default function GlassCanvas({ activeRoute, state }) {
  const canvasRef = useRef(null);
  const fallbackRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRouteRef = useRef(activeRoute);
  activeRouteRef.current = activeRoute;
  const setScreenFnRef = useRef(null);

  useEffect(() => {
    if (setScreenFnRef.current) {
      setScreenFnRef.current(activeRoute, state);
    }
  }, [activeRoute, state]);

  useEffect(() => {
    let renderer, scene, camera, pointLight, fillLight;
    let visible = true, raf = 0, lastFrame = 0, frameCount = 0, fpsStart = 0, qualityReduced = false;
    let pointer = { x: 0, y: 0, down: false, lastX: 0, lastY: 0, dragX: 0, dragY: 0 };
    let targetRotation = { x: 0, y: 0 };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const objects = {};
    let isDisposed = false;

    const fallbackLayer = fallbackRef.current;
    const canvas = canvasRef.current;

    function buildFallback() {
      document.body.dataset.glassFallback = "true";
      if (!fallbackLayer) return;
      fallbackLayer.innerHTML = "";
      const obj = document.createElement("div");
      obj.className = "glass-shape glass-shape--octa";
      fallbackLayer.append(obj);
    }

    if (reduced) {
      buildFallback();
      return () => {
        delete document.body.dataset.glassFallback;
      };
    }

    function createGlassObject(route, env) {
      const objectGroup = new THREE.Group();
      // Reduced size from 1.58 to 1.15 so it does not obstruct forms
      const geometry = withIridescentFacets(new THREE.OctahedronGeometry(1.15, 0));
      const heroObject = new THREE.Mesh(geometry, physicalMaterial(env));
      objectGroup.add(heroObject);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 26),
        new THREE.LineBasicMaterial({ color: 0x4df0a8, transparent: true, opacity: 0.04 })
      );
      objectGroup.add(edge);
      // Route-specific home positions: keep it well to the right edge and slightly higher
      const routePositions = {
        upload: { homeX: 3.5, homeY: -0.3, homeZ: -0.5 },
        configure: { homeX: 3.6, homeY: 0.6, homeZ: -0.6 },
        running: { homeX: 3.4, homeY: 0.2, homeZ: -0.5 },
        report: { homeX: 3.6, homeY: 0.7, homeZ: -0.6 },
      };
      const pos = routePositions[route] || { homeX: 3.5, homeY: 0.2, homeZ: -0.5 };
      objectGroup.userData = { route, ...pos, spin: 0 };
      objectGroup.position.set(objectGroup.userData.homeX, objectGroup.userData.homeY, objectGroup.userData.homeZ);
      objectGroup.rotation.set(0.17, -0.24, 0.05);
      scene.add(objectGroup);
      objects[route] = objectGroup;
    }

    function handleResize() {
      if (!renderer || isDisposed) return;
      const width = window.innerWidth, height = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityReduced ? 1 : 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const mobile = width < 800;
      camera.position.z = mobile ? 11 : 8;
      camera.fov = mobile ? 38 : 34;
      camera.updateProjectionMatrix();
      for (const [r, item] of Object.entries(objects)) {
        if (mobile) {
          item.userData.homeX = 2.4;
          item.userData.homeY = -1.8; // Move below content on mobile
          item.scale.setScalar(0.75);
        } else {
          item.scale.setScalar(1.0);
        }
      }
    }

    function setObjectForRoute(route) {
      const objectRoute =
        route === "running" ? "running" : route === "report" || route === "history" ? "report" : route === "configure" ? "configure" : "upload";
      Object.values(objects).forEach(item => (item.visible = item.userData.route === objectRoute));
      const chosen = objects[objectRoute];
      if (chosen) {
        chosen.visible = true;
        chosen.userData.spin = 0;
      }
      if (document.body.dataset.glassFallback === "true") buildFallback();
    }

    setScreenFnRef.current = (route) => {
      setObjectForRoute(route);
    };

    function animate(time) {
      if (isDisposed) return;
      raf = requestAnimationFrame(animate);
      if (!visible || !renderer || document.hidden) return;
      if (time - lastFrame < 15) return;
      const dt = Math.min(0.05, (time - lastFrame) / 1000 || 0.016);
      lastFrame = time;

      const currentRoute = activeRouteRef.current;
      const current =
        objects[currentRoute === "running" ? "running" : currentRoute === "report" || currentRoute === "history" ? "report" : "upload"];

      if (current) {
        const progress = stateRef.current?.overallProgress || window.appState?.overallProgress || 0;
        const runBoost = currentRoute === "running" ? progress / 100 : 0;
        current.userData.spin = lerp(current.userData.spin, runBoost * 0.18, 0.045);
        if (!reduced) {
          targetRotation.x = pointer.y * 0.34 + pointer.dragY;
          targetRotation.y = pointer.x * 0.42 + pointer.dragX;
          current.rotation.x = lerp(current.rotation.x, targetRotation.x + Math.sin(time * 0.00018) * 0.08, 0.035);
          current.rotation.y = lerp(current.rotation.y, targetRotation.y + time * 0.00004 + current.userData.spin, 0.035);
          current.rotation.z = lerp(current.rotation.z, Math.sin(time * 0.00012) * 0.035, 0.025);
          const nearX = 0.66, nearY = 0.48, dist = Math.hypot(pointer.x * 0.5 + 0.5 - nearX, pointer.y * 0.5 + 0.5 - nearY);
          const push = dist < 0.24 ? (1 - dist / 0.24) * 0.18 : 0;
          const away = pointer.x > 0.25 ? -1 : 1;
          current.position.x = lerp(current.position.x, current.userData.homeX + pointer.x * 0.18 + push * away, 0.05);
          current.position.y = lerp(current.position.y, current.userData.homeY + pointer.y * 0.13, 0.05);
          current.position.z = lerp(current.position.z, current.userData.homeZ + push, 0.04);
        } else {
          current.rotation.y += dt * 0.018;
        }
      }

      const flow = time * 0.000075;
      for (const item of Object.values(objects)) {
        const shader = item.children[0]?.material?.userData?.iridescenceShader;
        if (shader) shader.uniforms.uFilmTime.value = flow;
      }
      if (pointLight) {
        pointLight.position.set(
          2.95 + Math.sin(flow * 1.05) * 1.55,
          0.25 + Math.sin(flow * 0.72) * 0.95,
          2.8 + Math.cos(flow * 0.58) * 0.45
        );
        pointLight.color.setHSL(0.56 + Math.sin(flow * 0.35) * 0.025, 0.84, 0.62);
        pointLight.intensity = 4.8 + 1.2 * (0.5 + 0.5 * Math.sin(flow * 1.1));
      }
      if (fillLight) {
        fillLight.position.set(
          2.95 + Math.cos(flow * 0.75 + 2.1) * 1.85,
          -0.15 + Math.sin(flow * 0.7 + 1.2) * 1.0,
          2.1
        );
        fillLight.intensity = 1.6 + 0.45 * (0.5 + 0.5 * Math.sin(flow * 0.8 + 1.4));
      }
      renderer.render(scene, camera);
      frameCount++;
      if (!fpsStart) fpsStart = time;
      if (time - fpsStart > 2200) {
        const fps = (frameCount * 1000) / (time - fpsStart);
        if (fps < 40 && !qualityReduced) {
          qualityReduced = true;
          handleResize();
        }
        frameCount = 0;
        fpsStart = time;
      }
    }

    let onPointerMove, onPointerDown, onPointerUp, onPointerCancel, onVisibilityChange, io;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
        stencil: false,
        depth: true
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.4;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 0, 8);
      scene.add(new THREE.AmbientLight(0x8294c0, 0.42));

      pointLight = new THREE.PointLight(0x68d9ff, 5.5, 12, 2);
      scene.add(pointLight);
      fillLight = new THREE.PointLight(0x897cff, 1.8, 10, 2);
      scene.add(fillLight);

      const env = makeEnvironment(renderer);
      createGlassObject("upload", env);
      createGlassObject("configure", env);
      createGlassObject("running", env);
      createGlassObject("report", env);

      setObjectForRoute(activeRouteRef.current);
      handleResize();

      window.addEventListener("resize", handleResize, { passive: true });

      onVisibilityChange = () => {
        visible = !document.hidden;
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      io = new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting);
      });
      io.observe(canvas);

      onPointerMove = event => {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = 1 - (event.clientY / window.innerHeight) * 2;
        if (pointer.down) {
          pointer.dragX += (event.clientX - pointer.lastX) * 0.003;
          pointer.dragY += (event.clientY - pointer.lastY) * 0.003;
          pointer.lastX = event.clientX;
          pointer.lastY = event.clientY;
        }
        if (document.body.dataset.glassFallback === "true") {
          const shape = fallbackLayer?.querySelector(".glass-shape");
          if (shape && !reduced) {
            shape.style.setProperty("--px", `${pointer.x * 14}px`);
            shape.style.setProperty("--py", `${-pointer.y * 10}px`);
            shape.style.setProperty("--rx", `${pointer.y * 4}deg`);
            shape.style.setProperty("--ry", `${pointer.x * 5}deg`);
          }
        }
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });

      onPointerDown = event => {
        if (event.pointerType === "touch") {
          pointer.down = true;
          pointer.lastX = event.clientX;
          pointer.lastY = event.clientY;
        }
      };
      window.addEventListener("pointerdown", onPointerDown, { passive: true });

      onPointerUp = () => {
        pointer.down = false;
        pointer.dragX *= 0.8;
        pointer.dragY *= 0.8;
      };
      window.addEventListener("pointerup", onPointerUp, { passive: true });

      onPointerCancel = () => {
        pointer.down = false;
      };
      window.addEventListener("pointercancel", onPointerCancel, { passive: true });

      raf = requestAnimationFrame(animate);
    } catch (error) {
      console.warn("WebGL unavailable; using CSS glass fallback.", error);
      renderer?.dispose();
      renderer = null;
      buildFallback();
    }

    return () => {
      isDisposed = true;
      setScreenFnRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      if (onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
      if (io) io.disconnect();
      if (onPointerMove) window.removeEventListener("pointermove", onPointerMove);
      if (onPointerDown) window.removeEventListener("pointerdown", onPointerDown);
      if (onPointerUp) window.removeEventListener("pointerup", onPointerUp);
      if (onPointerCancel) window.removeEventListener("pointercancel", onPointerCancel);

      if (scene) {
        scene.traverse(node => {
          if (node.isMesh || node.isLineSegments) {
            node.geometry?.dispose();
            if (Array.isArray(node.material)) {
              node.material.forEach(m => m.dispose());
            } else {
              node.material?.dispose();
            }
          }
        });
      }
      renderer?.dispose();
      delete document.body.dataset.glassFallback;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} id="glassCanvas" aria-hidden="true"></canvas>
      <div ref={fallbackRef} id="glassFallback" className="glass-fallback" aria-hidden="true"></div>
    </>
  );
}
