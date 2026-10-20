"""주간 브리핑 — 새 회차가 들어오면 코드가 사실을 계산하고, LM Studio 가 켜져 있으면 짧은 요약을 한 번 만들어 저장한다.

저장: data/briefings/<회차>.json (git 제외 — 추천 조합이 매주 바뀌고 개인 화면용).
숫자는 모두 코드 계산. AI 요약은 answer_check 로 검사하고, 한 번 고쳐도 문제가 남으면 요약 없이 사실만 보여 준다.
"""
import json
import math
import os
import tempfile
import threading
import time
from datetime import datetime, timedelta

import answer_check
import tickets
from analysis import TOTAL, _tickets, after_tax, known_patterns
from lotto_data import DATA_DIR

BRIEF_DIR = os.path.join(DATA_DIR, "briefings")
SETTINGS = os.path.join(DATA_DIR, "settings.json")
_lock = threading.Lock()
_running = set()


# ---------------------------------------------------------------- 저장
def _write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save_lms_choice(base, model):
    """AI 상담에서 쓴 LM Studio 주소·모델을 기억 — 브리핑을 백그라운드로 만들 때 쓴다."""
    if base and model:
        cur = _read(SETTINGS) or {}
        if cur.get("lms_base") != base or cur.get("model") != model:
            _write(SETTINGS, {**cur, "lms_base": base, "model": model})


def lms_choice():
    s = _read(SETTINGS) or {}
    return s.get("lms_base"), s.get("model")


# ---------------------------------------------------------------- 사실 계산
def compute(a):
    ds = a.draws
    d, prev = ds[-1], ds[-2]
    nums = d["nums"]
    exp1 = _tickets(d) / TOTAL                    # 판매량 기준, 평균 조합의 1등 기대 인원
    ev = a.evaluate(nums, prev["nums"])           # 모델이 본 이 조합의 인기도(이 회차 자료도 학습에 들어 있음 — 참고용)
    last_seen = {}
    for x in ds[:-1]:
        for n in x["nums"]:
            last_seen[n] = x["no"]
    long_gap = sorted(((n, d["no"] - last_seen.get(n, 0) - 1) for n in nums), key=lambda t: -t[1])
    nxt_date = (datetime.strptime(d["date"], "%Y-%m-%d") + timedelta(days=7)).date().isoformat()
    picks = [c["nums"] for c in a.generate(3, "unpopular", strength=10)]
    bt = d.get("rank1_by_type")
    return {
        "no": d["no"], "date": d["date"], "nums": nums, "bonus": d["bonus"],
        "rank1": {"winners": d["winners"][0], "amount": d["amounts"][0], "amount_net": round(after_tax(d["amounts"][0])),
                  "by_type": bt},
        "rank2": {"winners": d["winners"][1], "amount": d["amounts"][1]},
        "sales": d["sales"],
        "expected_rank1": round(exp1, 1),
        "model": {"popularity": ev["popularity"], "expected": round(exp1 * ev["popularity"], 1),
                  "patterns": known_patterns(nums)},
        "shape": {"sum": sum(nums), "odd": sum(1 for n in nums if n % 2),
                  "consec": sum(1 for x, y in zip(nums, nums[1:]) if y == x + 1),
                  "repeat": sorted(set(nums) & set(prev["nums"])),
                  "long_gap": [{"n": n, "gap": g} for n, g in long_gap if g >= 15][:3]},
        "next": {"no": d["no"] + 1, "date": nxt_date},
        "picks": picks,
        "created": time.strftime("%Y-%m-%d %H:%M"),
        "ai": None,
    }


def facts_text(b):
    r1 = b["rank1"]
    bt = r1["by_type"]
    sh = b["shape"]
    lines = [
        f"- {b['no']}회({b['date']}) 당첨번호 {', '.join(map(str, b['nums']))} + 보너스 {b['bonus']}.",
        (f"- 1등 {r1['winners']}명, 1인당 {r1['amount']:,}원(세전), 세후 약 {r1['amount_net']:,}원." if r1["winners"]
         else "- 1등 당첨자가 없어 1등 상금이 다음 회차로 이월됨."),
    ]
    if bt:
        lines.append(f"- 1등 구매 방식: 자동 {bt['auto']}명, 수동 {bt['manual']}명, 반자동 {bt['semi']}명.")
    lines.append(f"- 판매량으로 본 평균 조합의 1등 기대 인원은 {b['expected_rank1']}명. "
                 f"이 사이트 모델은 이 조합의 인기도를 {b['model']['popularity']}배(1.0=평균)로 보아 약 {b['model']['expected']}명을 예상(참고용).")
    if b["model"]["patterns"]:
        lines.append(f"- 이 조합은 알려진 인기 모양: {', '.join(b['model']['patterns'])}.")
    lines.append(f"- 합계 {sh['sum']}(이론 평균 138), 홀수 {sh['odd']}개, 연속 번호 쌍 {sh['consec']}개.")
    lines.append("- 지난 회차와 겹친 번호: " + (", ".join(map(str, sh["repeat"])) if sh["repeat"] else "없음") + ".")
    if sh["long_gap"]:
        lines.append("- 오래 만에 나온 번호: " + ", ".join(f"{x['n']}번({x['gap']}회 만)" for x in sh["long_gap"]) + ".")
    lines.append(f"- 다음 추첨: {b['next']['no']}회 {b['next']['date']}(토). 어떤 조합이든 1등 확률은 1/8,145,060 으로 같다.")
    return "\n".join(lines)


