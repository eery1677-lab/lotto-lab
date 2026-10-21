"""AI 단독 번호 회의 — 코드의 후보·분석 없이, 로또·뽀또·꼼꼼이(AI)가 최근 당첨 기록만 보고 직접 세어 보고 의논해 번호를 고른다.

정직 원칙: AI 는 숫자를 세다가 틀릴 수 있다(작은 모델). 그래서 화면에 '검증 안 됨'을 붙이고, 어떤 조합이든 1등 확률은 1/8,145,060 으로 같다고 알린다.
회의가 끝난 뒤에 코드가 AI 가 고른 번호를 **참고용으로만** 검사해(인기도 등) 보여 준다 — 번호를 바꾸지 않는다.
"""
import json
import os
import re
import time

import chat_tools
import lotto_data
import meeting

NAME = meeting.NAME
WINDOW = 30

COMMON = (
    "[당첨 기록]은 회차 번호 순서대로 한 줄씩 있고 맨 아래가 가장 최근이다.\n"
    "너희는 '로또 확률 연구소'의 AI 캐릭터(로또, 뽀또, 꼼꼼이)이고, 이번엔 **코드의 도움 없이** [당첨 기록]만 보고 직접 읽고 세어 보고 의논해서 대장님을 위한 번호를 고른다. 사용자는 반드시 '대장님'이라고만 부른다.\n"
    "[반드시 지킬 것]\n"
    "1. 번호는 로또 6/45 규칙(1~45, 서로 다른 6개)을 지킨다. 번호를 말할 땐 '3 12 19 27 33 41'처럼 숫자만 나란히 쓴다.\n"
    "2. 세어 본 횟수는 틀릴 수 있으니 '내가 세어 보니', '대충 세면'처럼 자신 없게 말하고, 모르면 모른다고 한다. [당첨 기록]에 없는 사실을 지어내지 않는다.\n"
    "3. 번호를 미리 맞힐 수 있다고 절대 말하지 않는다. 어떤 조합이든 1등 확률은 1/8,145,060 으로 같고, 이건 재미를 위한 선택이다.\n"
    "4. 서로 직접 대화한다(상대 이름을 부르며). 대장님은 곁에서 지켜보는 분이라 평소엔 3인칭으로 말하고, 직접 말하는 건 마지막 마무리 한 줄뿐이다. 한 번에 한두 문장, 100자 이내. 이모지·마크다운·따옴표·이름표 없이 말만 쓴다.\n"
)


def _data_text(a, window=WINDOW):
    """최근 window 회(0 이면 전체)의 당첨 기록을 한 줄씩. 짧게: '1246: 3 11 20 25 37 42+5'."""
    ds = a.draws if not window else a.draws[-window:]
    return "\n".join(f"{d['no']}: " + " ".join(map(str, d["nums"])) + f"+{d['bonus']}" for d in ds)


def combo_of(text):
    """대사에서 번호 6개(서로 다른 1~45)를 뽑는다. 없으면 None."""
    nums = []
    for tok in re.findall(r"(?<![\d.,])(\d{1,2})(?![\d.,]|\s*[%회번개명원])", text):
        v = int(tok)
        if 1 <= v <= 45 and v not in nums:
            nums.append(v)
    # '번'이 붙은 번호도 허용: "7번, 12번 ..."
    for tok in re.findall(r"(?<![\d.,])(\d{1,2})번", text):
        v = int(tok)
        if 1 <= v <= 45 and v not in nums:
            nums.append(v)
    return sorted(nums[:6]) if len(nums) >= 6 else None


def _valid(text, ctx):
    if not text or len(text) < 2:
        return False
    if re.search(r"맞힐 수 (있|있어)|반드시 (당첨|나올)|무조건 (당첨|나올)|100% 당첨|확실히 (당첨|나올)|당첨(될|되는) 번호", text):
        return False
    allowed = {tok.replace(",", "") for tok in meeting.NUM.findall(ctx)}
    for tok in meeting.NUM.findall(text):
        k = tok.replace(",", "")
        if k in allowed or (k.isdigit() and int(k) <= 45):      # 1~45 는 번호·횟수 말로 허용, 그 밖의 큰 숫자는 기록에 있을 때만
            continue
        return False
    return True


def _file():
    return os.path.join(lotto_data.DATA_DIR, "ai_picks.json")


