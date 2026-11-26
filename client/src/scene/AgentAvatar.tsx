import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { AgentStatus } from '@office/shared';

export type AvatarPosture = 'seated' | 'standing' | 'walking' | 'chatting';

interface AgentAvatarProps {
  status: AgentStatus;
  isLead: boolean;
  seed: string;
  posture?: AvatarPosture;
  holdMug?: boolean;
}

const SHIRT_PALETTE = ['#3b82f6', '#8b5cf6', '#0d9488', '#e11d48', '#d97706', '#2563eb'];
const SKIN_PALETTE = ['#f6c89f', '#eec199', '#e2ad84', '#f8d4b4'];
const HAIR_PALETTE = ['#2b2d42', '#4a3525', '#1f2937', '#6b4423'];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  status,
  isLead,
  seed,
  posture = 'seated',
  holdMug = false,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const dotsRef = useRef<THREE.Group>(null);

  const hash = hashSeed(seed);
  const shirtColor = isLead ? '#2563eb' : SHIRT_PALETTE[(hash % (SHIRT_PALETTE.length - 1)) + 1];
  const skinColor = SKIN_PALETTE[hash % SKIN_PALETTE.length];
  const hairColor = HAIR_PALETTE[(hash >> 3) % HAIR_PALETTE.length];

  const isSeated = posture === 'seated';
  const showMug = isSeated ? status === 'idle' : holdMug || posture === 'standing';

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + (hash % 7);

    if (rootRef.current) {
      if (posture === 'walking') {
        rootRef.current.position.y = Math.abs(Math.sin(t * 9)) * 0.05;
      } else if (posture === 'chatting' || posture === 'standing') {
        rootRef.current.position.y = Math.sin(t * 2.2) * 0.012;
      } else {
        rootRef.current.position.y = 0;
      }
    }

    if (leftLegRef.current && rightLegRef.current) {
      if (posture === 'walking') {
        const stride = Math.sin(t * 9) * 0.5;
        leftLegRef.current.rotation.x = stride;
        rightLegRef.current.rotation.x = -stride;
      } else {
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
      }
    }

    if (headRef.current) {
      if (posture === 'walking') {
        headRef.current.rotation.x = 0.02 + Math.sin(t * 9) * 0.03;
        headRef.current.rotation.y = Math.sin(t * 1.6) * 0.1;
        headRef.current.rotation.z = 0;
      } else if (posture === 'chatting') {
        headRef.current.rotation.x = 0.04 + Math.sin(t * 3.8) * 0.11;
        headRef.current.rotation.y = Math.sin(t * 1.9) * 0.14;
        headRef.current.rotation.z = Math.sin(t * 1.5) * 0.05;
      } else if (posture === 'standing') {
        headRef.current.rotation.x = -0.02 + Math.sin(t * 1.3) * 0.04;
        headRef.current.rotation.y = Math.sin(t * 1.1) * 0.24;
        headRef.current.rotation.z = 0;
      } else if (status === 'editing') {
        headRef.current.rotation.x = 0.15 + Math.sin(t * 7) * 0.04;
        headRef.current.rotation.y = Math.sin(t * 2.5) * 0.08;
        headRef.current.rotation.z = 0;
      } else if (status === 'reading') {
        headRef.current.rotation.x = 0.08;
        headRef.current.rotation.y = Math.sin(t * 2.1) * 0.22;
        headRef.current.rotation.z = 0;
      } else if (status === 'running') {
        headRef.current.rotation.x = 0.05 + Math.sin(t * 4) * 0.05;
        headRef.current.rotation.y = 0;
        headRef.current.rotation.z = 0;
      } else if (status === 'thinking') {
        headRef.current.rotation.x = -0.06 + Math.sin(t * 1.8) * 0.05;
        headRef.current.rotation.z = Math.sin(t * 1.4) * 0.1;
      } else if (status === 'error') {
        headRef.current.rotation.y = Math.sin(t * 12) * 0.18;
        headRef.current.rotation.z = 0;
      } else {
        headRef.current.rotation.x = -0.04 + Math.sin(t * 1.1) * 0.03;
        headRef.current.rotation.y = Math.sin(t * 0.7) * 0.08;
        headRef.current.rotation.z = 0;
      }
    }

    if (torsoRef.current) {
      if (posture === 'walking') {
        torsoRef.current.rotation.x = 0.06;
        torsoRef.current.rotation.y = Math.sin(t * 9) * 0.06;
      } else if (posture === 'chatting') {
        torsoRef.current.rotation.x = 0.02 + Math.sin(t * 2.4) * 0.03;
        torsoRef.current.rotation.y = Math.sin(t * 1.3) * 0.06;
      } else if (posture === 'standing') {
        torsoRef.current.rotation.x = 0;
        torsoRef.current.rotation.y = Math.sin(t * 0.8) * 0.04;
      } else if (status === 'idle') {
        torsoRef.current.rotation.x = -0.14 + Math.sin(t * 1.2) * 0.02;
        torsoRef.current.rotation.y = 0;
      } else if (status === 'editing' || status === 'reading') {
        torsoRef.current.rotation.x = 0.08;
        torsoRef.current.rotation.y = 0;
      } else {
        torsoRef.current.rotation.x = 0.02;
        torsoRef.current.rotation.y = 0;
      }
    }

    if (leftArmRef.current && rightArmRef.current) {
      if (posture === 'walking') {
        const swing = Math.sin(t * 9) * 0.45;
        leftArmRef.current.rotation.x = -swing;
        rightArmRef.current.rotation.x = holdMug ? -0.65 : swing;
      } else if (posture === 'chatting') {
        const waveCycle = Math.sin(t * 0.9);
        leftArmRef.current.rotation.x = -0.35 + Math.sin(t * 3.1) * 0.2;
        rightArmRef.current.rotation.x =
          waveCycle > 0.65
            ? -1.65 + Math.sin(t * 9) * 0.22
            : -0.5 + Math.cos(t * 2.8) * 0.22;
      } else if (posture === 'standing') {
        leftArmRef.current.rotation.x = -0.08 + Math.sin(t * 1.1) * 0.04;
        rightArmRef.current.rotation.x = showMug ? -0.68 + Math.sin(t * 1.4) * 0.06 : -0.08;
      } else if (status === 'editing') {
        leftArmRef.current.rotation.x = -0.75 + Math.sin(t * 16) * 0.14;
        rightArmRef.current.rotation.x = -0.75 + Math.cos(t * 16) * 0.14;
      } else if (status === 'running') {
        leftArmRef.current.rotation.x = -0.68 + Math.sin(t * 8) * 0.08;
        rightArmRef.current.rotation.x = -0.68 - Math.sin(t * 8) * 0.08;
      } else if (status === 'delegating') {
        leftArmRef.current.rotation.x = -0.5;
        rightArmRef.current.rotation.x = -1.6 + Math.sin(t * 6) * 0.25;
      } else if (status === 'idle') {
        leftArmRef.current.rotation.x = -0.25;
        rightArmRef.current.rotation.x = -0.65 + Math.sin(t * 1.5) * 0.08;
      } else {
        leftArmRef.current.rotation.x = -0.55;
        rightArmRef.current.rotation.x = -0.55;
      }
    }

    if (dotsRef.current) {
      dotsRef.current.position.y = 1.68 + Math.sin(t * 3) * 0.06;
    }
  });

  return (
    <group ref={rootRef} position={isSeated ? [0, 0, 0.56] : [0, 0, 0]}>
      {isSeated ? (
        <>
          {/* Seated legs */}
          <mesh position={[-0.12, 0.34, -0.14]} castShadow>
            <boxGeometry args={[0.16, 0.16, 0.42]} />
            <meshStandardMaterial color="#334155" roughness={0.85} />
          </mesh>
          <mesh position={[0.12, 0.34, -0.14]} castShadow>
            <boxGeometry args={[0.16, 0.16, 0.42]} />
            <meshStandardMaterial color="#334155" roughness={0.85} />
          </mesh>
        </>
      ) : (
        <>
          {/* Standing / walking hip-pivoted legs */}
          <group ref={leftLegRef} position={[-0.11, 0.44, 0]}>
            <mesh position={[0, -0.22, 0]} castShadow>
              <boxGeometry args={[0.15, 0.44, 0.16]} />
              <meshStandardMaterial color="#334155" roughness={0.85} />
            </mesh>
            <mesh position={[0, -0.41, -0.025]} castShadow>
              <boxGeometry args={[0.16, 0.07, 0.21]} />
              <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
          </group>
          <group ref={rightLegRef} position={[0.11, 0.44, 0]}>
            <mesh position={[0, -0.22, 0]} castShadow>
              <boxGeometry args={[0.15, 0.44, 0.16]} />
              <meshStandardMaterial color="#334155" roughness={0.85} />
            </mesh>
            <mesh position={[0, -0.41, -0.025]} castShadow>
              <boxGeometry args={[0.16, 0.07, 0.21]} />
              <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
          </group>
        </>
      )}

      {/* Upper body */}
      <group ref={torsoRef} position={[0, 0.44, 0]}>
        {/* Torso */}
        <mesh position={[0, 0.34, 0]} castShadow>
          <boxGeometry args={[0.44, 0.54, 0.26]} />
          <meshStandardMaterial color={shirtColor} roughness={0.7} />
        </mesh>

        {/* Coordinator gold badge */}
        {isLead && (
          <mesh position={[0.13, 0.44, -0.135]}>
            <boxGeometry args={[0.1, 0.06, 0.02]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.5} roughness={0.3} />
          </mesh>
        )}

        {/* Left Arm */}
        <mesh ref={leftArmRef} position={[-0.28, 0.46, -0.06]} castShadow>
          <boxGeometry args={[0.13, 0.38, 0.13]} />
          <meshStandardMaterial color={shirtColor} roughness={0.7} />
        </mesh>

        {/* Right Arm */}
        <mesh ref={rightArmRef} position={[0.28, 0.46, -0.06]} castShadow>
          <boxGeometry args={[0.13, 0.38, 0.13]} />
          <meshStandardMaterial color={shirtColor} roughness={0.7} />
        </mesh>

        {/* Coffee mug held when idle/standing */}
        {showMug && (
          <mesh position={[0.3, 0.38, -0.3]} castShadow>
            <cylinderGeometry args={[0.065, 0.055, 0.13, 10]} />
            <meshStandardMaterial color="#ffffff" roughness={0.35} />
          </mesh>
        )}

        {/* Head */}
        <group ref={headRef} position={[0, 0.78, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.36, 0.36, 0.34]} />
            <meshStandardMaterial color={skinColor} roughness={0.75} />
          </mesh>
          {/* Hair cap */}
          <mesh position={[0, 0.13, 0.02]} castShadow>
            <boxGeometry args={[0.39, 0.14, 0.37]} />
            <meshStandardMaterial color={hairColor} roughness={0.8} />
          </mesh>
          {/* Eyes facing forward (-Z in local avatar space) */}
          <mesh position={[-0.08, 0.02, -0.175]}>
            <boxGeometry args={[0.045, 0.045, 0.02]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[0.08, 0.02, -0.175]}>
            <boxGeometry args={[0.045, 0.045, 0.02]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>

        {/* Thinking dots */}
        {isSeated && status === 'thinking' && (
          <group ref={dotsRef} position={[0, 1.68, 0]}>
            {[-0.14, 0, 0.14].map((x, idx) => (
              <mesh key={idx} position={[x, 0, 0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.6} />
              </mesh>
            ))}
          </group>
        )}
      </group>
    </group>
  );
};
