import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FloorTheme } from '@office/shared';

export interface FloorDecorProps {
  floorWidth: number;
  floorDepth: number;
  theme: FloorTheme;
  floorIndex: number;
}

/**
 * Mirrors OfficeRoom's sunlit back-wall window centers so wall-mounted decor
 * (analog clock, status dashboard TV) always lands cleanly in solid wall bays.
 */
function computeBackWallBays(floorWidth: number): { clockX: number; dashboardX: number } {
  const windowCount = Math.max(2, Math.floor((floorWidth - 3) / 5.2));
  const span = Math.max(4, floorWidth - 7.5);
  const windows: number[] = [];
  for (let i = 0; i < windowCount; i++) {
    const t = windowCount === 1 ? 0.5 : i / (windowCount - 1);
    windows.push(-span / 2 + t * span + 0.8);
  }

  if (windows.length === 2) {
    const mid = (windows[0] + windows[1]) / 2;
    return { clockX: mid - 1.9, dashboardX: mid + 0.95 };
  }
  const bay0 = (windows[0] + windows[1]) / 2;
  const bay1 = (windows[1] + windows[2]) / 2;
  return { clockX: bay0, dashboardX: bay1 };
}

/* ============================================================================
 * Shared Cozy Office Details (Clock, Floor Lamp, Trash Bin, Potted Plants)
 * ========================================================================== */

function AnalogWallClock({
  position,
  floorIndex,
}: {
  position: [number, number, number];
  floorIndex: number;
}) {
  const secondHandRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    if (secondHandRef.current) {
      const t = clock.getElapsedTime() + floorIndex * 11;
      secondHandRef.current.rotation.z = -(t * (Math.PI / 30));
    }
  });

  const ticks = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);

  return (
    <group position={position}>
      {/* Warm wood bezel */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.38, 0.07, 24]} />
        <meshStandardMaterial color="#875d3c" roughness={0.65} />
      </mesh>
      {/* Crisp off-white clock face */}
      <mesh position={[0, 0, 0.038]}>
        <circleGeometry args={[0.33, 24]} />
        <meshStandardMaterial color="#fffcf6" roughness={0.5} />
      </mesh>
      {/* 12 hour markers */}
      {ticks.map((i) => {
        const angle = (i / 12) * Math.PI * 2;
        const isCardinal = i % 3 === 0;
        const r = 0.27;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * r, Math.cos(angle) * r, 0.043]}
            rotation={[0, 0, -angle]}
          >
            <boxGeometry args={[isCardinal ? 0.024 : 0.014, isCardinal ? 0.062 : 0.036, 0.006]} />
            <meshStandardMaterial color={isCardinal ? '#334155' : '#94a3b8'} roughness={0.6} />
          </mesh>
        );
      })}
      {/* Hour hand (~10 o'clock) */}
      <group position={[0, 0, 0.048]} rotation={[0, 0, 0.95]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.026, 0.17, 0.008]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} />
        </mesh>
      </group>
      {/* Minute hand (~2 o'clock) */}
      <group position={[0, 0, 0.052]} rotation={[0, 0, -0.95]}>
        <mesh position={[0, 0.115, 0]}>
          <boxGeometry args={[0.018, 0.24, 0.008]} />
          <meshStandardMaterial color="#334155" roughness={0.4} />
        </mesh>
      </group>
      {/* Animated coral second hand */}
      <group ref={secondHandRef} position={[0, 0, 0.056]}>
        <mesh position={[0, 0.11, 0]}>
          <boxGeometry args={[0.01, 0.25, 0.006]} />
          <meshStandardMaterial color="#e11d48" roughness={0.4} />
        </mesh>
      </group>
      {/* Center brass cap */}
      <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.015, 12]} />
        <meshStandardMaterial color="#d97706" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

function StandingFloorLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Heavy wooden base */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.26, 0.06, 16]} />
        <meshStandardMaterial color="#755236" roughness={0.7} />
      </mesh>
      {/* Slender wooden pole */}
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.034, 1.66, 10]} />
        <meshStandardMaterial color="#b98e62" roughness={0.68} />
      </mesh>
      {/* Brass neck collar */}
      <mesh position={[0, 1.66, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.08, 12]} />
        <meshStandardMaterial color="#d4a359" metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Warm cream lampshade with soft glow */}
      <mesh position={[0, 1.84, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.28, 0.36, 18]} />
        <meshStandardMaterial
          color="#fff7e6"
          emissive="#fcd34d"
          emissiveIntensity={0.42}
          roughness={0.8}
        />
      </mesh>
      {/* Soft warm inner bulb */}
      <mesh position={[0, 1.78, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial
          color="#fef9c3"
          emissive="#fbbf24"
          emissiveIntensity={0.9}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

function OfficeTrashBin({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.19, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.135, 0.38, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.25} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.385, 0]}>
        <cylinderGeometry args={[0.176, 0.176, 0.025, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.148, 0.148, 0.02, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
      </mesh>
    </group>
  );
}

function PottedPlant({
  position,
  scale = 1,
  variant = 'terracotta',
}: {
  position: [number, number, number];
  scale?: number;
  variant?: 'terracotta' | 'ceramic' | 'tall';
}) {
  const potColor = variant === 'ceramic' ? '#f2eadf' : '#c97450';
  const rimColor = variant === 'ceramic' ? '#e3d5c3' : '#b86441';

  return (
    <group position={position} scale={scale}>
      {/* Pot body */}
      <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.2, 0.54, 14]} />
        <meshStandardMaterial color={potColor} roughness={0.82} />
      </mesh>
      {/* Pot lip */}
      <mesh position={[0, 0.53, 0]} castShadow>
        <cylinderGeometry args={[0.285, 0.27, 0.06, 14]} />
        <meshStandardMaterial color={rimColor} roughness={0.8} />
      </mesh>
      {/* Dark soil */}
      <mesh position={[0, 0.555, 0]} receiveShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.03, 12]} />
        <meshStandardMaterial color="#5c4033" roughness={1} />
      </mesh>
      {variant === 'tall' ? (
        <>
          {/* Woody stem */}
          <mesh position={[0, 0.92, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.05, 0.78, 8]} />
            <meshStandardMaterial color="#78563a" roughness={0.9} />
          </mesh>
          <mesh position={[-0.16, 1.05, 0.08]} castShadow>
            <dodecahedronGeometry args={[0.27, 0]} />
            <meshStandardMaterial color="#4a9665" roughness={0.75} />
          </mesh>
          <mesh position={[0.17, 1.18, -0.06]} castShadow>
            <dodecahedronGeometry args={[0.29, 0]} />
            <meshStandardMaterial color="#5eb078" roughness={0.75} />
          </mesh>
          <mesh position={[0.02, 1.46, 0.03]} castShadow>
            <dodecahedronGeometry args={[0.31, 0]} />
            <meshStandardMaterial color="#3c7f53" roughness={0.75} />
          </mesh>
          <mesh position={[-0.08, 1.66, -0.05]} castShadow>
            <dodecahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial color="#6ec288" roughness={0.75} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-0.14, 0.86, 0.08]} castShadow>
            <dodecahedronGeometry args={[0.3, 0]} />
            <meshStandardMaterial color="#4f9d69" roughness={0.75} />
          </mesh>
          <mesh position={[0.16, 0.94, -0.06]} castShadow>
            <dodecahedronGeometry args={[0.28, 0]} />
            <meshStandardMaterial color="#63b57d" roughness={0.75} />
          </mesh>
          <mesh position={[0, 1.16, 0]} castShadow>
            <dodecahedronGeometry args={[0.25, 0]} />
            <meshStandardMaterial color="#3e8255" roughness={0.75} />
          </mesh>
          <mesh position={[0.04, 0.78, 0.16]} castShadow>
            <dodecahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#73c28c" roughness={0.75} />
          </mesh>
        </>
      )}
    </group>
  );
}

/* ============================================================================
 * Shared Utility Pieces (Water Cooler, Mini Fridge, Espresso Machine)
 * ========================================================================== */

