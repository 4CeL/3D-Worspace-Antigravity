import React, { useMemo } from 'react';
import type { FloorTheme } from '@office/shared';

export interface RoomPartitionsProps {
  floorWidth: number;
  floorDepth: number;
  theme: FloorTheme;
}

/**
 * Shared no-op raycaster so pointer hovers & clicks pass cleanly through
 * architectural glass panels, wood slats, runners, and work-pod dividers.
 */
const disableRaycast = () => null;

const OAK_FRAME = '#b88a5c';
const OAK_DARK = '#986d44';
const GLASS_TINT = '#dbeafe';
const FROSTED_STRIP = '#f8fafc';

interface GlassPanelProps {
  width: number;
  height: number;
  position: [number, number, number];
  rotationY?: number;
  opacity?: number;
  frostedBand?: boolean;
}

const ArchitecturalGlassPanel: React.FC<GlassPanelProps> = ({
  width,
  height,
  position,
  rotationY = 0,
  opacity = 0.22,
  frostedBand = true,
}) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Bottom oak plinth */}
      <mesh position={[0, 0.045, 0]} raycast={disableRaycast}>
        <boxGeometry args={[width, 0.09, 0.075]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.72} />
      </mesh>
      {/* Top oak header rail */}
      <mesh position={[0, height - 0.045, 0]} raycast={disableRaycast}>
        <boxGeometry args={[width, 0.09, 0.075]} />
        <meshStandardMaterial color={OAK_FRAME} roughness={0.68} />
      </mesh>
      {/* Clear architectural glass pane */}
      <mesh position={[0, height / 2, 0]} raycast={disableRaycast}>
        <boxGeometry args={[Math.max(0.1, width - 0.04), height - 0.16, 0.025]} />
        <meshStandardMaterial
          color={GLASS_TINT}
          transparent
          opacity={opacity}
          roughness={0.1}
          metalness={0.15}
          depthWrite={false}
        />
      </mesh>
      {/* Subtle frosted privacy strip across mid-height */}
      {frostedBand && height > 1.5 && (
        <mesh position={[0, 1.15, 0]} raycast={disableRaycast}>
          <boxGeometry args={[Math.max(0.1, width - 0.06), 0.22, 0.03]} />
          <meshStandardMaterial
            color={FROSTED_STRIP}
            transparent
            opacity={0.3}
            roughness={0.5}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

interface AcousticDividerProps {
  length: number;
  position: [number, number, number];
  rotationY?: number;
  feltColor: string;
}

const LowAcousticDivider: React.FC<AcousticDividerProps> = ({
  length,
  position,
  rotationY = 0,
  feltColor,
}) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Slim floor support feet */}
      {[-length / 2 + 0.25, length / 2 - 0.25].map((lx) => (
        <mesh key={lx} position={[lx, 0.025, 0]} raycast={disableRaycast}>
          <boxGeometry args={[0.08, 0.05, 0.26]} />
          <meshStandardMaterial color="#64748b" metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
      {/* Warm acoustic felt lower body */}
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[length, 0.62, 0.075]} />
        <meshStandardMaterial color={feltColor} roughness={0.92} />
      </mesh>
      {/* Oak horizontal cap rail */}
      <mesh position={[0, 0.69, 0]} raycast={disableRaycast}>
        <boxGeometry args={[length + 0.04, 0.05, 0.095]} />
        <meshStandardMaterial color={OAK_FRAME} roughness={0.7} />
      </mesh>
      {/* Left & right oak end posts */}
      {[-length / 2, length / 2].map((px) => (
        <mesh key={px} position={[px, 0.53, 0]} raycast={disableRaycast}>
          <boxGeometry args={[0.07, 1.04, 0.09]} />
          <meshStandardMaterial color={OAK_FRAME} roughness={0.7} />
        </mesh>
      ))}
      {/* Upper clear glass acoustic fin */}
      <mesh position={[0, 0.88, 0]} raycast={disableRaycast}>
        <boxGeometry args={[length - 0.08, 0.34, 0.022]} />
        <meshStandardMaterial
          color={GLASS_TINT}
          transparent
          opacity={0.22}
          roughness={0.12}
          metalness={0.15}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export const RoomPartitions: React.FC<RoomPartitionsProps> = ({
  floorWidth,
  floorDepth,
  theme,
}) => {
  const halfW = floorWidth / 2;
  const halfD = floorDepth / 2;

  const runnerColor =
    theme === 'creative'
      ? '#e2dce9'
      : theme === 'lobby'
        ? '#e2e6de'
        : theme === 'pantry'
          ? '#e8dfd1'
          : '#dfd8cd';
  const runnerBorder = '#cbbba5';
  const feltColor =
    theme === 'creative'
      ? '#ded7e6'
      : theme === 'lobby'
        ? '#d7dfd8'
        : '#e4ddd2';

  // Corridor runner geometry aligned with ElevatorCore doorway & Glass Room doorway
  const westStartZ = -halfD + 3.25;
  const westEndZ = halfD - 4.75;
  const westLen = Math.max(2.0, westEndZ - westStartZ);
  const westMidZ = (westStartZ + westEndZ) / 2;

  const northStartX = -halfW + 3.1;
  const northEndX = halfW - 2.6;
  const northLen = Math.max(4.0, northEndX - northStartX);
  const northMidX = (northStartX + northEndX) / 2;

  // Front-left glass room coordinates (encloses front-left lounge/meeting/bistro nook)
  const roomBackZ = halfD - 4.75;
  const roomRightX = -halfW + 4.85;
  const wallHeight = 2.45;

  // Back-right wood slat partition coordinates (frames back-right pantry/server/coffee alcove)
  const slatX = halfW - 4.84;
  const slatStartZ = -halfD + 0.35;
  const slatEndZ = -halfD + 3.04;
  const slatCount = 8;
  const slatPositions = useMemo(() => {
    const zs: number[] = [];
    for (let i = 0; i < slatCount; i++) {
      const t = i / (slatCount - 1);
      zs.push(slatStartZ + 0.1 + t * (slatEndZ - slatStartZ - 0.2));
    }
    return zs;
  }, [slatStartZ, slatEndZ]);

  return (
    <group>
      {/* ====================================================================
       * 1. Woven Corridor Floor Runners (y = 0.008, strictly below team rugs)
       * ================================================================== */}
      {/* Elevator landing welcome mat */}
      <mesh position={[-halfW + 1.45, 0.008, -halfD + 2.65]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[1.95, 0.012, 1.45]} />
        <meshStandardMaterial color={runnerColor} roughness={0.95} />
      </mesh>
      {/* West corridor runner (elevator hall -> front-left glass room doorway) */}
      <mesh position={[-halfW + 3.1, 0.0065, westMidZ]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[1.28, 0.01, westLen + 0.12]} />
        <meshStandardMaterial color={runnerBorder} roughness={0.95} />
      </mesh>
      <mesh position={[-halfW + 3.1, 0.0085, westMidZ]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[1.12, 0.012, westLen]} />
        <meshStandardMaterial color={runnerColor} roughness={0.95} />
      </mesh>
      {/* North hall runner (slight Y offset prevents coplanar z-fighting at L-junction) */}
      <mesh position={[northMidX, 0.007, -halfD + 3.75]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[northLen + 0.12, 0.01, 1.24]} />
        <meshStandardMaterial color={runnerBorder} roughness={0.95} />
      </mesh>
      <mesh position={[northMidX, 0.0092, -halfD + 3.75]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[northLen, 0.012, 1.08]} />
        <meshStandardMaterial color={runnerColor} roughness={0.95} />
      </mesh>

      {/* ====================================================================
       * 2. Front-Left Architectural Glass Room Enclosure
       *    Back wall at z = halfD - 4.75 with wide 1.8m open doorway at corridor
       *    Right wall at x = -halfW + 4.85 with front cutaway for isometric clarity
       * ================================================================== */}
      {/* Back glass wall - left section */}
      <ArchitecturalGlassPanel
        width={2.16}
        height={wallHeight}
        position={[-halfW + 1.16, 0, roomBackZ]}
        opacity={0.22}
      />
      {/* Back glass wall - right corner return beside open doorway */}
      <ArchitecturalGlassPanel
        width={0.8}
        height={wallHeight}
        position={[-halfW + 4.45, 0, roomBackZ]}
        opacity={0.22}
      />
      {/* Doorway frame: vertical oak jambs + continuous top transom header */}
      <mesh position={[-halfW + 2.25, wallHeight / 2, roomBackZ]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.09, wallHeight, 0.095]} />
        <meshStandardMaterial color={OAK_FRAME} roughness={0.68} />
      </mesh>
      <mesh position={[-halfW + 4.05, wallHeight / 2, roomBackZ]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.09, wallHeight, 0.095]} />
        <meshStandardMaterial color={OAK_FRAME} roughness={0.68} />
      </mesh>
      <mesh position={[-halfW + 3.15, wallHeight - 0.055, roomBackZ]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[1.88, 0.11, 0.1]} />
        <meshStandardMaterial color={OAK_FRAME} roughness={0.68} />
      </mesh>
      {/* Corner mullion post connecting back and right glass walls */}
      <mesh position={[roomRightX, wallHeight / 2, roomBackZ]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.1, wallHeight, 0.1]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.68} />
      </mesh>

      {/* Right glass wall - back tall glass bay */}
      <ArchitecturalGlassPanel
        width={2.36}
        height={wallHeight}
        position={[roomRightX, 0, halfD - 3.55]}
        rotationY={Math.PI / 2}
        opacity={0.18}
      />
      {/* Mid mullion post */}
      <mesh position={[roomRightX, wallHeight / 2, halfD - 2.35]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.09, wallHeight, 0.09]} />
        <meshStandardMaterial color={OAK_FRAME} roughness={0.68} />
      </mesh>
      {/* Right glass wall - front lower cutaway rail so isometric view stays crystal clear */}
      <ArchitecturalGlassPanel
        width={1.86}
        height={1.06}
        position={[roomRightX, 0, halfD - 1.4]}
        rotationY={Math.PI / 2}
        opacity={0.18}
        frostedBand={false}
      />
      {/* Front-end low oak post */}
      <mesh position={[roomRightX, 0.53, halfD - 0.45]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.09, 1.06, 0.09]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.68} />
      </mesh>

      {/* ====================================================================
       * 3. Back-Right Warm-Oak Wood Slat Partition (frames Pantry/Server/Coffee)
       * ================================================================== */}
      {/* Bottom oak plinth rail */}
      <mesh
        position={[slatX, 0.04, (slatStartZ + slatEndZ) / 2]}
        receiveShadow
        raycast={disableRaycast}
      >
        <boxGeometry args={[0.14, 0.08, slatEndZ - slatStartZ]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.72} />
      </mesh>
      {/* Top oak header beam */}
      <mesh
        position={[slatX, 2.54, (slatStartZ + slatEndZ) / 2]}
        castShadow
        raycast={disableRaycast}
      >
        <boxGeometry args={[0.14, 0.09, slatEndZ - slatStartZ]} />
        <meshStandardMaterial color={OAK_FRAME} roughness={0.68} />
      </mesh>
      {/* 8 slender vertical warm-oak slats */}
      {slatPositions.map((sz, idx) => (
        <mesh key={idx} position={[slatX, 1.29, sz]} castShadow receiveShadow raycast={disableRaycast}>
          <boxGeometry args={[0.075, 2.48, 0.115]} />
          <meshStandardMaterial color={idx % 2 === 0 ? OAK_FRAME : '#c4986a'} roughness={0.7} />
        </mesh>
      ))}
      {/* Short low glass-and-oak wing returning into the alcove edge */}
      <ArchitecturalGlassPanel
        width={1.0}
        height={1.08}
        position={[slatX + 0.52, 0, slatEndZ]}
        opacity={0.2}
        frostedBand={false}
      />
      <mesh position={[slatX + 1.02, 0.54, slatEndZ]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.08, 1.08, 0.085]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.68} />
      </mesh>

      {/* ====================================================================
       * 4. Low Acoustic Work-Pod Dividers (zoning corridor vs center team area)
       * ================================================================== */}
      <LowAcousticDivider
        length={3.7}
        position={[-halfW + 5.15, 0, 0]}
        rotationY={Math.PI / 2}
        feltColor={feltColor}
      />
      <LowAcousticDivider
        length={3.8}
        position={[0, 0, -halfD + 5.05]}
        rotationY={0}
        feltColor={feltColor}
      />
    </group>
  );
};
