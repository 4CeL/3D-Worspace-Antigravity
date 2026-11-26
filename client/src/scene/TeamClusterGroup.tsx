import React from 'react';
import { Html } from '@react-three/drei';
import type { AgentNode } from '@office/shared';
import type { ClusterPlacement, DeskPlacement, SharedTableSpec } from './officeLayout';
import { AgentDesk } from './AgentDesk';

interface TeamClusterGroupProps {
  cluster: ClusterPlacement;
  agents: Record<string, AgentNode>;
  desks: Record<string, DeskPlacement>;
  selectedAgentId: string | null;
  showLabels: boolean;
  roamingAgentIds?: ReadonlySet<string>;
  onSelectAgent: (agentId: string) => void;
}

const disableRaycast = () => null;

const SharedConferenceTable: React.FC<{
  table: SharedTableSpec;
  hasFacingSubs: boolean;
}> = ({ table, hasFacingSubs }) => {
  const [tx, ty, tz] = table.center;
  const { width, length } = table;
  const halfW = width / 2;
  const halfL = length / 2;
  const legZ = Math.max(0.8, halfL - 0.52);
  const legX = halfW - 0.24;
  const spineLength = Math.max(0.9, length - 1.85);

  return (
    <group position={[tx, ty, tz]}>
      {/* Main warm cream tabletop surface (y = 0.74 matches AgentDesk monitors & keyboards) */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[width, 0.085, length]} />
        <meshStandardMaterial color="#fffcf6" roughness={0.55} />
      </mesh>

      {/* Beveled warm-oak perimeter trim rails */}
      <mesh position={[-halfW - 0.02, 0.74, 0]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.045, 0.092, length + 0.08]} />
        <meshStandardMaterial color="#c49565" roughness={0.68} />
      </mesh>
      <mesh position={[halfW + 0.02, 0.74, 0]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.045, 0.092, length + 0.08]} />
        <meshStandardMaterial color="#c49565" roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.74, -halfL - 0.02]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[width + 0.08, 0.092, 0.045]} />
        <meshStandardMaterial color="#c49565" roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.74, halfL + 0.02]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[width + 0.08, 0.092, 0.045]} />
        <meshStandardMaterial color="#c49565" roughness={0.68} />
      </mesh>

      {/* Under-table structural apron & longitudinal stretcher beam */}
      <mesh position={[0, 0.65, 0]} castShadow raycast={disableRaycast}>
        <boxGeometry args={[0.16, 0.09, length - 0.8]} />
        <meshStandardMaterial color="#475569" metalness={0.35} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.16, 0]} raycast={disableRaycast}>
        <boxGeometry args={[0.09, 0.06, legZ * 2]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.45} />
      </mesh>

      {/* Conference portal trestle legs at both ends */}
      {[-legZ, legZ].map((lz) => (
        <group key={lz} position={[0, 0, lz]}>
          {/* Left & right angled warm-oak/slate portal legs */}
          {[-legX, legX].map((lx) => (
            <mesh key={lx} position={[lx, 0.35, 0]} castShadow raycast={disableRaycast}>
              <boxGeometry args={[0.085, 0.7, 0.095]} />
              <meshStandardMaterial color="#b38456" roughness={0.72} />
            </mesh>
          ))}
          {/* Bottom foot crossbar */}
          <mesh position={[0, 0.04, 0]} receiveShadow raycast={disableRaycast}>
            <boxGeometry args={[legX * 2 + 0.14, 0.055, 0.11]} />
            <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.45} />
          </mesh>
          {/* Upper tie crossbar */}
          <mesh position={[0, 0.65, 0]} raycast={disableRaycast}>
            <boxGeometry args={[legX * 2 + 0.06, 0.065, 0.08]} />
            <meshStandardMaterial color="#475569" metalness={0.35} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Recessed center oak cable tray along table spine */}
      <mesh position={[0, 0.785, 0]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[0.22, 0.015, spineLength]} />
        <meshStandardMaterial color="#a97d54" roughness={0.72} />
      </mesh>
      {/* Subtle power/USB grommet inserts */}
      {[-spineLength * 0.3, spineLength * 0.3].map((gz, idx) => (
        <mesh key={idx} position={[0, 0.794, gz]} raycast={disableRaycast}>
          <boxGeometry args={[0.12, 0.01, 0.18]} />
          <meshStandardMaterial color="#334155" metalness={0.35} roughness={0.5} />
        </mesh>
      ))}

      {/* Ultra-low frosted glass modesty/center spine strip between facing monitors */}
      {hasFacingSubs && (
        <mesh position={[0, 0.91, 0]} raycast={disableRaycast}>
          <boxGeometry args={[0.024, 0.24, spineLength]} />
          <meshStandardMaterial
            color="#e2effb"
            transparent
            opacity={0.32}
            roughness={0.25}
            metalness={0.1}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Cozy mini tabletop succulent & closed notebook beside center spine (clear of glass & cable tray) */}
      <group position={[-0.28, 0.7825, 0]}>
        <mesh position={[0, 0.055, 0]} castShadow raycast={disableRaycast}>
          <cylinderGeometry args={[0.07, 0.056, 0.11, 10]} />
          <meshStandardMaterial color="#d47958" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.15, 0]} castShadow raycast={disableRaycast}>
          <dodecahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial color="#4f9d69" roughness={0.75} />
        </mesh>
      </group>
      <mesh
        position={[0.31, 0.7935, spineLength * 0.18]}
        rotation={[0, 0.18, 0]}
        castShadow
        raycast={disableRaycast}
      >
        <boxGeometry args={[0.2, 0.022, 0.28]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.7} />
      </mesh>
    </group>
  );
};

