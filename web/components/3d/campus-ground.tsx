"use client";

import { Grid } from "@react-three/drei";

export function CampusGround() {
  return (
    <group>
      {/* Decorative procedural Grid to match our "digital twin" aesthetic */}
      <Grid
        position={[0, -0.01, 0]}
        args={[50, 50]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1E2A44"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#4F8CFF"
        fadeDistance={30}
        fadeStrength={1}
      />

      {/* Solid invisible receiver for shadows/raycasting if needed, or subtle base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#050816" depthWrite={true} />
      </mesh>
    </group>
  );
}
