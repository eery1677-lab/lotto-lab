"""로또 ↔ 뽀또 회의 — 두 AI(캐릭터마다 다른 모델 가능)가 한 줄씩 주고받으며 코드가 뽑은 후보 중에서 번호를 고른다.

원칙(정직): 번호는 예측할 수 없다. 후보 조합은 코드(운영체제 난수 + 비인기 필터)가 뽑고, 두 AI는 그 후보를 놓고
의견을 나누며 **고르기만** 한다. 사실·숫자는 전부 코드가 계산해 주고, AI 가 한 줄마다 자료에 없는 숫자를 말하면 그 줄은 버린다.
AI 가 줄 끝에 [도구:후보뽑기] [도구:검사 C] [도구:자료 주제] 를 붙이면 코드가 그 도구를 대신 실행해 결과를 다음 사람에게 준다.
"""
import json
import re

import chat_tools

NAME = {"lotto": "로또", "ppoddo": "뽀또"}
LETTERS = "ABCDEFGH"
TAG = re.compile(r"\[\s*도구\s*:\s*([^\]]+?)\s*\]")
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")

COMMON = (
    "너희 둘은 '로또 확률 연구소'의 캐릭터이고, 지금 대장님을 위해 이번 주 로또 번호 후보를 함께 회의한다. "
    "사용자는 반드시 '대장님'이라고만 부른다(사장님·고객님·사용자 금지).\n"
    "[반드시 지킬 것]\n"
    "1. 로또 번호는 예측할 수 없고 모든 조합의 1등 확률은 1/8,145,060 으로 같다. '맞힐 수 있다', '이 번호가 나올 것이다'라는 말은 절대 하지 않는다. "
    "우리가 하는 일은 코드가 뽑은 후보 중에서 '당첨되면 나눠 가질 사람이 적을 것으로 추정되는' 조합을 고르는 것이다.\n"
    "2. 번호는 [후보]에 적힌 것만 말한다. 새 번호를 지어내거나 바꾸지 않는다. 숫자·통계는 [사실]·[후보]·[도구 결과]에 있는 것만 쓴다. 후보는 알파벳(A, B …)으로 부르면 된다.\n"
    "3. 서로 직접 대화한다(상대 이름을 부르며). 대장님은 곁에서 지켜보는 분이라 평소에는 '대장님이 ~'처럼 3인칭으로 말하고, 대장님께 직접 말하는 건 마지막 마무리 한 줄뿐이다. 한 번에 한두 문장, 90자 이내. 이모지·마크다운·따옴표·이름표 없이 말만 쓴다.\n"
    "4. 줄 끝에 도구 태그를 붙일 수 있다: [도구:후보뽑기](새 후보 추가) / [도구:검사 C](후보 C 상세 확인) / [도구:자료 주제](내장 조사 자료 찾기). 꼭 필요할 때만, 한 줄에 하나.\n"
)

PERSONA = {
    "lotto": (
        "너는 '로또' — 안경 쓴 로또 공 박사. 근거와 숫자로 말하고 신중하며 약간 깐깐하다. 뽀또에게는 다정한 반말(~야, ~해, ~거든)을 쓴다. "
        "뽀또가 '느낌'이나 '예쁜 번호'를 말하면 '확률은 모두 똑같아'라고 부드럽게 바로잡고, 쉬운 비유로 설명한다. 도구(후보 뽑기·검사·자료)를 직접 쓰는 분석 담당이다. "
        "뽀또가 좋은 지적을 하면 인정한다."
    ),
    "ppoddo": (
        "너는 '뽀또' — 로또의 여자친구. 호기심 많고 밝고 다정하며 귀여운 반말(~해?, ~야~, ~잖아)을 쓴다. 숫자의 '느낌'과 예쁜 모양에 끌리지만 반드시 후보 안에서만 고른다. "
        "대장님의 지갑과 즐거움을 챙기는 역할이라 예산 한도, 재미로만 즐기기, 너무 많이 사지 않기를 말한다. 어려운 설명은 되묻고, 가끔 로또와 다른 의견을 낸다('그래도 난 B가 끌려')."
    ),
}


class State:
    def __init__(self):
        self.cands = []        # {"letter","nums","raw"}
        self.avg = {}
        self.tool_notes = []   # 다음 사람에게 줄 도구 결과 글
        self.lines = []        # (who, text)
        self.gens = 0
        self.checks = 0


