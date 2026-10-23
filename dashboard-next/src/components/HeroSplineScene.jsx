"use client";

import Script from "next/script";

const SPLINE_SCENE_URL = "https://prod.spline.design/Q2bZ1zmJNrH4PFxo/scene.splinecode";

export default function HeroSplineScene() {
  return (
    <div className="landing-spline-scene" style={{ position: "relative" }}>
      <Script
        type="module"
        src="https://cdn.spline.design/@splinetool/viewer@2.0.98/build/spline-viewer.webgpu.js"
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

      {/* Image patch that covers the "Built with Spline" shadow-DOM badge */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/spline-cover.png"
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: "220px",
          height: "60px",
          objectFit: "cover",
          objectPosition: "center center",
          pointerEvents: "none",
          zIndex: 10,
          display: "block",
        }}
      />
    </div>
  );
}
