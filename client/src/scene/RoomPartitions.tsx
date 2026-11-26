import React from 'react';
import type { FloorTheme } from '@office/shared';
import type { GlassSuiteSlot } from './officeLayout';

export interface RoomPartitionsProps {
  floorWidth: number;
  floorDepth: number;
  theme: FloorTheme;
  suites?: GlassSuiteSlot[];
  occupiedSuiteIds?: ReadonlySet<string>;
}

/**
 * Shared no-op raycaster so pointer hovers & clicks always pass cleanly
 * through architectural glass walls, frames, mullions, and runners.
 */
const disableRaycast = () => null;

const OAK_TRIM = '#b88a5c';
const ALUM_DARK = '#475569';
const GLASS_TINT = '#dbeafe';
const FROSTED_STRIP = '#f8fafc';
const WALL_HEIGHT = 2.48;
const DOOR_WIDTH = 1.85;

interface GlassSegmentProps {
  width: number;
  height?: number;
  position: [number, number, number];
  rotationY?: number;
  opacity?: number;
  frostedBand?: boolean;
}

const GlassWallSegment: React.FC<GlassSegmentProps> = ({
  width,
  height = WALL_HEIGHT,
  position,
  rotationY = 0,
  opacity = 0.24,
  frostedBand = true,
}) => {
  if (width <= 0.08) return null;
  const midMullionCount = Math.max(0, Math.floor(width / 2.6) - 1);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Slim dark-aluminum bottom track */}
      <mesh position={[0, 0.04, 0]} raycast={disableRaycast}>
        <boxGeometry args={[width, 0.08, 0.075]} />
        <meshStandardMaterial color={ALUM_DARK} metalness={0.35} roughness={0.5} />
      </mesh>
      {/* Top oak-and-aluminum header rail */}
      <mesh position={[0, height - 0.045, 0]} raycast={disableRaycast}>
        <boxGeometry args={[width, 0.09, 0.08]} />
        <meshStandardMaterial color={OAK_TRIM} roughness={0.68} />
      </mesh>
      {/* End vertical mullions */}
      {[-width / 2 + 0.03, width / 2 - 0.03].map((mx) => (
        <mesh key={mx} position={[mx, height / 2, 0]} raycast={disableRaycast}>
          <boxGeometry args={[0.06, height, 0.075]} />
          <meshStandardMaterial color={ALUM_DARK} metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
      {/* Intermediate slim mullions for wide glass spans */}
      {Array.from({ length: midMullionCount }, (_, i) => {
        const mx = -width / 2 + ((i + 1) / (midMullionCount + 1)) * width;
        return (
          <mesh key={`mid-${i}`} position={[mx, height / 2, 0]} raycast={disableRaycast}>
            <boxGeometry args={[0.04, height - 0.14, 0.055]} />
            <meshStandardMaterial color={ALUM_DARK} metalness={0.3} roughness={0.5} />
          </mesh>
        );
      })}
      {/* Clear architectural glass pane */}
      <mesh position={[0, height / 2, 0]} raycast={disableRaycast}>
        <boxGeometry args={[Math.max(0.08, width - 0.06), height - 0.16, 0.024]} />
        <meshStandardMaterial
          color={GLASS_TINT}
          transparent
          opacity={opacity}
          roughness={0.1}
          metalness={0.15}
          depthWrite={false}
        />
      </mesh>
      {/* Signature frosted horizontal privacy band */}
      {frostedBand && height > 1.6 && (
        <mesh position={[0, 1.15, 0]} raycast={disableRaycast}>
          <boxGeometry args={[Math.max(0.08, width - 0.08), 0.22, 0.028]} />
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

interface DoorwayGlassWallProps {
  xMin: number;
  xMax: number;
  z: number;
  doorCenterX: number;
  doorWidth?: number;
  height?: number;
  opacity?: number;
}

const DoorwayGlassWall: React.FC<DoorwayGlassWallProps> = ({
  xMin,
  xMax,
  z,
  doorCenterX,
  doorWidth = DOOR_WIDTH,
  height = WALL_HEIGHT,
  opacity = 0.24,
}) => {
  const doorLeft = Math.max(xMin + 0.15, doorCenterX - doorWidth / 2);
  const doorRight = Math.min(xMax - 0.15, doorCenterX + doorWidth / 2);
  const leftWidth = Math.max(0, doorLeft - xMin);
  const rightWidth = Math.max(0, xMax - doorRight);
  const actualDoorW = doorRight - doorLeft;

  return (
    <group>
      {leftWidth > 0.1 && (
        <GlassWallSegment
          width={leftWidth}
          height={height}
          position={[xMin + leftWidth / 2, 0, z]}
          opacity={opacity}
        />
      )}
      {rightWidth > 0.1 && (
        <GlassWallSegment
          width={rightWidth}
          height={height}
          position={[doorRight + rightWidth / 2, 0, z]}
          opacity={opacity}
        />
      )}
      {/* Warm oak doorway jambs */}
      <mesh position={[doorLeft, height / 2, z]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.085, height, 0.095]} />
        <meshStandardMaterial color={OAK_TRIM} roughness={0.68} />
      </mesh>
      <mesh position={[doorRight, height / 2, z]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.085, height, 0.095]} />
        <meshStandardMaterial color={OAK_TRIM} roughness={0.68} />
      </mesh>
      {/* Continuous top header beam & frosted glass transom above doorway */}
      <mesh position={[(doorLeft + doorRight) / 2, height - 0.05, z]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[actualDoorW + 0.12, 0.1, 0.1]} />
        <meshStandardMaterial color={OAK_TRIM} roughness={0.68} />
      </mesh>
      <mesh position={[(doorLeft + doorRight) / 2, height - 0.24, z]} raycast={disableRaycast}>
        <boxGeometry args={[actualDoorW - 0.06, 0.26, 0.025]} />
        <meshStandardMaterial
          color={FROSTED_STRIP}
          transparent
          opacity={0.32}
          roughness={0.45}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[(doorLeft + doorRight) / 2, height - 0.38, z]} raycast={disableRaycast}>
        <boxGeometry args={[actualDoorW + 0.04, 0.045, 0.07]} />
        <meshStandardMaterial color={ALUM_DARK} metalness={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
};

interface SuiteEnclosureProps {
  suite: GlassSuiteSlot;
  isOccupied: boolean;
}

const GlassSuiteEnclosure: React.FC<SuiteEnclosureProps> = ({ suite, isOccupied }) => {
  const [cx, , cz] = suite.center;
  const xMin = cx - suite.width / 2;
  const xMax = cx + suite.width / 2;
  const zMin = cz - suite.depth / 2;
  const zMax = cz + suite.depth / 2;
  const [doorX] = suite.doorPosition;
  const isSouthRow = suite.doorSide === 'north';

  return (
    <group>
      {/* North wall: doorway for South-row suites, glass wall for North-row suites */}
      {suite.doorSide === 'north' ? (
        <DoorwayGlassWall xMin={xMin} xMax={xMax} z={zMin} doorCenterX={doorX} />
      ) : (
        <GlassWallSegment width={suite.width} position={[cx, 0, zMin]} opacity={0.2} />
      )}

      {/* South wall: doorway for North-row suites, sleek cutaway glass edge for South-row suites */}
      {suite.doorSide === 'south' ? (
        <DoorwayGlassWall xMin={xMin} xMax={xMax} z={zMax} doorCenterX={doorX} />
      ) : (
        <GlassWallSegment
          width={suite.width}
          height={1.18}
          position={[cx, 0, zMax]}
          opacity={0.2}
          frostedBand={false}
        />
      )}

      {/* West glass wall */}
      <GlassWallSegment
        width={suite.depth}
        height={WALL_HEIGHT}
        position={[xMin, 0, cz]}
        rotationY={Math.PI / 2}
        opacity={0.22}
      />

      {/* East glass wall (slightly lighter opacity on South row for crystal-clear isometric viewing) */}
      <GlassWallSegment
        width={suite.depth}
        height={isSouthRow ? 1.95 : WALL_HEIGHT}
        position={[xMax, 0, cz]}
        rotationY={Math.PI / 2}
        opacity={0.2}
      />

      {/* Subtle empty-suite carpet & ready hot-desk accent so unoccupied suites feel furnished */}
      {!isOccupied && (
        <group>
          <mesh position={[cx, 0.012, cz]} receiveShadow raycast={disableRaycast}>
            <boxGeometry args={[suite.width - 1.1, 0.022, suite.depth - 1.1]} />
            <meshStandardMaterial color="#ece5da" roughness={0.95} />
          </mesh>
          {/* Minimalist empty oak desk ready for a team */}
          <mesh position={[cx, 0.72, cz - 0.8]} castShadow receiveShadow raycast={disableRaycast}>
            <boxGeometry args={[1.6, 0.07, 0.82]} />
            <meshStandardMaterial color="#f5efe6" roughness={0.65} />
          </mesh>
          {[-0.7, 0.7].map((lx) =>
            [-1.12, -0.48].map((lz) => (
              <mesh
                key={`${lx}-${lz}`}
                position={[cx + lx, 0.36, cz + lz]}
                castShadow
                raycast={disableRaycast}
              >
                <boxGeometry args={[0.06, 0.72, 0.06]} />
                <meshStandardMaterial color="#c49a6c" roughness={0.75} />
              </mesh>
            )),
          )}
          {/* Small corner plant inside empty suite */}
          <mesh position={[xMin + 0.72, 0.24, zMin + 0.72]} castShadow raycast={disableRaycast}>
            <cylinderGeometry args={[0.2, 0.16, 0.44, 10]} />
            <meshStandardMaterial color="#efe6d8" roughness={0.8} />
          </mesh>
          <mesh position={[xMin + 0.72, 0.64, zMin + 0.72]} castShadow raycast={disableRaycast}>
            <dodecahedronGeometry args={[0.25, 0]} />
            <meshStandardMaterial color="#5ca674" roughness={0.75} />
          </mesh>
        </group>
      )}
    </group>
  );
};

export const RoomPartitions: React.FC<RoomPartitionsProps> = ({
  theme,
  suites = [],
  occupiedSuiteIds,
}) => {
  const runnerColor =
    theme === 'creative'
      ? '#e2dce9'
      : theme === 'lobby'
        ? '#e1e7df'
        : theme === 'pantry'
          ? '#e9dfd0'
          : '#dfd8cc';
  const runnerBorder = '#cbbba5';

  // Fixed 28 x 24 perimeter glass rooms
  // Front-Left Glass Lounge / Meeting / Bistro Room: x in [-13.5, -8.8], z in [2.8, 11.2]
  const flXMin = -13.5;
  const flXMax = -8.8;
  const flZMin = 2.8;
  const flZMax = 11.2;
  const flDoorX = -11.1;

  // Back-Right Glass Pantry / Server / Coffee Room: x in [9.0, 13.5], z in [-11.3, -2.8]
  const brXMin = 9.0;
  const brXMax = 13.5;
  const brZMin = -11.3;
  const brZMax = -2.8;
  const brDoorX = 11.2;

  return (
    <group>
      {/* ====================================================================
       * 1. Central East-West Corridor Carpet Runner & Lift Lobby Spur
       *    (y = 0.006..0.009, strictly below team rugs at 0.015)
       * ================================================================== */}
      {/* Main East-West central corridor runner (z in [-1.5, +1.5]) */}
      <mesh position={[0, 0.006, 0]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[25.4, 0.008, 3.1]} />
        <meshStandardMaterial color={runnerBorder} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.009, 0]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[25.1, 0.01, 2.86]} />
        <meshStandardMaterial color={runnerColor} roughness={0.95} />
      </mesh>

      {/* Lift Lobby vertical spur runner connecting ElevatorCore to Central Corridor */}
      <mesh position={[-11.3, 0.007, -5.6]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[2.1, 0.008, 8.2]} />
        <meshStandardMaterial color={runnerBorder} roughness={0.95} />
      </mesh>
      <mesh position={[-11.3, 0.009, -5.6]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[1.9, 0.01, 8.0]} />
        <meshStandardMaterial color={runnerColor} roughness={0.95} />
      </mesh>

      {/* ====================================================================
       * 2. Four Transparent Architectural Glass Team Suites
       * ================================================================== */}
      {suites.map((suite) => (
        <GlassSuiteEnclosure
          key={suite.id}
          suite={suite}
          isOccupied={occupiedSuiteIds?.has(suite.id) ?? false}
        />
      ))}

      {/* ====================================================================
       * 3. Front-Left Transparent Glass Lounge / Meeting / Bistro Room
       *    x in [-13.5, -8.8], z in [2.8, 11.2], North doorway at [-11.1, 2.8]
       * ================================================================== */}
      <DoorwayGlassWall xMin={flXMin} xMax={flXMax} z={flZMin} doorCenterX={flDoorX} />
      {/* East interior glass wall */}
      <GlassWallSegment
        width={flZMax - flZMin}
        height={WALL_HEIGHT}
        position={[flXMax, 0, (flZMin + flZMax) / 2]}
        rotationY={Math.PI / 2}
        opacity={0.22}
      />
      {/* Front cutaway lower glass rail so isometric viewing inside stays open */}
      <GlassWallSegment
        width={flXMax - flXMin}
        height={1.15}
        position={[(flXMin + flXMax) / 2, 0, flZMax]}
        opacity={0.2}
        frostedBand={false}
      />

      {/* ====================================================================
       * 4. Back-Right Transparent Glass Pantry / Server / Coffee Room
       *    x in [9.0, 13.5], z in [-11.3, -2.8], South doorway at [11.2, -2.8]
       * ================================================================== */}
      <DoorwayGlassWall xMin={brXMin} xMax={brXMax} z={brZMax} doorCenterX={brDoorX} />
      {/* West glass wall separating Suite 2 and Back-Right Glass Room */}
      <GlassWallSegment
        width={brZMax - brZMin}
        height={WALL_HEIGHT}
        position={[brXMin, 0, (brZMin + brZMax) / 2]}
        rotationY={Math.PI / 2}
        opacity={0.24}
      />
      {/* Warm architectural vertical oak accent slats framing the pantry corridor corner */}
      {[-3.4, -3.75, -4.1, -4.45].map((sz) => (
        <mesh key={sz} position={[brXMin - 0.08, 1.24, sz]} castShadow raycast={disableRaycast}>
          <boxGeometry args={[0.06, 2.44, 0.09]} />
          <meshStandardMaterial color={OAK_TRIM} roughness={0.7} />
        </mesh>
      ))}
      {/* East cutaway lower glass edge */}
      <GlassWallSegment
        width={brZMax - brZMin}
        height={1.25}
        position={[brXMax, 0, (brZMin + brZMax) / 2]}
        rotationY={Math.PI / 2}
        opacity={0.2}
        frostedBand={false}
      />

      {/* ====================================================================
       * 5. Front-Right Transparent Glass Rest / Nap Room (Engineering theme)
       *    x in [9.0, 13.5], z in [2.8, 11.2], North doorway at [11.2, 2.8]
       * ================================================================== */}
      {theme === 'engineering' && (
        <group>
          <DoorwayGlassWall xMin={9.0} xMax={13.5} z={2.8} doorCenterX={11.2} />
          {/* West full-height glass wall separating Suite 4 and Rest Room */}
          <GlassWallSegment
            width={11.2 - 2.8}
            height={WALL_HEIGHT}
            position={[9.0, 0, (2.8 + 11.2) / 2]}
            rotationY={Math.PI / 2}
            opacity={0.22}
          />
          {/* South cutaway lower glass rail */}
          <GlassWallSegment
            width={13.5 - 9.0}
            height={1.15}
            position={[(9.0 + 13.5) / 2, 0, 11.2]}
            opacity={0.2}
            frostedBand={false}
          />
          {/* East cutaway lower glass edge */}
          <GlassWallSegment
            width={11.2 - 2.8}
            height={1.25}
            position={[13.5, 0, (2.8 + 11.2) / 2]}
            rotationY={Math.PI / 2}
            opacity={0.2}
            frostedBand={false}
          />
        </group>
      )}
    </group>
  );
};
