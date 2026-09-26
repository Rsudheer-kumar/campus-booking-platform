"use client";

import { Edges } from "@react-three/drei";

export function CampusPaths() {
  const pathColor = "#0D1424"; // Slightly brighter than ground for definition
  const edgeColor = "#2A3C5C"; // More contrast for path outlines

  return (
    <group position={[0, -0.012, 0]}>
      {/* Main vertical spine */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[3.0, 32]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Cross path leading to AI / CS lab */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -5.5]}
        receiveShadow
      >
        <planeGeometry args={[20, 3.0]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Lower cross path connecting Seminar (Left) and Innovation (Right) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 5.5]}
        receiveShadow
      >
        <planeGeometry args={[16, 3.0]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Campus Central Plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={pathColor} roughness={0.9} />
        <Edges linewidth={1.5} threshold={15} color={edgeColor} />

        {/* Decorative inner plaza element */}
        <mesh position={[0, 0.005, 0]}>
          <planeGeometry args={[4, 4]} />
          <meshBasicMaterial color="#1A2844" />
          <Edges linewidth={1} threshold={15} color="#354D7A" />
        </mesh>
      </mesh>
    </group>
  );
}
