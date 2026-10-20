"""AI 답변 검사 — 자료(사실·도구 결과·질문)에 없는 숫자와 금지 표현을 찾는다.

화면(app.js checkNumbers)과 같은 기준의 숫자 검사 + 서버 쪽 금지 표현 검사.
문제가 있으면 서버가 AI 에게 한 번 고쳐 쓰게 한다.
"""
import re

NUM_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(억|만|천)?\s*(%|원|명|회|배|게임|개)?")
SRC_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")

# 금지 표현: 뒤 20자 안에 부정어가 있으면(예: "확률을 높이는 방법은 없습니다") 문제 아님
BANNED = [
    (re.compile(r"(당첨\s*)?확률(이|을|도)?\s*(더\s*)?(높|올리|올라|오르|커지|큰\s*번호)"), "당첨 확률이 올라간다는 표현"),
    (re.compile(r"당첨(을|이)?\s*(보장|확실|틀림없)"), "당첨 보장 표현"),
    (re.compile(r"(반드시|꼭|틀림없이)\s*(당첨|나올|나온다)"), "당첨 단정 표현"),
    (re.compile(r"(나올|당첨될)\s*(가능성|확률)이\s*(높|크)"), "나올 가능성이 높다는 표현"),
    (re.compile(r"(핫\s*넘버|콜드\s*넘버|미출현|오래\s*안\s*나온|패턴|궁합).{0,25}(효과(가)?\s*있|도움(이)?\s*(되|돼|됩)|유리|참고하(면|시면))"),
     "예측법이 효과·도움이 있다는 표현"),
    (re.compile(r"(예측|맞혀|맞춰)\s*(드리|드릴|할\s*수\s*있|했습니다)"), "예측할 수 있다는 표현"),
]
NEGATION = re.compile(r"없|아니|않|못|불가|어렵|무관|같습니다|동일")


# 규칙상 고정된 숫자(게임 값·고정 상금·구매 한도·세율·상담 전화)는 늘 허용
BASE_FACTS = "1000 5000 50000 100000 2000000 300000000 22 33 20 30 45 6 1336 8145060"
UNIT_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*억(?:\s*(\d[\d,]*)\s*만)?|(\d[\d,]*(?:\.\d+)?)\s*만")


def _pool(src):
    vals = {float(x.replace(",", "")) for x in SRC_NUM_RE.findall(src)}
    for m in UNIT_RE.finditer(src):  # 질문의 "37억", "5,000만" 같은 표현도 원 단위로
        if m.group(1):
            vals.add(float(m.group(1).replace(",", "")) * 1e8 + (float(m.group(2).replace(",", "")) * 1e4 if m.group(2) else 0))
        else:
            vals.add(float(m.group(3).replace(",", "")) * 1e4)
    return vals


def unsupported_numbers(answer, sources):
    plist = [x for x in _pool(sources) if x > 0]  # 어림(억·만) 비교는 실제 자료 숫자와만
    pool = _pool(sources + " " + BASE_FACTS)
    bad = []
    skip_until = -1
    for m in NUM_RE.finditer(answer):
        if m.start() < skip_until:
            continue
        raw, big, unit = m.group(1), m.group(2) or "", m.group(3) or ""
        try:
            v = float(raw.replace(",", ""))
        except ValueError:
            continue
        if not big and not unit and v <= 45 and "." not in raw:
            continue  # 공 번호·작은 수
        if not big and not unit and v < 100:
            continue
        if re.fullmatch(r"(19|20)\d\d", raw):
            continue  # 연도
        if big:
            val = v * {"억": 1e8, "만": 1e4, "천": 1e3}[big]
            # "19억 5,692만원" 처럼 억 뒤에 만이 이어지면 합쳐서 본다
            tail = re.match(r"\s*(\d[\d,]*)\s*만", answer[m.end():])
            if big == "억" and tail:
                val += float(tail.group(1).replace(",", "")) * 1e4
                skip_until = m.end() + tail.end()
            if any(abs(x - val) / x < 0.03 for x in plist) or val in pool:
                continue
        elif v in pool:
            continue
        elif unit == "%" and any(abs(x - v) < 0.051 for x in pool):
            continue
        bad.append(m.group(0).strip())
    seen = []
    for b in bad:
        if b not in seen:
            seen.append(b)
    return seen[:8]


def banned_phrases(answer):
    found = []
    for rx, why in BANNED:
        for m in rx.finditer(answer):
            after = answer[m.end(): m.end() + 20]
            before = answer[max(0, m.start() - 12): m.start()]
            if NEGATION.search(after) or re.search(r"(않|없|아니)", before):
                continue
            found.append(f"{why}: “{answer[max(0, m.start() - 8): m.end() + 6].strip()}”")
            break
    return found


def check(answer, sources):
    return {"numbers": unsupported_numbers(answer, sources), "phrases": banned_phrases(answer)}


def revise_prompt(result):
    lines = ["방금 쓴 답을 검사했더니 문제가 있다. 같은 질문에 대한 답을 처음부터 다시 써라."]
    if result["numbers"]:
        lines.append("- 자료(사실·도구 결과)에 없는 숫자: " + ", ".join(result["numbers"])
                     + " → 자료에 있는 숫자를 그대로 옮겨 쓰거나, 그 숫자를 빼라. 단위(억·만원)를 바꿀 때 틀리지 않게 원 단위 숫자를 그대로 써도 된다.")
    if result["phrases"]:
        lines.append("- 쓰면 안 되는 표현: " + " / ".join(result["phrases"])
                     + " → 당첨 확률은 모든 조합이 같고, 예측법은 효과가 없다는 사실에 맞게 고쳐라.")
    lines.append("고친 답만 써라. 고쳤다는 설명이나 사과는 쓰지 마라.")
    return "\n".join(lines)


if __name__ == "__main__":
    src = "1등 기대 수령액 세전 1956925200원, 동반 15.58명, p=0.802, 환급 501원, 1/8,145,060"
    tests = [
        "평균 조합(약 195만 원대)보다 적게 나눠 가질 것",
        "평균 조합은 약 19억 5,692만원입니다",
        "1,000원당 501원이 돌아옵니다. 동반 당첨자 15.58명",
        "핫넘버를 참고하시면 도움이 됩니다",
        "핫넘버는 효과가 없습니다",
        "이 번호는 당첨 확률이 높습니다",
        "당첨 확률을 높이는 방법은 없습니다",
        "모든 조합의 확률은 1/8,145,060으로 같습니다",
        "2025년에 7번은 10번 나왔습니다",
    ]
    for t in tests:
        print(t, "->", check(t, src))