export const TeamClusterGroup: React.FC<TeamClusterGroupProps> = ({
  cluster,
  agents,
  desks,
  selectedAgentId,
  showLabels,
  roamingAgentIds,
  onSelectAgent,
}) => {
  const [cx, cy, cz] = cluster.center;
  const labelPos: [number, number, number] = cluster.doorPosition
    ? [cluster.doorPosition[0], cy + 2.68, cluster.doorPosition[1]]
    : [cx, cy + 0.12, cz + cluster.rugDepth / 2 + 0.35];

  const hasSharedTable = Boolean(cluster.table);
  const subCount = Math.max(0, cluster.agentIds.length - 1);

  return (
    <group>
      {/* Soft pastel team suite carpet */}
      <mesh position={[cx, cy + 0.015, cz]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[cluster.rugWidth, 0.026, cluster.rugDepth]} />
        <meshStandardMaterial color={cluster.rugColor} roughness={0.95} />
      </mesh>

      {/* Subtle carpet border accent */}
      <mesh position={[cx, cy + 0.012, cz]} raycast={disableRaycast}>
        <boxGeometry args={[cluster.rugWidth + 0.14, 0.02, cluster.rugDepth + 0.14]} />
        <meshStandardMaterial color="#d6c8b6" roughness={0.9} />
      </mesh>

      {/* ONE continuous shared conference/meeting table for the whole team */}
      {cluster.table && (
        <SharedConferenceTable table={cluster.table} hasFacingSubs={subCount >= 2} />
      )}

      {/* Architectural glass-suite door-header project nameplate */}
      <Html position={labelPos} center distanceFactor={18} zIndexRange={[5, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-full border border-stone-200/90 bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-stone-700 shadow-sm backdrop-blur-xs">
          {cluster.projectName}
        </div>
      </Html>

      {/* Team seats around the shared conference table */}
      {cluster.agentIds.map((agentId) => {
        const agent = agents[agentId];
        const placement = desks[agentId];
        if (!agent || !placement) return null;

        return (
          <AgentDesk
            key={agentId}
            agent={agent}
            position={placement.position}
            rotationY={placement.rotationY}
            isLead={placement.isLead}
            isSelected={selectedAgentId === agentId}
            showLabels={showLabels}
            isAway={roamingAgentIds?.has(agentId) ?? false}
            sharedTable={hasSharedTable}
            onSelect={onSelectAgent}
          />
        );
      })}
    </group>
  );
};
