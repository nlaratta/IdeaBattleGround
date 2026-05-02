import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { IdeaState } from '../types';
import { duelKey, type ActiveDuel } from '../hooks/useTournament';
import { DuelCard } from '../components/DuelCard';

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
  taunts: Record<string, string>;
  reveal: { ideaId: string; phase: 'in' | 'hold' | 'out' } | null;
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
        const isDueling = activeDuel && (activeDuel.aId === s.idea.id || activeDuel.bId === s.idea.id);
        const resolved = !!activeDuel?.winnerId;
        const isWinner = resolved && activeDuel?.winnerId === s.idea.id;
        const isLoser = resolved && isDueling && !isWinner;
        const color = s.alive ? (isWinner ? '#FFD86A' : s.color) : '#5a6378';
        const emissive = s.alive ? (isWinner ? '#FFD86A' : s.color) : '#2a3550';
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
                emissiveIntensity={s.alive
                  ? (isWinner ? 2.4 : isLoser ? 0.5 : (isDueling ? 1.6 : 0.85))
                  : 0.25}
                metalness={0.2}
                roughness={0.55}
                transparent
                opacity={s.alive ? (isLoser ? 0.55 : 1) : 0.65}
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
  // Sparkles in the arena midpoint — gold during duel, brighter cyan/burst on resolve.
  const resolved = !!duel.winnerId;
  return (
    <Sparkles
      count={resolved ? 80 : 40}
      scale={[1.5, 0.8, 1.5]}
      position={[mid.x, 0.4, mid.z]}
      speed={resolved ? 2.4 : 1.2}
      size={resolved ? 5 : 3}
      color={resolved ? '#FFD86A' : '#FFE066'}
      opacity={0.95}
    />
  );
}

// Frame-rate-independent exponential damping. rate=2 means ~63% of the
// remaining gap is closed per second; rate=4 closes faster.
function dampToward(current: THREE.Vector3, target: THREE.Vector3, rate: number, dt: number) {
  const k = 1 - Math.exp(-rate * dt);
  current.x += (target.x - current.x) * k;
  current.y += (target.y - current.y) * k;
  current.z += (target.z - current.z) * k;
}

