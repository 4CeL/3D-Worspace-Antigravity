import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { OfficeSnapshot } from '@office/shared';
import { computeOfficeLayout } from './officeLayout';
import { OfficeRoom } from './OfficeRoom';
import { TeamClusterGroup } from './TeamClusterGroup';
import { ConnectionArcs } from './ConnectionArcs';
import { CameraRig } from './CameraRig';

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot;
  selectedAgentId: string | null;
  showLabels: boolean;
  focusAgentId: string | null;
  focusNonce: number;
  resetNonce: number;
  onSelectAgent: (agentId: string | null) => void;
}

export const OfficeCanvas: React.FC<OfficeCanvasProps> = ({
  snapshot,
  selectedAgentId,
  showLabels,
  focusAgentId,
  focusNonce,
  resetNonce,
  onSelectAgent,
}) => {
  const layout = useMemo(
    () => computeOfficeLayout(snapshot.clusters, snapshot.agents),
    [snapshot.clusters, snapshot.agents],
  );

  const floorSize = Math.max(layout.floorWidth, layout.floorDepth);
  const focusTarget = useMemo<[number, number, number] | null>(() => {
    if (!focusAgentId) return null;
    const desk = layout.desks[focusAgentId];
    return desk ? desk.position : null;
  }, [focusAgentId, layout.desks]);

  return (
    <div className="h-full w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [14, 13, 14], fov: 36, near: 0.1, far: 200 }}
      >
        <color attach="background" args={['#f4ede4']} />

        {/* Cozy warm daylight lighting */}
        <hemisphereLight args={['#fffdf7', '#d8c3a5', 0.95]} />
        <directionalLight
          position={[14, 22, 12]}
          intensity={1.15}
          color="#fff6e5"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={65}
          shadow-camera-left={-22}
          shadow-camera-right={22}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-10, 10, -8]} intensity={0.35} color="#dbeafe" />

        <OfficeRoom
          floorWidth={layout.floorWidth}
          floorDepth={layout.floorDepth}
          coffeeCorner={layout.coffeeCorner}
          onDeselect={() => onSelectAgent(null)}
        />

        {layout.clusters.map((cluster) => (
          <TeamClusterGroup
            key={cluster.rootId}
            cluster={cluster}
            agents={snapshot.agents}
            desks={layout.desks}
            selectedAgentId={selectedAgentId}
            showLabels={showLabels}
            onSelectAgent={(id) => onSelectAgent(id)}
          />
        ))}

        <ConnectionArcs
          agents={snapshot.agents}
          desks={layout.desks}
          activePulses={snapshot.activePulses}
        />

        <CameraRig
          floorSize={floorSize}
          focusTarget={focusTarget}
          focusNonce={focusNonce}
          resetNonce={resetNonce}
        />
      </Canvas>
    </div>
  );
};