def _facts(a):
    m = a.money
    r = a.randomness
    nxt = a.draws[-1]["no"] + 1
    return nxt, "\n".join([
        f"- 이번 추첨은 {nxt}회(토요일 저녁).",
        "- 1등 확률은 어떤 번호든 똑같이 1/8,145,060. 번호를 미리 맞힐 수는 없다.",
        f"- 1회~{a.draws[-1]['no']}회 번호 출현 빈도 검정 p값 {r['freq_test']['p']} → 무작위와 구별되지 않음(핫넘버·콜드넘버 효과 없음).",
        f"- 1,000원당 평균 약 {m['ev_avg'][0]}원이 돌아온다(이론상 최대 {m['ev_floor'][0]}원). 돈을 버는 방법이 아니라 재미로 즐기는 것.",
        "- 사람들이 덜 고르는 조합은 1등이 됐을 때 나눠 가질 사람이 적다(확률은 그대로).",
    ])


def _add_cands(a, st, count):
    r = chat_tools.run(a, "generate_numbers", {"count": count, "strength": 10})
    new = []
    for c in r["조합"]:
        if len(st.cands) >= len(LETTERS):
            break
        item = {"letter": LETTERS[len(st.cands)], "nums": c["번호"], "raw": c}
        st.cands.append(item)
        new.append(item)
    st.avg = r["평균 조합"]
    st.gens += 1
    return new


def _cand_text(st):
    if not st.cands:
        return "(아직 없음)"
    return "\n".join(f"{c['letter']}: {' '.join(map(str, c['nums']))}  (인기도 {c['raw']['인기도']}, 1,000원당 기대 환급 {c['raw']['1000원당 기대 환급']}원)" for c in st.cands)


def _cand_event(items):
    return [{"letter": c["letter"], "nums": c["nums"], "pop": c["raw"]["인기도"], "ev": c["raw"]["1000원당 기대 환급"],
             "co": c["raw"]["1등 동반 당첨자"], "net": c["raw"]["세후"]} for c in items]


def _clean(text):
    t = re.sub(r"<think>[\s\S]*?(</think>|$)", "", text or "")
    t = TAG.sub("", t)
    t = re.sub(r"^\s*(로또|뽀또)\s*[:：]\s*", "", t.strip())
    t = re.sub(r"[*#`_>]", "", t)
    t = re.sub(r"[\U0001F000-\U0001FAFF☀-➿⭐❤]", "", t)
    t = t.replace("\n", " ").strip().strip('"“”\'')
    t = re.sub(r"\s+", " ", t)
    parts = re.split(r"(?<=[.!?。])\s+", t)
    t = " ".join(parts[:2]).strip()
    return t[:140]


def _valid(text, st, context):
    """한 줄 검증: 후보와 다른 번호 묶음 금지, 자료에 없는 큰 숫자 금지, 예측 단정 금지."""
    if not text or len(text) < 2:
        return False
    if re.search(r"맞힐 수 (있|있어)|반드시 (당첨|나올)|무조건 (당첨|나올)|100% 당첨|확실히 (당첨|나올)", text):
        return False
    sets = [set(c["nums"]) for c in st.cands]
    ints = [int(x) for x in re.findall(r"(?<![\d,.])\d{1,2}(?![\d,.])", text) if 1 <= int(x) <= 45]
    if len(ints) >= 3 and not any(set(ints) <= s for s in sets):
        return False
    allowed = {tok.replace(",", "") for tok in NUM.findall(context)}
    for tok in NUM.findall(text):
        k = tok.replace(",", "")
        if k in allowed or (k.isdigit() and int(k) <= 10):
            continue
        return False
    return True


