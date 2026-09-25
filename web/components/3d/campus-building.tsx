"use client";

import { useMemo, useState } from "react";
import * as THREE from "three";
import { Edges } from "@react-three/drei";

export interface CampusBuildingProps {
  position: [number, number, number];
  size: [number, number, number]; // base width, height, depth
  type: "lab" | "seminar" | "sports" | "general" | "research";
  onClick?: () => void;
  selected?: boolean;
}

const typeColorMap = {
  lab: "#162032",
  seminar: "#1E2A44",
  sports: "#1A2436",
  general: "#162032",
  research: "#1C2840",
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
        roughness: 0.7,
        metalness: 0.3,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: selected ? "#4F8CFF" : "#2A3F64",
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.8,
      }),
      highlight: new THREE.MeshBasicMaterial({
        color: selected ? "#4F8CFF" : hovered ? "#7BA7FF" : "#1E2A44",
      }),
    };
  }, [baseColor, selected, hovered]);

  const edgeColor = selected ? "#4F8CFF" : hovered ? "#7BA7FF" : "#2A3A5A";
  const edgeWidth = selected ? 2 : 1;

  // Destructure sizes
  const [w, h, d] = size;

  return (
    <group
      position={position}
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
      {/* Base Layer for all buildings - creates a shadow gap */}
      <mesh position={[0, -h / 2 + 0.1, 0]} castShadow receiveShadow material={materials.body}>
        <boxGeometry args={[w * 1.05, 0.2, d * 1.05]} />
        <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
      </mesh>

      {/* Building Specific Architectural Massing */}
      {type === "research" && (
        <group>
          {/* Main Tower */}
          <mesh castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w, h, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Glass Side Facade */}
          <mesh position={[w / 2 + 0.05, 0, 0]} material={materials.glass}>
            <boxGeometry args={[0.1, h * 0.8, d * 0.8]} />
          </mesh>
          {/* Top Tech block */}
          <mesh position={[0, h / 2 + 0.5, -d / 4]} castShadow material={materials.body}>
            <boxGeometry args={[w * 0.6, 1, d * 0.4]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "lab" && (
        <group>
          {/* Main Wide Block */}
          <mesh castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w, h, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Inset Second Floor / Detail */}
          <mesh position={[w / 4, h / 2 + 0.4, 0]} castShadow material={materials.body}>
            <boxGeometry args={[w * 0.4, 0.8, d * 0.8]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "seminar" && (
        <group>
          <mesh castShadow receiveShadow material={materials.body}>
            {/* A wedge or stepped building. We use two intersecting boxes for modern look */}
            <boxGeometry args={[w, h, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          <mesh position={[-w / 4, h / 2 + 0.5, d / 4]} castShadow material={materials.body}>
            <boxGeometry args={[w * 0.5, 1, d * 0.5]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "sports" && (
        <group>
          {/* Large Volume Box */}
          <mesh castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w, h, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Faux curved roof implemented as segmented cylinder on its side */}
          <mesh position={[0, h / 2, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.body}>
            <cylinderGeometry args={[d / 2, d / 2, w, 8, 1, false, 0, Math.PI]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "general" && (
        <group>
          {/* L-Shape using two boxes */}
          <mesh position={[-w * 0.25, 0, 0]} castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w * 0.5, h, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          <mesh position={[w * 0.25, -h * 0.25, d * 0.25]} castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w * 0.5, h * 0.5, d * 0.5]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}
    </group>
  );
}
