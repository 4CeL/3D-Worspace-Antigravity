import React, { useMemo } from 'react';

interface OfficeRoomProps {
  floorWidth: number;
  floorDepth: number;
  coffeeCorner: [number, number, number];
  onDeselect: () => void;
}

function PottedPlant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.2, 0.56, 12]} />
        <meshStandardMaterial color="#c97450" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.56, 0]} receiveShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.05, 12]} />
        <meshStandardMaterial color="#5c4033" roughness={1} />
      </mesh>
      <mesh position={[-0.12, 0.88, 0.06]} castShadow>
        <dodecahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#4f9d69" roughness={0.75} />
      </mesh>
      <mesh position={[0.14, 0.96, -0.06]} castShadow>
        <dodecahedronGeometry args={[0.27, 0]} />
        <meshStandardMaterial color="#63b57d" roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.18, 0]} castShadow>
        <dodecahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color="#3e8255" roughness={0.75} />
      </mesh>
    </group>
  );
}

function CoffeeCounter({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Lounge mat */}
      <mesh position={[-0.3, 0.015, 0.6]} receiveShadow>
        <boxGeometry args={[3.0, 0.03, 2.2]} />
        <meshStandardMaterial color="#efe3d2" roughness={0.95} />
      </mesh>
      {/* Wood counter */}
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.96, 0.85]} />
        <meshStandardMaterial color="#8f6342" roughness={0.7} />
      </mesh>
      {/* Cream countertop */}
      <mesh position={[0, 0.99, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.08, 0.92]} />
        <meshStandardMaterial color="#fff9f0" roughness={0.5} />
      </mesh>
      {/* Espresso machine */}
      <mesh position={[-0.45, 1.28, -0.08]} castShadow>
        <boxGeometry args={[0.52, 0.5, 0.42]} />
        <meshStandardMaterial color="#374151" metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh position={[-0.45, 1.16, 0.14]}>
        <boxGeometry args={[0.36, 0.06, 0.12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.25} />
      </mesh>
      {/* Ceramic mugs */}
      <mesh position={[0.35, 1.12, 0.1]} castShadow>
        <cylinderGeometry args={[0.08, 0.07, 0.16, 12]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.4} />
      </mesh>
      <mesh position={[0.58, 1.12, -0.05]} castShadow>
        <cylinderGeometry args={[0.08, 0.07, 0.16, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
    </group>
  );
}

export const OfficeRoom: React.FC<OfficeRoomProps> = ({
  floorWidth,
  floorDepth,
  coffeeCorner,
  onDeselect,
}) => {
  const wallHeight = 3.8;
  const wallThickness = 0.28;

  const plankLines = useMemo(() => {
    const count = Math.floor(floorDepth / 1.4);
    const lines: number[] = [];
    for (let i = 1; i < count; i++) {
      lines.push(-floorDepth / 2 + i * 1.4);
    }
    return lines;
  }, [floorDepth]);

  const windowCount = Math.max(2, Math.floor(floorWidth / 5.5));
  const windowPositions = useMemo(() => {
    const arr: number[] = [];
    const span = floorWidth - 5;
    for (let i = 0; i < windowCount; i++) {
      const t = windowCount === 1 ? 0.5 : i / (windowCount - 1);
      arr.push(-span / 2 + t * span - 1.2);
    }
    return arr;
  }, [floorWidth, windowCount]);

  return (
    <group>
      {/* Main warm oak floor */}
      <mesh
        position={[0, -0.18, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onDeselect();
        }}
      >
        <boxGeometry args={[floorWidth, 0.36, floorDepth]} />
        <meshStandardMaterial color="#e4c59e" roughness={0.82} />
      </mesh>

      {/* Floor trim lip */}
      <mesh position={[0, -0.39, 0]}>
        <boxGeometry args={[floorWidth + 0.32, 0.14, floorDepth + 0.32]} />
        <meshStandardMaterial color="#c49d72" roughness={0.9} />
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

      {/* Baseboards */}
      <mesh position={[0, 0.12, -floorDepth / 2 + 0.03]}>
        <boxGeometry args={[floorWidth, 0.24, 0.06]} />
        <meshStandardMaterial color="#d9c8b4" roughness={0.85} />
      </mesh>
      <mesh position={[-floorWidth / 2 + 0.03, 0.12, 0]}>
        <boxGeometry args={[0.06, 0.24, floorDepth]} />
        <meshStandardMaterial color="#d4c2ad" roughness={0.85} />
      </mesh>

      {/* Sunlit windows on the back wall */}
      {windowPositions.map((wx, idx) => (
        <group key={idx} position={[wx, 2.15, -floorDepth / 2 + 0.03]}>
          {/* Outer frame */}
          <mesh>
            <boxGeometry args={[2.3, 1.75, 0.09]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          {/* Sky glass */}
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[2.06, 1.52]} />
            <meshStandardMaterial
              color="#bce3fa"
              emissive="#bae6fd"
              emissiveIntensity={0.35}
              roughness={0.2}
            />
          </mesh>
          {/* Mullions */}
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

      {/* Wall art / office whiteboard on left wall */}
      <group position={[-floorWidth / 2 + 0.05, 2.05, -1.2]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[2.6, 1.45, 0.07]} />
          <meshStandardMaterial color="#e5dccf" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[2.42, 1.28]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        {/* Sticky notes */}
        <mesh position={[-0.65, 0.22, 0.05]}>
          <planeGeometry args={[0.32, 0.32]} />
          <meshStandardMaterial color="#fde68a" />
        </mesh>
        <mesh position={[-0.22, 0.24, 0.05]}>
          <planeGeometry args={[0.32, 0.32]} />
          <meshStandardMaterial color="#a7f3d0" />
        </mesh>
        <mesh position={[0.25, -0.1, 0.05]}>
          <planeGeometry args={[0.32, 0.32]} />
          <meshStandardMaterial color="#bfdbfe" />
        </mesh>
      </group>

      {/* Corner potted plants */}
      <PottedPlant position={[-floorWidth / 2 + 1.0, 0, -floorDepth / 2 + 1.0]} scale={1.15} />
      <PottedPlant position={[-floorWidth / 2 + 1.0, 0, floorDepth / 2 - 1.1]} scale={0.95} />
      <PottedPlant position={[floorWidth / 2 - 1.0, 0, floorDepth / 2 - 1.1]} scale={0.9} />

      {/* Coffee corner */}
      <CoffeeCounter position={coffeeCorner} />
    </group>
  );
};
