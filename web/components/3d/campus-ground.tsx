"use client";

import * as THREE from "three";
import { Grid, Edges } from "@react-three/drei";

// Reusable static geometries and materials to avoid re-allocating on every remount/render
const plinthGeometry = new THREE.PlaneGeometry(40, 40);
const plinthMaterial = new THREE.MeshStandardMaterial({ color: "#0B1120", roughness: 0.9 });

const baseGeometry = new THREE.PlaneGeometry(150, 150);
const baseMaterial = new THREE.MeshStandardMaterial({ color: "#050816", roughness: 1 });

export function CampusGround() {
  return (
    <group>
      {/* Decorative procedural Grid to match our "digital twin" aesthetic */}
      <Grid
        position={[0, -0.01, 0]}
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#121B2D"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#1E2A44"
        fadeDistance={55}
        fadeStrength={1.5}
      />

      {/* Inner Campus Foundation / Plinth */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.015, 0]}
        geometry={plinthGeometry}
        material={plinthMaterial}
        receiveShadow
      >
        <Edges linewidth={1.5} threshold={15} color="#1E2A44" />
      </mesh>

      {/* Main infinite solid receiver for shadows/raycasting, dark base */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        geometry={baseGeometry}
        material={baseMaterial}
        receiveShadow
      />
    </group>
  );
}
