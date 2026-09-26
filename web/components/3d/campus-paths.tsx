"use client";

import * as THREE from "three";
import { Edges } from "@react-three/drei";

const pathColor = "#0D1424"; // Slightly brighter than ground for definition
const edgeColor = "#2A3C5C"; // More contrast for path outlines

// Reusable static geometries and materials
const mainPathGeometry = new THREE.PlaneGeometry(3.0, 32);
const crossPathAiGeometry = new THREE.PlaneGeometry(20, 3.0);
const crossPathSeminarGeometry = new THREE.PlaneGeometry(16, 3.0);
const plazaGeometry = new THREE.PlaneGeometry(8, 8);
const innerPlazaGeometry = new THREE.PlaneGeometry(4, 4);

const pathMaterial = new THREE.MeshStandardMaterial({ color: pathColor, roughness: 0.9 });
const innerPlazaMaterial = new THREE.MeshBasicMaterial({ color: "#1A2844" });

export function CampusPaths() {
  return (
    <group position={[0, -0.012, 0]}>
      {/* Main vertical spine */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        geometry={mainPathGeometry}
        material={pathMaterial}
        receiveShadow
      >
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Cross path leading to AI / CS lab */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -5.5]}
        geometry={crossPathAiGeometry}
        material={pathMaterial}
        receiveShadow
      >
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Lower cross path connecting Seminar (Left) and Innovation (Right) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 5.5]}
        geometry={crossPathSeminarGeometry}
        material={pathMaterial}
        receiveShadow
      >
        <Edges linewidth={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* Campus Central Plaza */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        geometry={plazaGeometry}
        material={pathMaterial}
        receiveShadow
      >
        <Edges linewidth={1.5} threshold={15} color={edgeColor} />

        {/* Decorative inner plaza element */}
        <mesh
          position={[0, 0.005, 0]}
          geometry={innerPlazaGeometry}
          material={innerPlazaMaterial}
        >
          <Edges linewidth={1} threshold={15} color="#354D7A" />
        </mesh>
      </mesh>
    </group>
  );
}
