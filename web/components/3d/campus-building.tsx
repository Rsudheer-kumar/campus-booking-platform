"use client";

import { useState } from "react";
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

// Module-level geometry cache
const geometryCache = new Map<string, THREE.BufferGeometry>();

function getBoxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `box_${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
  let geom = geometryCache.get(key) as THREE.BoxGeometry | undefined;
  if (!geom) {
    geom = new THREE.BoxGeometry(w, h, d);
    geometryCache.set(key, geom);
  }
  return geom;
}

function getCylinderGeometry(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 16,
  heightSegments = 1,
  openEnded = false,
  thetaStart = 0,
  thetaLength = Math.PI
): THREE.CylinderGeometry {
  const key = `cyl_${radiusTop.toFixed(2)}_${radiusBottom.toFixed(2)}_${height.toFixed(2)}_${thetaLength.toFixed(2)}`;
  let geom = geometryCache.get(key) as THREE.CylinderGeometry | undefined;
  if (!geom) {
    geom = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      radialSegments,
      heightSegments,
      openEnded,
      thetaStart,
      thetaLength
    );
    geometryCache.set(key, geom);
  }
  return geom;
}

function getPlaneGeometry(w: number, d: number): THREE.PlaneGeometry {
  const key = `plane_${w.toFixed(2)}_${d.toFixed(2)}`;
  let geom = geometryCache.get(key) as THREE.PlaneGeometry | undefined;
  if (!geom) {
    geom = new THREE.PlaneGeometry(w, d);
    geometryCache.set(key, geom);
  }
  return geom;
}

// Module-level material cache
interface BuildingMaterials {
  body: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
}

const materialCache = new Map<string, BuildingMaterials>();

function getBuildingMaterials(type: keyof typeof typeColorMap, selected: boolean): BuildingMaterials {
  const key = `${type}_${selected ? "1" : "0"}`;
  let set = materialCache.get(key);
  if (!set) {
    const baseColor = typeColorMap[type] || "#182236";
    set = {
      body: new THREE.MeshStandardMaterial({
        color: selected ? "#2A457D" : baseColor,
        roughness: 0.7,
        metalness: 0.1,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: selected ? "#89B4FF" : "#3C63A6",
        emissive: selected ? "#2F5092" : "#0A1224",
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
    };
    materialCache.set(key, set);
  }
  return set;
}

const selectedGroundMaterial = new THREE.MeshBasicMaterial({
  color: "#4F8CFF",
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
});

export function CampusBuilding({
  position,
  size,
  type,
  onClick,
  selected = false,
}: CampusBuildingProps) {
  const [hovered, setHovered] = useState(false);
  const materials = getBuildingMaterials(type, selected);

  // Edges provide the wireframe architectural look
  const edgeColor = selected ? "#89B4FF" : hovered ? "#4F8CFF" : "#2F4266";
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
        geometry={getBoxGeometry(w * 1.05, 0.2, d * 1.05)}
        material={materials.roof}
      >
        <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
      </mesh>

      {/* Selected state ground emphasis */}
      {selected && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -h / 2 + 0.05, 0]}
          geometry={getPlaneGeometry(w * 1.3, d * 1.3)}
          material={selectedGroundMaterial}
        />
      )}

      {/* Building Specific Architectural Massing */}

      {type === "research" && (
        <group>
          {/* Main Tower Core */}
          <mesh
            castShadow
            receiveShadow
            geometry={getBoxGeometry(w * 0.8, h, d * 0.8)}
            material={materials.body}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Glass Facade protruding */}
          <mesh
            position={[0, 0, d * 0.4 + 0.1]}
            geometry={getBoxGeometry(w * 0.6, h * 0.95, 0.2)}
            material={materials.glass}
            castShadow
          />
          {/* Side wings */}
          <mesh
            position={[w * 0.45, -h * 0.15, 0]}
            castShadow
            receiveShadow
            geometry={getBoxGeometry(w * 0.2, h * 0.7, d * 0.6)}
            material={materials.body}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          <mesh
            position={[-w * 0.45, -h * 0.15, 0]}
            castShadow
            receiveShadow
            geometry={getBoxGeometry(w * 0.2, h * 0.7, d * 0.6)}
            material={materials.body}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Top Tech block */}
          <mesh
            position={[0, h / 2 + 0.4, 0]}
            castShadow
            geometry={getBoxGeometry(w * 0.5, 0.8, d * 0.5)}
            material={materials.roof}
          >
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
        </group>
      )}

      {type === "lab" && (
        <group>
          {/* Main Wide Block */}
          <mesh
            castShadow
            receiveShadow
            geometry={getBoxGeometry(w, h, d)}
            material={materials.body}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Raised Central Roof Monitor (for lab ventilation) */}
          <mesh
            position={[0, h / 2 + 0.5, 0]}
            castShadow
            geometry={getBoxGeometry(w * 0.7, 1.0, d * 0.4)}
            material={materials.roof}
          >
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* Continuous Wrap-around Glass Window Band */}
          <mesh
            position={[0, h * 0.15, 0]}
            geometry={getBoxGeometry(w * 1.02, h * 0.25, d * 1.02)}
            material={materials.glass}
          />
          {/* Entrance Canopy */}
          <mesh
            position={[0, -h * 0.3, d / 2 + 0.4]}
            castShadow
            geometry={getBoxGeometry(w * 0.3, 0.1, 0.8)}
            material={materials.accent}
          />
        </group>
      )}

      {type === "seminar" && (
        <group>
          {/* Hall Main Body */}
          <mesh
            castShadow
            receiveShadow
            geometry={getBoxGeometry(w, h, d)}
            material={materials.body}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Sloped Roof Overlay */}
          <mesh
            position={[0, h / 2 + 0.6, 0]}
            rotation={[0.1, 0, 0]}
            castShadow
            geometry={getBoxGeometry(w * 1.1, 0.2, d * 1.1)}
            material={materials.roof}
          >
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* Tall Glass Atrium at the front */}
          <mesh
            position={[0, 0, d / 2 + 0.3]}
            geometry={getBoxGeometry(w * 0.6, h * 0.9, 0.6)}
            material={materials.glass}
            castShadow
          />
          {/* Vertical Architectural Fins on Atrium */}
          <mesh
            position={[-w * 0.2, 0, d / 2 + 0.6]}
            geometry={getBoxGeometry(0.1, h * 0.9, 0.2)}
            material={materials.accent}
          />
          <mesh
            position={[w * 0.2, 0, d / 2 + 0.6]}
            geometry={getBoxGeometry(0.1, h * 0.9, 0.2)}
            material={materials.accent}
          />
        </group>
      )}

      {type === "sports" && (
        <group>
          {/* Base Plinth */}
          <mesh
            castShadow
            receiveShadow
            position={[0, -h * 0.3, 0]}
            geometry={getBoxGeometry(w, h * 0.4, d)}
            material={materials.body}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Prominent Curved Arch Roof */}
          <mesh
            position={[0, h * 0.1, 0]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            geometry={getCylinderGeometry(d / 2, d / 2, w * 0.95, 16, 1, false, 0, Math.PI)}
            material={materials.roof}
          >
            <Edges linewidth={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* Glass end-caps for the curved roof */}
          <mesh
            position={[-w * 0.47, h * 0.1, 0]}
            rotation={[0, 0, Math.PI / 2]}
            geometry={getCylinderGeometry((d / 2) * 0.95, (d / 2) * 0.95, 0.1, 16, 1, false, 0, Math.PI)}
            material={materials.glass}
          />
          <mesh
            position={[w * 0.47, h * 0.1, 0]}
            rotation={[0, 0, Math.PI / 2]}
            geometry={getCylinderGeometry((d / 2) * 0.95, (d / 2) * 0.95, 0.1, 16, 1, false, 0, Math.PI)}
            material={materials.glass}
          />
          {/* Entrance Extrusion */}
          <mesh
            position={[0, -h * 0.25, d / 2 + 0.4]}
            castShadow
            geometry={getBoxGeometry(w * 0.4, h * 0.5, 0.8)}
            material={materials.accent}
          >
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
            geometry={getBoxGeometry(w * 0.7, h, d * 0.7)}
            material={materials.body}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Secondary Intersecting Volume */}
          <mesh
            position={[w * 0.25, -h * 0.2, d * 0.2]}
            castShadow
            receiveShadow
            geometry={getBoxGeometry(w * 0.5, h * 0.6, d * 0.6)}
            material={materials.accent}
          >
            <Edges linewidth={edgeWidth} threshold={15} color={edgeColor} />
          </mesh>
          {/* Glass Connector Area */}
          <mesh
            position={[w * 0.05, 0, -d * 0.1]}
            geometry={getBoxGeometry(w * 0.3, h * 0.85, d * 0.3)}
            material={materials.glass}
          />
        </group>
      )}
    </group>
  );
}
