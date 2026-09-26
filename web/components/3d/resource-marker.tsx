import { useMemo, useState, useEffect } from "react";

import { Html, Float } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "framer-motion";

export type ResourceStatus =
  "available" | "occupied" | "limited" | "maintenance";

export interface ResourceMarkerProps {
  position: [number, number, number];
  label: string;
  count: number;
  status: ResourceStatus;
  onClick?: () => void;
  selected?: boolean;
}

const statusColorMap = {
  available: "#32D583", // Success
  occupied: "#F04438", // Danger
  limited: "#F79009", // Warning
  maintenance: "#94A3B8", // Muted
};

export function ResourceMarker({
  position,
  label,
  count,
  status,
  onClick,
  selected = false,
}: ResourceMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const color = statusColorMap[status];
  const prefersReducedMotion = useReducedMotion();

  // Defer HTML mounting to avoid React 19 / Drei synchronous unmount warning
  // triggered by StrictMode or Suspense aborts during initial render phase.
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 50); // Small macro-task delay to allow React Suspense/StrictMode boundaries to settle
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, []);

  // Material setup - memorized for performance
  const markerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: selected ? 0.8 : hovered ? 0.5 : 0.1,
        roughness: 0.1,
        metalness: 0.8,
      }),
    [color, hovered, selected],
  );

  return (
    <group position={position}>
      <Float
        speed={prefersReducedMotion ? 0 : 2} // Animation speed
        rotationIntensity={prefersReducedMotion ? 0 : 0.2} // XYZ rotation intensity
        floatIntensity={prefersReducedMotion ? 0 : 0.5} // Up/down float intensity
        floatingRange={prefersReducedMotion ? [0, 0] : [-0.1, 0.1]}
      >
        {/* Core Marker Geometry */}
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
            document.body.style.cursor = "default";
          }}
          material={markerMaterial}
          castShadow
        >
          {/* A sleek diamond/octahedron shape for the marker */}
          <octahedronGeometry args={[0.5, 0]} />
        </mesh>

        {/* Selected Ring */}
        {selected && (
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
            <ringGeometry args={[0.7, 0.8, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}

        {/* HTML UI Panel (anchored to 3D position) */}
        {isMounted && (
          <Html
            position={[0, 0.8, 0]}
            center
            distanceFactor={16} // Increased for better legibility at default camera distances
            zIndexRange={[100, 0]}
            style={{
              transition: "all 0.2s",
              opacity: hovered || selected ? 1 : 0.85,
            }}
            // Hide if too far or blocked logic could go here
          >
            <button
              type="button"
              aria-label={`${label}. ${count} resources. Status: ${status}.`}
              className={cn(
                "flex cursor-pointer select-none flex-col items-center gap-1 transition-transform outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-full",
                selected ? "scale-110" : "scale-100 hover:scale-[1.03]",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
              }}
            >
              <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-[#0B1224]/95 px-4 py-1.5 font-sans shadow-xl backdrop-blur-md">
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                  style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
                />
                <span className="font-semibold text-white/95 text-sm tracking-wide">{label}</span>
                <span className="text-white/60 text-sm font-medium">({count})</span>
              </div>

              {/* Contextual tooltip content only visible when selected */}
              {selected && (
                <div className="mt-1.5 w-max rounded-[var(--radius-md)] border border-border/80 bg-[#101A31]/95 p-3.5 text-center shadow-2xl backdrop-blur mx-auto cursor-default">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                    Status
                  </p>
                  <span
                    className="block font-bold capitalize text-base"
                    style={{ color }}
                  >
                    {status}
                  </span>
                </div>
              )}
            </button>
          </Html>
        )}
      </Float>
    </group>
  );
}
