"use client";

import { Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Preload } from "@react-three/drei";

import { CampusGround } from "./campus-ground";
import { CampusPaths } from "./campus-paths";
import { CampusBuilding } from "./campus-building";
import { ResourceMarker, type ResourceStatus } from "./resource-marker";
import { SceneEnvironment } from "./scene-environment";
import { WebGLErrorBoundary } from "./error-boundary";
import { SceneFallback } from "./scene-fallback";

export interface CampusSceneProps {
  onSelectBuilding?: (buildingId: string | null) => void;
  selectedBuildingId?: string | null;
}

// Dummy data configuring our digital twin procedural buildings
const BUILDINGS = [
  {
    id: "bld-cs",
    label: "Computer Science Block",
    position: [-8, 2.5, -4] as [number, number, number],
    size: [6, 5, 8] as [number, number, number], // w,h,d  -> position.y should be size.y/2 to sit on ground
    type: "lab" as const,
    resourcesCount: 18,
    status: "available" as ResourceStatus,
  },
  {
    id: "bld-ai",
    label: "AI Research Lab",
    position: [6, 3, -6] as [number, number, number],
    size: [8, 6, 8] as [number, number, number],
    type: "research" as const,
    resourcesCount: 4,
    status: "limited" as ResourceStatus,
  },
  {
    id: "bld-innov",
    label: "Innovation Center",
    position: [5, 2, 5] as [number, number, number],
    size: [5, 4, 10] as [number, number, number],
    type: "general" as const,
    resourcesCount: 12,
    status: "available" as ResourceStatus,
  },
  {
    id: "bld-seminar",
    label: "Main Seminar Hall",
    position: [-6, 1.5, 6] as [number, number, number],
    size: [8, 3, 6] as [number, number, number],
    type: "seminar" as const,
    resourcesCount: 2,
    status: "occupied" as ResourceStatus,
  },
  {
    id: "bld-sports",
    label: "Sports Complex",
    position: [0, 2, 12] as [number, number, number],
    size: [12, 4, 6] as [number, number, number],
    type: "sports" as const,
    resourcesCount: 8,
    status: "maintenance" as ResourceStatus,
  },
];

export function CampusScene({ onSelectBuilding, selectedBuildingId }: CampusSceneProps) {
  const handleSelect = useCallback(
    (id: string) => {
      // Toggle selection off if already selected
      onSelectBuilding?.(id === selectedBuildingId ? null : id);
    },
    [onSelectBuilding, selectedBuildingId]
  );

  return (
    <WebGLErrorBoundary fallback={<SceneFallback />}>
      <Canvas
        shadows
        dpr={[1, 2]} // Protect performance by clamping pixel ratio
        camera={{ position: [15, 12, 20], fov: 45 }}
        style={{
          width: "100%",
          height: "100%",
          background: "#050816",
        }}
      >
        <Suspense fallback={null}>
          <SceneEnvironment />
          <CampusGround />
          <CampusPaths />

          {/* Procedural Buildings */}
          {BUILDINGS.map((b) => {
            const isSelected = selectedBuildingId === b.id;
            return (
              <group key={b.id}>
                <CampusBuilding
                  position={b.position}
                  size={b.size}
                  type={b.type}
                  selected={isSelected}
                  onClick={() => handleSelect(b.id)}
                />
                <ResourceMarker
                  // Place marker directly above building
                  position={[b.position[0], b.position[1] + b.size[1] / 2 + 1, b.position[2]]}
                  label={b.label}
                  count={b.resourcesCount}
                  status={b.status}
                  selected={isSelected}
                  onClick={() => handleSelect(b.id)}
                />
              </group>
            );
          })}

          {/* User Interaction Controls */}
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.05}
            minDistance={10}
            maxDistance={50}
            maxPolarAngle={Math.PI / 2.1} // Prevent camera going underground
            enablePan={false} // Restrict infinite panning
          />
          <Preload all />
        </Suspense>
      </Canvas>
    </WebGLErrorBoundary>
  );
}
