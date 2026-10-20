"""동행복권 공식 당첨 결과 받기 · 저장.

공식 조회 주소(2026-10 확인): /lt645/selectPstLt645Info.do?srchLtEpsd=all → 전 회차 JSON.
맥의 python.org 파이썬은 인증서가 없어 https 가 실패할 수 있어 curl 로 한 번 더 시도한다.
"""
import json
import os
import subprocess
import tempfile
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "draws.json")
API_URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=all"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36",
    "Referer": "https://www.dhlottery.co.kr/",
    "X-Requested-With": "XMLHttpRequest",
}


def _fetch_raw():
    try:
        req = urllib.request.Request(API_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8")
    except Exception as first_err:
        # 맥 인증서 문제 등 → curl 로 재시도
        try:
            args = ["curl", "-s", "--max-time", "30"]
            for k, v in HEADERS.items():
                args += ["-H", f"{k}: {v}"]
            out = subprocess.run(args + [API_URL], capture_output=True, timeout=40)
            if out.returncode == 0 and out.stdout:
                return out.stdout.decode("utf-8")
        except Exception:
            pass
        raise first_err


def _convert(item):
    nums = sorted(int(item[f"tm{i}WnNo"]) for i in range(1, 7))
    d = str(item["ltRflYmd"])
    return {
        "no": int(item["ltEpsd"]),
        "date": f"{d[:4]}-{d[4:6]}-{d[6:]}",
        "nums": nums,
        "bonus": int(item["bnsWnNo"]),
        "winners": [int(item.get(f"rnk{r}WnNope") or 0) for r in range(1, 6)],
        "amounts": [int(item.get(f"rnk{r}WnAmt") or 0) for r in range(1, 6)],
        "rank1_total": int(item.get("rnk1SumWnAmt") or 0),
        "prize_total": sum(int(item.get(f"rnk{r}SumWnAmt") or 0) for r in range(1, 6)),
        "sales": int(item.get("wholEpsdSumNtslAmt") or 0),
    }


def fetch_all():
    """공식 사이트에서 전 회차를 받아 검사 후 저장. 실패하면 예외(기존 파일은 그대로)."""
    payload = json.loads(_fetch_raw())
    items = payload["data"]["list"]
    draws = sorted((_convert(x) for x in items), key=lambda d: d["no"])
    # 검사: 회차가 1부터 빠짐없이, 번호 6개가 1~45 서로 다름
    if not draws or draws[0]["no"] != 1:
        raise ValueError("받은 자료가 1회차부터 시작하지 않습니다")
    for i, d in enumerate(draws):
        if d["no"] != i + 1:
            raise ValueError(f"{i + 1}회차가 빠져 있습니다")
        if len(set(d["nums"])) != 6 or not all(1 <= n <= 45 for n in d["nums"] + [d["bonus"]]):
            raise ValueError(f"{d['no']}회차 번호가 이상합니다")
    old = load()
    if old and len(draws) < len(old):
        raise ValueError("받은 회차 수가 저장된 것보다 적어 저장하지 않았습니다")
    save(draws)
    return draws


def save(draws):
    os.makedirs(DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"updated": time.strftime("%Y-%m-%d %H:%M"), "draws": draws}, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DATA_FILE)


def load():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)["draws"]
    except (OSError, ValueError, KeyError):
        return []


def updated_at():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f).get("updated", "")
    except (OSError, ValueError):
        return ""


if __name__ == "__main__":
    ds = fetch_all()
    print(f"{len(ds)}회 저장 — 마지막 {ds[-1]['no']}회 {ds[-1]['date']} {ds[-1]['nums']} + {ds[-1]['bonus']}")