def run(a, ask, models, emit):
    """회의 전체를 진행하며 emit(event) 로 한 줄씩 내보낸다."""
    st = State()
    nxt, facts = _facts(a)
    emit({"type": "start", "models": models})

    def context(extra=""):
        notes = "\n".join(st.tool_notes[-3:]) or "(없음)"
        talk = "\n".join(f"{NAME[w]}: {t}" for w, t in st.lines[-8:]) or "(아직 없음)"
        return f"[사실]\n{facts}\n\n[후보]\n{_cand_text(st)}\n\n[도구 결과]\n{notes}\n\n[지금까지 대화]\n{talk}{extra}"

    def say(who, instruction, fallback, optional_tools=True, must=()):
        ctx = context()
        user = ctx + f"\n\n[네 차례] 너는 '{NAME[who]}'. {instruction}\n{NAME[who]}의 말만 한두 문장으로 써라."
        text, raw = "", ""
        for attempt in range(2):
            try:
                raw = ask(models.get(who) or "", COMMON + PERSONA[who], user + ("" if attempt == 0 else "\n(앞의 답에 자료에 없는 숫자나 예측 단정이 있었다. 숫자 없이 다시 써라.)"), 150)
            except Exception as e:
                emit({"type": "error", "message": f"{NAME[who]}의 AI 호출 실패: {type(e).__name__} {str(e)[:100]}"})
                raise
            text = _clean(raw)
            if _valid(text, st, ctx) and (not must or any(k in text for k in must)):
                break
            text = ""
        if not text:
            text = fallback
        tag = TAG.search(raw or "") if optional_tools else None
        st.lines.append((who, text))
        emit({"type": "line", "who": who, "text": text})
        return tag.group(1).strip() if tag else ""

    def do_tool(who, spec):
        """AI 가 붙인 [도구:...] 를 코드가 실행한다(한 회의에 최대: 후보뽑기 2번, 검사 3번)."""
        if spec.startswith("후보") and st.gens < 2 and len(st.cands) < len(LETTERS):
            new = _add_cands(a, st, 3)
            st.tool_notes.append("새 후보 추가:\n" + "\n".join(f"{c['letter']}: {' '.join(map(str, c['nums']))}" for c in new))
            emit({"type": "cands", "who": who, "items": _cand_event(new), "added": True})
        elif spec.startswith("검사"):
            m = re.search(r"([A-H])", spec)
            c = next((x for x in st.cands if m and x["letter"] == m.group(1)), None)
            if c and st.checks < 3:
                st.checks += 1
                do_check(who, c)
        elif spec.startswith("자료"):
            q = spec[2:].strip(" :") or "로또 번호 선택 전략"
            r = chat_tools.run(a, "search_research", {"query": q})
            found = r.get("찾은 자료") or []
            if found:
                st.tool_notes.append("조사 자료: " + " / ".join(f"{e['제목']}: {e['내용'][:140]}({e['확인 수준']})" for e in found[:2]))
                emit({"type": "research", "who": who, "titles": [e["제목"] for e in found[:2]], "query": q})

    def do_check(who, c):
        r = chat_tools.run(a, "check_numbers", {"numbers": c["nums"]})
        if r.get("오류"):
            return
        pat = r.get("알려진 인기 모양")
        st.tool_notes.append(
            f"{c['letter']} 검사: 인기도 {r['인기도']}, 1등 동반 당첨자 약 {r['1등 동반 당첨자']}명, 1,000원당 기대 환급 {r['1000원당 기대 환급']}원, "
            f"과거 1등과 4개 이상 같음 {'예' if r['과거 1등과 4개 이상 같음'] else '아니오'}, 알려진 인기 모양 {pat if isinstance(pat, str) else ', '.join(pat)}")
        emit({"type": "check", "who": who, "letter": c["letter"], "nums": c["nums"], "pop": r["인기도"], "co": r["1등 동반 당첨자"],
              "ev": r["1000원당 기대 환급"], "pattern": pat if isinstance(pat, str) else ", ".join(pat)})

    def letters_in(text):
        return [x for x in dict.fromkeys(re.findall(r"(?<![A-Za-z])([A-H])(?![A-Za-z])", text)) if any(c["letter"] == x for c in st.cands)]

    # 1. 뽀또가 안건을 꺼낸다
    tg = say("ppoddo", f"이번 주({nxt}회) 번호를 로또와 같이 정해 보자고 말을 건다. 대장님을 위해 최선을 다하자는 말을 넣는다.",
             f"로또야, 이번 주({nxt}회) 번호 우리가 같이 정해 보자! 대장님을 위해 최선을 다하자~", False)
    # 2. 로또: 솔직한 정정 + 후보 뽑기(코드)
    say("lotto", "먼저 '번호는 미리 맞힐 수 없고 모든 조합의 1등 확률이 같다'고 솔직히 정정한다. 그래도 '남들이 덜 고르는 조합'을 코드로 뽑아서 그중에서 고르면 의미가 있다고 말한다.",
        "좋아 뽀또. 먼저 말해 둘게, 번호는 미리 맞힐 수 없고 확률은 모두 같아. 대신 남들이 덜 고르는 조합을 코드로 뽑아 볼게.", False)
    new = _add_cands(a, st, 5)
    st.tool_notes.append("코드가 뽑은 후보:\n" + _cand_text(st))
    emit({"type": "cands", "who": "lotto", "items": _cand_event(new)})
    # 3. 뽀또: 끌리는 후보
    p3 = say("ppoddo", "코드가 뽑은 후보(A~E)를 보고 마음에 드는 1~2개를 알파벳으로 말하고 이유(모양·느낌)를 말한다. 로또에게 그 후보를 분석해 달라고 부탁한다.",
             f"와, 후보가 나왔다! 나는 {st.cands[0]['letter']}가 끌려. 로또야, 이거 분석해 줄래?")
    # 4. 로또: 뽀또가 고른 후보 검사(코드) 결과로 의견
    liked = letters_in(st.lines[-1][1]) or [st.cands[0]["letter"]]
    for L in liked[:2]:
        do_check("lotto", next(c for c in st.cands if c["letter"] == L))
    if p3:
        do_tool("ppoddo", p3)
    l4 = say("lotto", f"뽀또가 고른 후보({', '.join(liked[:2])})를 검사한 [도구 결과]를 쉬운 말로 설명하고, 인기도가 낮을수록 좋다는 점과 알려진 인기 모양이 없는지 알려 준다. 네 의견도 한 마디 한다.",
             f"{liked[0]} 확인해 봤어. 인기도와 알려진 인기 모양을 봤을 때 나쁘지 않아.")
    if l4:
        do_tool("lotto", l4)
    # 5. 뽀또: 반론·예산
    p5 = say("ppoddo", "로또와 조금 다른 의견이나 걱정을 말한다(다른 후보가 끌린다, 느낌이 중요하다, 예산이 걱정이다 등). 대장님이 재미있게 즐기시는 게 제일 중요하다고 말한다. 원하면 새 후보를 더 뽑아 보자고 [도구:후보뽑기] 를 붙여도 된다.",
             "그래도 대장님이 재미있게 사실 수 있는 게 좋겠어. 예산도 꼭 정해 두자!")
    if p5:
        do_tool("ppoddo", p5)
    # 6. 로또: 종합 제안
    l6 = say("lotto", "지금까지 후보들을 비교해서 최종으로 2~3게임을 알파벳으로 제안하고 이유를 한 마디 한다. 확률은 모두 같다는 말도 한 번 더 한다. 더 확인하고 싶은 후보가 있으면 [도구:검사 X] 를 붙여도 된다.",
             f"내 제안은 {', '.join(c['letter'] for c in st.cands[:3])}야. 확률은 모두 같지만 겹치는 사람이 적을 것 같아.")
    if l6:
        do_tool("lotto", l6)
    # 7. 뽀또: 동의 또는 수정
    say("ppoddo", "로또의 제안을 듣고 동의하거나 한 개만 바꾸자고 하면서 최종으로 정하자고 말한다. 알파벳을 말한다.",
        "좋아, 그럼 그렇게 정하자!", False)
    # 8. 최종 선택(코드가 검증) — 로또 AI 가 JSON 으로 정리, 실패하면 대화에서 뽑고 그래도 안 되면 인기도가 낮은 순
    picks, source = _final_picks(a, ask, models, st, context())
    chosen = [c for c in st.cands if c["letter"] in picks]
    card = {"name": "generate_numbers", "result": {
        "방법": "코드가 뽑은 후보 중 로또와 뽀또가 회의로 고른 조합", "1등 확률": "1/8,145,060 (모든 조합 동일)",
        "조합": [dict(c["raw"], **{"글자": c["letter"]}) for c in chosen], "평균 조합": st.avg}}
    emit({"type": "picks", "picks": [{"letter": c["letter"], "nums": c["nums"]} for c in chosen], "card": card, "source": source})
    st.tool_notes.append("최종 선택: " + ", ".join(f"{c['letter']}({' '.join(map(str, c['nums']))})" for c in chosen))
    # 9. 마무리
    say("ppoddo", f"최종으로 정한 {', '.join(picks)} 를 한 번 말하고, 대장님께 재미로만 즐기고 정해 둔 예산 안에서만 사시라고 다정하게 당부한다.",
        f"대장님, 우리가 고른 건 {', '.join(picks)}예요. 재미로만 즐기시고 예산 안에서만 사세요~", False, must=("재미", "예산"))
    emit({"type": "done"})


