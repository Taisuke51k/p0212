/* =========================
   Prototype_0212 (external)
   - Fullscreen SVG yarn ball
   - Scroll rotate + morph
   - Click regenerate
   ========================= */

(() => {
  // ---- boot guard (works even if injected after load) ----
  const boot = () => {
    try {
      // ---- CONFIG ----
      const THEME = { bg: "#ffffff" };
      const STYLE = { stroke: "#264226", strokeWidth: 6 };

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

      const MORPH = {
        surfaceMorph: 0.0,
        morphStrength: 1.0,
        morphEasePow: 1.8,
      };

      // ---- prevent double-mount ----
      if (window.__P0212_MOUNTED__) {
        console.warn("[P0212] already mounted");
        return;
      }
      window.__P0212_MOUNTED__ = true;

      // ---- inject CSS (so you don't have to manage Studio head CSS) ----
      const css = `
:root{ --p0212-bg:${THEME.bg}; }
body{ background:var(--p0212-bg); overflow-x:hidden; }
.p0212-spacer{ height:480vh; }
.p0212-stage{
  position:fixed; inset:0;
  width:100vw; height:100vh;
  overflow:hidden;
  pointer-events:auto;
  z-index:999999; /* ensure visible over Studio layers */
}
#p0212-out{
  position:absolute; inset:0;
  width:100vw; height:100vh;
  display:block;
  --stroke:${STYLE.stroke};
  --strokeWidth:${STYLE.strokeWidth};
}
#p0212-out .strand{
  fill:none;
  stroke:var(--stroke);
  stroke-width:var(--strokeWidth);
  stroke-linecap:round;
  stroke-linejoin:round;
  vector-effect:non-scaling-stroke;
}
      `.trim();

      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-p0212", "style");
      styleEl.textContent = css;
      document.head.appendChild(styleEl);

      // ---- DOM mount ----
      function ensureDOM() {
        let spacer = document.querySelector(".p0212-spacer");
        if (!spacer) {
          spacer = document.createElement("div");
          spacer.className = "p0212-spacer";
          // bodyの最後に追加（スクロール長の担保）
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
          svg.setAttribute("aria-label", "yarn ball morph");
          svg.setAttribute("role", "img");
          stage.appendChild(svg);
        }

        return svg;
      }

      const outSvg = ensureDOM();

      // ---- utils ----
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const lerp = (a, b, t) => a + (b - a) * t;
      const easePow = (t, p) => Math.pow(clamp(t, 0, 1), p);

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

          d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
        }
        return d;
      }

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

      // ---- viewBox ----
      function applyViewBox() {
        const r = CONFIG.viewRadius;
        outSvg.setAttribute("viewBox", `${-r} ${-r} ${r * 2} ${r * 2}`);
        outSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
      applyViewBox();

      // ---- paths ----
      let els = [];
      function ensurePaths() {
        while (outSvg.firstChild) outSvg.removeChild(outSvg.firstChild);
        els = [];
        for (let i = 0; i < CONFIG.strands; i++) {
          const p = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          );
          p.setAttribute("class", "strand");
          outSvg.appendChild(p);
          els.push(p);
        }
      }

      // ---- generate ----
      let strands3D = null;
      function regenerateNow() {
        ensurePaths();
        strands3D = makeYarnStrands(CONFIG, (Date.now() & 0xffffffff) >>> 0);
      }
      regenerateNow();

      outSvg.style.cursor = "pointer";
      outSvg.addEventListener("click", regenerateNow);

      // ---- scroll ----
      let curRx = 0,
        curRy = 0,
        tgtRx = 0,
        tgtRy = 0;

      function updateTarget() {
        const doc = document.documentElement;
        const maxScroll = Math.max(1, doc.scrollHeight - innerHeight);
        const t = clamp(window.scrollY / maxScroll, 0, 1);

        const u = (t - 0.5) * 2;
        tgtRy = (u * CONFIG.maxRotY * Math.PI) / 180;
        tgtRx = (-u * CONFIG.maxRotX * Math.PI) / 180;

        const m = easePow(t, MORPH.morphEasePow) * MORPH.morphStrength;
        MORPH.surfaceMorph = clamp(m, 0, 1);
      }
      addEventListener("scroll", updateTarget, { passive: true });
      addEventListener("resize", () => {
        applyViewBox();
        updateTarget();
      });
      updateTarget();

      // ---- render ----
      function render() {
        curRx += (tgtRx - curRx) * CONFIG.ease;
        curRy += (tgtRy - curRy) * CONFIG.ease;

        const morph = MORPH.surfaceMorph;

        if (strands3D) {
          const projected = strands3D.map((pts3, i) => {
            let zsum = 0;

            const pts2 = pts3.map((v0) => {
              const r = Math.hypot(v0.x, v0.y, v0.z) || 1e-9;
              const nx = v0.x / r,
                ny = v0.y / r,
                nz = v0.z / r;

              const vx = lerp(v0.x, nx * CONFIG.radius, morph);
              const vy = lerp(v0.y, ny * CONFIG.radius, morph);
              const vz = lerp(v0.z, nz * CONFIG.radius, morph);

              const v = { x: vx, y: vy, z: vz };

              const rr = rotateXY(v, curRx, curRy);
              const pp = project(rr, CONFIG.cameraDistance);
              zsum += pp.z;

              return { x: pp.x * CONFIG.scale, y: pp.y * CONFIG.scale };
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

      console.log("[P0212] started (external)");
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
