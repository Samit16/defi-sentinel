"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import Topbar from "../components/Topbar";
import PrototypeStrip from "../components/PrototypeStrip";
import Footer from "../components/Footer";
import ViewportFrame from "../components/ViewportFrame";
import UploadScreen from "../components/UploadScreen";
import ConfigureScreen from "../components/ConfigureScreen";
import RunningScreen from "../components/RunningScreen";
import ReportScreen from "../components/ReportScreen";
import HistoryScreen from "../components/HistoryScreen";
import LandingPage from "../components/LandingPage";
import PageTransition from "../components/PageTransition";

const PixelFieldCanvas = dynamic(() => import("../components/PixelFieldCanvas"), {
  ssr: false,
});

const GlassCanvas = dynamic(() => import("../components/GlassCanvas"), {
  ssr: false,
});

function getRouteFromHash() {
  if (typeof window === "undefined") return "landing";
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return ["upload", "configure", "running", "report", "history"].includes(raw)
    ? raw
    : "landing";
}

export default function Page() {
  const [activeRoute, setActiveRoute] = useState("landing");
  const [toast, setToast] = useState({ message: "", visible: false });
  const toastTimerRef = useRef(null);
  const pageTransRef = useRef(null);
  const appShellRef = useRef(null);
  const pendingRoute = useRef(null);

  const [state, setState] = useState({
    fileName: "",
    source: "",
    uploadValid: false,
    protocol: "",
    roleMap: {},
    constructorArgs: "",
    holds: { ETH: true, TOKEN: false },
    report: null,
    runRows: null,
    overallProgress: 0,
    controller: null,
    runPromise: null,
  });

  useEffect(() => {
    window.appState = state;
  }, [state]);

  const showToast = (message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 2200);
  };

  // GSAP-powered route change
  const navigateTo = useCallback(async (nextRoute) => {
    if (nextRoute === activeRoute) return;

    const prefersReduced = typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setActiveRoute(nextRoute);
      return;
    }

    // Animate out the landing page or current screen
    if (pageTransRef.current?.leave) {
      await pageTransRef.current.leave();
    } else if (appShellRef.current) {
      await new Promise(resolve =>
        gsap.to(appShellRef.current, {
          opacity: 0, y: -6, duration: 0.2, ease: "power2.in", onComplete: resolve
        })
      );
    }

    setActiveRoute(nextRoute);

    // Animate in the app shell if coming from landing
    requestAnimationFrame(() => {
      if (appShellRef.current) {
        gsap.fromTo(appShellRef.current,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.4, ease: "expo.out", clearProps: "transform" }
        );
      }
    });
  }, [activeRoute]);

  useEffect(() => {
    const initialRoute = getRouteFromHash();
    setActiveRoute(initialRoute);

    const onHashChange = () => {
      navigateTo(getRouteFromHash());
    };

    const onOpenReport = (event) => {
      setState(prev => ({ ...prev, report: event.detail }));
      window.location.hash = "/report";
    };

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("defisentinel:open-report", onOpenReport);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("defisentinel:open-report", onOpenReport);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [navigateTo]);

  return (
    <>
      {activeRoute === "landing" ? (
        <LandingPage />
      ) : (
        <>
          <PixelFieldCanvas />
          <GlassCanvas activeRoute={activeRoute} state={state} />
          <ViewportFrame />
          <div className="app-shell" ref={appShellRef}>
            <Topbar activeRoute={activeRoute} />
            <PrototypeStrip />
            <main id="app" tabIndex={-1} aria-live="polite">
              <PageTransition ref={pageTransRef} routeKey={activeRoute}>
                {activeRoute === "upload" && (
                  <UploadScreen
                    key="upload"
                    state={state}
                    setState={setState}
                    showToast={showToast}
                  />
                )}
                {activeRoute === "configure" && (
                  <ConfigureScreen
                    key="configure"
                    state={state}
                    setState={setState}
                  />
                )}
                {activeRoute === "running" && (
                  <RunningScreen
                    key="running"
                    state={state}
                    setState={setState}
                    showToast={showToast}
                  />
                )}
                {activeRoute === "report" && (
                  <ReportScreen
                    key="report"
                    report={state.report}
                    setState={setState}
                    showToast={showToast}
                  />
                )}
                {activeRoute === "history" && (
                  <HistoryScreen
                    key="history"
                    setState={setState}
                  />
                )}
              </PageTransition>
            </main>
            <Footer />
          </div>
        </>
      )}

      <div
        className={`toast ${toast.visible ? "is-visible" : ""}`}
        role="status"
      >
        {toast.message}
      </div>
    </>
  );
}
