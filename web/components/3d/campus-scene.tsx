"use client";

import { Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

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
    id: "bld-innov",
    label: "Innovation Center",
    position: [5.5, 2, 5.5] as [number, number, number],
    size: [6, 4, 10] as [number, number, number],
    type: "general" as const,
    resourcesCount: 12,
    status: "available" as ResourceStatus,
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
    position: [0, 2.5, -14] as [number, number, number], // Moved to the background
    size: [12, 5, 8] as [number, number, number],
    type: "sports" as const,
    resourcesCount: 8,
    status: "maintenance" as ResourceStatus,
  },
];

export function CampusScene({
  onSelectBuilding,
  selectedBuildingId,
}: CampusSceneProps) {
  const handleSelect = useCallback(
    (id: string) => {
      onSelectBuilding?.(id === selectedBuildingId ? null : id);
    },
    [onSelectBuilding, selectedBuildingId],
  );

  return (
    <WebGLErrorBoundary fallback={<SceneFallback />}>
      <Canvas
        shadows
        dpr={[1, 1.5]} // Reduced max DPR from 2 to 1.5 for better mobile/desktop initial performance
        camera={{ position: [20, 16, 26], fov: 40 }} // Adjusted for better campus composition
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
                  // Place marker directly above building roof
                  position={[
                    b.position[0],
                    b.position[1] + b.size[1] / 2 + 1.2,
                    b.position[2],
                  ]}
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
            maxDistance={55}
            maxPolarAngle={Math.PI / 2.1} // Prevent camera going underground
            enablePan={false} // Restrict infinite panning
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </WebGLErrorBoundary>
  );
}
