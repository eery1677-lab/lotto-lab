"""내 구매 기록 — 산 번호를 저장하고, 결과가 나오면 자동으로 맞춰 본다.

저장: data/tickets.json (개인 기록이라 git 에 올리지 않음). 쓰기는 잠금 + 원자적 교체.
등수·금액은 그 회차의 실제 1인당 당첨금(공식 자료)으로 계산한다.
"""
import json
import os
import tempfile
import threading
import time
import uuid

from analysis import after_tax
from lotto_data import DATA_DIR

TICKET_FILE = os.path.join(DATA_DIR, "tickets.json")
PRICE = 1000
MAX_GAMES = 50          # 한 번에 담을 수 있는 게임 수(1회 구매 한도 10만원 = 100게임 안쪽)
_lock = threading.Lock()


def _load():
    try:
        with open(TICKET_FILE, encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("tickets", [])
        data.setdefault("budget_month", 0)
        return data
    except (OSError, ValueError):
        return {"tickets": [], "budget_month": 0}


def _save(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, TICKET_FILE)


def rank_of(nums, draw):
    """(등수 1~5 또는 None, 맞힌 개수)."""
    s = set(nums)
    m = len(s & set(draw["nums"]))
    if m == 6:
        return 1, m
    if m == 5:
        return (2 if draw["bonus"] in s else 3), m
    if m == 4:
        return 4, m
    if m == 3:
        return 5, m
    return None, m


def _valid_game(g):
    try:
        g = sorted(int(x) for x in g)
    except (TypeError, ValueError):
        return None
    if len(g) != 6 or len(set(g)) != 6 or not all(1 <= x <= 45 for x in g):
        return None
    return g


def add(draw_no, games, source="직접", memo=""):
    games = [_valid_game(g) for g in (games or [])]
    if not games or any(g is None for g in games):
        raise ValueError("게임마다 1~45 사이 서로 다른 번호 6개가 필요합니다")
    if len(games) > MAX_GAMES:
        raise ValueError(f"한 번에 {MAX_GAMES}게임까지 담을 수 있습니다")
    draw_no = int(draw_no)
    if draw_no < 1:
        raise ValueError("회차가 이상합니다")
    t = {
        "id": uuid.uuid4().hex[:12],
        "draw": draw_no,
        "games": games,
        "source": str(source)[:20],
        "memo": str(memo)[:100],
        "created": time.strftime("%Y-%m-%d %H:%M"),
    }
    with _lock:
        data = _load()
        data["tickets"].append(t)
        _save(data)
    return t


def delete(tid):
    with _lock:
        data = _load()
        before = len(data["tickets"])
        data["tickets"] = [t for t in data["tickets"] if t["id"] != tid]
        if len(data["tickets"]) == before:
            raise ValueError("해당 기록이 없습니다")
        _save(data)


def set_budget(amount):
    amount = max(0, min(10_000_000, int(amount)))
    with _lock:
        data = _load()
        data["budget_month"] = amount
        _save(data)
    return amount


def report(draws, next_no):
    """모든 기록을 회차 결과와 맞춰 본 요약."""
    data = _load()
    by_no = {d["no"]: d for d in draws}
    rows = []
    spent = won = 0
    prize_count = [0] * 5
    pending_games = 0
    month = time.strftime("%Y-%m")
    month_spent = 0
    for t in sorted(data["tickets"], key=lambda x: (-x["draw"], x["created"])):
        d = by_no.get(t["draw"])
        cost = PRICE * len(t["games"])
        spent += cost
        if t["created"][:7] == month:
            month_spent += cost
        games = []
        t_won = 0
        for g in t["games"]:
            if d:
                r, m = rank_of(g, d)
                amt = d["amounts"][r - 1] if r else 0
                if r:
                    prize_count[r - 1] += 1
                t_won += amt
                games.append({"nums": g, "rank": r, "match": m, "amount": amt, "net": round(after_tax(amt)),
                              "hits": sorted(set(g) & set(d["nums"])), "bonus_hit": d["bonus"] in g})
            else:
                pending_games += 1
                games.append({"nums": g, "rank": None, "match": None, "amount": 0, "net": 0, "hits": [], "bonus_hit": False})
        won += t_won
        rows.append({**t, "status": "done" if d else "pending", "cost": cost, "won": t_won,
                     "result": {"nums": d["nums"], "bonus": d["bonus"], "date": d["date"]} if d else None,
                     "games": games})
    budget = data["budget_month"]
    return {
        "tickets": rows,
        "total": {"spent": spent, "won": won, "net": won - spent,
                  "return_pct": round(won / spent * 100, 1) if spent else 0.0,
                  "prizes": prize_count, "pending_games": pending_games},
        "budget": {"month": budget, "month_spent": month_spent,
                   "over": bool(budget) and month_spent > budget},
        "next_draw": next_no,
    }


def facts_text(draws, next_no):
    """AI 상담용 요약(구매 기록이 있을 때만)."""
    rep = report(draws, next_no)
    if not rep["tickets"]:
        return ""
    t = rep["total"]
    lines = [f"[대장님 구매 기록] 총 {len(rep['tickets'])}건, 쓴 돈 {t['spent']:,}원, 받은 돈 {t['won']:,}원, "
             f"손익 {t['net']:,}원, 환급률 {t['return_pct']}%, 1~5등 {'/'.join(map(str, t['prizes']))}회, "
             f"아직 추첨 전 {t['pending_games']}게임."]
    b = rep["budget"]
    if b["month"]:
        lines.append(f"- 이번 달 예산 {b['month']:,}원 중 {b['month_spent']:,}원 사용" + (" (예산 초과)" if b["over"] else ""))
    for r in rep["tickets"][:5]:
        if r["status"] == "done":
            best = max((g for g in r["games"]), key=lambda g: g["match"] or 0)
            lines.append(f"- {r['draw']}회 {len(r['games'])}게임: 받은 돈 {r['won']:,}원, 가장 많이 맞힌 것 {best['match']}개")
        else:
            lines.append(f"- {r['draw']}회 {len(r['games'])}게임: 추첨 전")
    return "\n".join(lines)
