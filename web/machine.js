/* 로또 추첨기 연출 — canvas 로 그리는 공 섞기 물리 + 공 6개가 하나씩 나오는 장면.
 * 연출일 뿐이다: 번호는 서버가 미리 정해 넘겨주고(play 의 인자), 기계는 그 번호의 공을 꺼내 보여 준다.
 * 외부 라이브러리 없음. 화면에 안 보이거나 탭이 가려지면 멈춘다. */
(function () {
  "use strict";

  const W = 560, H = 480;                       // 논리 좌표(화면 크기에 맞춰 비율 조절)
  const CX = 250, CY = 182, R = 150, BR = 15;   // 통의 중심·반지름, 통 안 공 반지름
  const TRAY_Y = 436, TRAY_R = 21, SLOT_X = (i) => 62 + i * 87;
  const MOUTH_A = (-35 * Math.PI) / 180;
  const MOUTH = { x: CX + R * Math.cos(MOUTH_A), y: CY + R * Math.sin(MOUTH_A) };
  const CHUTE = [MOUTH, { x: 455, y: MOUTH.y }, { x: 455, y: TRAY_Y }];
  const COLORS = [[10, "#fbc400"], [20, "#69c8f2"], [30, "#ff7272"], [40, "#aaaaaa"], [45, "#b0d840"]];
  const color = (n) => (COLORS.find(([m]) => n <= m) || COLORS[4])[1];
  const FONT = '"Apple SD Gothic Neo","Pretendard","Malgun Gothic","Segoe UI",sans-serif';
  const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let canvas = null, ctx = null, scale = 1, dpr = 1;
  let balls = [], tray = [], trav = [], pulls = [];
  let simT = 0, acc = 0, last = 0, running = false, frame = 0, css = {};
  let play = null;       // 진행 중인 추첨
  let spin = 0, parts = [], lampT = 0;
  let mixLevel = 0.25;   // 공기 세기(0.25 평소, 1 섞는 중)

  const rnd = (a, b) => a + Math.random() * (b - a);

  function resetBalls() {
    balls = [];
    for (let n = 1; n <= 45; n++) {
      const a = rnd(0, Math.PI * 2), d = rnd(0, R - BR * 2);
      balls.push({ n, x: CX + Math.cos(a) * d * 0.9, y: CY - R * 0.3 + Math.sin(a) * d * 0.5, vx: rnd(-60, 60), vy: 0, m: 1, s: "in" });
    }
    tray = []; trav = []; pulls = [];
  }

  // ---------------------------------------------------------------- 물리
  function step(h) {
    simT += h;
    const k = mixLevel;
    spin += (0.35 + 3.2 * k) * h;
    for (const q of parts) { q.vy += 700 * h; q.x += q.vx * h; q.y += q.vy * h; q.rot += q.vr * h; }
    parts = parts.filter((q) => simT - q.t0 < q.life);
    const inb = balls.filter((b) => b.s === "in" || b.s === "pull");
    for (const b of inb) {
      b.vy += 900 * h;
      // 아래에서 불어 올리는 공기 + 통 안을 도는 바람
      if (b.y > CY - R * 0.15) {
        b.vy -= (700 * k) * h * (0.25 + 0.75 * Math.random());
        b.vx += (Math.random() - 0.5) * 1400 * k * h;
      }
      const dx = b.x - CX, dy = b.y - CY, d = Math.hypot(dx, dy) || 1;
      b.vx += (-dy / d) * 260 * k * h;
      b.vy += (dx / d) * 260 * k * h;
      if (b.s === "pull") {      // 뽑힌 공: 출구로 끌어당김
        const ex = MOUTH.x - b.x, ey = MOUTH.y - b.y, ed = Math.hypot(ex, ey) || 1;
        b.vx += (ex / ed) * 3200 * h; b.vy += (ey / ed) * 3200 * h - 900 * h * 0.8;
      }
    }
    for (const b of inb) {
      b.vx *= 0.9985; b.vy *= 0.9985;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 760) { b.vx *= 760 / sp; b.vy *= 760 / sp; }
      b.x += b.vx * h; b.y += b.vy * h;
      const dx = b.x - CX, dy = b.y - CY, d = Math.hypot(dx, dy);
      if (d > R - BR) {            // 통 벽 반사
        const nx = dx / d, ny = dy / d;
        b.x = CX + nx * (R - BR); b.y = CY + ny * (R - BR);
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= 1.8 * vn * nx; b.vy -= 1.8 * vn * ny; }
      }
    }
    for (let i = 0; i < inb.length; i++) {   // 공끼리 충돌
      for (let j = i + 1; j < inb.length; j++) {
        const a = inb[i], b = inb[j];
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = BR * 2;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (min - d) / (a.m + b.m);
        a.x -= nx * ov * b.m; a.y -= ny * ov * b.m; b.x += nx * ov * a.m; b.y += ny * ov * a.m;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const jn = (-(1 + 0.9) * rv) / (1 / a.m + 1 / b.m);
          a.vx -= (jn * nx) / a.m; a.vy -= (jn * ny) / a.m; b.vx += (jn * nx) / b.m; b.vy += (jn * ny) / b.m;
        }
      }
    }
    sequence();
    for (const t of trav.slice()) {          // 관을 타고 내려가는 공
      const p = Math.min(1, (simT - t.t0) / t.dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      let dist = e * t.len, seg = 0;
      while (seg < t.pts.length - 2 && dist > t.lens[seg]) { dist -= t.lens[seg]; seg++; }
      const a = t.pts[seg], b = t.pts[seg + 1], f = t.lens[seg] ? Math.min(1, dist / t.lens[seg]) : 1;
      t.ball.x = a.x + (b.x - a.x) * f; t.ball.y = a.y + (b.y - a.y) * f;
      if (p >= 1) {
        trav.splice(trav.indexOf(t), 1);
        t.ball.s = "tray"; t.ball.x = SLOT_X(t.slot); t.ball.y = TRAY_Y; t.ball.pop = simT;
        tray.push(t.ball);
        burst(t.ball.x, TRAY_Y, color(t.ball.n), 9, 0.9);
        if (play) play.onBall && play.onBall(tray.length, play.order.length, t.ball.n);
      }
    }
    if (play && !play.done && tray.length === play.order.length && !trav.length) {
      play.finishAt = play.finishAt || simT + 0.6;
      if (simT >= play.finishAt) finish();
    }
  }

  function startTravel(b, slot) {
    const pts = [{ x: b.x, y: b.y }].concat(CHUTE.slice(), [{ x: SLOT_X(slot), y: TRAY_Y }]);
    const lens = [];
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); lens.push(l); len += l; }
    b.s = "travel";
    trav.push({ ball: b, pts, lens, len, t0: simT, dur: Math.max(0.7, len / 600), slot });
  }

  function sequence() {
    if (!play || play.done) return;
    const p = play;
    if (p.next < p.order.length && simT >= p.nextAt) {          // 다음 공 뽑기
      const n = p.order[p.next];
      const b = balls.find((x) => x.n === n);
      b.s = "pull"; b.m = 3; b.pullT = simT; b.slot = p.next;
      pulls.push(b);
      p.next++;
      p.nextAt = simT + 0.85;
      mixLevel = 0.8;
    }
    for (const b of pulls.slice()) {
      const reached = Math.hypot(b.x - MOUTH.x, b.y - MOUTH.y) < 24;
      if (reached || simT - b.pullT > 1.5) { pulls.splice(pulls.indexOf(b), 1); b.m = 1; startTravel(b, b.slot); }
    }
  }

  function finish() {
    if (!play || play.done) return;
    play.done = true; mixLevel = 0.25;
    for (let i = 0; i < 6; i++) burst(SLOT_X(i), TRAY_Y - 10, color(play.order[i] || 1), 8, 1.6);
    const cb = play.onDone; play = null;
    if (cb) cb();
  }

  function burst(x, y, col, n, life) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rnd(-1.1, 1.1), sp = rnd(120, 340);
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rnd(0, 6), vr: rnd(-9, 9), col, t0: simT, life: life * rnd(0.7, 1.1), w: rnd(4, 8) });
    }
  }

  // ---------------------------------------------------------------- 그리기
  function readCss() {
    const s = getComputedStyle(document.documentElement);
    const v = (n, d) => (s.getPropertyValue(n).trim() || d);
    css = { line: v("--line", "#cbd5e1"), panel: v("--panel", "#fff"), panel2: v("--panel-2", "#f8fafc"), muted: v("--muted", "#64748b"), text: v("--text", "#0f172a") };
  }

  function drawBall(x, y, r, n) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(0.28, color(n)); g.addColorStop(1, "rgba(0,0,0,.28)");
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color(n); ctx.fill();
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 2;
    ctx.font = `800 ${Math.round(r * 0.95)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(n), x, y + r * 0.04); ctx.shadowBlur = 0;
  }

  function path(pts, w, style) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = w; ctx.strokeStyle = style; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
  }

  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  function draw() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const busy = !!play, base = CY + R;
    // 바닥 그림자
    const sh = ctx.createRadialGradient(CX, base + 62, 10, CX, base + 62, 150);
    sh.addColorStop(0, "rgba(15,23,42,.28)"); sh.addColorStop(1, "rgba(15,23,42,0)");
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(CX, base + 62, 160, 14, 0, 0, Math.PI * 2); ctx.fill();
    // 받침대(금속)
    const bg = ctx.createLinearGradient(0, base - 8, 0, base + 56);
    bg.addColorStop(0, "#64748b"); bg.addColorStop(0.5, "#334155"); bg.addColorStop(1, "#1e293b");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(CX - 100, base - 8); ctx.lineTo(CX + 100, base - 8); ctx.lineTo(CX + 132, base + 52); ctx.lineTo(CX - 132, base + 52); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0f172a"; rr(CX - 154, base + 48, 308, 20, 9); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.14)"; rr(CX - 150, base + 50, 300, 4, 2); ctx.fill();
    // 이름판 + 램프
    ctx.fillStyle = "#0b1220"; rr(CX - 62, base + 8, 124, 28, 8); ctx.fill();
    ctx.fillStyle = "#fbc400"; ctx.font = `800 15px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("LOTTO 6/45", CX, base + 23);
    const lamps = ["#ff7272", "#fbc400", "#b0d840"];
    for (let i = 0; i < 3; i++) {
      for (const sx of [-1, 1]) {
        const on = busy ? Math.floor(simT * 5 + i) % 3 === 0 : false, lx = CX + sx * (84 + i * 14), ly = base + 22;
        ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fillStyle = on ? lamps[i] : "#1e293b"; ctx.shadowColor = on ? lamps[i] : "transparent"; ctx.shadowBlur = on ? 12 : 0; ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    // 레버(섞을 때 돌아감)
    const lx = CX - 128, ly = base + 24;
    ctx.fillStyle = "#94a3b8"; ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(spin * 1.4); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -24); ctx.stroke(); ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(0, -26, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // 공이 나가는 관(공이 지나가는 동안 빛남)
    const glow = trav.length ? 1 : 0;
    path(CHUTE, 42, css.line); path(CHUTE, 34, css.panel2);
    if (glow) path(CHUTE, 30, "rgba(251,196,0,.18)");
    // 통(유리)
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2);
    const gl = ctx.createRadialGradient(CX - 50, CY - 60, 20, CX, CY, R);
    gl.addColorStop(0, "rgba(255,255,255,.28)"); gl.addColorStop(1, "rgba(148,163,184,.12)");
    ctx.fillStyle = css.panel2; ctx.fill(); ctx.fillStyle = gl; ctx.fill();
    for (const b of balls) if (b.s === "in" || b.s === "pull") drawBall(b.x, b.y, BR, b.n);
    // 돌아가는 테두리
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.lineWidth = 10; ctx.strokeStyle = "#64748b"; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = "#94a3b8"; ctx.stroke();
    for (let i = 0; i < 28; i++) {
      const a = spin + (i * Math.PI * 2) / 28;
      ctx.beginPath(); ctx.arc(CX + Math.cos(a) * R, CY + Math.sin(a) * R, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = i % 4 === 0 ? "#fbc400" : "rgba(255,255,255,.8)"; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(CX, CY, R - 9, Math.PI * 1.08, Math.PI * 1.45); ctx.lineWidth = 6; ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, R - 9, Math.PI * 0.12, Math.PI * 0.26); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.stroke();
    // 받는 곳
    const tg = ctx.createLinearGradient(0, TRAY_Y - 34, 0, TRAY_Y + 34);
    tg.addColorStop(0, css.panel2); tg.addColorStop(1, css.line);
    ctx.fillStyle = tg; ctx.strokeStyle = css.line; ctx.lineWidth = 1.5; rr(24, TRAY_Y - 34, 512, 68, 16); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(SLOT_X(i), TRAY_Y, TRAY_R + 3, 0, Math.PI * 2); ctx.setLineDash([4, 4]); ctx.strokeStyle = css.line; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
    for (const b of tray) {
      const d = b.pop != null ? simT - b.pop : 9, k = 1 + 0.32 * Math.exp(-7 * d) * Math.cos(20 * d);   // 도착하면 통통
      drawBall(b.x, b.y - (d < 0.5 ? 7 * Math.exp(-8 * d) * Math.abs(Math.cos(14 * d)) : 0), TRAY_R * k, b.n);
    }
    for (const t of trav) {
      const r = BR + (TRAY_R - BR) * Math.min(1, (simT - t.t0) / t.dur);
      ctx.shadowColor = color(t.ball.n); ctx.shadowBlur = 16; drawBall(t.ball.x, t.ball.y, r, t.ball.n); ctx.shadowBlur = 0;
    }
    // 색종이
    for (const q of parts) {
      const a = 1 - (simT - q.t0) / q.life;
      ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.col; ctx.fillRect(-q.w / 2, -q.w / 4, q.w, q.w / 2); ctx.restore();
    }
  }

  // ---------------------------------------------------------------- 루프
  function visible() { return canvas && canvas.offsetParent !== null && !document.hidden; }

  function loop(ts) {
    if (!canvas) return;
    if (!visible()) { last = 0; running = false; setTimeout(kick, 400); return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts; acc += dt;
    const h = 1 / 90;
    while (acc >= h) { step(h); acc -= h; }
    if (frame++ % 90 === 0) readCss();
    draw();
    requestAnimationFrame(loop);
  }
  function kick() { if (!running && canvas) { running = true; last = 0; requestAnimationFrame(loop); } }

  function fit() {
    if (!canvas) return;
    const w = canvas.clientWidth || W;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = w / W;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * (H / W) * dpr);
    canvas.style.height = "auto";
    if (!visible()) return;
    draw();
  }

  // ---------------------------------------------------------------- 바깥에 보이는 기능
  const api = {
    init(el) {
      canvas = el; ctx = canvas.getContext("2d");
      readCss(); resetBalls();
      for (let i = 0; i < 240; i++) step(1 / 90);      // 처음부터 쌓여 있는 모습
      fit();
      if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);
      else addEventListener("resize", fit);
      kick();
    },
    /** 번호(6개)를 받아 추첨 연출. onBall(몇 번째, 전체, 번호) 와 onDone 을 부른다. */
    play(nums, opts) {
      opts = opts || {};
      if (!canvas || play) return false;
      if (reduced()) { return false; }          // 움직임 줄이기 설정이면 연출하지 않음(호출한 쪽이 바로 결과를 보여 줌)
      resetBalls();
      for (let i = 0; i < 90; i++) step(1 / 90);
      const order = nums.slice();
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      mixLevel = 1;
      play = { order, next: 0, nextAt: simT + 1.2, onBall: opts.onBall, onDone: opts.onDone, done: false };
      kick();
      return true;
    },
    /** 바로 끝내고 모든 공을 받는 곳에 놓는다. */
    skip() {
      if (!play) return;
      for (const t of trav.slice()) { trav.splice(trav.indexOf(t), 1); t.ball.s = "tray"; tray.push(t.ball); }
      for (const n of play.order.slice(tray.length >= 0 ? 0 : 0)) {
        if (tray.some((b) => b.n === n)) continue;
        const b = balls.find((x) => x.n === n);
        b.s = "tray"; tray.push(b);
      }
      tray.forEach((b, i) => { b.x = SLOT_X(i); b.y = TRAY_Y; });
      pulls = []; play.next = play.order.length;
      finish();
    },
    isPlaying() { return !!play; },
    tray() { return tray.map((b) => b.n); },          // 시험용: 받는 곳에 놓인 공(나온 순서)
    ballsInDrum() { return balls.filter((b) => b.s === "in" || b.s === "pull").length; },
  };
  window.LottoMachine = api;
})();