function WaterCooler({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Main white dispenser column */}
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.96, 0.44]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.45} />
      </mesh>
      {/* Subtle lower cabinet seam */}
      <mesh position={[0, 0.28, 0.223]}>
        <boxGeometry args={[0.4, 0.42, 0.01]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
      </mesh>
      {/* Recessed tap niche */}
      <mesh position={[0, 0.72, 0.205]}>
        <boxGeometry args={[0.34, 0.24, 0.06]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
      </mesh>
      {/* Cold (blue) & Hot (red) tap spouts */}
      <mesh position={[-0.08, 0.78, 0.24]}>
        <boxGeometry args={[0.05, 0.06, 0.05]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.35} />
      </mesh>
      <mesh position={[0.08, 0.78, 0.24]}>
        <boxGeometry args={[0.05, 0.06, 0.05]} />
        <meshStandardMaterial color="#ef4444" roughness={0.35} />
      </mesh>
      {/* Drip grate */}
      <mesh position={[0, 0.61, 0.24]}>
        <boxGeometry args={[0.3, 0.025, 0.08]} />
        <meshStandardMaterial color="#475569" roughness={0.6} />
      </mesh>
      {/* Jug collar */}
      <mesh position={[0, 0.99, 0]}>
        <cylinderGeometry args={[0.14, 0.17, 0.08, 14]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>
      {/* Translucent sky-blue water jug */}
      <mesh position={[0, 1.28, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.48, 16]} />
        <meshStandardMaterial
          color="#7dd3fc"
          transparent
          opacity={0.66}
          roughness={0.18}
          metalness={0.05}
        />
      </mesh>
      {/* Inner water fill level */}
      <mesh position={[0, 1.22, 0]}>
        <cylinderGeometry args={[0.155, 0.155, 0.34, 14]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.55} roughness={0.2} />
      </mesh>
      {/* Jug top cap */}
      <mesh position={[0, 1.54, 0]}>
        <cylinderGeometry args={[0.07, 0.16, 0.08, 14]} />
        <meshStandardMaterial color="#bae6fd" transparent opacity={0.75} roughness={0.2} />
      </mesh>
      {/* Side paper cup dispenser tube */}
      <mesh position={[0.26, 0.74, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.38, 10]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
      </mesh>
    </group>
  );
}

function CreamMiniFridge({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Cream fridge chassis */}
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.74, 1.12, 0.68]} />
        <meshStandardMaterial color="#f7efe1" roughness={0.38} />
      </mesh>
      {/* Freezer door horizontal split seam */}
      <mesh position={[0, 0.82, 0.344]}>
        <boxGeometry args={[0.7, 0.018, 0.01]} />
        <meshStandardMaterial color="#d6c8b4" roughness={0.6} />
      </mesh>
      {/* Chrome handles */}
      <mesh position={[-0.26, 0.96, 0.365]}>
        <boxGeometry args={[0.035, 0.18, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[-0.26, 0.55, 0.365]}>
        <boxGeometry args={[0.035, 0.28, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* Bottom dark kickplate */}
      <mesh position={[0, 0.05, 0.342]}>
        <boxGeometry args={[0.68, 0.08, 0.01]} />
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </mesh>
      {/* Tiny succulent perched on top */}
      <mesh position={[0.16, 1.18, -0.05]} castShadow>
        <cylinderGeometry args={[0.08, 0.065, 0.12, 10]} />
        <meshStandardMaterial color="#c97450" roughness={0.8} />
      </mesh>
      <mesh position={[0.16, 1.29, -0.05]} castShadow>
        <dodecahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#52a46c" roughness={0.75} />
      </mesh>
    </group>
  );
}

function EspressoMachine({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, -0.04]} castShadow>
        <boxGeometry args={[0.52, 0.5, 0.42]} />
        <meshStandardMaterial color="#334155" metalness={0.35} roughness={0.4} />
      </mesh>
      {/* Brushed steel front faceplate */}
      <mesh position={[0, 0.27, 0.175]}>
        <boxGeometry args={[0.44, 0.38, 0.02]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.55} roughness={0.3} />
      </mesh>
      {/* Drip tray */}
      <mesh position={[0, 0.04, 0.22]}>
        <boxGeometry args={[0.42, 0.06, 0.16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.25} />
      </mesh>
      {/* Grouphead & portafilter handle */}
      <mesh position={[-0.08, 0.26, 0.23]}>
        <cylinderGeometry args={[0.055, 0.055, 0.07, 12]} />
        <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[-0.08, 0.25, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.16, 8]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} />
      </mesh>
      {/* Warm power indicator LED */}
      <mesh position={[0.14, 0.4, 0.19]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={0.9} />
      </mesh>
      {/* Warming cup on top */}
      <mesh position={[0.1, 0.56, -0.05]} castShadow>
        <cylinderGeometry args={[0.06, 0.052, 0.12, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Theme 1: ENGINEERING (Server Rack, Status Dashboard TV, Kanban, Filing)
 * ========================================================================== */

const SERVER_LED_CONFIG: Array<{
  y: number;
  x: number;
  color: string;
  speed: number;
  phase: number;
}> = [
  { y: 1.78, x: -0.24, color: '#10b981', speed: 3.1, phase: 0.2 },
  { y: 1.78, x: -0.14, color: '#38bdf8', speed: 4.7, phase: 1.1 },
  { y: 1.5, x: -0.24, color: '#10b981', speed: 2.3, phase: 2.0 },
  { y: 1.5, x: -0.14, color: '#f59e0b', speed: 5.4, phase: 0.7 },
  { y: 1.22, x: -0.24, color: '#38bdf8', speed: 3.9, phase: 1.6 },
  { y: 1.22, x: -0.14, color: '#10b981', speed: 2.8, phase: 2.9 },
  { y: 0.94, x: -0.24, color: '#10b981', speed: 4.3, phase: 0.4 },
  { y: 0.94, x: -0.14, color: '#38bdf8', speed: 6.1, phase: 1.8 },
  { y: 0.66, x: -0.24, color: '#f59e0b', speed: 3.4, phase: 2.4 },
  { y: 0.66, x: -0.14, color: '#10b981', speed: 5.0, phase: 0.9 },
  { y: 0.38, x: -0.24, color: '#10b981', speed: 2.6, phase: 1.4 },
  { y: 0.38, x: -0.14, color: '#38bdf8', speed: 4.1, phase: 3.1 },
];

function ServerRack42U({ position }: { position: [number, number, number] }) {
  const ledMatRefs = useRef<Array<THREE.MeshStandardMaterial | null>>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < SERVER_LED_CONFIG.length; i++) {
      const mat = ledMatRefs.current[i];
      if (!mat) continue;
      const cfg = SERVER_LED_CONFIG[i];
      const wave = Math.sin(t * cfg.speed + cfg.phase);
      mat.emissiveIntensity = wave > -0.15 ? 1.35 : 0.18;
    }
  });

  const bladeYs = [1.78, 1.5, 1.22, 0.94, 0.66, 0.38];

  return (
    <group position={position}>
      {/* Main dark-slate 42U cabinet */}
      <mesh position={[0, 1.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.88, 2.04, 0.78]} />
        <meshStandardMaterial color="#1e293b" metalness={0.35} roughness={0.48} />
      </mesh>
      {/* Top chamfered exhaust cap */}
      <mesh position={[0, 2.09, 0]} castShadow>
        <boxGeometry args={[0.92, 0.07, 0.82]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.45} />
      </mesh>
      {/* Recessed front bay */}
      <mesh position={[0, 1.05, 0.37]}>
        <boxGeometry args={[0.74, 1.84, 0.06]} />
        <meshStandardMaterial color="#0f172a" roughness={0.75} />
      </mesh>
      {/* 6 stacked server blades */}
      {bladeYs.map((by) => (
        <group key={by} position={[0, by, 0.405]}>
          <mesh>
            <boxGeometry args={[0.68, 0.21, 0.025]} />
            <meshStandardMaterial color="#273449" metalness={0.35} roughness={0.5} />
          </mesh>
          {/* Vent grille bar on right side of blade */}
          <mesh position={[0.14, 0, 0.015]}>
            <boxGeometry args={[0.3, 0.09, 0.008]} />
            <meshStandardMaterial color="#111827" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Animated status LEDs */}
      {SERVER_LED_CONFIG.map((led, idx) => (
        <mesh key={idx} position={[led.x, led.y, 0.425]}>
          <boxGeometry args={[0.045, 0.032, 0.014]} />
          <meshStandardMaterial
            ref={(el) => {
              ledMatRefs.current[idx] = el;
            }}
            color={led.color}
            emissive={led.color}
            emissiveIntensity={0.9}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}

function StatusDashboardTV({ position }: { position: [number, number, number] }) {
  const barHeights = [0.22, 0.38, 0.3, 0.52, 0.44, 0.6];
  const barColors = ['#38bdf8', '#34d399', '#38bdf8', '#10b981', '#fbbf24', '#a78bfa'];

  return (
    <group position={position}>
      {/* Slim dark TV bezel */}
      <mesh castShadow>
        <boxGeometry args={[2.16, 1.24, 0.07]} />
        <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* Deep navy monitor screen */}
      <mesh position={[0, 0, 0.038]}>
        <planeGeometry args={[2.02, 1.1]} />
        <meshStandardMaterial color="#0f172a" emissive="#0f172a" emissiveIntensity={0.25} roughness={0.3} />
      </mesh>
      {/* Top status bar + green live dot */}
      <mesh position={[0, 0.44, 0.043]}>
        <planeGeometry args={[1.88, 0.1]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
      <mesh position={[-0.84, 0.44, 0.047]}>
        <circleGeometry args={[0.028, 12]} />
        <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={1.1} />
      </mesh>
      {/* Left bar-chart panel */}
      <mesh position={[-0.45, -0.05, 0.042]}>
        <planeGeometry args={[0.96, 0.78]} />
        <meshStandardMaterial color="#172554" roughness={0.5} />
      </mesh>
      {barHeights.map((h, i) => (
        <mesh key={i} position={[-0.8 + i * 0.14, -0.4 + h / 2, 0.048]}>
          <planeGeometry args={[0.09, h]} />
          <meshStandardMaterial
            color={barColors[i]}
            emissive={barColors[i]}
            emissiveIntensity={0.65}
            roughness={0.3}
          />
        </mesh>
      ))}
      {/* Right metric cards */}
      {[
        { y: 0.19, color: '#10b981', fillW: 0.62 },
        { y: -0.05, color: '#38bdf8', fillW: 0.5 },
        { y: -0.29, color: '#f59e0b', fillW: 0.36 },
      ].map((card, i) => (
        <group key={i} position={[0.5, card.y, 0.043]}>
          <mesh>
            <planeGeometry args={[0.82, 0.2]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} />
          </mesh>
          <mesh position={[-0.36 + card.fillW / 2, -0.02, 0.005]}>
            <planeGeometry args={[card.fillW, 0.055]} />
            <meshStandardMaterial
              color={card.color}
              emissive={card.color}
              emissiveIntensity={0.75}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function KanbanWhiteboard({ position }: { position: [number, number, number] }) {
  const notes: Array<{ x: number; y: number; color: string }> = [
    { x: -0.82, y: 0.22, color: '#fde68a' },
    { x: -0.82, y: -0.1, color: '#fecdd3' },
    { x: -0.48, y: 0.2, color: '#fde68a' },
    { x: -0.02, y: 0.24, color: '#bfdbfe' },
    { x: 0.02, y: -0.08, color: '#ddd6fe' },
    { x: 0.62, y: 0.24, color: '#a7f3d0' },
    { x: 0.94, y: 0.22, color: '#a7f3d0' },
    { x: 0.65, y: -0.1, color: '#86efac' },
  ];

  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Warm wood frame */}
      <mesh castShadow>
        <boxGeometry args={[2.6, 1.42, 0.07]} />
        <meshStandardMaterial color="#d2b48c" roughness={0.7} />
      </mesh>
      {/* Clean white board surface */}
      <mesh position={[0, 0, 0.039]}>
        <planeGeometry args={[2.44, 1.26]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      {/* Column dividers */}
      <mesh position={[-0.3, -0.02, 0.043]}>
        <planeGeometry args={[0.018, 1.12]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0.36, -0.02, 0.043]}>
        <planeGeometry args={[0.018, 1.12]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      {/* Column header bars */}
      <mesh position={[-0.74, 0.5, 0.045]}>
        <planeGeometry args={[0.72, 0.09]} />
        <meshStandardMaterial color="#fcd34d" />
      </mesh>
      <mesh position={[0.03, 0.5, 0.045]}>
        <planeGeometry args={[0.56, 0.09]} />
        <meshStandardMaterial color="#93c5fd" />
      </mesh>
      <mesh position={[0.78, 0.5, 0.045]}>
        <planeGeometry args={[0.7, 0.09]} />
        <meshStandardMaterial color="#6ee7b7" />
      </mesh>
      {/* Sticky notes */}
      {notes.map((n, idx) => (
        <mesh key={idx} position={[n.x, n.y, 0.046]}>
          <planeGeometry args={[0.26, 0.24]} />
          <meshStandardMaterial color={n.color} roughness={0.8} />
        </mesh>
      ))}
      {/* Marker tray + markers */}
      <mesh position={[0, -0.73, 0.07]} castShadow>
        <boxGeometry args={[1.6, 0.045, 0.1]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[-0.35, -0.695, 0.08]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.18, 8]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[-0.1, -0.695, 0.08]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.18, 8]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
      <mesh position={[0.25, -0.69, 0.08]}>
        <boxGeometry args={[0.16, 0.045, 0.06]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
    </group>
  );
}

function WoodenFilingCabinet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Oak cabinet body */}
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.12, 0.58]} />
        <meshStandardMaterial color="#b98b5e" roughness={0.72} />
      </mesh>
      {/* Slightly darker top slab */}
      <mesh position={[0, 1.14, 0]} castShadow>
        <boxGeometry args={[1.56, 0.06, 0.62]} />
        <meshStandardMaterial color="#9c6f46" roughness={0.68} />
      </mesh>
      {/* 3 left filing drawers */}
      {[0.24, 0.58, 0.92].map((dy) => (
        <group key={dy} position={[-0.36, dy, 0.295]}>
          <mesh>
            <boxGeometry args={[0.66, 0.28, 0.025]} />
            <meshStandardMaterial color="#caa074" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.02, 0.022]}>
            <boxGeometry args={[0.18, 0.028, 0.022]} />
            <meshStandardMaterial color="#d4a359" metalness={0.55} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* Right open cubby shelves with colorful binders */}
      <mesh position={[0.37, 0.58, 0.16]}>
        <boxGeometry args={[0.64, 0.94, 0.28]} />
        <meshStandardMaterial color="#6f4e32" roughness={0.85} />
      </mesh>
      <mesh position={[0.37, 0.58, 0.17]}>
        <boxGeometry args={[0.64, 0.04, 0.29]} />
        <meshStandardMaterial color="#b98b5e" roughness={0.75} />
      </mesh>
      {[
        { x: 0.16, y: 0.82, h: 0.3, c: '#3b82f6' },
        { x: 0.26, y: 0.8, h: 0.26, c: '#10b981' },
        { x: 0.36, y: 0.83, h: 0.32, c: '#f59e0b' },
        { x: 0.48, y: 0.8, h: 0.27, c: '#ef4444' },
        { x: 0.2, y: 0.35, h: 0.3, c: '#6366f1' },
        { x: 0.32, y: 0.33, h: 0.26, c: '#f97316' },
        { x: 0.44, y: 0.36, h: 0.32, c: '#14b8a6' },
      ].map((b, i) => (
        <mesh key={i} position={[b.x, b.y, 0.24]} castShadow>
          <boxGeometry args={[0.08, b.h, 0.2]} />
          <meshStandardMaterial color={b.c} roughness={0.7} />
        </mesh>
      ))}
      {/* Stacked manuals + mini succulent on top */}
      <mesh position={[-0.35, 1.2, 0]} castShadow>
        <boxGeometry args={[0.38, 0.06, 0.28]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.75} />
      </mesh>
      <mesh position={[-0.33, 1.255, 0.02]} rotation={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[0.34, 0.05, 0.24]} />
        <meshStandardMaterial color="#60a5fa" roughness={0.7} />
      </mesh>
      <mesh position={[0.45, 1.24, -0.05]} castShadow>
        <cylinderGeometry args={[0.085, 0.068, 0.13, 10]} />
        <meshStandardMaterial color="#f2eadf" roughness={0.8} />
      </mesh>
      <mesh position={[0.45, 1.36, -0.05]} castShadow>
        <dodecahedronGeometry args={[0.11, 0]} />
        <meshStandardMaterial color="#4f9d69" roughness={0.75} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Theme 2: LOBBY (Sofa Lounge, Coffee Table, Coffee Bar, Bookshelf, Art)
 * ========================================================================== */

function CozySofaLounge({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Soft woven lounge rug */}
      <mesh position={[0.35, 0.014, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.028, 2.75]} />
        <meshStandardMaterial color="#efe6d8" roughness={0.95} />
      </mesh>
      <mesh position={[0.35, 0.011, 0]}>
        <boxGeometry args={[3.52, 0.02, 2.87]} />
        <meshStandardMaterial color="#d4ddd5" roughness={0.95} />
      </mesh>

      {/* 2-seater sage fabric sofa facing +X */}
      <group position={[-0.78, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {/* Tapered oak legs */}
        {[-0.96, 0.96].map((lx) =>
          [-0.34, 0.34].map((lz) => (
            <mesh key={`${lx}-${lz}`} position={[lx, 0.09, lz]} castShadow>
              <cylinderGeometry args={[0.032, 0.022, 0.18, 8]} />
              <meshStandardMaterial color="#8c623d" roughness={0.75} />
            </mesh>
          )),
        )}
        {/* Sofa base frame */}
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.22, 0.18, 0.88]} />
          <meshStandardMaterial color="#5c7e68" roughness={0.9} />
        </mesh>
        {/* Two plush seat cushions */}
        <mesh position={[-0.47, 0.42, 0.04]} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.19, 0.76]} />
          <meshStandardMaterial color="#739980" roughness={0.92} />
        </mesh>
        <mesh position={[0.47, 0.42, 0.04]} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.19, 0.76]} />
          <meshStandardMaterial color="#739980" roughness={0.92} />
        </mesh>
        {/* Supportive backrest */}
        <mesh position={[0, 0.68, -0.32]} castShadow receiveShadow>
          <boxGeometry args={[2.16, 0.56, 0.24]} />
          <meshStandardMaterial color="#648870" roughness={0.92} />
        </mesh>
        {/* Padded armrests */}
        <mesh position={[-1.02, 0.52, 0]} castShadow>
          <boxGeometry args={[0.2, 0.44, 0.88]} />
          <meshStandardMaterial color="#648870" roughness={0.92} />
        </mesh>
        <mesh position={[1.02, 0.52, 0]} castShadow>
          <boxGeometry args={[0.2, 0.44, 0.88]} />
          <meshStandardMaterial color="#648870" roughness={0.92} />
        </mesh>
        {/* Accent throw pillows (terracotta & ochre) */}
        <mesh position={[-0.72, 0.64, -0.08]} rotation={[0.16, 0.28, 0.18]} castShadow>
          <boxGeometry args={[0.34, 0.32, 0.14]} />
          <meshStandardMaterial color="#d47958" roughness={0.9} />
        </mesh>
        <mesh position={[0.72, 0.63, -0.06]} rotation={[0.15, -0.25, -0.15]} castShadow>
          <boxGeometry args={[0.32, 0.3, 0.14]} />
          <meshStandardMaterial color="#eab657" roughness={0.9} />
        </mesh>
      </group>

      {/* Oak coffee table with mini laptop & magazines */}
      <group position={[0.72, 0, 0]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.84, 0.06, 1.34]} />
          <meshStandardMaterial color="#c99b6b" roughness={0.68} />
        </mesh>
        {/* Lower shelf */}
        <mesh position={[0, 0.16, 0]} receiveShadow>
          <boxGeometry args={[0.7, 0.035, 1.12]} />
          <meshStandardMaterial color="#b58657" roughness={0.75} />
        </mesh>
        {[-0.34, 0.34].map((lx) =>
          [-0.56, 0.56].map((lz) => (
            <mesh key={`${lx}-${lz}`} position={[lx, 0.21, lz]} castShadow>
              <cylinderGeometry args={[0.03, 0.024, 0.42, 8]} />
              <meshStandardMaterial color="#9e7147" roughness={0.72} />
            </mesh>
          )),
        )}
        {/* Mini open laptop */}
        <group position={[0.02, 0.46, -0.24]} rotation={[0, -0.3, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.34, 0.02, 0.24]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.11, -0.12]} rotation={[-0.25, 0, 0]} castShadow>
            <boxGeometry args={[0.34, 0.22, 0.018]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.45} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.11, -0.108]} rotation={[-0.25, 0, 0]}>
            <planeGeometry args={[0.3, 0.18]} />
            <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={0.4} />
          </mesh>
        </group>
        {/* Magazine stack */}
        <mesh position={[-0.08, 0.465, 0.32]} rotation={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[0.3, 0.03, 0.22]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.7} />
        </mesh>
        <mesh position={[-0.06, 0.495, 0.33]} rotation={[0, -0.08, 0]} castShadow>
          <boxGeometry args={[0.28, 0.025, 0.2]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.65} />
        </mesh>
        {/* Ceramic mug */}
        <mesh position={[0.2, 0.51, 0.25]} castShadow>
          <cylinderGeometry args={[0.055, 0.048, 0.11, 10]} />
          <meshStandardMaterial color="#d47958" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function CoffeeBarCounter({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Warm mat */}
      <mesh position={[0, 0.015, 0.52]} receiveShadow>
        <boxGeometry args={[2.64, 0.03, 2.05]} />
        <meshStandardMaterial color="#efe3d2" roughness={0.95} />
      </mesh>
      {/* Oak base cabinet */}
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.25, 0.96, 0.85]} />
        <meshStandardMaterial color="#8f6342" roughness={0.72} />
      </mesh>
      {/* Shaker front panels */}
      {[-0.68, 0, 0.68].map((px) => (
        <group key={px} position={[px, 0.48, 0.43]}>
          <mesh>
            <boxGeometry args={[0.58, 0.72, 0.02]} />
            <meshStandardMaterial color="#a0714d" roughness={0.75} />
          </mesh>
          <mesh position={[0.2, 0.12, 0.022]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#e2b462" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* Cream quartz countertop */}
      <mesh position={[0, 0.99, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.36, 0.08, 0.94]} />
        <meshStandardMaterial color="#fff9f0" roughness={0.48} />
      </mesh>
      {/* Espresso machine */}
      <EspressoMachine position={[-0.58, 1.03, -0.05]} />
      {/* Colorful ceramic mugs */}
      <mesh position={[0.24, 1.11, 0.12]} castShadow>
        <cylinderGeometry args={[0.072, 0.064, 0.15, 12]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.4} />
      </mesh>
      <mesh position={[0.46, 1.11, -0.04]} castShadow>
        <cylinderGeometry args={[0.072, 0.064, 0.15, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} />
      </mesh>
      <mesh position={[0.66, 1.11, 0.14]} castShadow>
        <cylinderGeometry args={[0.072, 0.064, 0.15, 12]} />
        <meshStandardMaterial color="#6f947c" roughness={0.4} />
      </mesh>
      {/* Coffee bean canister */}
      <mesh position={[0.88, 1.16, -0.14]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.25, 12]} />
        <meshStandardMaterial color="#785233" roughness={0.6} />
      </mesh>
      <mesh position={[0.88, 1.29, -0.14]}>
        <cylinderGeometry args={[0.106, 0.106, 0.03, 12]} />
        <meshStandardMaterial color="#d4a359" roughness={0.4} />
      </mesh>
    </group>
  );
}

function TallBookshelf({ position }: { position: [number, number, number] }) {
  const rows: Array<{
    y: number;
    books: Array<{ x: number; w: number; h: number; c: string; tilt?: number }>;
  }> = [
    {
      y: 1.65,
      books: [
        { x: -0.56, w: 0.08, h: 0.3, c: '#d47958' },
        { x: -0.45, w: 0.09, h: 0.27, c: '#3b82f6' },
        { x: -0.34, w: 0.07, h: 0.32, c: '#eab308' },
        { x: -0.22, w: 0.08, h: 0.26, c: '#6f947c', tilt: -0.14 },
        { x: 0.25, w: 0.09, h: 0.31, c: '#8b5cf6' },
        { x: 0.37, w: 0.08, h: 0.28, c: '#f97316' },
        { x: 0.49, w: 0.08, h: 0.3, c: '#0ea5e9' },
      ],
    },
    {
      y: 1.2,
      books: [
        { x: -0.58, w: 0.09, h: 0.28, c: '#10b981' },
        { x: -0.46, w: 0.08, h: 0.32, c: '#f43f5e' },
        { x: -0.35, w: 0.09, h: 0.26, c: '#f59e0b' },
        { x: -0.23, w: 0.08, h: 0.3, c: '#1e3a8a' },
        { x: -0.12, w: 0.07, h: 0.29, c: '#f2eadf' },
        { x: 0.34, w: 0.08, h: 0.27, c: '#6366f1', tilt: 0.16 },
        { x: 0.48, w: 0.09, h: 0.31, c: '#d97706' },
      ],
    },
    {
      y: 0.75,
      books: [
        { x: -0.54, w: 0.09, h: 0.31, c: '#0d9488' },
        { x: -0.42, w: 0.08, h: 0.26, c: '#e11d48' },
        { x: -0.31, w: 0.08, h: 0.29, c: '#ca8a04' },
        { x: 0.14, w: 0.08, h: 0.3, c: '#2563eb' },
        { x: 0.26, w: 0.09, h: 0.27, c: '#16a34a' },
        { x: 0.38, w: 0.08, h: 0.32, c: '#ea580c' },
        { x: 0.5, w: 0.08, h: 0.28, c: '#7c3aed' },
      ],
    },
    {
      y: 0.3,
      books: [
        { x: -0.52, w: 0.1, h: 0.3, c: '#64748b' },
        { x: -0.39, w: 0.1, h: 0.28, c: '#b45309' },
        { x: -0.26, w: 0.09, h: 0.31, c: '#047857' },
        { x: 0.28, w: 0.1, h: 0.29, c: '#be123c' },
        { x: 0.42, w: 0.1, h: 0.31, c: '#1d4ed8' },
      ],
    },
  ];

  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Back panel */}
      <mesh position={[0, 1.08, -0.22]} castShadow receiveShadow>
        <boxGeometry args={[1.66, 2.16, 0.06]} />
        <meshStandardMaterial color="#8c623d" roughness={0.8} />
      </mesh>
      {/* Side panels */}
      <mesh position={[-0.81, 1.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 2.16, 0.5]} />
        <meshStandardMaterial color="#ae8055" roughness={0.72} />
      </mesh>
      <mesh position={[0.81, 1.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 2.16, 0.5]} />
        <meshStandardMaterial color="#ae8055" roughness={0.72} />
      </mesh>
      {/* Horizontal shelves */}
      {[0.1, 0.55, 1.0, 1.45, 1.9, 2.14].map((sy) => (
        <mesh key={sy} position={[0, sy, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.66, 0.06, 0.5]} />
          <meshStandardMaterial color="#ba8c60" roughness={0.72} />
        </mesh>
      ))}
      {/* Colorful books across bays */}
      {rows.map((row) =>
        row.books.map((b, idx) => (
          <mesh
            key={`${row.y}-${idx}`}
            position={[b.x, row.y + (b.h - 0.3) / 2, 0.02]}
            rotation={[0, 0, b.tilt ?? 0]}
            castShadow
          >
            <boxGeometry args={[b.w, b.h, 0.32]} />
            <meshStandardMaterial color={b.c} roughness={0.72} />
          </mesh>
        )),
      )}
      {/* Top decor plant + ceramic vase */}
      <mesh position={[-0.45, 2.26, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.075, 0.16, 10]} />
        <meshStandardMaterial color="#f2eadf" roughness={0.7} />
      </mesh>
      <mesh position={[-0.45, 2.4, 0]} castShadow>
        <dodecahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color="#4f9d69" roughness={0.75} />
      </mesh>
      <mesh position={[0.42, 2.28, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 0.22, 12]} />
        <meshStandardMaterial color="#d47958" roughness={0.65} />
      </mesh>
    </group>
  );
}

