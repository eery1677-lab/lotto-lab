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
  function renderHome() {
    const d = S.latest, m = S.money, r = S.randomness, b = S.backtest;
    $("#latest").innerHTML = `
      <div>
        <div class="title">최신 회차 · ${esc(d.date)} 추첨</div>
        <div class="no">${d.no}회</div>
        <div class="small muted">1등 ${fmt(d.winners[0])}명 · 1인당 ${won(d.amounts[0])}</div>
      </div>
      ${balls(d.nums, d.bonus, "lg")}`;
    const tests = [r.freq_test.p, r.sum.test.p, r.odd.test.p, r.repeat.test.p, r.consecutive.p];
    const passed = tests.filter((p) => p >= 0.05).length;
    const beat = b.strategies.filter((s) => s.key !== "random" && s.p < 0.05 && s.mean > b.theory_mean).length;
    $("#home-stats").innerHTML = [
      ["1등 확률", "1 / 8,145,060", "어떤 번호를 골라도 같음"],
      ["1,000원당 돌아오는 돈", `약 ${Math.round(m.payout_pct_recent * 10)}원`, `최근 52회 환급률 ${m.payout_pct_recent}%`],
      ["무작위성 검정", `${passed} / ${tests.length} 통과`, "통과 = 완전 무작위와 구별 안 됨"],
      ["예측법 7가지", beat ? `${beat}개가 무작위보다 나음` : "전부 무작위와 같음", `${fmt(b.tested)}회 실제 결과로 검증`],
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
  function comboHTML(c, i) {
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
      ${i != null ? `<button class="btn sm" data-copy="${c.nums.join(" ")}">복사</button>` : ""}
    </div>`;
  }
  $("#gen-btn").addEventListener("click", async () => {
    const btn = $("#gen-btn");
    btn.disabled = true;
    try {
      const res = await api("/api/generate", {
        count: +segValue("gen-count"), mode: segValue("gen-mode"), strength: +segValue("gen-strength"),
      });
      lastCombos = res.combos;
      $("#gen-result").innerHTML = res.combos.map(comboHTML).join("") +
        `<div class="note">당첨 확률은 모든 게임이 1/8,145,060 으로 같습니다. 기대 수령액은 최근 1년 평균 1등 총상금과 판매량 기준 추정치이고, 평균 조합은 세전 ${won(res.combos[0].expected_rank1_avg)} / 세후 ${won(res.combos[0].expected_rank1_net_avg)}입니다. 세후는 200만원 초과 시 3억원까지 22%, 초과분 33%(지방세 포함)를 뺀 금액입니다.</div>`;
      $$("[data-copy]", $("#gen-result")).forEach((b) => b.addEventListener("click", () => copy(b.dataset.copy)));
      $("#gen-copy").disabled = false;
      $("#gen-save").disabled = false;
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  });
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
      addMsg("bot", "안녕하세요, 대장님. 로또 확률 연구소 분석 상담가입니다. 당첨 번호를 예측해 드릴 수는 없지만, 실제 자료로 계산한 통계와 ‘나눠 가질 위험이 적은 조합’은 정확하게 알려 드릴 수 있습니다. 무엇이 궁금하세요?");
    } else {
      chat.history.forEach((m) => addMsg(m.role === "user" ? "user" : "bot", m.content, m.cards));
    }
  }
  $("#lms-refresh").addEventListener("click", () => { store.set("lms_base", lmsBase()); loadModels(); });
  $("#lms-model").addEventListener("change", (e) => store.set("model", e.target.value));
  $("#chat-clear").addEventListener("click", () => {
    chat.history = []; store.set("chat", "[]"); $("#chat-log").innerHTML = ""; chat.inited = false; initChat();
  });
  $("#chips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) send(c.textContent); });
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

  function addMsg(role, content, cards) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    if (role === "user") el.textContent = content;
    else el.innerHTML = `<div class="who">분석 상담가</div><div class="body">${md(content)}</div>`;
    if (cards) appendCards(el, cards);
    $("#chat-log").appendChild(el);
    $("#chat-log").scrollTop = 1e9;
    return el;
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || chat.busy) return;
    const model = $("#lms-model").value;
    if (!model) { toast("LM Studio 모델을 먼저 연결하세요"); return; }
    $("#chat-text").value = ""; $("#chat-text").style.height = "auto";
    addMsg("user", text);
    chat.history.push({ role: "user", content: text });
    const el = addMsg("bot", "");
    const body = $(".body", el);
    body.innerHTML = `<span class="typing">자료 확인 중…</span>`;
    chat.busy = true; chat.ctrl = new AbortController();
    $("#chat-send").textContent = "중지";
    let answer = "", facts = "", thinking = false, revised = null, serverCheck = null;
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
            const shown = answer.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
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
    chat.history.push(cards.length ? { role: "assistant", content: answer, cards } : { role: "assistant", content: answer });
    store.set("chat", JSON.stringify(chat.history.slice(-20)));
    chat.busy = false; chat.ctrl = null;
    $("#chat-send").textContent = "보내기";
    $("#chat-log").scrollTop = 1e9;
  }

  // ---------------------------------------------------------------- 주간 브리핑 (첫 화면)
  let briefPoll = null;
  function renderBrief(b) {
    const box = $("#home-brief");
    if (!b || !b.no) { box.hidden = true; $("#latest").hidden = false; return; }
    box.hidden = false;
    $("#latest").hidden = true;  // 같은 회차 결과가 겹치지 않게
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
      aiHTML = `<div class="brief-ai"><span class="lbl">AI 요약</span><span class="small muted">${why}. 아래 사실은 코드가 계산한 값입니다.</span>
        <button class="btn sm" id="brief-regen" style="margin-left:8px">다시 만들기</button></div>`;
    }
    const my = b.my;
    box.innerHTML = `
      <div class="brief-head">
        <div><div class="small muted">이번 주 브리핑 · ${esc(b.date)} 추첨</div><h2 style="margin:2px 0 0">${b.no}회 결과</h2></div>
        ${balls(b.nums, b.bonus)}
      </div>
      ${aiHTML}
      <ul class="brief-facts">${facts.map((f) => `<li>${f}</li>`).join("")}</ul>
      ${my ? `<div class="callout info small" style="margin-top:10px">내 구매: ${my.games}게임 중 ${my.wins}게임 당첨 · 받은 돈 ${won(my.won)} / 쓴 돈 ${won(my.cost)} · 가장 많이 맞힌 것 ${my.best}개</div>` : ""}
      <div class="brief-picks">
        <div class="small muted" style="margin-bottom:6px">다음 추첨 <b>${b.next.no}회 · ${esc(b.next.date)}(토)</b> — 이번 주 비인기 추천(당첨 확률은 모두 같음)</div>
        ${b.picks.map((p, i) => `<div class="tcard-row"><span class="lbl">${String.fromCharCode(65 + i)}</span>${balls(p, null, "sm")}${addBtn([p], "담기")}</div>`).join("")}
        <div style="margin-top:6px">${addBtn(b.picks, `${b.picks.length}게임 모두 담기`)}</div>
      </div>`;
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
