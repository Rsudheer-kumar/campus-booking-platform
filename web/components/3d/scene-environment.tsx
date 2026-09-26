"use client";

export function SceneEnvironment() {
  return (
    <>
      {/* Ambient base - raised slightly for readability */}
      <ambientLight intensity={0.65} color="#E2E8F0" />

      {/* Main Key Light representing structured moonlight */}
      <directionalLight
        position={[20, 30, 15]}
        intensity={1.5}
        color="#F8FAFC"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={70}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0005} // adjusted for cleaner shadows
      />

      {/* Stronger cool fill light from opposite side to illuminate dark facets */}
      <directionalLight
        position={[-20, 15, -20]}
        intensity={0.8}
        color="#7BA7FF"
      />

      {/* Edge/Rim light from the back to separate buildings from background */}
      <directionalLight
        position={[0, 10, -35]}
        intensity={0.5}
        color="#4F8CFF"
      />

      {/* Subtle bottom bounce light to lift pitch black shadows underneath canopies */}
      <directionalLight position={[0, -5, 0]} intensity={0.3} color="#324B77" />

      {/* Atmospheric Fog aligned with our #050816 background */}
      <fog attach="fog" args={["#050816", 25, 75]} />
    </>
  );
}
