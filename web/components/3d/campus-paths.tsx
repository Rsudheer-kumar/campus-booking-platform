"use client";

import { Edges } from "@react-three/drei";

export function CampusPaths() {
  const pathColor = "#0B1224"; // matches --surface
  const edgeColor = "#1E2A44"; // matches --border

  return (
    <group position={[0, -0.012, 0]}>
      {/* Main vertical path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[2.5, 30]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Cross path leading to AI / CS lab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -5]} receiveShadow>
        <planeGeometry args={[18, 2.5]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Path to Seminar Hall */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4, 0, 5]} receiveShadow>
        <planeGeometry args={[10, 2.5]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Campus Plaza (central gathering area) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>
    </group>
  );
}
