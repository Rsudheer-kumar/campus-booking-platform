"use client";

import { Grid } from "@react-three/drei";

export function CampusGround() {
  return (
    <group>
      {/* Decorative procedural Grid to match our "digital twin" aesthetic */}
      <Grid
        position={[0, -0.01, 0]}
        args={[80, 80]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1E2A44" // matches --border
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#2A3F64" // slightly darker than primary to avoid overwhelming
        fadeDistance={45}
        fadeStrength={1.5}
      />

      {/* Solid invisible receiver for shadows/raycasting, dark base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#050816" depthWrite={true} roughness={1} />
      </mesh>
    </group>
  );
}
