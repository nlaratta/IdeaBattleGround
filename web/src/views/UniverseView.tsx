import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Html, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { IdeaState } from '../types';
import type { ActiveDuel } from '../hooks/useTournament';

// Universe view: ideas as physical bodies that drift and converge for battles.
// Cinematic mode: server pacing emits duel:start, sleep, pairwise:result. We
// interpolate orb positions toward an arena point during that window, render a
// floating duel card, and lerp the camera to the action.

interface KillBurstSpec {
  ideaId: string;
  position: { x: number; y: number };
  color: string;
  ts: number;
}

interface Props {
  ideas: Record<string, IdeaState>;
  pairFlashes: { winnerId: string; loserId: string; ts: number }[];
  killBursts: KillBurstSpec[];
  champions: string[];
  activeDuel: ActiveDuel | null;
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
}

const SCALE = 0.012; // world units per layout px
const ARENA_RADIUS = 0.9; // how close the two duelists get
const HOME_DRIFT = 0.06;

interface OrbPhysics {
  home: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

function orbFromIdea(s: IdeaState): OrbPhysics {
  const home = new THREE.Vector3(s.position.x * SCALE, 0, s.position.y * SCALE);
  return { home, pos: home.clone(), vel: new THREE.Vector3() };
}

function eloRadius(elo: number) {
  const norm = Math.max(0, Math.min(1, (elo - 1100) / 400));
  return 0.18 + norm * 0.55;
}

interface OrbsLayerProps extends Pick<Props, 'ideas' | 'activeDuel' | 'selectedId' | 'onSelect'> {
  pairFlashes: Props['pairFlashes'];
}

function OrbsLayer({ ideas, activeDuel, selectedId, onSelect, pairFlashes }: OrbsLayerProps) {
  const physicsRef = useRef<Record<string, OrbPhysics>>({});
  const meshRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const haloRefs = useRef<Record<string, THREE.Mesh | null>>({});

  // Sync physics map with ideas
  useEffect(() => {
    const m = physicsRef.current;
    for (const s of Object.values(ideas)) {
      if (!m[s.idea.id]) m[s.idea.id] = orbFromIdea(s);
    }
    for (const id of Object.keys(m)) if (!ideas[id]) delete m[id];
  }, [ideas]);

  useFrame((_, dt) => {
    const m = physicsRef.current;
    const now = Date.now();

    // Duel target: midpoint between the two duelists, slightly offset
    let aTarget: THREE.Vector3 | null = null;
    let bTarget: THREE.Vector3 | null = null;
    if (activeDuel) {
      const a = m[activeDuel.aId];
      const b = m[activeDuel.bId];
      if (a && b) {
        const mid = new THREE.Vector3().addVectors(a.home, b.home).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(b.home, a.home).normalize();
        aTarget = mid.clone().addScaledVector(dir, -ARENA_RADIUS);
        bTarget = mid.clone().addScaledVector(dir, ARENA_RADIUS);
      }
    }

    for (const s of Object.values(ideas)) {
      const p = m[s.idea.id];
      if (!p) continue;
      const mesh = meshRefs.current[s.idea.id];
      const halo = haloRefs.current[s.idea.id];
      if (!mesh) continue;

      // Decide target: arena if duelist, home if alive, slowly drift outward if dead
      let target = p.home;
      let tightness = 1.0;
      if (activeDuel?.aId === s.idea.id && aTarget) { target = aTarget; tightness = 4.0; }
      else if (activeDuel?.bId === s.idea.id && bTarget) { target = bTarget; tightness = 4.0; }
      else if (!s.alive) {
        target = p.home.clone().multiplyScalar(1.05); // drift outward slightly
        tightness = 0.4;
      }

      // Add a tiny per-orb wobble
      const phaseSeed = (s.idea.id.charCodeAt(0) || 1) * 17 + (s.idea.id.charCodeAt(1) || 1);
      const wobble = Math.sin(now * 0.0007 + phaseSeed) * HOME_DRIFT;
      const targetWithWobble = target.clone();
      targetWithWobble.y += wobble;

      // Spring toward target
      const accel = new THREE.Vector3().subVectors(targetWithWobble, p.pos).multiplyScalar(tightness);
      p.vel.addScaledVector(accel, dt);
      p.vel.multiplyScalar(Math.exp(-dt * 2.2)); // damping
      p.pos.addScaledVector(p.vel, dt);

      mesh.position.copy(p.pos);
      if (halo) halo.position.copy(p.pos);

      // Selected/duel scale pulse
      const isDueling = activeDuel && (activeDuel.aId === s.idea.id || activeDuel.bId === s.idea.id);
      const targetScale = (selectedId === s.idea.id ? 1.25 : 1.0) + (isDueling ? 0.25 : 0);
      const cur = mesh.scale.x;
      const next = cur + (targetScale - cur) * Math.min(1, dt * 8);
      mesh.scale.setScalar(next);
      if (halo) {
        const haloVis = (selectedId === s.idea.id ? 0.25 : 0) + (isDueling ? 0.5 : 0);
        (halo.material as THREE.MeshBasicMaterial).opacity = haloVis;
        halo.scale.setScalar(next * 1.8);
      }
    }
  });

  return (
    <>
      {Object.values(ideas).map((s) => {
        const r = eloRadius(s.elo);
        const color = s.alive ? s.color : '#5a6378';
        const emissive = s.alive ? s.color : '#2a3550';
        const isDueling = activeDuel && (activeDuel.aId === s.idea.id || activeDuel.bId === s.idea.id);
        return (
          <group key={s.idea.id}>
            <mesh
              ref={(el) => { haloRefs.current[s.idea.id] = el; }}
              renderOrder={1}
            >
              <sphereGeometry args={[r, 24, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh
              ref={(el) => { meshRefs.current[s.idea.id] = el; }}
              onClick={(e) => { e.stopPropagation(); onSelect(s.idea.id); }}
              renderOrder={2}
            >
              <sphereGeometry args={[r, 32, 32]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={s.alive ? (isDueling ? 1.6 : 0.85) : 0.25}
                metalness={0.2}
                roughness={0.55}
                transparent
                opacity={s.alive ? 1 : 0.65}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

interface DuelOverlayProps {
  ideas: Record<string, IdeaState>;
  duel: ActiveDuel;
}

function DuelOverlay({ ideas, duel }: DuelOverlayProps) {
  const a = ideas[duel.aId];
  const b = ideas[duel.bId];
  if (!a || !b) return null;
  const aHome = new THREE.Vector3(a.position.x * SCALE, 0, a.position.y * SCALE);
  const bHome = new THREE.Vector3(b.position.x * SCALE, 0, b.position.y * SCALE);
  const mid = aHome.clone().lerp(bHome, 0.5);
  return (
    <>
      <Html
        position={[mid.x, 2.0, mid.z]}
        center
        distanceFactor={9}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          background: 'rgba(15,18,28,0.85)',
          border: '1px solid rgba(255,224,102,0.35)',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 12,
          color: '#dfe3ee',
          minWidth: 240,
          maxWidth: 320,
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(6px)',
        }}>
          <div style={{ fontWeight: 700, letterSpacing: 1, opacity: 0.6, fontSize: 10 }}>DUEL · ROUND {duel.round}</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'baseline', marginTop: 4, gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: a.color, fontWeight: 600 }}>{a.idea.pitch}</div>
              <div style={{ opacity: 0.6, fontSize: 10, marginTop: 2 }}>{a.idea.mechanism.slice(0, 70)}{a.idea.mechanism.length > 70 ? '…' : ''}</div>
            </div>
            <div style={{ opacity: 0.5, fontWeight: 700, fontSize: 14 }}>vs</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: b.color, fontWeight: 600 }}>{b.idea.pitch}</div>
              <div style={{ opacity: 0.6, fontSize: 10, marginTop: 2 }}>{b.idea.mechanism.slice(0, 70)}{b.idea.mechanism.length > 70 ? '…' : ''}</div>
            </div>
          </div>
          <div style={{ opacity: 0.45, fontSize: 10, marginTop: 6 }}>elo {a.elo.toFixed(0)} vs {b.elo.toFixed(0)}</div>
        </div>
      </Html>
      <Sparkles count={40} scale={[1.5, 0.8, 1.5]} position={[mid.x, 0.4, mid.z]} speed={1.2} size={3} color="#FFE066" opacity={0.9} />
    </>
  );
}

function CinematicCamera({
  ideas,
  activeDuel,
  champions,
  phase,
}: {
  ideas: Record<string, IdeaState>;
  activeDuel: ActiveDuel | null;
  champions: string[];
  phase: string;
}) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 5, 8));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_, dt) => {
    const t = performance.now() * 0.0001;

    if (activeDuel) {
      // Slow orbit two-shot of the duel midpoint, with enough distance for the card.
      const a = ideas[activeDuel.aId];
      const b = ideas[activeDuel.bId];
      if (a && b) {
        const mid = new THREE.Vector3(
          ((a.position.x + b.position.x) / 2) * SCALE,
          0,
          ((a.position.y + b.position.y) / 2) * SCALE,
        );
        const dirVec = new THREE.Vector3((b.position.x - a.position.x) * SCALE, 0, (b.position.y - a.position.y) * SCALE).normalize();
        const perp = new THREE.Vector3(-dirVec.z, 0, dirVec.x);
        const orbitT = t * 2.5;
        // Pulled back — base 5 units perp, 4.5 along axis, height 3.2.
        const offset = perp.multiplyScalar(4.6 * Math.cos(orbitT))
          .add(new THREE.Vector3(0, 3.2, 0))
          .add(dirVec.clone().multiplyScalar(4.6 * Math.sin(orbitT)));
        targetPos.current.copy(mid).add(offset);
        targetLook.current.copy(mid);
      }
    } else if (phase === 'deep' && champions.length > 0) {
      // Slow orbit centered on the champion cluster
      const positions = champions.map((id) => ideas[id]).filter(Boolean).map((s) => s.position);
      const cx = positions.reduce((s, p) => s + p.x, 0) / Math.max(1, positions.length);
      const cz = positions.reduce((s, p) => s + p.y, 0) / Math.max(1, positions.length);
      const center = new THREE.Vector3(cx * SCALE, 0, cz * SCALE);
      const orbit = t * 3;
      targetPos.current.set(center.x + Math.cos(orbit) * 5, 3.2, center.z + Math.sin(orbit) * 5);
      targetLook.current.copy(center);
    } else {
      // Wide aerial drifting around the alive cluster centroid
      const alive = Object.values(ideas).filter((s) => s.alive);
      if (alive.length === 0) {
        targetPos.current.set(8 * Math.cos(t * 6), 6, 8 * Math.sin(t * 6));
        targetLook.current.set(0, 0, 0);
      } else {
        const cx = alive.reduce((s, i) => s + i.position.x, 0) / alive.length * SCALE;
        const cz = alive.reduce((s, i) => s + i.position.y, 0) / alive.length * SCALE;
        // Distance based on cluster spread
        let maxDist = 0;
        for (const s of alive) {
          const dx = s.position.x * SCALE - cx;
          const dz = s.position.y * SCALE - cz;
          const d = Math.hypot(dx, dz);
          if (d > maxDist) maxDist = d;
        }
        const orbit = t * 4;
        const baseDist = Math.max(6, maxDist * 1.6 + 3);
        targetPos.current.set(cx + Math.cos(orbit) * baseDist, baseDist * 0.6, cz + Math.sin(orbit) * baseDist);
        targetLook.current.set(cx, 0, cz);
      }
    }

    camera.position.lerp(targetPos.current, Math.min(1, dt * 1.6));
    const currentLook = new THREE.Vector3();
    camera.getWorldDirection(currentLook).add(camera.position);
    currentLook.lerp(targetLook.current, Math.min(1, dt * 2.5));
    camera.lookAt(targetLook.current);
  });
  return null;
}

