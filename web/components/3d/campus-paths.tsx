"use client";

export function CampusPaths() {
  return (
    <group position={[0, -0.015, 0]}>
      {/* Main vertical path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[2, 30]} />
        <meshStandardMaterial color="#162032" roughness={0.9} />
      </mesh>

      {/* Cross path leading to AI / CS lab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -5]} receiveShadow>
        <planeGeometry args={[20, 2]} />
        <meshStandardMaterial color="#162032" roughness={0.9} />
      </mesh>

      {/* Path to Seminar Hall */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4, 0, 5]} receiveShadow>
        <planeGeometry args={[10, 2]} />
        <meshStandardMaterial color="#162032" roughness={0.9} />
      </mesh>
    </group>
  );
}
