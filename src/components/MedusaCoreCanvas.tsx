import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CoreSection =
  | 'hero'
  | 'optics'
  | 'bell'
  | 'pump'
  | 'arm'
  | 'siphon'
  | 'teardown';

export interface MedusaCoreProps {
  playheadRef: React.MutableRefObject<number>;
  playing: boolean;
  scrubbing: boolean;
  activeSection: CoreSection;
  showLabels: boolean;
  exploded: boolean;
  showWake: boolean;
  turntable: boolean;
  zenMode: boolean;
  onTickHud?: (t: number) => void;
}

const DUR = 25;
const ARMS = 8;
const N = 28;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const SECTION_TIMESTAMPS: Record<CoreSection, number> = {
  hero: 21.0,
  optics: 4.4,
  bell: 7.0,
  pump: 8.2,
  arm: 11.2,
  siphon: 13.8,
  teardown: 17.5,
};

type KeyframeList = [number, number][];

const TR: Record<string, KeyframeList> = {
  py: [[0, -5.2], [2.6, 0.25], [22.1, 0.25], [25, 7.6]],
  fol: [[0, 0.8], [2.6, 0], [21.9, 0], [23, 0.62], [24.2, 0.62], [25, 0.25]],
  tilt: [[0, 0.38], [2.6, 0], [22.1, 0], [23.2, 0.3], [25, 0.42]],
  roll: [[0, -0.22], [2.6, 0], [22.1, 0], [23.2, 0.18]],
  curl: [[0, 0.06], [1.5, 0.08], [3, 1], [21.9, 1], [23, 0.05], [25, 0.05]],
  jet: [[0, 1], [1.7, 1], [2.5, 0], [21.9, 0], [22.4, 1], [25, 1]],
  dist: [
    [0, 9.5], [2.7, 14], [3.4, 14], [4.3, 7.2], [5.6, 7.2],
    [6.5, 13], [9.3, 13], [10.1, 14.2], [12.1, 14.2], [12.9, 11.6],
    [14.9, 11.6], [15.9, 18], [20.3, 18], [21, 14.6], [22, 14.6],
    [23, 9.8], [25, 9.8],
  ],
  az: [
    [0, 0.55], [2.7, 0], [3.4, 0], [4.3, -0.62], [5.6, -0.18],
    [6.5, 0.3], [9.3, -0.28], [10.1, 0.5], [12.1, 0.72], [12.9, 0],
    [14.9, 0.3], [15.9, 0], [22, 0], [23, -0.5], [25, -0.3],
  ],
  turn: [[15.9, 0], [20.4, 5.76], [21.4, 6.2832], [25, 6.2832]],
  el: [
    [0, 0.12], [2.7, 0.06], [5.6, 0.1], [6.5, 0.34], [9.3, 0.3],
    [10.1, 0.12], [12.1, 0.1], [12.9, -0.82], [14.9, -0.72], [15.9, 0.1],
    [22, 0.1], [23, 0.02],
  ],
  ty: [
    [0, -0.3], [2.7, -0.75], [3.4, -0.75], [4.3, 0.45], [5.6, 0.45],
    [6.5, 0.95], [9.3, 0.95], [10.1, -0.75], [12.1, -0.75], [12.9, -0.5],
    [14.9, -0.5], [15.9, 0.2], [20.3, 0.2], [21, -0.65], [22, -0.65],
    [23, 0.2], [25, 0.5],
  ],
  tx: [
    [0, 0], [3.4, 0], [4.3, 0.35], [5.6, 0.35], [6.5, 0],
    [10.1, 0], [10.1, -0.8], [12.1, -0.8], [12.9, 0],
  ],
  optic: [[3.5, 0], [4.4, 1], [5.3, 1], [5.9, 0]],
  petal: [
    [5.8, 0], [6.7, 0.92], [9.2, 0.92], [10, 0],
    [15.9, 0], [16.9, 0.6], [19.4, 0.6], [20.5, 0],
  ],
  pump: [
    [6.7, 0], [7.8, 1], [9.1, 1], [9.9, 0],
    [15.9, 0], [16.9, 1], [19.4, 1], [20.5, 0],
  ],
  apart: [[10, 0], [10.9, 1], [11.8, 1], [12.5, 0]],
  siphon: [[12.9, 0], [13.7, 1], [14.7, 1], [15.4, 0]],
  expl: [[15.9, 0], [17.3, 1], [19.2, 1], [20.6, 0]],
};

export function sampleTimeline(k: KeyframeList, t: number): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const a = k[i - 1];
      const b = k[i];
      return b[0] === a[0]
        ? b[1]
        : mix(a[1], b[1], ease((t - a[0]) / (b[0] - a[0])));
    }
  }
  return k[k.length - 1][1];
}

export const beatAt = (t: number) => {
  const x = (t * 1.8) % 1;
  return x < 0.42 ? Math.sin((x / 0.42) * Math.PI) ** 2 : 0;
};

export const jetPressureAt = (t: number) =>
  18 + 1.4 * Math.sin(t * 1.3) + sampleTimeline(TR.jet, t) * beatAt(t) * 78;

const FOUNDER_LABELS: Record<
  CoreSection,
  [string, string, string, number, number][]
