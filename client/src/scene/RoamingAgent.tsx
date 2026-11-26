import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import type { AgentNode } from '@office/shared';
import { AgentAvatar, type AvatarPosture } from './AgentAvatar';
import type { RoamingBubble, RoamingController, RoamingMode } from './roamingEngine';

interface RoamingAgentProps {
  agent: AgentNode;
  controller: RoamingController;
  isSelected: boolean;
  showLabels: boolean;
  onSelect: (agentId: string) => void;
}

function modeToPosture(mode: RoamingMode): AvatarPosture {
  if (mode === 'walking_out' || mode === 'returning') return 'walking';
  if (mode === 'chatting') return 'chatting';
  if (mode === 'visiting') return 'standing';
  return 'seated';
}

function shortText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const RoamingAgent: React.FC<RoamingAgentProps> = ({
  agent,
  controller,
  isSelected,
  showLabels,
  onSelect,
}) => {
  const groupRef = useRef<THREE.Group>(null);
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

  const initial = controller.getState(agent.id);
  const [uiState, setUiState] = useState<{
    posture: AvatarPosture;
    bubble: RoamingBubble;
    activityLabel: string;
    isReturning: boolean;
  }>(() => ({
    posture: initial ? modeToPosture(initial.mode) : 'walking',
    bubble: initial?.bubble ?? null,
    activityLabel: initial?.activityLabel ?? 'Jalan-jalan',
    isReturning: initial?.mode === 'returning',
  }));

  const lastUiRef = useRef(uiState);

  useFrame(() => {
    const state = controller.getState(agent.id);
    if (!state) return;

    if (groupRef.current) {
      groupRef.current.position.set(state.x, state.y, state.z);
      groupRef.current.rotation.y = state.rotationY;
    }

    const nextPosture = modeToPosture(state.mode);
    const nextIsReturning = state.mode === 'returning';
    const prev = lastUiRef.current;

    if (
      prev.posture !== nextPosture ||
      prev.bubble !== state.bubble ||
      prev.activityLabel !== state.activityLabel ||
      prev.isReturning !== nextIsReturning
    ) {
      const next = {
        posture: nextPosture,
        bubble: state.bubble,
        activityLabel: state.activityLabel,
        isReturning: nextIsReturning,
      };
      lastUiRef.current = next;
      setUiState(next);
    }
  });

  const startX = initial?.x ?? 0;
  const startY = initial?.y ?? 0;
  const startZ = initial?.z ?? 0;
  const startRot = initial?.rotationY ?? 0;

  return (
    <group
      ref={groupRef}
      position={[startX, startY, startZ]}
      rotation={[0, startRot, 0]}
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
      {/* Subtle feet ring on hover or selection */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.54, 24]} />
          <meshBasicMaterial
            color={isSelected ? '#10b981' : '#f59e0b'}
            transparent
            opacity={isSelected ? 0.85 : 0.5}
          />
        </mesh>
      )}

      {/* Rotate avatar PI on Y so its local -Z face points along +Z (atan2(dx, dz)) */}
      <group rotation={[0, Math.PI, 0]}>
        <AgentAvatar
          status={agent.status}
          isLead={false}
          seed={agent.id}
          posture={uiState.posture}
          holdMug={uiState.bubble === '☕'}
        />
      </group>

      {/* Cheerful floating social / activity speech bubble */}
      {uiState.bubble && (
        <Html position={[0, 2.02, 0]} center distanceFactor={14} zIndexRange={[12, 0]}>
          <div className="pointer-events-none select-none animate-bounce">
            <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full border border-amber-200/90 bg-white/95 px-2 text-sm shadow-md backdrop-blur-xs">
              <span>{uiState.bubble}</span>
              <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-amber-200/90 bg-white/95" />
            </div>
          </div>
        </Html>
      )}

      {/* Moving name & activity pill */}
      {(showLabels || isSelected) && (
        <Html
          position={[0, uiState.bubble ? 2.58 : 2.12, 0]}
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
            className="group flex flex-col items-center gap-0.5 rounded-xl bg-white/92 px-2.5 py-1 text-left shadow-md backdrop-blur-sm transition hover:scale-105"
            style={{
              border: `1.5px solid ${
                isSelected ? '#059669' : uiState.isReturning ? '#10b981' : '#cbd5e1'
              }`,
              minWidth: '104px',
              maxWidth: '176px',
            }}
          >
            <div className="flex w-full items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: uiState.isReturning
                    ? '#10b981'
                    : uiState.posture === 'chatting'
                      ? '#f59e0b'
                      : '#94a3b8',
                }}
              />
              <span className="truncate text-[11px] font-semibold text-stone-800">
                {shortText(agent.displayName || agent.role, 18)}
              </span>
            </div>
            <div className="w-full truncate font-mono text-[10px] text-stone-500">
              {uiState.activityLabel}
            </div>
          </button>
        </Html>
      )}
    </group>
  );
};
