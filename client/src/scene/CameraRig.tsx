import React, { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { FLOOR_HEIGHT, type RoomFocusPose } from './officeLayout';

interface CameraRigProps {
  floorSize: number;
  visibleFloorCount: number;
  focusedFloorIndex: number | null;
  floorFocusNonce: number;
  focusTarget: [number, number, number] | null;
  focusNonce: number;
  roomFocusPose?: RoomFocusPose | null;
  roomFocusNonce?: number;
  resetNonce: number;
}

export const CameraRig: React.FC<CameraRigProps> = ({
  floorSize,
  visibleFloorCount,
  focusedFloorIndex,
  floorFocusNonce,
  focusTarget,
  focusNonce,
  roomFocusPose = null,
  roomFocusNonce = 0,
  resetNonce,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const desiredTarget = useRef<THREE.Vector3 | null>(null);
  const desiredPos = useRef<THREE.Vector3 | null>(null);

  const floorSizeRef = useRef(floorSize);
  floorSizeRef.current = floorSize;

  const visibleFloorCountRef = useRef(visibleFloorCount);
  visibleFloorCountRef.current = visibleFloorCount;

  const focusedFloorRef = useRef(focusedFloorIndex);
  focusedFloorRef.current = focusedFloorIndex;

  const focusTargetRef = useRef(focusTarget);
  focusTargetRef.current = focusTarget;

  const roomFocusPoseRef = useRef(roomFocusPose);
  roomFocusPoseRef.current = roomFocusPose;

  const computeOverviewPose = () => {
    const floors = Math.max(1, visibleFloorCountRef.current);
    const totalH = (floors - 1) * FLOOR_HEIGHT + 3.5;
    const midY = ((floors - 1) * FLOOR_HEIGHT) / 2 + 0.6;
    const dist = Math.max(22, floorSizeRef.current * 0.86, totalH * 1.4);
    return {
      target: new THREE.Vector3(0, midY, 0),
      pos: new THREE.Vector3(dist, midY + dist * 0.82, dist),
    };
  };

  const computeFloorPose = (floorIdx: number) => {
    const floorY = (floorIdx - 1) * FLOOR_HEIGHT;
    const dist = Math.max(20.5, floorSizeRef.current * 0.8);
    return {
      target: new THREE.Vector3(0, floorY + 0.8, 0),
      pos: new THREE.Vector3(dist, floorY + dist * 0.86, dist),
    };
  };

  // Fly to specific clicked agent desk
  useEffect(() => {
    if (focusNonce === 0 || !focusTargetRef.current) return;
    const [x, y, z] = focusTargetRef.current;
    desiredTarget.current = new THREE.Vector3(x, y + 0.8, z);
    desiredPos.current = new THREE.Vector3(x + 7.5, y + 7.2, z + 7.5);
  }, [focusNonce]);

  // Glide front-on into a clicked Glass Suite room
  useEffect(() => {
    if (roomFocusNonce === 0 || !roomFocusPoseRef.current) return;
    const pose = roomFocusPoseRef.current;
    desiredTarget.current = new THREE.Vector3(...pose.target);
    desiredPos.current = new THREE.Vector3(...pose.pos);
  }, [roomFocusNonce]);

  // Glide to focused floor or building overview
  useEffect(() => {
    if (floorFocusNonce === 0) return;
    const idx = focusedFloorRef.current;
    const pose = idx === null ? computeOverviewPose() : computeFloorPose(idx);
    desiredTarget.current = pose.target;
    desiredPos.current = pose.pos;
  }, [floorFocusNonce]);

  // Reset camera button
  useEffect(() => {
    if (resetNonce === 0) return;
    const idx = focusedFloorRef.current;
    const pose = idx === null ? computeOverviewPose() : computeFloorPose(idx);
    desiredTarget.current = pose.target;
    desiredPos.current = pose.pos;
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

  const maxBuildingSpan = Math.max(floorSize, visibleFloorCount * FLOOR_HEIGHT);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={5}
      maxDistance={Math.max(42, maxBuildingSpan * 2.4)}
      minPolarAngle={0.32}
      maxPolarAngle={Math.PI / 2.22}
      onStart={() => {
        desiredTarget.current = null;
        desiredPos.current = null;
      }}
    />
  );
};