function MinimalistArtPrints({ position }: { position: [number, number, number] }) {
  const frames = [
    { x: -0.82, accent: '#d47958', shape: 'arch' as const },
    { x: 0, accent: '#6f947c', shape: 'circle' as const },
    { x: 0.82, accent: '#eab308', shape: 'duo' as const },
  ];

  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {frames.map((f, idx) => (
        <group key={idx} position={[f.x, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.66, 0.86, 0.05]} />
            <meshStandardMaterial color="#b98b5e" roughness={0.68} />
          </mesh>
          <mesh position={[0, 0, 0.028]}>
            <planeGeometry args={[0.56, 0.76]} />
            <meshStandardMaterial color="#fdfaf4" roughness={0.85} />
          </mesh>
          {f.shape === 'arch' && (
            <>
              <mesh position={[0, -0.06, 0.032]}>
                <planeGeometry args={[0.3, 0.34]} />
                <meshStandardMaterial color={f.accent} roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.11, 0.032]}>
                <circleGeometry args={[0.15, 16]} />
                <meshStandardMaterial color={f.accent} roughness={0.8} />
              </mesh>
            </>
          )}
          {f.shape === 'circle' && (
            <>
              <mesh position={[0, 0.06, 0.032]}>
                <circleGeometry args={[0.18, 18]} />
                <meshStandardMaterial color={f.accent} roughness={0.8} />
              </mesh>
              <mesh position={[0, -0.18, 0.032]}>
                <planeGeometry args={[0.34, 0.05]} />
                <meshStandardMaterial color="#334155" roughness={0.8} />
              </mesh>
            </>
          )}
          {f.shape === 'duo' && (
            <>
              <mesh position={[-0.08, 0.1, 0.032]}>
                <circleGeometry args={[0.14, 16]} />
                <meshStandardMaterial color={f.accent} roughness={0.8} />
              </mesh>
              <mesh position={[0.08, -0.1, 0.032]}>
                <planeGeometry args={[0.24, 0.24]} />
                <meshStandardMaterial color="#64748b" roughness={0.8} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

/* ============================================================================
 * Theme 3: CREATIVE (Round Collab Table + 3 Chairs, Moodboard, Open Shelves)
 * ========================================================================== */

function StudioChair({
  position,
  rotationY,
  color,
}: {
  position: [number, number, number];
  rotationY: number;
  color: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 4 oak legs */}
      {[-0.17, 0.17].map((lx) =>
        [-0.17, 0.17].map((lz) => (
          <mesh key={`${lx}-${lz}`} position={[lx, 0.22, lz]} castShadow>
            <cylinderGeometry args={[0.022, 0.018, 0.44, 8]} />
            <meshStandardMaterial color="#c49a6c" roughness={0.72} />
          </mesh>
        )),
      )}
      {/* Molded colorful seat */}
      <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.065, 0.42]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      {/* Curved-feel backrest */}
      <mesh position={[0, 0.72, -0.18]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.42, 0.46, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
    </group>
  );
}

function RoundCollabZone({ position }: { position: [number, number, number] }) {
  const chairs = [
    { angle: -Math.PI * 0.8, color: '#e07a5f' },
    { angle: -Math.PI * 0.15, color: '#eab308' },
    { angle: Math.PI * 0.55, color: '#2a9d8f' },
  ];

  return (
    <group position={position}>
      {/* Soft pastel round studio rug */}
      <mesh position={[0, 0.014, 0]} receiveShadow>
        <cylinderGeometry args={[1.92, 1.92, 0.028, 32]} />
        <meshStandardMaterial color="#ece5f3" roughness={0.95} />
      </mesh>
      {/* Round oak collaboration table */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.96, 0.96, 0.07, 28]} />
        <meshStandardMaterial color="#d2a575" roughness={0.66} />
      </mesh>
      {/* 4 splayed table legs */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a, idx) => (
        <mesh
          key={idx}
          position={[Math.cos(a) * 0.52, 0.37, Math.sin(a) * 0.52]}
          rotation={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]}
          castShadow
        >
          <cylinderGeometry args={[0.035, 0.028, 0.74, 8]} />
          <meshStandardMaterial color="#ad7f52" roughness={0.72} />
        </mesh>
      ))}
      {/* Sketchbooks, pencil cup & mug on table */}
      <group position={[-0.26, 0.785, 0.14]} rotation={[0, 0.35, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.38, 0.025, 0.28]} />
          <meshStandardMaterial color="#ffffff" roughness={0.85} />
        </mesh>
        <mesh position={[-0.08, 0.016, 0]}>
          <planeGeometry args={[0.14, 0.16]} />
          <meshStandardMaterial color="#fde68a" />
        </mesh>
        <mesh position={[0.09, 0.016, 0.02]}>
          <planeGeometry args={[0.12, 0.12]} />
          <meshStandardMaterial color="#93c5fd" />
        </mesh>
      </group>
      <mesh position={[0.28, 0.785, -0.18]} rotation={[0, -0.4, 0]} castShadow>
        <boxGeometry args={[0.32, 0.025, 0.24]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.85} />
      </mesh>
      {/* Pencil cup with colored pencils */}
      <mesh position={[0.04, 0.84, -0.04]} castShadow>
        <cylinderGeometry args={[0.06, 0.052, 0.13, 10]} />
        <meshStandardMaterial color="#f2eadf" roughness={0.7} />
      </mesh>
      {['#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map((c, idx) => (
        <mesh
          key={c}
          position={[0.04 + (idx - 1.5) * 0.018, 0.93, -0.04 + (idx % 2) * 0.015]}
          rotation={[0.12 * (idx - 1.5), 0, 0.1 * (idx - 1.5)]}
        >
          <cylinderGeometry args={[0.008, 0.008, 0.14, 6]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
      {/* Tabletop ceramic mug */}
      <mesh position={[-0.22, 0.835, -0.32]} castShadow>
        <cylinderGeometry args={[0.055, 0.048, 0.11, 10]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.4} />
      </mesh>

      {/* 3 colorful studio chairs tucked around the table */}
      {chairs.map((ch, idx) => {
        const radius = 1.2;
        const cx = Math.cos(ch.angle) * radius;
        const cz = Math.sin(ch.angle) * radius;
        const faceCenter = Math.atan2(-cx, -cz);
        return (
          <StudioChair
            key={idx}
            position={[cx, 0, cz]}
            rotationY={faceCenter}
            color={ch.color}
          />
        );
      })}
    </group>
  );
}

function MoodboardPinboard({ position }: { position: [number, number, number] }) {
  const swatches = [
    { x: -0.95, y: 0.34, w: 0.36, h: 0.32, c: '#fef08a', rot: 0.06 },
    { x: -0.5, y: 0.32, w: 0.34, h: 0.42, c: '#ffffff', rot: -0.05 },
    { x: -0.04, y: 0.36, w: 0.4, h: 0.3, c: '#fecdd3', rot: 0.04 },
    { x: 0.48, y: 0.3, w: 0.36, h: 0.38, c: '#bfdbfe', rot: -0.07 },
    { x: 0.94, y: 0.32, w: 0.34, h: 0.32, c: '#a7f3d0', rot: 0.05 },
    { x: -0.84, y: -0.18, w: 0.42, h: 0.34, c: '#ddd6fe', rot: -0.04 },
    { x: -0.32, y: -0.2, w: 0.38, h: 0.3, c: '#fed7aa', rot: 0.07 },
    { x: 0.22, y: -0.16, w: 0.46, h: 0.36, c: '#ffffff', rot: -0.03 },
    { x: 0.82, y: -0.22, w: 0.38, h: 0.34, c: '#fde68a', rot: 0.06 },
  ];

  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Walnut frame */}
      <mesh castShadow>
        <boxGeometry args={[2.65, 1.48, 0.065]} />
        <meshStandardMaterial color="#875d3c" roughness={0.72} />
      </mesh>
      {/* Warm cork board backing */}
      <mesh position={[0, 0, 0.036]}>
        <planeGeometry args={[2.5, 1.32]} />
        <meshStandardMaterial color="#cfa275" roughness={0.94} />
      </mesh>
      {/* Pinned moodboard cards & swatches */}
      {swatches.map((s, idx) => (
        <group key={idx} position={[s.x, s.y, 0.044]} rotation={[0, 0, s.rot]}>
          <mesh>
            <planeGeometry args={[s.w, s.h]} />
            <meshStandardMaterial color={s.c} roughness={0.82} />
          </mesh>
          {/* Brass push-pin */}
          <mesh position={[0, s.h / 2 - 0.035, 0.01]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function GeometricPosters({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Poster 1: Coral & Navy Bauhaus */}
      <group position={[-0.56, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.92, 1.18, 0.05]} />
          <meshStandardMaterial color="#334155" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.028]}>
          <planeGeometry args={[0.82, 1.08]} />
          <meshStandardMaterial color="#fffaf0" roughness={0.85} />
        </mesh>
        <mesh position={[-0.1, 0.18, 0.033]}>
          <circleGeometry args={[0.24, 20]} />
          <meshStandardMaterial color="#e07a5f" roughness={0.8} />
        </mesh>
        <mesh position={[0.14, -0.14, 0.033]}>
          <planeGeometry args={[0.36, 0.42]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.8} />
        </mesh>
        <mesh position={[-0.16, -0.26, 0.036]}>
          <circleGeometry args={[0.12, 16]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.8} />
        </mesh>
      </group>

      {/* Poster 2: Teal & Mustard abstract */}
      <group position={[0.56, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.92, 1.18, 0.05]} />
          <meshStandardMaterial color="#b98b5e" roughness={0.68} />
        </mesh>
        <mesh position={[0, 0, 0.028]}>
          <planeGeometry args={[0.82, 1.08]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.22, 0.033]}>
          <planeGeometry args={[0.56, 0.22]} />
          <meshStandardMaterial color="#2a9d8f" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.06, 0.033]}>
          <circleGeometry args={[0.2, 20]} />
          <meshStandardMaterial color="#eab308" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.34, 0.033]}>
          <planeGeometry args={[0.42, 0.14]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

function OpenShelvingUnit({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Matte-charcoal vertical upright frames */}
      {[-0.88, 0.88].map((ux) =>
        [-0.22, 0.22].map((uz) => (
          <mesh key={`${ux}-${uz}`} position={[ux, 1.02, uz]} castShadow>
            <boxGeometry args={[0.045, 2.04, 0.045]} />
            <meshStandardMaterial color="#334155" metalness={0.35} roughness={0.5} />
          </mesh>
        )),
      )}
      {/* 4 airy oak shelves */}
      {[0.24, 0.78, 1.32, 1.86].map((sy) => (
        <mesh key={sy} position={[0, sy, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.82, 0.05, 0.5]} />
          <meshStandardMaterial color="#c99b6b" roughness={0.68} />
        </mesh>
      ))}

      {/* Top shelf: Golden trophy + ceramic vase */}
      <group position={[-0.42, 1.9, 0]}>
        <mesh position={[0, 0.04, 0]} castShadow>
          <boxGeometry args={[0.16, 0.08, 0.16]} />
          <meshStandardMaterial color="#5c4033" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.025, 0.035, 0.1, 10]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.055, 0.15, 12]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.22} />
        </mesh>
      </group>
      <mesh position={[0.44, 2.01, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.11, 0.24, 12]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.65} />
      </mesh>

      {/* Third shelf: Small potted plant + art books */}
      <mesh position={[-0.52, 1.43, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.07, 0.16, 10]} />
        <meshStandardMaterial color="#f2eadf" roughness={0.75} />
      </mesh>
      <mesh position={[-0.52, 1.56, 0]} castShadow>
        <dodecahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color="#4f9d69" roughness={0.75} />
      </mesh>
      {[
        { x: 0.1, c: '#2a9d8f', h: 0.28 },
        { x: 0.22, c: '#eab308', h: 0.25 },
        { x: 0.34, c: '#e07a5f', h: 0.3 },
        { x: 0.46, c: '#6366f1', h: 0.27 },
      ].map((b, i) => (
        <mesh key={i} position={[b.x, 1.35 + b.h / 2, 0]} castShadow>
          <boxGeometry args={[0.09, b.h, 0.28]} />
          <meshStandardMaterial color={b.c} roughness={0.7} />
        </mesh>
      ))}

      {/* Second shelf: Stacked sketchbooks + globe/sculpture */}
      <mesh position={[-0.36, 0.85, 0]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.3]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.75} />
      </mesh>
      <mesh position={[-0.34, 0.92, 0]} rotation={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.36, 0.06, 0.26]} />
        <meshStandardMaterial color="#93c5fd" roughness={0.7} />
      </mesh>
      <mesh position={[0.42, 0.94, 0]} castShadow>
        <sphereGeometry args={[0.13, 14, 14]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.45} />
      </mesh>

      {/* Bottom shelf: Storage baskets */}
      <mesh position={[-0.42, 0.42, 0]} castShadow>
        <boxGeometry args={[0.56, 0.3, 0.38]} />
        <meshStandardMaterial color="#d8c3a5" roughness={0.9} />
      </mesh>
      <mesh position={[0.42, 0.42, 0]} castShadow>
        <boxGeometry args={[0.56, 0.3, 0.38]} />
        <meshStandardMaterial color="#d8c3a5" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Theme 4: PANTRY (Expanded Kitchen Island, Bistro Table + Stools, Mug Shelf)
 * ========================================================================== */

