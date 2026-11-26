import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { FloorTheme } from '@office/shared';
import { FLOOR_HEIGHT } from './officeLayout';
import { FloorDecor } from './FloorDecor';
import { RoomPartitions } from './RoomPartitions';

interface OfficeRoomProps {
  floorWidth: number;
  floorDepth: number;
  y?: number;
  floorIndex?: number;
  floorName?: string;
  floorTheme?: FloorTheme;
  hasFloorAbove?: boolean;
  isFocused?: boolean;
  coffeeCorner?: [number, number, number];
  onDeselect: () => void;
  onFocusFloor?: (floorIndex: number) => void;
}

function ElevatorCore({
  position,
  wallHeight,
}: {
  position: [number, number, number];
  wallHeight: number;
}) {
  return (
    <group position={position}>
      {/* Elevator shaft enclosure */}
      <mesh position={[0, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.65, wallHeight, 1.55]} />
        <meshStandardMaterial color="#e6ddd0" roughness={0.85} />
      </mesh>
      {/* Brushed steel door frame */}
      <mesh position={[0, 1.22, 0.78]}>
        <boxGeometry args={[1.18, 2.35, 0.06]} />
        <meshStandardMaterial color="#64748b" metalness={0.35} roughness={0.45} />
      </mesh>
      {/* Twin sliding elevator doors */}
      <mesh position={[-0.26, 1.18, 0.81]}>
        <boxGeometry args={[0.48, 2.2, 0.03]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0.26, 1.18, 0.81]}>
        <boxGeometry args={[0.48, 2.2, 0.03]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Warm glowing elevator call lamp */}
      <mesh position={[0, 2.55, 0.8]}>
        <boxGeometry args={[0.38, 0.14, 0.04]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={0.65}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export const OfficeRoom: React.FC<OfficeRoomProps> = ({
  floorWidth,
  floorDepth,
  y = 0,
  floorIndex = 1,
  floorName = 'Lantai 1',
  floorTheme,
  hasFloorAbove = false,
  isFocused = false,
  onDeselect,
  onFocusFloor,
}) => {
  const wallHeight = hasFloorAbove ? FLOOR_HEIGHT - 0.36 : 3.9;
  const wallThickness = 0.28;

  const plankLines = useMemo(() => {
    const count = Math.floor(floorDepth / 1.4);
    const lines: number[] = [];
    for (let i = 1; i < count; i++) {
      lines.push(-floorDepth / 2 + i * 1.4);
    }
    return lines;
  }, [floorDepth]);

  const windowCount = Math.max(2, Math.floor((floorWidth - 3) / 5.2));
  const windowPositions = useMemo(() => {
    const arr: number[] = [];
    const span = Math.max(4, floorWidth - 7.5);
    for (let i = 0; i < windowCount; i++) {
      const t = windowCount === 1 ? 0.5 : i / (windowCount - 1);
      arr.push(-span / 2 + t * span + 0.8);
    }
    return arr;
  }, [floorWidth, windowCount]);

  return (
    <group position={[0, y, 0]}>
      {/* Main warm oak floor slab */}
      <mesh
        position={[0, -0.18, 0]}
        receiveShadow
        castShadow={floorIndex > 1}
        onClick={(e) => {
          e.stopPropagation();
          onDeselect();
        }}
      >
        <boxGeometry args={[floorWidth, 0.36, floorDepth]} />
        <meshStandardMaterial color="#e4c59e" roughness={0.82} />
      </mesh>

      {/* Exterior architectural floor band */}
      <mesh position={[0, -0.34, 0]}>
        <boxGeometry args={[floorWidth + 0.34, 0.14, floorDepth + 0.34]} />
        <meshStandardMaterial
          color={isFocused ? '#10b981' : '#c49d72'}
          roughness={0.85}
        />
      </mesh>

      {/* Subtle wood plank lines */}
      {plankLines.map((z) => (
        <mesh key={z} position={[0, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[floorWidth - 0.4, 0.025]} />
          <meshStandardMaterial color="#cfa97e" roughness={0.9} />
        </mesh>
      ))}

      {/* Back wall (North, -Z) */}
      <mesh
        position={[0, wallHeight / 2, -floorDepth / 2 - wallThickness / 2]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[floorWidth + wallThickness * 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#fbf6ee" roughness={0.92} />
      </mesh>

      {/* Left wall (West, -X) */}
      <mesh
        position={[-floorWidth / 2 - wallThickness / 2, wallHeight / 2, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[wallThickness, wallHeight, floorDepth]} />
        <meshStandardMaterial color="#f2e9db" roughness={0.92} />
      </mesh>

      {/* Structural cutaway corner pillars when supporting an upper floor */}
      {hasFloorAbove && (
        <>
          <mesh
            position={[-floorWidth / 2 + 0.16, wallHeight / 2, floorDepth / 2 - 0.16]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.32, wallHeight, 0.32]} />
            <meshStandardMaterial color="#ede3d4" roughness={0.8} />
          </mesh>
          <mesh
            position={[floorWidth / 2 - 0.16, wallHeight / 2, -floorDepth / 2 + 0.16]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.32, wallHeight, 0.32]} />
            <meshStandardMaterial color="#ede3d4" roughness={0.8} />
          </mesh>
        </>
      )}

      {/* Baseboards */}
      <mesh position={[0, 0.12, -floorDepth / 2 + 0.03]}>
        <boxGeometry args={[floorWidth, 0.24, 0.06]} />
        <meshStandardMaterial color="#d9c8b4" roughness={0.85} />
      </mesh>
      <mesh position={[-floorWidth / 2 + 0.03, 0.12, 0]}>
        <boxGeometry args={[0.06, 0.24, floorDepth]} />
        <meshStandardMaterial color="#d4c2ad" roughness={0.85} />
      </mesh>

      {/* Elevator core in back-left corner */}
      <ElevatorCore
        position={[-floorWidth / 2 + 1.05, 0, -floorDepth / 2 + 0.95]}
        wallHeight={wallHeight}
      />

      {/* Sunlit windows on the back wall */}
      {windowPositions.map((wx, idx) => (
        <group key={idx} position={[wx, 2.15, -floorDepth / 2 + 0.03]}>
          <mesh>
            <boxGeometry args={[2.3, 1.75, 0.09]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[2.06, 1.52]} />
            <meshStandardMaterial
              color="#bce3fa"
              emissive="#bae6fd"
              emissiveIntensity={0.35}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.07, 1.55, 0.04]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[2.1, 0.07, 0.04]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}

      {/* Theme-aware cozy isometric perimeter decor & architectural room partitions */}
      <FloorDecor
        floorWidth={floorWidth}
        floorDepth={floorDepth}
        theme={floorTheme ?? 'engineering'}
        floorIndex={floorIndex}
      />
      <RoomPartitions
        floorWidth={floorWidth}
        floorDepth={floorDepth}
        theme={floorTheme ?? 'engineering'}
      />

      {/* Exterior clickable floor badge on front-right slab edge */}
      <Html
        position={[floorWidth / 2 + 0.55, 0.15, floorDepth / 2 - 0.5]}
        center
        distanceFactor={18}
        zIndexRange={[8, 0]}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocusFloor?.(floorIndex);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur-sm transition hover:scale-105 ${
            isFocused
              ? 'border-emerald-500 bg-emerald-600 text-white'
              : 'border-stone-300/90 bg-white/90 text-stone-700 hover:border-emerald-400'
          }`}
        >
          <span>L{floorIndex}</span>
          <span className="font-medium opacity-85">{floorName}</span>
        </button>
      </Html>
    </group>
  );
};
