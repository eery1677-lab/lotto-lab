/* 로또 추첨기 연출 — canvas. 공 45개 물리, 번호 6개가 관을 타고 나오는 장면.
 * 연출일 뿐이다: 번호는 서버가 미리 정해 play(nums) 로 넘기고, 기계는 그 번호의 공을 꺼내 보여 준다.
 * 외부 라이브러리·그림 파일·소리 파일 없음(소리는 Web Audio 로 합성, 기본 꺼짐). 화면에 안 보이거나 탭이 가려지면 멈춘다. */
(function () {
  "use strict";

  const W = 560, H = 500;
  const CX = 250, CY = 180, R = 150, BR = 15;     // 통 중심·반지름, 통 안 공 반지름
  const TRAY_Y = 444, TRAY_R = 21, SLOT_X = (i) => 62 + i * 87;
  const MOUTH_A = (-35 * Math.PI) / 180;
  const MOUTH = { x: CX + R * Math.cos(MOUTH_A), y: CY + R * Math.sin(MOUTH_A) };
  const CHUTE = [MOUTH, { x: 455, y: MOUTH.y }, { x: 455, y: TRAY_Y }];
  const PAL = [[10, "#ffc400"], [20, "#33b4ff"], [30, "#ff5555"], [40, "#98a4b6"], [45, "#6fd04a"]];
  const FONT = '"Apple SD Gothic Neo","Pretendard","Malgun Gothic","Segoe UI",sans-serif';
  const GOLD = "#ffcf3f";
  const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function shade(h, a) {
    const c = hex(h), t = a < 0 ? 0 : 255, p = Math.abs(a);
    return `rgb(${c.map((v) => Math.round((t - v) * p + v)).join(",")})`;
  }
  const palCache = {};
  function pal(n) {
    const base = (PAL.find(([m]) => n <= m) || PAL[4])[1];
    if (!palCache[base]) palCache[base] = { base, light: shade(base, 0.62), dark: shade(base, -0.55), mid: shade(base, -0.18) };
    return palCache[base];
  }

  let canvas = null, ctx = null, scale = 1, dpr = 1;
  let balls = [], tray = [], trav = [], pulls = [], parts = [], air = [], pops = [];
  let simT = 0, acc = 0, last = 0, running = false;
  let play = null, mixLevel = 0.25, spin = 0, haloBoost = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // 배경 별(고정 위치)
  const stars = [];
  { let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 34; i++) stars.push({ x: r() * W, y: r() * (H - 90), r: 0.6 + r() * 1.5, ph: r() * 6 }); }

  // ---------------------------------------------------------------- 소리(합성, 기본 꺼짐)
  let audio = null, soundOn = false, lastClick = 0, noiseBuf = null;
  function ac() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = false; } }
    if (audio && audio.state === "suspended") audio.resume();
    return audio || null;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    const a = soundOn && ac(); if (!a) return;
    const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  function tick() {
    const a = soundOn && ac(); if (!a) return;
    const now = performance.now(); if (now - lastClick < 45) return; lastClick = now;
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.025), a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); }
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = noiseBuf; g.gain.value = 0.05 * (0.5 + Math.random());
    s.connect(g); g.connect(a.destination); s.start();
  }
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

  // ---------------------------------------------------------------- 배경음악(합성 반복곡: 추첨하는 동안만, 끝나면 서서히 작아짐)
  // 파일 없이 코드로 만든 가벼운 4마디(C - Am - F - G) 반복. 효과음 '소리'와 따로 켜고 끈다.
  const CH = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]], ROOT = [130.81, 110, 87.31, 98];
  const ARP = [0, 1, 2, 1, 0, 1, 2, 1], STEP = 0.24;
  let bgmOn = true, bgm = null;
  function bnote(a, dest, f, t, dur, type, vol) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function bgmStart() {
    if (!bgmOn) return; const a = ac(); if (!a) return;
    if (bgm) { clearTimeout(bgm.endT); bgm.out = false; bgm.gain.gain.cancelScheduledValues(a.currentTime); bgm.gain.gain.linearRampToValueAtTime(1, a.currentTime + 0.3); return; }
    const gain = a.createGain(); gain.gain.setValueAtTime(0, a.currentTime); gain.gain.linearRampToValueAtTime(1, a.currentTime + 0.5); gain.connect(a.destination);
    bgm = { gain, step: 0, next: a.currentTime + 0.05, out: false, endT: 0, timer: 0 };
    const tickBgm = () => {
      if (!bgm) return; const s = bgm;
      while (s.next < a.currentTime + 0.35) {
        const bar = Math.floor(s.step / 8) % 4, k = s.step % 8, t = s.next, ch = CH[bar];
        bnote(a, gain, ch[ARP[k]] * (k % 4 === 2 ? 2 : 1), t, STEP * 1.6, "triangle", 0.11);
        if (k === 0 || k === 4) bnote(a, gain, ROOT[bar], t, STEP * 3.2, "sine", 0.18);
        if (k % 2 === 1) bnote(a, gain, 6000, t, 0.03, "square", 0.004);
        s.step++; s.next += STEP;
      }
    };
    bgm.timer = setInterval(tickBgm, 90); tickBgm();
  }
  function bgmStop(delayMs) {
    if (!bgm) return; const s = bgm; clearTimeout(s.endT);
    s.endT = setTimeout(() => {
      if (bgm !== s) return; const a = ac(); s.out = true;
      if (a) { s.gain.gain.cancelScheduledValues(a.currentTime); s.gain.gain.setValueAtTime(s.gain.gain.value, a.currentTime); s.gain.gain.linearRampToValueAtTime(0, a.currentTime + 1.4); }
      setTimeout(() => { if (bgm === s && s.out) { clearInterval(s.timer); try { s.gain.disconnect(); } catch (e) { /* 이미 끊김 */ } bgm = null; } }, 1600);
    }, delayMs || 0);
  }

  // ---------------------------------------------------------------- 공 준비
  function resetBalls() {
    balls = [];
    for (let n = 1; n <= 45; n++) {
      const a = rnd(0, Math.PI * 2), d = rnd(0, R - BR * 2);
      balls.push({ n, x: CX + Math.cos(a) * d * 0.9, y: CY - R * 0.3 + Math.sin(a) * d * 0.5, vx: rnd(-60, 60), vy: 0, m: 1, s: "in" });
    }
    tray = []; trav = []; pulls = []; parts = []; air = []; pops = [];
  }

  function burst(x, y, col, n, life) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rnd(-1.2, 1.2), sp = rnd(120, 360);
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rnd(0, 6), vr: rnd(-10, 10), col, t0: simT, life: life * rnd(0.7, 1.1), w: rnd(4, 9) });
    }
  }

  // ---------------------------------------------------------------- 물리
  function step(h) {
    simT += h;
    const k = mixLevel;
    spin += (0.35 + 3.2 * k) * h;
    haloBoost = Math.max(0, haloBoost - h * 0.9);
    for (const q of parts) { q.vy += 700 * h; q.x += q.vx * h; q.y += q.vy * h; q.rot += q.vr * h; }
    parts = parts.filter((q) => simT - q.t0 < q.life);
    pops = pops.filter((q) => simT - q.t0 < 1.0);
    // 공기 방울(섞는 동안 아래에서 올라옴)
    if (k > 0.5 && Math.random() < 38 * k * h) air.push({ x: CX + rnd(-110, 110), y: CY + R - 18, r: rnd(1.5, 4), vy: rnd(150, 300), ph: rnd(0, 6), t0: simT });
    for (const b of air) { b.y -= b.vy * h; b.x += Math.sin(simT * 6 + b.ph) * 20 * h; }
    air = air.filter((b) => Math.hypot(b.x - CX, b.y - CY) < R - 8 && simT - b.t0 < 1.4);

    const inb = balls.filter((b) => b.s === "in" || b.s === "pull");
    const g = 900 * (1 - 0.62 * k);                  // 섞는 동안은 공기에 떠서 중력이 약해진다
    const target = 60 + 330 * k * k;                  // 이 속도 밑으로 느려지면 다시 휘저어 준다
    const phase = simT * 3.1;
    for (const b of inb) {
      b.vy += g * h;
      if (b.s === "pull") {                            // 뽑힌 공: 난류 없이 출구로
        const ex = MOUTH.x - b.x, ey = MOUTH.y - b.y, ed = Math.hypot(ex, ey) || 1;
        b.vx += (ex / ed) * 3400 * h; b.vy += (ey / ed) * 3400 * h - 600 * h;
        continue;
      }
      const dx = b.x - CX, dy = b.y - CY, d = Math.hypot(dx, dy) || 1;
      // 1) 아래 가운데에서 뿜어 올리는 분수 바람(좌우로 살랑살랑 흔들림)
      const jx = CX + Math.sin(phase) * 46, jet = Math.exp(-Math.pow((b.x - jx) / 52, 2));
      if (b.y > CY - R * 0.5) b.vy -= 4200 * k * jet * h * (0.55 + 0.45 * Math.random());
      // 2) 통 전체를 도는 소용돌이(바깥쪽일수록 세게)
      const sw = k * 150 * h;   // 소용돌이는 약하게(세면 공이 벽을 따라 고리로 몰림)
      b.vx += (-dy / d) * sw; b.vy += (dx / d) * sw;
      // 3) 어디서나 일어나는 난류
      b.vx += (Math.random() - 0.5) * 5200 * k * h; b.vy += (Math.random() - 0.5) * 5200 * k * h;
      // 4) 에너지 유지: 너무 느리면 지금 방향(없으면 아무 방향)으로 밀어 준다
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < target) {
        const ux = sp > 8 ? b.vx / sp : Math.cos(Math.random() * 6.283), uy = sp > 8 ? b.vy / sp : Math.sin(Math.random() * 6.283);
        b.vx += ux * (target - sp) * 7 * h; b.vy += uy * (target - sp) * 7 * h;
      }
    }
    for (const b of inb) {
      b.vx *= 0.9985; b.vy *= 0.9985;
      const sp = Math.hypot(b.vx, b.vy);
      const cap = 520 + 260 * k;
      if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
      b.x += b.vx * h; b.y += b.vy * h;
      b.rot = (b.rot || 0) + ((b.vx - b.vy * 0.3) / BR) * h;   // 구르는 회전
      const dx = b.x - CX, dy = b.y - CY, d = Math.hypot(dx, dy);
      if (d > R - BR) {
        const nx = dx / d, ny = dy / d;
        b.x = CX + nx * (R - BR); b.y = CY + ny * (R - BR);
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= 1.92 * vn * nx; b.vy -= 1.92 * vn * ny; if (vn > 260) tick(); }
      }
    }
    for (let i = 0; i < inb.length; i++) {
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
          if (rv < -170) tick();
        }
      }
    }
    sequence();
    for (const t of trav.slice()) {
      const p = Math.min(1, (simT - t.t0) / t.dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      let dist = e * t.len, seg = 0;
      while (seg < t.pts.length - 2 && dist > t.lens[seg]) { dist -= t.lens[seg]; seg++; }
      const a = t.pts[seg], b = t.pts[seg + 1], f = t.lens[seg] ? Math.min(1, dist / t.lens[seg]) : 1;
      t.ball.x = a.x + (b.x - a.x) * f; t.ball.y = a.y + (b.y - a.y) * f;
      if (p >= 1) {
        trav.splice(trav.indexOf(t), 1);
        t.ball.s = "tray"; t.ball.x = SLOT_X(t.slot); t.ball.y = TRAY_Y; t.ball.pop = simT;
        tray.push(t.ball);
        burst(t.ball.x, TRAY_Y, pal(t.ball.n).base, 10, 0.95);
        pops.push({ n: t.ball.n, x: t.ball.x, t0: simT });
        haloBoost = Math.min(1.2, haloBoost + 0.4);
        tone(NOTES[t.slot % 6], 0.42, "triangle", 0.13); tone(720, 0.11, "sine", 0.1, 280);
        if (play) play.onBall && play.onBall(tray.length, play.order.length, t.ball.n);
      }
    }
    if (play && !play.done && tray.length === play.order.length && !trav.length) {
      play.finishAt = play.finishAt || simT + 0.7;
      if (simT >= play.finishAt) finish();
    }
  }

  function startTravel(b, slot) {
    const pts = [{ x: b.x, y: b.y }].concat(CHUTE.slice(), [{ x: SLOT_X(slot), y: TRAY_Y }]);
    const lens = []; let len = 0;
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); lens.push(l); len += l; }
    b.s = "travel";
    trav.push({ ball: b, pts, lens, len, t0: simT, dur: Math.max(0.7, len / 600), slot });
    tone(260, 0.25, "sawtooth", 0.035, 900);   // 슉
  }

  function sequence() {
    if (!play || play.done) return;
    const p = play;
    if (p.next < p.order.length && simT >= p.nextAt) {
      const b = balls.find((x) => x.n === p.order[p.next]);
      b.s = "pull"; b.m = 3; b.pullT = simT; b.slot = p.next;
      pulls.push(b); p.next++; p.nextAt = simT + 0.9; mixLevel = 0.85;
    }
    for (const b of pulls.slice()) {
      if (Math.hypot(b.x - MOUTH.x, b.y - MOUTH.y) < 24 || simT - b.pullT > 1.5) { pulls.splice(pulls.indexOf(b), 1); b.m = 1; startTravel(b, b.slot); }
    }
  }

  function finish() {
    if (!play || play.done) return;
    play.done = true; mixLevel = 0.25; haloBoost = 1.2;
    for (let i = 0; i < 6; i++) burst(SLOT_X(i), TRAY_Y - 10, pal(play.order[i] || 1).base, 9, 1.7);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.7, "triangle", 0.1, 0, i * 0.07));
    const cb = play.onDone; play = null; bgmStop(2200);
    if (cb) cb();
  }

  // ---------------------------------------------------------------- 그리기 도구
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function line(pts, w, style) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = w; ctx.strokeStyle = style; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
  }

  function drawBall(x, y, r, n, rot) {
    const p = pal(n);
    let g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r * 1.04);
    g.addColorStop(0, p.light); g.addColorStop(0.38, p.base); g.addColorStop(0.85, p.mid); g.addColorStop(1, p.dark);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    // 번호 라벨(진짜 로또 공처럼 흰 원)
    const lr = r * 0.56;
    g = ctx.createRadialGradient(x - lr * 0.3, y - lr * 0.3, lr * 0.1, x, y, lr);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#d9dee7");
    ctx.beginPath(); ctx.arc(x, y, lr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(0.6, r * 0.04); ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.stroke();
    ctx.fillStyle = "#1b2433"; ctx.font = `800 ${Math.round(r * (n > 9 ? 0.7 : 0.82))}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillText(String(n), 0, r * 0.04); ctx.restore(); } else ctx.fillText(String(n), x, y + r * 0.04);
    // 빛 반사
    ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.52, r * 0.3, r * 0.15, -0.65, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.78)"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r * 0.86, Math.PI * 0.12, Math.PI * 0.55); ctx.lineWidth = r * 0.1; ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineCap = "round"; ctx.stroke();
  }

  function metal(x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }

  // ---------------------------------------------------------------- 그리기
  function draw() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const busy = !!play, base = CY + R, glow = trav.length > 0;

    // 별 + 조명 줄기
    for (const s of stars) { ctx.globalAlpha = 0.25 + 0.4 * Math.abs(Math.sin(simT * 1.3 + s.ph)); ctx.fillStyle = "#cfe0ff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    const beam = ctx.createLinearGradient(0, 0, 0, base);
    beam.addColorStop(0, "rgba(170,195,255,.16)"); beam.addColorStop(1, "rgba(170,195,255,0)");
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(CX - 24, 0); ctx.lineTo(CX + 24, 0); ctx.lineTo(CX + 200, base + 20); ctx.lineTo(CX - 200, base + 20); ctx.closePath(); ctx.fill();
    // 후광(섞을수록, 공이 나올수록 밝아짐)
    const hi = 0.55 + 0.45 * mixLevel + haloBoost * 0.7;
    const halo = ctx.createRadialGradient(CX, CY, 20, CX, CY, 270);
    halo.addColorStop(0, `rgba(120,150,255,${0.3 * hi})`); halo.addColorStop(0.55, `rgba(90,110,230,${0.12 * hi})`); halo.addColorStop(1, "rgba(60,80,200,0)");
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    if (haloBoost > 0) { const gh = ctx.createRadialGradient(CX, TRAY_Y, 10, CX, TRAY_Y, 300); gh.addColorStop(0, `rgba(255,205,70,${0.22 * Math.min(1, haloBoost)})`); gh.addColorStop(1, "rgba(255,205,70,0)"); ctx.fillStyle = gh; ctx.fillRect(0, 280, W, 220); }

    // 바닥 그림자
    const sh = ctx.createRadialGradient(CX, base + 66, 10, CX, base + 66, 170);
    sh.addColorStop(0, "rgba(0,0,0,.5)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(CX, base + 66, 175, 15, 0, 0, Math.PI * 2); ctx.fill();

    // 받침대: 목 + 받침판(크롬)
    ctx.fillStyle = metal(CX - 110, 0, CX + 110, 0, [[0, "#3b4a6b"], [0.25, "#aab6d3"], [0.5, "#e8eefc"], [0.78, "#7a89ad"], [1, "#2a3555"]]);
    ctx.beginPath(); ctx.moveTo(CX - 104, base - 10); ctx.lineTo(CX + 104, base - 10); ctx.lineTo(CX + 136, base + 54); ctx.lineTo(CX - 136, base + 54); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = metal(0, base + 46, 0, base + 70, [[0, "#26325a"], [1, "#0a1026"]]); rr(CX - 158, base + 48, 316, 22, 10); ctx.fill();
    ctx.fillStyle = GOLD; rr(CX - 154, base + 49, 308, 3, 1.5); ctx.fill();
    // 이름판 + 램프
    ctx.fillStyle = "#070b18"; rr(CX - 66, base + 6, 132, 32, 9); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = busy ? 14 : 6; ctx.fillStyle = GOLD; ctx.font = `800 16px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("LOTTO 6/45", CX, base + 23); ctx.restore();
    const lamps = ["#ff5a5a", "#ffc83d", "#6fe06a"];
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
      const on = busy ? Math.floor(simT * 6 + i) % 3 === 0 : (Math.floor(simT * 1.2) + i) % 3 === 0, lx = CX + sx * (88 + i * 15), ly = base + 22;
      ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2); ctx.fillStyle = on ? lamps[i] : "#1a2240";
      ctx.shadowColor = on ? lamps[i] : "transparent"; ctx.shadowBlur = on ? 14 : 0; ctx.fill(); ctx.shadowBlur = 0;
    }
    // 레버
    const lx = CX - 132, ly = base + 26;
    ctx.fillStyle = metal(lx - 9, ly - 9, lx + 9, ly + 9, [[0, "#e2e8f0"], [1, "#64748b"]]); ctx.beginPath(); ctx.arc(lx, ly, 10, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(spin * 1.4); ctx.strokeStyle = "#dbe4f3"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -26); ctx.stroke();
    const kn = ctx.createRadialGradient(-2, -29, 1, 0, -27, 8); kn.addColorStop(0, "#ff9a9a"); kn.addColorStop(1, "#c81e1e");
    ctx.fillStyle = kn; ctx.beginPath(); ctx.arc(0, -27, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();

    // 유리 관(공이 지나가면 빛남)
    line(CHUTE, 48, "rgba(5,9,25,.85)");
    line(CHUTE, 42, "rgba(150,175,255,.22)");
    line(CHUTE, 34, "rgba(18,28,70,.72)");
    if (glow) { ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 22; line(CHUTE, 26, "rgba(255,205,70,.22)"); ctx.restore(); }
    line([{ x: MOUTH.x, y: MOUTH.y - 11 }, { x: 444, y: MOUTH.y - 11 }, { x: 444, y: TRAY_Y - 6 }], 3, "rgba(255,255,255,.35)");
    ctx.fillStyle = metal(0, 0, 40, 0, [[0, "#ffe27a"], [1, "#b8860b"]]);
    ctx.save(); ctx.translate(MOUTH.x + 2, MOUTH.y); ctx.rotate(MOUTH_A + Math.PI / 2); rr(-25, -7, 50, 14, 6); ctx.fill(); ctx.restore();
    rr(455 - 26, MOUTH.y - 26, 52, 10, 4); ctx.fill(); rr(455 - 26, TRAY_Y - 58, 52, 11, 4); ctx.fill();

    // 통(흔들림)
    const shake = busy ? 1.6 * mixLevel : 0.25;
    ctx.save(); ctx.translate(Math.sin(simT * 57) * shake, Math.cos(simT * 49) * shake);
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2);
    const gl = ctx.createRadialGradient(CX - 30, CY - 40, 10, CX, CY, R);
    gl.addColorStop(0, "rgba(70,95,170,.55)"); gl.addColorStop(0.7, "rgba(24,36,86,.7)"); gl.addColorStop(1, "rgba(10,16,48,.85)");
    ctx.fillStyle = gl; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, R - 4, 0, Math.PI * 2); ctx.clip();
    for (const b of air) { ctx.globalAlpha = 0.45 * (1 - (simT - b.t0) / 1.4); ctx.fillStyle = "#cfe0ff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const b of balls) if (b.s === "in" || b.s === "pull") {      // 빠른 공의 잔상
      if (b.dx0 != null) {
        const mx = b.x - b.dx0, my = b.y - b.dy0, ml = Math.hypot(mx, my);
        if (ml > 5 && ml < 110) { ctx.globalAlpha = Math.min(0.2, ml / 240); line([{ x: b.dx0, y: b.dy0 }, { x: b.x, y: b.y }], BR * 1.15, pal(b.n).base); ctx.globalAlpha = 1; }
      }
      b.dx0 = b.x; b.dy0 = b.y;
    }
    for (const b of balls) if (b.s === "in" || b.s === "pull") {
      if (b.s === "pull") { ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 14; drawBall(b.x, b.y, BR, b.n, b.rot); ctx.restore(); } else drawBall(b.x, b.y, BR, b.n, b.rot);
    }
    ctx.restore();
    // 유리 반사와 가장자리 빛
    const fr = ctx.createRadialGradient(CX, CY, R * 0.78, CX, CY, R);
    fr.addColorStop(0, "rgba(255,255,255,0)"); fr.addColorStop(1, "rgba(190,210,255,.28)");
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fillStyle = fr; ctx.fill();
    ctx.beginPath(); ctx.ellipse(CX - 62, CY - 78, 56, 26, -0.7, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fill();
    ctx.beginPath(); ctx.arc(CX, CY, R - 10, Math.PI * 1.08, Math.PI * 1.42); ctx.lineWidth = 7; ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, R - 10, Math.PI * 0.1, Math.PI * 0.22); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.stroke();
    // 금속 테두리 + 도는 금빛 장식
    ctx.beginPath(); ctx.arc(CX, CY, R + 2, 0, Math.PI * 2); ctx.lineWidth = 15; ctx.strokeStyle = "#0e1633"; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, R + 1, 0, Math.PI * 2); ctx.lineWidth = 9; ctx.strokeStyle = metal(CX - R, CY - R, CX + R, CY + R, [[0, "#f4f8ff"], [0.35, "#9aa8c8"], [0.6, "#e4ebfb"], [1, "#56658a"]]); ctx.stroke();
    for (let i = 0; i < 28; i++) {
      const a = spin + (i * Math.PI * 2) / 28;
      ctx.beginPath(); ctx.arc(CX + Math.cos(a) * (R + 1), CY + Math.sin(a) * (R + 1), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = i % 4 === 0 ? GOLD : "rgba(255,255,255,.85)"; ctx.fill();
    }
    ctx.restore();

    // 받는 곳(어두운 선반 + 금테)
    ctx.fillStyle = metal(0, TRAY_Y - 34, 0, TRAY_Y + 34, [[0, "#18224a"], [1, "#0a1026"]]); rr(24, TRAY_Y - 34, 512, 68, 16); ctx.fill();
    ctx.strokeStyle = "rgba(255,207,63,.55)"; ctx.lineWidth = 1.5; ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const sx = SLOT_X(i);
      ctx.beginPath(); ctx.arc(sx, TRAY_Y, TRAY_R + 4, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(160,180,255,.35)"; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const b of tray) {
      const d = b.pop != null ? simT - b.pop : 9;
      if (d < 0.9) {   // 도착 빛 번짐
        const c = pal(b.n).base, gg = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, 46);
        gg.addColorStop(0, c); gg.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.5 * (1 - d / 0.9); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(b.x, b.y, 46, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      const k = 1 + 0.32 * Math.exp(-7 * d) * Math.cos(20 * d);
      drawBall(b.x, b.y - (d < 0.5 ? 8 * Math.exp(-8 * d) * Math.abs(Math.cos(14 * d)) : 0), TRAY_R * k, b.n);
    }
    for (const t of trav) {
      const r = BR + (TRAY_R - BR) * Math.min(1, (simT - t.t0) / t.dur);
      ctx.save(); ctx.shadowColor = pal(t.ball.n).base; ctx.shadowBlur = 20; drawBall(t.ball.x, t.ball.y, r, t.ball.n); ctx.restore();
    }
    // 번호 크게 떠오름
    for (const q of pops) {
      const a = (simT - q.t0) / 1.0, sc = a < 0.15 ? (a / 0.15) * 1.3 : 1.3 - 0.3 * Math.min(1, (a - 0.15) / 0.25);
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - a * a); ctx.translate(q.x, TRAY_Y - 40 - a * 42); ctx.scale(sc, sc);
      ctx.font = `800 34px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(String(q.n), 0, 0); ctx.fillStyle = pal(q.n).light; ctx.fillText(String(q.n), 0, 0); ctx.restore();
    }
    // 색종이
    for (const q of parts) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (simT - q.t0) / q.life); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.col; ctx.fillRect(-q.w / 2, -q.w / 4, q.w, q.w / 2); ctx.restore();
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
    draw();
    requestAnimationFrame(loop);
  }
  function kick() { if (!running && canvas) { running = true; last = 0; requestAnimationFrame(loop); } }
  function fit() {
    if (!canvas) return;
    const w = canvas.clientWidth || W;
    dpr = Math.min(2, window.devicePixelRatio || 1); scale = w / W;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * (H / W) * dpr);
    if (visible()) draw();
  }

  // ---------------------------------------------------------------- 바깥에 보이는 기능
  const api = {
    init(el) {
      canvas = el; ctx = canvas.getContext("2d");
      resetBalls();
      for (let i = 0; i < 240; i++) step(1 / 90);
      fit();
      if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas); else addEventListener("resize", fit);
      kick();
    },
    /** 번호(6개)를 받아 추첨 연출. 연출을 못 하는 환경이면 false(호출한 쪽이 바로 결과를 보여 준다). */
    play(nums, opts) {
      opts = opts || {};
      if (!canvas || play || reduced()) return false;
      resetBalls();
      for (let i = 0; i < 90; i++) step(1 / 90);
      const order = nums.slice();
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      mixLevel = 1;
      play = { order, next: 0, nextAt: simT + 2.1, onBall: opts.onBall, onDone: opts.onDone, done: false };
      bgmStart(); kick();
      return true;
    },
    skip() {
      if (!play) return;
      for (const t of trav.slice()) { trav.splice(trav.indexOf(t), 1); t.ball.s = "tray"; tray.push(t.ball); }
      for (const n of play.order) {
        if (tray.some((b) => b.n === n)) continue;
        const b = balls.find((x) => x.n === n); b.s = "tray"; tray.push(b);
      }
      tray.forEach((b, i) => { b.x = SLOT_X(i); b.y = TRAY_Y; b.pop = simT; });
      pulls = []; play.next = play.order.length;
      finish();
    },
    /** 받는 곳을 비우고 공을 통 안으로 되돌린다. */
    reset() { if (!play && canvas) { resetBalls(); for (let i = 0; i < 120; i++) step(1 / 90); } },
    setSound(on) { soundOn = !!on; if (on) ac(); },
    /** 휴대폰: 첫 터치 때 소리 장치를 깨워 둔다(그 뒤에야 소리가 난다) */
    unlock() { const a = ac(); if (a) { try { const b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0); } catch (e) { /* 무시 */ } } },
    setBgm(on) { bgmOn = !!on; if (!bgmOn) bgmStop(0); },
    /** 시험용: 화면 갱신과 무관하게 sec 초만큼 시간을 흘린다. */
    advance(sec) { const n = Math.round(sec * 90); for (let i = 0; i < n; i++) step(1 / 90); if (visible()) draw(); },
    isPlaying() { return !!play; },
    tray() { return tray.map((b) => b.n); },
    /** 시험용: 통 안 공의 평균 속도와 위·아래 분포. */
    stats() { const a = balls.filter((b) => b.s === "in" || b.s === "pull"); const sp = a.reduce((t, b) => t + Math.hypot(b.vx, b.vy), 0) / a.length; return { avgSpeed: Math.round(sp), topHalf: a.filter((b) => b.y < CY).length, core: a.filter((b) => Math.hypot(b.x - CX, b.y - CY) < R * 0.5).length, bottomThird: a.filter((b) => b.y > CY + R * 0.45).length, total: a.length }; },
    ballsInDrum() { return balls.filter((b) => b.s === "in" || b.s === "pull").length; },
  };
  window.LottoMachine = api;
})();
