import React, { useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ActivePulse, AgentNode } from '@office/shared';
import type { DeskPlacement } from './officeLayout';

interface ConnectionArcsProps {
  agents: Record<string, AgentNode>;
  desks: Record<string, DeskPlacement>;
  activePulses: ActivePulse[];
}

function PulseOrb({ curve }: { curve: THREE.QuadraticBezierCurve3 }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = (clock.getElapsedTime() * 0.85) % 1;
    const pt = curve.getPoint(t);
    meshRef.current.position.copy(pt);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.11, 12, 12]} />
      <meshStandardMaterial color="#f59e0b" emissive="#fbbf24" emissiveIntensity={1.2} />
    </mesh>
  );
}

export const ConnectionArcs: React.FC<ConnectionArcsProps> = ({
  agents,
  desks,
  activePulses,
}) => {
  const links = useMemo(() => {
    const result: Array<{
      key: string;
      points: [number, number, number][];
      curve: THREE.QuadraticBezierCurve3;
      active: boolean;
      pulsing: boolean;
    }> = [];

    for (const agent of Object.values(agents)) {
      if (!agent.parentId) continue;
      const fromDesk = desks[agent.parentId];
      const toDesk = desks[agent.id];
      if (!fromDesk || !toDesk) continue;

      const start = new THREE.Vector3(fromDesk.position[0], 1.15, fromDesk.position[2]);
      const end = new THREE.Vector3(toDesk.position[0], 1.15, toDesk.position[2]);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.y += 1.05;

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const pts = curve.getPoints(24).map((p): [number, number, number] => [p.x, p.y, p.z]);

      const parent = agents[agent.parentId];
      const active = agent.status !== 'idle' || parent?.status !== 'idle';
      const pulsing = activePulses.some(
        (p) =>
          (p.fromAgentId === agent.parentId && p.toAgentId === agent.id) ||
          (p.fromAgentId === agent.id && p.toAgentId === agent.parentId),
      );

      result.push({
        key: `${agent.parentId}->${agent.id}`,
        points: pts,
        curve,
        active,
        pulsing,
      });
    }

    return result;
  }, [agents, desks, activePulses]);

  return (
    <group>
      {links.map((link) => (
        <React.Fragment key={link.key}>
          <Line
            points={link.points}
            color={link.pulsing ? '#f59e0b' : link.active ? '#60a5fa' : '#cbd5e1'}
            lineWidth={link.pulsing ? 2.5 : 1.5}
            dashed
            dashSize={0.25}
            gapSize={0.16}
            transparent
            opacity={link.active ? 0.85 : 0.45}
          />
          {link.pulsing && <PulseOrb curve={link.curve} />}
        </React.Fragment>
      ))}
    </group>
  );
};
