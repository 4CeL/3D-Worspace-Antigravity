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
  onSelectAgent: (agentId: string) => void;
}

export const TeamClusterGroup: React.FC<TeamClusterGroupProps> = ({
  cluster,
  agents,
  desks,
  selectedAgentId,
  showLabels,
  onSelectAgent,
}) => {
  const [cx, cy, cz] = cluster.center;

  return (
    <group>
      {/* Soft pastel team rug */}
      <mesh position={[cx, cy + 0.015, cz]} receiveShadow>
        <boxGeometry args={[cluster.rugWidth, 0.03, cluster.rugDepth]} />
        <meshStandardMaterial color={cluster.rugColor} roughness={0.95} />
      </mesh>

      {/* Subtle rug border accent */}
      <mesh position={[cx, cy + 0.012, cz]}>
        <boxGeometry args={[cluster.rugWidth + 0.14, 0.022, cluster.rugDepth + 0.14]} />
        <meshStandardMaterial color="#d6c8b6" roughness={0.9} />
      </mesh>

      {/* Project Nameplate on front edge of rug */}
      <Html
        position={[cx, cy + 0.12, cz + cluster.rugDepth / 2 + 0.35]}
        center
        distanceFactor={16}
        zIndexRange={[5, 0]}
      >
        <div className="pointer-events-none select-none rounded-full border border-stone-200/80 bg-white/85 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-stone-600 shadow-sm backdrop-blur-xs">
          {cluster.projectName}
        </div>
      </Html>

      {/* Member desks */}
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
            onSelect={onSelectAgent}
          />
        );
      })}
    </group>
  );
};
