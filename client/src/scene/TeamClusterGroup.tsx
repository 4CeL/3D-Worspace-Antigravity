import React from 'react';
import { Html } from '@react-three/drei';
import type { AgentNode } from '@office/shared';
import type { ClusterPlacement, DeskPlacement } from './officeLayout';
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

      {/* Architectural glass-suite door-header project nameplate */}
      <Html position={labelPos} center distanceFactor={18} zIndexRange={[5, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-full border border-stone-200/90 bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-stone-700 shadow-sm backdrop-blur-xs">
          {cluster.projectName}
        </div>
      </Html>

      {/* Member desks + subtle individual glass privacy divider behind each desk */}
      {cluster.agentIds.map((agentId) => {
        const agent = agents[agentId];
        const placement = desks[agentId];
        if (!agent || !placement) return null;
        const [dx, dy, dz] = placement.position;

        return (
          <React.Fragment key={agentId}>
            <mesh
              position={[dx, dy + 0.96, dz - 0.56]}
              rotation={[0, placement.rotationY, 0]}
              raycast={disableRaycast}
            >
              <boxGeometry args={[placement.isLead ? 1.66 : 1.38, 0.36, 0.022]} />
              <meshStandardMaterial
                color="#dbeafe"
                transparent
                opacity={0.28}
                roughness={0.15}
                metalness={0.15}
                depthWrite={false}
              />
            </mesh>
            <AgentDesk
              agent={agent}
              position={placement.position}
              rotationY={placement.rotationY}
              isLead={placement.isLead}
              isSelected={selectedAgentId === agentId}
              showLabels={showLabels}
              isAway={roamingAgentIds?.has(agentId) ?? false}
              onSelect={onSelectAgent}
            />
          </React.Fragment>
        );
      })}
    </group>
  );
};
