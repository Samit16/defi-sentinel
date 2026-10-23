"use client";

/**
 * PageTransition
 * Uses GSAP to animate screens in/out as the user navigates.
 * Pattern: the wrapper exposes a ref + imperative `leave()` function
 * so page.jsx can await the exit before swapping routes.
 */

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import gsap from "gsap";

// Very subtle scan-line overlay that moves upward — rendered as a fixed canvas overlay
// behind all panels but above the pixel field, only visible during transitions.
function ScanOverlay({ visible }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.18s ease",
        background:
          "repeating-linear-gradient(0deg,transparent 0px,transparent 3px,rgba(77,240,168,0.028) 3px,rgba(77,240,168,0.028) 4px)",
        mixBlendMode: "screen",
      }}
    />
  );
}

const PageTransition = forwardRef(function PageTransition(
  { children, routeKey },
  ref
) {
  const wrapRef = useRef(null);
  const scanVisible = useRef(false);

  useImperativeHandle(ref, () => ({
    /** Call before unmounting the old screen – returns a Promise */
    leave() {
      return new Promise((resolve) => {
        const el = wrapRef.current;
        if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          resolve();
          return;
        }
        gsap.to(el, {
          opacity: 0,
          y: -8,
          filter: "blur(2px) brightness(1.4)",
          duration: 0.22,
          ease: "power2.in",
          onComplete: resolve,
        });
      });
    },
  }));

  // Animate in every time routeKey changes (a new screen mounts)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReduced) {
      gsap.set(el, { opacity: 1, y: 0, filter: "none" });
      return;
    }

    // Start hidden below + blurred
    gsap.fromTo(
      el,
      { opacity: 0, y: 14, filter: "blur(3px) brightness(0.8)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px) brightness(1)",
        duration: 0.48,
        ease: "expo.out",
        clearProps: "filter",
      }
    );

    // Stagger all child .gsap-stagger elements (screen-header, display heading, cards)
    const staggerEls = el.querySelectorAll(
      ".screen-header, .display, .bracket-panel, .upload-layout, .configure-layout, .running-head, .report-top, .history-head"
    );
    if (staggerEls.length) {
      gsap.fromTo(
        staggerEls,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.42,
          ease: "expo.out",
          stagger: 0.055,
          delay: 0.06,
          clearProps: "opacity,transform",
        }
      );
    }
  }, [routeKey]);

  return (
    <div ref={wrapRef} style={{ willChange: "opacity, transform" }}>
      {children}
    </div>
  );
});

export default PageTransition;