function PantryKitchenZone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Cozy woven pantry floor mat sized cleanly inside Back-Right Glass Room */}
      <mesh position={[0, 0.015, 1.25]} receiveShadow>
        <boxGeometry args={[3.7, 0.03, 3.6]} />
        <meshStandardMaterial color="#efe4d3" roughness={0.95} />
      </mesh>

      {/* Back counter cabinetry */}
      <group position={[-0.52, 0, 0]}>
        <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.35, 0.96, 0.84]} />
          <meshStandardMaterial color="#966945" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.99, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.46, 0.08, 0.92]} />
          <meshStandardMaterial color="#fffaf2" roughness={0.45} />
        </mesh>
        {/* Espresso machine */}
        <EspressoMachine position={[-0.74, 1.03, -0.05]} />
        {/* Stacked ceramic mugs */}
        <mesh position={[-0.08, 1.1, 0.1]} castShadow>
          <cylinderGeometry args={[0.072, 0.064, 0.14, 12]} />
          <meshStandardMaterial color="#e07a5f" roughness={0.4} />
        </mesh>
        <mesh position={[-0.08, 1.24, 0.1]} castShadow>
          <cylinderGeometry args={[0.07, 0.062, 0.13, 12]} />
          <meshStandardMaterial color="#fffbeb" roughness={0.4} />
        </mesh>
        <mesh position={[0.12, 1.1, -0.06]} castShadow>
          <cylinderGeometry args={[0.072, 0.064, 0.14, 12]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} />
        </mesh>
        {/* Microwave */}
        <group position={[0.68, 1.24, -0.04]}>
          <mesh castShadow>
            <boxGeometry args={[0.72, 0.42, 0.48]} />
            <meshStandardMaterial color="#e7e5e4" roughness={0.45} />
          </mesh>
          {/* Dark glass door window */}
          <mesh position={[-0.08, 0, 0.244]}>
            <planeGeometry args={[0.44, 0.28]} />
            <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.3} />
          </mesh>
          {/* Control keypad + green timer LED */}
          <mesh position={[0.24, 0.07, 0.244]}>
            <planeGeometry args={[0.12, 0.06]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.65} />
          </mesh>
          <mesh position={[0.24, -0.06, 0.244]}>
            <planeGeometry args={[0.12, 0.14]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* Cream mini-fridge on right end */}
      <CreamMiniFridge position={[1.38, 0, 0.02]} />

      {/* Water dispenser along right interior wall facing west */}
      <group position={[1.48, 0, 1.85]} rotation={[0, -Math.PI / 2, 0]}>
        <WaterCooler position={[0, 0, 0]} />
      </group>

      {/* Front cafe kitchen island bar */}
      <group position={[-0.25, 0, 2.05]}>
        <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.95, 0.92, 0.72]} />
          <meshStandardMaterial color="#a4754d" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.955, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.08, 0.07, 0.84]} />
          <meshStandardMaterial color="#fffaf2" roughness={0.45} />
        </mesh>
        {/* Wooden fruit bowl with colorful fruit */}
        <mesh position={[-0.45, 1.06, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.13, 0.14, 14]} />
          <meshStandardMaterial color="#b47b49" roughness={0.7} />
        </mesh>
        <mesh position={[-0.51, 1.14, 0.04]} castShadow>
          <sphereGeometry args={[0.065, 10, 10]} />
          <meshStandardMaterial color="#ef4444" roughness={0.45} />
        </mesh>
        <mesh position={[-0.38, 1.14, -0.03]} castShadow>
          <sphereGeometry args={[0.065, 10, 10]} />
          <meshStandardMaterial color="#f97316" roughness={0.5} />
        </mesh>
        <mesh position={[-0.45, 1.16, -0.06]} castShadow>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#84cc16" roughness={0.45} />
        </mesh>
        {/* Cookie / pastry jar */}
        <mesh position={[0.42, 1.13, -0.04]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.26, 12]} />
          <meshStandardMaterial color="#fef3c7" transparent opacity={0.82} roughness={0.2} />
        </mesh>
        <mesh position={[0.42, 1.27, -0.04]}>
          <cylinderGeometry args={[0.115, 0.115, 0.035, 12]} />
          <meshStandardMaterial color="#a4754d" roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}

