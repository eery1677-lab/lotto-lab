/* 3D 캐릭터 '로또' — 로또 공 박사. three.js(web/vendor, MIT) 로 그린 입체 캐릭터.
 * 공 몸통 + 박사모 + 둥근 안경 + 가운(등에 LOTTO 6/45) + 나비넥타이. 표정 7가지, 끌어서 360도 회전, 더블클릭 한 바퀴.
 * 작은 아바타(채팅 등)는 snapshots() 로 표정별 그림을 미리 찍어 쓰고, 큰 곳만 mount() 로 실시간 3D 를 돌린다.
 * WebGL 을 못 쓰는 기기에서는 ok=false 가 되고 화면이 간단한 그림으로 대신한다. */
import * as THREE from "./vendor/three.module.min.js";

const MOODS = ["normal", "happy", "think", "surprise", "firm", "wink", "worry"];
const FW = 640, FH = 320;           // 얼굴 그림(구 앞면에 입히는 조각)
const FACE = { phi0: Math.PI / 2 - 0.95, phiLen: 1.9, th0: 0.95, thLen: 0.95 };
const INK = "#1b2433";

// ---------------------------------------------------------------- 얼굴 그리기(2D → 텍스처)
function drawFace(g, mood, blink, look, mouthOpen) {
  g.clearRect(0, 0, FW, FH);
  g.lineCap = "round"; g.lineJoin = "round";
  const EL = [193, 135], ER = [447, 135];
  const lx = look ? Math.max(-1, Math.min(1, look.x)) * 13 : 0, ly = look ? Math.max(-1, Math.min(1, look.y)) * 9 : 0;
  const dot = (x, y, r, k) => {                     // k: 눈동자가 마우스를 따라가는 정도
    const kk = k == null ? 1 : k; x += lx * kk; y += ly * kk;
    g.fillStyle = INK; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(x + r * 0.34, y - r * 0.36, r * 0.36, 0, 7); g.fill();
  };
  const happyEye = (x, y) => { g.strokeStyle = INK; g.lineWidth = 12; g.beginPath(); g.moveTo(x - 34, y + 10); g.quadraticCurveTo(x, y - 34, x + 34, y + 10); g.stroke(); };
  const shutEye = (x, y) => { g.strokeStyle = INK; g.lineWidth = 11; g.beginPath(); g.moveTo(x - 24, y + 4); g.quadraticCurveTo(x, y + 14, x + 24, y + 4); g.stroke(); };
  const brow = (x, y, a, len, lw) => {
    g.strokeStyle = INK; g.lineWidth = lw || 10; g.beginPath();
    g.moveTo(x - len * Math.cos(a), y - len * Math.sin(a)); g.lineTo(x + len * Math.cos(a), y + len * Math.sin(a)); g.stroke();
  };
  // 볼터치
  const bl = mood === "happy" || mood === "wink" ? 0.6 : 0.4;
  g.fillStyle = `rgba(255,105,95,${bl})`;
  g.beginPath(); g.ellipse(92, 208, 40, 21, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(548, 208, 40, 21, 0, 0, 7); g.fill();
  // 눈썹
  const by = 34;
  if (mood === "firm") { brow(EL[0], by + 6, 0.4, 46, 13); brow(ER[0], by + 6, -0.4, 46, 13); }
  else if (mood === "worry") { brow(EL[0], by + 8, -0.42, 44, 11); brow(ER[0], by + 8, 0.42, 44, 11); }
  else if (mood === "surprise") { brow(EL[0], by - 12, -0.05, 42); brow(ER[0], by - 12, 0.05, 42); }
  else if (mood === "think") { brow(EL[0], by + 2, -0.06, 42); brow(ER[0], by - 14, 0.3, 42); }
  else if (mood === "happy") { brow(EL[0], by - 6, -0.14, 42); brow(ER[0], by - 6, 0.14, 42); }
  else if (mood === "sleep") { brow(EL[0], by + 10, -0.22, 40); brow(ER[0], by + 10, 0.22, 40); }
  else { brow(EL[0], by, -0.08, 42); brow(ER[0], by, 0.08, 42); }
  // 눈
  const closed = mood === "sleep" || (blink && mood !== "happy" && mood !== "wink" && mood !== "surprise");
  if (closed) { shutEye(EL[0], EL[1]); shutEye(ER[0], ER[1]); }
  else if (mood === "happy") { happyEye(EL[0], EL[1]); happyEye(ER[0], ER[1]); }
  else if (mood === "wink") { dot(EL[0], EL[1], 17); happyEye(ER[0], ER[1]); }
  else if (mood === "surprise") {
    for (const [x, y] of [EL, ER]) { g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 31, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); dot(x, y, 12, 0.8); }
  }
  else if (mood === "think") { dot(EL[0] + 14, EL[1] - 13, 16, 0.5); dot(ER[0] + 14, ER[1] - 13, 16, 0.5); }
  else if (mood === "firm") { dot(EL[0], EL[1] + 2, 15); dot(ER[0], ER[1] + 2, 15); }
  else if (mood === "worry") { dot(EL[0], EL[1] + 6, 17); dot(ER[0], ER[1] + 6, 17); }
  else { dot(EL[0], EL[1], 17); dot(ER[0], ER[1], 17); }
  // 입
  g.strokeStyle = "#7a3b00"; g.lineWidth = 9;
  const mx = 320, my = 226;
  const talking = mouthOpen != null && mouthOpen > 0.12 && mood !== "surprise" && mood !== "sleep";
  if (talking) {                                   // 말하는 중: 열린 정도에 따라 입 모양이 바뀜
    const o = mouthOpen;
    g.fillStyle = "#7a1f2b"; g.beginPath(); g.ellipse(mx, my + 6 + o * 8, 18 + o * 20, 7 + o * 26, 0, 0, 7); g.fill();
    if (o > 0.6) { g.save(); g.clip(); g.fillStyle = "#ff7a8a"; g.beginPath(); g.ellipse(mx, my + 24 + o * 8, 18, 10, 0, 0, 7); g.fill(); g.restore(); }
  } else if (mood === "sleep") { g.fillStyle = "#7a1f2b"; g.beginPath(); g.ellipse(mx, my + 6, 11, 9, 0, 0, 7); g.fill(); }
  else if (mood === "happy") {
    g.beginPath(); g.moveTo(mx - 52, my - 20); g.quadraticCurveTo(mx, my + 66, mx + 52, my - 20); g.closePath();
    g.fillStyle = "#7a1f2b"; g.fill();
    g.save(); g.clip(); g.fillStyle = "#ff7a8a"; g.beginPath(); g.ellipse(mx, my + 26, 24, 14, 0, 0, 7); g.fill(); g.restore();
  } else if (mood === "surprise") { g.fillStyle = "#7a1f2b"; g.beginPath(); g.ellipse(mx, my + 8, 20, 29, 0, 0, 7); g.fill(); }
  else if (mood === "firm") { g.beginPath(); g.moveTo(mx - 32, my + 2); g.lineTo(mx + 32, my + 2); g.stroke(); }
  else if (mood === "think") { g.beginPath(); g.moveTo(mx - 26, my + 8); g.quadraticCurveTo(mx + 4, my + 2, mx + 32, my - 10); g.stroke(); }
  else if (mood === "wink") { g.beginPath(); g.moveTo(mx - 40, my - 8); g.quadraticCurveTo(mx + 5, my + 34, mx + 46, my - 18); g.stroke(); }
  else if (mood === "worry") { g.beginPath(); g.moveTo(mx - 36, my + 16); g.quadraticCurveTo(mx, my - 14, mx + 36, my + 16); g.stroke(); }
  else { g.beginPath(); g.moveTo(mx - 34, my - 10); g.quadraticCurveTo(mx, my + 22, mx + 34, my - 10); g.stroke(); }
  // 땀방울
  if (mood === "worry") {
    g.fillStyle = "#a9deff"; g.strokeStyle = "#4aa3df"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(574, 62); g.quadraticCurveTo(596, 100, 574, 118); g.quadraticCurveTo(552, 100, 574, 62); g.fill(); g.stroke();
  }
}

function backTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#1f2a52"; g.font = "800 92px 'Segoe UI','Apple SD Gothic Neo',sans-serif"; g.fillText("LOTTO", 256, 96);
  g.fillStyle = "#e09b00"; g.font = "800 84px 'Segoe UI','Apple SD Gothic Neo',sans-serif"; g.fillText("6/45", 256, 184);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function symbolSprite(ch, color) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = "800 100px 'Segoe UI','Apple SD Gothic Neo',sans-serif";
  g.lineWidth = 12; g.strokeStyle = "#fff"; g.strokeText(ch, 64, 70); g.fillStyle = color; g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.visible = false; s.renderOrder = 10; return s;
}
function shadowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, "rgba(0,0,0,.45)"); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function cylBetween(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
const ease = (x) => 1 - Math.pow(1 - x, 3);

// ---------------------------------------------------------------- 캐릭터
class Lotto {
  constructor() {
    this.group = new THREE.Group();     // 사용자가 돌리는 회전
    this.rig = new THREE.Group();       // 통통·찌그러짐 등 동작
    this.group.add(this.rig);
    this.t = 0; this.moodT = 0; this.mood = "normal"; this.blink = false; this.blinkIn = 3 + Math.random() * 2; this.blinkT = 0;
    this.userYaw = 0; this.userPitch = 0; this.vel = 0; this.idle = 0; this.dragging = false; this.follow = 0; this.spinT = -1;
    this.symT = 0;
    this.look = { x: 0, y: 0 }; this.lookT = { x: 0, y: 0 }; this.lookOverride = null; this.shownLook = { x: 0, y: 0 };
    this.talking = false; this.talkT = 0; this.mouth = null; this.faceDirty = false; this.lastFace = 0;
    this.act = null; this.actIn = 4 + Math.random() * 3; this.lastAct = "";
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc400, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf7f9fd, roughness: 0.7 });
    const navy = new THREE.MeshStandardMaterial({ color: 0x1f2a52, roughness: 0.5 });
    const navy2 = new THREE.MeshStandardMaterial({ color: 0x141b3a, roughness: 0.45 });
    const red = new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.4 });
    const goldM = new THREE.MeshStandardMaterial({ color: 0xffcf3f, roughness: 0.3, metalness: 0.7 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.3, metalness: 0.5 });

    const body = new THREE.Group(); body.position.y = 1.15; this.rig.add(body); this.body = body;
    body.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), gold));
    // 얼굴 조각
    this.faceCanvas = document.createElement("canvas"); this.faceCanvas.width = FW; this.faceCanvas.height = FH;
    this.faceG = this.faceCanvas.getContext("2d");
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas); this.faceTex.colorSpace = THREE.SRGBColorSpace; this.faceTex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.SphereGeometry(1.004, 48, 32, FACE.phi0, FACE.phiLen, FACE.th0, FACE.thLen),
      new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, depthWrite: false }));
    body.add(face);
    // 가운 + 등 글자
    body.add(new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 32, 0, Math.PI * 2, 1.98, Math.PI - 1.98), white));
    const back = new THREE.Mesh(new THREE.SphereGeometry(1.038, 40, 24, -Math.PI / 2 - 0.8, 1.6, 2.12, 0.7),
      new THREE.MeshBasicMaterial({ map: backTexture(), transparent: true, depthWrite: false }));
    body.add(back);
    for (const [y, s] of [[-0.55, 0.05], [-0.8, 0.05]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 12), goldM); b.position.set(0, y, Math.sqrt(1.04 * 1.04 - y * y)); body.add(b); }
    // 나비넥타이
    const tie = new THREE.Group(); tie.position.set(0, -0.36, 0.985);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 16), red); w.rotation.z = (sx * Math.PI) / 2; w.position.x = sx * 0.15; tie.add(w); }
    tie.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), red)); body.add(tie);
    // 안경
    const gl = new THREE.Group(); body.add(gl);
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 20, 64), frame);
      ring.position.set(sx * 0.36, 0.22, 0.935); ring.rotation.y = sx * 0.38; gl.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.265, 40), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.05, clearcoat: 1 }));
      lens.position.copy(ring.position); lens.rotation.y = ring.rotation.y; lens.translateZ(0.004); gl.add(lens);
      gl.add(cylBetween(new THREE.Vector3(sx * 0.62, 0.22, 0.83), new THREE.Vector3(sx * 0.97, 0.2, 0.2), 0.02, frame));
    }
    gl.add(cylBetween(new THREE.Vector3(-0.1, 0.24, 0.95), new THREE.Vector3(0.1, 0.24, 0.95), 0.022, frame));
    // 박사모
    const cap = new THREE.Group(); cap.rotation.set(-0.06, 0, -0.05); body.add(cap); this.cap = cap;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.26, 40), navy); base.position.y = 0.84; cap.add(base);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.07, 1.75), navy2); board.position.y = 1.03; board.rotation.y = Math.PI / 4; cap.add(board);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), goldM); btn.position.y = 1.08; cap.add(btn);
    cap.add(cylBetween(new THREE.Vector3(0, 1.08, 0), new THREE.Vector3(1.2, 1.05, 0), 0.016, goldM));
    this.tassel = new THREE.Group(); this.tassel.position.set(1.2, 1.05, 0); cap.add(this.tassel);
    this.tassel.add(cylBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.3, 0), 0.016, goldM));
    const tc = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 14), goldM); tc.rotation.x = Math.PI; tc.position.y = -0.42; this.tassel.add(tc);
    // 팔·발
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 0.98, -0.08, 0.06);
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.48, 16), white); sl.position.y = -0.24; arm.add(sl);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 20), gold); hand.position.y = -0.54; arm.add(hand);
      arm.rotation.z = sx * 0.35; body.add(arm); this.arms.push(arm);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshStandardMaterial({ color: 0x26325a, roughness: 0.5 }));
      foot.scale.set(0.3, 0.16, 0.42); foot.position.set(sx * 0.36, -1.0, 0.22); body.add(foot);
    }
    // 그림자 + 표정 기호
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; this.group.add(sh); this.shadow = sh;
    this.syms = { think: symbolSprite("?", "#5b7cff"), surprise: symbolSprite("!", "#ff4d4d"), happy: symbolSprite("★", "#ffc21a"), wink: symbolSprite("♥", "#ff5c8a"), sleep: symbolSprite("z", "#7c8cff") };
    for (const s of Object.values(this.syms)) { s.position.set(1.05, 2.45, 0.2); this.rig.add(s); }
    this.setMood("normal");
  }
  setMood(m) {
    if (!MOODS.includes(m) && m !== "sleep") m = "normal";
    this.mood = m; this.moodT = 0; this.symT = 0; this.act = null; this.lookOverride = null; this.redraw();
    for (const s of Object.values(this.syms)) s.visible = false;
  }
  redraw() {
    drawFace(this.faceG, this.mood, this.blink, this.look, this.mouth);
    this.shownLook = { x: this.look.x, y: this.look.y }; this.lastFace = this.t; this.faceDirty = false; this.faceTex.needsUpdate = true;
  }
  setTalking(on) { this.talking = !!on; if (!on) { this.mouth = null; this.faceDirty = true; } }
  spin() { if (this.spinT < 0) { this.spinT = 0; this.spinFrom = this.userYaw; } }
  /** 가만히 있을 때 가끔 하는 동작(손 흔들기·두리번·폴짝·모자 인사·기지개·춤·한 바퀴) */
  idleAct(dt, p) {
    if (!this.act) {
      if (this.dragging || this.spinT >= 0) return;
      this.actIn -= dt; if (this.actIn > 0) return;
      this.startAct(["wave", "look", "hop", "hatTip", "stretch", "wiggle", "twirl"].filter((n) => n !== this.lastAct)[Math.floor(Math.random() * 6)]);
    }
    const a = this.act; if (!a) return;
    a.t += dt; const pr = a.t / a.dur;
    if (pr >= 1) { this.act = null; this.lookOverride = null; return; }
    const e = Math.min(1, pr * 5, (1 - pr) * 5), L = (x, y) => x + (y - x) * e;
    switch (a.name) {
      case "wave": p.armR = L(p.armR, 2.5 + Math.sin(a.t * 11) * 0.32); p.tz += -0.08 * e; break;
      case "look": { const sv = Math.sin(pr * Math.PI * 2) * e; p.yaw += sv * 0.6; this.lookOverride = { x: sv, y: -0.1 * e }; break; }
      case "hop": p.hop += Math.abs(Math.sin(pr * Math.PI * 2)) * 0.28 * e; p.armR = L(p.armR, 1.0); p.armL = L(p.armL, -1.0); break;
      case "hatTip": p.armR = L(p.armR, 2.1); p.capY = 0.24 * e; p.capZ = -0.4 * e; p.tx += 0.1 * e; break;
      case "stretch": p.armR = L(p.armR, 2.75); p.armL = L(p.armL, -2.75); p.sy *= 1 + 0.09 * e; p.sx *= 1 - 0.05 * e; break;
      case "wiggle": p.tz += Math.sin(a.t * 9) * 0.13 * e; p.armR = L(p.armR, 0.9 + Math.sin(a.t * 9) * 0.8); p.armL = L(p.armL, -0.9 - Math.sin(a.t * 9) * 0.8); p.hop += Math.abs(Math.sin(a.t * 9)) * 0.06 * e; break;
      default: break;
    }
  }
  startAct(name) {
    const DUR = { wave: 2.4, look: 3.2, hop: 1.5, hatTip: 2.1, stretch: 2.0, wiggle: 2.4, twirl: 1.2 };
    if (!DUR[name]) return;
    this.lastAct = name; this.act = { name, t: 0, dur: DUR[name] }; this.actIn = 4 + Math.random() * 5;
    if (name === "twirl") this.spin();
  }
  update(dt) {
    this.t += dt; this.moodT += dt; this.idle += dt;
    const t = this.t, mt = this.moodT, m = this.mood;
    // 눈 깜빡임
    if (this.blinkT > 0) { this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = false; this.faceDirty = true; } }
    else if (m !== "sleep") { this.blinkIn -= dt; if (this.blinkIn <= 0) { this.blink = true; this.blinkT = 0.13; this.blinkIn = 2.5 + Math.random() * 3.5; this.faceDirty = true; } }
    // 눈동자가 마우스를 따라감
    const lk = this.lookOverride || this.lookT, kk = 1 - Math.exp(-9 * dt);
    this.look.x += (lk.x - this.look.x) * kk; this.look.y += (lk.y - this.look.y) * kk;
    if (Math.abs(this.look.x - this.shownLook.x) > 0.06 || Math.abs(this.look.y - this.shownLook.y) > 0.06) this.faceDirty = true;
    // 말하는 입
    if (this.talking) {
      this.talkT -= dt;
      if (this.talkT <= 0) { this.mouth = Math.random() < 0.2 ? 0 : 0.3 + Math.random() * 0.7; this.talkT = 0.08 + Math.random() * 0.09; this.faceDirty = true; }
    }
    if (this.faceDirty && (t - this.lastFace > 0.05 || dt === 0)) this.redraw();
    // 사용자 회전(관성·자동 정면 복귀·한 바퀴)
    if (this.spinT >= 0) {
      this.spinT += dt / 1.1; const sp = Math.min(1, this.spinT); this.userYaw = this.spinFrom + Math.PI * 2 * (1 - Math.pow(1 - sp, 3));
      if (sp >= 1) { this.spinT = -1; this.idle = 0; }
    } else if (!this.dragging) {
      this.userYaw += this.vel * dt; this.vel *= Math.exp(-3.2 * dt);
      if (this.idle > 8) { const tgt = Math.round(this.userYaw / (Math.PI * 2)) * Math.PI * 2; this.userYaw += (tgt - this.userYaw) * (1 - Math.exp(-1.6 * dt)); this.userPitch *= Math.exp(-2 * dt); }
    }
    this.group.rotation.y = this.userYaw;
    // 표정별 동작
    const p = { hop: 0, sx: 1, sy: 1, tz: 0, tx: 0, yaw: 0, trem: 0, armR: 0.35, armL: -0.35, capY: 0, capZ: 0 };
    if (m === "happy") {
      p.hop = Math.abs(Math.sin(mt * 7)) * 0.3 * Math.exp(-mt * 1.1);
      if (mt < 3) p.armR = 2.5 + Math.sin(mt * 10) * 0.3;
      this.symShow("happy", 2.6);
    } else if (m === "surprise") {
      p.sy = 1 + 0.13 * Math.exp(-mt * 5) * Math.cos(mt * 28); p.sx = 1 - 0.07 * Math.exp(-mt * 5) * Math.cos(mt * 28);
      p.hop = Math.max(0, Math.sin(mt * 11)) * 0.22 * Math.exp(-mt * 4); p.armR = 0.8; p.armL = -0.8;
      this.symShow("surprise", 99);
    } else if (m === "think") {
      p.tz = 0.17 * (1 - Math.exp(-mt * 3)) + Math.sin(t * 1.3) * 0.02; p.armL = -1.0 + Math.sin(t * 1.5) * 0.05;
      this.symShow("think", 99);
    } else if (m === "firm") {
      p.yaw = Math.sin(mt * 15) * 0.26 * Math.exp(-mt * 1.7); p.armR = 0.55; p.armL = -0.55;
    } else if (m === "wink") {
      p.tz = -0.1 * (1 - Math.exp(-mt * 4)); if (mt < 3) p.armR = 2.2 + Math.sin(mt * 7) * 0.25;
      this.symShow("wink", 2.6);
    } else if (m === "worry") {
      p.trem = mt < 3 ? Math.sin(t * 42) * 0.014 : 0; p.tx = -0.07; p.armR = 0.6; p.armL = -0.6;
    } else if (m === "sleep") {
      p.tx = 0.1 + Math.sin(t * 1.1) * 0.04; p.armR = 0.2; p.armL = -0.2;
      this.symShow("sleep", 1e9);
      const z = this.syms.sleep, ph = (t * 0.5) % 1; z.position.set(0.85 + ph * 0.25, 2.3 + ph * 0.6, 0.2); z.scale.setScalar(0.34 + ph * 0.3); z.material.opacity = 1 - ph * 0.85;
    }
    if (m === "normal" && !this.talking) this.idleAct(dt, p); else if (this.act) { this.act = null; this.lookOverride = null; }
    if (this.talking) { p.hop += Math.abs(Math.sin(t * 13)) * 0.012; p.tz += Math.sin(t * 5.5) * 0.03; p.armR += Math.sin(t * 4) * 0.12; }   // 말할 때 고개·팔이 까딱
    const breathe = Math.sin(t * (m === "sleep" ? 1.1 : 2.2)) * (m === "sleep" ? 0.02 : 0.012);
    this.rig.position.set(p.trem, Math.sin(t * 2) * 0.03 + p.hop, 0);
    this.rig.scale.set(p.sx, p.sy * (1 + breathe), p.sx);
    const wrapped = ((this.userYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.rig.rotation.set(p.tx + this.userPitch, p.yaw + this.follow * Math.max(0, 1 - Math.abs(wrapped) * 1.6), p.tz);
    this.arms[0].rotation.z += (p.armL - this.arms[0].rotation.z) * (1 - Math.exp(-9 * dt));
    this.arms[1].rotation.z += (p.armR - this.arms[1].rotation.z) * (1 - Math.exp(-9 * dt));
    if (dt === 0) { this.arms[0].rotation.z = p.armL; this.arms[1].rotation.z = p.armR; }
    this.cap.position.y = p.capY; this.cap.rotation.z = -0.05 + p.capZ;
    this.tassel.rotation.z = Math.sin(t * 2.4) * 0.12 + p.hop * 0.5; this.tassel.rotation.x = Math.cos(t * 1.9) * 0.08;
    this.shadow.scale.setScalar(1 - p.hop * 0.6);
  }
  symShow(key, dur) {
    const s = this.syms[key]; if (!s) return;
    const st = this.moodT;
    if (st > dur) { s.visible = false; return; }
    s.visible = true;
    const pop = Math.min(1, st / 0.35), k = pop < 1 ? ease(pop) * 1.18 : 1.18 - 0.18 * Math.min(1, (st - 0.35) / 0.2);
    s.scale.setScalar(0.62 * k); s.position.y = 2.5 + Math.sin(this.t * 3) * 0.05;
  }
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9fd6, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2.5, 4, 4.5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb7ff, 0.8); fill.position.set(-3, 1.5, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe0a0, 1.5); rim.position.set(-2, 3, -4); scene.add(rim);
}
function makeRenderer(opts) {
  try {
    const r = new THREE.WebGLRenderer(Object.assign({ alpha: true, antialias: true, powerPreference: "low-power" }, opts || {}));
    r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; return r;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------- 바깥에 보이는 기능
const Lotto3D = {
  ok: !!makeRenderer(),     // 시험 삼아 한 번 만들어 보고 바로 버린다
  moods: MOODS,
  /** el 안에 실시간 3D 캐릭터를 올린다. 실패하면 null. */
  mount(el, opts) {
    opts = opts || {};
    const renderer = makeRenderer(); if (!renderer) return null;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const canvas = renderer.domElement; canvas.className = "lotto3d-canvas"; el.appendChild(canvas);
    const scene = new THREE.Scene(); addLights(scene);
    const ch = new Lotto(); scene.add(ch.group);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const zoom = opts.zoom || 1; cam.position.set(0, 1.55, 6.6 / zoom); cam.lookAt(0, 1.22, 0);
    let w = 0, h = 0, last = 0, running = false, drag = null;
    const size = () => {
      const nw = el.clientWidth || 100, nh = el.clientHeight || 120;
      if (nw === w && nh === h) return; w = nw; h = nh; renderer.setSize(w, h, false); canvas.style.width = "100%"; canvas.style.height = "100%";
      cam.aspect = w / h; cam.updateProjectionMatrix();
    };
    const visible = () => el.isConnected && el.offsetParent !== null && !document.hidden;
    const loop = (ts) => {
      if (!visible()) { running = false; last = 0; setTimeout(kick, 400); return; }
      size();
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      ch.update(dt); renderer.render(scene, cam); requestAnimationFrame(loop);
    };
    const kick = () => { if (!running && el.isConnected) { running = true; last = 0; requestAnimationFrame(loop); } };
    canvas.style.touchAction = "pan-y"; canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; ch.dragging = true; ch.vel = 0; ch.idle = 0; ch.spinT = -1; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 */ } canvas.style.cursor = "grabbing"; });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      ch.userYaw += dx * 0.013; ch.vel = dx * 0.013 * 50; ch.userPitch = Math.max(-0.35, Math.min(0.35, ch.userPitch + dy * 0.006)); ch.idle = 0;
    });
    const up = () => { if (!drag) return; const tap = drag.moved < 5; drag = null; ch.dragging = false; ch.idle = 0; canvas.style.cursor = "grab"; if (tap && opts.onTap) opts.onTap(); };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("dblclick", () => ch.spin());
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    window.addEventListener("pointermove", (e) => {      // 눈동자와 고개가 마우스를 따라간다
      if (!visible()) return; const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
      ch.lookT.x = clamp((e.clientX - cx) / (window.innerWidth * 0.35), -1, 1); ch.lookT.y = clamp((e.clientY - cy) / (window.innerHeight * 0.35), -1, 1) * 0.8;
      if (!drag) ch.follow = clamp((e.clientX - cx) / Math.max(300, window.innerWidth) * 1.6, -0.5, 0.5);
    }, { passive: true });
    kick();
    return {
      setMood(m) { ch.setMood(m); },
      get mood() { return ch.mood; },
      get yaw() { return ch.userYaw; },
      spin() { ch.spin(); },
      talk(on) { ch.setTalking(on); },
      wave() { if (ch.mood === "normal") ch.startAct("wave"); },
      act(name) { if (ch.mood === "normal") ch.startAct(name); },
      sleep(on) { ch.setMood(on ? "sleep" : "normal"); },
      hop() { const m = ch.mood; ch.setMood("happy"); setTimeout(() => ch.mood === "happy" && ch.setMood(m === "happy" ? "normal" : m), 1400); },
      destroy() { running = false; renderer.dispose(); canvas.remove(); },
    };
  },
  /** 시험용: 동작(act)·말하기·졸기·눈동자를 시간 t 초 지난 모습으로 찍는다. 예: poses(300, [{act:"wave", t:0.6}, {talk:0.8}, {mood:"sleep"}]) */
  poses(size, list, yaw) {
    const renderer = makeRenderer({ preserveDrawingBuffer: true, antialias: true }); if (!renderer) return null;
    renderer.setPixelRatio(1); renderer.setSize(size, size, false);
    const scene = new THREE.Scene(); addLights(scene);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50); cam.position.set(0, 1.6, 6.6); cam.lookAt(0, 1.22, 0);
    const out = [];
    for (const it of list) {
      const ch = new Lotto(); ch.userYaw = yaw == null ? 0.2 : yaw; scene.add(ch.group);
      ch.setMood(it.mood || "normal"); ch.blink = false; ch.actIn = 99;
      if (it.look) { ch.lookT = ch.look = { x: it.look[0], y: it.look[1] }; }
      if (it.talk != null) { ch.setTalking(true); ch.mouth = it.talk; }
      if (it.act) ch.startAct(it.act);
      ch.t = 1.0;
      for (let k = 0; k < Math.round((it.t || 0.5) / 0.02); k++) { ch.update(0.02); if (it.talk != null) ch.mouth = it.talk; }
      ch.update(0); ch.redraw(); renderer.render(scene, cam); out.push(renderer.domElement.toDataURL("image/png")); scene.remove(ch.group);
    }
    renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
    return out;
  },
  /** 표정별 그림(dataURL)을 미리 찍어 둔다 — 채팅 아바타 등 작은 곳에 쓴다. */
  snapshots(size, yaw, moods, view) {
    size = size || 160;
    const renderer = makeRenderer({ preserveDrawingBuffer: true, antialias: true }); if (!renderer) return null;
    renderer.setPixelRatio(1); renderer.setSize(size, size, false);
    const scene = new THREE.Scene(); addLights(scene);
    const ch = new Lotto(); ch.userYaw = yaw == null ? 0.3 : yaw; scene.add(ch.group);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    if (view === "bust") { cam.position.set(0, 1.62, 5.0); cam.lookAt(0, 1.56, 0); }   // 아바타용: 모자·얼굴이 동그라미에 꽉 차게
    else { cam.position.set(0, 1.75, 7.0); cam.lookAt(0, 1.4, 0); }
    const out = {};
    for (const m of moods || MOODS) { ch.setMood(m); ch.blink = false; ch.t = 0.6; ch.moodT = 0.45; ch.update(0); ch.redraw(); renderer.render(scene, cam); out[m] = renderer.domElement.toDataURL("image/png"); }
    renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
    return out;
  },
};
window.Lotto3D = Lotto3D;
window.dispatchEvent(new Event("lotto3d-ready"));
