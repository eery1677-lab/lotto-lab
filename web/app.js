/* 로또 확률 연구소 — 화면. 모든 숫자는 서버(analysis.py)가 계산한 값을 그대로 보여 준다. */
(function () {
  "use strict";

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("ko-KR");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("lottolab_" + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("lottolab_" + k, v); } catch (e) { /* 저장 불가 환경 */ } },
  };

  let S = null; // /api/summary

  // ---------------------------------------------------------------- 공통
  function won(n) {
    n = Math.round(n);
    if (Math.abs(n) >= 1e8) {
      const eok = Math.floor(n / 1e8);
      const man = Math.round((n % 1e8) / 1e4);
      return man ? `${fmt(eok)}억 ${fmt(man)}만원` : `${fmt(eok)}억원`;
    }
    if (Math.abs(n) >= 1e4) return `${fmt(Math.round(n / 1e4))}만원`;
    return `${fmt(n)}원`;
  }
  function ballClass(n) { return n <= 10 ? "y" : n <= 20 ? "b" : n <= 30 ? "r" : n <= 40 ? "g" : "gr"; }
  function ball(n, size) { return `<span class="ball ${ballClass(n)} ${size || ""}">${n}</span>`; }
  function balls(nums, bonus, size) {
    return `<div class="balls">${nums.map((n) => ball(n, size)).join("")}${bonus ? `<span class="plus">+</span>${ball(bonus, size)}` : ""}</div>`;
  }
  function pPill(p) {
    return p >= 0.05
      ? `<span class="pill good" title="p값 ${p}">무작위와 일치 · p=${p}</span>`
      : `<span class="pill warn" title="p값 ${p}">차이 있음 · p=${p}</span>`;
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  async function api(path, body) {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
    return j;
  }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => toast("복사했습니다"))
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); toast("복사했습니다"); } catch (e) { toast("복사 실패"); }
        ta.remove();
      });
  }

  // ---------------------------------------------------------------- 탭
  function showView(v) {
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
    document.body.classList.toggle("ai-mode", v === "ai");
    store.set("view", v);
    if (v === "ai") initChat();
    window.scrollTo(0, 0);
  }
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  // 화면 밝기
  (function theme() {
    const saved = store.get("theme", "");
    if (saved) document.documentElement.dataset.theme = saved;
    $("#theme-btn").addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches;
      const next = dark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      store.set("theme", next);
    });
  })();

  // ---------------------------------------------------------------- SVG 차트
  function barChart(opts) {
    // opts: labels, values, expected(선택), band([lo,hi] 선택), highlight(i=>bool), height, labelEvery
    const W = 900, H = opts.height || 260, L = 44, R = 10, T = 12, B = 30;
    const n = opts.values.length;
    const maxV = Math.max(...opts.values, ...(opts.expected || [0]), opts.band ? opts.band[1] : 0) * 1.08;
    const minV = opts.min != null ? opts.min : 0;
    const x = (i) => L + (i + 0.5) * ((W - L - R) / n);
    const y = (v) => T + (H - T - B) * (1 - (v - minV) / (maxV - minV));
    const bw = Math.max(2, ((W - L - R) / n) * 0.66);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
    for (let k = 0; k <= 4; k++) {
      const v = minV + ((maxV - minV) * k) / 4;
      s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" />`;
      s += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${opts.fmtY ? opts.fmtY(v) : Math.round(v)}</text>`;
    }
    if (opts.band) s += `<rect class="band" x="${L}" width="${W - L - R}" y="${y(opts.band[1])}" height="${y(opts.band[0]) - y(opts.band[1])}" />`;
    opts.values.forEach((v, i) => {
      const hi = opts.highlight && opts.highlight(i);
      s += `<rect class="bar-n ${hi ? "hi" : ""}" x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(minV) - y(v))}" rx="2"><title>${esc(opts.labels[i])}: ${opts.fmtTip ? opts.fmtTip(v, i) : fmt(v)}</title></rect>`;
      if (!opts.labelEvery || i % opts.labelEvery === 0 || i === n - 1)
        s += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${esc(opts.labels[i])}</text>`;
    });
    if (opts.expected) {
      if (opts.expected.length === 1) {
        s += `<line class="exp" x1="${L}" x2="${W - R}" y1="${y(opts.expected[0])}" y2="${y(opts.expected[0])}" />`;
      } else {
        s += `<polyline class="exp" points="${opts.expected.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" />`;
      }
    }
    return s + "</svg>";
  }

  // ---------------------------------------------------------------- 요약
  function afterTax(x) {  // analysis.after_tax 와 같은 규칙(화면 표시용)
    if (x <= 2000000) return x;
    const t = x - 1000;
    return Math.round(x - (0.22 * Math.min(t, 3e8) + 0.33 * Math.max(0, t - 3e8)));
  }
  function dday(dateStr) {
    const [y, mo, da] = dateStr.split("-").map(Number);
    const now = new Date();
    const diff = Math.round((new Date(y, mo - 1, da) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    return diff > 0 ? `D-${diff}` : diff === 0 ? "오늘 추첨" : "결과 확인 중";
  }
  function renderHome() {
    const d = S.latest, m = S.money, r = S.randomness, b = S.backtest;
    const next = S.status.next_draw;
    $("#home-hero").innerHTML = `
      <div class="hero2-main">
        <div class="small muted">최신 <b>${d.no}회</b> · ${esc(d.date)} 추첨</div>
        ${balls(d.nums, d.bonus, "lg")}
        <div class="hero2-sub">${d.winners[0]
          ? `1등 <b>${fmt(d.winners[0])}명</b> · 1인당 ${won(d.amounts[0])} <span class="muted">(세후 약 ${won(afterTax(d.amounts[0]))})</span>`
          : "1등 당첨자 없음 — 이월"}</div>
      </div>
      <div class="hero2-side">
        <div class="dday">${dday(next)}</div>
        <div class="small muted">다음 ${d.no + 1}회 · ${esc(next)}(토) 20:35</div>
        <div class="hero2-btns">
          <button class="btn primary" data-go="gen">번호 만들기</button>
          <button class="btn ai" data-go="ai">AI에게 묻기</button>
        </div>
      </div>`;
    $$("#home-hero [data-go]").forEach((x) => x.addEventListener("click", () => showView(x.dataset.go)));
    const tests = [r.freq_test.p, r.sum.test.p, r.odd.test.p, r.repeat.test.p, r.consecutive.p];
    const passed = tests.filter((p) => p >= 0.05).length;
    const beat = b.strategies.filter((s) => s.key !== "random" && s.p < 0.05 && s.mean > b.theory_mean).length;
    $("#home-stats").innerHTML = [
      ["1등 확률", "1 / 8,145,060", "어떤 번호든 같음"],
      ["1,000원당 돌아오는 돈", `평균 ${m.ev_avg ? m.ev_avg[0] : Math.round(m.payout_pct_recent * 10)}원`, m.ev_floor ? `비인기 조합 최대 ${m.ev_floor[0]}원` : `환급률 ${m.payout_pct_recent}%`],
      ["무작위성 검정", `${passed} / ${tests.length} 통과`, "완전 무작위와 구별 안 됨"],
      ["예측법 7가지", beat ? `${beat}개 우세` : "전부 효과 없음", `${fmt(b.tested)}회로 검증`],
    ].map(([k, v, s]) => `<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    $("#home-conclusion").innerHTML = `
      <b>당첨 번호를 맞히는 방법은 없습니다.</b> ${fmt(S.randomness.draws)}회 결과는 완전 무작위와 구별되지 않고,
      유명한 예측법들도 무작위로 고른 것과 성적이 같았습니다.<br><br>
      <b>대신 할 수 있는 것:</b> 당첨됐을 때 나눠 가질 사람이 적은 조합을 고르는 것. 평균 조합은 1등이 되면
      약 <b>${m.lambda_avg}명</b>과 나누게 됩니다(최근 1년 판매량 기준).
      <div style="margin-top:12px"><button class="btn primary sm" data-go="gen">비인기 조합 만들기 →</button></div>`;
    $("#home-conclusion [data-go]").addEventListener("click", () => showView("gen"));
    const v = [
      ["번호별 출현 횟수", r.freq_test.p],
      ["6개 합계 분포", r.sum.test.p],
      ["홀짝 비율", r.odd.test.p],
      ["직전 회차와의 관계", r.repeat.test.p],
      ["연속 번호 비율", r.consecutive.p],
    ];
    $("#home-verdicts").innerHTML = v.map(([k, p]) => `<div class="verdict"><span>${k}</span>${pPill(p)}</div>`).join("");
    $("#recent").innerHTML = S.recent.map((x) => `
      <tr><td><b>${x.no}회</b><div class="small muted">${esc(x.date)}</div></td>
      <td>${balls(x.nums, x.bonus, "sm")}</td>
      <td class="small muted" style="text-align:right;white-space:nowrap">1등 ${x.winners[0]}명<br>${x.winners[0] ? won(x.amounts[0]) : "이월"}</td></tr>`).join("");
    const st = S.status;
    $("#data-status").innerHTML = `자료: ${S.latest.no}회까지<br><span class="small">다음 추첨 ${esc(st.next_draw)}</span>
      ${st.updating ? "<br>새 회차 확인 중…" : ""}${st.error ? `<br><span style="color:var(--warn)">업데이트 실패(저장된 자료 사용)</span>` : ""}
      <br><button class="theme-btn" id="update-btn">지금 새 회차 확인</button>`;
    $("#update-btn").addEventListener("click", async (e) => {
      e.target.disabled = true; e.target.textContent = "확인 중…";
      try {
        const res = await api("/api/update", {});
        toast(res.ok ? `${res.latest}회까지 최신입니다` : "업데이트 실패: " + (res.error || ""));
        await load();
      } catch (err) { toast(err.message); }
    });
    $("#prob-list").innerHTML = ["1등 (6개)", "2등 (5개+보너스)", "3등 (5개)", "4등 (4개)", "5등 (3개)"]
      .map((k, i) => `<li>${k}: ${m.prob.rank[i]}</li>`).join("");
    $("#ev-text").innerHTML = `동행복권 전 회차의 당첨금 총액을 판매액으로 나누면 <b>${m.payout_pct_all}%</b>(최근 52회 ${m.payout_pct_recent}%)입니다.
      1,000원을 내면 평균 약 ${Math.round(m.payout_pct_recent * 10)}원이 돌아온다는 뜻이고, 나머지는 복권기금·운영비입니다.
      어떤 번호 전략도 이 비율을 바꾸지 못합니다. 전 조합을 사는 비용은 ${won(m.buy_all_cost)}입니다.`;
    $("#gen-why").innerHTML = `1등 상금은 당첨자 수로 나눕니다. 최근 1년 평균 1등 총상금은 약 <b>${won(m.rank1_pool)}</b>이고, 평균적인 조합이 1등이 되면
      약 ${m.lambda_avg}명이 함께 당첨됩니다. 사람들이 생일·행운의 숫자·과거 당첨번호를 많이 고르기 때문에 그런 번호가 섞인 조합은 동반 당첨자가 더 많습니다.
      실제로 ${m.most_rank1.no}회(${esc(m.most_rank1.date)})는 1등이 <b>${m.most_rank1.winners}명</b>이라 1인당 ${won(m.most_rank1.amount)}에 그쳤습니다.
      비인기 조합은 <b>당첨 확률은 그대로, 당첨됐을 때의 몫만 늘립니다.</b>`;
  }

  // ---------------------------------------------------------------- 번호 만들기
  function segValue(id) { return ($(`#${id} button.on`) || {}).dataset ? $(`#${id} button.on`).dataset.v : null; }
  $$(".seg").forEach((seg) => seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("button", seg).forEach((x) => x.classList.toggle("on", x === b));
    if (seg.id === "gen-mode") $("#gen-strength-wrap").style.display = b.dataset.v === "random" ? "none" : "";
  }));
  let lastCombos = [];
  function comboHTML(c, i, extra) {
    const pct = Math.min(100, (c.popularity / 1.3) * 100);
    const gain = c.expected_rank1 / c.expected_rank1_avg - 1;
    return `<div class="combo">
      <div><div class="small muted" style="margin-bottom:4px">${i != null ? String.fromCharCode(65 + i) + " 게임" : ""}</div>${balls(c.nums)}</div>
      <div class="meta">
        인기도 <b>${c.popularity}배</b> (1.0 = 평균 조합, 하위 ${c.percentile}%)
        <div class="bar" title="회색 선 = 평균 조합"><i style="width:${pct}%;background:${c.popularity <= 1 ? "var(--good)" : "var(--warn)"}"></i><span class="avg" style="left:${100 / 1.3}%"></span></div>
        1등이면 함께 당첨될 사람 약 <b>${c.co_winners}명</b> · 기대 수령액 세전 <b>${won(c.expected_rank1)}</b> / 세후 <b>${won(c.expected_rank1_net)}</b>
        <span style="color:${gain >= 0 ? "var(--good)" : "var(--warn)"}">(평균 조합 대비 ${gain >= 0 ? "+" : ""}${(gain * 100).toFixed(1)}%)</span>
        <div>1,000원당 기대 환급 <b>${c.ev[0]}원</b>(세후 ${c.ev[1]}원) · 평균 조합 ${c.ev_avg[0]}원 · 이론 최대 ${c.ev_floor[0]}원</div>
        <div>합계 ${c.sum} · 홀수 ${c.odd}개${c.past4 ? ` · <span style="color:var(--warn)">과거 1등과 4개 이상 같음</span>` : ""}</div>
        ${c.known_patterns && c.known_patterns.length ? `<div style="color:var(--warn)">⚠️ 알려진 인기 모양(${c.known_patterns.map(esc).join(", ")}) — 당첨번호로 거의 안 나와 위 계산에 반영되지 못합니다. 해외 연구상 이런 모양은 수천 명이 같이 사므로 실제로는 훨씬 많은 사람과 나눌 수 있습니다.</div>` : ""}
      </div>
      ${i != null ? `<div class="combo-btns"><button class="btn sm" data-copy="${c.nums.join(" ")}">복사</button>${extra || ""}</div>` : ""}
    </div>`;
  }
  // ---- 한 게임씩 뽑기
  const games = [];            // 이번에 뽑은 게임들
  const MAX_GAMES = 20;
  const letter = (i) => String.fromCharCode(65 + i);
  let busyGen = false;
  function renderGames(fresh) {
    lastCombos = games;
    const box = $("#gen-result");
    if (!games.length) {
      box.innerHTML = `<div class="muted">아직 뽑은 게임이 없습니다. 위의 ‘번호 뽑기’를 눌러 한 게임씩 뽑아 보세요.</div>`;
    } else {
      const g0 = games[0];
      box.innerHTML = games.map((c, i) => `<div class="game-wrap${fresh && i === games.length - 1 ? " fresh" : ""}">${comboHTML(c, i, `<button class="btn sm" data-drop="${i}">빼기</button>`)}</div>`).join("") +
        `<div class="note">당첨 확률은 모든 게임이 1/8,145,060 으로 같습니다. 평균 조합의 1등 기대 수령액은 세전 ${won(g0.expected_rank1_avg)} / 세후 ${won(g0.expected_rank1_net_avg)}이고, 세후는 200만원 초과 시 3억원까지 22%, 초과분 33%(지방세 포함)를 뺀 금액입니다.</div>`;
      $$("[data-copy]", box).forEach((b) => b.addEventListener("click", () => copy(b.dataset.copy)));
      $$("[data-drop]", box).forEach((b) => b.addEventListener("click", () => { games.splice(+b.dataset.drop, 1); renderGames(); updateDrawBtn(); }));
    }
    $("#gen-copy").disabled = $("#gen-save").disabled = $("#gen-clear").disabled = !games.length;
    $("#games-count").textContent = games.length ? `· ${games.length}게임` : "";
  }
  function updateDrawBtn() {
    const b = $("#gen-btn");
    b.textContent = games.length >= MAX_GAMES ? "더 뽑으려면 게임을 지워 주세요" : `🎱 번호 뽑기 (${letter(games.length)} 게임)`;
    b.disabled = busyGen || games.length >= MAX_GAMES;
  }
  // 추첨기 연출·소리 켜기/끄기(브라우저 기억)
  const animBox = $("#gen-anim"), soundBox = $("#gen-sound");
  animBox.checked = store.get("gen_anim", "1") === "1";
  soundBox.checked = store.get("gen_sound", "0") === "1";
  function syncMachine() {
    $(".machine-stage").style.display = animBox.checked ? "" : "none";
    soundBox.disabled = !animBox.checked;
    if (window.LottoMachine) window.LottoMachine.setSound(animBox.checked && soundBox.checked);
  }
  animBox.addEventListener("change", () => { store.set("gen_anim", animBox.checked ? "1" : "0"); syncMachine(); });
  soundBox.addEventListener("change", () => {
    store.set("gen_sound", soundBox.checked ? "1" : "0"); syncMachine();
    if (soundBox.checked) toast("소리를 켰습니다 — 번호를 뽑아 보세요");
  });
  if (window.LottoMachine) window.LottoMachine.init($("#machine"));
  syncMachine();
  $("#machine-skip").addEventListener("click", () => window.LottoMachine.skip());

  async function drawOne() {
    if (busyGen) return;
    if (games.length >= MAX_GAMES) return toast(`한 번에 ${MAX_GAMES}게임까지 뽑을 수 있어요`);
    busyGen = true;
    const status = $("#machine-status"), skip = $("#machine-skip");
    updateDrawBtn();
    let pending = false;
    petMood("think");
    try {
      let combo = null;
      for (let t = 0; t < 4 && !combo; t++) {   // 같은 번호가 이미 있으면 다시
        const res = await api("/api/generate", { count: 1, mode: segValue("gen-mode"), strength: +segValue("gen-strength") });
        if (!games.some((g) => g.nums.join() === res.combos[0].nums.join())) combo = res.combos[0];
      }
      if (!combo) { toast("같은 조합만 나왔어요. 다시 눌러 주세요"); return; }
      const idx = games.length, M = window.LottoMachine;
      const done = () => {
        games.push(combo);
        skip.hidden = true;
        petMood("wink", 7000);
        status.textContent = `${letter(idx)} 게임을 뽑았습니다! 계속 뽑거나, 마음에 안 들면 ‘빼기’로 지우세요.`;
        busyGen = false;
        renderGames(true); updateDrawBtn();
        const fresh = $("#gen-result .game-wrap.fresh");
        if (fresh) fresh.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      if (animBox.checked && M && M.play(combo.nums, {
        onBall: (i, total, n) => { status.textContent = `${letter(idx)} 게임 추첨 중… ${i} / ${total}번째 공: ${n}번`; if (Pet.machine) Pet.machine.hop(); },
        onDone: done,
      })) {
        pending = true; skip.hidden = false;
        petMood("surprise");
        status.textContent = `${letter(idx)} 게임 — 공을 섞는 중…`;
        return;
      }
      done();   // 연출 없이 바로
    } catch (e) { toast(e.message); petMood("worry", 5000); }
    finally { if (!pending) { busyGen = false; updateDrawBtn(); } }
  }
  $("#gen-btn").addEventListener("click", drawOne);
  $("#gen-bulk").addEventListener("click", async () => {
    if (busyGen) return;
    const room = MAX_GAMES - games.length;
    if (room <= 0) return toast(`한 번에 ${MAX_GAMES}게임까지 뽑을 수 있어요`);
    try {
      const res = await api("/api/generate", { count: Math.min(5, room), mode: segValue("gen-mode"), strength: +segValue("gen-strength") });
      let added = 0;
      res.combos.forEach((c) => { if (!games.some((g) => g.nums.join() === c.nums.join())) { games.push(c); added++; } });
      renderGames(false); updateDrawBtn();
      $("#machine-status").textContent = `${added}게임을 한꺼번에 추가했습니다(연출 없음).`;
    } catch (e) { toast(e.message); }
  });
  $("#gen-clear").addEventListener("click", () => {
    if (busyGen) return;
    games.length = 0; renderGames(); updateDrawBtn();
    if (window.LottoMachine) window.LottoMachine.reset();
    $("#machine-status").textContent = "‘번호 뽑기’를 누르면 추첨기가 한 게임(공 6개)을 꺼냅니다.";
  });
  renderGames();
  $("#gen-copy").addEventListener("click", () => copy(lastCombos.map((c, i) => `${String.fromCharCode(65 + i)}: ${c.nums.join(" ")}`).join("\n")));

  $("#gen-save").addEventListener("click", async () => {
    if (!lastCombos.length) return;
    await addTickets(lastCombos.map((c) => c.nums), "번호 만들기");
  });

  // ---------------------------------------------------------------- 내 구매 기록
  let M = null; // /api/tickets
  function parseGames(text) {
    const games = [], bad = [];
    text.split(/\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const nums = (line.match(/\d+/g) || []).map(Number);
      const uniq = [...new Set(nums)];
      if (nums.length === 6 && uniq.length === 6 && uniq.every((n) => n >= 1 && n <= 45)) games.push(uniq.sort((a, b) => a - b));
      else bad.push(i + 1);
    });
    return { games, bad };
  }
  async function addTickets(games, source, draw, memo) {
    try {
      M = await api("/api/tickets/add", { games, source, draw: draw || (S ? S.latest.no + 1 : null), memo: memo || "" });
      renderMine();
      toast(`${games.length}게임을 ${draw || S.latest.no + 1}회 기록에 담았습니다`);
      return true;
    } catch (e) { toast(e.message); return false; }
  }
  $("#mine-games").addEventListener("input", (e) => {
    const { games, bad } = parseGames(e.target.value);
    $("#mine-parse").textContent = e.target.value.trim()
      ? `${games.length}게임 인식${bad.length ? ` · ${bad.join(", ")}번째 줄은 번호 6개가 아님` : ""}` : "";
  });
  $("#mine-add").addEventListener("click", async () => {
    const { games, bad } = parseGames($("#mine-games").value);
    if (!games.length) return toast("한 줄에 번호 6개씩 입력해 주세요");
    if (bad.length) return toast(`${bad.join(", ")}번째 줄을 확인해 주세요`);
    const draw = parseInt($("#mine-draw").value, 10);
    if (await addTickets(games, "직접", draw, $("#mine-memo").value.trim())) {
      $("#mine-games").value = ""; $("#mine-memo").value = ""; $("#mine-parse").textContent = "";
    }
  });
  $("#mine-budget-save").addEventListener("click", async () => {
    const amt = parseInt(($("#mine-budget-input").value || "0").replace(/[^\d]/g, ""), 10) || 0;
    try { M = await api("/api/tickets/budget", { amount: amt }); renderMine(); toast(amt ? `이번 달 예산 ${won(amt)}` : "예산을 지웠습니다"); }
    catch (e) { toast(e.message); }
  });
  $("#mine-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    if (!confirm("이 기록을 지울까요?")) return;
    try { M = await api("/api/tickets/delete", { id: b.dataset.del }); renderMine(); toast("지웠습니다"); }
    catch (err) { toast(err.message); }
  });
  function gameBalls(g, done) {
    if (!done) return balls(g.nums, null, "sm");
    return `<div class="balls">${g.nums.map((n) => {
      const hit = g.hits.includes(n);
      return `<span class="ball sm ${ballClass(n)} ${hit ? "" : "miss"}">${n}</span>`;
    }).join("")}</div>`;
  }
  const RANK_NAME = ["", "1등", "2등", "3등", "4등", "5등"];
  function renderMine() {
    if (!M) return;
    const t = M.total, b = M.budget;
    if (!$("#mine-draw").value) $("#mine-draw").value = M.next_draw;
    $("#mine-stats").innerHTML = [
      ["쓴 돈", won(t.spent), `추첨 전 ${t.pending_games}게임 포함`],
      ["받은 돈", won(t.won), `1~5등 ${t.prizes.join(" / ")}회`],
      ["손익", (t.net >= 0 ? "+" : "−") + won(Math.abs(t.net)), t.net >= 0 ? "이익" : "손실"],
      ["환급률", `${t.return_pct}%`, "로또 평균 약 50%"],
    ].map(([k, v, s]) => `<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    const pct = b.month ? Math.min(100, (b.month_spent / b.month) * 100) : 0;
    $("#mine-budget").innerHTML = b.month
      ? `<div>이번 달 <b>${won(b.month_spent)}</b> / 예산 ${won(b.month)}</div>
         <div class="budget-bar"><i class="${b.over ? "over" : ""}" style="width:${pct}%"></i></div>
         ${b.over ? `<div class="callout warn small">이번 달 예산을 넘었습니다. 이번 달은 여기서 멈추시길 권합니다.</div>` : `<div class="small muted">남은 예산 ${won(b.month - b.month_spent)}</div>`}`
      : `<div class="muted small">예산이 없습니다. 한 달에 쓸 금액을 정해 두면 넘을 때 알려 드립니다.</div>`;
    if (!M.tickets.length) { $("#mine-list").innerHTML = `<div class="muted">아직 기록이 없습니다. ‘번호 만들기’에서 만든 번호를 ‘구매 기록에 담기’로 넣거나, 위에 직접 입력하세요.</div>`; }
    else {
      $("#mine-list").innerHTML = M.tickets.map((r) => {
        const done = r.status === "done";
        const head = done
          ? `<span class="small muted">${esc(r.result.date)} 결과</span> ${balls(r.result.nums, r.result.bonus, "sm")}`
          : `<span class="pill warn">추첨 전</span>`;
        return `<div class="ticket">
          <div class="ticket-head">
            <div><span class="t">${r.draw}회</span> <span class="small muted">· ${r.games.length}게임 · ${esc(r.source)}${r.memo ? " · " + esc(r.memo) : ""} · ${esc(r.created)}</span></div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${head}<button class="btn sm" data-del="${esc(r.id)}">삭제</button></div>
          </div>
          ${r.games.map((g, i) => `<div class="game-row"><span class="lbl">${String.fromCharCode(65 + (i % 26))}</span>${gameBalls(g, done)}
            ${done ? (g.rank ? `<span class="rank win">${RANK_NAME[g.rank]} · ${won(g.amount)}${g.net !== g.amount ? ` (세후 ${won(g.net)})` : ""}</span>` : `<span class="rank small muted">${g.match}개 일치${g.bonus_hit ? " (+보너스)" : ""}</span>`) : ""}</div>`).join("")}
          ${done ? `<div class="small muted">이 회차: ${won(r.cost)} 써서 ${won(r.won)} 받음</div>` : ""}
        </div>`;
      }).join("");
    }
    // 요약 화면: 가장 최근 결과가 나온 기록
    // 결과가 나온 가장 최근 회차의 기록을 모두 합친다(같은 회차를 여러 번 나눠 적었을 수 있음)
    const firstDone = M.tickets.find((r) => r.status === "done");
    const recentDone = firstDone ? (() => {
      const same = M.tickets.filter((r) => r.status === "done" && r.draw === firstDone.draw);
      return { draw: firstDone.draw, games: same.flatMap((r) => r.games), won: same.reduce((n, r) => n + r.won, 0) };
    })() : null;
    const pending = M.tickets.filter((r) => r.status === "pending").reduce((n, r) => n + r.games.length, 0);
    const box = $("#home-mine");
    if (recentDone || pending) {
      box.hidden = false;
      const best = recentDone ? recentDone.games.reduce((a, g) => (g.match > a.match ? g : a), recentDone.games[0]) : null;
      box.innerHTML = `<h2>내 구매 기록</h2>
        ${recentDone ? `<div>${recentDone.draw}회 결과: ${recentDone.games.length}게임 중 ${recentDone.games.filter((g) => g.rank).length}게임 당첨
          · 받은 돈 <b>${won(recentDone.won)}</b> · 가장 많이 맞힌 것 ${best.match}개</div>` : ""}
        ${pending ? `<div class="small muted" style="margin-top:4px">추첨 전 ${pending}게임 — 결과가 나오면 자동으로 맞춰 봅니다.</div>` : ""}
        <div style="margin-top:10px"><button class="btn sm" data-go="mine">기록 보기 →</button></div>`;
      $("[data-go]", box).addEventListener("click", () => showView("mine"));
    } else box.hidden = true;
  }
  async function loadMine() {
    try { M = await api("/api/tickets"); renderMine(); } catch (e) { /* 서버 연결 실패는 load() 가 표시 */ }
  }

  // ---------------------------------------------------------------- 내 번호 검사
  const picked = new Set();
  $("#slip").innerHTML = Array.from({ length: 45 }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join("");
  function syncSlip() {
    $$("#slip button").forEach((b) => b.classList.toggle("on", picked.has(+b.dataset.n)));
    $("#pick-count").textContent = `${picked.size}/6`;
  }
  $("#slip").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const n = +b.dataset.n;
    if (picked.has(n)) picked.delete(n);
    else if (picked.size < 6) picked.add(n);
    else toast("6개까지 고를 수 있습니다");
    syncSlip();
  });
  $("#check-text").addEventListener("input", (e) => {
    const nums = (e.target.value.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= 45);
    picked.clear();
    nums.slice(0, 6).forEach((n) => picked.add(n));
    syncSlip();
  });
  $("#check-clear").addEventListener("click", () => { picked.clear(); $("#check-text").value = ""; syncSlip(); });
  $("#check-btn").addEventListener("click", async () => {
    if (picked.size !== 6) return toast("서로 다른 번호 6개를 골라 주세요");
    try {
      const res = await api("/api/check", { nums: [...picked] });
      const h = res.history;
      const ranks = ["1등", "2등", "3등", "4등", "5등"];
      $("#check-result").innerHTML = `
        <h2>검사 결과</h2>
        ${comboHTML(res.eval)}
        <h3 style="margin-top:14px">2002년 1회부터 매주 이 번호를 샀다면</h3>
        <table class="tbl"><tr>${ranks.map((r) => `<th class="num">${r}</th>`).join("")}</tr>
        <tr>${h.prizes.map((v) => `<td class="num">${v}회</td>`).join("")}</tr></table>
        <div class="grid g2" style="margin-top:12px">
          <div class="stat"><div class="k">쓴 돈</div><div class="v">${won(h.spent)}</div></div>
          <div class="stat"><div class="k">받은 돈</div><div class="v">${won(h.won)}</div><div class="s">${h.spent ? `환급률 ${(h.won / h.spent * 100).toFixed(1)}%` : ""}</div></div>
        </div>
        <div class="note">가장 많이 맞힌 것: ${h.best.match}개${h.best.no ? ` (${h.best.no}회)` : ""}.
        ${h.exact.length ? `<b>이 조합은 ${h.exact.join(", ")}회 1등 번호와 같습니다</b> — 같은 확률이지만 따라 사는 사람이 많아 나눠 가질 가능성이 큽니다.` : ""}
        과거 성적은 앞으로의 확률과 무관합니다.</div>`;
    } catch (e) { toast(e.message); }
  });

  // ---------------------------------------------------------------- 무작위성 검정
  function renderStats() {
    const r = S.randomness;
    const lo = r.expected_per_number - 1.96 * r.sd_per_number, hi = r.expected_per_number + 1.96 * r.sd_per_number;
    $("#freq-pill").innerHTML = pPill(r.freq_test.p);
    $("#freq-chart").innerHTML = barChart({
      labels: r.numbers.map((x) => x.n), values: r.numbers.map((x) => x.count), band: [lo, hi],
      expected: [r.expected_per_number], highlight: (i) => Math.abs(r.numbers[i].z) >= 1.96,
      min: Math.floor(lo * 0.8 / 10) * 10, labelEvery: 2,
      fmtTip: (v, i) => `${v}회 (기대 ${r.expected_per_number}회, z=${r.numbers[i].z})`,
    });
    $("#freq-note").innerHTML = `${fmt(r.draws)}회 × 6개. 번호당 기대 ${r.expected_per_number}회. 95% 범위를 벗어난 번호는 <b>${r.outside_95}개</b>인데,
      완전 무작위여도 45개 중 약 ${r.outside_95_expected}개는 벗어나는 것이 정상입니다. 카이제곱 ${r.freq_test.stat} (자유도 ${r.freq_test.df}), p=${r.freq_test.p}.
      최근 100회만 봐도 p=${r.recent100_test.p} — “요즘 잘 나오는 번호”도 우연의 범위입니다.`;
    $("#sum-pill").innerHTML = pPill(r.sum.test.p);
    $("#sum-chart").innerHTML = barChart({ labels: r.sum.labels, values: r.sum.observed, expected: r.sum.expected, labelEvery: 3, height: 240,
      fmtTip: (v, i) => `${v}회 (이론 ${r.sum.expected[i]}회)` });
    $("#sum-note").innerHTML = `막대 = 실제, 점선 = 8,145,060개 조합 전체로 계산한 이론값. 실제 평균 ${r.sum.mean} / 이론 ${r.sum.theory_mean}.
      “합계 100~175 구간이 잘 나온다”는 말은 맞지만, 그 구간에 속하는 조합이 원래 많기 때문입니다.`;
    $("#odd-pill").innerHTML = pPill(r.odd.test.p);
    $("#odd-chart").innerHTML = barChart({ labels: [0, 1, 2, 3, 4, 5, 6].map((k) => `${k}개`), values: r.odd.observed, expected: r.odd.expected, height: 220,
      fmtTip: (v, i) => `${v}회 (이론 ${r.odd.expected[i]}회)` });
    $("#rep-pill").innerHTML = pPill(r.repeat.test.p);
    $("#rep-chart").innerHTML = barChart({ labels: [0, 1, 2, 3, 4, 5, 6].map((k) => `${k}개`), values: r.repeat.observed, expected: r.repeat.expected, height: 220,
      fmtTip: (v, i) => `${v}회 (이론 ${r.repeat.expected[i]}회)` });
    const c = r.consecutive, dup = r.duplicates;
    $("#misc").innerHTML = `
      <div class="verdict" style="margin-bottom:8px"><span>연속 번호가 있는 회차 <b>${c.ratio}%</b> (이론 ${c.theory}%)</span>${pPill(c.p)}</div>
      <p class="small">연속 번호(예: 12·13)는 생각보다 자주 나옵니다 — 이론적으로 절반 이상의 회차에 있습니다. “연속 번호는 피하라”는 말은 근거가 없습니다.</p>
      <div class="verdict"><span>같은 6개 조합이 두 번 나온 적</span><b>${dup.found.length ? dup.found.map((x) => x.join("·") + "회").join(", ") : "없음"}</b></div>
      <p class="small">${fmt(r.draws)}회 동안 같은 조합이 한 번이라도 다시 나올 확률은 약 ${dup.chance}%입니다(생일 문제).</p>`;
    const rows = r.numbers.slice().sort((a, b) => b.count - a.count);
    $("#num-table").innerHTML = `<tr><th>번호</th><th class="num">출현</th><th class="num">기대와 차이(z)</th><th class="num">보너스</th><th class="num">안 나온 지</th><th class="num">최장 공백</th></tr>` +
      rows.map((x) => `<tr><td>${ball(x.n, "sm")}</td><td class="num">${x.count}</td><td class="num" style="color:${Math.abs(x.z) >= 1.96 ? "var(--warn)" : "inherit"}">${x.z > 0 ? "+" : ""}${x.z}</td>
        <td class="num">${x.bonus}</td><td class="num">${x.gap}회</td><td class="num">${x.max_gap}회</td></tr>`).join("");
  }

  // ---------------------------------------------------------------- 예측법 검증
  function renderBacktest() {
    const b = S.backtest;
    $("#bt-range").textContent = `(${b.from}~${b.to}회, ${fmt(b.tested)}회)`;
    const band = [b.theory_mean - 1.96 * b.sd_mean, b.theory_mean + 1.96 * b.sd_mean];
    $("#bt-chart").innerHTML = barChart({
      labels: b.strategies.map((s) => s.label.replace(/\(.+\)/, "")), values: b.strategies.map((s) => s.mean),
      expected: [b.theory_mean], band, min: 0.7, height: 260, fmtY: (v) => v.toFixed(2),
      fmtTip: (v, i) => `평균 ${v}개, p=${b.strategies[i].p}`,
    });
    $("#bt-table").innerHTML = `<tr><th>방법</th><th class="num">평균 맞힌 개수</th><th class="num">p값</th><th class="num">3개 이상</th><th class="num">5등/4등/3등/2등/1등</th><th class="num">쓴 돈 → 받은 돈</th><th class="num">환급률</th></tr>` +
      b.strategies.map((s) => `<tr class="${s.key === "random" ? "base" : ""}">
        <td><b>${esc(s.label)}</b><div class="small muted">${esc(s.desc)}</div></td>
        <td class="num">${s.mean.toFixed(3)}</td><td class="num">${s.p >= 0.05 ? s.p : `<b style="color:var(--warn)">${s.p}</b>`}</td>
        <td class="num">${s.hits3}회 (${s.hits3_rate}%)</td>
        <td class="num">${[4, 3, 2, 1, 0].map((k) => s.prizes[k]).join(" / ")}</td>
        <td class="num">${won(s.spent)} → ${won(s.won)}</td><td class="num">${s.return_pct}%</td></tr>`).join("");
    const best = b.strategies.slice().sort((x, y) => y.mean - x.mean)[0];
    $("#bt-note").innerHTML = `이론값: 한 게임은 평균 <b>${b.theory_mean}개</b>를 맞히고, 3개 이상 맞힐 확률은 ${b.theory_hits3_rate}%입니다.
      모든 방법의 p값이 0.05보다 크면 “무작위와 구별되지 않는다”는 뜻입니다. 가장 높게 나온 ‘${esc(best.label)}’(${best.mean.toFixed(3)}개)도 운으로 생기는 범위 안입니다
      — 방법을 8개나 비교하면 그중 하나는 우연히 좋아 보이기 마련입니다(다중 비교).
      환급률이 이론(약 50%)보다 낮은 것은 고액 당첨이 드물어 한 사람이 1,000여 게임만 사서는 평균에 못 미치기 때문입니다.`;
  }

  // ---------------------------------------------------------------- 인기 번호
  function renderPopular() {
    const p = S.popularity;
    const maxAbs = Math.max(...p.numbers.map((x) => Math.abs(x.pct)), 1);
    $("#heat").innerHTML = p.numbers.map((x) => {
      const a = Math.min(1, Math.abs(x.pct) / maxAbs);
      const bg = x.pct >= 0 ? `rgba(234, 120, 20, ${0.12 + a * 0.55})` : `rgba(16, 160, 110, ${0.12 + a * 0.55})`;
      return `<div style="background:${bg}" title="${x.n}번: 수동 1등 동반 당첨자 ${x.pct > 0 ? "+" : ""}${x.pct}%">${x.n}<small>${x.pct > 0 ? "+" : ""}${x.pct}%</small></div>`;
    }).join("");
    const h = p.holdout, m = S.money;
    $("#pop-check").innerHTML = `
      <p class="small">1등 당첨자는 <b>자동(${Math.round(p.auto_share * 100)}%)</b>과 <b>수동·반자동(${Math.round(p.manual_share * 100)}%)</b>으로 나뉩니다(${p.typed_from}회부터 공개).
      자동은 기계가 무작위로 고르므로 인기와 무관하고, 사람이 고른 수동 당첨자에만 인기가 드러납니다. 모델을 <b>앞부분 회차로만</b> 만든 뒤 최근 ${h.draws}회에 적용했습니다.</p>
      <div class="grid g2">
        <div class="card soft stat"><div class="k">‘비인기’로 본 회차(하위 1/4)</div><div class="v" style="color:var(--good)">${h.manual_unpopular}배</div><div class="s">수동 1등 당첨자 ÷ 기대값</div></div>
        <div class="card soft stat"><div class="k">‘인기’로 본 회차(상위 1/4)</div><div class="v" style="color:var(--warn)">${h.manual_popular}배</div><div class="s">수동 1등 당첨자 ÷ 기대값</div></div>
      </div>
      <p class="small" style="margin-top:12px">같은 회차의 자동 당첨자는 ${h.auto_unpopular}배 / ${h.auto_popular}배로 차이가 없습니다 — 자동은 순수한 우연이라는 확인입니다(과산포 ${p.auto_dispersion}, 1이면 완전 무작위).
      전체 1등 당첨자로 보면 ${h.total_unpopular}배 / ${h.total_popular}배입니다.</p>
      <div class="callout warn small" style="margin-top:10px"><b>상한이 있습니다.</b> 자동 구매가 모든 조합에 고르게 퍼져 있어, 아무리 덜 인기인 조합도 동반 당첨자가 평균의 약 ${m.auto_floor}배 아래로는 내려가지 않습니다.
      그래서 1,000원 1게임의 기대 환급은 평균 조합 약 ${m.ev_avg[0]}원(세후 ${m.ev_avg[1]}원), 이론상 최선도 약 ${m.ev_floor[0]}원(세후 ${m.ev_floor[1]}원)입니다. <b>어떤 번호도 1,000원을 넘지 못합니다.</b></div>
      <p class="small muted">${p.from}회 이후 ${fmt(p.rows)}회 자료(구분 공개 ${fmt(p.typed)}회), 과산포 ${p.dispersion}(보정함).</p>`;
    $("#pop-table").innerHTML = `<tr><th>특징</th><th>설명</th><th class="num">1 늘 때 동반 당첨자</th><th class="num">t값</th><th>근거</th></tr>` +
      p.coefs.slice(1).map((c) => `<tr><td><b>${esc(c.label)}</b></td><td class="small muted">${esc(c.desc)}</td>
        <td class="num">${c.effect_pct > 0 ? "+" : ""}${c.effect_pct}%</td><td class="num">${c.t}</td>
        <td>${Math.abs(c.t) >= 2 ? '<span class="pill good">있음</span>' : '<span class="pill warn">약함</span>'}</td></tr>`).join("");
    $("#pop-top").innerHTML = `<tr><th>회차</th><th>번호</th><th class="num">1등 인원</th><th class="num">자동 / 수동</th><th class="num">수동 기대 대비</th></tr>` +
      p.top_shared.map((x) => `<tr><td>${x.no}회</td><td>${balls(x.nums, null, "sm")}</td><td class="num">${x.winners}명</td><td class="num">${x.auto} / ${x.manual}</td><td class="num">${x.times}배</td></tr>`).join("");
  }

  // ---------------------------------------------------------------- AI 상담
  const chat = { inited: false, history: [], busy: false, ctrl: null };
  function lmsBase() { return $("#lms-base").value.trim(); }
  async function loadModels() {
    const sel = $("#lms-model"), dot = $("#lms-dot");
    sel.innerHTML = `<option value="">연결 중…</option>`;
    dot.className = "dot";
    try {
      const res = await api("/api/lms/models?base=" + encodeURIComponent(lmsBase()));
      const ms = res.models || [];
      if (!ms.length) throw new Error("모델 없음");
      ms.sort((a, b) => (b.loaded - a.loaded) || a.id.localeCompare(b.id));
      const saved = store.get("model", "");
      const best = EV && EV.best;
      sel.innerHTML = ms.map((m) => `<option value="${esc(m.id)}">${m.id === best ? "★ " : ""}${m.loaded ? "● " : "○ "}${esc(m.id)}${m.ctx ? ` (${Math.round(m.ctx / 1024)}K)` : ""}</option>`).join("");
      sel.value = ms.some((m) => m.id === saved) ? saved
        : ms.some((m) => m.id === best) ? best : (ms.find((m) => m.loaded) || ms[0]).id;
      dot.className = "dot ok";
      dot.title = "LM Studio 연결됨 (● = 로드된 모델, ○ 는 고르면 LM Studio 가 불러옴)";
    } catch (e) {
      sel.innerHTML = `<option value="">LM Studio 연결 안 됨</option>`;
      dot.className = "dot no";
      dot.title = "LM Studio 를 켜고 Developer 탭에서 Status: Running 인지 확인하세요";
    }
  }
  // 모델 성적표 (python model_eval.py 결과, 컴퓨터마다 다름)
  let EV = null;
  function renderEval() {
    const p = $("#eval-panel");
    if (!EV || !EV.models || !EV.models.length) {
      p.innerHTML = `<div class="small">아직 채점 결과가 없습니다. 사이트를 켠 상태에서 이 폴더의 터미널에 <code>python model_eval.py</code> (맥: <code>python3 model_eval.py</code>)를 실행하면
        로드된 모델들을 시험지 24문항으로 채점해 여기에 보여 줍니다.</div>`;
      return;
    }
    const pct = (v) => (v == null ? "-" : `${v}`);
    p.innerHTML = `<h3 style="margin:0 0 6px">모델 성적표 <span class="small muted">· ${esc(EV.date)} · ${EV.questions}문항 · 이 컴퓨터 기준</span></h3>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>모델</th><th class="num">종합</th><th class="num">도구</th><th class="num">내용</th><th class="num">정직</th><th class="num">숫자</th><th class="num">호칭</th><th class="num">평균 시간</th></tr>
        ${EV.models.map((m) => `<tr${m.model === EV.best ? ' class="base"' : ""}><td>${m.model === EV.best ? "★ " : ""}${esc(m.model)}</td>
          <td class="num"><b>${m.score}</b></td><td class="num">${pct(m.tool)}</td><td class="num">${pct(m.content)}</td><td class="num">${pct(m.honest)}</td>
          <td class="num">${pct(m.numbers)}</td><td class="num">${pct(m.honorific)}</td><td class="num">${m.avg_sec ?? "-"}초</td></tr>`).join("")}
      </table></div>
      <div class="note">도구 = 맞는 기능을 불렀나 · 내용 = 정답 숫자/출처가 답에 있나 · 정직 = 금지 표현이 없나 · 숫자 = 자료에 없는 숫자가 없나 · 호칭 = "대장님". ★ 모델이 주간 브리핑의 기본 모델입니다.</div>`;
  }
  async function loadEval() {
    try { EV = await api("/api/model-eval"); } catch (e) { EV = null; }
    renderEval();
  }
  $("#eval-toggle").addEventListener("click", () => { $("#eval-panel").hidden = !$("#eval-panel").hidden; });

  async function initChat() {
    if (chat.inited) return;
    chat.inited = true;
    $("#lms-base").value = store.get("lms_base", "http://127.0.0.1:1234");
    await loadEval();
    loadModels();
    try { chat.history = JSON.parse(store.get("chat", "[]")).slice(-20); } catch (e) { chat.history = []; }
    if (!chat.history.length) {
      addMsg("bot", "안녕하세요, 대장님! 저는 로또 공 박사 ‘로또’예요. 당첨 번호를 예측해 드릴 수는 없지만, 실제 자료로 계산한 통계와 ‘나눠 가질 위험이 적은 조합’은 정확하게 알려 드릴 수 있어요. 무엇이 궁금하세요?", null, "happy");
      chatMood("happy"); lottoSay("안녕하세요, 대장님! 궁금한 걸 물어보세요.");
      showWelcomeChips();
    } else {
      chat.history.forEach((m) => addMsg(m.role === "user" ? "user" : "bot", m.content, m.cards, m.mood));
    }
  }
  $("#lms-refresh").addEventListener("click", () => { store.set("lms_base", lmsBase()); loadModels(); });
  $("#lms-model").addEventListener("change", (e) => store.set("model", e.target.value));
  $("#chat-clear").addEventListener("click", () => {
    chat.history = []; store.set("chat", "[]"); $("#chat-log").innerHTML = ""; chat.inited = false; initChat();
  });
  $("#chips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) send(c.textContent); });
  // 추천 질문: 처음엔 인사 말풍선 아래에만, 그 뒤로는 입력줄의 💡 팝업으로
  function closePop() { $("#chip-pop").hidden = true; }
  $("#chip-btn").addEventListener("click", (e) => { e.stopPropagation(); $("#chip-pop").hidden = !$("#chip-pop").hidden; });
  document.addEventListener("click", (e) => { if (!$("#chip-pop").hidden && !e.target.closest("#chip-pop, #chip-btn")) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
  $("#info-toggle").addEventListener("click", () => { $("#chat-info").hidden = !$("#chat-info").hidden; });
  $("#chat-log").addEventListener("click", (e) => { const c = e.target.closest(".chips-welcome .chip"); if (c) send(c.textContent); });
  function showWelcomeChips() {
    const box = document.createElement("div"); box.className = "chips chips-welcome";
    $$("#chips .chip").forEach((c) => box.appendChild(c.cloneNode(true)));
    $("#chat-log").appendChild(box);
  }
  $("#chat-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($("#chat-text").value); }
  });
  $("#chat-text").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; });
  $("#chat-send").addEventListener("click", () => {
    if (chat.busy && chat.ctrl) { chat.ctrl.abort(); return; }
    send($("#chat-text").value);
  });

  function md(text) {
    // 안전한 최소 마크다운: 이스케이프 후 굵게·목록·표·단락
    // 작은 모델이 섞어 쓰는 수식 기호($\text{…}$, $…$) 제거
    text = text.replace(/\$\\text\{([^}]*)\}\$/g, "$1").replace(/\$([^$\n]{1,40})\$/g, "$1");
    const lines = esc(text).split("\n");
    let out = "", list = null, table = [];
    const flushList = () => { if (list) { out += `<${list}>` + listItems.join("") + `</${list}>`; list = null; listItems = []; } };
    let listItems = [];
    const flushTable = () => {
      if (!table.length) return;
      const rows = table
        .map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
        .filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c)));
      out += "<table>" + rows.map((cells, i) => {
        const tag = i === 0 ? "th" : "td";
        return "<tr>" + cells.map((c) => `<${tag}>${c}</${tag}>`).join("") + "</tr>";
      }).join("") + "</table>";
      table = [];
    };
    for (const raw of lines) {
      const line = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#{1,4}\s*(.+)$/, "<b>$1</b>")
        .replace(/(https?:\/\/[^\s<)\]，,]+[^\s<)\]，,.。])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      if (/^\s*\|.*\|\s*$/.test(raw)) { flushList(); table.push(line); continue; }
      flushTable();
      const ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        const kind = ul ? "ul" : "ol";
        if (list !== kind) { flushList(); list = kind; }
        listItems.push(`<li>${(ul || ol)[1]}</li>`);
        continue;
      }
      flushList();
      if (line.trim()) out += `<p>${line}</p>`;
    }
    flushList(); flushTable();
    return out;
  }

  // 답변의 숫자가 코드가 준 자료(또는 질문)에 있는지 확인
  function checkNumbers(answer, facts, question) {
    const src = (facts + "\n" + question);
    const pool = new Set((src.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((s) => parseFloat(s.replace(/,/g, ""))));
    const poolArr = [...pool];
    const bad = [];
    const re = /(\d[\d,]*(?:\.\d+)?)\s*(억|만|천)?\s*(%|원|명|회|배|게임|개)?/g;
    let m;
    while ((m = re.exec(answer))) {
      const v = parseFloat(m[1].replace(/,/g, ""));
      const unit = m[3] || "", big = m[2] || "";
      if (!big && !unit && v <= 45 && !m[1].includes(".")) continue; // 공 번호·작은 수
      if (!big && !unit && v < 100) continue;
      if (big) {
        const mult = big === "억" ? 1e8 : big === "만" ? 1e4 : 1e3;
        const val = v * mult;
        if (poolArr.some((x) => x > 0 && Math.abs(x - val) / x < 0.06)) continue;
        if (pool.has(v)) continue;
      } else if (pool.has(v)) continue;
      if (/^(19|20)\d\d$/.test(m[1])) continue; // 연도
      bad.push(m[0].trim());
    }
    return [...new Set(bad)].slice(0, 8);
  }

  // 도구 결과 → 답 아래 카드(공 모양·담기 버튼). 숫자는 도구 결과 그대로(코드 계산값).
  const CARD_TOOLS = ["generate_numbers", "check_numbers", "get_draw", "find_draws"];
  function addBtn(games, label) {
    return `<button class="btn sm" data-add='${esc(JSON.stringify(games))}'>${label}</button>`;
  }
  function toolCardHTML(name, r) {
    if (!r || r["오류"]) return "";
    const next = S ? `${S.latest.no + 1}회` : "다음 회차";
    if (name === "generate_numbers" && Array.isArray(r["조합"])) {
      const games = r["조합"].map((c) => c["번호"]);
      const avg = r["평균 조합"] || {};
      return `<div class="tcard">
        <div class="tcard-h">추천 조합 <span class="muted small">· 당첨 확률은 모두 1/8,145,060 · 담으면 ${next} 구매 기록에 저장</span></div>
        ${r["조합"].map((c, i) => `<div class="tcard-row">
          <span class="lbl">${String.fromCharCode(65 + i)}</span>${balls(c["번호"], null, "sm")}
          <span class="small muted">인기도 ${c["인기도"]} · 1,000원당 ${c["1000원당 기대 환급"]}원 · 1등 세후 ${won(c["세후"])}</span>
          ${addBtn([c["번호"]], "담기")}</div>`).join("")}
        <div class="tcard-f"><span class="small muted">평균 조합: 1,000원당 ${avg["1000원당 기대 환급"] ?? "-"}원 · 1등 세후 ${avg["세후"] ? won(avg["세후"]) : "-"}</span>
          ${addBtn(games, `${games.length}게임 모두 담기`)}</div></div>`;
    }
    if (name === "check_numbers" && Array.isArray(r["번호"])) {
      const pat = Array.isArray(r["알려진 인기 모양"]) ? r["알려진 인기 모양"] : [];
      return `<div class="tcard">
        <div class="tcard-h">검사한 번호</div>
        <div class="tcard-row">${balls(r["번호"], null, "sm")}${addBtn([r["번호"]], "담기")}</div>
        <div class="small muted">인기도 ${r["인기도"]} · 1등 동반 약 ${r["1등 동반 당첨자"]}명 · 1등 세후 ${won(r["세후"])} · 1,000원당 ${r["1000원당 기대 환급"]}원
          ${r["과거 1등과 4개 이상 같음"] ? " · <span style='color:var(--warn)'>과거 1등과 4개 이상 같음</span>" : ""}
          ${pat.length ? ` · <span style='color:var(--warn)'>⚠️ ${pat.map(esc).join(", ")}</span>` : ""}</div></div>`;
    }
    if (name === "get_draw" && Array.isArray(r["당첨번호"])) {
      const first = (r["등수별"] || {})["1등"] || {};
      const bt = r["1등 구매방식"];
      return `<div class="tcard">
        <div class="tcard-h">${r["회차"]}회 <span class="muted small">· ${esc(r["추첨일"])}</span></div>
        <div class="tcard-row">${balls(r["당첨번호"], r["보너스"], "sm")}</div>
        <div class="small muted">1등 ${first["당첨자"] ?? "-"}명 · 1인당 ${first["1인당 당첨금(세전)"] ? won(first["1인당 당첨금(세전)"]) : "-"}(세전)
          ${bt ? ` · 자동 ${bt["자동"]} / 수동 ${bt["수동"]} / 반자동 ${bt["반자동"]}` : ""}</div>
        ${r["안내"] ? `<div class="small" style="margin-top:4px">${esc(r["안내"])}</div>` : ""}</div>`;
    }
    if (name === "find_draws" && Array.isArray(r["최근 회차(최대 15개)"])) {
      const list = r["최근 회차(최대 15개)"].slice(0, 5);
      if (!list.length) return "";
      return `<div class="tcard">
        <div class="tcard-h">${(r["찾은 번호"] || []).join("·")} — ${r["해당 회차 수"]}회 <span class="muted small">(최근 ${list.length}개)</span></div>
        ${list.map((d) => `<div class="tcard-row"><span class="small" style="width:56px">${d["회차"]}회</span>${balls(d["당첨번호"], null, "sm")}</div>`).join("")}</div>`;
    }
    return "";
  }
  function appendCards(el, cards) {
    const html = (cards || []).map((c) => toolCardHTML(c.name, c.result)).join("");
    if (!html) return;
    let box = $(".cards", el);
    if (!box) { box = document.createElement("div"); box.className = "cards"; el.appendChild(box); }
    box.insertAdjacentHTML("beforeend", html);
  }
  $("#chat-log").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-add]");
    if (!b || b.disabled) return;
    let games;
    try { games = JSON.parse(b.dataset.add); } catch (err) { return; }
    b.disabled = true;
    if (await addTickets(games, "AI 상담")) b.textContent = "담았습니다 ✓";
    else b.disabled = false;
  });

  // ---------------------------------------------------------------- 캐릭터 '로또' (3D 공 박사)
  const Pet = { snaps: null, machine: null, chat: null, big: null, roam: null, girl: null, tried: false, timer: 0 };
  // ---- 채팅 쪽 로또(머리의 작은 것 + 큰 화면의 오른쪽 큰 것)를 한꺼번에 다루는 도우미
  const chatPets = () => [Pet.chat, Pet.big, Roam.on && Pet.roam].filter(Boolean);
  const SAY = { normal: "궁금한 걸 물어보세요, 대장님!", happy: "조회했어요!", think: "자료를 확인하고 있어요…", wink: "추천 조합을 뽑았어요!", surprise: "앗, 이건 인기 모양이에요!", firm: "예측은 안 되지만, 사실은 알려 드려요.", worry: "앗, 문제가 생겼어요." };
  const Roam = { on: false, x: 0, y: 0, W: 150, H: 172, timer: 0, say: 0, talking: false, snd: true, ask: false };
  function roamSay(text, ms, keep) {
    const el = $("#roam-say"); if (!el || !Roam.on || !text) return;
    const top = $("#roam-top"); top.className = "roam-top" + (Roam.x < 140 ? " left" : Roam.x > innerWidth - 320 ? " right" : "") + (Roam.y < 130 ? " below" : "");
    if (!keep || !el.classList.contains("show")) { el.className = "roam-say"; void el.offsetHeight; el.classList.add("show"); }
    el.textContent = text;
    clearTimeout(Roam.say); Roam.say = setTimeout(() => el.classList.remove("show"), ms || Math.min(9000, 2800 + text.length * 70));
  }
  // 답이 흘러나오는 동안 말풍선에 실시간으로 보여 준다(끝 120자)
  const snip = (t, n) => { const c = t.replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*#>`|_~]/g, " ").replace(/\s+/g, " ").trim(); return c.length > n ? "…" + c.slice(-n) : c; };
  function roamLive(t) { const c = snip(t, 120); if (c) roamSay(c, 20000, true); }
  function lottoSay(text) {
    roamSay(text);
    const el = $("#lotto-say"); if (!el || !text) return;
    el.textContent = text; el.style.animation = "none"; void el.offsetHeight; el.style.animation = "";
  }
  function chatMood(m) {
    chatPets().forEach((p) => p.setMood(m)); lottoSay(SAY[m] || SAY.normal);
    if (Girl.on && Pet.girl && !Girl.hidden) setTimeout(() => girlMood(m === "worry" ? "worry" : m === "think" ? "think" : "happy", m === "think" ? 0 : 2600), 400);
  }
  function chatTalk(on) { Roam.talking = !!on; chatPets().forEach((p) => p.talk(on)); }
  // ---- 답변을 소리 내어 읽기: 이 기기에 들어 있는 한국어 목소리만 쓴다(인터넷 목소리는 글이 밖으로 나가서 제외)
  // 모드 1 = 기기 목소리(글이 밖으로 안 나감, 기계음에 가까움), 모드 2 = 자연스러운 인터넷 목소리(Edge 의 Natural 등 — 읽을 글이 마이크로소프트 서버로 간다)
  const Voice = { on: false, mode: 1, voice: null, q: 0 };
  function pickVoice(mode) {
    if (!("speechSynthesis" in window)) return null;
    const ko = speechSynthesis.getVoices().filter((v) => /^ko/i.test(v.lang));
    if ((mode || Voice.mode) === 2) return ko.find((v) => !v.localService && /natural/i.test(v.name)) || ko.find((v) => !v.localService) || null;
    return ko.find((v) => v.localService) || null;
  }
  function stopVoice() { Voice.q++; try { speechSynthesis.cancel(); } catch (e) { /* 지원 안 함 */ } if (Voice.audio) { try { Voice.audio.pause(); } catch (e) { /* 이미 끝남 */ } Voice.audio = null; } }
  // ---- 로컬 AI 목소리(voice/tts_server.py, Qwen3-TTS): 문장마다 소리를 받아 오고, 재생하는 동안 다음 문장을 미리 만든다
  async function ttsFetch(text, voiceId) {
    for (let k = 0; k < 25; k++) {                  // 서비스가 켜지는 동안(처음엔 모델을 올려 1분쯤) 기다린다
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: voiceId }) });
      if (r.ok) return r.blob();
      if (r.status !== 503) throw new Error("tts " + r.status);
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    throw new Error("tts timeout");
  }
  function playBlob(blob, my, onPlay, onEnd) {
    return new Promise((done) => {
      const a = new Audio(URL.createObjectURL(blob)); Voice.audio = a;
      a.onplay = () => { if (my === Voice.q && onPlay) onPlay(); };
      const end = () => { URL.revokeObjectURL(a.src); if (onEnd) onEnd(); done(); };
      a.onended = end; a.onerror = end; a.play().catch(end);
    });
  }
  async function speakRemote(parts, my, voiceId) {
    let nextP = ttsFetch(parts[0], voiceId);
    for (let i = 0; i < parts.length; i++) {
      const blob = await nextP; if (my !== Voice.q) return;
      if (i + 1 < parts.length) nextP = ttsFetch(parts[i + 1], voiceId);
      nextP.catch(() => {});                          // 아직 안 쓴 실패는 다음 차례에 처리
      await playBlob(blob, my, () => chatTalk(true), null);
      if (my !== Voice.q) return;
    }
    chatTalk(false);
  }
  function speakLocalFallback(parts, my, v) {         // 로컬 서비스가 안 될 때: 기기 목소리로 이어 읽기
    let i = 0;
    const next = () => {
      if (my !== Voice.q) return;
      if (i >= parts.length) { chatTalk(false); return; }
      const u = new SpeechSynthesisUtterance(parts[i++]); u.voice = v; u.lang = v.lang; u.rate = 1.12; u.pitch = 1.55;
      u.onstart = () => { if (my === Voice.q) chatTalk(true); }; u.onend = next; u.onerror = () => chatTalk(false);
      speechSynthesis.speak(u);
    };
    next();
  }
  // 뽀또 같은 다른 캐릭터의 한마디(답변 읽기 중이 아닐 때만)
  function speakLine(text, voiceId, pet) {
    if (!Voice.on || Voice.mode !== 3 || Voice.audio) return;
    ttsFetch(text, voiceId).then((blob) => { if (Voice.audio) return; const my = Voice.q; return playBlob(blob, my, () => pet && pet.talk(true), () => { pet && pet.talk(false); Voice.audio = null; }); }).catch(() => {});
  }
  function speakAnswer(text) {
    if (!Voice.on) return;
    const v = Voice.mode === 3 ? pickVoice(1) : (Voice.voice || (Voice.voice = pickVoice()));
    if (!v && Voice.mode !== 3) return;
    const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*#>`|_~]/g, " ").replace(/\p{Extended_Pictographic}/gu, " ").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const parts = (clean.slice(0, 700).match(/[^.!?。\n]+[.!?。]?/g) || [clean]).map((s) => s.trim()).filter(Boolean);
    const my = ++Voice.q; let i = 0;
    if (Voice.mode === 3) {
      speakRemote(parts, my, "lotto").catch(() => { if (my !== Voice.q || !v) return; Voice.fail = (Voice.fail || 0) + 1; speakLocalFallback(parts, my, v); });
      return;
    }
    const next = () => {
      if (my !== Voice.q) return;
      if (i >= parts.length) { chatTalk(false); return; }
      const u = new SpeechSynthesisUtterance(parts[i++]); u.voice = v; u.lang = v.lang; u.rate = 1.12; u.pitch = 1.55;
      u.onstart = () => { if (my === Voice.q) chatTalk(true); };
      u.onend = next; u.onerror = () => { if (my === Voice.q) chatTalk(false); };
      speechSynthesis.speak(u);
    };
    next();
  }
  function avatar(mood) { return `<span class="av" data-mood="${mood}">${Pet.snaps ? `<img alt="로또" src="${Pet.snaps[mood] || Pet.snaps.normal}">` : "🎱"}</span>`; }
  function paintAvatars() {
    if (!Pet.snaps) return;
    $$(".av").forEach((a) => { a.innerHTML = `<img alt="로또" src="${Pet.snaps[a.dataset.mood] || Pet.snaps.normal}">`; });
  }
  function setAvatarMood(el, mood) { const a = $(".av", el); if (a) { a.dataset.mood = mood; paintAvatars(); if (!Pet.snaps) a.textContent = "🎱"; } }
  // 답에 어울리는 표정(코드가 정함)
  function moodFor(answer, tools) {
    tools = tools || [];
    if (/^\s*⚠️|연결 안 됨|호출 실패/.test(answer)) return "worry";
    if (tools.includes("check_numbers") && /연속 번호|등차|용지 .{0,6}줄|인기 모양/.test(answer)) return "surprise";
    if (tools.includes("generate_numbers")) return "wink";
    if (tools.includes("search_research")) return "think";
    if (/예측(할 수|은|이|해).{0,8}(없|불가|어렵)|효과가 없|구별되지 않|모두 같|동일합니다|동일해요|같아요/.test(answer)) return "firm";
    if (tools.length) return "happy";
    return "normal";
  }
  // 추첨기 옆 로또의 표정 바꾸기(몇 초 뒤 기본으로)
  function petMood(m, backMs) {
    if (!Pet.machine) return;
    Pet.machine.setMood(m); clearTimeout(Pet.timer);
    if (backMs) Pet.timer = setTimeout(() => Pet.machine && Pet.machine.setMood("normal"), backMs);
  }
  function initPet() {
    if (Pet.tried || !window.Lotto3D) return;
    Pet.tried = true;
    if (!window.Lotto3D.ok) return;            // 3D 를 못 쓰는 기기: 이모지 아바타로 대체
    try { Pet.snaps = window.Lotto3D.snapshots(180, 0.22, null, "bust"); } catch (e) { Pet.snaps = null; }
    paintAvatars();
    try {
      const tap = (p) => () => { if (!p()) return; Math.random() < 0.5 ? p().hop() : p().wave(); };
      Pet.machine = window.Lotto3D.mount($("#lotto-pet"), { onTap: tap(() => Pet.machine) });
      Pet.chat = window.Lotto3D.mount($("#lotto-chat"), { onTap: tap(() => Pet.chat) });
      Pet.big = window.Lotto3D.mount($("#lotto-big"), { onTap: tap(() => Pet.big) });
      const m0 = Pet.machine, fwd = (f) => (...a) => { m0[f](...a); if (Roam.on && Pet.roam && f !== "sleep") Pet.roam[f](...a); };
      Pet.machine = m0 && { setMood: fwd("setMood"), hop: fwd("hop"), sleep: fwd("sleep"), get mood() { return m0.mood; } };
      setRoam(store.get("roam", (innerWidth >= 900 && !matchMedia("(prefers-reduced-motion: reduce)").matches) ? "1" : "0") === "1");
    } catch (e) { /* 실시간 3D 만 포기 */ }
  }
  $("#brand-lotto").innerHTML = avatar("normal");
  // 큰 화면의 추천 질문(오른쪽 패널)
  $$("#chips .chip").forEach((c) => $("#side-chips").appendChild(c.cloneNode(true)));
  $("#side-chips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) send(c.textContent); });
  // 혼잣말(AI 상담 화면에서 가만히 있을 때)
  const QUIPS = ["번호는 예측 못 해도 통계는 자신 있어요!", "1,000원당 평균 약 500원이 돌아와요. 재미로만 즐겨요, 대장님.", "사람들이 덜 고르는 번호가 나눠 가질 사람이 적어요.", "저를 끌어서 돌려 보세요. 뒤에 LOTTO 6/45가 있어요!", "아래 입력줄이나 오른쪽 추천 질문을 눌러 보세요."];
  let quipI = 0;
  setInterval(() => { if (document.body.classList.contains("ai-mode") && !chat.busy && !sleeping && Pet.big) lottoSay(QUIPS[quipI++ % QUIPS.length]); }, 16000);
  // 오래 가만히 있으면 졸고, 만지면 깬다
  let lastActive = Date.now(), sleeping = false;
  const livePets = () => [Pet.machine, Pet.chat, Pet.big].filter(Boolean);   // 돌아다니는 로또는 졸지 않는다
  function wake() {
    lastActive = Date.now();
    if (!sleeping) return;
    sleeping = false; livePets().forEach((p) => p.sleep(false));
    [Pet.chat, Pet.big].filter(Boolean).forEach((p) => p.setMood("surprise")); lottoSay("앗, 안 잤어요!");
    setTimeout(() => [Pet.chat, Pet.big].filter(Boolean).forEach((p) => p.mood === "surprise" && p.setMood("normal")), 1500);
  }
  ["pointermove", "pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
  setInterval(() => {
    if (sleeping || Date.now() - lastActive < 90000 || chat.busy || busyGen) return;
    sleeping = true; livePets().forEach((p) => p.sleep(true)); lottoSay("zZ… 졸려요…");
  }, 5000);
  // ---- 화면 안을 돌아다니는 로또
  const rnd = (a, b) => a + Math.random() * (b - a);
  // 폴짝폴짝: 짧게 여러 번 뛰며 돌아다닌다. 뛸 때마다 방향이 조금씩 바뀌고, 가끔 크게 뛰고, 쉬었다 간다. 착지할 때 "통" 소리.
  const Hop = { mode: "hop", stepK: 0, t: 0, dur: 0, fx: 0, fy: 0, tx: 0, ty: 0, h: 0, heading: Math.random() * 6.28, left: 0, rest: 1.2, raf: 0, last: 0 };
  let audio = null;
  function popSound(x, soft) {
    if (!Roam.snd) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(), f = soft ? rnd(520, 640) : rnd(300, 430);
      o.type = "sine"; o.frequency.setValueAtTime(f * 1.7, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.11);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(soft ? 0.05 : 0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      let node = g; o.connect(g);
      if (audio.createStereoPanner) { const p = audio.createStereoPanner(); p.pan.value = Math.max(-0.7, Math.min(0.7, (x / Math.max(1, innerWidth)) * 1.6 - 0.8)); g.connect(p); node = p; }
      node.connect(audio.destination); o.start(t); o.stop(t + 0.2);
    } catch (e) { /* 소리 불가 환경 */ }
  }
  function roamPlace(x, y) { Roam.x = x; Roam.y = y; $("#lotto-roam").style.transform = `translate(${x}px,${y}px)`; }
  function startHop() {
    const maxX = Math.max(9, innerWidth - Roam.W - 8), maxY = Math.max(57, innerHeight - Roam.H - 8);
    const wd = Hop.mode === "waddle", leap = !wd && Math.random() < 0.15, dist = wd ? rnd(140, 300) : leap ? rnd(260, 400) : rnd(80, 170);
    let tx = Roam.x, ty = Roam.y, ok = false;
    for (let i = 0; i < 10 && !ok; i++) {
      const hd = Hop.heading + (i < 4 ? rnd(-(wd ? 0.7 : 1.1), wd ? 0.7 : 1.1) : rnd(-3.14, 3.14));
      tx = Roam.x + Math.cos(hd) * dist; ty = Roam.y + Math.sin(hd) * dist * 0.75;
      if (tx >= 8 && tx <= maxX && ty >= 56 && ty <= maxY) { ok = true; Hop.heading = hd; }
    }
    if (!ok) { tx = Math.max(8, Math.min(maxX, tx)); ty = Math.max(56, Math.min(maxY, ty)); Hop.heading = Math.atan2(ty - Roam.y + (innerHeight / 2 - ty) * 0.2, tx - Roam.x + (innerWidth / 2 - tx) * 0.2); }
    Hop.fx = Roam.x; Hop.fy = Roam.y; Hop.tx = tx; Hop.ty = ty; Hop.t = 0;
    const d = Math.hypot(tx - Hop.fx, ty - Hop.fy);
    Hop.dur = wd ? d / 85 : 0.34 + d / 650; Hop.h = wd ? 0 : (leap ? 90 : 28) + d * 0.22 + rnd(0, 14);
    Pet.roam.walk(true, tx >= Hop.fx ? 1 : -1, Hop.mode);
  }
  function roamLoop(ts) {
    Hop.raf = 0; if (!Roam.on || !Pet.roam) return;
    Hop.raf = requestAnimationFrame(roamLoop);
    const dt = Hop.last ? Math.min(0.05, (ts - Hop.last) / 1000) : 0; Hop.last = ts;
    if (document.hidden || window.innerWidth < 600) return;
    girlFollow(dt, ts);
    const el = $("#lotto-roam"), body = $("#roam-body");
    if (Hop.dur > 0) {
      Hop.t += dt; const k = Math.min(1, Hop.t / Hop.dur);
      const x = Hop.fx + (Hop.tx - Hop.fx) * k, gy = Hop.fy + (Hop.ty - Hop.fy) * k;
      Roam.x = x; Roam.y = gy;
      const wd = Hop.mode === "waddle";
      el.style.transform = `translate(${x}px,${gy - (wd ? Math.abs(Math.sin(Hop.t * 7)) * 4 : Math.sin(k * Math.PI) * Hop.h)}px)`;
      body.style.transform = wd ? "" : k < 0.14 ? "scale(.93,1.09)" : "";
      if (k >= 1) {                                  // 착지: 찌그러졌다 펴지고 "통"
        Hop.dur = 0; if (!wd) { popSound(x); body.style.transform = "scale(1.13,.87)"; setTimeout(() => { body.style.transform = ""; }, 110); }
        if (--Hop.left <= 0) { Pet.roam.walk(false); Hop.rest = rnd(0.8, 3.2); if (Math.random() < 0.5) Pet.roam.act(["wave", "hatTip", "wiggle", "twirl", "look"][Math.floor(Math.random() * 5)]); }
        else Hop.rest = rnd(0.02, 0.12);
      }
      return;
    }
    if (Roam.talking || Roam.ask || chat.busy) return;   // 말하는 중·질문 입력 중·생각 중에는 서서 이야기
    Hop.rest -= dt;
    if (Hop.rest <= 0) {
      if (Hop.left <= 0) { Hop.mode = Math.random() < 0.45 ? "waddle" : "hop"; Hop.left = Hop.mode === "waddle" ? 2 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 6); }
      startHop();
    }
  }
  // 로또를 클릭하면 말 걸기 입력줄이 열린다 → 질문은 AI 상담과 같은 길로 가고, 답은 말풍선에 실시간으로 나온다
  function openAsk(on) {
    const f = $("#roam-ask"); f.hidden = !on; Roam.ask = on;
    if (on) { roamSay("네, 대장님! 무엇이 궁금하세요?", 5000); setTimeout(() => $("#roam-q").focus(), 30); } else $("#roam-q").blur();
  }
  $("#roam-ask").addEventListener("submit", (e) => {
    e.preventDefault(); const q = $("#roam-q").value.trim(); if (!q) return;
    $("#roam-q").value = ""; openAsk(false); send(q);
  });
  $("#roam-q").addEventListener("keydown", (e) => { if (e.key === "Escape") openAsk(false); });
  // ---- 뽀또: 로또의 여자친구. 로또 곁을 따라다니고(멀면 뛰어서, 가까우면 아장아장) 가끔 말을 건다
  const Girl = { on: true, x: 0, y: 0, sp: 0, dir: 1, side: 0, run: false, moving: false, placed: false, say: 0, nextSay: 0, nextMood: 0, moodT: 0 };
  const GIRL_LINES = ["대장님, 오늘도 화이팅이에요!", "로또야, 같이 가요~", "번호는 재미로만 즐겨요, 대장님!", "저도 통계는 좀 알아요, 헤헤.", "로또는 제가 지켜요!", "대장님, 물 한 잔 드세요~"];
  function girlSay(text, ms) {
    const el = $("#roam2-say"); if (!el || !text) return;
    $("#roam2-top").className = "roam-top" + (Girl.x < 140 ? " left" : Girl.x > innerWidth - 320 ? " right" : "") + (Girl.y < 130 ? " below" : "");
    el.className = "roam-say"; void el.offsetHeight; el.classList.add("show"); el.textContent = text;
    clearTimeout(Girl.say); Girl.say = setTimeout(() => el.classList.remove("show"), ms || 4200);
    speakLine(text, "ppoddo", Pet.girl);
    girlMood(Math.random() < 0.5 ? "happy" : "wink", Math.min(4200, (ms || 4200)));
    if (Pet.girl && !(Voice.on && Voice.mode === 3)) { Pet.girl.talk(true); setTimeout(() => Pet.girl && Pet.girl.talk(false), Math.min(3200, 600 + text.length * 120)); }
  }
  // 로또 곁을 부드럽게 따라간다: 속도를 서서히 올리고 줄이고(급정지·순간이동 없음), 한쪽 자리를 유지하고(화면 가장자리에서만 반대편으로),
  // 멀 때만 뛰고(여유 두고 되돌아옴) 가까우면 아장아장, 도착하면 서서 표정을 짓는다
  function girlFollow(dt, ts) {
    const el = $("#lotto-roam2"); if (!Girl.on || !Pet.girl || el.hidden) return;
    const maxX = Math.max(9, innerWidth - Roam.W - 8), maxY = Math.max(57, innerHeight - Roam.H - 8);
    if (!Girl.side) Girl.side = Girl.x < Roam.x ? -1 : 1;
    const want = (sd) => Roam.x + sd * 135;
    if (want(Girl.side) < 8 || want(Girl.side) > maxX) Girl.side = -Girl.side;        // 자리가 없을 때만 반대편
    const tx = Math.max(8, Math.min(maxX, want(Girl.side))), ty = Math.max(56, Math.min(maxY, Roam.y + 12));
    const dx = tx - Girl.x, dy = ty - Girl.y, d = Math.hypot(dx, dy);
    const still = Roam.ask || Roam.talking;
    if (!Girl.run && d > 300) Girl.run = true; else if (Girl.run && d < 150) Girl.run = false;
    const goal = still || d < (Girl.moving ? 10 : 42) ? 0 : (Girl.run ? Math.min(340, 80 + d * 1.1) : Math.min(120, 30 + d * 0.9));
    const k = 1 - Math.exp(-(goal > Girl.sp ? 5 : 8) * dt);                           // 가속은 천천히, 감속은 조금 빨리
    Girl.sp += (goal - Girl.sp) * k;
    Girl.moving = Girl.sp > 6;
    if (Girl.moving && d > 0.5) {
      const step = Math.min(d, Girl.sp * dt); Girl.x += dx / d * step; Girl.y += dy / d * step;
      if (Math.abs(dx) > 14) Girl.dir = dx > 0 ? 1 : -1;
      Pet.girl.walk(true, Girl.dir || 1, Girl.run ? "hop" : "waddle");
    } else { Pet.girl.walk(false); Girl.sp = 0; }
    const ph = ts * (Girl.run ? 0.013 : 0.007), bob = Girl.moving ? Math.abs(Math.sin(ph)) * (Girl.run ? Math.min(12, Girl.sp / 25) : 3) : 0;
    el.style.transform = `translate(${Girl.x.toFixed(1)}px,${(Girl.y - bob).toFixed(1)}px)`;
    // 표정: 서 있을 때 가끔 웃거나 윙크, 말풍선을 띄울 땐 기쁜 표정
    if (!Girl.moving && ts > Girl.nextMood) { Girl.nextMood = ts + rnd(7000, 14000); girlMood(Math.random() < 0.5 ? "happy" : "wink", 1900); }
    if (ts > Girl.nextSay) { Girl.nextSay = ts + rnd(25000, 45000); if (!Roam.talking && !Roam.ask) girlSay(GIRL_LINES[Math.floor(Math.random() * GIRL_LINES.length)]); }
  }
  function girlMood(m, back) {
    if (!Pet.girl) return; Pet.girl.setMood(m); clearTimeout(Girl.moodT);
    if (back) Girl.moodT = setTimeout(() => { if (Pet.girl && Pet.girl.mood === m) Pet.girl.setMood("normal"); }, back);
  }
  function setGirl(on) {
    Girl.on = on; store.set("girl", on ? "1" : "0");
    $("#girl-btn").classList.toggle("on", on); $("#girl-btn").textContent = "뽀또(여자친구): " + (on ? "함께" : "없음");
    const el = $("#lotto-roam2"); el.hidden = !(on && Roam.on);
    if (el.hidden) { Pet.girl && Pet.girl.walk(false); return; }
    if (!Pet.girl && window.Lotto3D && window.Lotto3D.ok) {
      Pet.girl = window.Lotto3D.mount($("#roam2-body"), { variant: "girl", onTap: () => { if (!Pet.girl) return; Math.random() < 0.5 ? Pet.girl.hop() : Pet.girl.wave(); girlSay(["안녕하세요, 대장님~!", "저 뽀또예요, 헤헤.", "로또랑 친하게 지내요!"][Math.floor(Math.random() * 3)]); } });
    }
    if (!Pet.girl) { el.hidden = true; return; }
    if (!Girl.placed) { Girl.x = Math.max(8, Math.min(innerWidth - Roam.W - 8, Roam.x - 140)); Girl.y = Roam.y; Girl.placed = true; el.style.transform = `translate(${Girl.x}px,${Girl.y}px)`; }
    Girl.nextSay = performance.now() + 3500; setTimeout(() => girlSay("대장님, 안녕하세요~! 저는 뽀또예요."), 400);
  }
  $("#girl-btn").addEventListener("click", () => setGirl(!Girl.on));
  function setRoam(on) {
    Roam.on = on; store.set("roam", on ? "1" : "0");
    document.body.classList.toggle("roam-on", on && !!Pet.big);
    $("#roam-btn").classList.toggle("on", on); $("#roam-btn").textContent = "로또 돌아다니기: " + (on ? "켬" : "끔");
    const el = $("#lotto-roam"); el.hidden = !on; cancelAnimationFrame(Hop.raf); Hop.raf = 0; Hop.last = 0; Hop.dur = 0;
    if (!on) { Pet.roam && Pet.roam.walk(false); setGirl(Girl.on); return; }
    if (!Pet.roam && window.Lotto3D && window.Lotto3D.ok) {
      Pet.roam = window.Lotto3D.mount($("#roam-body"), { onTap: () => { if (!Pet.roam) return; Math.random() < 0.5 ? Pet.roam.hop() : Pet.roam.wave(); popSound(Roam.x); openAsk(!$("#roam-ask").hidden ? false : true); } });
    }
    if (!Pet.roam) { Roam.on = false; el.hidden = true; document.body.classList.remove("roam-on"); return; }
    roamPlace(Roam.x || innerWidth - Roam.W - 30, Roam.y || innerHeight - Roam.H - 20);
    Pet.roam.onStep(() => { if (Hop.mode === "waddle") popSound(Roam.x, true); });
    Hop.left = 0; Hop.rest = 1.2; Hop.raf = requestAnimationFrame(roamLoop);
    setGirl(Girl.on);
  }
  window.addEventListener("resize", () => { if (Roam.on) roamPlace(Math.min(Roam.x, Math.max(0, innerWidth - Roam.W)), Math.min(Roam.y, Math.max(0, innerHeight - Roam.H))); });
  $("#snd-btn").addEventListener("click", () => { Roam.snd = !Roam.snd; store.set("snd", Roam.snd ? "1" : "0"); $("#snd-btn").classList.toggle("on", Roam.snd); $("#snd-btn").textContent = "통통 소리: " + (Roam.snd ? "켬" : "끔"); if (Roam.snd) popSound(Roam.x); });
  Girl.on = store.get("girl", "1") === "1"; $("#girl-btn").classList.toggle("on", Girl.on); $("#girl-btn").textContent = "뽀또(여자친구): " + (Girl.on ? "함께" : "없음");
  Roam.snd = store.get("snd", "1") === "1"; $("#snd-btn").classList.toggle("on", Roam.snd); $("#snd-btn").textContent = "통통 소리: " + (Roam.snd ? "켬" : "끔");
  $("#roam-btn").addEventListener("click", () => setRoam(!Roam.on));
  // ---- 답변 읽어 주기 켜고 끄기
  function setTts(mode) {     // 0 끔 · 1 기기 목소리 · 2 자연스러운(인터넷) 목소리
    Voice.on = mode > 0; Voice.mode = mode || 1; Voice.voice = null; store.set("tts", String(mode));
    if (!mode) { stopVoice(); chatTalk(false); }
    const b = $("#tts-btn"); b.classList.toggle("on", mode > 0);
    b.textContent = "답변 읽어 주기: " + (mode === 3 ? "로컬 AI 목소리" : mode === 2 ? "자연스러운(인터넷)" : mode === 1 ? "기기 목소리" : "끔");
  }
  $("#tts-btn").addEventListener("click", async () => {
    const cur = Voice.on ? Voice.mode : 0, hello = "안녕하세요, 대장님. 이제 답변을 읽어 드릴게요.";
    const st = await fetch("/api/tts/status").then((r) => r.json()).catch(() => ({ installed: false }));
    const avail = { 3: !!st.installed, 1: !!pickVoice(1), 2: !!pickVoice(2) };
    const order = [3, 1, 2];
    const nxt = order.slice(cur ? order.indexOf(cur) + 1 : 0).find((m) => avail[m]);
    if (!nxt) { if (cur === 0 && !("speechSynthesis" in window)) alert("이 브라우저는 소리 내어 읽기를 지원하지 않습니다."); return setTts(0); }
    if (nxt === 2 && !confirm("자연스러운 목소리는 인터넷(마이크로소프트 서버)으로 읽을 글을 보냅니다. 로또 상담 답변만 해당하고 고객 정보는 없습니다.\n그래도 쓸까요?")) return setTts(0);
    setTts(nxt);
    speakAnswer(hello);
  });
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => { Voice.voice = null; };
  { const m = Number(store.get("tts", "0")); setTimeout(() => setTts(m === 3 || (m && pickVoice(m)) ? m : 0), 600); }
  window.addEventListener("lotto3d-ready", initPet);
  if (window.Lotto3D) initPet();

  function addMsg(role, content, cards, mood) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    if (role === "user") el.textContent = content;
    else el.innerHTML = `<div class="who">${avatar(mood || "normal")}<span><b>로또</b><i>· 공 박사</i></span></div><div class="body">${md(content)}</div>`;
    if (cards) appendCards(el, cards);
    $("#chat-log").appendChild(el);
    $("#chat-log").scrollTop = 1e9;
    return el;
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || chat.busy) return;
    $(".chips-welcome")?.remove(); closePop(); stopVoice();
    const model = $("#lms-model").value;
    if (!model) { toast("LM Studio 모델을 먼저 연결하세요"); return; }
    $("#chat-text").value = ""; $("#chat-text").style.height = "auto";
    addMsg("user", text);
    chat.history.push({ role: "user", content: text });
    const el = addMsg("bot", "", null, "think");
    chatMood("think");
    const usedTools = [];
    const body = $(".body", el);
    body.innerHTML = `<span class="typing">자료 확인 중…</span>`;
    chat.busy = true; chat.ctrl = new AbortController();
    $("#chat-send").textContent = "중지";
    let answer = "", facts = "", thinking = false, revised = null, serverCheck = null, talking = false;
    const cards = [];
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: chat.ctrl.signal,
        body: JSON.stringify({ base: lmsBase(), model, messages: chat.history.slice(-12) }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `오류 ${r.status}`); }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          let j; try { j = JSON.parse(data); } catch (e) { continue; }
          if (j.facts) { facts = j.facts; continue; }
          if (j.tool) {
            facts += "\n" + (j.facts_add || "");
            let tl = $(".tools", el);
            if (!tl) { tl = document.createElement("div"); tl.className = "tools"; el.insertBefore(tl, body); }
            const chip = document.createElement("span");
            chip.className = "tool-chip" + (j.tool.error ? " err" : "");
            chip.textContent = "🔧 " + j.tool.label + (j.tool.error ? " — " + j.tool.error : "");
            tl.appendChild(chip);
            usedTools.push(j.tool.name);
            if (CARD_TOOLS.includes(j.tool.name)) {
              try { cards.push({ name: j.tool.name, result: JSON.parse(j.facts_add || "{}") }); } catch (err) { /* 카드 없이 */ }
            }
            if (!answer) body.innerHTML = `<span class="typing">자료 확인 후 답변 작성 중…</span>`;
            continue;
          }
          if (j.error) { answer += `\n\n⚠️ ${j.error}`; continue; }
          if (j.revise) {
            revised = j.revise;
            body.innerHTML = `<span class="typing">검토 중 고칠 곳을 찾아 다시 쓰는 중…</span>`;
            continue;
          }
          if (j.replace) { answer = ""; continue; }
          if (j.check) { serverCheck = j.check; continue; }
          const d = j.choices && j.choices[0] && j.choices[0].delta;
          if (!d) continue;
          if (d.reasoning_content || d.reasoning) { thinking = true; body.innerHTML = `<span class="typing">생각 중…</span>`; }
          if (d.content) {
            answer += d.content;
            if (!talking) { talking = true; chatTalk(true); }
            const shown = answer.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
            roamLive(shown);
            body.innerHTML = shown ? md(shown) : `<span class="typing">${thinking || /<think>/.test(answer) ? "생각 중…" : "작성 중…"}</span>`;
            $("#chat-log").scrollTop = 1e9;
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") answer = answer || `⚠️ ${e.message}\n\nLM Studio 가 켜져 있고(Developer → Status: Running) 모델이 선택돼 있는지 확인해 주세요.`;
    }
    answer = answer.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim() || "(답변이 비어 있습니다)";
    body.innerHTML = md(answer);
    if (revised) {
      const r = document.createElement("div");
      r.className = "revised";
      const why = [].concat(revised.numbers.length ? ["자료에 없는 숫자 " + revised.numbers.join(", ")] : [],
        revised.phrases.length ? ["쓰면 안 되는 표현"] : []).join(" · ");
      r.textContent = "🔁 검토 후 고친 답 (처음 답의 문제: " + why + ")";
      el.appendChild(r);
    }
    if (facts) {
      const bad = serverCheck ? serverCheck.numbers : checkNumbers(answer, facts, text);
      const phrases = serverCheck ? serverCheck.phrases : [];
      if (bad.length || phrases.length) {
        const c = document.createElement("div");
        c.className = "check";
        c.textContent = (bad.length ? "🔢 계산 자료에서 그대로 확인되지 않은 숫자: " + bad.join(", ") + ". " : "")
          + (phrases.length ? "⚠️ 주의할 표현: " + phrases.join(" / ") + ". " : "") + "다른 화면의 숫자로 확인하세요.";
        el.appendChild(c);
      }
    }
    appendCards(el, cards);
    chatTalk(false);
    const mood = moodFor(answer, usedTools);
    setAvatarMood(el, mood);
    chatMood(mood);
    speakAnswer(answer);
    { const f = answer.replace(/```[\s\S]*?```/g, " ").replace(/[*#>`|_~]/g, " ").replace(/\s+/g, " ").trim(); roamSay(f.length > 150 ? f.slice(0, 147) + "…" : f, Voice.on ? 16000 : 10000); }
    chat.history.push(cards.length ? { role: "assistant", content: answer, cards, mood } : { role: "assistant", content: answer, mood });
    store.set("chat", JSON.stringify(chat.history.slice(-20)));
    chat.busy = false; chat.ctrl = null;
    $("#chat-send").textContent = "보내기";
    $("#chat-log").scrollTop = 1e9;
  }

  // 접기 상태 기억(<details data-fold>)
  function bindFolds(root) {
    $$("details[data-fold]", root).forEach((d) => {
      if (d.dataset.bound) return;
      d.dataset.bound = "1";
      d.open = store.get("fold_" + d.dataset.fold, "0") === "1";
      d.addEventListener("toggle", () => store.set("fold_" + d.dataset.fold, d.open ? "1" : "0"));
    });
  }
  bindFolds(document);

  // ---------------------------------------------------------------- 주간 브리핑 (첫 화면)
  let briefPoll = null;
  function renderBrief(b) {
    const box = $("#home-brief");
    if (!b || !b.no) { box.hidden = true; return; }
    box.hidden = false;
    const r1 = b.rank1, bt = r1.by_type, sh = b.shape, ai = b.ai || {};
    const facts = [
      r1.winners ? `1등 <b>${r1.winners}명</b> · 1인당 ${won(r1.amount)}(세전) / 세후 약 ${won(r1.amount_net)}` : "1등 당첨자 없음 — 1등 상금 이월",
      bt ? `1등 구매 방식: 자동 ${bt.auto} · 수동 ${bt.manual} · 반자동 ${bt.semi}` : "",
      `평균 조합이면 1등 약 ${b.expected_rank1}명 — 모델은 이 조합을 인기도 ${b.model.popularity}배로 보아 약 ${b.model.expected}명 예상(참고)`,
      b.model.patterns.length ? `<span style="color:var(--warn)">알려진 인기 모양: ${b.model.patterns.map(esc).join(", ")}</span>` : "",
      `합계 ${sh.sum}(이론 평균 138) · 홀수 ${sh.odd}개 · 연속 쌍 ${sh.consec}개 · 지난 회차와 겹친 번호 ${sh.repeat.length ? sh.repeat.join(", ") : "없음"}`,
      sh.long_gap.length ? `오래 만에 나온 번호: ${sh.long_gap.map((x) => `${x.n}번(${x.gap}회 만)`).join(", ")} — 우연입니다` : "",
    ].filter(Boolean);
    let aiHTML;
    if (ai.status === "ok") {
      aiHTML = `<div class="brief-ai"><span class="lbl">AI 요약 · ${esc(ai.model || "")}${ai.revised ? " · 검토 후 고침" : ""} · 숫자 검사 통과</span>${esc(ai.text)}</div>`;
    } else if (b.ai_running) {
      aiHTML = `<div class="brief-ai"><span class="lbl">AI 요약</span><span class="typing">LM Studio 로 요약을 만드는 중…</span></div>`;
    } else {
      const why = ai.status === "rejected" ? "숫자 검사를 통과하지 못해 싣지 않았습니다"
        : ai.reason ? "LM Studio 에 연결하지 못했습니다" : "아직 만들지 않았습니다";
      aiHTML = `<div class="brief-ai"><span class="lbl">AI 요약</span><span class="small muted">${why}. '자세히'의 사실은 코드가 계산한 값입니다.</span>
        <button class="btn sm" id="brief-regen" style="margin-left:8px">다시 만들기</button></div>`;
    }
    const my = b.my;
    box.innerHTML = `
      <h2 class="brief-title">${avatar("happy")}<span>로또의 ${b.no}회 브리핑</span></h2>
      ${aiHTML}
      <details class="brief-more" data-fold="brief"><summary>이번 회차 사실 자세히 (코드 계산)</summary>
        <ul class="brief-facts">${facts.map((f) => `<li>${f}</li>`).join("")}</ul></details>
      ${my ? `<div class="callout info small" style="margin-top:10px">내 구매: ${my.games}게임 중 ${my.wins}게임 당첨 · 받은 돈 ${won(my.won)} / 쓴 돈 ${won(my.cost)} · 가장 많이 맞힌 것 ${my.best}개</div>` : ""}
      <div class="brief-picks">
        <div class="small muted" style="margin-bottom:6px"><b>${b.next.no}회 비인기 추천</b> — 당첨 확률은 모두 같고, 당첨되면 나눠 가질 사람이 적은 조합</div>
        ${b.picks.map((p, i) => `<div class="tcard-row"><span class="lbl">${String.fromCharCode(65 + i)}</span>${balls(p, null, "sm")}${addBtn([p], "담기")}</div>`).join("")}
        <div style="margin-top:6px">${addBtn(b.picks, `${b.picks.length}게임 모두 담기`)}</div>
      </div>`;
    bindFolds(box); paintAvatars();
    const regen = $("#brief-regen");
    if (regen) regen.addEventListener("click", async () => {
      regen.disabled = true;
      try { await api("/api/briefing/regenerate", {}); } catch (e) { /* 아래 다시 읽기 */ }
      setTimeout(loadBrief, 800);
    });
    clearTimeout(briefPoll);
    if (b.ai_running) briefPoll = setTimeout(loadBrief, 5000);  // 요약이 끝나면 저절로 바뀜
  }
  async function loadBrief() {
    try { renderBrief(await api("/api/briefing")); } catch (e) { $("#home-brief").hidden = true; }
  }
  $("#home-brief").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-add]");
    if (!b || b.disabled) return;
    let games;
    try { games = JSON.parse(b.dataset.add); } catch (err) { return; }
    b.disabled = true;
    if (await addTickets(games, "주간 브리핑")) b.textContent = "담았습니다 ✓";
    else b.disabled = false;
  });

  // ---------------------------------------------------------------- 시작
  async function load() {
    try {
      S = await api("/api/summary");
    } catch (e) {
      $("#data-status").textContent = "서버에 연결할 수 없습니다";
      return;
    }
    renderHome(); renderStats(); renderBacktest(); renderPopular();
    loadMine();
    loadBrief();
  }
  load().then(() => {
    const v = store.get("view", "home");
    if ($("#view-" + v)) showView(v);
  });
})();