def _read():
    try:
        with open(_file(), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save(rec):
    rows = _read()[-199:] + [rec]
    tmp = _file() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    os.replace(tmp, _file())


def records(a):
    """연구 기록: AI 단독 회의로 고른 번호들과, 그 회차 추첨 결과가 나왔으면 맞힌 개수(참고)."""
    by_no = {d["no"]: d for d in a.draws}
    out = []
    for r in reversed(_read()):
        d = by_no.get(r["draw"])
        picks = []
        for p in r["picks"]:
            m = len(set(p["nums"]) & set(d["nums"])) if d else None
            picks.append({"who": p["who"], "nums": p["nums"], "match": m, "bonus": bool(d and d["bonus"] in p["nums"]) if d else None})
        out.append({"draw": r["draw"], "at": r["at"], "models": r.get("models", {}), "picks": picks, "result": d["nums"] if d else None,
                    "lines": r.get("lines", [])})
    return out


def run(a, ask, models, emit, cast=None, window=WINDOW):
    cast = [x for x in (cast or ["lotto", "ppoddo", "kkom"]) if x in NAME]
    emit({"type": "start", "models": models, "cast": cast, "mode": "ai"})
    window = 0 if window in (0, None) or window >= len(a.draws) else int(window)
    data = _data_text(a, window)
    n_data = len(a.draws) if not window else window
    nxt = a.draws[-1]["no"] + 1
    st = meeting.State()
    mine = {}                      # who -> 제안한 번호 6개

    def say(who, instruction, fallback, want_combo=False, no_combo=False):
        talk = "\n".join(f"{NAME[w]}: {t}" for w, t in st.lines[-8:]) or "(아직 없음)"
        ctx = f"[당첨 기록] {'전체' if not window else '최근'} {n_data}회 (회차: 번호 6개+보너스)\n{data}\n\n[지금까지 대화]\n{talk}"
        user = ctx + f"\n\n[네 차례] 너는 '{NAME[who]}'. {instruction}\n{NAME[who]}의 말만 {'한두' if not want_combo else '두'} 문장으로 써라." + ("\n번호 6개를 '3 12 19 27 33 41'처럼 숫자만 나란히 써서 말에 꼭 넣어라." if want_combo else "")
        text = ""
        for attempt in range(2):
            try:
                raw = ask(models.get(who) or "", COMMON + meeting.PERSONA[who], user + ("" if attempt == 0 else "\n(앞의 답이 규칙에 맞지 않았다. 규칙대로 다시 써라.)"), 170)
            except Exception as e:
                emit({"type": "error", "message": f"{NAME[who]}의 AI 호출 실패: {type(e).__name__} {str(e)[:100]}"})
                raise
            t = meeting._clean(raw)
            t = t[:170]
            if _valid(t, ctx) and (not want_combo or combo_of(t)) and not (no_combo and combo_of(t)):
                text = t
                break
        if not text:
            text = fallback
        if want_combo:
            c = combo_of(text)
            if c:
                mine[who] = c
        st.lines.append((who, text))
        emit({"type": "line", "who": who, "text": text})

    def fb_combo(seed):
        import random
        r = random.Random(seed)
        return " ".join(map(str, sorted(r.sample(range(1, 46), 6))))

    say("ppoddo", f"오늘은 코드 없이 우리 AI끼리만 {nxt}회 번호를 골라 보자고 로또와 꼼꼼이에게 말한다. 최근 기록을 보면서 마음에 드는 번호를 찾아보겠다고 한다.",
        f"로또야, 꼼꼼아! 오늘은 코드 없이 우리끼리만 {nxt}회 번호를 골라 보자~")
    say("lotto", "[당첨 기록]을 직접 읽고 눈에 띄는 점 한두 가지(자주 보이는 번호 등)를 '내가 세어 보니'처럼 자신 없게 말하고, 그걸 바탕으로 네가 고른 번호 6개를 말한다.",
        f"내가 대충 훑어보니 자주 보이는 번호가 있어. 내 번호는 {fb_combo(1)}야.", want_combo=True)
    say("kkom", "로또가 말한 것 중 하나를 [당첨 기록]에서 다시 확인하고 맞는지 말한다(틀렸을 수도 있다). 그리고 꼼꼼이 네가 고른 번호 6개를 말한다.",
        f"다시 확인해 봤는데 대체로 맞습니다. 제 번호는 {fb_combo(2)}입니다.", want_combo=True)
    say("ppoddo", "뽀또 네가 마음에 드는 번호 6개를 이유(예쁜 모양, 느낌 등)와 함께 말한다. 앞사람과 겹치는 번호가 있으면 한마디 한다.",
        f"난 이 번호가 예뻐! {fb_combo(3)}", want_combo=True)
    say("lotto", "세 사람의 번호가 서로 얼마나 겹치는지 보고, 겹치는 번호가 있으면 어떻게 할지 말한다. 확률은 모두 똑같다는 말도 한 번 한다.",
        "번호가 조금 겹치긴 하네. 어차피 확률은 모두 똑같아.")
    say("kkom", "세 조합을 정리해서 확인하고, 이건 AI가 직접 세어서 고른 거라 틀릴 수 있다는 점과 예산 한도를 정하자는 말을 한다.",
        "세 조합을 확인했습니다. AI가 직접 센 거라 틀릴 수 있고, 예산 한도를 먼저 정해 두세요.")
    # 최종: 로또 AI 가 세 조합을 JSON 으로 정리(번호를 바꿔도 됨, 검증은 규칙만)
    picks = []
    try:
        raw = ask(models.get("lotto") or "", "너는 회의록 정리자다. JSON 한 개만 출력한다.",
                  "아래 대화에서 로또·뽀또·꼼꼼이가 최종으로 정한 번호 조합을 정리해라. 각 조합은 서로 다른 1~45 숫자 6개. 대화에 나온 번호를 그대로 써라.\n"
                  + "\n".join(f"{NAME[w]}: {t}" for w, t in st.lines) + "\n\nJSON: {\"picks\":[{\"who\":\"lotto\",\"nums\":[1,2,3,4,5,6]},{\"who\":\"kkom\",\"nums\":[...]},{\"who\":\"ppoddo\",\"nums\":[...]}]}", 220)
        m = re.search(r"\{[\s\S]*\}", re.sub(r"<think>[\s\S]*?(</think>|$)", "", raw))
        for it in (json.loads(m.group(0)).get("picks") or []) if m else []:
            n = sorted({int(x) for x in it.get("nums", []) if 1 <= int(x) <= 45})
            if len(n) == 6 and it.get("who") in NAME:
                picks.append({"who": it["who"], "nums": n})
    except Exception:
        picks = []
    if len(picks) < 2:                                  # 정리가 안 되면 각자 제안한 번호를 그대로
        picks = [{"who": w, "nums": mine[w]} for w in ("lotto", "kkom", "ppoddo") if w in mine]
    picks = [p for i, p in enumerate(picks) if all(p["nums"] != q["nums"] for q in picks[:i])][:3]
    # 코드 검사(참고용): 번호를 바꾸지 않는다
    items = []
    for p in picks:
        r = chat_tools.run(a, "check_numbers", {"numbers": p["nums"]})
        if r.get("오류"):
            continue
        pat = r.get("알려진 인기 모양")
        items.append({"who": p["who"], "nums": p["nums"], "pop": r["인기도"], "co": r["1등 동반 당첨자"], "ev": r["1000원당 기대 환급"], "net": r["세후"],
                      "pattern": pat if isinstance(pat, str) else ", ".join(pat), "raw": r})
    card = {"name": "generate_numbers", "result": {
        "방법": "AI 셋이 코드 없이 직접 세어서 고른 번호(검증 안 됨) — 코드 검사는 참고용", "1등 확률": "1/8,145,060 (모든 조합 동일)",
        "조합": [{"번호": it["nums"], "인기도": it["pop"], "1등 동반 당첨자": it["co"], "1등 기대 수령액 세전": it["raw"]["1등 기대 수령액 세전"], "세후": it["net"], "1000원당 기대 환급": it["ev"], "글자": {"lotto": "로", "ppoddo": "뽀", "kkom": "꼼"}[it["who"]]} for it in items],
        "평균 조합": {"1등 기대 수령액 세전": items[0]["raw"]["평균 조합 세전"] if items else 0, "세후": 0, "1000원당 기대 환급": items[0]["raw"]["1000원당 기대 환급"] if items else 0} if items else {}}}
    try:
        _save({"draw": nxt, "at": time.strftime("%Y-%m-%d %H:%M"), "models": models, "picks": [{"who": it["who"], "nums": it["nums"]} for it in items],
               "lines": [[w, t] for w, t in st.lines], "window": n_data})
    except OSError:
        pass
    emit({"type": "ai_picks", "items": [{k: v for k, v in it.items() if k != "raw"} for it in items], "card": card})
    say("ppoddo", "오늘 우리가 직접 고른 번호 조합들은 아래 카드에 있다고만 말하고(번호는 말하지 않는다), 이건 우리가 직접 세어서 틀릴 수도 있다는 점과 재미로만 즐기고 예산 안에서만 사시라는 당부를 다정하게 대장님께 한다.",
        "대장님, 우리가 직접 세어 고른 번호는 아래 카드에 있어요! 틀릴 수도 있으니 재미로만, 예산 안에서만 즐기세요~", no_combo=True)
    emit({"type": "done"})
