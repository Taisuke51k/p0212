/* =========================
   Prototype_0212 (external) — FULL REPLACE JS (Section-driven + Smooth shape morph)
   - Fixed fullscreen SVG background (Studio貼り付け想定)
   - セクション切替（画面上部）をトリガーに：
       shape / morph / scale / centerX をイージングで遷移
   - philosophy はセクション内進行で 4状態：
       1) sphere, morph 0
       2) sphere, morph 1
       3) cube,   morph 1
       4) tetra,  morph 1
     さらに shape は sphere→cube / cube→tetra を“滑らか補間”可能
   - 常時ゆっくり自動回転
   - 影（楕円＋軽いぼかし）は scale/center に追従
   - 線は multiply（乗算）
   - 線幅は表示スケールに比例（vector-effect は使わない）
   ========================= */

(() => {
  const boot = () => {
    try {
      /* =========================
     FLAGS
  ========================= */

      // GUI表示フラグ（lil-guiを読み込んでいる場合のみ有効）
      const SHOW_GUI = false;

      // セクション切替トリガー位置
      // 0   = 画面上端
      // 0.5 = 画面中央
      // 1   = 画面下端
      const SECTION_TRIGGER_RATIO = 0.5;

      /* =========================
     BASE THEME / STYLE
  ========================= */

      const THEME = {
        // 背景色（bodyに適用）
        bg: "#ffffff",
      };

      const STYLE = {
        // 線の色
        stroke: "#264226",

        // 基準線幅（scale = CONFIG.scale のときの太さ）
        // scaleMul に比例して変化する
        strokeWidthBase: 6,

        // 線の透明度（奥行き演出と併用可）
        strokeOpacity: 1.0,

        // true で mix-blend-mode: multiply
        // 線の重なりが濃くなる
        multiply: true,
      };

      /* =========================
     CORE CONFIG（もじゃもじゃの物理）
  ========================= */

      const CONFIG = {
        // 同時に描くストランド（糸）の本数
        // 増やすと密度UP・重くなる
        strands: 10,

        // 1本あたりの3D点数
        // 滑らかさに直結・最も重いパラメータ
        pointsPerStrand: 300,

        // 仮想球の半径（内部で糸が動く範囲）
        // 形状モーフの基準スケール
        radius: 1.0,

        // 1ステップで進む距離
        // 大きいほど荒く・小さいほど密で滑らか
        step: 0.1,

        /* ====== カメラ / 表示 ====== */

        // 透視投影のカメラ距離
        // 小さい → パース強い
        // 大きい → フラット寄り
        cameraDistance: 3.2,

        // 基準表示スケール
        // セクションごとの scaleMul がこれに掛かる
        scale: 120,

        // 回転などのイージング係数
        // 小さいほどヌルヌル遅い
        // 大きいほど追従速い
        ease: 0.1,

        /* ====== 2Dスムージング ====== */

        // 2D平滑化パス回数
        // 0でもOK（軽量）
        smoothPasses: 1,

        // 2D平滑化の強さ
        // 0.1〜0.2が自然
        smoothStrength: 0.16,

        // Catmull-Rom → Bezier の張り具合
        // 0.5が自然 / 1に近いほど鋭い
        splineAlpha: 0.5,

        // SVG座標の小数桁
        // 下げると軽くなる
        precision: 5,

        /* ====== 3Dランダム回転制御 ====== */

        // 1ステップあたりの最小回転角（度）
        // 大きいと荒れる
        minTurnDeg: 1,

        // 回転のランダム幅（度）
        turnJitterDeg: 0.5,

        // 回転軸の揺らぎ量
        // 大きいほど暴れる
        axisWander: 0.1,

        // 回転軸の減衰率（1に近いほど滑らか）
        axisDamping: 0.94,

        /* ====== 中心引力制御 ====== */

        // 中心へ引き戻す力
        // 大きいと密集
        centerPull: 0.1,

        // 外周に近づいたときの追加引力
        edgeInBias: 0.2,

        // 外周補正の強さ（指数）
        // 高いほど外周で急に戻る
        edgePower: 2.0,

        /* ====== 球外反射 ====== */

        // 球壁に当たったときの反発強度
        // 1 = 完全反射
        // 0 = そのまま
        softBounce: 0.5,

        /* ====== 表示窓 ====== */

        // SVG viewBox 半径
        // 大きいほど余白増える
        viewRadius: 160,
      };

      /* =========================
     ROTATION（常時回転）
  ========================= */

      const ROT = {
        // 自動回転ON/OFF
        autoEnabled: true,

        // Y軸回転速度（度/秒）
        autoDegPerSecY: 5.0,

        // X軸回転速度（度/秒）
        autoDegPerSecX: 2.6,
      };

      /* =========================
     TRANSITION（セクション遷移）
  ========================= */

      const TRANS = {
        // セクションtargetへの追従スピード
        // 0.05〜0.2推奨
        follow: 0.12,

        // philosophyでの shape 切替ブレンド幅
        // 小さい → パキッ
        // 大きい → ヌルッ
        philosophyBlendWidth: 0.1,
      };

      /* =========================
     SHADOW（床影）
  ========================= */

      const SHADOW = {
        // 影を出すかどうか
        enabled: true,

        // 影の濃さ
        opacity: 0.14,

        // ガウスぼかし強度
        // 大きいと柔らかい・重くなる
        blurStdDev: 10,

        // 中心からどれだけ下に置くか
        // scale に追従
        yOffset: 0.4,

        // 影の横幅（viewRadius比）
        rxRatio: 0.55,

        // 影の縦幅（viewRadius比）
        ryRatio: 0.13,
      };

      /* =========================
         DOUBLE MOUNT GUARD
      ========================= */
      if (window.__P0212_MOUNTED__) {
        console.warn("[P0212] already mounted");
        return;
      }
      window.__P0212_MOUNTED__ = true;

      /* =========================
         CSS INJECT
      ========================= */
      const css = `
:root{ --p0212-bg:${THEME.bg}; }
body{ background:var(--p0212-bg); overflow-x:hidden; }

/* スクロール長確保（必要なら） */
.p0212-spacer{ height:480vh; }

.p0212-stage{
  position:fixed; inset:0;
  width:100vw; height:100vh;
  overflow:hidden;
  pointer-events:none; /* 背景運用 */
  z-index:0;
}

#p0212-out{
  position:absolute; inset:0;
  width:100vw; height:100vh;
  display:block;
  --stroke:${STYLE.stroke};
  --strokeWidth:${STYLE.strokeWidthBase};
  --strokeOpacity:${STYLE.strokeOpacity};
}

#p0212-out .strand{
  fill:none;
  stroke:var(--stroke);
  stroke-width:var(--strokeWidth);
  stroke-linecap:round;
  stroke-linejoin:round;
  opacity:var(--strokeOpacity);
  ${STYLE.multiply ? "mix-blend-mode:multiply;" : ""}
  /* vector-effect: non-scaling-stroke;  ← 使わない（線幅をスケールに比例させたい） */
}

#p0212-out .p0212-shadow{
  fill:#000;
  opacity:${SHADOW.opacity};
}
      `.trim();

      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-p0212", "style");
      styleEl.textContent = css;
      document.head.appendChild(styleEl);

      /* =========================
         DOM MOUNT (external)
      ========================= */
      function ensureDOM() {
        let spacer = document.querySelector(".p0212-spacer");
        if (!spacer) {
          spacer = document.createElement("div");
          spacer.className = "p0212-spacer";
          document.body.appendChild(spacer);
        }

        let stage = document.querySelector(".p0212-stage");
        if (!stage) {
          stage = document.createElement("div");
          stage.className = "p0212-stage";
          document.body.appendChild(stage);
        }

        let svg = document.querySelector("#p0212-out");
        if (!svg) {
          svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("id", "p0212-out");
          svg.setAttribute("aria-label", "yarn ball background");
          svg.setAttribute("role", "img");
          stage.appendChild(svg);
        }

        return { svg, spacer };
      }

      const { svg: outSvg, spacer: spacerEl } = ensureDOM();

      /* =========================
         HELPERS
      ========================= */
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const lerp = (a, b, t) => a + (b - a) * t;
      const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
      const smoothstep = (t) => {
        t = clamp(t, 0, 1);
        return t * t * (3 - 2 * t);
      };

      function mulberry32(seed) {
        let t = seed >>> 0;
        return function () {
          t += 0x6d2b79f5;
          let r = Math.imul(t ^ (t >>> 15), 1 | t);
          r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
          return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
      }

      function randomPointInSphere(rng, R) {
        let x1, x2, s;
        do {
          x1 = rng() * 2 - 1;
          x2 = rng() * 2 - 1;
          s = x1 * x1 + x2 * x2;
        } while (s >= 1 || s === 0);
        const z = 1 - 2 * s;
        const f = 2 * Math.sqrt(1 - s);
        const nx = x1 * f,
          ny = x2 * f,
          nz = z;
        const rr = Math.cbrt(rng()) * R;
        return { x: nx * rr, y: ny * rr, z: nz * rr };
      }

      function norm(v) {
        const m = Math.hypot(v.x, v.y, v.z) || 1;
        return { x: v.x / m, y: v.y / m, z: v.z / m };
      }
      function dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
      }
      function add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
      }
      function sub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
      }
      function mul(a, s) {
        return { x: a.x * s, y: a.y * s, z: a.z * s };
      }
      function cross(a, b) {
        return {
          x: a.y * b.z - a.z * b.y,
          y: a.z * b.x - a.x * b.z,
          z: a.x * b.y - a.y * b.x,
        };
      }

      function rotateAroundAxis(v, k, theta) {
        const ct = Math.cos(theta),
          st = Math.sin(theta);
        const kv = dot(k, v);
        const kxv = cross(k, v);
        return {
          x: v.x * ct + kxv.x * st + k.x * kv * (1 - ct),
          y: v.y * ct + kxv.y * st + k.y * kv * (1 - ct),
          z: v.z * ct + kxv.z * st + k.z * kv * (1 - ct),
        };
      }

      function rotateXY(v, rx, ry) {
        let { x, y, z } = v;
        {
          const c = Math.cos(rx),
            s = Math.sin(rx);
          const y2 = y * c - z * s;
          const z2 = y * s + z * c;
          y = y2;
          z = z2;
        }
        {
          const c = Math.cos(ry),
            s = Math.sin(ry);
          const x2 = x * c + z * s;
          const z2 = -x * s + z * c;
          x = x2;
          z = z2;
        }
        return { x, y, z };
      }

      function project(v, d) {
        const k = d / (d - v.z);
        return { x: v.x * k, y: v.y * k, z: v.z };
      }

      function smoothPoints2D(pts, strength = 0.16, passes = 1) {
        let out = pts.map((p) => ({ x: p.x, y: p.y }));
        for (let k = 0; k < passes; k++) {
          out = out.map((p, i) => {
            if (i === 0 || i === out.length - 1) return p;
            const a = out[i - 1],
              b = out[i],
              c = out[i + 1];
            const mx = (a.x + b.x + c.x) / 3,
              my = (a.y + b.y + c.y) / 3;
            return { x: lerp(b.x, mx, strength), y: lerp(b.y, my, strength) };
          });
        }
        return out;
      }

      function pointsToSmoothBezierPath(points, alpha = 0.5, precision = 5) {
        const pts = points,
          n = pts.length;
        if (n < 2) return "";
        const get = (i) => pts[clamp(i, 0, n - 1)];
        const fmt = (v) => Number(v).toFixed(precision);
        const tj = (ti, pi, pj) => {
          const dx = pj.x - pi.x,
            dy = pj.y - pi.y;
          const d = Math.hypot(dx, dy);
          return ti + Math.pow(d, alpha);
        };

        let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
        for (let i = 0; i < n - 1; i++) {
          const p0 = get(i - 1),
            p1 = get(i),
            p2 = get(i + 1),
            p3 = get(i + 2);
          let t0 = 0,
            t1 = tj(t0, p0, p1),
            t2 = tj(t1, p1, p2),
            t3 = tj(t2, p2, p3);
          if (t1 === t0) t1 += 1e-6;
          if (t2 === t1) t2 += 1e-6;
          if (t3 === t2) t3 += 1e-6;

          const m1x = (p2.x - p0.x) / (t2 - t0),
            m1y = (p2.y - p0.y) / (t2 - t0);
          const m2x = (p3.x - p1.x) / (t3 - t1),
            m2y = (p3.y - p1.y) / (t3 - t1);
          const dt = t2 - t1;

          const cp1x = p1.x + (m1x * dt) / 3,
            cp1y = p1.y + (m1y * dt) / 3;
          const cp2x = p2.x - (m2x * dt) / 3,
            cp2y = p2.y - (m2y * dt) / 3;

          d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(
            p2.x,
          )} ${fmt(p2.y)}`;
        }
        return d;
      }

      /* =========================
         YARN GENERATOR
      ========================= */
      function makeYarnStrands(cfg, seed) {
        const rng = mulberry32(seed);
        const strands = [];
        const minTurn = (cfg.minTurnDeg * Math.PI) / 180;
        const jitter = (cfg.turnJitterDeg * Math.PI) / 180;

        for (let s = 0; s < cfg.strands; s++) {
          let p = randomPointInSphere(rng, cfg.radius);
          let dir = norm({
            x: rng() * 2 - 1,
            y: rng() * 2 - 1,
            z: rng() * 2 - 1,
          });

          let axis = norm(
            cross(
              dir,
              norm({ x: rng() * 2 - 1, y: rng() * 2 - 1, z: rng() * 2 - 1 }),
            ),
          );
          if (!isFinite(axis.x)) axis = norm(cross(dir, { x: 0, y: 1, z: 0 }));

          let axisVel = { x: 0, y: 0, z: 0 };
          const pts = [];

          for (let i = 0; i < cfg.pointsPerStrand; i++) {
            axisVel = {
              x: axisVel.x * cfg.axisDamping + (rng() * 2 - 1) * cfg.axisWander,
              y: axisVel.y * cfg.axisDamping + (rng() * 2 - 1) * cfg.axisWander,
              z: axisVel.z * cfg.axisDamping + (rng() * 2 - 1) * cfg.axisWander,
            };
            axis = norm(add(axis, axisVel));

            const da = dot(dir, axis);
            axis = norm(sub(axis, mul(dir, da)));

            const theta = minTurn + (rng() * 2 - 1) * jitter;
            dir = norm(rotateAroundAxis(dir, axis, theta));

            const r = Math.hypot(p.x, p.y, p.z) || 1;
            const toCenter = norm({ x: -p.x, y: -p.y, z: -p.z });
            const t = Math.min(1, r / cfg.radius);
            const edge = Math.pow(t, cfg.edgePower);
            const pull = cfg.centerPull + cfg.edgeInBias * edge;
            dir = norm(add(mul(dir, 1 - pull), mul(toCenter, pull)));

            p = {
              x: p.x + dir.x * cfg.step,
              y: p.y + dir.y * cfg.step,
              z: p.z + dir.z * cfg.step,
            };

            const rr = Math.hypot(p.x, p.y, p.z);
            if (rr > cfg.radius) {
              const n = { x: p.x / rr, y: p.y / rr, z: p.z / rr };
              p = {
                x: n.x * cfg.radius,
                y: n.y * cfg.radius,
                z: n.z * cfg.radius,
              };

              const dn = dir.x * n.x + dir.y * n.y + dir.z * n.z;
              const reflected = {
                x: dir.x - 2 * dn * n.x,
                y: dir.y - 2 * dn * n.y,
                z: dir.z - 2 * dn * n.z,
              };

              dir = norm({
                x: dir.x * (1 - cfg.softBounce) + reflected.x * cfg.softBounce,
                y: dir.y * (1 - cfg.softBounce) + reflected.y * cfg.softBounce,
                z: dir.z * (1 - cfg.softBounce) + reflected.z * cfg.softBounce,
              });
            }

            pts.push({ x: p.x, y: p.y, z: p.z });
          }

          strands.push(pts);
        }
        return strands;
      }

      /* =========================
         SHAPE SURFACE MAP
         - sphere / cube / tetra
      ========================= */
      function surfaceSphere(v) {
        const r = Math.hypot(v.x, v.y, v.z) || 1e-9;
        const nx = v.x / r,
          ny = v.y / r,
          nz = v.z / r;
        return {
          x: nx * CONFIG.radius,
          y: ny * CONFIG.radius,
          z: nz * CONFIG.radius,
        };
      }

      function surfaceCube(v) {
        const ax = Math.abs(v.x),
          ay = Math.abs(v.y),
          az = Math.abs(v.z);
        const m = Math.max(ax, ay, az) || 1e-9;
        const s = CONFIG.radius / m;
        return { x: v.x * s, y: v.y * s, z: v.z * s };
      }

      // tetra: 4つの平面でクリップ（安定＆軽い）
      // 正四面体の半空間: n_i · x <= d を満たす最遠点を求める近似
      // 実用上は「方向vに対して、最も制約の厳しい面でスケール」する
      const TETRA = (() => {
        const dirs = [
          norm({ x: 1, y: 1, z: 1 }),
          norm({ x: 1, y: -1, z: -1 }),
          norm({ x: -1, y: 1, z: -1 }),
          norm({ x: -1, y: -1, z: 1 }),
        ];
        // 面法線は頂点方向の反対
        const normals = dirs.map((d) => ({ x: -d.x, y: -d.y, z: -d.z }));
        // 正四面体（外接球半径R）の面までの距離は R/3（原点→面）
        const d = CONFIG.radius / 3;
        return { normals, d };
      })();

      function surfaceTetra(v) {
        const vv = norm(v);
        // vv をそのまま伸ばして、どの面制約で止まるか計算
        // n·(s*vv) <= d  → s <= d / (n·vv)
        let sMax = Infinity;
        for (const n of TETRA.normals) {
          const nv = n.x * vv.x + n.y * vv.y + n.z * vv.z;
          // nv が正（外向き）だと制約になる
          if (nv > 1e-9) {
            sMax = Math.min(sMax, TETRA.d / nv);
          }
        }
        // safety
        if (!isFinite(sMax)) sMax = CONFIG.radius;
        return { x: vv.x * sMax, y: vv.y * sMax, z: vv.z * sMax };
      }

      function getSurfacePoint(shape, v) {
        if (shape === "cube") return surfaceCube(v);
        if (shape === "tetra") return surfaceTetra(v);
        return surfaceSphere(v);
      }

      /* =========================
         VIEWBOX
      ========================= */
      function applyViewBox() {
        const r = CONFIG.viewRadius;
        outSvg.setAttribute("viewBox", `${-r} ${-r} ${r * 2} ${r * 2}`);
        outSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
      applyViewBox();

      /* =========================
         SVG CONTENT (shadow + strands)
      ========================= */
      let defsEl = null;
      let shadowEl = null;
      let pathsGroup = null;

      function ensureSVGStructure() {
        while (outSvg.firstChild) outSvg.removeChild(outSvg.firstChild);

        // defs
        defsEl = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        outSvg.appendChild(defsEl);

        // shadow filter
        if (SHADOW.enabled) {
          const f = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "filter",
          );
          f.setAttribute("id", "p0212-shadow-filter");
          f.setAttribute("x", "-50%");
          f.setAttribute("y", "-50%");
          f.setAttribute("width", "200%");
          f.setAttribute("height", "200%");
          const blur = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "feGaussianBlur",
          );
          blur.setAttribute("in", "SourceGraphic");
          blur.setAttribute("stdDeviation", String(SHADOW.blurStdDev));
          f.appendChild(blur);
          defsEl.appendChild(f);

          shadowEl = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "ellipse",
          );
          shadowEl.setAttribute("class", "p0212-shadow");
          shadowEl.setAttribute("filter", "url(#p0212-shadow-filter)");
          outSvg.appendChild(shadowEl);
        } else {
          shadowEl = null;
        }

        // group for paths
        pathsGroup = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        pathsGroup.setAttribute("id", "p0212-paths");
        outSvg.appendChild(pathsGroup);
      }

      ensureSVGStructure();

      // paths
      let els = [];
      function ensurePaths() {
        while (pathsGroup.firstChild)
          pathsGroup.removeChild(pathsGroup.firstChild);
        els = [];
        for (let i = 0; i < CONFIG.strands; i++) {
          const p = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          );
          p.setAttribute("class", "strand");
          pathsGroup.appendChild(p);
          els.push(p);
        }
      }

      // generate
      let strands3D = null;
      function regenerateNow() {
        ensurePaths();
        strands3D = makeYarnStrands(CONFIG, (Date.now() & 0xffffffff) >>> 0);
      }

      regenerateNow();

      /* =========================
         SECTION HANDLING
         - ids: fv, philosophy, topics, profile, works, service, contact
      ========================= */
      const KEYS = [
        "fv",
        "philosophy",
        "topics",
        "profile",
        "works",
        "service",
        "contact",
      ];

      // 位置は「画面中心を 0」として viewBox 単位で扱う（-viewRadius .. +viewRadius）
      // centerX = -0.6*viewRadius なら左寄り / +0.6*viewRadius なら右寄り
      function xFromLeftRatio(r) {
        // r=0.2 => 左から20% → 中心基準に変換（-1..+1 くらい）
        // centerX = (r - 0.5) * 2 * viewRadius
        return (r - 0.5) * 2 * CONFIG.viewRadius;
      }

      const SECTION_PRESETS = {
        fv: {
          morph: 0.0,
          shapeA: "sphere",
          shapeB: "sphere",
          t: 0.0,
          scaleMul: 1.0,
          centerX: 0.0,
          centerY: 0.0,
        },
        philosophy: {
          morph: 0.0,
          shapeA: "sphere",
          shapeB: "sphere",
          t: 0.0,
          scaleMul: 1.0,
          centerX: 0.0,
          centerY: 0.0,
        }, // 中で上書き
        topics: {
          morph: 0.0,
          shapeA: "sphere",
          shapeB: "sphere",
          t: 0.0,
          scaleMul: 1.0,
          centerX: 0.0,
          centerY: 0.0,
        },
        profile: {
          morph: 0.0,
          shapeA: "sphere",
          shapeB: "sphere",
          t: 0.0,
          scaleMul: 0.2,
          centerX: xFromLeftRatio(0.2),
          centerY: 0.0,
        },
        works: {
          morph: 0.0,
          shapeA: "sphere",
          shapeB: "sphere",
          t: 0.0,
          scaleMul: 4.0,
          centerX: 0.0,
          centerY: 0.0,
        },
        service: {
          morph: 0.0,
          shapeA: "sphere",
          shapeB: "sphere",
          t: 0.0,
          scaleMul: 2.0,
          centerX: xFromLeftRatio(0.0),
          centerY: 0.0,
        },
        contact: {
          morph: 0.0,
          shapeA: "sphere",
          shapeB: "sphere",
          t: 0.0,
          scaleMul: 0.2,
          centerX: xFromLeftRatio(0.8),
          centerY: 0.0,
        },
      };

      function getById(id) {
        return document.getElementById(id);
      }

      function getSectionProgressById(id) {
        const el = document.getElementById(id);
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        // ★ セクション切替と同じ基準線
        const triggerY = innerHeight * SECTION_TRIGGER_RATIO;
        // progress:
        // 0 = セクション上端が triggerY に来た瞬間
        // 1 = セクション下端が triggerY に来た瞬間
        const p = (triggerY - r.top) / Math.max(1, r.height);
        return clamp(p, 0, 1);
      }

      function pickActiveSectionKey() {
        const triggerY = innerHeight * SECTION_TRIGGER_RATIO;
        let active = "fv";
        for (const key of KEYS) {
          const el = getById(key);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          // 「次セクションの上端が triggerY を超えたら」切替
          if (r.top <= triggerY) {
            active = key;
          }
        }
        return active;
      }

      /* =========================
         LIVE STATE
      ========================= */
      const LIVE = {
        activeKey: "fv",

        tgt: {
          morph: 0.0,
          shapeBlend: { a: "sphere", b: "sphere", t: 0.0 },
          scaleMul: 1.0,
          centerX: 0.0,
          centerY: 0.0,
        },
        cur: {
          morph: 0.0,
          // shapeBlend は tgt 側をそのまま参照してOK（tで滑らか化済み）
          scaleMul: 1.0,
          centerX: 0.0,
          centerY: 0.0,
        },
      };

      function updateSectionTarget() {
        const key = pickActiveSectionKey();
        LIVE.activeKey = key;

        // base preset
        const base = SECTION_PRESETS[key] || SECTION_PRESETS.fv;

        // write
        LIVE.tgt.morph = base.morph;
        LIVE.tgt.shapeBlend = { a: base.shapeA, b: base.shapeB, t: base.t };
        LIVE.tgt.scaleMul = base.scaleMul;
        LIVE.tgt.centerX = base.centerX;
        LIVE.tgt.centerY = base.centerY;

        // philosophy special (4状態＋shape滑らか)
        if (key === "philosophy") {
          const p = getSectionProgressById("philosophy");

          // 4 states split
          const t1 = 0.25,
            t2 = 0.5,
            t3 = 0.75;
          const w = TRANS.philosophyBlendWidth;

          // morph spec: ①のみ0 / ②③④は1
          LIVE.tgt.morph = p < t1 ? 0.0 : 1.0;

          // shape spec: ①② sphere / ③ cube / ④ tetra
          // ただし境界(t2, t3)は滑らか補間
          let a = "sphere",
            b = "sphere",
            tt = 0.0;

          // sphere->cube around t2
          if (p < t2 - w) {
            a = "sphere";
            b = "sphere";
            tt = 0.0;
          } else if (p < t2 + w) {
            a = "sphere";
            b = "cube";
            tt = smoothstep((p - (t2 - w)) / (2 * w));
          }
          // cube->tetra around t3
          else if (p < t3 - w) {
            a = "cube";
            b = "cube";
            tt = 0.0;
          } else if (p < t3 + w) {
            a = "cube";
            b = "tetra";
            tt = smoothstep((p - (t3 - w)) / (2 * w));
          } else {
            a = "tetra";
            b = "tetra";
            tt = 0.0;
          }

          LIVE.tgt.shapeBlend = { a, b, t: tt };
        }
      }

      addEventListener("scroll", updateSectionTarget, { passive: true });
      addEventListener("resize", () => {
        applyViewBox();
        updateSectionTarget();
      });
      updateSectionTarget();

      /* =========================
         STROKE WIDTH FOLLOW SCALE
         - 表示スケールに比例させる
      ========================= */
      function applyStrokeWidthByScale(scaleMul) {
        const scale = CONFIG.scale * scaleMul;
        let w = STYLE.strokeWidthBase * Math.sqrt(scaleMul);
        const MAX_STROKE = 12; // ← 好きな上限
        const MIN_STROKE = 1; // ← 下限も付けると安定
        w = Math.min(MAX_STROKE, Math.max(MIN_STROKE, w));
        outSvg.style.setProperty("--strokeWidth", String(w));
      }

      // theme / stroke
      document.documentElement.style.setProperty("--p0212-bg", THEME.bg);
      outSvg.style.setProperty("--stroke", STYLE.stroke);
      outSvg.style.setProperty("--strokeOpacity", String(STYLE.strokeOpacity));

      /* =========================
         RENDER LOOP
      ========================= */
      let curRx = 0,
        curRy = 0;
      let autoRx = 0,
        autoRy = 0;
      let lastNow = performance.now();

      function updateShadow(scaleMul, cx, cy) {
        if (!shadowEl || !SHADOW.enabled) return;

        // 影は viewBox 単位で持つ（scale/centerに追従）
        const r = CONFIG.viewRadius;
        const s = scaleMul;

        const rx = r * SHADOW.rxRatio * s;
        const ry = r * SHADOW.ryRatio * s;

        const x = cx;
        const y = cy + r * SHADOW.yOffset * s;

        shadowEl.setAttribute("cx", x.toFixed(3));
        shadowEl.setAttribute("cy", y.toFixed(3));
        shadowEl.setAttribute("rx", rx.toFixed(3));
        shadowEl.setAttribute("ry", ry.toFixed(3));
      }

      function render(now) {
        const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;

        // target update (scroll handlerはあるが安全に毎フレ呼んでもOK)
        // updateSectionTarget();

        // smooth follow (section transition easing)
        const f = TRANS.follow;

        LIVE.cur.morph += (LIVE.tgt.morph - LIVE.cur.morph) * f;
        LIVE.cur.scaleMul += (LIVE.tgt.scaleMul - LIVE.cur.scaleMul) * f;
        LIVE.cur.centerX += (LIVE.tgt.centerX - LIVE.cur.centerX) * f;
        LIVE.cur.centerY += (LIVE.tgt.centerY - LIVE.cur.centerY) * f;

        // stroke width follow scale
        applyStrokeWidthByScale(LIVE.cur.scaleMul);

        // shadow follow
        updateShadow(LIVE.cur.scaleMul, LIVE.cur.centerX, LIVE.cur.centerY);

        // auto rotate
        if (ROT.autoEnabled) {
          autoRy += ((ROT.autoDegPerSecY * Math.PI) / 180) * dt;
          autoRx += ((ROT.autoDegPerSecX * Math.PI) / 180) * dt;
        }

        // gentle easing on base rotation (kept as is)
        curRx += (0 - curRx) * CONFIG.ease;
        curRy += (0 - curRy) * CONFIG.ease;

        const rx = curRx + autoRx;
        const ry = curRy + autoRy;

        const morph = LIVE.cur.morph;

        const sb = LIVE.tgt.shapeBlend || { a: "sphere", b: "sphere", t: 0.0 };
        const scale = CONFIG.scale * LIVE.cur.scaleMul;
        const cx = LIVE.cur.centerX;
        const cy = LIVE.cur.centerY;

        if (strands3D) {
          const projected = strands3D.map((pts3, i) => {
            let zsum = 0;

            const pts2 = pts3.map((v0) => {
              // surface A / B
              const sA = getSurfacePoint(sb.a, v0);
              const sB = getSurfacePoint(sb.b, v0);

              // smooth shape crossfade
              const srf = {
                x: lerp(sA.x, sB.x, sb.t),
                y: lerp(sA.y, sB.y, sb.t),
                z: lerp(sA.z, sB.z, sb.t),
              };

              // volume -> surface morph
              const vx = lerp(v0.x, srf.x, morph);
              const vy = lerp(v0.y, srf.y, morph);
              const vz = lerp(v0.z, srf.z, morph);

              const v = { x: vx, y: vy, z: vz };
              const rr = rotateXY(v, rx, ry);
              const pp = project(rr, CONFIG.cameraDistance);
              zsum += pp.z;

              return {
                x: pp.x * scale + cx,
                y: pp.y * scale + cy,
              };
            });

            const smooth2 = smoothPoints2D(
              pts2,
              CONFIG.smoothStrength,
              CONFIG.smoothPasses,
            );

            const d = pointsToSmoothBezierPath(
              smooth2,
              CONFIG.splineAlpha,
              CONFIG.precision,
            );

            return { i, zavg: zsum / pts3.length, d };
          });

          // 奥→手前
          projected.sort((a, b) => a.zavg - b.zavg);
          for (const it of projected) {
            const el = els[it.i];
            if (el) el.setAttribute("d", it.d);
            pathsGroup.appendChild(el);
          }
        }

        requestAnimationFrame(render);
      }

      requestAnimationFrame(render);

      /* =========================
         (optional) click regenerate
         - 背景運用だと pointer-events:none なので
           クリック再生成が欲しいなら .p0212-stage を pointer-events:auto にして
           ここも有効化してね
      ========================= */
      // outSvg.style.cursor = "pointer";
      // outSvg.addEventListener("click", regenerateNow);

      console.log("[P0212] started (section-driven + smooth shape blend)");
    } catch (e) {
      console.error("[P0212] crashed:", e);
    }
  };

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
