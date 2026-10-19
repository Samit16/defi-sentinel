"use client";

import Script from "next/script";

const SPLINE_SCENE_URL = "https://prod.spline.design/Q2bZ1zmJNrH4PFxo/scene.splinecode";

export default function HeroSplineScene() {
  return (
    <div className="landing-spline-scene">
      <Script
        type="module"
        src="https://cdn.spline.design/@splinetool/viewer@2.0.95/build/spline-viewer.webgpu.js"
        strategy="afterInteractive"
      />

      <spline-viewer
        url={SPLINE_SCENE_URL}
        background="transparent"
        loading="eager"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "transparent",
        }}
      />
    </div>
  );
}
