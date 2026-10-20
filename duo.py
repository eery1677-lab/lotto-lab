"""로또 ↔ 뽀또 대화 만들기.

사실(번호·통계·확률)은 전부 코드가 계산해서 주고, AI 는 말투만 입힌다. AI 가 준 대사에 자료에 없는 숫자가 있거나
추천 조합과 다른 번호 묶음이 나오면 그 대화를 버리고, 같은 사실로 만든 기본 대화(template)를 쓴다.
"""
import json
import re

import chat_tools

WHO = ("lotto", "ppoddo")
TOKEN = re.compile(r"\d[\d,]*(?:\.\d+)?")


def facts(a):
    """대화에 쓸 사실. (사실 목록 문자열, 추천 카드 결과, 조합 리스트, 허용 숫자 집합)"""
    r = chat_tools.run(a, "generate_numbers", {"count": 3, "strength": 10})
    combos = [c["번호"] for c in r["조합"]]
    nxt = a.draws[-1]["no"] + 1
    p = a.randomness["freq_test"]["p"]
    strat = [s for s in a.backtest["strategies"] if s["key"] != "random"]
    sig = [s for s in strat if s["p"] < 0.05]
    ev_avg = r["평균 조합"]["1000원당 기대 환급"]
    ev_best = r["이론상 최대 1000원당 기대 환급"]
    lines = [
        f"이번 추첨은 {nxt}회(토요일 저녁).",
        "1등 확률은 어떤 번호든 똑같이 1/8,145,060. 번호를 미리 맞힐 수는 없다.",
        f"1회~{a.draws[-1]['no']}회({a.n}회) 번호 출현 빈도 검정 p값 {p} → 무작위와 구별되지 않음(핫넘버·콜드넘버 효과 없음).",
        ("예측법(핫넘버·콜드넘버 등)을 검증했더니 모두 무작위와 구별되지 않았다." if not sig else
         "예측법 중 일부가 우연히 p<0.05 였지만 여러 방법을 비교한 우연일 가능성이 크다."),
        "대신 사람들이 덜 고르는 조합을 고르면 1등이 됐을 때 나눠 가질 사람이 줄어든다(확률은 그대로).",
        "추천 조합(사람들이 덜 고르는 하위 10%, 과거 1등과 비슷한 것·인기 모양 제외): "
        + " / ".join(f"{chr(65 + i)} {', '.join(map(str, c))}" for i, c in enumerate(combos)),
        f"1,000원 쓰면 평균 약 {ev_avg}원이 돌아온다(이론상 최대 {ev_best}원). 즉 돈을 버는 방법이 아니라 재미로 즐기는 것.",
        "도박 고민 상담은 국번없이 1336.",
    ]
    text = "\n".join("- " + x for x in lines)
    allowed = set()
    for tok in TOKEN.findall(text):
        allowed.add(tok.replace(",", ""))
    allowed |= {"1", "2", "3", "1000", "1336", "8145060"}
    return text, r, combos, allowed, dict(nxt=nxt, p=p, ev_avg=ev_avg, ev_best=ev_best)


def template(info, combos):
    a = " ".join(map(str, combos[0]))
    return [
        {"who": "ppoddo", "text": f"로또야, 이번 주({info['nxt']}회) 로또 번호는 뭘까? 대장님을 위해 우리가 최선을 다해 분석해 보자!"},
        {"who": "lotto", "text": "좋아, 뽀또! 먼저 솔직하게 말할게. 어떤 번호든 1등 확률은 1/8,145,060으로 똑같아. 미리 맞히는 건 누구도 못 해."},
        {"who": "ppoddo", "text": "에이, 그래도 통계로 알아낼 수 있는 게 있지 않을까?"},
        {"who": "lotto", "text": f"전체 회차 번호 출현을 검정했더니 p값이 {info['p']}야. 무작위와 구별이 안 돼. 핫넘버 같은 건 효과가 없어."},
        {"who": "ppoddo", "text": "그럼 우리가 대장님께 해 드릴 수 있는 건 뭐야?"},
        {"who": "lotto", "text": f"사람들이 덜 고르는 번호로 뽑으면 1등이 됐을 때 나눠 가질 사람이 줄어. 확률은 그대로지만 말이야. 첫 번째는 {a}!"},
        {"who": "ppoddo", "text": "우와, 나머지 조합은 아래 카드에 있어요, 대장님! 마음에 드는 건 담기를 눌러 주세요."},
        {"who": "lotto", "text": f"1,000원에 평균 약 {info['ev_avg']}원이 돌아오는 게임이니까 꼭 재미로만! 힘들면 1336에 전화하세요."},
    ]