function PhaseChyron({ phase, round, alive, total, cinematic }: { phase: string; round: number; alive: number; total: number; cinematic: boolean }) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === lastPhase.current) return;
    lastPhase.current = phase;
    if (phase === 'idle') return;
    const labels: Record<string, string> = {
      generating: 'PHASE I · GENERATION',
      rubric: 'PHASE II · RUBRIC SCORING',
      culling: 'PHASE III · CULL',
      pairwise: `PHASE IV · BATTLES${round > 0 ? ` · ROUND ${round}` : ''}`,
      deep: 'PHASE V · FINAL JUDGMENT',
      complete: 'COMPLETE',
    };
    setText(labels[phase] ?? phase.toUpperCase());
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2200);
    return () => clearTimeout(t);
  }, [phase, round]);

  return (
    <div style={{
      position: 'absolute', top: '40%', left: 0, right: 0,
      pointerEvents: 'none', textAlign: 'center',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-12px)',
      transition: 'opacity 350ms ease, transform 350ms ease',
      zIndex: 4,
    }}>
      <div style={{
        display: 'inline-block',
        background: 'rgba(8,10,18,0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '14px 28px', borderRadius: 10,
        fontSize: 22, letterSpacing: 4, fontWeight: 700,
        color: '#dfe3ee',
        textShadow: '0 0 30px rgba(124,196,255,0.5)',
      }}>
        {text}
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.55, marginTop: 6, fontWeight: 400 }}>
          {alive}/{total} alive {cinematic ? '· cinematic mode' : ''}
        </div>
      </div>
    </div>
  );
}

