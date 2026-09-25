"use client";

import { useMemo, useState } from "react";

import { Html, Float } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type ResourceStatus = "available" | "occupied" | "limited" | "maintenance";

export interface ResourceMarkerProps {
  position: [number, number, number];
  label: string;
  count: number;
  status: ResourceStatus;
  onClick?: () => void;
  selected?: boolean;
}

const statusColorMap = {
  available: "#32D583",   // Success
  occupied: "#F04438",    // Danger
  limited: "#F79009",     // Warning
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
  const color = statusColorMap[status];

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
    [color, hovered, selected]
  );

  return (
    <group position={position}>
      <Float
        speed={2} // Animation speed
        rotationIntensity={0.2} // XYZ rotation intensity
        floatIntensity={0.5} // Up/down float intensity
        floatingRange={[-0.1, 0.1]}
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
          <octahedronGeometry args={[0.3, 0]} />
        </mesh>

        {/* Selected Ring */}
        {selected && (
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
            <ringGeometry args={[0.4, 0.45, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* HTML UI Panel (anchored to 3D position) */}
        <Html
          position={[0, 0.5, 0]}
          center
          distanceFactor={12} // Scales html elements proportionally to camera distance
          zIndexRange={[100, 0]}
          style={{ transition: "all 0.2s", opacity: hovered || selected ? 1 : 0.8 }}
          // Hide if too far or blocked logic could go here
        >
          <div
            className={cn(
              "flex cursor-pointer select-none flex-col items-center gap-1 transition-transform",
              selected ? "scale-110" : "scale-100 hover:scale-105"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-[#0B1224]/90 px-3 py-1 font-sans text-xs tracking-tight shadow-xl backdrop-blur-md">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-semibold text-white">{label}</span>
              <span className="text-white/60">({count})</span>
            </div>

            {/* Contextual tooltip content only visible when selected */}
            {selected && (
              <div className="mt-1 w-max rounded-[var(--radius-md)] border border-border bg-[#101A31]/95 p-3 text-center shadow-lg backdrop-blur mx-auto">
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Status</p>
                <span className="block font-medium capitalize text-foreground text-sm" style={{ color }}>
                  {status}
                </span>
              </div>
            )}
          </div>
        </Html>
      </Float>
    </group>
  );
}
