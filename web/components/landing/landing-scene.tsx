"use client";

import { Suspense, useRef, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useReducedMotion, useInView } from "framer-motion";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { CampusGround } from "@/components/3d/campus-ground";
import { CampusPaths } from "@/components/3d/campus-paths";
import { CampusBuilding } from "@/components/3d/campus-building";
import { ResourceMarker, type ResourceStatus } from "@/components/3d/resource-marker";
import { SceneEnvironment } from "@/components/3d/scene-environment";
import { WebGLErrorBoundary } from "@/components/3d/error-boundary";
import { SceneFallback } from "@/components/3d/scene-fallback";

const BUILDINGS = [
  {
    id: "bld-cs",
    label: "Computer Science",
    position: [-8.5, 2.5, -5.5] as [number, number, number],
    size: [6, 5, 8] as [number, number, number],
    type: "lab" as const,
    resourcesCount: 18,
    status: "available" as ResourceStatus,
  },
  {
    id: "bld-ai",
    label: "AI Research",
    position: [6.5, 3, -5.5] as [number, number, number],
    size: [7, 6, 9] as [number, number, number],
    type: "research" as const,
    resourcesCount: 4,
    status: "limited" as ResourceStatus,
  },
  {
    id: "bld-seminar",
    label: "Seminar Hall",
    position: [-6.5, 1.5, 5.5] as [number, number, number],
    size: [8, 3, 7] as [number, number, number],
    type: "seminar" as const,
    resourcesCount: 2,
    status: "occupied" as ResourceStatus,
  },
  {
    id: "bld-sports",
    label: "Sports Complex",
    position: [0, 2.5, -14] as [number, number, number],
    size: [12, 5, 8] as [number, number, number],
    type: "sports" as const,
    resourcesCount: 8,
    status: "available" as ResourceStatus,
  }
];

function RenderOptimizer({ active }: { active: boolean }) {
  const { invalidate } = useThree();

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      invalidate();
      frameId = requestAnimationFrame(loop);
    };

    if (active) {
      frameId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(frameId);
  }, [active, invalidate]);

  return null;
}

export function LandingScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const prefersReducedMotion = useReducedMotion();
  const isInView = useInView(containerRef, { margin: "0px" });
  const [isMounted, setIsMounted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);

  const shouldAnimate = isInView && !prefersReducedMotion;

  // Progressive mount: ensures first frame of LandingPage HTML/Hero text renders immediately
  // without synchronous WebGL context creation hitch on the initial click
  useEffect(() => {
    let active = true;
    const raf = requestAnimationFrame(() => {
      if (active) setIsMounted(true);
    });
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Intercept the native wheel event before OrbitControls gets it.
  // We dynamically toggle enableZoom on the OrbitControls instance
  // based on whether Ctrl/Cmd is pressed. This allows normal wheel
  // scrolling to pass through to the page natively, while Ctrl+Wheel zooms.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (controlsRef.current) {
        controlsRef.current.enableZoom = (e.ctrlKey || e.metaKey);
      }
    };

    container.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    return () => container.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative group">
      {/* Desktop Interaction Hint */}
      <div className="absolute bottom-32 right-6 md:bottom-8 md:right-8 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none hidden sm:flex items-center gap-2 bg-[#0B1224]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#1E2A44] text-[#94A3B8] text-[11px] font-medium tracking-wide shadow-lg">
        Drag to orbit &bull; Ctrl + scroll to zoom
      </div>

      <WebGLErrorBoundary fallback={
        <div className="flex h-full w-full items-center justify-center bg-[#050816] text-[#F8FAFC]">
          <SceneFallback />
        </div>
      }>
        <div
          className={`w-full h-full transition-opacity duration-500 ease-out ${
            sceneReady ? "opacity-100" : "opacity-0"
          }`}
        >
          {isMounted && (
            <Canvas
              shadows
              dpr={[1, 1.5]}
              camera={{ position: [20, 16, 26], fov: 40 }}
              style={{ width: "100%", height: "100%", background: "transparent" }}
              frameloop="demand"
              onCreated={() => {
                setSceneReady(true);
              }}
            >
              <Suspense fallback={null}>
                <RenderOptimizer active={shouldAnimate} />
                <SceneEnvironment />
                <CampusGround />
                <CampusPaths />
                {BUILDINGS.map((b) => (
                  <group key={b.id}>
                    <CampusBuilding
                      position={b.position}
                      size={b.size}
                      type={b.type}
                    />
                    <ResourceMarker
                      position={[b.position[0], b.position[1] + b.size[1] / 2 + 1.2, b.position[2]]}
                      label={b.label}
                      count={b.resourcesCount}
                      status={b.status}
                    />
                  </group>
                ))}
                <OrbitControls
                  ref={controlsRef}
                  makeDefault
                  enableDamping
                  dampingFactor={0.05}
                  minDistance={15}
                  maxDistance={45}
                  maxPolarAngle={Math.PI / 2.2}
                  enablePan={false}
                  enableZoom={true}
                  autoRotate={shouldAnimate}
                  autoRotateSpeed={0.5}
                  target={[0, 0, 0]}
                />
              </Suspense>
            </Canvas>
          )}
        </div>
      </WebGLErrorBoundary>
    </div>
  );
}