export function UniverseView({ ideas, pairFlashes, killBursts, champions, activeDuel, selectedId, onSelect }: Props) {
  const [hovered, setHovered] = useState<IdeaState | null>(null);
  void hovered; void killBursts; void pairFlashes;

  const aliveCount = useMemo(() => Object.values(ideas).filter((s) => s.alive).length, [ideas]);
  const total = Object.keys(ideas).length;
  const phase = activeDuel ? 'pairwise' : (aliveCount > 0 && aliveCount === total ? 'generating' : 'pairwise');
  void phase;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#06080f' }}>
      <Canvas
        camera={{ position: [8, 5, 8], fov: 55, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        onPointerMissed={() => onSelect(null)}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#06080f']} />
          <fog attach="fog" args={['#06080f', 12, 36]} />
          <ambientLight intensity={0.25} />
          <pointLight position={[6, 10, 6]} intensity={0.8} color="#a8c1ff" />
          <pointLight position={[-8, 6, -4]} intensity={0.4} color="#ffd3a3" />
          <Stars radius={60} depth={50} count={2000} factor={3} fade speed={0.4} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#0b0e16" roughness={1} />
          </mesh>
          <gridHelper args={[60, 60, '#1c2030', '#15182a']} position={[0, -0.05, 0]} />

          <OrbsLayer ideas={ideas} pairFlashes={pairFlashes} activeDuel={activeDuel} selectedId={selectedId} onSelect={onSelect} />
          {activeDuel && <DuelOverlay ideas={ideas} duel={activeDuel} />}
          <CinematicCamera ideas={ideas} activeDuel={activeDuel} champions={champions} phase={phase} />

          <EffectComposer>
            <Bloom intensity={0.95} luminanceThreshold={0.18} luminanceSmoothing={0.7} mipmapBlur />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      {/* HUD overlays */}
      <div style={{
        position: 'absolute', bottom: 10, left: 12,
        background: 'rgba(20,22,30,0.75)', padding: '6px 10px', borderRadius: 6, fontSize: 12,
        display: 'flex', gap: 14,
      }}>
        <span>{aliveCount}/{total} alive</span>
        {activeDuel && <span style={{ color: '#FFE066' }}>· duel · round {activeDuel.round}</span>}
      </div>
    </div>
  );
}

export function makePhaseChyron() { return PhaseChyron; }