function WoodBistroStool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Round oak seat */}
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.21, 0.21, 0.055, 16]} />
        <meshStandardMaterial color="#c99b6b" roughness={0.68} />
      </mesh>
      {/* 4 angled wood legs */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a, idx) => (
        <mesh
          key={idx}
          position={[Math.cos(a) * 0.14, 0.26, Math.sin(a) * 0.14]}
          rotation={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]}
          castShadow
        >
          <cylinderGeometry args={[0.022, 0.018, 0.52, 8]} />
          <meshStandardMaterial color="#9e7147" roughness={0.72} />
        </mesh>
      ))}
      {/* Footrest ring */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15, 0.014, 8, 18]} />
        <meshStandardMaterial color="#875d3c" roughness={0.75} />
      </mesh>
    </group>
  );
}

function BistroCafeNook({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Soft woven bistro rug */}
      <mesh position={[0, 0.014, 0]} receiveShadow>
        <cylinderGeometry args={[1.68, 1.68, 0.028, 28]} />
        <meshStandardMaterial color="#f2e4d3" roughness={0.95} />
      </mesh>
      {/* Round bistro table */}
      <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.35, 0.05, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.39, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 0.7, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.68, 0.68, 0.06, 24]} />
        <meshStandardMaterial color="#fff9f0" roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.755, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.04, 24]} />
        <meshStandardMaterial color="#c99b6b" roughness={0.68} />
      </mesh>
      {/* Tiny centerpiece vase + 2 coffee cups */}
      <mesh position={[0, 0.87, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.065, 0.16, 10]} />
        <meshStandardMaterial color="#6f947c" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.99, 0]} castShadow>
        <dodecahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color="#4f9d69" roughness={0.75} />
      </mesh>
      <mesh position={[-0.28, 0.84, 0.12]} castShadow>
        <cylinderGeometry args={[0.055, 0.048, 0.11, 10]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.4} />
      </mesh>
      <mesh position={[0.28, 0.84, -0.12]} castShadow>
        <cylinderGeometry args={[0.055, 0.048, 0.11, 10]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.4} />
      </mesh>
      {/* 2 warm wood stools */}
      <WoodBistroStool position={[-0.86, 0, 0.25]} />
      <WoodBistroStool position={[0.86, 0, -0.25]} />
    </group>
  );
}