SYSTEM = (
    "너는 두 캐릭터의 대화 작가다. '로또'는 안경 쓴 공 박사(차분하고 정확하며 솔직, 반말 섞인 친근한 말투), "
    "'뽀또'는 로또의 여자친구(밝고 사랑스럽고 호기심 많음, 귀여운 말투). 둘은 사용자를 항상 '대장님'이라고 부른다. "
    "사용자가 원한 것은 '둘이 서로 의견을 주고받으며 이번 주 번호를 상의하는 대화'다. "
    "규칙: ① 주어진 사실 밖의 숫자·통계·주장을 만들지 않는다. ② 번호는 반드시 사실에 적힌 추천 조합 그대로만 말한다(바꾸거나 새로 만들지 않는다). "
    "③ 번호를 미리 맞힐 수 있다고 절대 말하지 않는다 — 로또가 솔직하게 정정해 준다. ④ 마지막엔 재미로만 즐기라는 당부를 한다. "
    "⑤ 대사는 8~10줄, 한 줄 90자 이내, 로또와 뽀또가 번갈아 말한다. 첫 줄은 뽀또가 '이번 주 번호는 뭘까?'를 묻는다. "
    "출력은 JSON 한 개만: {\"lines\":[{\"who\":\"ppoddo\",\"text\":\"...\"},{\"who\":\"lotto\",\"text\":\"...\"}]}"
)


def _valid(lines, combos, allowed):
    if not isinstance(lines, list) or not 4 <= len(lines) <= 14:
        return False
    sets = [set(c) for c in combos]
    for ln in lines:
        if not isinstance(ln, dict) or ln.get("who") not in WHO or not isinstance(ln.get("text"), str):
            return False
        t = ln["text"].strip()
        if not t or len(t) > 130:
            return False
        nums = [int(x) for x in re.findall(r"(?<![\d,.])\d{1,2}(?![\d,.])", t) if 1 <= int(x) <= 45]
        if len(nums) >= 3 and not any(set(nums) <= s for s in sets):       # 번호 묶음은 추천 조합과 같아야 한다
            return False
        for tok in TOKEN.findall(t):
            k = tok.replace(",", "")
            if k not in allowed and not (k.isdigit() and int(k) <= 45 and any(int(k) in s for s in sets)):
                return False
    return True


def build(a, ask_llm):
    """ask_llm(system, user) -> 문자열. 실패하면 예외. 돌려주는 값: {lines, card, source}"""
    text, result, combos, allowed, info = facts(a)
    lines, source, why = None, "template", ""
    try:
        raw = ask_llm(SYSTEM, "사실 목록:\n" + text + "\n\n위 사실만 써서 대화를 JSON 으로 써 줘.")
        raw = re.sub(r"<think>[\s\S]*?(</think>|$)", "", raw)
        m = re.search(r"\{[\s\S]*\}", raw)
        cand = json.loads(m.group(0)).get("lines") if m else None
        if _valid(cand, combos, allowed):
            lines, source = [{"who": x["who"], "text": x["text"].strip()} for x in cand], "ai"
        else:
            why = "검증 탈락(자료에 없는 숫자·번호 또는 형식)"
    except Exception as e:
        why = f"AI 호출 실패: {type(e).__name__} {str(e)[:80]}"
    if not lines:
        lines = template(info, combos)
    return {"lines": lines, "card": {"name": "generate_numbers", "result": result}, "source": source, "why": why}
