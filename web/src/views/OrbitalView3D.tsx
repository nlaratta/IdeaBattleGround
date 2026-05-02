import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Line, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { IdeaState } from '../types';

interface Props {
  ideas: Record<string, IdeaState>;
  pairFlashes: { winnerId: string; loserId: string; ts: number }[];
  recentEloDeltas: { ideaId: string; delta: number; ts: number }[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
}

const FLASH_MS = 1200;
const SCALE = 0.012; // world units per layout pixel (layout is ~±560px range)

function eloRadius(elo: number) {
  const norm = Math.max(0, Math.min(1, (elo - 1100) / 400));
  return 0.18 + norm * 0.55;
}

interface OrbProps {
  state: IdeaState;
  selected: boolean;
  flashStrength: number;
  onClick: () => void;
  onHover: (hovering: boolean) => void;
}

function Orb({ state, selected, flashStrength, onClick, onHover }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const x = state.position.x * SCALE;
  const z = state.position.y * SCALE;
  const baseY = state.alive ? 0 : -0.4;

  // Slight orbital drift per-orb (deterministic per id)
  const phase = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < state.idea.id.length; i++) {
      h ^= state.idea.id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) / 0xffffffff) * Math.PI * 2;
  }, [state.idea.id]);

  const radius = eloRadius(state.elo);
  const color = state.alive ? state.color : '#5a6378';
  const emissive = state.alive ? state.color : '#2a3550';

  useFrame((_, dt) => {
    if (!meshRef.current) return;
    const t = performance.now() / 1000;
    const wobble = state.alive ? Math.sin(t * 0.6 + phase) * 0.04 : 0;
    meshRef.current.position.set(x, baseY + wobble, z);
    // Selected pulse
    const targetScale = (selected ? 1.25 : 1.0) + flashStrength * 0.4;
    const cur = meshRef.current.scale.x;
    const next = cur + (targetScale - cur) * Math.min(1, dt * 8);
    meshRef.current.scale.setScalar(next);
    if (haloRef.current) {
      haloRef.current.position.copy(meshRef.current.position);
      const haloVis = (selected ? 0.25 : 0) + flashStrength * 0.5;
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = haloVis;
      const haloScale = next * 1.8;
      haloRef.current.scale.setScalar(haloScale);
    }
  });

  return (
    <>
      <mesh
        ref={haloRef}
        position={[x, baseY, z]}
        renderOrder={1}
      >
        <sphereGeometry args={[radius, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={meshRef}
        position={[x, baseY, z]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
        onPointerOut={() => onHover(false)}
        renderOrder={2}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={state.alive ? 0.85 + flashStrength * 1.2 : 0.25}
          metalness={0.2}
          roughness={0.55}
          transparent
          opacity={state.alive ? 1 : 0.65}
        />
      </mesh>
    </>
  );
}

interface BeamProps {
  fromX: number; fromZ: number;
  toX: number; toZ: number;
  alpha: number;
  color: string;
}

function Beam({ fromX, fromZ, toX, toZ, alpha, color }: BeamProps) {
  const ref = useRef<THREE.Mesh>(null);
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (fromX + toX) / 2;
  const midZ = (fromZ + toZ) / 2;
  return (
    <mesh
      ref={ref}
      position={[midX, 0.05, midZ]}
      rotation={[0, -angle, Math.PI / 2]}
    >
      <cylinderGeometry args={[0.025, 0.025, len, 8, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={Math.max(0, alpha)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function RingGuides() {
  const rings = [200 * SCALE, 380 * SCALE, 560 * SCALE];
  return (
    <>
      {rings.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <ringGeometry args={[r - 0.005, r + 0.005, 128]} />
          <meshBasicMaterial color="#2a3550" transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

function FloorGrid() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0b0e16" roughness={1} />
      </mesh>
      <gridHelper args={[40, 40, '#1c2030', '#15182a']} position={[0, -0.05, 0]} />
    </>
  );
}

interface CameraDirectorProps {
  ideas: Record<string, IdeaState>;
  autoFollow: boolean;
}

function CameraDirector({ ideas, autoFollow }: CameraDirectorProps) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const distRef = useRef(8);
  useFrame((_, dt) => {
    if (!autoFollow) return;
    const alive = Object.values(ideas).filter((s) => s.alive);
    if (alive.length === 0) return;
    const top = [...alive].sort((a, b) => b.elo - a.elo).slice(0, Math.max(3, Math.ceil(alive.length * 0.25)));
    let cx = 0, cz = 0;
    for (const s of top) { cx += s.position.x; cz += s.position.y; }
    cx = (cx / top.length) * SCALE;
    cz = (cz / top.length) * SCALE;
    // Base distance on the spread of alive ideas, not just count — guarantees the
    // full alive cluster fits in the frustum even when ideas land on opposite sides.
    let maxDist = 0;
    for (const s of alive) {
      const dx = s.position.x * SCALE - cx;
      const dz = s.position.y * SCALE - cz;
      const d = Math.hypot(dx, dz);
      if (d > maxDist) maxDist = d;
    }
    const fovHalfTan = Math.tan((55 * Math.PI / 180) / 2);
    const fitDist = (maxDist / fovHalfTan) * 1.4 + 1.5; // padding factor
    const minDist = 4;
    const targetDist = Math.max(minDist, Math.min(20, fitDist));
    targetRef.current.lerp(new THREE.Vector3(cx, 0, cz), Math.min(1, dt * 1.5));
    distRef.current += (targetDist - distRef.current) * Math.min(1, dt * 1.2);
    // Position the camera in an isometric-ish orbit around the target
    const t = performance.now() * 0.00006; // slow lateral drift
    const desiredPos = new THREE.Vector3(
      targetRef.current.x + Math.cos(t) * distRef.current,
      distRef.current * 0.6,
      targetRef.current.z + Math.sin(t) * distRef.current,
    );
    camera.position.lerp(desiredPos, Math.min(1, dt * 1.5));
    camera.lookAt(targetRef.current);
  });
  return null;
}

interface SceneProps extends Props {
  autoFollow: boolean;
  onHoverIdea: (idea: IdeaState | null) => void;
}

function Scene({ ideas, pairFlashes, selectedId, autoFollow, onSelect, onHoverIdea }: SceneProps) {
  const ideasArr = Object.values(ideas);

  // Build flashStrength per idea from recent pair flashes
  const flashStrengths = useMemo(() => {
    const map: Record<string, number> = {};
    const now = Date.now();
    for (const f of pairFlashes) {
      const age = now - f.ts;
      if (age < 0 || age > FLASH_MS) continue;
      const s = 1 - age / FLASH_MS;
      map[f.winnerId] = Math.max(map[f.winnerId] ?? 0, s);
      map[f.loserId] = Math.max(map[f.loserId] ?? 0, s);
    }
    return map;
  }, [pairFlashes]);

  const liveBeams = pairFlashes.filter((f) => Date.now() - f.ts < FLASH_MS);

  return (
    <>
      <color attach="background" args={['#06080f']} />
      <fog attach="fog" args={['#06080f', 14, 30]} />
      <ambientLight intensity={0.25} />
      <pointLight position={[6, 10, 6]} intensity={0.8} color="#a8c1ff" />
      <pointLight position={[-8, 6, -4]} intensity={0.4} color="#ffd3a3" />
      <Stars radius={60} depth={50} count={1500} factor={2.5} fade speed={0.4} />
      <FloorGrid />
      <RingGuides />
      <CameraDirector ideas={ideas} autoFollow={autoFollow} />
      {ideasArr.map((s) => (
        <Orb
          key={s.idea.id}
          state={s}
          selected={selectedId === s.idea.id}
          flashStrength={flashStrengths[s.idea.id] ?? 0}
          onClick={() => onSelect(s.idea.id)}
          onHover={(hov) => onHoverIdea(hov ? s : null)}
        />
      ))}
      {liveBeams.map((f, i) => {
        const a = ideas[f.winnerId];
        const b = ideas[f.loserId];
        if (!a || !b) return null;
        const alpha = 1 - (Date.now() - f.ts) / FLASH_MS;
        return (
          <Beam
            key={`${f.ts}-${i}`}
            fromX={a.position.x * SCALE} fromZ={a.position.y * SCALE}
            toX={b.position.x * SCALE}   toZ={b.position.y * SCALE}
            alpha={alpha * 0.8}
            color="#ffe28a"
          />
        );
      })}
      <EffectComposer>
        <Bloom intensity={0.7} luminanceThreshold={0.2} luminanceSmoothing={0.7} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.7} />
      </EffectComposer>
      <mesh onClick={() => onSelect(null)} position={[0, -1, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}

export function OrbitalView3D({ ideas, pairFlashes, recentEloDeltas, selectedId, onSelect }: Props) {
  const [autoFollow, setAutoFollow] = useState(true);
  const [hovered, setHovered] = useState<IdeaState | null>(null);
  const controlsRef = useRef<unknown>(null);

  const stats = useMemo(() => {
    const all = Object.values(ideas);
    return {
      total: all.length,
      alive: all.filter((i) => i.alive).length,
      avgElo: all.length === 0 ? 1200 : all.reduce((s, i) => s + i.elo, 0) / all.length,
    };
  }, [ideas]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#06080f' }}>
      <Canvas
        camera={{ position: [6, 4, 6], fov: 55, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        onPointerMissed={() => onSelect(null)}
      >
        <Suspense fallback={null}>
          <Scene
            ideas={ideas}
            pairFlashes={pairFlashes}
            recentEloDeltas={recentEloDeltas}
            selectedId={selectedId}
            onSelect={onSelect}
            autoFollow={autoFollow}
            onHoverIdea={setHovered}
          />
          <OrbitControls
            ref={controlsRef as React.MutableRefObject<never>}
            enableDamping
            dampingFactor={0.08}
            enablePan
            enabled={!autoFollow}
            minDistance={2.5}
            maxDistance={30}
          />
        </Suspense>
      </Canvas>

      {hovered && (
        <div style={{
          position: 'absolute', left: 12, top: 60,
          background: 'rgba(20,22,30,0.85)',
          padding: '8px 10px', borderRadius: 6, fontSize: 12, maxWidth: 240,
          pointerEvents: 'none', borderLeft: `3px solid ${hovered.color}`,
        }}>
          <div style={{ fontWeight: 600, color: hovered.color }}>{hovered.idea.pitch}</div>
          <div style={{ opacity: 0.7, fontSize: 11, marginTop: 2 }}>
            elo {hovered.elo.toFixed(0)} · μ {hovered.meanScore.toFixed(2)} · W{hovered.wins} L{hovered.losses}
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center',
        background: 'rgba(20,22,30,0.7)', padding: '6px 10px', borderRadius: 6, fontSize: 12,
      }}>
        <button onClick={() => setAutoFollow((v) => !v)} style={btnStyle(autoFollow)}>
          {autoFollow ? 'auto-follow on' : 'manual cam'}
        </button>
      </div>

      <div style={{
        position: 'absolute', bottom: 10, left: 12,
        background: 'rgba(20,22,30,0.7)', padding: '6px 10px', borderRadius: 6, fontSize: 12,
        display: 'flex', gap: 14,
      }}>
        <span>{stats.alive}/{stats.total} alive</span>
        <span>avg elo {stats.avgElo.toFixed(0)}</span>
      </div>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? '#2a3550' : '#1a1d28',
    color: '#dfe3ee',
    border: '1px solid #2a3550',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
  };
}