> = {
  hero: [
    ['optLens', '注意力语义镜头', '10 秒简报提纯 · 屏蔽杂音', 18, -11],
    ['petal', '防越界权限舱壁', '8 扇安全护栏门禁', -22, -7],
    ['pump', '多 Agent 调度核心', 'CLAUDE · WORKBUDDY · DEEPSEEK', 19, 3],
  ],
  optics: [
    ['optRim', '语义识别环', '18 路上下文解析', 16, -6],
    ['optIris', '红线判断光圈', '8 项硬规矩实时核验', 17, 1],
    ['optLens', '主控聚焦镜片', '翻译技术黑话为老板大白话', 17, 8],
    ['petal', '隔离门禁座', '越界操作即刻冻结', -24, 5],
  ],
  bell: [
    ['petal', '权限隔离舱壁', '8 扇防越界玻璃护栏已开启', 17, -9],
    ['pump', '主控核心仓', '公差底表受硬件级锁保护', -21, -6],
  ],
  pump: [
    ['pump', '调度执行核', '20 齿联动调度 · 等待拍板', 17, -7],
    ['petal', '玻璃安全罩', '开合度 92% · 隔离外部写入', -23, 2],
  ],
  arm: [
    ['armLink', '链路节点 14', 'Agent 分支越界已拆开隔离', -6, -11],
    ['pump', '调度主核', '等待老板补充外部口径后继续', 17, -3],
  ],
  siphon: [
    ['sipA', '外发风控套筒', '3 级不可逆动作拦截闸', -24, -5],
    ['sipB', '6 瓣外发喷口', '群发 / 删除 / 覆盖需人类确认', -21, 5],
  ],
  teardown: [
    ['pump', '多 Agent 内核', '全链路透视核验模式', 20, -14],
    ['optLens', '语义镜头', '大白话 + 因果链已就绪', 22, -1],
    ['armLink', '224 节点链路', '8 条并发执行臂拆解', -26, 5],
    ['sipA', '外发门禁座', '全项目规则挂钩', 20, 11],
  ],
};

// Reusable math scratchpads outside animation loop
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q0 = new THREE.Quaternion();
const _qk = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _o = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Y = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const nonIdx = (g: THREE.BufferGeometry) => {
  const x = g.index ? g.toNonIndexed() : g;
  x.deleteAttribute('uv2');
  return x;
};

const merge = (l: THREE.BufferGeometry[]) => mergeGeometries(l.map(nonIdx));

const place = (
  g: THREE.BufferGeometry,
  p: THREE.Vector3,
  q?: THREE.Quaternion,
  s?: THREE.Vector3
) =>
  g
    .clone()
    .applyMatrix4(
      new THREE.Matrix4().compose(
        p,
        q || new THREE.Quaternion(),
        s || new THREE.Vector3(1, 1, 1)
      )
    );

