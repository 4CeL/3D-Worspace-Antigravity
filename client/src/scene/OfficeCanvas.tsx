import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { OfficeSnapshot } from '@office/shared';
import { FLOOR_HEIGHT, computeOfficeLayout } from './officeLayout';
import { OfficeRoom } from './OfficeRoom';
import { TeamClusterGroup } from './TeamClusterGroup';
import { ConnectionArcs } from './ConnectionArcs';
import { CameraRig } from './CameraRig';

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot;
  selectedAgentId: string | null;
  showLabels: boolean;
  focusedFloorIndex: number | null;
  floorFocusNonce: number;
  focusAgentId: string | null;
  focusNonce: number;
  resetNonce: number;
  onSelectAgent: (agentId: string | null) => void;
  onFocusFloor: (floorIndex: number) => void;
}

export const OfficeCanvas: React.FC<OfficeCanvasProps> = ({
  snapshot,
  selectedAgentId,
  showLabels,
  focusedFloorIndex,
  floorFocusNonce,
  focusAgentId,
  focusNonce,
  resetNonce,
  onSelectAgent,
  onFocusFloor,
}) => {
  const layout = useMemo(
    () => computeOfficeLayout(snapshot.clusters, snapshot.agents, snapshot.floors),
    [snapshot.clusters, snapshot.agents, snapshot.floors],
  );

  // Cutaway visibility: hide floors strictly above focusedFloorIndex so they never block the view
  const visibleFloors = useMemo(
    () =>
      focusedFloorIndex === null
        ? layout.floors
        : layout.floors.filter((f) => f.index <= focusedFloorIndex),
    [layout.floors, focusedFloorIndex],
  );

  const visibleFloorIds = useMemo(
    () => new Set(visibleFloors.map((f) => f.floorId)),
    [visibleFloors],
  );

  const visibleDesks = useMemo(() => {
    const out: typeof layout.desks = {};
    for (const [id, desk] of Object.entries(layout.desks)) {
      if (visibleFloorIds.has(desk.floorId)) {
        out[id] = desk;
      }
    }
    return out;
  }, [layout.desks, visibleFloorIds]);

  const floorSize = Math.max(layout.floorWidth, layout.floorDepth);
  const totalHeight = Math.max(1, visibleFloors.length) * FLOOR_HEIGHT;
  const shadowSpan = Math.max(24, floorSize * 0.9, totalHeight * 0.9);

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
        camera={{ position: [15, 14, 15], fov: 36, near: 0.1, far: 260 }}
      >
        <color attach="background" args={['#f4ede4']} />

        {/* Cozy warm daylight lighting */}
        <hemisphereLight args={['#fffdf7', '#d8c3a5', 0.95]} />
        <directionalLight
          position={[16, 22 + totalHeight * 0.6, 14]}
          intensity={1.15}
          color="#fff6e5"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={95}
          shadow-camera-left={-shadowSpan}
          shadow-camera-right={shadowSpan}
          shadow-camera-top={shadowSpan}
          shadow-camera-bottom={-shadowSpan}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-12, 12 + totalHeight * 0.4, -10]} intensity={0.35} color="#dbeafe" />

        {visibleFloors.map((floor, idx) => {
          const isTopVisible = idx === visibleFloors.length - 1;
          const isFocused = focusedFloorIndex === floor.index;
          return (
            <React.Fragment key={floor.floorId}>
              <OfficeRoom
                floorWidth={layout.floorWidth}
                floorDepth={layout.floorDepth}
                y={floor.y}
                floorIndex={floor.index}
                floorName={floor.name}
                hasFloorAbove={!isTopVisible}
                isFocused={isFocused}
                coffeeCorner={floor.coffeeCorner}
                onDeselect={() => onSelectAgent(null)}
                onFocusFloor={onFocusFloor}
              />

              {floor.clusters.map((cluster) => (
                <TeamClusterGroup
                  key={cluster.rootId}
                  cluster={cluster}
                  agents={snapshot.agents}
                  desks={visibleDesks}
                  selectedAgentId={selectedAgentId}
                  showLabels={showLabels}
                  onSelectAgent={(id) => onSelectAgent(id)}
                />
              ))}
            </React.Fragment>
          );
        })}

        <ConnectionArcs
          agents={snapshot.agents}
          desks={visibleDesks}
          activePulses={snapshot.activePulses}
        />

        <CameraRig
          floorSize={floorSize}
          visibleFloorCount={visibleFloors.length}
          focusedFloorIndex={focusedFloorIndex}
          floorFocusNonce={floorFocusNonce}
          focusTarget={focusTarget}
          focusNonce={focusNonce}
          resetNonce={resetNonce}
        />
      </Canvas>
    </div>
  );
};
