"use client";

import { Environment } from "@react-three/drei";

export function SceneEnvironment() {
  return (
    <>
      {/* Ambient base */}
      <ambientLight intensity={0.4} color="#F8FAFC" />

      {/* Main Key Light representing moon/city-ambient overhead */}
      <directionalLight
        position={[15, 25, 10]}
        intensity={1.0}
        color="#F8FAFC"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={60}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.0005} // adjusted for cleaner shadows
      />

      {/* Soft blue fill light from opposite side */}
      <directionalLight position={[-15, 10, -15]} intensity={0.4} color="#4F8CFF" />

      {/* Subtle bottom bounce light to lift pitch black shadows underneath canopies */}
      <directionalLight position={[0, -5, 0]} intensity={0.1} color="#324B77" />

      {/* Atmospheric Fog aligned with our #050816 background */}
      <fog attach="fog" args={["#050816", 20, 65]} />

      {/*
        Using preset="city" gives soft realistic reflections on glass/metal surfaces,
        lowered intensity to keep the dark architectural aesthetic
      */}
      <Environment preset="city" environmentIntensity={0.15} />
    </>
  );
}
