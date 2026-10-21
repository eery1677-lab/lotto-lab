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
  let viewBeforeSettings = "home";
  function showView(v) {
    const curV = ($(".view.active") || {}).id; if (v === "settings" && curV && curV !== "view-settings") viewBeforeSettings = curV.replace("view-", "");
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
    document.body.classList.toggle("ai-mode", v === "ai");
    { const bar = $(".side"), cur = $(".nav-btn.active");          // 휴대폰: 현재 탭이 가로 막대 가운데에 보이게
      if (bar && cur && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2, behavior: "smooth" }); }
    store.set("view", v);
    if (v === "ai") initChat();
    if (v === "settings" && $("#set-model-lotto").options.length <= 1) loadModels();
    if (v === "settings") { loadVoices(); loadAiRecords(); }        // 캐릭터별 모델 목록은 설정 탭에서도 필요
    window.scrollTo(0, 0);
  }
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#settings-close").addEventListener("click", () => showView(viewBeforeSettings || "home"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#view-settings").classList.contains("active") && $("#phone-modal").hidden) showView(viewBeforeSettings || "home"); });
  // ---- 캐릭터별 목소리(로컬 AI 목소리): 정해진 9가지 중 고르기 + 말투 한 줄 + 들어 보기
  // ---- AI 단독 회의 연구 기록: 고른 번호와, 그 회차 추첨이 끝났으면 맞힌 개수(참고)
  async function loadAiRecords() {
    const box = $("#ai-records"); if (!box) return;
    let d; try { d = await (await fetch("/api/ai-picks")).json(); } catch (e) { box.innerHTML = `<div class="set-note">서버를 껐다가 다시 켜면 연구 기록이 나타나요.</div>`; return; }
    const rs = d.records || [];
    if (!rs.length) { box.innerHTML = `<div class="set-note">아직 기록이 없어요. 채팅에서 "AI 셋이서만 번호를 뽑아 줘"라고 해 보세요.</div>`; return; }
    const nm = { lotto: "로또", ppoddo: "뽀또", kkom: "꼼꼼이" };
    box.innerHTML = rs.slice(0, 8).map((r) => `<div class="air"><div class="air-h"><b>${r.draw}회</b> <span class="muted small">${esc(r.at)}${r.result ? " · 추첨 결과: " + r.result.join(" ") : " · 추첨 전"}</span></div>
      ${r.picks.map((p) => `<div class="air-row"><span class="air-who">${nm[p.who] || p.who}</span>${balls(p.nums, null, "sm")}<span class="small muted">${p.match == null ? "결과 대기" : "맞힌 개수 " + p.match + "개"}</span></div>`).join("")}</div>`).join("");
  }
  async function loadVoices() {
    const box = $("#voice-rows"); if (!box) return;
    let data;
    try { const r = await fetch("/api/tts/voices"); if (!r.ok) throw new Error("old"); data = await r.json(); }
    catch (e) { box.innerHTML = `<div class="set-note">캐릭터별 목소리 선택은 <b>서버를 껐다가 다시 켜야</b> 나타나요. (바탕화면 로또 아이콘으로 서버를 다시 켜 주세요.)</div>`; return; }
    const order = ["lotto", "ppoddo", "kkom"].filter((k) => data.voices[k]);
    if (!order.length) { box.innerHTML = ""; return; }
    const opts = (sel) => data.speakers.map((sp) => `<option value="${sp.id}"${sp.id === sel ? " selected" : ""}>${esc(sp.label)}</option>`).join("");
    box.innerHTML = order.map((k) => { const v = data.voices[k]; return `<div class="voice-row" data-who="${k}">
      <div class="vr-top"><b>${esc((WHO[k] || {}).name || v.label)} 목소리</b>
        <div class="vr-ctl"><select class="vr-spk">${opts(v.speaker)}</select><button class="btn sm vr-play" type="button">들어 보기</button></div></div>
      <input type="text" class="vr-style" maxlength="200" value="${esc(v.style)}" placeholder="말투 한 줄 (예: 귀엽고 밝게, 톤을 높게)">
      <span class="vr-state">${v.sample ? "녹음 샘플이 있어 그 목소리를 따라 해요(위 선택은 샘플이 없을 때만 쓰여요)." : ""}</span></div>`; }).join("");
    $$(".voice-row", box).forEach((row) => {
      const who = row.dataset.who, state = $(".vr-state", row);
      const save = async () => {
        try { await api("/api/tts/voices", { who, speaker: $(".vr-spk", row).value, style: $(".vr-style", row).value }); state.textContent = "저장했어요."; }
        catch (e) { state.textContent = "저장하지 못했어요: " + e.message; }
      };
      $(".vr-spk", row).addEventListener("change", save);
      $(".vr-style", row).addEventListener("change", save);
      $(".vr-play", row).addEventListener("click", async (e) => {
        const b = e.currentTarget; b.disabled = true; state.textContent = "목소리를 만드는 중이에요… (처음 한 번은 모델을 올리느라 20~30초, 그다음은 몇 초예요)";
        try {
          await save();
          const line = { lotto: "안녕하세요, 대장님. 저는 로또예요.", ppoddo: "대장님, 안녕하세요! 저는 뽀또예요.", kkom: "안녕하세요, 대장님. 검산 담당 꼼꼼이입니다." }[who] || "안녕하세요, 대장님.";
          const blob = await ttsFetch(line, who); state.textContent = "재생 중…";
          await playBlob(blob, Voice.q, null, null); state.textContent = "";
        } catch (err) { state.textContent = "만들지 못했어요(로컬 목소리 서비스가 꺼져 있거나 설치되지 않았어요)."; }
        b.disabled = false;
      });
    });
  }
  $("#update-btn").addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "확인 중…";
    try {
      const res = await api("/api/update", {});
      toast(res.ok ? `${res.latest}회까지 최신입니다` : "업데이트 실패: " + (res.error || ""));
      await load();
    } catch (err) { toast(err.message); }
    b.disabled = false; b.textContent = "지금 확인";
  });

  // 화면 밝기 (설정 탭: 자동 / 밝게 / 어둡게)
  (function theme() {
    const saved = store.get("theme", ""), sel = $("#set-theme");
    if (saved) document.documentElement.dataset.theme = saved;
    sel.value = saved || "auto";
    sel.addEventListener("change", () => {
      if (sel.value === "auto") { delete document.documentElement.dataset.theme; store.set("theme", ""); }
      else { document.documentElement.dataset.theme = sel.value; store.set("theme", sel.value); }
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
      ${st.updating ? "<br>새 회차 확인 중…" : ""}${st.error ? `<br><span style="color:var(--warn)">업데이트 실패(저장된 자료 사용)</span>` : ""}`;
    $("#set-data-note").textContent = `${S.latest.no}회까지 · 다음 추첨 ${st.next_draw}` + (st.error ? " · 마지막 업데이트 실패(저장된 자료 사용)" : "");
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
  function fillCharModels(ms) {
    const opts = [`<option value="">채팅과 같은 모델</option>`].concat(ms.map((m) => `<option value="${esc(m.id)}">${m.loaded ? "● " : "○ "}${esc(m.id)}</option>`)).join("");
    for (const who of ["lotto", "ppoddo", "kkom"]) {
      const sel = $("#set-model-" + who); if (!sel) continue;
      sel.innerHTML = opts;
      let saved = store.get("model_" + who, "");
      // 2026-10-21: 셋 다 같은 모델(채팅 모델)로 통일 — 예전에 자동으로 저장된 e2b 선택은 한 번만 비운다(내려 둔 모델을 다시 불러오지 않게)
      if (store.get("models_v2", "") !== "1" && /gemma-4-e2b/.test(saved)) { saved = ""; store.set("model_" + who, ""); }
      sel.value = ms.some((m) => m.id === saved) ? saved : "";
      sel.onchange = () => store.set("model_" + who, sel.value);
    }
    store.set("models_v2", "1");
  }
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
      fillCharModels(ms);
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
      chat.history.forEach((m) => addMsg(m.role === "user" ? "user" : "bot", m.content, m.cards, m.mood, m.who));
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
  $("#chat-log").addEventListener("click", (e) => { const c = e.target.closest(".chips-welcome .chip:not(.chip-toggle)"); if (c) send(c.textContent); });
  function showWelcomeChips() {
    const box = document.createElement("div"); box.className = "chips chips-welcome";
    $$("#chips .chip").forEach((c) => box.appendChild(c.cloneNode(true)));
    if (window.innerWidth <= 820 && box.children.length > 3) {         // 휴대폰: 처음 3개만 보이고 나머지는 눌러서 펼친다
      const more = [...box.children].slice(3); more.forEach((c) => { c.classList.add("chip-more"); c.hidden = true; });
      const b = document.createElement("button"); b.className = "chip chip-toggle"; b.textContent = `더 보기 ▾ (${more.length})`;
      b.addEventListener("click", (e) => { e.stopPropagation(); const open = more[0].hidden; more.forEach((c) => { c.hidden = !open; }); b.textContent = open ? "접기 ▴" : `더 보기 ▾ (${more.length})`; });
      box.appendChild(b);
    }
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
          <span class="lbl">${c["글자"] || String.fromCharCode(65 + i)}</span>${balls(c["번호"], null, "sm")}
          <span class="small muted">인기도 ${c["인기도"]} · 1,000원당 ${c["1000원당 기대 환급"]}원 · 1등 세후 ${won(c["세후"])}</span>
          ${addBtn([c["번호"]], "담기")}</div>`).join("")}
        <div class="tcard-f"><span class="small muted">평균 조합: 1,000원당 ${avg["1000원당 기대 환급"] ?? "-"}원 · 1등 세후 ${avg["세후"] ? won(avg["세후"]) : "-"}</span>
          ${addBtn(games, `${games.length}게임 모두 담기`)}</div></div>`;
    }
    if (name === "research_report" && r.rows) {
      const badge = { none: "구별 안 됨", weak: "우연일 수 있음", sig: "차이 있음" }[r.vkey] || "";
      return `<div class="tcard rep">
        <div class="tcard-h">연구 결과 보고서 <span class="muted small">· 로또·뽀또·꼼꼼이 회의</span></div>
        <div class="rep-title">${esc(r.title)}</div>
        <div class="small muted">가설: ${esc(r.hypothesis)} · 검정: ${esc(r.test)}</div>
        ${r.rows.map(([k, v]) => `<div class="rep-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
        <div class="rep-verdict ${esc(r.vkey)}"><b>${esc(badge)}</b> ${esc(r.verdict)} · p = ${r.p}</div>
        <ul class="rep-cav">${r.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
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
  function roamSize() {
    const small = window.innerWidth < 600; Roam.small = small; Roam.W = small ? 100 : 150; Roam.H = small ? 115 : 172;
    for (const id of ["#lotto-roam", "#lotto-roam2", "#lotto-roam3"]) { const e = $(id); if (e) { e.style.width = Roam.W + "px"; e.style.height = Roam.H + "px"; } }
  }
  function roamBounds() {
    return { maxX: Math.max(9, innerWidth - Roam.W - 8), minY: Roam.small ? 66 : 56, maxY: Math.max(67, innerHeight - Roam.H - 8 - (Roam.small ? 74 : 0)) };
  }
  const Roam = { on: false, small: false, x: 0, y: 0, W: 150, H: 172, timer: 0, say: 0, talking: false, snd: true, ask: false };
  function roamSay(text, ms, keep) {
    const el = $("#roam-say"); if (!el || !Roam.on || !text) return;
    const top = $("#roam-top"); top.className = "roam-top" + (Roam.small ? (Roam.x + Roam.W / 2 < innerWidth / 2 ? " left" : " right") : Roam.x < 140 ? " left" : Roam.x > innerWidth - 320 ? " right" : "") + (Roam.y < (Roam.small ? 100 : 130) ? " below" : "");
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
  // 뽀또 같은 다른 캐릭터의 한마디(답변 읽기 중이 아닐 때만)
  function speakLine(text, voiceId, pet) {
    if (!Voice.on || Voice.mode !== 3 || Voice.audio) return;
    ttsFetch(text, voiceId).then((blob) => { if (Voice.audio) return; const my = Voice.q; return playBlob(blob, my, () => pet && pet.talk(true), () => { pet && pet.talk(false); Voice.audio = null; }); }).catch(() => {});
  }
  function speakAnswer(text, who) {
    who = whoOf(who);
    if (!Voice.on) return;
    const v = Voice.mode === 3 ? pickVoice(1) : (Voice.voice || (Voice.voice = pickVoice()));
    if (!v && Voice.mode !== 3) return;
    const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*#>`|_~]/g, " ").replace(/\p{Extended_Pictographic}/gu, " ").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const parts = (clean.slice(0, 700).match(/[^.!?。\n]+[.!?。]?/g) || [clean]).map((s) => s.trim()).filter(Boolean);
    const my = ++Voice.q; let i = 0;
    if (Voice.mode === 3) {
      speakRemote(parts, my, who).catch(() => { if (my !== Voice.q) return; talkAs(who, false); toast("로컬 AI 목소리를 만들지 못했어요(목소리 서비스가 꺼져 있을 수 있어요)"); });
      return;
    }
    const next = () => {
      if (my !== Voice.q) return;
      if (i >= parts.length) { talkAs(who, false); return; }
      const u = new SpeechSynthesisUtterance(parts[i++]); u.voice = v; u.lang = v.lang; u.rate = 1.12; u.pitch = WHO[who].pitch;
      u.onstart = () => { if (my === Voice.q) talkAs(who, true); };
      u.onend = next; u.onerror = () => { if (my === Voice.q) talkAs(who, false); };
      speechSynthesis.speak(u);
    };
    next();
  }
  // 채팅에서 말하는 캐릭터: 이름·부제·아바타 사진·목소리·기기 목소리 높이
  const WHO = {
    lotto: { name: "로또", sub: "공 박사", snaps: () => Pet.snaps, pitch: 1.55 },
    ppoddo: { name: "뽀또", sub: "로또의 여자친구", snaps: () => Pet.snapsGirl || Pet.snaps, pitch: 1.85 },
    kkom: { name: "꼼꼼이", sub: "검산 담당", snaps: () => Pet.snapsKkom || Pet.snaps, pitch: 1.2 },
  };
  const whoOf = (w) => WHO[w] ? w : "lotto";
  // ---- 위쪽 카드 띠(전광판): 같은 카드 묶음을 두 번 이어 붙여 끊김 없이 -50% 만큼 흘린다
  function buildMarquee() {
    const track = $("#marquee-track"); if (!track) return;
    const set = [["lotto", "happy", "공 박사"], ["ppoddo", "wink", "로또의 여자친구"], ["kkom", "normal", "검산 담당"]];
    const card = ([who, mood, sub]) => `<div class="mq-card ${who}"><span class="mq-av">${avatarImg(mood, who)}</span><span class="mq-txt"><b>로또 확률 연구소</b><span>${WHO[who].name} · ${sub}</span></span></div>`;
    const half = Array.from({ length: 3 }, () => set.map(card).join("")).join("");           // 한쪽 9장(약 2,300px)
    track.innerHTML = half + half;
    const w = track.scrollWidth / 2 || 2300;
    track.style.setProperty("--mq-dur", Math.round(w / 55) + "s");                          // 초당 약 55px
  }
  function avatarImg(mood, who) { const sn = WHO[whoOf(who)].snaps(); return sn ? `<img alt="${WHO[whoOf(who)].name}" src="${sn[mood] || sn.normal}">` : "🎱"; }
  function avatar(mood, who) { return `<span class="av" data-mood="${mood}" data-who="${whoOf(who)}">${avatarImg(mood, who)}</span>`; }
  function paintAvatars() {
    if (!Pet.snaps) return;
    $$(".av").forEach((a) => { a.innerHTML = avatarImg(a.dataset.mood, a.dataset.who); });
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
    try { Pet.snapsGirl = window.Lotto3D.snapshots(180, 0.22, null, "bust", "girl"); Pet.snapsKkom = window.Lotto3D.snapshots(180, 0.22, null, "bust", "kkom"); } catch (e) { /* 로또 사진으로 대신 */ }
    buildMarquee();
    paintAvatars();
    try {
      const tap = (p) => () => { if (!p()) return; Math.random() < 0.5 ? p().hop() : p().wave(); };
      Pet.machine = window.Lotto3D.mount($("#lotto-pet"), { onTap: tap(() => Pet.machine) });
      Pet.chat = window.Lotto3D.mount($("#lotto-chat"), { onTap: tap(() => Pet.chat) });
      Pet.big = window.Lotto3D.mount($("#lotto-big"), { onTap: tap(() => Pet.big) });
      const m0 = Pet.machine, fwd = (f) => (...a) => { m0[f](...a); if (Roam.on && Pet.roam && f !== "sleep") Pet.roam[f](...a); };
      Pet.machine = m0 && { setMood: fwd("setMood"), hop: fwd("hop"), sleep: fwd("sleep"), get mood() { return m0.mood; } };
      setRoam(store.get("roam", !matchMedia("(prefers-reduced-motion: reduce)").matches ? "1" : "0") === "1");
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
  // ---- 셋이 각자 따로 돌아다닌다(같은 방식: 통통 뛰기·아장아장·쉬기, 서로 너무 붙지 않게). 회의가 시작되면 한곳에 모였다가 끝나면 흩어진다.
  const WALK = {
    lotto: { pet: () => Pet.roam, st: () => Roam, el: "#lotto-roam", body: "#roam-body", soft: false },
    girl: { pet: () => Pet.girl, st: () => Girl, el: "#lotto-roam2", body: "#roam2-body", soft: true },
    kkom: { pet: () => Pet.kkom, st: () => Kkom, el: "#lotto-roam3", body: "#roam3-body", soft: true },
  };
  const Gather = { on: false, spots: null };
  const wstate = (st) => st.w || (st.w = { mode: "hop", t: 0, dur: 0, fx: 0, fy: 0, tx: 0, ty: 0, h: 0, heading: Math.random() * 6.28, left: 0, rest: rnd(0.4, 2.5), dir: 1, arrived: false });
  const walkerOn = (k) => { const W = WALK[k], el = $(W.el); return !!(W.pet() && el && !el.hidden); };
  function othersNear(name, x, y, r) {
    return Object.keys(WALK).some((k) => k !== name && walkerOn(k) && Math.hypot(WALK[k].st().x - x, WALK[k].st().y - y) < r);
  }
  function startHop(name) {
    const W = WALK[name], st = W.st(), w = wstate(st), pet = W.pet();
    const { maxX, maxY, minY } = roamBounds(), K = Roam.W / 150;
    const wd = w.mode === "waddle", leap = !wd && Math.random() < 0.15, dist = K * (wd ? rnd(140, 300) : leap ? rnd(260, 400) : rnd(80, 170));
    let tx = st.x, ty = st.y, ok = false;
    for (let i = 0; i < 14 && !ok; i++) {
      const hd = w.heading + (i < 5 ? rnd(-(wd ? 0.7 : 1.1), wd ? 0.7 : 1.1) : rnd(-3.14, 3.14));
      tx = st.x + Math.cos(hd) * dist; ty = st.y + Math.sin(hd) * dist * 0.75;
      if (tx >= 8 && tx <= maxX && ty >= minY && ty <= maxY && !othersNear(name, tx, ty, Roam.W * 0.9)) { ok = true; w.heading = hd; }
    }
    if (!ok) { tx = Math.max(8, Math.min(maxX, tx)); ty = Math.max(minY, Math.min(maxY, ty)); w.heading = Math.atan2(ty - st.y + (innerHeight / 2 - ty) * 0.2, tx - st.x + (innerWidth / 2 - tx) * 0.2); }
    w.fx = st.x; w.fy = st.y; w.tx = tx; w.ty = ty; w.t = 0;
    const d = Math.hypot(tx - w.fx, ty - w.fy);
    w.dur = wd ? d / (85 * K) : 0.34 + d / (650 * K); w.h = wd ? 0 : ((leap ? 90 : 28) + d * 0.22 + rnd(0, 14)) * Math.max(0.6, K);
    w.dir = tx >= w.fx ? 1 : -1;
    pet.walk(true, w.dir, w.mode);
  }
  function stepWalker(name, dt, ts) {
    if (!walkerOn(name)) return;
    const W = WALK[name], st = W.st(), pet = W.pet(), el = $(W.el), body = $(W.body), w = wstate(st), K = Roam.W / 150;
    if (w.dur > 0) {                                       // 뛰거나 걷는 중
      w.t += dt; const k = Math.min(1, w.t / w.dur);
      const x = w.fx + (w.tx - w.fx) * k, gy = w.fy + (w.ty - w.fy) * k, wd = w.mode === "waddle";
      st.x = x; st.y = gy;
      el.style.transform = `translate(${x.toFixed(1)}px,${(gy - (wd ? Math.abs(Math.sin(w.t * 7)) * 4 : Math.sin(k * Math.PI) * w.h)).toFixed(1)}px)`;
      body.style.transform = wd ? "" : k < 0.14 ? "scale(.93,1.09)" : "";
      if (k >= 1) {                                        // 착지: 찌그러졌다 펴지고 "통"
        w.dur = 0; if (!wd) { popSound(x, W.soft); body.style.transform = "scale(1.13,.87)"; setTimeout(() => { body.style.transform = ""; }, 110); }
        if (--w.left <= 0) { pet.walk(false); w.rest = rnd(0.8, 3.6); if (!Gather.on && Math.random() < 0.5) pet.act(["wave", "hatTip", "wiggle", "twirl", "look"][Math.floor(Math.random() * 5)]); }
        else w.rest = rnd(0.02, 0.12);
      }
      return;
    }
    if (Gather.on && Gather.spots && Gather.spots[name]) {   // 회의: 자기 자리로 아장아장 걸어가서 선다
      const sp = Gather.spots[name], dx = sp.x - st.x, dy = sp.y - st.y, d = Math.hypot(dx, dy);
      if (d < 3) { if (!w.arrived) { w.arrived = true; pet.walk(false); st.x = sp.x; st.y = sp.y; el.style.transform = `translate(${sp.x.toFixed(1)}px,${sp.y.toFixed(1)}px)`; } return; }
      w.arrived = false;
      if (Math.abs(dx) > 6) w.dir = dx > 0 ? 1 : -1;
      pet.walk(true, w.dir, "waddle");
      const step = Math.min(d, (d > 260 ? 260 : 150) * K * dt);
      st.x += dx / d * step; st.y += dy / d * step;
      el.style.transform = `translate(${st.x.toFixed(1)}px,${(st.y - Math.abs(Math.sin(ts * 0.007)) * 4).toFixed(1)}px)`;
      return;
    }
    if (W.idle) W.idle(ts);                                  // 뽀또·꼼꼼이: 가끔 표정·혼잣말
    if (Roam.talking || Roam.ask || chat.busy) return;       // 말하는 중·질문 입력 중·생각 중에는 서서 기다린다
    w.rest -= dt;
    if (w.rest <= 0) {
      if (w.left <= 0) { w.mode = Math.random() < 0.45 ? "waddle" : "hop"; w.left = w.mode === "waddle" ? 2 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 6); }
      startHop(name);
    }
  }
  // 회의 자리: 화면 아래쪽 가운데에 나란히(뽀또 · 로또 · 꼼꼼이). AI 상담 화면(넓은 화면)에서는 입력줄 위로.
  // 회의 자리: 대화 내용을 가리지 않게 대화창 오른쪽 빈 공간에 모인다.
  //  · 빈 공간이 셋이 나란히 설 만큼 넓으면 가로로(뽀또 · 로또 · 꼼꼼이), 한 명 폭만 있으면 세로로 줄 서기
  //  · 빈 공간이 없으면(휴대폰 등) 예전처럼 입력줄 위 가운데
  function gatherStart() {
    if (!Roam.on) return;
    const { maxX, maxY, minY } = roamBounds(), W = Roam.W, H = Roam.H;
    const names = ["girl", "lotto", "kkom"].filter(walkerOn), n = names.length;
    const log = $("#chat-log");
    let r = log && log.offsetParent ? log.getBoundingClientRect() : null;
    if (r && !Roam.small && innerWidth - r.right - 12 < W + 8) {               // 오른쪽 여백이 좁으면 대화창을 한 칸 줄여서 자리를 만든다
      document.body.classList.add("meeting-side"); r = log.getBoundingClientRect();
    }
    const free = r ? innerWidth - r.right - 12 : 0;
    const spots = [];
    if (r && !Roam.small && free >= n * W * 1.02 + 16) {                       // 오른쪽에 가로로
      const cx = r.right + 12 + free / 2 - W / 2, y = Math.max(minY, Math.min(maxY, r.top + r.height * 0.5 - H / 2));
      names.forEach((_, i) => spots.push({ x: cx + (i - (n - 1) / 2) * W * 1.02, y }));
    } else if (r && !Roam.small && free >= W + 8) {                              // 오른쪽에 세로로
      const x = Math.min(maxX, r.right + 12 + (free - W) / 2), y0 = Math.max(minY, Math.min(maxY - (n - 1) * H * 0.8, r.top + r.height / 2 - (n * H * 0.8) / 2));
      names.forEach((_, i) => spots.push({ x, y: y0 + i * H * 0.8 }));
    } else {                                                                     // 공간이 없으면 입력줄 위 가운데
      const cx = Math.max(8, Math.min(maxX, innerWidth / 2 - W / 2));
      const y = Math.max(minY, maxY - (document.body.classList.contains("ai-mode") && !Roam.small ? 80 : 0));
      names.forEach((_, i) => spots.push({ x: cx + (i - (n - 1) / 2) * W * 1.02, y }));
    }
    Gather.spots = {};
    names.forEach((k, i) => { Gather.spots[k] = { x: Math.max(8, Math.min(maxX, spots[i].x)), y: Math.max(minY, Math.min(maxY, spots[i].y)) }; wstate(WALK[k].st()).arrived = false; });
    Gather.on = true;
  }
  function gatherEnd() {
    Gather.on = false; Gather.spots = null; document.body.classList.remove("meeting-side");
    for (const k in WALK) { const w = wstate(WALK[k].st()); w.rest = rnd(0.6, 3); w.left = 0; w.arrived = false; }
  }
  const gatherReady = () => !Gather.on || Object.keys(Gather.spots || {}).every((k) => !walkerOn(k) || wstate(WALK[k].st()).arrived);
  function roamLoop(ts) {
    Hop.raf = 0; if (!Roam.on || !Pet.roam) return;
    Hop.raf = requestAnimationFrame(roamLoop);
    const dt = Hop.last ? Math.min(0.05, (ts - Hop.last) / 1000) : 0; Hop.last = ts;
    if (document.hidden) return;
    for (const k of ["lotto", "girl", "kkom"]) stepWalker(k, dt, ts);
  }
  // 로또를 클릭하면 말 걸기 입력줄이 열린다 → 질문은 AI 상담과 같은 길로 가고, 답은 말풍선에 실시간으로 나온다
  function openAsk(on, who) {
    who = whoOf(who); const f = $("#roam-ask"); f.hidden = !on; Roam.ask = on;
    if (on) {
      Roam.askWho = who;
      const top = $(who === "ppoddo" ? "#roam2-top" : who === "kkom" ? "#roam3-top" : "#roam-top"); if (f.parentElement !== top) top.appendChild(f);
      $("#roam-q").placeholder = `${WHO[who].name}에게 말 걸기…`;
      const hi = { lotto: "네, 대장님! 무엇이 궁금하세요?", ppoddo: "네, 대장님~ 뭐든 물어보세요!", kkom: "네, 대장님. 무엇을 확인해 드릴까요?" }[who];
      if (who === "lotto") roamSay(hi, 5000); else if (who === "ppoddo") girlSay(hi, 5000, true); else kkomSay(hi, 5000, true);
      setTimeout(() => $("#roam-q").focus(), 30);
    } else $("#roam-q").blur();
  }
  $("#roam-ask").addEventListener("submit", (e) => {
    e.preventDefault(); const q = $("#roam-q").value.trim(); if (!q) return;
    $("#roam-q").value = ""; const w = Roam.askWho; openAsk(false); send(q, w);
  });
  $("#roam-q").addEventListener("keydown", (e) => { if (e.key === "Escape") openAsk(false); });
  // ---- 뽀또: 로또의 여자친구. 로또 곁을 따라다니고(멀면 뛰어서, 가까우면 아장아장) 가끔 말을 건다
  const Girl = { on: true, x: 0, y: 0, sp: 0, dir: 1, side: 0, run: false, moving: false, placed: false, say: 0, nextSay: 0, nextMood: 0, moodT: 0 };
  const GIRL_LINES = ["대장님, 오늘도 화이팅이에요!", "로또야, 같이 가요~", "번호는 재미로만 즐겨요, 대장님!", "저도 통계는 좀 알아요, 헤헤.", "로또는 제가 지켜요!", "대장님, 물 한 잔 드세요~"];
  function girlSay(text, ms, quiet) {
    const el = $("#roam2-say"); if (!el || !text) return;
    $("#roam2-top").className = "roam-top" + (Roam.small ? (Girl.x + Roam.W / 2 < innerWidth / 2 ? " left" : " right") : Girl.x < 140 ? " left" : Girl.x > innerWidth - 320 ? " right" : "") + (Girl.y < (Roam.small ? 100 : 130) ? " below" : "");
    el.className = "roam-say"; void el.offsetHeight; el.classList.add("show"); el.textContent = text;
    clearTimeout(Girl.say); Girl.say = setTimeout(() => el.classList.remove("show"), ms || 4200);
    if (quiet) return;
    speakLine(text, "ppoddo", Pet.girl);
    girlMood(Math.random() < 0.5 ? "happy" : "wink", Math.min(4200, (ms || 4200)));
    if (Pet.girl && !(Voice.on && Voice.mode === 3)) { Pet.girl.talk(true); setTimeout(() => Pet.girl && Pet.girl.talk(false), Math.min(3200, 600 + text.length * 120)); }
  }
  function girlMood(m, back) {
    if (!Pet.girl) return; Pet.girl.setMood(m); clearTimeout(Girl.moodT);
    if (back) Girl.moodT = setTimeout(() => { if (Pet.girl && Pet.girl.mood === m) Pet.girl.setMood("normal"); }, back);
  }
  function setGirl(on) {
    Girl.on = on; store.set("girl", on ? "1" : "0");
    $("#girl-btn").checked = on;
    const el = $("#lotto-roam2"); el.hidden = !(on && Roam.on);
    if (el.hidden) { Pet.girl && Pet.girl.walk(false); return; }
    if (!Pet.girl && window.Lotto3D && window.Lotto3D.ok) {
      Pet.girl = window.Lotto3D.mount($("#roam2-body"), { variant: "girl", onTap: () => { if (!Pet.girl) return; Math.random() < 0.5 ? Pet.girl.hop() : Pet.girl.wave(); popSound(Girl.x, true); openAsk(!$("#roam-ask").hidden && Roam.askWho === "ppoddo" ? false : true, "ppoddo"); } });
    }
    if (!Pet.girl) { el.hidden = true; return; }
    Pet.girl.onStep(() => { if (wstate(Girl).mode === "waddle" || Gather.on) popSound(Girl.x, true); });
    if (!Girl.placed) { Girl.x = Math.max(8, Math.min(innerWidth - Roam.W - 8, Roam.x - 140 * (Roam.W / 150))); Girl.y = Roam.y; Girl.placed = true; el.style.transform = `translate(${Girl.x}px,${Girl.y}px)`; }
    Girl.nextSay = performance.now() + 3500; setTimeout(() => girlSay("대장님, 안녕하세요~! 저는 뽀또예요."), 400);
  }
  $("#girl-btn").addEventListener("change", (e) => setGirl(e.target.checked));
  // ---- 꼼꼼이: 회계사·검증 담당. 로또 곁(뽀또의 반대편)을 따라다니고(멀면 뛰어서, 가까우면 아장아장) 가끔 말을 건다
  const Kkom = { on: true, x: 0, y: 0, sp: 0, dir: 1, side: 0, run: false, moving: false, placed: false, say: 0, nextSay: 0, nextMood: 0, moodT: 0 };
  const KKOM_LINES = ["예산 한도는 정해 두셨나요, 대장님?", "확률은 모든 조합이 같습니다.", "1,000원당 평균 약 500원이 돌아옵니다. 재미로만 즐겨 주세요.", "숫자는 제가 다시 확인하겠습니다.", "무리하지 마세요, 대장님."];
  function kkomSay(text, ms, quiet) {
    const el = $("#roam3-say"); if (!el || !text) return;
    $("#roam3-top").className = "roam-top" + (Roam.small ? (Kkom.x + Roam.W / 2 < innerWidth / 2 ? " left" : " right") : Kkom.x < 140 ? " left" : Kkom.x > innerWidth - 320 ? " right" : "") + (Kkom.y < (Roam.small ? 100 : 130) ? " below" : "");
    el.className = "roam-say"; void el.offsetHeight; el.classList.add("show"); el.textContent = text;
    clearTimeout(Kkom.say); Kkom.say = setTimeout(() => el.classList.remove("show"), ms || 4200);
    if (quiet) return;
    speakLine(text, "kkom", Pet.kkom);
    kkomMood("firm", Math.min(3200, (ms || 4200)));
    if (Pet.kkom && !(Voice.on && Voice.mode === 3)) { Pet.kkom.talk(true); setTimeout(() => Pet.kkom && Pet.kkom.talk(false), Math.min(3200, 600 + text.length * 120)); }
  }
  function kkomMood(m, back) {
    if (!Pet.kkom) return; Pet.kkom.setMood(m); clearTimeout(Kkom.moodT);
    if (back) Kkom.moodT = setTimeout(() => { if (Pet.kkom && Pet.kkom.mood === m) Pet.kkom.setMood("normal"); }, back);
  }
  function setKkom(on) {
    Kkom.on = on; store.set("kkom", on ? "1" : "0");
    $("#kkom-btn").checked = on;
    const el = $("#lotto-roam3"); el.hidden = !(on && Roam.on);
    if (el.hidden) { Pet.kkom && Pet.kkom.walk(false); return; }
    if (!Pet.kkom && window.Lotto3D && window.Lotto3D.ok) {
      Pet.kkom = window.Lotto3D.mount($("#roam3-body"), { variant: "kkom", onTap: () => { if (!Pet.kkom) return; Math.random() < 0.5 ? Pet.kkom.hop() : Pet.kkom.wave(); popSound(Kkom.x, true); openAsk(!$("#roam-ask").hidden && Roam.askWho === "kkom" ? false : true, "kkom"); } });
    }
    if (!Pet.kkom) { el.hidden = true; return; }
    Pet.kkom.onStep(() => { if (wstate(Kkom).mode === "waddle" || Gather.on) popSound(Kkom.x, true); });
    if (!Kkom.placed) { Kkom.x = Math.max(8, Math.min(innerWidth - Roam.W - 8, Roam.x + 140 * (Roam.W / 150))); Kkom.y = Roam.y; Kkom.placed = true; el.style.transform = `translate(${Kkom.x}px,${Kkom.y}px)`; }
    Kkom.nextSay = performance.now() + 9000; setTimeout(() => kkomSay("안녕하세요, 대장님. 검산 담당 꼼꼼이입니다."), 400);
  }
  $("#kkom-btn").addEventListener("change", (e) => setKkom(e.target.checked));
  // ---- 휴대폰으로 보기: 접속 주소와 QR(Tailscale 이 있으면 먼저, 같은 와이파이는 그다음)
  async function openPhone() {
    const m = $("#phone-modal"), body = $("#phone-body"); m.hidden = false;
    body.innerHTML = "<p class='muted small'>주소를 확인하는 중…</p>";
    let net; try { net = await (await fetch("/api/network")).json(); } catch (e) { body.innerHTML = "<p>주소를 가져오지 못했어요.</p>"; return; }
    const tail = net.ips.filter((x) => x.kind === "tailscale"), wifi = net.ips.filter((x) => x.kind === "wifi");
    let html = "";
    if (!net.lan) html += `<div class="phone-note warn"><b>지금은 이 PC 에서만 열려 있어요.</b> 바탕화면 로또 아이콘으로 <b>서버를 껐다가 다시 켜면</b> 휴대폰에서도 열려요. (새 아이콘은 휴대폰 접속을 허용하도록 바꿔 두었어요. 처음 켤 때 윈도우가 방화벽 허용을 물으면 "허용"을 눌러 주세요.)</div>`;
    const item = (x, label, hint) => { const u = `http://${x.ip}:${net.port}`; return `<div class="phone-item"><div class="qr" data-qr="${u}"></div><div><b>${label}</b><code>${u}</code><span class="muted small">${hint}</span></div></div>`; };
    html += tail.map((x) => item(x, "Tailscale 주소 (집 밖에서도 됨)", "휴대폰에서 Tailscale 앱이 켜져 있어야 해요.")).join("");
    html += wifi.map((x) => item(x, "같은 와이파이 주소 (집에서만)", "휴대폰이 이 PC 와 같은 와이파이에 연결돼 있어야 해요.")).join("");
    if (!tail.length) html += `<div class="phone-note"><b>집 밖에서도 쓰려면 Tailscale (무료)</b><ol><li>이 PC 에 Tailscale 설치 후 로그인</li><li>휴대폰에 Tailscale 앱 설치, <b>같은 계정</b>으로 로그인</li><li>이 창을 다시 열면 Tailscale 주소가 나와요</li></ol></div>`;
    html += `<div class="phone-note">휴대폰 브라우저의 <b>"홈 화면에 추가"</b>를 누르면 앱처럼 아이콘으로 열 수 있어요.</div>`;
    body.innerHTML = html;
    $$("#phone-body .qr").forEach((el) => { try { new window.QRCode(el, { text: el.dataset.qr, width: 148, height: 148, colorDark: "#0f172a", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M }); } catch (e) { el.textContent = "QR 을 못 그렸어요"; } });
  }
  $("#phone-btn").addEventListener("click", openPhone);
  $("#phone-close").addEventListener("click", () => { $("#phone-modal").hidden = true; });
  $("#phone-modal").addEventListener("click", (e) => { if (e.target.id === "phone-modal") $("#phone-modal").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#phone-modal").hidden = true; });
  WALK.girl.idle = (ts) => {
    if (!wstate(Girl).dur && ts > Girl.nextMood) { Girl.nextMood = ts + rnd(7000, 14000); girlMood(Math.random() < 0.5 ? "happy" : "wink", 1900); }
    if (ts > Girl.nextSay) { Girl.nextSay = ts + rnd(25000, 45000); if (!Roam.talking && !Roam.ask) girlSay(GIRL_LINES[Math.floor(Math.random() * GIRL_LINES.length)]); }
  };
  WALK.kkom.idle = (ts) => {
    if (!wstate(Kkom).dur && ts > Kkom.nextMood) { Kkom.nextMood = ts + rnd(9000, 16000); kkomMood(Math.random() < 0.35 ? "happy" : "firm", 1700); }
    if (ts > Kkom.nextSay) { Kkom.nextSay = ts + rnd(40000, 70000); if (!Roam.talking && !Roam.ask) kkomSay(KKOM_LINES[Math.floor(Math.random() * KKOM_LINES.length)]); }
  };
  function setRoam(on) {
    Roam.on = on; store.set("roam", on ? "1" : "0");
    document.body.classList.toggle("roam-on", on && !!Pet.big);
    $("#roam-btn").checked = on;
    roamSize();
    const el = $("#lotto-roam"); el.hidden = !on; cancelAnimationFrame(Hop.raf); Hop.raf = 0; Hop.last = 0; wstate(Roam).dur = 0;
    if (!on) { Pet.roam && Pet.roam.walk(false); setGirl(Girl.on); setKkom(Kkom.on); return; }
    if (!Pet.roam && window.Lotto3D && window.Lotto3D.ok) {
      Pet.roam = window.Lotto3D.mount($("#roam-body"), { onTap: () => { if (!Pet.roam) return; Math.random() < 0.5 ? Pet.roam.hop() : Pet.roam.wave(); popSound(Roam.x); openAsk(!$("#roam-ask").hidden && Roam.askWho === "lotto" ? false : true, "lotto"); } });
    }
    if (!Pet.roam) { Roam.on = false; el.hidden = true; document.body.classList.remove("roam-on"); return; }
    roamPlace(Roam.x || innerWidth - Roam.W - 30, Roam.y || roamBounds().maxY);
    Pet.roam.onStep(() => { if (wstate(Roam).mode === "waddle" || Gather.on) popSound(Roam.x, true); });
    wstate(Roam).left = 0; wstate(Roam).rest = 1.2; Hop.raf = requestAnimationFrame(roamLoop);
    setGirl(Girl.on); setKkom(Kkom.on);
  }
  window.addEventListener("resize", () => { roamSize(); if (Roam.on) { const b = roamBounds(); roamPlace(Math.max(0, Math.min(Roam.x, b.maxX)), Math.max(0, Math.min(Roam.y, b.maxY))); } });
  $("#snd-btn").addEventListener("change", (e) => { Roam.snd = e.target.checked; store.set("snd", Roam.snd ? "1" : "0"); if (Roam.snd) popSound(Roam.x); });
  Girl.on = store.get("girl", "1") === "1"; $("#girl-btn").checked = Girl.on;
  Kkom.on = store.get("kkom", "1") === "1"; $("#kkom-btn").checked = Kkom.on;
  Roam.snd = store.get("snd", "1") === "1"; $("#snd-btn").checked = Roam.snd;
  $("#roam-btn").addEventListener("change", (e) => setRoam(e.target.checked));
  { const mm = $("#mtg-mode"); if (mm) { mm.value = store.get("meeting_mode", "code"); mm.addEventListener("change", () => store.set("meeting_mode", mm.value)); } }
  { const sp = $("#mtg-speed"); if (sp) { sp.value = store.get("mtg_speed", "fast"); sp.addEventListener("change", () => store.set("mtg_speed", sp.value)); } }
  { const on = store.get("marquee", "1") === "1", mq = $("#marquee");
    $("#marquee-on").checked = on; if (mq) mq.hidden = !on; buildMarquee();
    $("#marquee-on").addEventListener("change", (e) => { store.set("marquee", e.target.checked ? "1" : "0"); if (mq) mq.hidden = !e.target.checked; }); }
  // ---- 답변 읽어 주기 켜고 끄기
  const TTS_HINT = { 1: "이 기기에 들어 있는 한국어 목소리예요. 글이 밖으로 나가지 않아요.", 2: "자연스럽지만 읽을 글이 마이크로소프트 서버로 가요.", 3: "이 PC에서 AI 로 만든 캐릭터별 목소리예요. 글이 밖으로 나가지 않아요(문장마다 몇 초 걸려요)." };
  const ttsMethod = () => { const m = Number(store.get("tts_method", "3")); return m === 2 ? 2 : 3; };   // 마지막으로 고른 방식(처음엔 로컬 AI 목소리) — 기기 목소리는 더 이상 고르지 않는다
  function syncTtsUi() {
    const on = $("#tts-on"), sel = $("#tts-select"), hint = $("#tts-hint"), m = Voice.on ? Voice.mode : ttsMethod();
    if (on) on.checked = Voice.on; if (sel) sel.value = String(m);
    if (hint) hint.textContent = (Voice.on ? "" : "지금은 꺼져 있어요. 켜면 ") + (TTS_HINT[m] || "");
  }
  function setTts(mode) {     // 0 끔 · 1 기기 목소리 · 2 자연스러운(인터넷) 목소리 · 3 로컬 AI 목소리
    Voice.on = mode > 0; Voice.mode = mode || 1; Voice.voice = null; store.set("tts", String(mode));
    if (mode) store.set("tts_method", String(mode));
    if (!mode) { stopVoice(); chatTalk(false); }
    syncTtsUi();
  }
  // 켜기: 고른 방식이 이 기기에서 쓸 수 있는지 확인하고, 안 되면 이전 상태로 되돌린다
  async function applyTts(want) {
    const prev = Voice.on ? Voice.mode : 0, hello = "안녕하세요, 대장님. 이제 답변을 읽어 드릴게요.";
    const back = (msg) => { toast(msg); setTts(prev); };
    if (!("speechSynthesis" in window) && want !== 3) return back("이 브라우저는 소리 내어 읽기를 지원하지 않아요");
    if (want === 3) { const st = await fetch("/api/tts/status").then((r) => r.json()).catch(() => ({})); if (!st.installed) return back("이 PC에 로컬 AI 목소리가 설치돼 있지 않아요"); }
    if (want === 2) {
      if (!pickVoice(2)) return back("이 브라우저에는 자연스러운(인터넷) 목소리가 없어요");
      if (!confirm("자연스러운 목소리는 인터넷(마이크로소프트 서버)으로 읽을 글을 보냅니다. 로또 상담 답변만 해당하고 고객 정보는 없습니다.\n그래도 쓸까요?")) return setTts(prev);
    }
    setTts(want); speakAnswer(hello);
  }
  $("#tts-on").addEventListener("change", (e) => { if (e.target.checked) applyTts(ttsMethod()); else setTts(0); });
  $("#tts-select").addEventListener("change", () => {
    const want = Number($("#tts-select").value); store.set("tts_method", String(want));
    if (Voice.on) applyTts(want); else syncTtsUi();                              // 꺼져 있으면 방식만 기억해 둔다
  });
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => { Voice.voice = null; };
  { const m = Number(store.get("tts", "0")); setTimeout(() => setTts(m === 3 || (m === 2 && pickVoice(2)) ? m : 0), 600); }
  window.addEventListener("lotto3d-ready", initPet);
  if (window.Lotto3D) initPet();

  function addMsg(role, content, cards, mood, who) {
    const el = document.createElement("div"), W = WHO[whoOf(who)];
    el.className = "msg " + role + (role !== "user" ? " who-" + whoOf(who) : "");
    if (role === "user") el.textContent = content;
    else el.innerHTML = `<div class="who">${avatar(mood || "normal", who)}<span><b>${W.name}</b><i>· ${W.sub}</i></span></div><div class="body">${md(content)}</div>`;
    if (cards) appendCards(el, cards);
    $("#chat-log").appendChild(el);
    $("#chat-log").scrollTop = 1e9;
    return el;
  }

  // ---------------------------------------------------------------- 로또 ↔ 뽀또 대화 (사실은 코드, 말투는 AI — /api/duo)
  // 회의 줄 하나를 보여 주는 시간(소리가 없을 때 글 속도). 설정 → 회의 속도(빠르게·보통·느리게)
  // ---- 3D 회의실: 모이면 열리고(로밍 캐릭터는 숨김), 한 줄마다 말하는 사람·몸짓·듣는 사람 반응을 보여 주고, 끝나면 닫힌다
  const Room = { api: null, open: false, tm: 0 };
  const WHO_LABEL = { lotto: "로또", ppoddo: "뽀또", kkom: "꼼꼼이" };
  function roomOpen() {
    if (Room.open || !window.Lotto3D || !window.Lotto3D.ok) return;
    const box = $("#meeting-room"); if (!box) return;
    const side = $("#chat-side");   // 큰 화면: 비어 있는 오른쪽 칸(로또 큰 그림 자리)에 회의실을 끼워 넣는다
    if (side && document.body.classList.contains("ai-mode") && window.matchMedia("(min-width:1500px)").matches) { side.prepend(box); box.classList.add("docked"); }
    box.hidden = false; document.body.classList.add("in-room");
    if (!Room.api) Room.api = window.Lotto3D.mountRoom($("#mr-scene"), {});
    if (!Room.api) { box.hidden = true; document.body.classList.remove("in-room"); return; }
    Room.open = true; Room.api.sit(true); Room.api.hideBoard();
  }
  function roomClose() {
    if (!Room.open) return; Room.open = false;
    if (Room.api) { Room.api.speak(null, false); }
    setTimeout(() => { if (Room.open) return; const b = $("#meeting-room"); if (b) { b.hidden = true; if (b.classList.contains("docked")) { b.classList.remove("docked"); document.body.appendChild(b); } } document.body.classList.remove("in-room"); $("#mr-text").textContent = ""; $("#mr-who").textContent = ""; }, 600);
  }
  function roomLine(who, text) {
    if (!Room.open || !Room.api) return; const api = Room.api;
    api.speak(who, true);
    const cap = $("#mr-text"); $("#mr-who").textContent = WHO_LABEL[who] || who; $("#mr-who").className = who;
    cap.className = ""; void cap.offsetWidth; cap.className = "pop"; cap.textContent = text;
    // 말하는 사람의 몸짓: 후보를 말하면 가리키고, 걱정·예산이면 으쓱, 질문이면 손을 들고, 보통은 손짓
    const g = /[A-H]\s*(조합|후보|가|는|를|랑|와|,)|추천|후보/.test(text) ? "point" : /걱정|예산|부담|고민/.test(text) ? "shrug" : /[?？]/.test(text) ? "talk" : (Math.random() < 0.7 ? "talk" : "nod");
    roomKinetic(text, who);
    api.gesture(who, g); api.setMood(who, /[?？]/.test(text) ? "think" : /재미|좋|예쁘|끌/.test(text) ? "happy" : "normal");
    // 듣는 사람 반응: 끄덕이거나(가끔) 안경을 벗어 닦는다(로또·꼼꼼이)
    ["lotto", "ppoddo", "kkom"].filter((k) => k !== who).forEach((k, i) => {
      setTimeout(() => { if (!Room.open) return; const r = Math.random(); api.gesture(k, r < 0.45 ? "nod" : (k !== "ppoddo" && r < 0.62 ? "glasses" : (r < 0.75 ? "think" : "nod"))); }, 700 + i * 500);
    });
  }
  // 튀어나오는 글자: 줄에서 핵심(숫자·돈·후보·확률)을 골라 크게 띄웠다 사라지게 한다
  const KIN_RE = /(\d[\d,.]*\s*(?:원|명|%|게임|개)|인기도\s*[\d.]+|[pP]\s*값\s*[\d.]+|1\/8,145,060|[A-H]\s*조합|재미로만|예산(?:\s*한도)?|평균보다\s*낮아[^,.!?]{0,6}|확률[은는]?\s*(?:모두\s*)?(?:똑같|같)\S*)/g;
  function roomKinetic(text, who, forced) {
    const box = $("#mr-kin"); if (!box || !Room.open) return;
    const words = forced ? [forced] : [...new Set((text.match(KIN_RE) || []).map((x) => x.replace(/\s+/g, " ").trim()))].slice(0, 2);
    words.forEach((wd, i) => setTimeout(() => {
      if (!Room.open) return;
      const el = document.createElement("span"); el.className = "kin " + (forced ? "final" : who); el.textContent = wd;
      el.style.left = (8 + Math.random() * 46) + "%"; el.style.top = (6 + Math.random() * 28) + "%";
      el.addEventListener("animationend", () => el.remove()); box.appendChild(el);
    }, i * 380));
  }
  function roomEnd(who) { if (Room.open && Room.api) Room.api.speak(who, false); }
  const MTG_SPEED = { fast: [1100, 48], normal: [2000, 80], slow: [3000, 110] };
  const lineMs = (text, spoken) => { const [mn, per] = MTG_SPEED[store.get("mtg_speed", "fast")] || MTG_SPEED.fast; return Math.max(spoken ? mn * 0.8 : mn, text.length * per); };
  const plainSpeech = (t) => t.replace(/\p{Extended_Pictographic}/gu, " ").replace(/\s+/g, " ").trim();
  // 회의 한 줄 읽기. audioP = 미리 만들어 둔 소리(줄이 도착하자마자 만들기 시작). 소리가 8초 안에 안 오면 소리 없이 글 속도로 넘어가서 대화가 멈추지 않게 한다.
  function duoVoice(text, who, my, pet, audioP) {
    return new Promise((done) => {
      const fin = () => { if (pet) pet.talk(false); done(); };
      const wait = lineMs(text, true);
      const plain = plainSpeech(text);
      if (Voice.on && Voice.mode === 3) {
        const limit = new Promise((ok) => setTimeout(() => ok(null), 8000));
        Promise.race([audioP || ttsFetch(plain, who).catch(() => null), limit]).then((blob) => {
          if (my !== Voice.q) return done();
          if (!blob) { if (pet) pet.talk(true); return setTimeout(fin, wait); }
          return playBlob(blob, my, () => pet && pet.talk(true), fin);
        });
      } else if (Voice.on && "speechSynthesis" in window && pickVoice()) {
        const v = pickVoice(), u = new SpeechSynthesisUtterance(plain); u.voice = v; u.lang = v.lang; u.rate = 1.1; u.pitch = who === "lotto" ? 1.3 : 1.8;
        u.onstart = () => pet && pet.talk(true); u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
      } else { if (pet) pet.talk(true); setTimeout(fin, wait); }
    });
  }
  async function runDuoClassic(text, reuse) {
    $("#chat-text").value = ""; $("#chat-text").style.height = "auto";
    if (!reuse) addMsg("user", text);
    const el = reuse ? reuse.el : addMsg("bot", "", null, "think"), body = $(".body", el);
    body.innerHTML = `<span class="typing">로또와 뽀또가 상의 중…</span>`;
    chat.busy = true; $("#chat-send").textContent = "중지"; chatMood("think");
    let j;
    try {
      const r = await fetch("/api/duo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base: lmsBase(), model: $("#lms-model").value }) });
      j = await r.json(); if (!r.ok || !j.lines) throw new Error(j.error || `오류 ${r.status}`);
    } catch (e) {
      chat.busy = false; $("#chat-send").textContent = "보내기"; chatMood("worry");
      body.innerHTML = `⚠️ 대화를 만들지 못했어요: ${esc(e.message)}`; return;
    }
    body.innerHTML = `<div class="duo">${j.lines.map((l) => `<div class="duo-line ${l.who}" hidden><b>${l.who === "lotto" ? "로또" : "뽀또"}</b><span>${esc(l.text)}</span></div>`).join("")}</div>`;
    chat.busy = false; $("#chat-send").textContent = "보내기";
    const rows = $$(".duo-line", body), my = ++Voice.q;
    const showGirl = Roam.on && Girl.on && Pet.girl && !$("#lotto-roam2").hidden, showLotto = Roam.on && Pet.roam;
    Roam.talking = true;                                   // 대화하는 동안 둘 다 멈춰 선다
    for (let i = 0; i < j.lines.length; i++) {
      if (my !== Voice.q) break;
      const l = j.lines[i], isL = l.who === "lotto", pet = isL ? (showLotto ? Pet.roam : null) : (showGirl ? Pet.girl : null);
      rows[i].hidden = false; $("#chat-log").scrollTop = 1e9;
      const ms = lineMs(l.text);
      if (isL) { if (showLotto) roamSay(l.text, ms); } else if (showGirl) { girlSay(l.text, ms, true); girlMood(/[?？]|…/.test(l.text) ? "think" : "happy", 1800); }
      await duoVoice(l.text, l.who, my, pet);
    }
    Roam.talking = false; Pet.roam && Pet.roam.talk(false); Pet.girl && Pet.girl.talk(false);
    if (my !== Voice.q) return;
    appendCards(el, [j.card]); $("#chat-log").scrollTop = 1e9;
    chatMood("wink");
    const transcript = j.lines.map((l) => `${l.who === "lotto" ? "로또" : "뽀또"}: ${l.text}`).join("\n");
    chat.history.push({ role: "user", content: text }, { role: "assistant", content: transcript, cards: [j.card], mood: "wink" });
    store.set("chat", JSON.stringify(chat.history.slice(-20)));
  }

  // ---------------------------------------------------------------- 로또 ↔ 뽀또 회의 (/api/meeting: 한 줄씩, 캐릭터마다 다른 AI)
  const charModel = (who) => store.get("model_" + who, "") || $("#lms-model").value || "";
  function candsCardHTML(items, added) {
    return `<div class="tcard"><div class="tcard-h">${added ? "새 후보" : "코드가 뽑은 후보"} <span class="muted small">· 당첨 확률은 모두 같아요</span></div>
      ${items.map((c) => `<div class="tcard-row"><span class="lbl">${c.letter}</span>${balls(c.nums, null, "sm")}<span class="small muted">인기도 ${c.pop} · 1,000원당 ${c.ev}원</span></div>`).join("")}</div>`;
  }
  async function runDuo(text, mode) {
    $("#chat-text").value = ""; $("#chat-text").style.height = "auto";
    addMsg("user", text);
    const el = addMsg("bot", "", null, "think"), body = $(".body", el);
    body.innerHTML = `<span class="typing">로또와 뽀또가 회의를 시작해요…</span>`;
    chat.busy = true; $("#chat-send").textContent = "중지"; chatMood("think");
    const ctrl = chat.ctrl = new AbortController(), my = ++Voice.q, q = [];
    let wake = null;
    const push = (ev) => {
      if (ev.type === "line" && Voice.on && Voice.mode === 3) ev.audio = ttsFetch(plainSpeech(ev.text), ev.who).catch(() => null);   // 줄이 도착하자마자 소리를 만들기 시작(재생·다음 줄 생성과 겹쳐서)
      q.push(ev); if (wake) { const w = wake; wake = null; w(); }
    };
    (async () => {                                          // 서버가 한 줄씩 보내는 이벤트를 큐에 쌓는다
      try {
        const r = await fetch(mode === "research" ? "/api/research" : "/api/meeting", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
          body: JSON.stringify({ base: lmsBase(), topic: text, mode: mode === "ai" ? "ai" : undefined, cast: ["lotto", "ppoddo"].concat(Kkom.on ? ["kkom"] : []), models: { lotto: charModel("lotto"), ppoddo: charModel("ppoddo"), kkom: charModel("kkom") } }) });
        if (!r.ok || !r.body) throw new Error(r.status === 404 ? "NOAPI" : `오류 ${r.status}`);
        const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            if (chunk.startsWith("data:")) { try { push(JSON.parse(chunk.slice(5))); } catch (e) { /* 깨진 줄은 건너뜀 */ } }
          }
        }
      } catch (e) { if (e.name !== "AbortError") push({ type: "error", message: e.message }); }
      push({ type: "__end" });
    })();
    const duo = document.createElement("div"); duo.className = "duo"; body.innerHTML = ""; body.appendChild(duo);
    const showGirl = Roam.on && Girl.on && Pet.girl && !$("#lotto-roam2").hidden, showLotto = Roam.on && Pet.roam, showKkom = Roam.on && Kkom.on && Pet.kkom && !$("#lotto-roam3").hidden;
    Roam.talking = true;                                   // 회의하는 동안 모두 멈춰 선다
    gatherStart(); let gathered = false;
    const said = []; let card = null, err = "", gotLine = false;
    for (;;) {
      if (!q.length) { await new Promise((r) => { wake = r; }); continue; }
      const ev = q.shift();
      if (ev.type === "__end" || ctrl.signal.aborted || my !== Voice.q) break;
      if (ev.type === "line") {
        if (!gathered) { const t0 = Date.now(); while (!gatherReady() && Date.now() - t0 < 3500) await new Promise((r) => setTimeout(r, 100)); gathered = true; roomOpen(); }
        gotLine = true;
        const isL = ev.who === "lotto", isK = ev.who === "kkom", nm = isL ? "로또" : isK ? "꼼꼼이" : "뽀또";
        const pet = isL ? (showLotto ? Pet.roam : null) : isK ? (showKkom ? Pet.kkom : null) : (showGirl ? Pet.girl : null);
        duo.insertAdjacentHTML("beforeend", `<div class="duo-line ${ev.who}"><b>${nm}</b><span>${esc(ev.text)}</span></div>`);
        $("#chat-log").scrollTop = 1e9;
        const ms = lineMs(ev.text);
        if (isL) { if (showLotto) roamSay(ev.text, ms); }
        else if (isK) { if (showKkom) { kkomSay(ev.text, ms, true); kkomMood("firm", 1800); } }
        else if (showGirl) { girlSay(ev.text, ms, true); girlMood(/[?？]|…/.test(ev.text) ? "think" : "happy", 1800); }
        said.push(`${nm}: ${ev.text}`);
        roomLine(ev.who, ev.text);
        await duoVoice(ev.text, ev.who, my, pet, ev.audio);
        roomEnd(ev.who);
      } else if (ev.type === "cands") {
        duo.insertAdjacentHTML("beforeend", `<div class="duo-card">${candsCardHTML(ev.items, ev.added)}</div>`); $("#chat-log").scrollTop = 1e9;
        if (Room.open) { Room.api.setCands(ev.items, !!ev.added); roomKinetic("", "lotto", ev.added ? "새 후보!" : "후보 " + ev.items.length + "개!"); Room.api.gesture("lotto", "point"); }
      } else if (ev.type === "check") {
        if (Room.open) { Room.api.check(ev.letter, ev.pop, ev.co); roomKinetic("", "lotto", "인기도 " + ev.pop); }
        duo.insertAdjacentHTML("beforeend", `<div class="duo-note">로또가 후보 ${ev.letter}를 검사했어요 · 인기도 ${ev.pop} · 1등 동반 약 ${ev.co}명 · 알려진 인기 모양: ${esc(ev.pattern)}</div>`);
      } else if (ev.type === "ai_picks") {                       // AI 가 코드 없이 직접 고른 번호: 공중 화면 + 카드(검증 안 됨 표시) + 코드 검사는 참고용
        card = ev.card; chatMood("wink");
        duo.insertAdjacentHTML("beforeend", `<div class="duo-note ai-note">AI 셋이 코드 없이 직접 세어서 고른 번호예요(검증 안 됨). 아래 인기도 등은 <b>코드가 나중에 참고용으로 검사</b>한 값이고 번호는 바꾸지 않았어요.</div>`);
        if (Room.open) { Room.api.setCands(ev.items.map((it) => ({ letter: { lotto: "로", ppoddo: "뽀", kkom: "꼼" }[it.who], nums: it.nums })), false); ev.items.forEach((it) => Room.api.check({ lotto: "로", ppoddo: "뽀", kkom: "꼼" }[it.who], it.pop, it.co)); Room.api.picks(ev.items.map((it) => ({ lotto: "로", ppoddo: "뽀", kkom: "꼼" }[it.who]))); roomKinetic("", "lotto", "AI 단독!"); Object.keys(WHO_LABEL).forEach((k) => Room.api.gesture(k, "cheer")); }
      } else if (ev.type === "result") {                       // 로또가 검정을 돌렸다: 공중 화면 그래프 + 튀어나오는 글자
        duo.insertAdjacentHTML("beforeend", `<div class="duo-note">로또가 검정을 돌렸어요 · ${esc(ev.test)} · <b>p = ${ev.p}</b> · ${esc(ev.verdict)}</div>`);
        if (Room.open) { Room.api.setChart(ev.chart, ev.verdict, ev.vkey); roomKinetic("", "lotto", ev.kin); setTimeout(() => roomKinetic("", "kkom", ev.vkey === "none" ? "구별 안 됨" : ev.vkey === "weak" ? "우연일 수도" : "유의!"), 900); Room.api.gesture("lotto", "point"); }
      } else if (ev.type === "report") {
        card = { name: "research_report", result: ev.report }; chatMood("wink");
        if (Room.open) Object.keys(WHO_LABEL).forEach((k) => Room.api.gesture(k, "nod"));
      } else if (ev.type === "research") {
        duo.insertAdjacentHTML("beforeend", `<div class="duo-note">로또가 조사 자료를 찾아봤어요 · ${ev.titles.map(esc).join(", ")}</div>`);
      } else if (ev.type === "picks") {
        card = ev.card; chatMood("wink");
        if (Room.open) { Room.api.picks(ev.picks.map((p) => p.letter)); roomKinetic("", "lotto", "최종 " + ev.picks.map((p) => p.letter).join(" · ") + "!"); Object.keys(WHO_LABEL).forEach((k) => Room.api.gesture(k, "cheer")); }
      } else if (ev.type === "error") { err = ev.message || "알 수 없는 오류"; }
    }
    Roam.talking = false; Pet.roam && Pet.roam.talk(false); Pet.girl && Pet.girl.talk(false); Pet.kkom && Pet.kkom.talk(false);
    roomClose(); setTimeout(gatherEnd, 2500);              // 마무리 인사 뒤 회의실이 닫히고 잠시 뒤 흩어진다
    chat.busy = false; $("#chat-send").textContent = "보내기";
    if (!gotLine && err === "NOAPI" && mode !== "research") return runDuoClassic(text, { el });         // 서버가 옛 버전이면 예전 방식으로
    if (err && err !== "NOAPI") duo.insertAdjacentHTML("beforeend", `<div class="duo-note">회의가 중간에 멈췄어요: ${esc(err)}</div>`);
    if (!gotLine && !err) { body.innerHTML = "회의를 시작하지 못했어요."; chatMood("worry"); return; }
    if (card) appendCards(el, [card]);
    $("#chat-log").scrollTop = 1e9; chatMood(card ? "wink" : "normal");
    chat.history.push({ role: "user", content: text }, { role: "assistant", content: said.join("\n"), cards: card ? [card] : [], mood: "wink" });
    store.set("chat", JSON.stringify(chat.history.slice(-20)));
  }

  function addressee(text) {
    if (/^\s*뽀또|뽀또(야|아)(?![가-힣])/.test(text)) return "ppoddo";
    if (/^\s*꼼꼼|꼼꼼(아|이야)(?![가-힣])/.test(text)) return "kkom";
    return "lotto";
  }
  // 캐릭터별 표정·말하는 입·말풍선
  function moodAs(who, m) {
    if (who === "ppoddo") return Pet.girl ? girlMood(m, m === "think" ? 0 : 2600) : null;
    if (who === "kkom") return Pet.kkom ? kkomMood(m, m === "think" ? 0 : 2600) : null;
    chatMood(m);
  }
  function talkAs(who, on) {
    if (who === "lotto") return chatTalk(on);
    Roam.talking = !!on; const p = who === "ppoddo" ? Pet.girl : Pet.kkom; if (p) p.talk(on);
  }
  function bubbleAs(who, text, ms, keep) {
    if (who === "lotto") return keep ? roamLive(text) : roamSay(text, ms);
    const t = keep ? snip(text, 120) : text; if (!t) return;
    if (who === "ppoddo") girlSay(t, ms || 20000, true); else kkomSay(t, ms || 20000, true);
  }
  async function send(text, forceWho) {
    text = (text || "").trim();
    if (!text || chat.busy) return;
    $(".chips-welcome")?.remove(); closePop(); stopVoice();
    if (text.length < 90 && (/(통계|검정|가설|연구|분석).{0,14}(회의|상의)|(회의|상의).{0,14}(통계|검정|가설|연구)|연구 회의/.test(text))) return runDuo(text, "research");
    if (text.length < 90 && /AI\s*(단독|끼리|만|셋이서만)|인공지능\s*(단독|끼리|만)|순수\s*AI|코드\s*없이/i.test(text)) return runDuo(text, "ai");
    if (/상의|둘이|셋이|회의|번호.{0,6}뽑/.test(text) && text.length < 90 && store.get("meeting_mode", "code") === "ai") return runDuo(text, "ai");
    if (/상의|둘이|셋이|회의/.test(text) && text.length < 90) return runDuo(text);
    const who = whoOf(forceWho || addressee(text));
    const model = $("#lms-model").value;
    if (!model) { toast("LM Studio 모델을 먼저 연결하세요"); return; }
    $("#chat-text").value = ""; $("#chat-text").style.height = "auto";
    addMsg("user", text);
    chat.history.push({ role: "user", content: text });
    const el = addMsg("bot", "", null, "think", who);
    moodAs(who, "think");
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
        body: JSON.stringify({ base: lmsBase(), model, persona: who, messages: chat.history.slice(-12).map((m) => ({ role: m.role, content: m.content })) }),
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
            if (!talking) { talking = true; talkAs(who, true); }
            const shown = answer.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
            bubbleAs(who, shown, 0, true);
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
    talkAs(who, false);
    const mood = moodFor(answer, usedTools);
    setAvatarMood(el, mood);
    moodAs(who, mood);
    speakAnswer(answer, who);
    { const f = answer.replace(/```[\s\S]*?```/g, " ").replace(/[*#>`|_~]/g, " ").replace(/\s+/g, " ").trim(); bubbleAs(who, f.length > 150 ? f.slice(0, 147) + "…" : f, Voice.on ? 16000 : 10000); }
    chat.history.push(cards.length ? { role: "assistant", content: answer, cards, mood, who } : { role: "assistant", content: answer, mood, who });
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