def _final_picks(a, ask, models, st, ctx):
    letters = [c["letter"] for c in st.cands]
    # (1) AI 가 합의를 JSON 으로
    try:
        raw = ask(models.get("lotto") or "", "너는 회의록 정리자다. JSON 한 개만 출력한다.",
                  ctx + "\n\n위 대화에서 로또와 뽀또가 합의한 최종 선택을 JSON 으로만 써라. 예: {\"picks\":[\"A\",\"C\"]}. 후보에 있는 알파벳 2~3개만.", 80)
        m = re.search(r"\{[\s\S]*\}", raw)
        got = [x for x in (json.loads(m.group(0)).get("picks") or []) if x in letters] if m else []
        got = list(dict.fromkeys(got))[:4]
        if 1 <= len(got) <= 4:
            return got, "ai"
    except Exception:
        pass
    # (2) 마지막 두 줄(로또 제안·뽀또 동의)에서 가장 많이 말한 알파벳
    cnt = {}
    for _, t in st.lines[-3:]:
        for x in re.findall(r"(?<![A-Za-z])([A-H])(?![A-Za-z])", t):
            if x in letters:
                cnt[x] = cnt.get(x, 0) + 1
    if cnt:
        return [k for k, _ in sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))][:3], "dialogue"
    # (3) 인기도(낮을수록 좋음) 낮은 순 3개
    return [c["letter"] for c in sorted(st.cands, key=lambda c: c["raw"]["인기도"])[:3]], "code"
