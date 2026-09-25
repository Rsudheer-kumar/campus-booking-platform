"use client";

import { Environment } from "@react-three/drei";

export function SceneEnvironment() {
  return (
    <>
      <ambientLight intensity={0.5} color="#F8FAFC" />

      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
        color="#F8FAFC"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />

      <directionalLight position={[-10, 5, -10]} intensity={0.3} color="#4F8CFF" />

      {/* Atmospheric Fog aligned with our #050816 background */}
      <fog attach="fog" args={["#050816", 15, 60]} />

      {/*
        Using preset="city" gives soft realistic reflections,
        but lowered intensity to keep the dark aesthetic
      */}
      <Environment preset="city" environmentIntensity={0.1} />
    </>
  );
}
