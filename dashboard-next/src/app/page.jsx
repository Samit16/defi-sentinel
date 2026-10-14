"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Topbar from "../components/Topbar";
import PrototypeStrip from "../components/PrototypeStrip";
import Footer from "../components/Footer";
import ViewportFrame from "../components/ViewportFrame";
import UploadScreen from "../components/UploadScreen";
import ConfigureScreen from "../components/ConfigureScreen";
import RunningScreen from "../components/RunningScreen";
import ReportScreen from "../components/ReportScreen";
import HistoryScreen from "../components/HistoryScreen";

const PixelFieldCanvas = dynamic(() => import("../components/PixelFieldCanvas"), {
  ssr: false,
});
const GlassCanvas = dynamic(() => import("../components/GlassCanvas"), {
  ssr: false,
});

function getRouteFromHash() {
  if (typeof window === "undefined") return "upload";
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return ["upload", "configure", "running", "report", "history"].includes(raw)
    ? raw
    : "upload";
}

export default function Page() {
  const [activeRoute, setActiveRoute] = useState("upload");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [toast, setToast] = useState({ message: "", visible: false });
  const toastTimerRef = useRef(null);

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

  useEffect(() => {
    const initialRoute = getRouteFromHash();
    if (!window.location.hash) {
      window.location.hash = "/upload";
    } else {
      setActiveRoute(initialRoute);
    }

    const onHashChange = () => {
      const nextRoute = getRouteFromHash();
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced) {
        setIsTransitioning(true);
        setTimeout(() => {
          setActiveRoute(nextRoute);
          setIsTransitioning(false);
        }, 140);
      } else {
        setActiveRoute(nextRoute);
      }
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
  }, []);

  return (
    <>
      <PixelFieldCanvas />
      <GlassCanvas activeRoute={activeRoute} state={state} />
      <ViewportFrame />

      <div className="app-shell">
        <Topbar activeRoute={activeRoute} />
        <PrototypeStrip />

        <main
          id="app"
          tabIndex={-1}
          aria-live="polite"
          className={isTransitioning ? "is-transitioning" : ""}
        >
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
        </main>

        <Footer />
      </div>

      <div
        className={`toast ${toast.visible ? "is-visible" : ""}`}
        role="status"
      >
        {toast.message}
      </div>
    </>
  );
}
