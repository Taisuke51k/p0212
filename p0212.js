/* =========================
   Prototype_0212 (external) + Section-driven transitions (FULL / robust for Studio)
   - CSS注入 / DOM生成 / 二重マウント防止
   - “window scroll依存を捨てて” 毎フレーム section判定（Studioの独自スクロールでも動く）
   - セクション（id）で shape / size / centerX を切替（画面上部トリガー → イージング）
     fv: default
     philosophy: sphere → cube → tetra（セクション内進行で順番）
     topics: yarn（morph=0）
     profile: size 20%, x -20%
     works: size 400%, x 0
     service: size 200%, x -50%
     contact: size 20%, x +20%
   - 常時ゆっくり回転（auto rotate）
   - 下に薄い影（楕円＋ガウスぼかし）
   - 線は乗算（mix-blend-mode:multiply）
   ========================= */
(() => {
  const boot = () => {
    try {
      if (window.__P0212_MOUNTED__) {
        console.warn("[P0212] already mounted");
        return;
      }
      window.__P0212_MOUNTED__ = true;

      /* =========================
         FLAGS
      ========================= */
      const DEBUG = true; // ← 動いてるか確認したい間だけ true

      /* =========================
         THEME / STYLE / CONFIG
      ========================= */
      const THEME = { bg: "#ffffff" };
      const STYLE = {
        stroke: "#264226",
        strokeWidth: 3,
        strokeOpacity: 1.0,
        multiply: true,
      };

      const CONFIG = {
        strands: 12,
        pointsPerStrand: 360,
        radius: 1.0,
        step: 0.07,

        cameraDistance: 3.2,
        scale: 120,

        maxRotY: 120,
        maxRotX: 40,
        ease: 0.1,

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

      const ROT = {
        scrollEnabled: false, // ここは今回不要なら false
        autoEnabled: true,
        autoDegPerSecY: 10.0,
        autoDegPerSecX: 2.6,
      };

      const TRANS = { follow: 0.12 };

      const MORPH = { surfaceMorph: 0.0 }; // 0=volume, 1=surface

      const SHADOW = {
        enabled: true,
        opacity: 0.14,
        blurStdDev: 10,
        yFromTop: 0.76,
        rxBase: 0.55,
        ryBase: 0.13,
      };

      const TOP_LINE_PX = 0; // “画面上部で切替”ライン

      /* =========================
         CSS INJECT
      ========================= */
      const css = `
:root{ --p0212-bg:${THEME.bg}; }
body{ background:var(--p0212-bg); overflow-x:hidden; }
.p0212-spacer{ height:480vh; }

.p0212-stage{
  position:fixed; inset:0;
  width:100vw; height:100vh;
  overflow:hidden;
  pointer-events:none;
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
         DOM MOUNT
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
         UTILS
      ========================= */
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const lerp = (a, b, t) => a + (b - a) * t;

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
      function mul(a, s) {
        return { x: a.x * s, y: a.y * s, z: a.z * s };
      }
      function sub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
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
         YARN GEN
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

            p = { x: p.x + dir.x * cfg.step, y: p.y + dir.y * cfg.step, z: p.z + dir.z * cfg.step };

            const rr = Math.hypot(p.x, p.y, p.z);
            if (rr > cfg.radius) {
              const n = { x: p.x / rr, y: p.y / rr, z: p.z / rr };
              p = { x: n.x * cfg.radius, y: n.y * cfg.radius, z: n.z * cfg.radius };

              const dn = dir.x * n.x + dir.y * n.y + dir.z * n.z;
              const reflected = { x: dir.x - 2 * dn * n.x, y: dir.y - 2 * dn * n.y, z: dir.z - 2 * dn * n.z };

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
         SURFACE MAPS
      ========================= */
      function surfaceSphere(v) {
        const r = Math.hypot(v.x, v.y, v.z) || 1e-9;
        return { x: (v.x / r) * CONFIG.radius, y: (v.y / r) * CONFIG.radius, z: (v.z / r) * CONFIG.radius };
      }
      function surfaceCube(v) {
        const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
        const m = Math.max(ax, ay, az) || 1e-9;
        const s = CONFIG.radius / m;
        return { x: v.x * s, y: v.y * s, z: v.z * s };
      }
      function surfaceTetra(v) {
        const d0 = norm({ x: 1, y: 1, z: 1 });
        const d1 = norm({ x: 1, y: -1, z: -1 });
        const d2 = norm({ x: -1, y: 1, z: -1 });
        const d3 = norm({ x: -1, y: -1, z: 1 });
        const n = norm(v);
        const ds = [dot(n, d0), dot(n, d1), dot(n, d2), dot(n, d3)];
        let idx = 0;
        for (let i = 1; i < 4; i++) if (ds[i] > ds[idx]) idx = i;
        const faceN = [d0, d1, d2, d3][idx];
        const pushed = norm(add(mul(n, 0.55), mul(faceN, 0.45)));
        return { x: pushed.x * CONFIG.radius, y: pushed.y * CONFIG.radius, z: pushed.z * CONFIG.radius };
      }
      function getSurfacePoint(shape, v) {
        if (shape === "cube") return surfaceCube(v);
        if (shape === "tetra") return surfaceTetra(v);
        return surfaceSphere(v);
      }

      /* =========================
         SECTION LOGIC (id-based)
      ========================= */
      const SECTION_LOOK = {
        fv:        { shape: "sphere", morph: 0.0, scaleMul: 1.0, centerX: 0.0 },
        philosophy:{ shape: "sphere", morph: 1.0, scaleMul: 1.0, centerX: 0.0 },
        topics:    { shape: "sphere", morph: 0.0, scaleMul: 1.0, centerX: 0.0 },
        profile:   { shape: "sphere", morph: 0.0, scaleMul: 0.2, centerX: -0.2 },
        works:     { shape: "sphere", morph: 0.0, scaleMul: 4.0, centerX: 0.0 },
        service:   { shape: "sphere", morph: 0.0, scaleMul: 2.0, centerX: -0.5 },
        contact:   { shape: "sphere", morph: 0.0, scaleMul: 0.2, centerX: +0.2 },
      };
      const SECTION_KEYS = Object.keys(SECTION_LOOK);

      function getSectionEl(id) {
        // idがsection直下じゃなくても「そのidの要素」を拾う（Studio対策）
        return document.getElementById(id);
      }

      function pickActiveSectionKey() {
        const line = TOP_LINE_PX;
        let bestKey = "fv";
        let bestTop = -Infinity;

        for (const k of SECTION_KEYS) {
          const el = getSectionEl(k);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.top <= line && r.top > bestTop) {
            bestTop = r.top;
            bestKey = k;
          }
        }
        return bestKey;
      }

      function getSectionProgressById(id) {
        const el = getSectionEl(id);
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        const h = Math.max(1, r.height - innerHeight);
        return clamp((-r.top + TOP_LINE_PX) / h, 0, 1);
      }

      const LIVE = {
        key: "fv",
        prevKey: "fv",
        tgt: { shape: "sphere", morph: 0, scaleMul: 1, centerX: 0 },
        cur: { shape: "sphere", morph: 0, scaleMul: 1, centerX: 0 },
      };

      function updateSectionTarget() {
        const key = pickActiveSectionKey();
        LIVE.key = key;

        const base = SECTION_LOOK[key] || SECTION_LOOK.fv;
        LIVE.tgt.shape = base.shape;
        LIVE.tgt.morph = base.morph;
        LIVE.tgt.scaleMul = base.scaleMul;
        LIVE.tgt.centerX = base.centerX;

        if (key === "philosophy") {
          const p = getSectionProgressById("philosophy");
          if (p < 1 / 3) LIVE.tgt.shape = "sphere";
          else if (p < 2 / 3) LIVE.tgt.shape = "cube";
          else LIVE.tgt.shape = "tetra";
          LIVE.tgt.morph = 1.0;
        }

        if (DEBUG && LIVE.prevKey !== LIVE.key) {
          console.log("[P0212] active:", LIVE.key);
          LIVE.prevKey = LIVE.key;
        }
      }

      /* =========================
         VIEWBOX + DEFS + SHADOW
      ========================= */
      function applyViewBox() {
        const r = CONFIG.viewRadius;
        outSvg.setAttribute("viewBox", `${-r} ${-r} ${r * 2} ${r * 2}`);
        outSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
      applyViewBox();

      function rebuildSceneBase() {
  while (outSvg.firstChild) outSvg.removeChild(outSvg.firstChild);

  shadowEl = null;
  shadowBlurEl = null;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  outSvg.appendChild(defs);

  if (SHADOW.enabled) {
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", "p0212-shadow-filter");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");

    const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blur.setAttribute("in", "SourceGraphic");
    blur.setAttribute("stdDeviation", String(SHADOW.blurStdDev));
    filter.appendChild(blur);
    defs.appendChild(filter);

    shadowBlurEl = blur;

    const ell = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    ell.setAttribute("class", "p0212-shadow");
    ell.setAttribute("filter", "url(#p0212-shadow-filter)");
    outSvg.appendChild(ell);

    shadowEl = ell;

    // 初回だけ一旦セット（以降は render() で更新）
    updateShadowFromLive();
  }
}
       function updateShadowFromLive() {
  if (!shadowEl) return;

  const r = CONFIG.viewRadius;
  const vbW = r * 2;

  // “球の下”っぽい基準位置（viewBox内）
  const baseCx = 0;
  const baseCy = (-r) + vbW * SHADOW.yFromTop;

  // 追従：左右位置は centerX、サイズは scaleMul
  const cx = baseCx + LIVE.cur.centerX * vbW;
  const cy = baseCy;

  const s = Math.max(0.05, LIVE.cur.scaleMul);
  const rx = r * SHADOW.rxBase * s;
  const ry = r * SHADOW.ryBase * s;

  shadowEl.setAttribute("cx", String(cx));
  shadowEl.setAttribute("cy", String(cy));
  shadowEl.setAttribute("rx", String(rx));
  shadowEl.setAttribute("ry", String(ry));

  // 影のぼかしもスケールに追従（大きくした時に影が細く見えない）
  if (shadowBlurEl) {
    const blur = Math.max(0.5, SHADOW.blurStdDev * s);
    shadowBlurEl.setAttribute("stdDeviation", String(blur));
  }
}

      /* =========================
         PATHS
      ========================= */
      let els = [];
      let strands3D = null;
      let shadowEl = null;
      let shadowBlurEl = null;

      function ensurePaths() {
        rebuildSceneBase();
        els = [];
        for (let i = 0; i < CONFIG.strands; i++) {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("class", "strand");
          outSvg.appendChild(p);
          els.push(p);
        }
      }

      function regenerateNow() {
        ensurePaths();
        strands3D = makeYarnStrands(CONFIG, (Date.now() & 0xffffffff) >>> 0);
      }

      regenerateNow();

      /* =========================
         OPTIONAL scroll-rotate (kept)
      ========================= */
      let curRx = 0, curRy = 0, tgtRx = 0, tgtRy = 0;

      function updateScrollRotateTarget() {
        if (!ROT.scrollEnabled) { tgtRx = 0; tgtRy = 0; return; }
        const doc = document.documentElement;
        const maxScroll = Math.max(1, doc.scrollHeight - innerHeight);
        const t = clamp(window.scrollY / maxScroll, 0, 1);
        const u = (t - 0.5) * 2;
        tgtRy = (u * CONFIG.maxRotY * Math.PI) / 180;
        tgtRx = (-u * CONFIG.maxRotX * Math.PI) / 180;
      }

      /* =========================
         AUTO ROTATION + RENDER
      ========================= */
      let autoRx = 0, autoRy = 0;
      let lastNow = performance.now();

      function render(now) {
        const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;

        // ★重要：毎フレーム判定（Studioスクロールでも確実に更新される）
        updateSectionTarget();
        updateScrollRotateTarget();

        // smooth follow
        LIVE.cur.morph += (LIVE.tgt.morph - LIVE.cur.morph) * TRANS.follow;
        LIVE.cur.scaleMul += (LIVE.tgt.scaleMul - LIVE.cur.scaleMul) * TRANS.follow;
        LIVE.cur.centerX += (LIVE.tgt.centerX - LIVE.cur.centerX) * TRANS.follow;
        LIVE.cur.shape = LIVE.tgt.shape;
         outSvg.style.setProperty("--strokeWidth", String(STYLE.strokeWidth * LIVE.cur.scaleMul));
         updateShadowFromLive();

        MORPH.surfaceMorph = LIVE.cur.morph;

        // rotation
        curRx += (tgtRx - curRx) * CONFIG.ease;
        curRy += (tgtRy - curRy) * CONFIG.ease;

        if (ROT.autoEnabled) {
          autoRy += ((ROT.autoDegPerSecY * Math.PI) / 180) * dt;
          autoRx += ((ROT.autoDegPerSecX * Math.PI) / 180) * dt;
        }

        const rx = curRx + autoRx;
        const ry = curRy + autoRy;

        const morph = MORPH.surfaceMorph;

        if (strands3D) {
          const projected = strands3D.map((pts3, i) => {
            let zsum = 0;

            const pts2 = pts3.map((v0) => {
              const srf = getSurfacePoint(LIVE.cur.shape, v0);

              const vx = lerp(v0.x, srf.x, morph);
              const vy = lerp(v0.y, srf.y, morph);
              const vz = lerp(v0.z, srf.z, morph);
              const v = { x: vx, y: vy, z: vz };

              const rr = rotateXY(v, rx, ry);
              const pp = project(rr, CONFIG.cameraDistance);
              zsum += pp.z;

              const vbW = CONFIG.viewRadius * 2;
              const offsetX = LIVE.cur.centerX * vbW;
              const scaleFinal = CONFIG.scale * LIVE.cur.scaleMul;

              return { x: pp.x * scaleFinal + offsetX, y: pp.y * scaleFinal };
            });

            const smooth2 = smoothPoints2D(pts2, CONFIG.smoothStrength, CONFIG.smoothPasses);
            const d = pointsToSmoothBezierPath(smooth2, CONFIG.splineAlpha, CONFIG.precision);

            return { i, zavg: zsum / pts3.length, d };
          });

          projected.sort((a, b) => a.zavg - b.zavg);
          for (const it of projected) {
            const el = els[it.i];
            if (el) el.setAttribute("d", it.d);
            outSvg.appendChild(el);
          }
        }

        requestAnimationFrame(render);
      }

      requestAnimationFrame(render);

      addEventListener("resize", () => {
        applyViewBox();
        regenerateNow();
      });

      console.log("[P0212] started (robust section follow)");
      if (DEBUG) {
        console.log("[P0212] debug: looking for ids:", SECTION_KEYS.join(", "));
      }
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