function CinematicCamera({
  ideas,
  activeDuel,
  champions,
  phase,
  reveal,
}: {
  ideas: Record<string, IdeaState>;
  activeDuel: ActiveDuel | null;
  champions: string[];
  phase: string;
  reveal: { ideaId: string; phase: 'in' | 'hold' | 'out' } | null;
}) {
  const { camera } = useThree();
  // Desired (where we want camera/look to be this frame). Recomputed each frame.
  const desiredPos = useRef(new THREE.Vector3(0, 5, 8));
  const desiredLook = useRef(new THREE.Vector3(0, 0, 0));
  // Smoothed (what we actually apply, lerped toward desired with damping).
  const smoothedPos = useRef(new THREE.Vector3(0, 5, 8));
  const smoothedLook = useRef(new THREE.Vector3(0, 0, 0));
  // Snap-on-first-frame so initial mount lands at the right framing instead
  // of the smoothed position dollying in from the default location.
  const initializedRef = useRef(false);

  useFrame((_, dt) => {
    const t = performance.now() * 0.0001;

    // === Compute desired pos + look based on current state ===
    if (reveal) {
      const s = ideas[reveal.ideaId];
      if (s) {
        const center = new THREE.Vector3(s.position.x * SCALE, 0, s.position.y * SCALE);
        const orbit = t * 1.4; // slower swirl
        const dist = 3.4;
        desiredPos.current.set(center.x + Math.cos(orbit) * dist, 1.6, center.z + Math.sin(orbit) * dist);
        desiredLook.current.copy(center).setY(0.4);
      }
    } else if (activeDuel) {
      const a = ideas[activeDuel.aId];
      const b = ideas[activeDuel.bId];
      if (a && b) {
        const mid = new THREE.Vector3(
          ((a.position.x + b.position.x) / 2) * SCALE,
          0,
          ((a.position.y + b.position.y) / 2) * SCALE,
        );
        const dirVec = new THREE.Vector3(
          (b.position.x - a.position.x) * SCALE, 0, (b.position.y - a.position.y) * SCALE,
        ).normalize();
        const perp = new THREE.Vector3(-dirVec.z, 0, dirVec.x);
        const orbitT = t * 1.6; // slower duel orbit (was 2.5)
        const offset = perp.multiplyScalar(4.6 * Math.cos(orbitT))
          .add(new THREE.Vector3(0, 3.2, 0))
          .add(dirVec.clone().multiplyScalar(4.6 * Math.sin(orbitT)));
        desiredPos.current.copy(mid).add(offset);
        desiredLook.current.copy(mid);
      }
    } else if (phase === 'deep' && champions.length > 0) {
      const positions = champions.map((id) => ideas[id]).filter(Boolean).map((s) => s.position);
      const cx = positions.reduce((s, p) => s + p.x, 0) / Math.max(1, positions.length);
      const cz = positions.reduce((s, p) => s + p.y, 0) / Math.max(1, positions.length);
      const center = new THREE.Vector3(cx * SCALE, 0, cz * SCALE);
      const orbit = t * 1.8; // slower (was 3)
      desiredPos.current.set(center.x + Math.cos(orbit) * 5, 3.2, center.z + Math.sin(orbit) * 5);
      desiredLook.current.copy(center);
    } else {
      const alive = Object.values(ideas).filter((s) => s.alive);
      if (alive.length === 0) {
        const orbit = t * 3.5;
        desiredPos.current.set(8 * Math.cos(orbit), 6, 8 * Math.sin(orbit));
        desiredLook.current.set(0, 0, 0);
      } else {
        const cx = alive.reduce((s, i) => s + i.position.x, 0) / alive.length * SCALE;
        const cz = alive.reduce((s, i) => s + i.position.y, 0) / alive.length * SCALE;
        let maxDist = 0;
        for (const s of alive) {
          const dx = s.position.x * SCALE - cx;
          const dz = s.position.y * SCALE - cz;
          const d = Math.hypot(dx, dz);
          if (d > maxDist) maxDist = d;
        }
        const orbit = t * 2.2; // slower (was 4)
        const baseDist = Math.max(6, maxDist * 1.6 + 3);
        desiredPos.current.set(cx + Math.cos(orbit) * baseDist, baseDist * 0.6, cz + Math.sin(orbit) * baseDist);
        desiredLook.current.set(cx, 0, cz);
      }
    }

    // === Smooth toward desired with frame-rate-independent damping ===
    // Position rate ≈ 2.5/s gives ~92% closure in 1s; gap-closure feels
    // kinetic but not snappy. Look rate slightly higher so orientation
    // catches up faster than the dolly when a duel ends and the next begins.
    if (!initializedRef.current) {
      smoothedPos.current.copy(desiredPos.current);
      smoothedLook.current.copy(desiredLook.current);
      initializedRef.current = true;
    } else {
      dampToward(smoothedPos.current, desiredPos.current, 2.5, dt);
      dampToward(smoothedLook.current, desiredLook.current, 3.5, dt);
    }

    camera.position.copy(smoothedPos.current);
    camera.lookAt(smoothedLook.current);
  });
  return null;
}

export function UniverseView({ ideas, pairFlashes, killBursts, champions, activeDuel, taunts, reveal, selectedId, onSelect }: Props) {
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
          <CinematicCamera ideas={ideas} activeDuel={activeDuel} champions={champions} phase={phase} reveal={reveal} />

          <EffectComposer>
            <Bloom intensity={0.95} luminanceThreshold={0.18} luminanceSmoothing={0.7} mipmapBlur />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      {activeDuel && (
        <DuelCard
          duel={activeDuel}
          ideas={ideas}
          taunt={taunts[duelKey(activeDuel.aId, activeDuel.bId)]}
        />
      )}

      {/* Bottom-right HUD: alive count + duel state. Symmetric counterweight to phase chyron at bottom-left. */}
      <div style={{
        position: 'absolute', bottom: 10, right: 12,
        background: 'rgba(20,22,30,0.75)', padding: '6px 10px', borderRadius: 6, fontSize: 12,
        display: 'flex', gap: 14,
      }}>
        <span>{aliveCount}/{total} alive</span>
        {activeDuel && <span style={{ color: '#FFE066' }}>· duel · round {activeDuel.round}</span>}
      </div>

      {/* Idle hint when no tournament has started */}
      {total === 0 && (
        <div style={{
          position: 'absolute', top: '48%', left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
          color: 'rgba(124,196,255,0.55)',
          fontSize: 14, letterSpacing: 3, fontWeight: 600,
          textShadow: '0 0 32px rgba(124,196,255,0.35)',
        }}>
          IDEA BATTLEGROUND
          <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.65, marginTop: 8, fontStyle: 'italic' }}>
            press start to summon a field of ideas
          </div>
        </div>
      )}
    </div>
  );
}