def my_result(a, no):
    """그 회차의 대장님 구매 결과(요청할 때마다 새로 계산 — 기록이 나중에 추가될 수 있음)."""
    rep = tickets.report(a.draws, a.draws[-1]["no"] + 1)
    rows = [r for r in rep["tickets"] if r["draw"] == no and r["status"] == "done"]
    if not rows:
        return None
    games = [g for r in rows for g in r["games"]]
    return {"games": len(games), "won": sum(r["won"] for r in rows), "cost": sum(r["cost"] for r in rows),
            "wins": sum(1 for g in games if g["rank"]), "best": max(g["match"] or 0 for g in games)}


# ---------------------------------------------------------------- AI 요약
PROMPT = """너는 '로또 확률 연구소'의 분석 상담가다. 아래 [사실]만 써서 대장님께 드릴 '이번 주 브리핑'을 한국어 4~6문장으로 써라.
- 숫자는 [사실]에 있는 것을 그대로 옮긴다. 새 숫자를 만들거나 계산하지 않는다.
- 번호를 예측하거나 "다음에 나올 것", "확률이 높다"처럼 말하지 않는다. 오래 만에 나온 번호나 지난주와 겹친 번호도 우연일 뿐이라고 본다.
- 1등이 평소보다 많거나 적었다면 '인기 조합/비인기 조합' 관점으로만 짧게 설명한다.
- 인사말 없이 바로 본론. 목록·표·제목 없이 문단 하나로.

[사실]
{facts}"""


def _ask_lms(post, base, model, messages):
    resp, _ = post(base, {"model": model, "messages": messages, "temperature": 0.3, "max_tokens": 600}, stream=False)
    with resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = (data["choices"][0]["message"].get("content") or "").strip()
    import re
    return re.sub(r"<think>[\s\S]*?(</think>|$)", "", text).strip()


def write_ai(a, b, post, pick_model):
    """AI 요약을 만들어 b['ai'] 에 넣는다. 실패해도 예외를 밖으로 내지 않는다."""
    base, model = pick_model()
    if not base or not model:
        b["ai"] = {"status": "skip", "reason": "LM Studio 모델을 찾지 못함"}
        return b
    facts = facts_text(b)
    msgs = [{"role": "user", "content": PROMPT.format(facts=facts)}]
    try:
        text = _ask_lms(post, base, model, msgs)
        result = answer_check.check(text, facts)
        revised = False
        if result["numbers"] or result["phrases"]:
            msgs += [{"role": "assistant", "content": text}, {"role": "user", "content": answer_check.revise_prompt(result)}]
            text = _ask_lms(post, base, model, msgs)
            result = answer_check.check(text, facts)
            revised = True
        ok = text and not result["numbers"] and not result["phrases"]
        b["ai"] = {"status": "ok" if ok else "rejected", "text": text if ok else "", "model": model, "revised": revised,
                   "check": result, "created": time.strftime("%Y-%m-%d %H:%M")}
    except Exception as e:  # LM Studio 꺼짐 등
        b["ai"] = {"status": "error", "reason": f"{type(e).__name__}: {str(e)[:120]}"}
    return b


# ---------------------------------------------------------------- 진입점
def path_for(no):
    return os.path.join(BRIEF_DIR, f"{no}.json")


def get(a):
    """최신 회차 브리핑(없으면 사실 부분을 바로 계산해 저장)."""
    no = a.draws[-1]["no"]
    b = _read(path_for(no))
    if not b:
        with _lock:
            b = _read(path_for(no))
            if not b:
                b = compute(a)
                _write(path_for(no), b)
    return b


def ensure_ai_async(a, post, pick_model, force=False):
    """AI 요약이 없거나(또는 실패했거나) force 면 백그라운드로 만든다. 같은 회차를 동시에 두 번 만들지 않는다."""
    b = get(a)
    no = b["no"]
    ai = b.get("ai") or {}
    if not force and ai.get("status") in ("ok", "rejected"):
        return False
    with _lock:
        if no in _running:
            return False
        _running.add(no)

    def run():
        try:
            nb = write_ai(a, dict(get(a)), post, pick_model)
            _write(path_for(no), nb)
        finally:
            with _lock:
                _running.discard(no)
    threading.Thread(target=run, daemon=True).start()
    return True


def is_running(no):
    with _lock:
        return no in _running