function FloatingMugShelf({ position }: { position: [number, number, number] }) {
  const mugColors = ['#e07a5f', '#f59e0b', '#ffffff', '#6f947c', '#60a5fa'];

  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Two floating oak shelves */}
      {[0, 0.56].map((sy) => (
        <group key={sy} position={[0, sy, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.15, 0.065, 0.34]} />
            <meshStandardMaterial color="#be9063" roughness={0.68} />
          </mesh>
          {/* Brass brackets */}
          {[-0.78, 0.78].map((bx) => (
            <mesh key={bx} position={[bx, -0.09, -0.08]}>
              <boxGeometry args={[0.04, 0.14, 0.16]} />
              <meshStandardMaterial color="#d4a359" metalness={0.55} roughness={0.35} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Bottom shelf: row of 5 colorful ceramic mugs */}
      {mugColors.map((c, idx) => (
        <mesh key={c} position={[-0.76 + idx * 0.38, 0.11, 0.02]} castShadow>
          <cylinderGeometry args={[0.068, 0.06, 0.15, 10]} />
          <meshStandardMaterial color={c} roughness={0.38} />
        </mesh>
      ))}
      {/* Top shelf: coffee jars + mini herb pots */}
      {[-0.62, -0.26, 0.12].map((jx, idx) => (
        <group key={jx} position={[jx, 0.72, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.24, 12]} />
            <meshStandardMaterial
              color={idx === 1 ? '#fef3c7' : '#d6c2a5'}
              roughness={0.55}
            />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.095, 0.095, 0.03, 12]} />
            <meshStandardMaterial color="#7c5638" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Mini trailing herb pots on right side of top shelf */}
      {[0.54, 0.84].map((px, idx) => (
        <group key={px} position={[px, 0.66, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.065, 0.13, 10]} />
            <meshStandardMaterial color={idx === 0 ? '#c97450' : '#f2eadf'} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.12, 0]} castShadow>
            <dodecahedronGeometry args={[0.11, 0]} />
            <meshStandardMaterial color={idx === 0 ? '#4f9d69' : '#63b57d'} roughness={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ============================================================================
 * Dedicated Engineering Floor Rooms:
 * 1. EngineeringServerRoom (Back-Right Glass Room: x in [9.0, 13.5], z in [-11.3, -2.8])
 * 2. EngineeringPantryZone (Front-Left Glass Room: x in [-13.5, -8.8], z in [2.8, 11.2])
 * 3. CozyRestRoomZone      (Front-Right Glass Room: x in [9.0, 13.5], z in [2.8, 11.2])
 * ========================================================================== */

function EngineeringServerRoom() {
  const gridXs = [-1.2, -0.4, 0.4, 1.2];
  const gridZs = [-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7];

  return (
    <group>
      {/* Raised anti-static dark-slate data-center floor mat */}
      <group position={[11.25, 0, -7.2]}>
        <mesh position={[0, 0.015, 0]} receiveShadow>
          <boxGeometry args={[4.0, 0.028, 7.2]} />
          <meshStandardMaterial color="#1e293b" roughness={0.78} metalness={0.12} />
        </mesh>
        {/* Subtle raised-tile grid lines at y = 0.031 */}
        {gridXs.map((gx) => (
          <mesh key={`gx-${gx}`} position={[gx, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.025, 7.05]} />
            <meshStandardMaterial color="#334155" roughness={0.7} />
          </mesh>
        ))}
        {gridZs.map((gz) => (
          <mesh key={`gz-${gz}`} position={[0, 0.031, gz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.85, 0.025]} />
            <meshStandardMaterial color="#334155" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* 3 full-height 42U server racks along the North back wall */}
      <ServerRack42U position={[10.15, 0, -10.55]} />
      <ServerRack42U position={[11.25, 0, -10.55]} />
      <ServerRack42U position={[12.35, 0, -10.55]} />

      {/* Sleek overhead cable ladder tray connecting the 3 North racks */}
      <group position={[11.25, 2.24, -10.55]}>
        <mesh position={[0, 0, -0.18]} castShadow>
          <boxGeometry args={[3.1, 0.06, 0.04]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.18]} castShadow>
          <boxGeometry args={[3.1, 0.06, 0.04]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
        </mesh>
        {[-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35].map((rx) => (
          <mesh key={rx} position={[rx, -0.01, 0]}>
            <boxGeometry args={[0.035, 0.025, 0.36]} />
            <meshStandardMaterial color="#64748b" metalness={0.45} roughness={0.45} />
          </mesh>
        ))}
        {/* Fiber-optic conduit bundles resting on ladder tray */}
        <mesh position={[0, 0.02, -0.06]}>
          <boxGeometry args={[2.95, 0.032, 0.045]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.02, 0.05]}>
          <boxGeometry args={[2.95, 0.028, 0.04]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.45} />
        </mesh>
      </group>

      {/* 2 additional 42U server racks along the West interior glass wall facing East */}
      <group position={[9.75, 0, -8.35]} rotation={[0, Math.PI / 2, 0]}>
        <ServerRack42U position={[0, 0, 0]} />
      </group>
      <group position={[9.75, 0, -7.15]} rotation={[0, Math.PI / 2, 0]}>
        <ServerRack42U position={[0, 0, 0]} />
      </group>

      {/* Short overhead cable ladder tray above the 2 West racks */}
      <group position={[9.75, 2.24, -7.75]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.16]} castShadow>
          <boxGeometry args={[2.0, 0.055, 0.038]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.16]} castShadow>
          <boxGeometry args={[2.0, 0.055, 0.038]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
        </mesh>
        {[-0.75, -0.25, 0.25, 0.75].map((rx) => (
          <mesh key={rx} position={[rx, -0.01, 0]}>
            <boxGeometry args={[0.032, 0.022, 0.32]} />
            <meshStandardMaterial color="#64748b" metalness={0.45} roughness={0.45} />
          </mesh>
        ))}
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[1.9, 0.03, 0.05]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.4} />
        </mesh>
      </group>

      {/* Wall-mounted precision server AC cooling unit on solid wall header above Window #3 (y > 3.025) */}
      <group position={[11.25, 3.36, -11.85]}>
        <mesh castShadow>
          <boxGeometry args={[1.38, 0.42, 0.28]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </mesh>
        {/* Louvered air vent grille */}
        <mesh position={[-0.08, -0.08, 0.144]}>
          <boxGeometry args={[1.02, 0.12, 0.018]} />
          <meshStandardMaterial color="#334155" roughness={0.6} />
        </mesh>
        {/* Cool-blue precision cooling status LED */}
        <mesh position={[0.52, 0.07, 0.148]}>
          <sphereGeometry args={[0.028, 10, 10]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#0ea5e9"
            emissiveIntensity={1.25}
            roughness={0.2}
          />
        </mesh>
      </group>
    </group>
  );
}

function EngineeringPantryZone() {
  return (
    <group>
      {/* Soft woven pantry rug */}
      <mesh position={[-11.15, 0.015, 7.6]} receiveShadow>
        <boxGeometry args={[3.9, 0.028, 5.4]} />
        <meshStandardMaterial color="#efe4d3" roughness={0.95} />
      </mesh>

      {/* Base counter cabinetry + countertop along West wall */}
      <group position={[-13.18, 0, 7.0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.45, 0.96, 0.84]} />
          <meshStandardMaterial color="#966945" roughness={0.72} />
        </mesh>
        {/* Shaker cabinet doors */}
        {[-0.78, 0, 0.78].map((px) => (
          <group key={px} position={[px, 0.48, 0.425]}>
            <mesh>
              <boxGeometry args={[0.68, 0.74, 0.02]} />
              <meshStandardMaterial color="#a67750" roughness={0.74} />
            </mesh>
            <mesh position={[0.24, 0.12, 0.02]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#d4a359" metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        ))}
        {/* Cream stone countertop */}
        <mesh position={[0, 0.99, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.54, 0.08, 0.9]} />
          <meshStandardMaterial color="#fffaf2" roughness={0.45} />
        </mesh>
        {/* Espresso machine */}
        <EspressoMachine position={[-0.78, 1.03, -0.04]} />
        {/* Ceramic mugs & snack jar */}
        <mesh position={[-0.12, 1.1, 0.12]} castShadow>
          <cylinderGeometry args={[0.068, 0.06, 0.14, 10]} />
          <meshStandardMaterial color="#e07a5f" roughness={0.4} />
        </mesh>
        <mesh position={[0.06, 1.1, -0.02]} castShadow>
          <cylinderGeometry args={[0.068, 0.06, 0.14, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.35} />
        </mesh>
        <mesh position={[0.22, 1.14, -0.14]} castShadow>
          <cylinderGeometry args={[0.095, 0.095, 0.22, 12]} />
          <meshStandardMaterial color="#fef3c7" transparent opacity={0.82} roughness={0.2} />
        </mesh>
        <mesh position={[0.22, 1.26, -0.14]}>
          <cylinderGeometry args={[0.1, 0.1, 0.03, 12]} />
          <meshStandardMaterial color="#966945" roughness={0.65} />
        </mesh>
        {/* Microwave */}
        <group position={[0.78, 1.24, -0.04]}>
          <mesh castShadow>
            <boxGeometry args={[0.7, 0.42, 0.46]} />
            <meshStandardMaterial color="#e7e5e4" roughness={0.45} />
          </mesh>
          <mesh position={[-0.08, 0, 0.234]}>
            <planeGeometry args={[0.42, 0.28]} />
            <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.3} />
          </mesh>
          <mesh position={[0.23, 0.07, 0.234]}>
            <planeGeometry args={[0.11, 0.06]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.65} />
          </mesh>
        </group>
      </group>

      {/* Upper wall pantry cupboards ("lemari atas") above counter (clear of espresso warming cup) */}
      <group position={[-13.55, 2.12, 7.0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.38, 0.78, 0.42]} />
          <meshStandardMaterial color="#b08256" roughness={0.72} />
        </mesh>
        {[-0.86, -0.29, 0.29, 0.86].map((dx, idx) => (
          <group key={dx} position={[dx, 0, 0.218]}>
            <mesh>
              <boxGeometry args={[0.52, 0.7, 0.022]} />
              <meshStandardMaterial color="#c29466" roughness={0.7} />
            </mesh>
            <mesh position={[idx % 2 === 0 ? 0.18 : -0.18, -0.18, 0.02]}>
              <boxGeometry args={[0.024, 0.14, 0.024]} />
              <meshStandardMaterial color="#d4a359" metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Tall Pantry Storage Cupboard ("lemari pantry") */}
      <group position={[-13.15, 0, 9.25]} rotation={[0, Math.PI / 2, 0]}>
        {/* Main oak carcass */}
        <mesh position={[0, 1.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.24, 2.08, 0.6]} />
          <meshStandardMaterial color="#a6794f" roughness={0.72} />
        </mesh>
        {/* Lower double wooden cabinet doors */}
        {[-0.29, 0.29].map((dx, idx) => (
          <group key={dx} position={[dx, 0.5, 0.308]}>
            <mesh>
              <boxGeometry args={[0.54, 0.88, 0.024]} />
              <meshStandardMaterial color="#ba8c60" roughness={0.7} />
            </mesh>
            <mesh position={[idx === 0 ? 0.19 : -0.19, 0.14, 0.022]}>
              <sphereGeometry args={[0.024, 8, 8]} />
              <meshStandardMaterial color="#d4a359" metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        ))}
        {/* Upper recessed open/glass shelving bay with snack boxes & jars */}
        <mesh position={[0, 1.48, 0.16]}>
          <boxGeometry args={[1.1, 0.94, 0.32]} />
          <meshStandardMaterial color="#755235" roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.48, 0.18]}>
          <boxGeometry args={[1.12, 0.045, 0.34]} />
          <meshStandardMaterial color="#c29466" roughness={0.72} />
        </mesh>
        {/* Upper shelf jars & colorful boxes */}
        <mesh position={[-0.32, 1.66, 0.22]} castShadow>
          <boxGeometry args={[0.18, 0.24, 0.14]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.65} />
        </mesh>
        <mesh position={[-0.08, 1.64, 0.22]} castShadow>
          <boxGeometry args={[0.16, 0.2, 0.14]} />
          <meshStandardMaterial color="#60a5fa" roughness={0.65} />
        </mesh>
        <mesh position={[0.22, 1.64, 0.22]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.2, 10]} />
          <meshStandardMaterial color="#fef3c7" roughness={0.45} />
        </mesh>
        <mesh position={[-0.28, 1.18, 0.22]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.22, 10]} />
          <meshStandardMaterial color="#e07a5f" roughness={0.5} />
        </mesh>
        <mesh position={[0.04, 1.16, 0.22]} castShadow>
          <boxGeometry args={[0.24, 0.18, 0.16]} />
          <meshStandardMaterial color="#6f947c" roughness={0.65} />
        </mesh>
        <mesh position={[0.34, 1.15, 0.22]} castShadow>
          <cylinderGeometry args={[0.085, 0.075, 0.16, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.35} />
        </mesh>
      </group>

      {/* Water Dispenser & Mini Fridge along East glass wall facing West */}
      <group position={[-9.45, 0, 5.5]} rotation={[0, -Math.PI / 2, 0]}>
        <WaterCooler position={[0, 0, 0]} />
      </group>
      <group position={[-9.52, 0, 6.48]} rotation={[0, -Math.PI / 2, 0]}>
        <CreamMiniFridge position={[0, 0, 0]} />
      </group>

      {/* Pantry Dining Table + 2 Stools */}
      <group position={[-10.95, 0, 8.95]}>
        <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.05, 16]} />
          <meshStandardMaterial color="#334155" metalness={0.38} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.38, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.68, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.38} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.62, 0.62, 0.065, 24]} />
          <meshStandardMaterial color="#d2a575" roughness={0.65} />
        </mesh>
        {/* Wooden fruit bowl + 2 mugs on dining table */}
        <mesh position={[0, 0.82, -0.05]} castShadow>
          <cylinderGeometry args={[0.18, 0.11, 0.11, 12]} />
          <meshStandardMaterial color="#a4754d" roughness={0.7} />
        </mesh>
        <mesh position={[-0.05, 0.89, -0.04]} castShadow>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color="#ef4444" roughness={0.45} />
        </mesh>
        <mesh position={[0.05, 0.89, -0.07]} castShadow>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color="#84cc16" roughness={0.45} />
        </mesh>
        <mesh position={[-0.28, 0.82, 0.16]} castShadow>
          <cylinderGeometry args={[0.05, 0.044, 0.1, 10]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} />
        </mesh>
        <mesh position={[0.28, 0.82, 0.12]} castShadow>
          <cylinderGeometry args={[0.05, 0.044, 0.1, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.35} />
        </mesh>
        {/* 2 warm wood stools cleanly tucked with clear walkway */}
        <WoodBistroStool position={[-0.72, 0, 0.2]} />
        <WoodBistroStool position={[0.72, 0, -0.2]} />
      </group>

      {/* Corner potted plant inside Pantry */}
      <PottedPlant position={[-9.5, 0, 10.45]} scale={0.85} variant="terracotta" />
    </group>
  );
}

function CozyRestRoomZone() {
  return (
    <group>
      {/* Soft pastel sage/cream woven rug */}
      <mesh position={[11.25, 0.015, 7.9]} receiveShadow>
        <boxGeometry args={[3.8, 0.026, 5.2]} />
        <meshStandardMaterial color="#e5ece5" roughness={0.95} />
      </mesh>
      <mesh position={[11.25, 0.012, 7.9]}>
        <boxGeometry args={[3.94, 0.02, 5.34]} />
        <meshStandardMaterial color="#d4dfd5" roughness={0.95} />
      </mesh>

      {/* Cozy Nap Bed / Daybed (center [12.05, 0, 8.7], width 1.32, length 2.25) */}
      <group position={[12.05, 0, 8.7]}>
        {/* 4 warm oak legs */}
        {[-0.58, 0.58].map((lx) =>
          [-1.02, 1.02].map((lz) => (
            <mesh key={`${lx}-${lz}`} position={[lx, 0.12, lz]} castShadow>
              <boxGeometry args={[0.08, 0.24, 0.08]} />
              <meshStandardMaterial color="#9e7147" roughness={0.72} />
            </mesh>
          )),
        )}
        {/* Warm oak slatted bed frame */}
        <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.32, 0.14, 2.25]} />
          <meshStandardMaterial color="#be8f60" roughness={0.7} />
        </mesh>
        {/* Oak headboard at South end (z = 9.8 -> local z = +1.1) */}
        <mesh position={[0, 0.68, 1.1]} castShadow receiveShadow>
          <boxGeometry args={[1.36, 0.86, 0.09]} />
          <meshStandardMaterial color="#b38456" roughness={0.7} />
        </mesh>
        {/* Plush cream mattress */}
        <mesh position={[0, 0.46, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[1.24, 0.22, 2.12]} />
          <meshStandardMaterial color="#fffcf5" roughness={0.9} />
        </mesh>
        {/* Folded warm terracotta duvet blanket & sage accent throw */}
        <mesh position={[0, 0.52, -0.38]} castShadow receiveShadow>
          <boxGeometry args={[1.28, 0.16, 1.32]} />
          <meshStandardMaterial color="#d47958" roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.55, -0.78]} castShadow>
          <boxGeometry args={[1.3, 0.12, 0.42]} />
          <meshStandardMaterial color="#739980" roughness={0.92} />
        </mesh>
        {/* 2 fluffy pillows leaning against South headboard */}
        <mesh position={[-0.31, 0.68, 0.82]} rotation={[-0.32, 0.08, 0]} castShadow>
          <boxGeometry args={[0.54, 0.2, 0.34]} />
          <meshStandardMaterial color="#f5efe6" roughness={0.92} />
        </mesh>
        <mesh position={[0.31, 0.68, 0.82]} rotation={[-0.32, -0.08, 0]} castShadow>
          <boxGeometry args={[0.54, 0.2, 0.34]} />
          <meshStandardMaterial color="#efe6d8" roughness={0.92} />
        </mesh>
      </group>

      {/* Nightstand + Warm Glowing Bedside Lamp */}
      <group position={[10.82, 0, 9.45]}>
        <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 0.54, 0.48]} />
          <meshStandardMaterial color="#b98b5e" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.36, -0.245]}>
          <boxGeometry args={[0.42, 0.18, 0.02]} />
          <meshStandardMaterial color="#c99c6e" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.36, -0.265]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial color="#d4a359" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Ceramic bedside lamp with warm glow */}
        <mesh position={[0.06, 0.62, 0.04]} castShadow>
          <cylinderGeometry args={[0.075, 0.095, 0.16, 12]} />
          <meshStandardMaterial color="#f2eadf" roughness={0.6} />
        </mesh>
        <mesh position={[0.06, 0.8, 0.04]} castShadow>
          <cylinderGeometry args={[0.12, 0.17, 0.22, 16]} />
          <meshStandardMaterial
            color="#fff7e6"
            emissive="#fcd34d"
            emissiveIntensity={0.55}
            roughness={0.75}
          />
        </mesh>
        {/* Tiny mint alarm clock & book */}
        <mesh position={[-0.14, 0.6, -0.08]} castShadow>
          <boxGeometry args={[0.12, 0.11, 0.07]} />
          <meshStandardMaterial color="#6ee7b7" roughness={0.5} />
        </mesh>
        <mesh position={[-0.1, 0.555, 0.1]} rotation={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.2, 0.03, 0.15]} />
          <meshStandardMaterial color="#60a5fa" roughness={0.75} />
        </mesh>
      </group>

      {/* Plush Beanbag Lounge Chair near West glass wall */}
      <group position={[9.95, 0, 7.05]}>
        <mesh position={[0, 0.28, 0]} scale={[1.15, 0.72, 1.15]} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.48, 1]} />
          <meshStandardMaterial color="#769b82" roughness={0.95} />
        </mesh>
        <mesh position={[-0.16, 0.56, 0.06]} scale={[0.8, 0.9, 0.95]} castShadow>
          <dodecahedronGeometry args={[0.3, 1]} />
          <meshStandardMaterial color="#678a73" roughness={0.95} />
        </mesh>
        {/* Cozy mustard accent cushion */}
        <mesh position={[0.08, 0.44, -0.06]} rotation={[0.25, 0.3, -0.2]} castShadow>
          <boxGeometry args={[0.28, 0.24, 0.12]} />
          <meshStandardMaterial color="#eab657" roughness={0.9} />
        </mesh>
      </group>

      {/* Cozy Woven Blanket Basket */}
      <group position={[9.78, 0, 8.65]}>
        <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.21, 0.44, 14]} />
          <meshStandardMaterial color="#d2b48c" roughness={0.92} />
        </mesh>
        {/* Rolled cozy blankets peeking out */}
        <mesh position={[-0.06, 0.46, 0.04]} rotation={[0.2, 0.3, 0.25]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.24, 10]} />
          <meshStandardMaterial color="#f5efe6" roughness={0.95} />
        </mesh>
        <mesh position={[0.08, 0.45, -0.05]} rotation={[-0.18, 0.2, -0.2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.22, 10]} />
          <meshStandardMaterial color="#d47958" roughness={0.95} />
        </mesh>
      </group>

      {/* Rest Room potted plant */}
      <PottedPlant position={[12.85, 0, 4.35]} scale={0.85} variant="ceramic" />
    </group>
  );
}