export function MedusaCoreCanvas({
  playheadRef,
  playing,
  scrubbing,
  activeSection,
  showLabels,
  exploded,
  showWake,
  turntable,
  zenMode,
  onTickHud,
}: MedusaCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leadersRef = useRef<SVGSVGElement | null>(null);
  const tagsRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef({
    playing,
    scrubbing,
    activeSection,
    showLabels,
    exploded,
    showWake,
    turntable,
    zenMode,
    onTickHud,
  });

  useEffect(() => {
    propsRef.current = {
      playing,
      scrubbing,
      activeSection,
      showLabels,
      exploded,
      showWake,
      turntable,
      zenMode,
      onTickHud,
    };
  }, [
    playing,
    scrubbing,
    activeSection,
    showLabels,
    exploded,
    showWake,
    turntable,
    zenMode,
    onTickHud,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const leaders = leadersRef.current;
    const tagWrap = tagsRef.current;
    if (!canvas || !leaders || !tagWrap) return;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.62;

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 120);

    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(5, 11, 8);
    key.castShadow = !isSoftwareGl;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -8,
      right: 8,
      top: 8,
      bottom: -8,
      near: 1,
      far: 40,
    });
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    scene.add(key, key.target);

    const fill = new THREE.DirectionalLight(0xbdeee9, 0.7);
    fill.position.set(-7, -2, 5);
    scene.add(fill);

    // Materials
    const ceramic = new THREE.MeshPhysicalMaterial({
      color: 0xf6f8f7,
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.22,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x10211f,
      roughness: 0.34,
      metalness: 0.7,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x9db3b1,
      roughness: 0.3,
      metalness: 0.9,
    });
    const coralMat = new THREE.MeshPhysicalMaterial({
      color: 0xff5536,
      roughness: 0.32,
      clearcoat: 0.5,
      emissive: 0xff3a18,
      emissiveIntensity: 0.14,
    });
    const aquaMat = new THREE.MeshPhysicalMaterial({
      color: 0x37cdbf,
      roughness: 0.25,
      clearcoat: 0.7,
      emissive: 0x17b5a6,
      emissiveIntensity: 0.12,
    });
    const rivetMat = new THREE.MeshStandardMaterial({
      color: 0x1c2d2c,
      roughness: 0.45,
      metalness: 0.5,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd6f5f1,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.5,
      specularIntensity: 1,
    });
    glassMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'float fr=pow(1.-abs(dot(normalize(vViewPosition),normal)),2.2);diffuseColor.a=mix(.1,.72,fr);outgoingLight+=vec3(.25,.75,.72)*fr*.3;\n#include <opaque_fragment>'
      );
    };
    const tealGlass = new THREE.MeshPhysicalMaterial({
      color: 0x0f6a68,
      roughness: 0.16,
      clearcoat: 1,
    });
    const lensGlass = new THREE.MeshPhysicalMaterial({
      color: 0x050e10,
      roughness: 0.05,
      metalness: 0.3,
      clearcoat: 1,
      envMapIntensity: 2,
    });

    const shadowed = (m: THREE.Mesh) => {
      m.castShadow = !isSoftwareGl;
      m.receiveShadow = !isSoftwareGl;
      return m;
    };

    // Bell assembly
    const R = 1.34;
    const H = 1.62;
    const prof = (u: number): [number, number] => {
      const a = (u * Math.PI) / 2;
      return [R * Math.cos(a) ** 0.82, H * Math.sin(a)];
    };
    const shell = (off: number, u0 = 0, u1 = 1) => {
      const p: THREE.Vector2[] = [];
      for (let i = 0; i <= 26; i++) {
        const [r, y] = prof(mix(u0, u1, i / 26));
        p.push(new THREE.Vector2(r + off, y + off * 0.6));
      }
      return p;
    };
    const sector = (off: number, a: number, b: number, u0: number, u1: number) =>
      new THREE.LatheGeometry(
        shell(off, u0, u1),
        Math.max(3, Math.round((b - a) * 16)),
        a,
        b - a
      );
    const onShell = (u: number, phi: number, off = 0) => {
      const [r, y] = prof(u);
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      return V((r + off) * s, y + off * 0.6, (r + off) * c);
    };

    const jf = new THREE.Group();
    scene.add(jf);
    const inner = new THREE.Group();
    jf.add(inner);

    const anchors: Record<string, THREE.Object3D> = {};
    const addAnchor = (
      name: string,
      parent: THREE.Object3D,
      x: number,
      y: number,
      z: number
    ) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      anchors[name] = o;
    };

    const petals: {
      piv: THREE.Group;
      tan: THREE.Vector3;
      rad: THREE.Vector3;
      box: THREE.Group;
    }[] = [];
    const rivetG = new THREE.SphereGeometry(0.0105, 8, 6);

    for (let i = 0; i < 8; i++) {
      const w = Math.PI / 4;
      const a = i * w - w / 2;
      const b = a + w;
      const mid = i * w;
      const hinge = onShell(0, mid);

      const piv = new THREE.Group();
      piv.position.copy(hinge);
      const box = new THREE.Group();
      box.position.copy(hinge).multiplyScalar(-1);
      piv.add(box);
      piv.rotation.order = 'YXZ';
      piv.rotation.y = 0;

      const pane = new THREE.Mesh(
        sector(0, a + 0.03, b - 0.03, 0.02, 0.9),
        glassMat
      );
      pane.renderOrder = 5;
      box.add(pane);

      const white = [
        sector(0.016, a, a + 0.075, 0, 0.94),
        sector(0.016, b - 0.075, b, 0, 0.94),
        sector(0.02, a, b, 0, 0.16),
        sector(0.02, a + 0.1, b - 0.1, 0.72, 0.86),
      ];
      const dots: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 11; k++) {
        const u = 0.04 + k * 0.082;
        dots.push(
          place(rivetG, onShell(u, a + 0.038, 0.03)),
          place(rivetG, onShell(u, b - 0.038, 0.03))
        );
      }
      for (let k = 0; k < 6; k++) {
        dots.push(
          place(rivetG, onShell(0.13, mix(a + 0.14, b - 0.14, k / 5), 0.036))
        );
      }
      box.add(
        shadowed(new THREE.Mesh(merge(white), ceramic)),
        new THREE.Mesh(merge(dots), rivetMat)
      );
      box.add(
        new THREE.Mesh(sector(0.026, a + 0.05, b - 0.05, 0.165, 0.178), dark)
      );
      const tagG =
        i % 2
          ? sector(0.03, mid - 0.06, mid + 0.06, 0.06, 0.105)
          : sector(0.03, mid - 0.14, mid - 0.05, 0.06, 0.105);
      box.add(new THREE.Mesh(tagG, i % 2 ? aquaMat : coralMat));
      inner.add(piv);

      petals.push({
        piv,
        tan: V(Math.cos(mid), 0, -Math.sin(mid)),
        rad: V(Math.sin(mid), 0, Math.cos(mid)),
        box,
      });
    }
    const petalAnchorPt = onShell(0.45, Math.PI / 4, 0.05);
    addAnchor(
      'petal',
      petals[1].box,
      petalAnchorPt.x,
      petalAnchorPt.y,
      petalAnchorPt.z
    );

    const capG = new THREE.Group();
    inner.add(capG);
    {
      const y0 = prof(0.92)[1];
      capG.add(
        shadowed(
          new THREE.Mesh(
            new THREE.LatheGeometry(
              [
                [0.001, 0.13],
                [0.12, 0.125],
                [0.27, 0.05],
                [0.3, 0],
                [0.27, -0.05],
                [0.001, -0.05],
              ].map((p) => new THREE.Vector2(p[0], p[1])),
              32
            ),
            ceramic
          )
        )
      );
      capG.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.2, 0.016, 8, 40)
            .rotateX(Math.PI / 2)
            .translate(0, 0.075, 0),
          coralMat
        )
      );
      capG.position.y = y0;
    }

    const chassis = new THREE.Group();
    inner.add(chassis);
    {
      const list: THREE.BufferGeometry[] = [
        new THREE.TorusGeometry(R * 0.9, 0.05, 10, 72)
          .rotateX(Math.PI / 2)
          .translate(0, 0.02, 0),
        new THREE.LatheGeometry(
          [
            [0.15, 0.34],
            [0.62, 0.3],
            [0.92, 0.1],
            [1.02, -0.04],
            [0.9, -0.2],
            [0.5, -0.3],
            [0.2, -0.3],
          ].map((p) => new THREE.Vector2(p[0], p[1])),
          48
        ),
      ];
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        list.push(
          place(
            new THREE.CylinderGeometry(0.022, 0.022, 0.86, 8).rotateZ(
              Math.PI / 2
            ),
            V(Math.sin(a) * 0.7, 0.12, Math.cos(a) * 0.7),
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, a - Math.PI / 2, 0)
            )
          )
        );
      }
      chassis.add(shadowed(new THREE.Mesh(merge(list), dark)));
      chassis.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(1.03, 0.022, 8, 72)
            .rotateX(Math.PI / 2)
            .translate(0, -0.03, 0),
          aquaMat
        )
      );
      chassis.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.6, 0.016, 8, 60)
            .rotateX(Math.PI / 2)
            .translate(0, -0.285, 0),
          coralMat
        )
      );
    }

    const gearShape = (r0: number, r1: number, hole: number, teeth: number) => {
      const s = new THREE.Shape();
      const n = teeth * 4;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = i % 4 < 2 ? r1 : r0;
        if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const h = new THREE.Path();
      h.absarc(0, 0, hole, 0, Math.PI * 2, true);
      s.holes.push(h);
      return s;
    };

    // Pump core
    const pump = new THREE.Group();
    inner.add(pump);
    const pumpSpin = new THREE.Group();
    pump.add(pumpSpin);
    const pistons: THREE.Group[] = [];
    {
      pump.add(
        shadowed(
          new THREE.Mesh(
            new THREE.LatheGeometry(
              [
                [0.001, -0.35],
                [0.34, -0.35],
                [0.38, -0.28],
                [0.38, -0.1],
                [0.5, -0.06],
                [0.5, 0.04],
                [0.36, 0.08],
                [0.36, 0.46],
                [0.42, 0.5],
                [0.42, 0.58],
                [0.26, 0.68],
                [0.001, 0.7],
              ].map((p) => new THREE.Vector2(p[0], p[1])),
              48
            ),
            dark
          )
        )
      );
      const coils: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        coils.push(
          new THREE.TorusGeometry(0.385, 0.017, 8, 48)
            .rotateX(Math.PI / 2)
            .translate(0, 0.13 + i * 0.055, 0)
        );
      }
      pump.add(new THREE.Mesh(merge(coils), aquaMat));
      const gear = new THREE.Mesh(
        new THREE.ExtrudeGeometry(gearShape(0.54, 0.62, 0.4, 20), {
          depth: 0.06,
          bevelEnabled: false,
        })
          .rotateX(Math.PI / 2)
          .translate(0, 0.02, 0),
        coralMat
      );
      pumpSpin.add(shadowed(gear));
      const g = new THREE.CylinderGeometry(0.038, 0.038, 0.3, 10);
      const head = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const x = Math.cos(a) * 0.47;
        const z = Math.sin(a) * 0.47;
        const o = new THREE.Group();
        o.position.set(x, 0.22, z);
        o.add(shadowed(new THREE.Mesh(g, steel)));
        const h = new THREE.Mesh(head, ceramic);
        h.position.y = 0.17;
        o.add(h);
        pumpSpin.add(o);
        pistons.push(o);
      }
      const fins: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        fins.push(
          place(
            new THREE.BoxGeometry(0.13, 0.22, 0.012),
            V(Math.cos(a) * 0.45, -0.23, Math.sin(a) * 0.45),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0))
          )
        );
      }
      pumpSpin.add(new THREE.Mesh(merge(fins), steel));
      pump.position.y = 0.35;
    }
    addAnchor('pump', pump, 0.5, 0.35, 0.1);

    // Optic
    const optic = new THREE.Group();
    inner.add(optic);
    const opHousing = new THREE.Group();
    const opRing = new THREE.Group();
    const opLens = new THREE.Group();
    const iris: THREE.Group[] = [];
    {
      optic.position.set(0, 0.58, 0.66);
      optic.add(opHousing, opRing, opLens);
      const cyl = new THREE.CylinderGeometry(0.34, 0.4, 0.36, 40).rotateX(
        Math.PI / 2
      );
      opHousing.add(shadowed(new THREE.Mesh(cyl, dark)));
      const g = new THREE.Mesh(
        new THREE.ExtrudeGeometry(gearShape(0.4, 0.46, 0.3, 18), {
          depth: 0.07,
          bevelEnabled: false,
        }),
        coralMat
      );
      opRing.add(shadowed(g));
      opRing.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.3, 0.022, 10, 48).translate(0, 0, 0.08),
          aquaMat
        )
      );
      const blade = new THREE.Shape();
      blade.moveTo(0, 0);
      blade.lineTo(0.2, -0.05);
      blade.quadraticCurveTo(0.3, 0.1, 0.12, 0.22);
      blade.lineTo(0, 0);
      const bg = new THREE.ExtrudeGeometry(blade, {
        depth: 0.008,
        bevelEnabled: false,
      });
      for (let i = 0; i < 8; i++) {
        const piv = new THREE.Group();
        const a = (i / 8) * Math.PI * 2;
        piv.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.18);
        piv.rotation.z = a + 1.9;
        piv.add(new THREE.Mesh(bg, steel));
        opHousing.add(piv);
        iris.push(piv);
      }
      opLens.add(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.23, 0.14, 40).rotateX(Math.PI / 2),
          dark
        )
      );
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.19,
          36,
          24,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        )
          .rotateX(Math.PI / 2)
          .scale(1, 1, 0.7)
          .translate(0, 0, 0.05),
        lensGlass
      );
      opLens.add(lens);
      opLens.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.2, 0.012, 8, 40).translate(0, 0, 0.07),
          coralMat
        )
      );
    }
    addAnchor('optRim', opRing, 0.3, 0.2, 0.08);
    addAnchor('optIris', opHousing, -0.05, -0.2, 0.2);
    addAnchor('optLens', opLens, 0.1, -0.1, 0.15);

    // Siphon
    const siphon = new THREE.Group();
    siphon.position.y = -0.32;
    inner.add(siphon);
    const slv: THREE.Group[] = [];
    const flaps: THREE.Group[] = [];
    {
      const mk = (r0: number, r1: number, m: THREE.Material) => {
        const g = new THREE.Group();
        g.add(
          shadowed(
            new THREE.Mesh(
              new THREE.CylinderGeometry(r0, r1, 0.24, 32, 1, true),
              m
            )
          )
        );
        g.add(
          new THREE.Mesh(
            new THREE.TorusGeometry(r1, 0.016, 8, 36)
              .rotateX(Math.PI / 2)
              .translate(0, -0.12, 0),
            aquaMat
          )
        );
        return g;
      };
      [
        mk(0.3, 0.26, ceramic),
        mk(0.25, 0.21, dark),
        mk(0.2, 0.16, ceramic),
      ].forEach((g) => {
        siphon.add(g);
        slv.push(g);
      });
      const s = new THREE.Shape();
      s.moveTo(-0.09, 0);
      s.lineTo(0.09, 0);
      s.lineTo(0.05, -0.24);
      s.lineTo(-0.05, -0.24);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, {
        depth: 0.014,
        bevelEnabled: false,
      }).translate(0, 0, 0.15);
      for (let i = 0; i < 6; i++) {
        const y = new THREE.Group();
        y.rotation.y = (i / 6) * Math.PI * 2;
        const x = new THREE.Group();
        x.position.z = 0;
        const m = shadowed(new THREE.Mesh(g, i % 2 ? coralMat : ceramic));
        x.add(m);
        y.add(x);
        slv[2].add(y);
        y.position.y = -0.12;
        flaps.push(x);
      }
    }
    addAnchor('sipA', siphon, 0.24, -0.2, 0.1);
    addAnchor('sipB', slv[2], -0.12, -0.2, 0.1);

    // Arms (8 x 28 links = 224 instanced links)
    const sleeveP = [
      [0, -0.41],
      [0.88, -0.41],
      [0.97, -0.37],
      [1, -0.31],
      [1, 0.31],
      [0.97, 0.37],
      [0.88, 0.41],
      [0, 0.41],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const G = {
      sleeve: new THREE.LatheGeometry(sleeveP, 24),
      collar: new THREE.CylinderGeometry(0.74, 0.74, 0.95, 18, 1, true),
      ring: new THREE.TorusGeometry(1.0, 0.022, 6, 28)
        .rotateX(Math.PI / 2)
        .translate(0, 0.26, 0),
      window: new THREE.BoxGeometry(0.3, 0.24, 0.06).translate(0, 0, 0.985),
      tagb: new THREE.BoxGeometry(0.14, 0.5, 0.05).translate(0.56, 0, 0.84),
      struts: merge(
        [0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2 + 0.6;
          return new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6).translate(
            Math.cos(a) * 0.5,
            0,
            Math.sin(a) * 0.5
          );
        })
      ),
      bolts: merge(
        Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return new THREE.SphereGeometry(0.05, 6, 5).translate(
            Math.sin(a) * 1,
            i % 2 ? -0.22 : 0.22,
            Math.cos(a) * 1
          );
        })
      ),
    };
    const inst = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
      const x = new THREE.InstancedMesh(g, m, ARMS * N);
      x.frustumCulled = false;
      x.castShadow = cast && !isSoftwareGl;
      x.receiveShadow = cast && !isSoftwareGl;
      x.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      jf.add(x);
      return x;
    };
    const P = {
      sleeve: inst(G.sleeve, ceramic),
      collar: inst(G.collar, dark),
      ring: inst(G.ring, aquaMat, false),
      window: inst(G.window, tealGlass, false),
      tagb: inst(G.tagb, coralMat, false),
      struts: inst(G.struts, steel),
      bolts: inst(G.bolts, rivetMat, false),
    };
    const armPt = V(0, 0, 0);
    const armMark = new THREE.Object3D();
    jf.add(armMark);
    anchors.armLink = armMark;

    const setPart = (
      mesh: THREE.InstancedMesh,
      idx: number,
      ox: number,
      oy: number,
      oz: number,
      sx: number,
      sy: number,
      sz: number,
      on = true
    ) => {
      if (!on) {
        _m.makeScale(0, 0, 0);
        mesh.setMatrixAt(idx, _m);
        return;
      }
      _o.set(ox, oy, oz).applyQuaternion(_q).add(_p);
      _s.set(sx, sy, sz);
      _m.compose(_o, _q, _s);
      mesh.setMatrixAt(idx, _m);
    };

    const poseArms = (
      S: Record<string, number>,
      t: number
    ) => {
      for (let a = 0; a < ARMS; a++) {
        const phi = ((a + 0.5) * Math.PI) / 4;
        const ev = a % 2 === 0;
        const sn = Math.sin(phi);
        const cs = Math.cos(phi);
        const ap = a === 2 ? S.apart : 0;
        const e = S.expl;
        const a0 = mix(1.42, ev ? 0.34 : 0.9, S.curl);
        const c = Math.cos(a0);
        const s = Math.sin(a0);
        _y.set(sn * c, -s, cs * c);
        _z.set(-cs, 0, sn);
        _x.crossVectors(_y, _z);
        _b.makeBasis(_x, _y, _z);
        _q.setFromRotationMatrix(_b);
        _p.set(sn * 0.78, -0.24, cs * 0.78);
        const pulse = S.pulse;
        const hair = (ev ? 1 : 0.8) * (0.92 + hash(a) * 0.18);
        const sp = ev ? 1 : -1;

        for (let i = 0; i < N; i++) {
          const u = i / (N - 1);
          const f = mix(1, 0.26, u ** 1.15) * (ev ? 1 : 0.9);
          const L = 0.33 * f;
          const r = 0.2 * f;
          const wave =
            0.05 * Math.sin(5.5 * u - t * 1.5 + a * 1.7) * (0.35 + u);
          const kHold =
            (ev ? 0.07 : 0.04) +
            0.78 * u ** 3.6 * hair +
            0.075 * Math.sin(u * 8.2 + a * 2.1 + 0.8) * (1 - u * 0.6) -
            (ev ? 0.13 : 0.06) * Math.exp(-(((u - 0.12) / 0.1) ** 2)) +
            wave;
          const kTrail =
            0.012 * Math.sin(a * 2.1) +
            0.09 * Math.sin(6 * u - t * 6 + a) * (0.3 + u) * (1 + pulse * 0.5) +
            (0.012 + 0.2 * u ** 5) * S.jet;
          let k = mix(kTrail, kHold, S.curl);
          if (ap) k = mix(k, 0.012 * Math.sin(u * 7), ap);
          if (i) {
            _qk.setFromAxisAngle(AX_Z, k);
            _q.multiply(_qk);
            _qk.setFromAxisAngle(
              AX_X,
              0.018 * sp * Math.sin(u * 5 + t * 0.7 + a)
            );
            _q.multiply(_qk);
            _qk.setFromAxisAngle(AX_Y, 0.03 * u * sp);
            _q.multiply(_qk);
          }
          _d.set(0, 1, 0).applyQuaternion(_q);
          const gap =
            1 + ap * 1.25 + e * (0.5 + hash(a * 31 + i) * 0.55);
          _p.addScaledVector(_d, L * 0.5 * gap);
          const hi = hash(a * 13 + i * 7);
          const idx = a * N + i;
          let ex = 0;
          if (e) {
            _x.set(_p.x, _p.y + 0.3, _p.z);
            ex = e * (0.16 + hi * 0.24);
          }
          const px = _p.x;
          const py = _p.y;
          const pz = _p.z;
          if (e) _p.addScaledVector(_x, ex);
          if (e) {
            _qk.setFromAxisAngle(AX_X, e * (hi - 0.5) * 1.5);
            _q0.copy(_q);
            _q.multiply(_qk);
          }
          const pa = ap * L * 0.22 + e * L * 0.5;
          const pb = e * r * 1.2;
          setPart(P.sleeve, idx, 0, pa * 0.2, 0, r, L, r);
          setPart(P.collar, idx, 0, -pa, 0, r, L, r);
          setPart(P.ring, idx, 0, pa * 0.8, 0, r, L, r);
          setPart(P.struts, idx, 0, -pa * 1.7, 0, r, L * (1 + e * 0.3), r);
          setPart(P.bolts, idx, 0, pa * 0.2, 0, r, L, r);
          setPart(P.window, idx, 0, 0, pb, r, L, r, i % 4 !== 1);
          setPart(P.tagb, idx, pb * 0.6, 0, pb * 0.6, r, L, r, i % 5 === 2);
          if (e) _q.copy(_q0);
          _p.set(px, py, pz);
          _p.addScaledVector(_d, L * 0.5 * gap);
          if (a === 2 && i === 13) armPt.copy(_p);
        }
      }
      P.sleeve.instanceMatrix.needsUpdate = true;
      P.collar.instanceMatrix.needsUpdate = true;
      P.ring.instanceMatrix.needsUpdate = true;
      P.window.instanceMatrix.needsUpdate = true;
      P.tagb.instanceMatrix.needsUpdate = true;
      P.struts.instanceMatrix.needsUpdate = true;
      P.bolts.instanceMatrix.needsUpdate = true;
    };

    // Wake bubbles + orbital stage rings + floor shadow
    const BUB = 90;
    const bubMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.1,
      transparent: true,
      opacity: 0.5,
      envMapIntensity: 1.6,
    });
    const bubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 10),
      bubMat,
      BUB
    );
    bubbles.frustumCulled = false;
    bubbles.renderOrder = 6;
    scene.add(bubbles);

    const rings = new THREE.Group();
    scene.add(rings);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x97bcbb,
      transparent: true,
      opacity: 0.55,
    });
    const dashMat = new THREE.LineDashedMaterial({
      color: 0x97bcbb,
      transparent: true,
      opacity: 0.45,
      dashSize: 0.14,
      gapSize: 0.1,
    });
    const nodeG = new THREE.RingGeometry(0.05, 0.075, 24);
    const nodeM = new THREE.MeshBasicMaterial({
      color: 0x97bcbb,
      side: THREE.DoubleSide,
    });
    const ringSpec: [number, number, number, number][] = [
      [4.6, 0.22, 0.3, 0],
      [6.4, -0.5, 0.2, 1],
      [5.5, 1.28, -0.2, 0],
      [8, 0.55, -0.5, 1],
      [3.1, 1.46, 0.02, 0],
    ];
    const ringObjs = ringSpec.map(([r, rx, rz, dash], i) => {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 180; k++) {
        const a = (k / 180) * Math.PI * 2;
        pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.Line(g, dash ? dashMat : ringMat);
      if (dash) l.computeLineDistances();
      const o = new THREE.Group();
      o.rotation.set(rx, 0, rz);
      o.add(l);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + i;
        const n = new THREE.Mesh(nodeG, nodeM);
        n.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        o.add(n);
      }
      rings.add(o);
      return o;
    });

    const shC = document.createElement('canvas');
    shC.width = shC.height = 256;
    {
      const c = shC.getContext('2d');
      if (c) {
        const g = c.createRadialGradient(128, 128, 8, 128, 128, 128);
        g.addColorStop(0, 'rgba(40,110,110,.34)');
        g.addColorStop(0.5, 'rgba(40,110,110,.12)');
        g.addColorStop(1, 'rgba(40,110,110,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 256, 256);
      }
    }
    const floorTex = new THREE.CanvasTexture(shC);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    const floorMat = new THREE.MeshBasicMaterial({
      map: floorTex,
      transparent: true,
      depthWrite: false,
    });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2),
      floorMat
    );
    floor.position.y = -5.2;
    scene.add(floor);

    // Floating SVG leader lines + labels
    const MAXT = 4;
    const tagEls: {
      d: HTMLDivElement;
      l: SVGLineElement;
      c: SVGCircleElement;
      key: string;
    }[] = [];
    tagWrap.innerHTML = '';
    leaders.innerHTML = '';
    for (let i = 0; i < MAXT; i++) {
      const d = document.createElement('div');
      d.className = 'medusa-tag';
      d.style.opacity = '0';
      tagWrap.append(d);
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '2.4');
      l.setAttribute('stroke', '#ff5a3c');
      l.setAttribute('stroke-width', '1');
      c.setAttribute('fill', '#ff5a3c');
      leaders.append(l, c);
      tagEls.push({ d, l, c, key: '' });
    }

    let W = 1;
    let H_ = 1;
    const handleResize = () => {
      W = window.innerWidth;
      H_ = window.innerHeight;
      renderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75)
      );
      renderer.setSize(W, H_, false);
      camera.aspect = W / H_;
      camera.updateProjectionMatrix();
      leaders.setAttribute('viewBox', `0 0 ${W} ${H_}`);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // Pointer orbit interaction
    let orbitX = 0;
    let orbitY = 0;
    let orbitXs = 0;
    let orbitYs = 0;
    let drag: [number, number] | null = null;
    const onPointerDown = (e: PointerEvent) => {
      drag = [e.clientX, e.clientY];
      canvas.classList.add('cursor-grabbing');
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      orbitX -= (e.clientX - drag[0]) * 0.006;
      orbitY = clamp(orbitY + (e.clientY - drag[1]) * 0.004, -0.9, 0.9);
      drag = [e.clientX, e.clientY];
    };
    const endDrag = () => {
      drag = null;
      canvas.classList.remove('cursor-grabbing');
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    const S: Record<string, number> = {};
    let frameId = 0;
    let disposed = false;
    let last = performance.now();
    let hudThrottle = 0;
    let cockpitBlend = 1;

    const applyFrame = (t: number, wall: number, dt: number) => {
      const cfg = propsRef.current;
      for (const k in TR) S[k] = sampleTimeline(TR[k], t);

      if (cfg.exploded) {
        S.expl = THREE.MathUtils.damp(S.expl, 1, 6, dt);
        S.petal = Math.max(S.petal, 0.6);
        S.pump = 1;
      }

      S.pulse = beatAt(t) * Math.max(S.jet, 0.1);
      const idle = 1 - S.jet;

      // In Cockpit mode, keep a steady framing centered inside the open upper-center window above the Hero card
      cockpitBlend = THREE.MathUtils.damp(
        cockpitBlend,
        cfg.zenMode ? 0 : 1,
        5,
        dt
      );

      jf.position.set(0, S.py + idle * 0.07 * Math.sin(t * 1.1), 0);
      jf.rotation.set(
        S.tilt + idle * 0.02 * Math.sin(t * 0.8),
        0,
        S.roll + idle * 0.02 * Math.sin(t * 0.6)
      );

      const squeeze = S.pulse * (S.jet > 0.05 ? 0.16 : 0.035);
      petals.forEach((p, i) => {
        const open = S.petal * 1.3;
        p.piv.quaternion.setFromAxisAngle(p.tan, open - squeeze);
        p.piv.position
          .copy(p.rad)
          .multiplyScalar(prof(0)[0] * (1 - squeeze * 0.35) + S.expl * 0.75);
        p.piv.position.y = S.expl * 0.25 * (i % 2 ? 1 : 0.4);
      });

      capG.position.y = prof(0.92)[1] + S.pump * 1.05 + S.expl * 0.55;
      pump.position.y = 0.35 + S.pump * 1.45 + S.expl * 0.4;
      pumpSpin.rotation.y = t * (1.2 + S.jet * 5) + S.pump * 9;
      pistons.forEach((o, i) => {
        o.position.y =
          0.22 + 0.04 * Math.sin(t * 7 + i * 0.9) * (0.4 + S.pump);
      });

      const oe = Math.max(S.optic, S.expl);
      optic.position.z = 0.62 + S.expl * 1.15;
      opRing.position.z = 0.16 + oe * 0.24;
      opRing.rotation.z = oe * 3.4 + t * 0.05;
      opLens.position.z = 0.2 + oe * 0.46;
      opLens.rotation.z = -oe * 2;
      iris.forEach((p, i) => {
        p.rotation.z = (i / 8) * Math.PI * 2 + 1.9 + oe * 0.95;
        p.position.z = 0.18 + oe * 0.1;
      });

      const se = Math.max(S.siphon, S.expl * 0.7);
      slv[0].position.y = -0.12 - se * 0.12;
      slv[1].position.y = -0.22 - se * 0.32;
      slv[2].position.y = -0.28 - se * 0.56 - S.pulse * 0.03;
      flaps.forEach((f) => {
        f.rotation.x = -0.7 + se * 1.45 + S.pulse * 0.25;
      });
      siphon.position.y = -0.32 - S.expl * 0.85;

      poseArms(S, t);
      armMark.position.copy(armPt);

      const wakeOn = cfg.showWake ? 1 : 0;
      const nz = _tmp
        .set(0, -1.2, 0)
        .applyMatrix4(
          jf.matrixWorld.compose(
            jf.position,
            jf.quaternion,
            _tmp2.set(1, 1, 1)
          )
        );
      const dir = _tmp2.set(0, -1, 0).applyQuaternion(jf.quaternion).clone();
      for (let i = 0; i < BUB; i++) {
        const h = hash(i + 3);
        const h2 = hash(i * 2 + 9);
        const life = (t * (0.55 + h * 0.4) + h2) % 1;
        const s = wakeOn * (1 - life) * (0.018 + h * 0.05);
        _p.copy(nz).addScaledVector(dir, life * (3 + h * 5));
        const a = i * 2.4;
        const rr = life * (0.3 + h2 * 0.9);
        _p.x += Math.cos(a) * rr;
        _p.z += Math.sin(a) * rr;
        _p.y -= life * life * 0.4;
        _m.compose(
          _p,
          _q0.identity(),
          _s.setScalar(Math.max(s, 0.00001))
        );
        bubbles.setMatrixAt(i, _m);
      }
      bubbles.instanceMatrix.needsUpdate = true;

      rings.position.y = -0.3 + S.py * 0.1;
      ringObjs.forEach((o, i) => {
        o.rotation.y = t * 0.03 * (i % 2 ? 1 : -1) + S.expl * 0.6 + i;
      });
      rings.scale.setScalar(1 + (S.dist - 12) * 0.03);
      floorMat.opacity =
        clamp(1 - Math.abs(S.py - 0.25) * 0.4, 0, 1) * (S.el < -0.2 ? 0.4 : 1);

      orbitXs += (orbitX - orbitXs) * 0.12;
      orbitYs += (orbitY - orbitYs) * 0.12;
      const turn = cfg.turntable ? wall * 0.45 : S.turn;
      const az = S.az + turn + orbitXs;
      const el = clamp(S.el + orbitYs, -1.3, 1.3);
      const portrait = clamp(1.35 / camera.aspect, 1, 2.1);
      const baseDist = cfg.zenMode ? S.dist : Math.max(S.dist, 14.2) * 1.18;
      const d = baseDist * portrait;
      const zenLookY = S.ty + S.fol * S.py;
      const cockpitLookY = -1.05;
      const lookY = THREE.MathUtils.lerp(zenLookY, cockpitLookY, cockpitBlend);
      const tg = _tmp.set(S.tx * (1 - cockpitBlend * 0.65), lookY, 0);
      camera.position.set(
        tg.x + Math.sin(az) * Math.cos(el) * d,
        tg.y + Math.sin(el) * d,
        tg.z + Math.cos(az) * Math.cos(el) * d
      );
      camera.lookAt(tg);

      key.target.position.copy(jf.position);
      key.position.set(
        jf.position.x + 5,
        jf.position.y + 11,
        jf.position.z + 8
      );

      // Floating coral leader-line tags (clamped inside open upper-center window, clear of side rails)
      const want = cfg.showLabels
        ? FOUNDER_LABELS[cfg.activeSection] || FOUNDER_LABELS.hero
        : [];
      const railReserve = !cfg.zenMode && W >= 1024 ? 330 : 24;
      tagEls.forEach((e, i) => {
        const l = want[i];
        if (!l || !anchors[l[0]]) {
          e.d.style.opacity = '0';
          e.l.setAttribute('opacity', '0');
          e.c.setAttribute('opacity', '0');
          return;
        }
        if (e.key !== l[1]) {
          e.key = l[1];
          e.d.innerHTML = `<b></b>${l[1]}<i>${l[2]}</i>`;
        }
        anchors[l[0]].updateWorldMatrix(true, false);
        _tmp.setFromMatrixPosition(anchors[l[0]].matrixWorld).project(camera);
        const x = ((_tmp.x + 1) / 2) * W;
        const y = ((1 - _tmp.y) / 2) * H_;
        const labelW = e.d.offsetWidth || 150;
        const left = l[3] < 0;
        const rawLx = W / 2 + l[3] * 8.5 + (x - W / 2) * 0.18;
        const lx = left
          ? clamp(rawLx, railReserve + labelW, Math.max(railReserve + labelW, W / 2 - 14))
          : clamp(rawLx, Math.min(W - railReserve - labelW, W / 2 + 14), Math.max(W / 2 + 14, W - railReserve - labelW));
        const maxBottom = cfg.zenMode ? H_ - 135 : H_ * 0.41;
        const ly = clamp(
          (cfg.zenMode ? H_ * 0.48 : H_ * 0.25) + l[4] * 9,
          92,
          maxBottom
        );
        e.d.style.transform = `translate(${lx - (left ? labelW : 0)}px, ${ly - 6}px)`;
        e.d.style.opacity = '1';
        const endx = left ? lx + 5 : lx - 5;
        e.l.setAttribute('x1', String(x));
        e.l.setAttribute('y1', String(y));
        e.l.setAttribute('x2', String(endx));
        e.l.setAttribute('y2', String(ly));
        e.l.setAttribute('opacity', '0.78');
        e.c.setAttribute('cx', String(x));
        e.c.setAttribute('cy', String(y));
        e.c.setAttribute('opacity', '0.95');
      });
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = (now: number) => {
      if (disposed) return;
      const cfg = propsRef.current;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (cfg.playing && !cfg.scrubbing) {
        playheadRef.current = (playheadRef.current + dt) % DUR;
      }
      applyFrame(playheadRef.current, now / 1000, dt);
      renderer.render(scene, camera);

      hudThrottle += dt;
      if (hudThrottle >= 0.08 && cfg.onTickHud) {
        hudThrottle = 0;
        cfg.onTickHud(playheadRef.current);
      }

      if (isSoftwareGl) {
        afterDraw(() => tick(performance.now()));
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      envTex.dispose();
      pmrem.dispose();
      floorTex.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [playheadRef]);

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        id="gl"
        className="w-full h-full block pointer-events-auto cursor-grab touch-none"
      />
      <svg
        ref={leadersRef}
        id="leaders"
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div
        ref={tagsRef}
        id="tags"
        className="absolute inset-0 pointer-events-none"
      />
    </div>
  );
}
