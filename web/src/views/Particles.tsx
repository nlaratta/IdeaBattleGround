import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

interface KillBurstSpec {
  ideaId: string;
  position: { x: number; y: number };
  color: string;
  ts: number;
}

interface Props {
  bursts: KillBurstSpec[];
  scale: number; // world units per layout px
  championPositions: Array<{ x: number; y: number; color: string }>;
}

const BURST_LIFETIME_MS = 1500;
const PARTICLES_PER_BURST = 28;

interface BurstData {
  origin: THREE.Vector3;
  positions: Float32Array; // x,y,z * count
  velocities: Float32Array;
  ts: number;
  color: THREE.Color;
}

/** GPU-cheap kill bursts: one Points per burst with CPU position updates. */
function KillBurst({ burst, scale }: { burst: KillBurstSpec; scale: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const data = useMemo<BurstData>(() => {
    const positions = new Float32Array(PARTICLES_PER_BURST * 3);
    const velocities = new Float32Array(PARTICLES_PER_BURST * 3);
    const origin = new THREE.Vector3(burst.position.x * scale, 0, burst.position.y * scale);
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      // Random direction on a hemisphere (slight upward bias)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85);
      const speed = 0.6 + Math.random() * 1.2;
      const dx = Math.cos(theta) * Math.sin(phi) * speed;
      const dy = Math.cos(phi) * speed * 0.8 + 0.4;
      const dz = Math.sin(theta) * Math.sin(phi) * speed;
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      velocities[i * 3] = dx;
      velocities[i * 3 + 1] = dy;
      velocities[i * 3 + 2] = dz;
    }
    return { origin, positions, velocities, ts: burst.ts, color: new THREE.Color(burst.color) };
  }, [burst.ideaId, scale]);

  useFrame(() => {
    const age = Date.now() - data.ts;
    const t = Math.min(1, age / BURST_LIFETIME_MS);
    if (!pointsRef.current || !matRef.current) return;
    const positions = (pointsRef.current.geometry.attributes.position.array as Float32Array);
    // Re-derive each frame from origin + velocity * t with gravity decay.
    const ts = age / 1000;
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      const vx = data.velocities[i * 3];
      const vy = data.velocities[i * 3 + 1];
      const vz = data.velocities[i * 3 + 2];
      const drag = Math.exp(-ts * 1.4);
      positions[i * 3] = data.origin.x + vx * ts * drag;
      positions[i * 3 + 1] = data.origin.y + vy * ts * drag - ts * ts * 0.6;
      positions[i * 3 + 2] = data.origin.z + vz * ts * drag;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    matRef.current.opacity = (1 - t) * 0.95;
    matRef.current.size = 0.16 * (1 - t * 0.3);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[data.positions, 3]}
          count={PARTICLES_PER_BURST}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        color={data.color}
        size={0.16}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function ChampionCrown({ x, z, color }: { x: number; z: number; color: string }) {
  // Persistent celebratory effect: orbiting halo ring + Sparkles column above the orb.
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z += dt * 0.6;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh ref={ringRef} rotation={[Math.PI / 2.2, 0, 0]} position={[0, 0.9, 0]}>
        <torusGeometry args={[0.7, 0.04, 16, 64]} />
        <meshStandardMaterial
          color="#FFE066"
          emissive="#FFE066"
          emissiveIntensity={1.5}
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>
      <Sparkles
        count={50}
        scale={[1.4, 2.2, 1.4]}
        position={[0, 1.3, 0]}
        speed={0.6}
        size={3}
        color={color}
        opacity={0.85}
      />
      <pointLight position={[0, 1.4, 0]} color="#FFE066" intensity={0.6} distance={3} />
    </group>
  );
}

export function EffectsLayer({ bursts, scale, championPositions }: Props) {
  // Filter out expired bursts to keep node count bounded.
  const now = Date.now();
  const live = bursts.filter((b) => now - b.ts < BURST_LIFETIME_MS);
  return (
    <>
      {live.map((b) => (
        <KillBurst key={`${b.ideaId}-${b.ts}`} burst={b} scale={scale} />
      ))}
      {championPositions.map((p, i) => (
        <ChampionCrown key={i} x={p.x * scale} z={p.y * scale} color={p.color} />
      ))}
    </>
  );
}
