"use client";

import { useMemo, useState } from "react";
import * as THREE from "three";
import { Edges } from "@react-three/drei";

export interface CampusBuildingProps {
  position: [number, number, number];
  size: [number, number, number]; // width, height, depth
  type: "lab" | "seminar" | "sports" | "general" | "research";
  onClick?: () => void;
  selected?: boolean;
}

const typeColorMap = {
  lab: "#1E2A44",       // Base border color for generic tech
  seminar: "#1E2A44",
  sports: "#1E2A44",
  general: "#1E2A44",
  research: "#162032",
};

export function CampusBuilding({
  position,
  size,
  type,
  onClick,
  selected = false,
}: CampusBuildingProps) {
  const [hovered, setHovered] = useState(false);
  const baseColor = typeColorMap[type];

  // Materials via useMemo to avoid recreating on renders
  const materials = useMemo(() => {
    return {
      body: new THREE.MeshStandardMaterial({
        color: selected ? "#1A2E5A" : baseColor, // Slight blue shift if selected
        roughness: 0.8,
        metalness: 0.2,
      }),
      highlight: new THREE.MeshBasicMaterial({
        color: selected ? "#4F8CFF" : hovered ? "#7BA7FF" : "#1E2A44",
      }),
    };
  }, [baseColor, selected, hovered]);

  return (
    <group position={position}>
      <mesh
        castShadow
        receiveShadow
        material={materials.body}
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
      >
        <boxGeometry args={size} />

        {/* Architectural Edges (Digital Twin Aesthetic) */}
        <Edges
          linewidth={selected ? 2 : 1}
          threshold={15} // angles above this threshold get an edge
          color={selected ? "#4F8CFF" : hovered ? "#7BA7FF" : "#2A3A5A"}
        />
      </mesh>
    </group>
  );
}
