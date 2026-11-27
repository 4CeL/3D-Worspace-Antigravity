import React, { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { AgentNode, AgentStatus } from '@office/shared';
import { AgentAvatar } from './AgentAvatar';

interface AgentDeskProps {
  agent: AgentNode;
  position: [number, number, number];
  rotationY: number;
  isLead: boolean;
  isSelected: boolean;
  showLabels: boolean;
  isAway?: boolean;
  sharedTable?: boolean;
  onSelect: (agentId: string) => void;
}

const STATUS_STYLE: Record<
  AgentStatus,
  { screen: string; dot: string; border: string; label: string }
> = {
  editing: { screen: '#34d399', dot: '#10b981', border: '#10b981', label: 'edit' },
  reading: { screen: '#60a5fa', dot: '#3b82f6', border: '#3b82f6', label: 'read' },
  running: { screen: '#a78bfa', dot: '#8b5cf6', border: '#8b5cf6', label: 'run' },
  thinking: { screen: '#fbbf24', dot: '#f59e0b', border: '#f59e0b', label: 'berpikir' },
  delegating: { screen: '#f59e0b', dot: '#d97706', border: '#f59e0b', label: 'delegasi' },
  error: { screen: '#f87171', dot: '#ef4444', border: '#ef4444', label: 'error' },
  idle: { screen: '#cbd5e1', dot: '#94a3b8', border: '#cbd5e1', label: 'santai' },
};

function shortText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const AgentDesk: React.FC<AgentDeskProps> = ({
  agent,
  position,
  rotationY,
  isLead,
  isSelected,
  showLabels,
  isAway = false,
  sharedTable = false,
  onSelect,
}) => {
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    return () => {
      if (hoveredRef.current) {
        hoveredRef.current = false;
        document.body.style.cursor = 'auto';
      }
    };
  }, []);

  const style = Object.prototype.hasOwnProperty.call(STATUS_STYLE, agent.status)
    ? STATUS_STYLE[agent.status]
    : STATUS_STYLE.idle;
  const deskWidth = isLead ? 1.72 : 1.44;
  const isActive = agent.status !== 'idle';
  const pending = agent.pendingApproval;
  const isQuestion = pending?.kind === 'question';
  const screenColor = pending ? (isQuestion ? '#818cf8' : '#f59e0b') : style.screen;
  const screenEmissive = pending ? 0.95 : isActive ? 0.65 : 0.12;
  const secondaryScreenEmissive = pending ? 0.95 : isActive ? 0.4 : 0.08;
  const ringColor = isSelected
    ? '#10b981'
    : pending
      ? isQuestion
        ? '#6366f1'
        : '#f59e0b'
      : '#f59e0b';
  const ringOpacity = isSelected || pending ? 0.85 : 0.45;

  const showFileInPill =
    Boolean(agent.currentFile) && (agent.status === 'editing' || agent.status === 'reading');
  const pillTarget =
    showFileInPill && agent.currentFile
      ? `${shortText(agent.currentFile.fileName, 18)} · ${agent.currentFile.action}`
      : agent.focusText
        ? shortText(agent.focusText, 22)
        : style.label;

  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(agent.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoveredRef.current = true;
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hoveredRef.current = false;
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* Selection / Hover / Attention ring on floor */}
      {(isSelected || hovered || Boolean(pending)) && (
        <mesh
          position={[0, 0.03, sharedTable ? 0.56 : 0.15]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={sharedTable ? [0.52, 0.64, 28] : [1.05, 1.2, 32]} />
          <meshBasicMaterial color={ringColor} transparent opacity={ringOpacity} />
        </mesh>
      )}

      {/* Standalone desk surface & legs (omitted when seated at a shared conference table) */}
      {!sharedTable && (
        <>
          <mesh position={[0, 0.74, -0.12]} castShadow receiveShadow>
            <boxGeometry args={[deskWidth, 0.08, 0.86]} />
            <meshStandardMaterial color="#fffdf9" roughness={0.6} />
          </mesh>

          {[-deskWidth / 2 + 0.1, deskWidth / 2 - 0.1].map((lx) =>
            [-0.46, 0.22].map((lz) => (
              <mesh key={`${lx}-${lz}`} position={[lx, 0.37, lz]} castShadow>
                <boxGeometry args={[0.07, 0.74, 0.07]} />
                <meshStandardMaterial color="#c9a57a" roughness={0.75} />
              </mesh>
            )),
          )}
        </>
      )}

      {/* Keyboard */}
      <mesh position={[0, 0.795, 0.08]} castShadow>
        <boxGeometry args={[0.48, 0.025, 0.16]} />
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </mesh>

      {/* Primary monitor */}
      <group position={[isLead ? -0.24 : 0, 1.08, -0.34]}>
        <mesh position={[0, -0.2, 0]}>
          <boxGeometry args={[0.08, 0.24, 0.08]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh castShadow>
          <boxGeometry args={[0.68, 0.42, 0.05]} />
          <meshStandardMaterial color="#1e293b" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[0.62, 0.36]} />
          <meshStandardMaterial
            color={screenColor}
            emissive={screenColor}
            emissiveIntensity={screenEmissive}
            roughness={0.25}
          />
        </mesh>
      </group>

      {/* Second monitor + mini succulent for Lead/Coordinator desk */}
      {isLead && (
        <>
          <group position={[0.42, 1.06, -0.28]} rotation={[0, -0.28, 0]}>
            <mesh position={[0, -0.19, 0]}>
              <boxGeometry args={[0.07, 0.22, 0.07]} />
              <meshStandardMaterial color="#475569" />
            </mesh>
            <mesh castShadow>
              <boxGeometry args={[0.52, 0.36, 0.05]} />
              <meshStandardMaterial color="#1e293b" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[0.46, 0.3]} />
              <meshStandardMaterial
                color={screenColor}
                emissive={screenColor}
                emissiveIntensity={secondaryScreenEmissive}
                roughness={0.3}
              />
            </mesh>
          </group>
          {/* Mini succulent */}
          <mesh position={[-0.72, 0.84, -0.35]} castShadow>
            <cylinderGeometry args={[0.07, 0.055, 0.11, 8]} />
            <meshStandardMaterial color="#d97757" />
          </mesh>
          <mesh position={[-0.72, 0.94, -0.35]} castShadow>
            <dodecahedronGeometry args={[0.08, 0]} />
            <meshStandardMaterial color="#4f9d69" />
          </mesh>
        </>
      )}

      {/* Office chair */}
      <group position={[0, 0, 0.68]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.05, 10]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        <mesh position={[0, 0.42, -0.04]} castShadow>
          <boxGeometry args={[0.48, 0.08, 0.44]} />
          <meshStandardMaterial color="#64748b" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.72, 0.18]} castShadow>
          <boxGeometry args={[0.46, 0.56, 0.08]} />
          <meshStandardMaterial color="#64748b" roughness={0.85} />
        </mesh>
      </group>

      {/* Stylized character (hidden while roaming away from desk) */}
      {!isAway && (
        <AgentAvatar
          status={agent.status}
          isLead={isLead}
          seed={agent.id}
          needsAttention={Boolean(pending)}
        />
      )}

      {/* Animated floating attention badge when waiting for user approval/answer */}
      {!isAway && pending && (
        <Html
          position={[0, showLabels || isSelected ? 3.05 : 2.38, sharedTable ? 0.56 : 0]}
          center
          distanceFactor={14}
          zIndexRange={[14, 0]}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(agent.id);
            }}
            className={`animate-bounce whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold text-white shadow-lg transition hover:scale-105 ${
              isQuestion
                ? 'border-indigo-300 bg-indigo-600'
                : 'border-amber-300 bg-amber-500'
            }`}
          >
            {isQuestion ? '❓ Tanya User' : '✋ Butuh Izin'}
          </button>
        </Html>
      )}

      {/* Floating desk file badge (rendered on RoamingAgent while away) */}
      {!isAway && (showLabels || isSelected) && (
        <Html
          position={[0, 2.38, sharedTable ? 0.56 : 0]}
          center
          distanceFactor={14}
          zIndexRange={[10, 0]}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(agent.id);
            }}
            className="group flex flex-col items-center gap-0.5 rounded-xl bg-white/92 px-2.5 py-1.5 text-left shadow-md backdrop-blur-sm transition hover:scale-105"
            style={{
              border: `1.5px solid ${isSelected ? '#059669' : style.border}`,
              minWidth: '112px',
              maxWidth: '190px',
            }}
          >
            <div className="flex w-full items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: style.dot }}
              />
              <span className="truncate text-[11px] font-semibold text-stone-800">
                {shortText(agent.displayName || agent.role, 20)}
              </span>
            </div>
            <div className="w-full truncate font-mono text-[10px] text-stone-500">
              {pillTarget}
            </div>
          </button>
        </Html>
      )}
    </group>
  );
};