/* ============================================================================
 * Main FloorDecor Component (Aligned to Fixed 28 x 24 Architectural Rooms)
 * - Front-Left Glass Room:    x in [-13.5, -8.8], z in [2.8, 11.2]
 * - Back-Right Glass Room:    x in [9.0, 13.5],   z in [-11.3, -2.8]
 * - Lift Lobby:               x in [-13.6, -9.2], z in [-11.3, -2.8]
 * - Front-Right Room/Terrace: x in [9.0, 13.5],   z in [2.8, 11.2]
 * ========================================================================== */

export const FloorDecor: React.FC<FloorDecorProps> = ({
  floorWidth,
  floorDepth,
  theme,
  floorIndex,
}) => {
  const halfW = floorWidth / 2;
  const halfD = floorDepth / 2;

  const { clockX } = useMemo(() => computeBackWallBays(floorWidth), [floorWidth]);

  // Lamp positioned in Front-Right Rest Room for engineering, Front-Left Glass Room otherwise
  const lampPos: [number, number, number] =
    theme === 'engineering'
      ? [9.6, 0, 10.25]
      : theme === 'creative'
        ? [-12.95, 0, 5.55]
        : theme === 'pantry'
          ? [-12.95, 0, 5.85]
          : [-12.95, 0, 6.05];

  // Trash bin tucked in Pantry SW corner for engineering (zero trash bins in Server Room!)
  const trashPos: [number, number, number] =
    theme === 'engineering' ? [-13.05, 0, 10.45] : [9.42, 0, -8.0];

  return (
    <group>
      {/* Shared cozy details across every floor */}
      <AnalogWallClock position={[clockX, 2.48, -halfD + 0.05]} floorIndex={floorIndex} />
      <StandingFloorLamp position={lampPos} />
      <OfficeTrashBin position={trashPos} />

      {/* Default Front-Right Reading & Plant Corner (hidden on engineering where Rest Room lives) */}
      {theme !== 'engineering' && (
        <>
          <PottedPlant
            position={[12.55, 0, 10.35]}
            scale={1.0}
            variant={theme === 'lobby' || theme === 'pantry' ? 'tall' : 'terracotta'}
          />
          <PottedPlant position={[12.6, 0, 8.9]} scale={0.78} variant="ceramic" />
          <WoodBistroStool position={[11.65, 0, 9.75]} />
        </>
      )}

      {/* Lift Lobby corner plant (clear of ElevatorCore & Suite 1 glass wall) */}
      <PottedPlant position={[-10.1, 0, -10.8]} scale={0.85} variant="ceramic" />

      {/* Theme-specific rich 3D office furniture */}
      {theme === 'engineering' && (
        <>
          {/* Dedicated Back-Right Glass Server Room (server equipment only) */}
          <EngineeringServerRoom />

          {/* Dedicated Front-Left Glass Engineering Pantry Room */}
          <EngineeringPantryZone />

          {/* Dedicated Front-Right Glass Cozy Rest / Nap Room */}
          <CozyRestRoomZone />

          {/* Back wall status dashboard TV inside Suite 2 (between sunlit windows) */}
          <StatusDashboardTV position={[6.95, 2.15, -halfD + 0.05]} />

          {/* Lift Lobby Kanban whiteboard */}
          <KanbanWhiteboard position={[-halfW + 0.05, 2.04, -6.2]} />
        </>
      )}

      {theme === 'lobby' && (
        <>
          {/* Front-Left Glass Lounge Room */}
          <CozySofaLounge position={[-11.5, 0, 8.2]} />
          <MinimalistArtPrints position={[-halfW + 0.05, 2.08, 8.2]} />

          {/* Back-Right Glass Coffee Bar Room */}
          <CoffeeBarCounter position={[10.95, 0, -10.45]} />
          <CreamMiniFridge position={[12.78, 0, -10.5]} />
          <PottedPlant position={[12.75, 0, -6.0]} scale={0.85} variant="ceramic" />

          {/* Lift Lobby Tall Bookshelf */}
          <TallBookshelf position={[-halfW + 0.42, 0, -6.0]} />
        </>
      )}

      {theme === 'creative' && (
        <>
          {/* Front-Left Glass Studio Collaboration Room */}
          <RoundCollabZone position={[-11.15, 0, 8.1]} />
          <MoodboardPinboard position={[-halfW + 0.05, 2.04, 7.6]} />

          {/* Back-Right Glass Studio Resource Room */}
          <OpenShelvingUnit position={[10.85, 0, -10.55]} />
          <WaterCooler position={[12.6, 0, -10.58]} />
          <PottedPlant position={[12.75, 0, -6.0]} scale={0.9} variant="terracotta" />

          {/* Lift Lobby Geometric Art Posters */}
          <GeometricPosters position={[-halfW + 0.05, 2.04, -6.0]} />
        </>
      )}

      {theme === 'pantry' && (
        <>
          {/* Back-Right Glass Pantry Kitchen Room */}
          <PantryKitchenZone position={[11.25, 0, -10.45]} />

          {/* Front-Left Glass Bistro Room */}
          <BistroCafeNook position={[-11.15, 0, 8.15]} />
          <FloatingMugShelf position={[-halfW + 0.2, 1.62, 7.8]} />

          {/* Extra lush greenery in Lift Lobby */}
          <PottedPlant position={[-halfW + 0.92, 0, -6.4]} scale={1.1} variant="tall" />
          <PottedPlant position={[-halfW + 0.85, 0, -5.0]} scale={0.82} variant="ceramic" />
        </>
      )}
    </group>
  );
};
