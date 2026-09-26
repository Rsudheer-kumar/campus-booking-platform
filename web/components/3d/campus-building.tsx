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
  seminar: "#1A2436",
  sports: "#1C2840",
  general: "#182236",
  research: "#16233B",
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
        color: selected ? "#233D72" : baseColor,
        roughness: 0.8,
        metalness: 0.2,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: selected ? "#7BA7FF" : "#324B77",
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.75,
      }),
      roof: new THREE.MeshStandardMaterial({
        color: selected ? "#1A2E5A" : "#121A28",
        roughness: 0.9,
        metalness: 0.1,
      }),
      highlight: new THREE.MeshBasicMaterial({
        color: selected ? "#4F8CFF" : hovered ? "#7BA7FF" : "#1E2A44",
      }),
    };
  }, [baseColor, selected, hovered]);

  // Edges provide the wireframe architectural look
  const edgeColor = selected ? "#7BA7FF" : hovered ? "#4F8CFF" : "#2A3A5A";
  const edgeWidth = selected ? 2 : (hovered ? 1.5 : 1);

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
      {/* Base Layer for all buildings - creates a shadow gap and building pad */}
      <mesh position={[0, -h / 2 + 0.1, 0]} castShadow receiveShadow material={materials.roof}>
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
          {/* Glass Side Facade extending slightly */}
          <mesh position={[w / 2 + 0.05, 0, 0]} material={materials.glass} castShadow>
            <boxGeometry args={[0.2, h * 0.9, d * 0.7]} />
          </mesh>
          <mesh position={[-w / 2 - 0.05, 0, 0]} material={materials.glass} castShadow>
            <boxGeometry args={[0.2, h * 0.9, d * 0.7]} />
          </mesh>
          {/* Top Tech/HVAC block */}
          <mesh position={[0, h / 2 + 0.4, -d / 4]} castShadow material={materials.roof}>
            <boxGeometry args={[w * 0.6, 0.8, d * 0.4]} />
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
          {/* Horizontal Glass Bands */}
          <mesh position={[0, h * 0.25, d / 2 + 0.05]} material={materials.glass}>
            <boxGeometry args={[w * 0.9, h * 0.15, 0.1]} />
          </mesh>
          <mesh position={[0, -h * 0.15, d / 2 + 0.05]} material={materials.glass}>
            <boxGeometry args={[w * 0.9, h * 0.15, 0.1]} />
          </mesh>
          {/* Inset Second Floor / Detail */}
          <mesh position={[w / 4, h / 2 + 0.3, 0]} castShadow material={materials.roof}>
            <boxGeometry args={[w * 0.4, 0.6, d * 0.8]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "seminar" && (
        <group>
          <mesh castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w, h, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Large Entrance Cutout / Canopy indicator */}
          <mesh position={[0, -h / 4, d / 2 + 0.1]} material={materials.glass}>
            <boxGeometry args={[w * 0.4, h / 2, 0.2]} />
          </mesh>
          <mesh position={[0, 0, d / 2 + 0.25]} castShadow material={materials.roof}>
            <boxGeometry args={[w * 0.5, 0.2, 0.5]} />
          </mesh>
          {/* Stepped roof section */}
          <mesh position={[-w / 4, h / 2 + 0.5, d / 4]} castShadow material={materials.roof}>
            <boxGeometry args={[w * 0.5, 1, d * 0.5]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "sports" && (
        <group>
          {/* Base Volume Box */}
          <mesh castShadow receiveShadow material={materials.body} position={[0, -h * 0.25, 0]}>
            <boxGeometry args={[w, h * 0.5, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Faux curved roof implemented as segmented cylinder on its side */}
          <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.roof}>
            <cylinderGeometry args={[d / 2, d / 2 + 0.2, w, 12, 1, false, 0, Math.PI]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* Entrance */}
          <mesh position={[0, -h / 4, d / 2 + 0.05]} material={materials.glass}>
            <boxGeometry args={[w * 0.3, h * 0.4, 0.1]} />
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
          {/* Glass on L-shape inner corner */}
          <mesh position={[0.05, -h * 0.1, d * 0.25]} material={materials.glass}>
             <boxGeometry args={[0.1, h * 0.8, d * 0.4]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
