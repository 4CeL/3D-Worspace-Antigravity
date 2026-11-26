import React, { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface CameraRigProps {
  floorSize: number;
  focusTarget: [number, number, number] | null;
  focusNonce: number;
  resetNonce: number;
}

export const CameraRig: React.FC<CameraRigProps> = ({
  floorSize,
  focusTarget,
  focusNonce,
  resetNonce,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const desiredTarget = useRef<THREE.Vector3 | null>(null);
  const desiredPos = useRef<THREE.Vector3 | null>(null);

  const defaultDist = Math.max(13, floorSize * 0.85);
  const defaultDistRef = useRef(defaultDist);
  defaultDistRef.current = defaultDist;

  const focusTargetRef = useRef(focusTarget);
  focusTargetRef.current = focusTarget;

  useEffect(() => {
    if (focusNonce === 0 || !focusTargetRef.current) return;
    const [x, y, z] = focusTargetRef.current;
    desiredTarget.current = new THREE.Vector3(x, y + 0.8, z);
    desiredPos.current = new THREE.Vector3(x + 7.5, y + 7.2, z + 7.5);
  }, [focusNonce]);

  useEffect(() => {
    if (resetNonce === 0) return;
    const dist = defaultDistRef.current;
    desiredTarget.current = new THREE.Vector3(0, 0.4, 0);
    desiredPos.current = new THREE.Vector3(dist, dist * 0.9, dist);
  }, [resetNonce]);

  useFrame((_, delta) => {
    if (!controlsRef.current || !desiredTarget.current || !desiredPos.current) return;
    const alpha = Math.min(1, delta * 5.5);
    camera.position.lerp(desiredPos.current, alpha);
    controlsRef.current.target.lerp(desiredTarget.current, alpha);
    controlsRef.current.update();

    if (
      camera.position.distanceTo(desiredPos.current) < 0.08 &&
      controlsRef.current.target.distanceTo(desiredTarget.current) < 0.08
    ) {
      desiredTarget.current = null;
      desiredPos.current = null;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={5}
      maxDistance={Math.max(38, floorSize * 2.2)}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2.25}
      onStart={() => {
        // Yield control immediately when user manually drags
        desiredTarget.current = null;
        desiredPos.current = null;
      }}
    />
  );
};
