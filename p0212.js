/* =========================
   Prototype_0212 (external) + Section-driven transitions
   - Fullscreen SVG yarn ball (background)
   - Section trigger at top-of-screen → ease transitions (shape/scale/center)
   - philosophy: sphere → cube → tetra (triangular pyramid) within section progress
   - topics: back to yarn (volume)
   - auto rotate always
   - soft shadow under
   - multiply blend for strokes
   ========================= */

(() => {
  const boot = () => {
    try {
      /* =========================
         CONFIG / FLAGS
      ========================= */
      const SHOW_GUI = false; // optional (lil-gui入れてるならtrueでもOK)
      const TOP_LINE_PX = 0;  // 画面上部判定ライン（px）

      const THEME = { bg: "#ffffff" };
      const STYLE = {
        stroke: "#264226",
        strokeWidth: 6,
        multiply: true,     // 4. 乗算
        strokeOpacity: 1.0, // 必要なら少し落とす
      };

      const CONFIG = {
        strands: 12,
        pointsPerStrand: 360,
        radius: 1.0,
        step: 0.07,

        cameraDistance: 3.2,
        scale: 120,

        // scroll rotate / morph は残すが、今回の要件ではデフォルトOFF運用
        maxRotY: 120,
        maxRotX: 40,
        ease: 0.10,

        smoothPasses: 1,
        smoothStrength: 0.16,
        splineAlpha: 0.5,
        precision: 5,

        minTurnDeg: 0.85,
        turnJitterDeg: 0.35,
        axisWander: 0.06,
        axisDamping: 0.94,

        centerPull: 0.045,
        edgeInBias: 0.18,
        edgePower: 3.0,

        softBounce: 0.65,
        viewRadius: 160,
      };

      // morph: 0 = volume yarn（もじゃもじゃ） / 1 = surface（shape表面へ寄せる）
      const MORPH = {
        enabled: true,      // セクション指定の morph を使う
        value: 0.0,         // live
      };

      // rotation
      const ROT = {
        scrollEnabled: false, // 今回は不要なのでOFF（必要ならtrue）
        autoEnabled: true,
        autoDegPerSecY: 10.0,
        autoDegPerSecX: 2.6,
      };

      // transitions
      const TRANS = {
        // セクション切替時の追従（0..1、値大→速い）
        follow: 0.12,
        // shape切替を少しだけ遅延で安定（離散のパキッを抑える）
        shapeHysteresis: 0.08,
      };

      // shadow
      const SHADOW = {
        enabled: true,
        opacity: 0.14,
        blurStdDev: 10,   // 影だけぼかす（重くなりにくい）
        yFromTop: 0.76,   // viewBox内のY位置（0..1）
        rxBase: 0.55,     // rに対する比率
        ryBase: 0.13,
      };

      /* =========================
         prevent double-mount
      ========================= */
      if (window.__P0212_MOUNTED__) {
        console.warn("[P0212] already mounted");
        return;
      }
      window.__P0212_MOUNTED__ = true;

      /* =========================
         inject CSS
      ========================= */
      const css = `
:root{ --p0212-bg:${THEME.bg}; }
body{ background:var(--p0212-bg); overflow-x:hidden; }

/* スクロール長の担保（必要なら） */
.p0212-spacer{ height:480vh; }

/* 背景として固定（クリック再生成したいなら pointer-events:auto に） */
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
  --strokeWidth:${STYLE.strokeWidth};
  --strokeOpacity:${STYLE.strokeOpacity};
}

#p0212-out .strand{
  fill:none;
  stroke:var(--stroke);
  stroke-width:var(--strokeWidth);
  stroke-linecap:round;
  stroke-linejoin:round;
  vector-effect:non-scaling-stroke;
  opacity:var(--strokeOpacity);
  ${STYLE.multiply ? "mix-blend-mode:multiply;" : ""}
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
         DOM mount
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

        return svg;
      }

      const outSvg = ensureDOM();

      /* =========================
         utils
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
         yarn generator (unchanged)
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
              p = { x: n.x * cfg.radius, y: n.y * cfg.radius, z: n.z * cfg.radius };

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
         SHAPE surface map
         - sphere / cube / tetra (triangular pyramid)
      ========================= */
      function surfaceSphere(v) {
        const r = Math.hypot(v.x, v.y, v.z) || 1e-9;
        const nx = v.x / r, ny = v.y / r, nz = v.z / r;
        return { x: nx * CONFIG.radius, y: ny * CONFIG.radius, z: nz * CONFIG.radius };
      }

      function surfaceCube(v) {
        const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
        const m = Math.max(ax, ay, az) || 1e-9;
        const s = CONFIG.radius / m;
        return { x: v.x * s, y: v.y * s, z: v.z * s };
      }

      // Regular tetrahedron via halfspaces (fast & stable)
      // Planes: n_i · x <= d, with n_i = -normalize(vertexDir), d = R/3
      const TETRA = (() => {
        const dirs = [
          norm({ x: 1, y: 1, z: 1 }),
          norm({ x: 1, y: -1, z: -1 }),
          norm({ x: -1, y: 1, z: -1 }),
          norm({ x: -1, y: -1, z: 1 }),
        ];
        const normals = dirs.map((d) => ({ x: -d.x, y: -d.y, z: -d.z }));
        return { normals };
      })();

      function surfaceTetra(v) {
        const u = norm(v);
        const d = CONFIG.radius / 3; // for this construction
        let tMin = Infinity;

        for (let i = 0; i < 4; i++) {
          const n = TETRA.normals[i];
          const denom = dot(n, u);
          if (denom > 1e-6) {
            const t = d / denom;
            if (t > 0 && t < tMin) tMin = t;
          }
        }
        if (!isFinite(tMin)) tMin = CONFIG.radius; // fallback
        return { x: u.x * tMin, y: u.y * tMin, z: u.z * tMin };
      }

      function surfaceByShape(shape, v) {
        if (shape === "cube") return surfaceCube(v);
        if (shape === "tetra") return surfaceTetra(v);
        return surfaceSphere(v);
      }

      /* =========================
         viewBox
      ========================= */
      function applyTheme() {
        document.documentElement.style.setProperty("--p0212-bg", THEME.bg);
      }
      function applyStyle() {
        outSvg.style.setProperty("--stroke", STYLE.stroke);
        outSvg.style.setProperty("--strokeWidth", String(STYLE.strokeWidth));
        outSvg.style.setProperty("--strokeOpacity", String(STYLE.strokeOpacity));
      }
      function applyViewBox() {
        const r = CONFIG.viewRadius;
        outSvg.setAttribute("viewBox", `${-r} ${-r} ${r * 2} ${r * 2}`);
        outSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }

      applyTheme();
      applyStyle();
      applyViewBox();

      /* =========================
         defs (shadow filter)
      ========================= */
      let defsEl = null;
      let shadowEl = null;

      function ensureDefsAndShadow() {
        // defs
        defsEl = outSvg.querySelector("defs[data-p0212='defs']");
        if (!defsEl) {
          defsEl = document.createElementNS("http://www.w3.org/2000/svg", "defs");
          defsEl.setAttribute("data-p0212", "defs");
          outSvg.insertBefore(defsEl, outSvg.firstChild);
        }

        // shadow filter
        let f = defsEl.querySelector("#p0212-shadowFilter");
        if (!f) {
          f = document.createElementNS("http://www.w3.org/2000/svg", "filter");
          f.setAttribute("id", "p0212-shadowFilter");
          f.setAttribute("x", "-50%");
          f.setAttribute("y", "-50%");
          f.setAttribute("width", "200%");
          f.setAttribute("height", "200%");

          const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
          blur.setAttribute("in", "SourceGraphic");
          blur.setAttribute("stdDeviation", String(SHADOW.blurStdDev));
          f.appendChild(blur);

          defsEl.appendChild(f);
        }

        // shadow ellipse
        shadowEl = outSvg.querySelector("ellipse[data-p0212='shadow']");
        if (!shadowEl) {
          shadowEl = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
          shadowEl.setAttribute("data-p0212", "shadow");
          shadowEl.setAttribute("class", "p0212-shadow");
          shadowEl.setAttribute("filter", "url(#p0212-shadowFilter)");
          // 影は最背面：defsの次
          outSvg.insertBefore(shadowEl, defsEl.nextSibling);
        }
      }

      ensureDefsAndShadow();

      /* =========================
         paths
      ========================= */
      let els = [];
      function ensurePaths() {
        // 既存strandを全削除（shadow/defsは残す）
        const old = Array.from(outSvg.querySelectorAll("path.strand"));
        old.forEach((n) => n.remove());

        els = [];
        for (let i = 0; i < CONFIG.strands; i++) {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("class", "strand");
          outSvg.appendChild(p);
          els.push(p);
        }
      }

      /* =========================
         generate
      ========================= */
      let strands3D = null;
      function regenerateNow() {
        ensureDefsAndShadow();
        ensurePaths();
        strands3D = makeYarnStrands(CONFIG, (Date.now() & 0xffffffff) >>> 0);
      }
      regenerateNow();

      /* =========================
         SECTION RULES
         - sections are identified by id:
           fv, philosophy, topics, profile, works, service, contact
         - if not found, we fallback to <section> order
      ========================= */
      const sectionIds = ["fv", "philosophy", "topics", "profile", "works", "service", "contact"];
      const sectionsById = new Map();
      sectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) sectionsById.set(id, el);
      });

      const fallbackSections = Array.from(document.querySelectorAll("section"));
      const getSectionEl = (id) => sectionsById.get(id) || null;

      function pickActiveSectionKey() {
        // まずIDで取れるもの優先
        const list = sectionIds
          .map((id) => ({ id, el: getSectionEl(id) }))
          .filter((x) => x.el);

        const line = TOP_LINE_PX;
        let best = null;
        let bestTop = -Infinity;

        if (list.length) {
          for (const item of list) {
            const r = item.el.getBoundingClientRect();
            if (r.top <= line && r.top > bestTop) {
              bestTop = r.top;
              best = item;
            }
          }
          return best ? best.id : list[0].id;
        }

        // fallback: section配列
        let bestIdx = -1;
        bestTop = -Infinity;
        for (let i = 0; i < fallbackSections.length; i++) {
          const r = fallbackSections[i].getBoundingClientRect();
          if (r.top <= line && r.top > bestTop) {
            bestTop = r.top;
            bestIdx = i;
          }
        }
        return bestIdx === -1 ? "fv" : `section-${bestIdx}`;
      }

      function getSectionProgress(el) {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        const denom = Math.max(1, r.height - innerHeight);
        const t = clamp((-r.top + TOP_LINE_PX) / denom, 0, 1);
        return t;
      }

      // centerX from left percent helper (viewBox units)
      function centerXFromLeftPct(pct) {
        const r = CONFIG.viewRadius;
        return (-1 + 2 * pct) * r; // 0% => -r, 50% => 0, 100% => +r
      }

      /* =========================
         TARGET PER SECTION
         - shape: "sphere" | "cube" | "tetra"
         - morph: 0..1  (0: yarn volume, 1: surface)
         - scaleMul: number
         - centerX: viewBox units
         - centerY: viewBox units (必要なら拡張)
      ========================= */
      const DEFAULTS = {
        shape: "sphere",
        morph: 0.35,     // fvデフォルト（好みで0.0でもOK）
        scaleMul: 1.0,
        centerX: 0,
        centerY: 0,
      };

      function targetFromSection(key) {
        // base
        let t = { ...DEFAULTS };

        if (key === "fv") {
          // デフォルト
          return t;
        }

        if (key === "philosophy") {
          // 球→立方体→三角錐（tetra）をセクション内進行で
          const el = getSectionEl("philosophy");
          const p = getSectionProgress(el);
          const k = Math.min(2, Math.floor(p * 3)); // 0,1,2
          t.shape = k === 0 ? "sphere" : k === 1 ? "cube" : "tetra";
          t.morph = 1.0; // 表面に寄せる（shapeが見えやすい）
          return t;
        }

        if (key === "topics") {
          // もじゃもじゃに戻る（volume）
          t.shape = "sphere";
          t.morph = 0.0;
          return t;
        }

        if (key === "profile") {
          t.scaleMul = 0.2;                 // 20%
          t.centerX = centerXFromLeftPct(0.2); // 左から20%
          return t;
        }

        if (key === "works") {
          t.scaleMul = 4.0; // 400%
          t.centerX = 0;    // 中央
          return t;
        }

        if (key === "service") {
          t.scaleMul = 2.0;                  // 200%
          t.centerX = centerXFromLeftPct(0.0); // 左から0%
          return t;
        }

        if (key === "contact") {
          t.scaleMul = 0.2;                   // 20%
          t.centerX = centerXFromLeftPct(0.8); // 右から20% = 左から80%
          return t;
        }

        // fallback keys like section-*
        return t;
      }

      /* =========================
         LIVE state (smoothed)
      ========================= */
      const LIVE = {
        // active
        key: "fv",

        // target
        tgt: { ...DEFAULTS },

        // current (smoothed)
        cur: { ...DEFAULTS },

        // shape smoothing
        curShape: DEFAULTS.shape,
        shapeMix: 1.0, // 0..1 (not used for true blending, only hysteresis)
      };

      function updateSectionTarget() {
        const key = pickActiveSectionKey();
        LIVE.key = key;

        // If we are in fallback mode, try to map to ids by visibility anyway:
        // If sections exist by id, key will be that id. Otherwise key is section-i.

        // If key is fallback but we have known ids, try detect by proximity:
        let resolved = key;
        if (key.startsWith("section-")) {
          // try: if any known id section is currently active, prefer it
          const known = pickActiveSectionKey();
          resolved = known;
        }

        // compute target
        LIVE.tgt = targetFromSection(resolved);

        // If section isn't found (e.g. ids missing), treat as default
        if (!LIVE.tgt) LIVE.tgt = { ...DEFAULTS };
      }

      /* =========================
         optional scroll rotation (off by default)
      ========================= */
      const spacerEl = document.querySelector(".p0212-spacer");

      function getScrollTop() {
        const se = document.scrollingElement || document.documentElement;
        return (
          window.scrollY ||
          (se && se.scrollTop) ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0
        );
      }

      function getScrollT() {
        if (!spacerEl) {
          const se = document.scrollingElement || document.documentElement;
          const maxScroll = Math.max(1, (se?.scrollHeight || 1) - innerHeight);
          return clamp(getScrollTop() / maxScroll, 0, 1);
        }
        const rect = spacerEl.getBoundingClientRect();
        const h = rect.height || spacerEl.offsetHeight || spacerEl.scrollHeight || innerHeight;
        const total = Math.max(1, h - innerHeight);
        return clamp(-rect.top / total, 0, 1);
      }

      /* =========================
         RENDER
      ========================= */
      let last = performance.now();
      let curRx = 0, curRy = 0;
      let autoRx = 0, autoRy = 0;

      // shape hysteresis (reduce flicker around boundaries)
      function updateShapeDiscrete(nextShape, dt) {
        if (LIVE.curShape === nextShape) return;

        // accumulate "confidence"
        LIVE.shapeMix += dt / Math.max(1e-6, TRANS.shapeHysteresis);
        if (LIVE.shapeMix >= 1.0) {
          LIVE.curShape = nextShape;
          LIVE.shapeMix = 0.0;
        }
      }

      function updateShadow() {
        if (!SHADOW.enabled || !shadowEl) return;
        const r = CONFIG.viewRadius;

        const cx = LIVE.cur.centerX;
        const cy = (-r) + (2 * r) * SHADOW.yFromTop + LIVE.cur.centerY;
        const rx = r * SHADOW.rxBase * LIVE.cur.scaleMul;
        const ry = r * SHADOW.ryBase * LIVE.cur.scaleMul;

        shadowEl.setAttribute("cx", cx.toFixed(3));
        shadowEl.setAttribute("cy", cy.toFixed(3));
        shadowEl.setAttribute("rx", Math.max(1, rx).toFixed(3));
        shadowEl.setAttribute("ry", Math.max(1, ry).toFixed(3));
        shadowEl.style.opacity = String(SHADOW.opacity);
      }

      function render(now) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;

        // 1) section target
        updateSectionTarget();

        // 2) smooth params
        const k = TRANS.follow;
        LIVE.cur.morph = lerp(LIVE.cur.morph, LIVE.tgt.morph, k);
        LIVE.cur.scaleMul = lerp(LIVE.cur.scaleMul, LIVE.tgt.scaleMul, k);
        LIVE.cur.centerX = lerp(LIVE.cur.centerX, LIVE.tgt.centerX, k);
        LIVE.cur.centerY = lerp(LIVE.cur.centerY, LIVE.tgt.centerY, k);

        // discrete shape with hysteresis (to avoid jitter near section edges)
        updateShapeDiscrete(LIVE.tgt.shape, dt);
        const shape = LIVE.curShape;

        // 3) rotation (scroll optional + auto always)
        let tgtRx = 0, tgtRy = 0;
        if (ROT.scrollEnabled) {
          const t = getScrollT();
          const u = (t - 0.5) * 2;
          tgtRy = (u * CONFIG.maxRotY * Math.PI) / 180;
          tgtRx = (-u * CONFIG.maxRotX * Math.PI) / 180;
        }

        // follow to scroll target (still uses CONFIG.ease)
        curRx += (tgtRx - curRx) * CONFIG.ease;
        curRy += (tgtRy - curRy) * CONFIG.ease;

        // auto rotation additive
        if (ROT.autoEnabled) {
          autoRy += ((ROT.autoDegPerSecY * Math.PI) / 180) * dt;
          autoRx += ((ROT.autoDegPerSecX * Math.PI) / 180) * dt;
        }
        const rx = curRx + autoRx;
        const ry = curRy + autoRy;

        // 4) morph live
        MORPH.value = clamp(LIVE.cur.morph, 0, 1);

        // 5) shadow
        updateShadow();

        // 6) draw strands
        if (strands3D) {
          const scale = CONFIG.scale * LIVE.cur.scaleMul;

          const projected = strands3D.map((pts3, i) => {
            let zsum = 0;

            const pts2 = pts3.map((v0) => {
              const srf = surfaceByShape(shape, v0);

              // volume -> surface
              const vx = lerp(v0.x, srf.x, MORPH.value);
              const vy = lerp(v0.y, srf.y, MORPH.value);
              const vz = lerp(v0.z, srf.z, MORPH.value);

              const rr = rotateXY({ x: vx, y: vy, z: vz }, rx, ry);
              const pp = project(rr, CONFIG.cameraDistance);
              zsum += pp.z;

              return {
                x: pp.x * scale + LIVE.cur.centerX,
                y: pp.y * scale + LIVE.cur.centerY,
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

          // 奥→手前（影は別要素なのでそのままでOK）
          projected.sort((a, b) => a.zavg - b.zavg);
          for (const it of projected) {
            const el = els[it.i];
            if (el) el.setAttribute("d", it.d);
            outSvg.appendChild(el);
          }
        }

        requestAnimationFrame(render);
      }

      /* =========================
         resize
      ========================= */
      addEventListener("resize", () => {
        applyViewBox();
      });

      /* =========================
         INIT
      ========================= */
      requestAnimationFrame(render);

      console.log("[P0212] started (section transitions)");
    } catch (e) {
      console.error("[P0212] crashed:", e);
    }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
