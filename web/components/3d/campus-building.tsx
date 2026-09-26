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
        color: selected ? "#2A457D" : baseColor, // Brighter base on selection
        roughness: 0.7,
        metalness: 0.1,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: selected ? "#89B4FF" : "#3C63A6",
        emissive: selected ? "#2F5092" : "#0A1224", // Emissive glow for glass
        emissiveIntensity: selected ? 0.4 : 0.1,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.75,
      }),
      roof: new THREE.MeshStandardMaterial({
        color: selected ? "#1A2E5A" : "#0D131F",
        roughness: 0.9,
        metalness: 0.1,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: selected ? "#4F8CFF" : "#2E3A52",
        emissive: selected ? "#1E4799" : "#000000",
        emissiveIntensity: selected ? 0.3 : 0,
        roughness: 0.6,
      }),
      highlight: new THREE.MeshBasicMaterial({
        color: selected ? "#4F8CFF" : hovered ? "#7BA7FF" : "#1E2A44",
      }),
    };
  }, [baseColor, selected, hovered]);

  // Edges provide the wireframe architectural look
  const edgeColor = selected ? "#89B4FF" : hovered ? "#4F8CFF" : "#2F4266"; // Brighter edge for readability
  const edgeWidth = selected ? 2.5 : hovered ? 1.5 : 1;

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
      <mesh
        position={[0, -h / 2 + 0.1, 0]}
        castShadow
        receiveShadow
        material={materials.roof}
      >
        <boxGeometry args={[w * 1.05, 0.2, d * 1.05]} />
        <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
      </mesh>

      {/* Selected state ground emphasis */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -h / 2 + 0.05, 0]}>
          <planeGeometry args={[w * 1.3, d * 1.3]} />
          <meshBasicMaterial
            color="#4F8CFF"
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Building Specific Architectural Massing */}

      {type === "research" && (
        <group>
          {/* Main Tower Core */}
          <mesh castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w * 0.8, h, d * 0.8]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Glass Facade protruding */}
          <mesh
            position={[0, 0, d * 0.4 + 0.1]}
            material={materials.glass}
            castShadow
          >
            <boxGeometry args={[w * 0.6, h * 0.95, 0.2]} />
          </mesh>
          {/* Side wings */}
          <mesh
            position={[w * 0.45, -h * 0.15, 0]}
            castShadow
            receiveShadow
            material={materials.body}
          >
            <boxGeometry args={[w * 0.2, h * 0.7, d * 0.6]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          <mesh
            position={[-w * 0.45, -h * 0.15, 0]}
            castShadow
            receiveShadow
            material={materials.body}
          >
            <boxGeometry args={[w * 0.2, h * 0.7, d * 0.6]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Top Tech block */}
          <mesh
            position={[0, h / 2 + 0.4, 0]}
            castShadow
            material={materials.roof}
          >
            <boxGeometry args={[w * 0.5, 0.8, d * 0.5]} />
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
          {/* Raised Central Roof Monitor (for lab ventilation) */}
          <mesh
            position={[0, h / 2 + 0.5, 0]}
            castShadow
            material={materials.roof}
          >
            <boxGeometry args={[w * 0.7, 1.0, d * 0.4]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* Continuous Wrap-around Glass Window Band */}
          <mesh position={[0, h * 0.15, 0]} material={materials.glass}>
            <boxGeometry args={[w * 1.02, h * 0.25, d * 1.02]} />
          </mesh>
          {/* Entrance Canopy */}
          <mesh
            position={[0, -h * 0.3, d / 2 + 0.4]}
            castShadow
            material={materials.accent}
          >
            <boxGeometry args={[w * 0.3, 0.1, 0.8]} />
          </mesh>
        </group>
      )}

      {type === "seminar" && (
        <group>
          {/* Hall Main Body */}
          <mesh castShadow receiveShadow material={materials.body}>
            <boxGeometry args={[w, h, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Sloped Roof Overlay */}
          <mesh
            position={[0, h / 2 + 0.6, 0]}
            rotation={[0.1, 0, 0]}
            castShadow
            material={materials.roof}
          >
            <boxGeometry args={[w * 1.1, 0.2, d * 1.1]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* Tall Glass Atrium at the front */}
          <mesh
            position={[0, 0, d / 2 + 0.3]}
            material={materials.glass}
            castShadow
          >
            <boxGeometry args={[w * 0.6, h * 0.9, 0.6]} />
          </mesh>
          {/* Vertical Architectural Fins on Atrium */}
          <mesh
            position={[-w * 0.2, 0, d / 2 + 0.6]}
            material={materials.accent}
          >
            <boxGeometry args={[0.1, h * 0.9, 0.2]} />
          </mesh>
          <mesh
            position={[w * 0.2, 0, d / 2 + 0.6]}
            material={materials.accent}
          >
            <boxGeometry args={[0.1, h * 0.9, 0.2]} />
          </mesh>
        </group>
      )}

      {type === "sports" && (
        <group>
          {/* Base Plinth */}
          <mesh
            castShadow
            receiveShadow
            material={materials.body}
            position={[0, -h * 0.3, 0]}
          >
            <boxGeometry args={[w, h * 0.4, d]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Prominent Curved Arch Roof */}
          <mesh
            position={[0, h * 0.1, 0]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            material={materials.roof}
          >
            <cylinderGeometry
              args={[d / 2, d / 2, w * 0.95, 16, 1, false, 0, Math.PI]}
            />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* Glass end-caps for the curved roof */}
          <mesh
            position={[-w * 0.47, h * 0.1, 0]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.glass}
          >
            <cylinderGeometry
              args={[
                (d / 2) * 0.95,
                (d / 2) * 0.95,
                0.1,
                16,
                1,
                false,
                0,
                Math.PI,
              ]}
            />
          </mesh>
          <mesh
            position={[w * 0.47, h * 0.1, 0]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.glass}
          >
            <cylinderGeometry
              args={[
                (d / 2) * 0.95,
                (d / 2) * 0.95,
                0.1,
                16,
                1,
                false,
                0,
                Math.PI,
              ]}
            />
          </mesh>
          {/* Entrance Extrusion */}
          <mesh
            position={[0, -h * 0.25, d / 2 + 0.4]}
            castShadow
            material={materials.accent}
          >
            <boxGeometry args={[w * 0.4, h * 0.5, 0.8]} />
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "general" && (
        <group>
          {/* Main L-Shape Body */}
          <mesh
            position={[-w * 0.15, 0, -d * 0.15]}
            castShadow
            receiveShadow
            material={materials.body}
          >
            <boxGeometry args={[w * 0.7, h, d * 0.7]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Secondary Intersecting Volume */}
          <mesh
            position={[w * 0.25, -h * 0.2, d * 0.2]}
            castShadow
            receiveShadow
            material={materials.accent}
          >
            <boxGeometry args={[w * 0.5, h * 0.6, d * 0.6]} />
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Glass Connector Area */}
          <mesh position={[w * 0.05, 0, -d * 0.1]} material={materials.glass}>
            <boxGeometry args={[w * 0.3, h * 0.85, d * 0.3]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
