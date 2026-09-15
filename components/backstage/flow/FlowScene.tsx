"use client";
import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { NODES, NODE_POS, EDGES, beamColor, GREEN, type Activity, type NodeId } from "@/lib/backstage/graph";
import { t } from "@/lib/i18n";

type Beam = { id: number; from: NodeId; to: NodeId; color: string; size: number };
let beamId = 0;

// Campo de partículas de fondo (drift lento, parallax con el ratón).
function Particles({ paused }: { paused: React.RefObject<boolean> }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useRef<THREE.BufferGeometry>(null);
  const positions = useRef<Float32Array | null>(null);
  if (!positions.current) {
    const n = 420;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 22;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 13;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    }
    positions.current = arr;
  }
  useFrame((_, dt) => {
    if (paused.current || !ref.current) return;
    ref.current.rotation.z += dt * 0.01;
  });
  return (
    <points ref={ref}>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[positions.current, 3]} />
      </bufferGeometry>
      <pointsMaterial color={GREEN} size={0.045} transparent opacity={0.35} sizeAttenuation />
    </points>
  );
}

function Edges() {
  return (
    <group>
      {EDGES.map(([a, b], i) => {
        const [ax, ay] = NODE_POS[a], [bx, by] = NODE_POS[b];
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ax, ay, 0), new THREE.Vector3(bx, by, 0),
        ]);
        return (
          <line key={i}>
            <primitive object={g} attach="geometry" />
            <lineBasicMaterial color={GREEN} transparent opacity={0.14} />
          </line>
        );
      })}
    </group>
  );
}

// Capa base viva (spec §B): puntos tenues recorriendo cada arista en bucle, para
// que el grafo respire aunque no pase nada. Baja intensidad; los haces de evento
// van por encima.
function BaseFlow({ paused }: { paused: React.RefObject<boolean> }) {
  const ref = useRef<THREE.Group>(null);
  const dots = EDGES.flatMap(([a, b], i) =>
    [0, 0.5].map((ph, j) => ({ a, b, phase: (i * 0.13 + ph) % 1, key: `${i}-${j}` })));
  useFrame((state) => {
    if (paused.current || !ref.current) return;
    ref.current.children.forEach((c, k) => {
      const d = dots[k];
      const [ax, ay] = NODE_POS[d.a], [bx, by] = NODE_POS[d.b];
      const p = (state.clock.elapsedTime * 0.18 + d.phase) % 1;
      c.position.set(ax + (bx - ax) * p, ay + (by - ay) * p, 0);
    });
  });
  return (
    <group ref={ref}>
      {dots.map((d) => (
        <mesh key={d.key}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color={GREEN} transparent opacity={0.55} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Node({ id, x, y }: { id: NodeId; x: number; y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  useFrame((state) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.18 + 0.06 * Math.sin(state.clock.elapsedTime * 1.2 + phase.current);
  });
  return (
    <group position={[x, y, 0]}>
      <mesh ref={ref}>
        <planeGeometry args={[2.6, 1.2]} />
        <meshBasicMaterial color={GREEN} transparent opacity={0.2} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(2.6, 1.2)]} />
        <lineBasicMaterial color={GREEN} transparent opacity={0.5} />
      </lineSegments>
      <Text position={[0, 0, 0.02]} fontSize={0.32} color="#f4f1e9" anchorX="center" anchorY="middle"
        maxWidth={2.3} textAlign="center">
        {t(`flujo.node.${id}`)}
      </Text>
    </group>
  );
}

function BeamMesh({ beam, onDone }: { beam: Beam; onDone: (id: number) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const born = useRef(0);
  const [from] = useState(() => NODE_POS[beam.from]);
  const [to] = useState(() => NODE_POS[beam.to]);
  const DUR = 1.2;
  useFrame((state) => {
    if (!ref.current) return;
    if (!born.current) born.current = state.clock.elapsedTime;
    const p = (state.clock.elapsedTime - born.current) / DUR;
    if (p >= 1) { onDone(beam.id); return; }
    ref.current.position.x = from[0] + (to[0] - from[0]) * p;
    ref.current.position.y = from[1] + (to[1] - from[1]) * p;
    const s = beam.size * (1 + 0.5 * Math.sin(p * Math.PI));
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} position={[from[0], from[1], 0.1]}>
      <sphereGeometry args={[0.16, 12, 12]} />
      <meshBasicMaterial color={beam.color} toneMapped={false} />
    </mesh>
  );
}

function Rig({ paused }: { paused: React.RefObject<boolean> }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    if (paused.current) return;
    camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.03;
    camera.position.y += (pointer.y * 0.8 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Scene({ pending, clearPending, reduced }: {
  pending: Activity[]; clearPending: () => void; reduced: boolean;
}) {
  const [beams, setBeams] = useState<Beam[]>([]);
  const paused = useRef(false);

  useEffect(() => {
    const onVis = () => { paused.current = document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (reduced || pending.length === 0) return;
    const spawned: Beam[] = [];
    for (const a of pending) {
      if (!(a.from_node in NODE_POS) || !(a.to_node in NODE_POS)) continue;
      spawned.push({
        id: beamId++,
        from: a.from_node as NodeId,
        to: a.to_node as NodeId,
        color: beamColor(a.kind),
        size: Math.min(0.6 + Math.log10(Math.max(a.magnitude, 1)) * 0.5, 2.4),
      });
    }
    if (spawned.length) setBeams((b) => [...b, ...spawned].slice(-28));
    clearPending();
  }, [pending, reduced, clearPending]);

  const removeBeam = (id: number) => setBeams((b) => b.filter((x) => x.id !== id));

  return (
    <>
      <color attach="background" args={["#060b09"]} />
      {!reduced && <Particles paused={paused} />}
      <Edges />
      {!reduced && <BaseFlow paused={paused} />}
      {NODES.map((n) => <Node key={n.id} id={n.id} x={n.x} y={n.y} />)}
      {!reduced && beams.map((b) => <BeamMesh key={b.id} beam={b} onDone={removeBeam} />)}
      {!reduced && <Rig paused={paused} />}
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.15} luminanceSmoothing={0.4} mipmapBlur />
      </EffectComposer>
    </>
  );
}

export default function FlowScene({ pending, clearPending, reduced, onContextLost }: {
  pending: Activity[]; clearPending: () => void; reduced: boolean; onContextLost?: () => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={reduced ? "demand" : "always"}
      camera={{ position: [0, 0, 14], fov: 45 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost?.(); // caer al grafo estático si el contexto se pierde
        });
      }}
    >
      <Scene pending={pending} clearPending={clearPending} reduced={reduced} />
    </Canvas>
  );
}
