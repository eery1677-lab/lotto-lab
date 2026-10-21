"""통계 분석 회의 — 로또·뽀또·꼼꼼이가 당첨 기록(1회~최신)으로 가설을 세우고, 코드가 검정을 돌리고, 서로 검산해 결론을 낸다.

원칙(정직): 검정 결과(p값·표본 수·판정)는 전부 코드가 이미 계산한 값(analysis.py)이고 AI 는 말투만 입힌다.
p ≥ 0.05 는 '효과의 증거가 없음'이지 '효과 없음의 증명'이 아니라는 점, 여러 방법을 비교하면 우연히 낮은 p 가 나올 수 있다는 점(다중 비교)을 꼼꼼이가 짚는다.
AI 대사에 자료에 없는 숫자가 있으면 그 줄은 버리고 기본 대사를 쓴다. 번호를 맞힐 수 있다는 말은 금지.
"""
import re

import meeting

NAME = meeting.NAME

RCOMMON = (
    "너희는 '로또 확률 연구소'의 캐릭터(로또, 뽀또, 꼼꼼이)이고, 지금 대장님을 위해 당첨 기록으로 통계 분석 회의를 한다. 사용자는 반드시 '대장님'이라고만 부른다.\n"
    "[반드시 지킬 것]\n"
    "1. 숫자·통계는 [사실]·[검정 결과]·[검산 메모]에 있는 것만 쓴다. 새 숫자를 지어내거나 계산해서 만들지 않는다. 로또 번호는 예측할 수 없고 모든 조합의 1등 확률은 1/8,145,060 으로 같다.\n"
    "2. p값 해석: p ≥ 0.05 면 '무작위와 구별되지 않는다(효과의 증거가 없다)'이고, '효과가 없다고 증명됐다'는 뜻은 아니다. p < 0.05 여도 여러 개를 비교했다면 우연일 수 있다.\n"
    "3. 서로 직접 대화한다(상대 이름을 부르며). 대장님은 곁에서 지켜보는 분이라 평소엔 '대장님이 ~'처럼 3인칭으로 말하고, 직접 말하는 건 마지막 마무리 한 줄뿐이다. 한 번에 한두 문장, 90자 이내. 이모지·마크다운·따옴표·이름표 없이 말만 쓴다.\n"
)


def _share(n, d):
    return f"{n:,}"


def _verdict(p, k=1):
    """코드가 내리는 판정(AI 는 이 말을 그대로 따른다)."""
    thr = 0.05 / max(1, k)
    if p >= 0.05:
        return "none", "무작위와 구별되지 않음(효과의 증거 없음)"
    if p < thr:
        return "sig", f"기준(p<{thr:.3f})을 넘는 차이가 있음 — 다만 원인은 따로 확인해야 함"
    return "weak", f"p<0.05 이지만 {k}개를 비교했으므로(기준 p<{thr:.3f}) 우연일 가능성이 큼"


def topic_of(text):
    t = text or ""
    if re.search(r"홀짝|홀수|짝수", t):
        return "odd"
    if re.search(r"합계|총합", t):
        return "sum"
    if re.search(r"연속|연번", t):
        return "consec"
    if re.search(r"직전|지난주|겹치|반복|그대로", t):
        return "repeat"
    if re.search(r"빈도|자주|균등|많이 나온 번호|출현", t) and not re.search(r"핫|콜드", t):
        return "freq"
    return "hot"


def build(a, key):
    """주제별 검정 결과. {key,title,hyp,test,n,facts[],chart,p,verdict,vkey,rows[],caveats[]}"""
    r, b = a.randomness, a.backtest
    last = a.draws[-1]["no"]
    if key == "hot":
        strat = [s for s in b["strategies"] if s["key"] != "random"]
        short = {"hot50": "핫50", "cold50": "콜드50", "overdue": "미출현", "hot_all": "역대최다", "repeat": "지난주", "pattern": "패턴필터", "weighted": "빈도가중"}
        best = min(strat, key=lambda s: s["p"]); hot = next(s for s in strat if s["key"] == "hot50")
        vk, vt = _verdict(best["p"], len(strat))
        thr = 0.05 / len(strat)
        return {
            "key": "hot", "title": "핫넘버·콜드넘버 같은 예측법은 효과가 있을까?", "hyp": "최근에 많이 나온 번호가 또 나올 것 같다",
            "test": "과거 데이터로 매주 1게임씩 미래 정보 없이 사 보는 검증 + 평균 맞힌 개수 z검정", "n": b["tested"], "p": best["p"], "vkey": vk, "verdict": vt,
            "facts": [f"검증 구간 {b['from']}~{b['to']}회, {b['tested']:,}회를 매주 1게임씩(미래 정보 없이) 사 본 것으로 계산.", f"이론상 평균 맞힌 개수 {b['theory_mean']}개.",
                      f"핫넘버(최근 50회 최다)는 평균 {hot['mean']}개, p={hot['p']}.", f"가장 낮은 p 는 {best['label']} 의 {best['p']}.", f"비교한 방법은 {len(strat)}개라서 우연을 거르는 기준은 p<{thr:.3f}.",
                      f"판정: {vt}."],
            "chart": {"title": "방법별 평균 맞힌 개수 (점선 = 이론 0.80)", "bars": [{"label": short.get(s["key"], s["label"]), "v": s["mean"], "ref": b["theory_mean"], "p": s["p"]} for s in strat], "unit": "개", "dec": 3},
            "rows": [("검증 구간", f"{b['from']}~{b['to']}회"), ("검증 횟수", f"{b['tested']:,}회"), ("이론 평균 맞힌 개수", f"{b['theory_mean']}개"), ("핫넘버(최근 50회)", f"평균 {hot['mean']}개 · p={hot['p']}"),
                     ("가장 낮은 p", f"{best['label']} {best['p']}"), ("비교한 방법 수", f"{len(strat)}개 (기준 p<{thr:.3f})")],
            "caveats": [f"방법을 {len(strat)}개 비교했으므로 기준은 p<{thr:.3f}(본페로니 보정)이다.", "p 가 크다는 것은 '효과 없음의 증명'이 아니라 '효과의 증거가 없음'이다.", "이론 평균 0.80개와의 차이는 우연으로 나올 수 있는 범위다."],
            "kin": f"p = {best['p']}",
        }
    if key == "freq":
        nums = sorted(r["numbers"], key=lambda x: -x["count"]); top, low = nums[:4], nums[-3:]
        t = r["freq_test"]; vk, vt = _verdict(t["p"])
        return {
            "key": "freq", "title": "자주 나온 번호가 정말 더 자주 나오는 걸까?", "hyp": "많이 나온 번호는 계속 많이 나올 것 같다",
            "test": "카이제곱 적합도 검정(45개 번호가 똑같은 확률로 나오는가)", "n": r["draws"] * 6, "p": t["p"], "vkey": vk, "verdict": vt,
            "facts": [f"{last}회까지 {r['draws']:,}회, 당첨번호 {r['draws'] * 6:,}개를 셈.", f"번호당 기대 출현 {r['expected_per_number']}회(표준편차 {r['sd_per_number']}).",
                      f"카이제곱 {t['stat']}, 자유도 {t['df']}, p={t['p']}.", f"최근 100회만 보면 p={r['recent100_test']['p']}.",
                      f"95% 범위를 벗어난 번호 {r['outside_95']}개(무작위여도 약 {r['outside_95_expected']}개는 벗어남).",
                      "가장 많이 나온 번호 " + ", ".join(f"{x['n']}번({x['count']}회)" for x in top) + ". 가장 적게 나온 번호 " + ", ".join(f"{x['n']}번({x['count']}회)" for x in low) + ".", f"판정: {vt}."],
            "chart": {"title": "번호별 출현 횟수 (점선 = 기대 166.1)", "bars": [{"label": f"{x['n']}번", "v": x["count"], "ref": r["expected_per_number"]} for x in top + low], "unit": "회", "dec": 0},
            "rows": [("분석 기록", f"{r['draws']:,}회 · 번호 {r['draws'] * 6:,}개"), ("기대 출현(번호당)", f"{r['expected_per_number']}회"), ("카이제곱 검정", f"χ²={t['stat']} · df={t['df']} · p={t['p']}"),
                     ("최근 100회", f"p={r['recent100_test']['p']}"), ("95% 범위 밖 번호", f"{r['outside_95']}개 (무작위여도 약 {r['outside_95_expected']}개)")],
            "caveats": ["번호별 횟수 차이는 무작위에서도 이 정도 나온다(95% 범위 밖이 기대 수준).", "p 가 크다는 것은 균등함을 '증명'한 것이 아니라 '치우침의 증거가 없음'이다."],
            "kin": f"p = {t['p']}",
        }
    if key == "odd":
        t = r["odd"]["test"]; vk, vt = _verdict(t["p"]); ob, ex = r["odd"]["observed"], r["odd"]["expected"]
        return {
            "key": "odd", "title": "홀수·짝수 개수가 치우쳐 나올까?", "hyp": "홀수가 더 자주 나오는 것 같다",
            "test": "카이제곱 적합도 검정(당첨번호 6개 중 홀수 개수 분포가 이론과 같은가)", "n": r["draws"], "p": t["p"], "vkey": vk, "verdict": vt,
            "facts": [f"{r['draws']:,}회의 홀수 개수(0~6개) 분포를 이론 분포와 비교.", "관측 " + ", ".join(f"{i}개:{v}회" for i, v in enumerate(ob)) + ".", "기대 " + ", ".join(f"{i}개:{v}회" for i, v in enumerate(ex)) + ".",
                      f"카이제곱 {t['stat']}, 자유도 {t['df']}, p={t['p']}.", f"판정: {vt}."],
            "chart": {"title": "홀수가 N개인 회차 수 (점선 = 이론)", "bars": [{"label": f"홀{i}", "v": ob[i], "ref": ex[i]} for i in range(len(ob))], "unit": "회", "dec": 0},
            "rows": [("분석 기록", f"{r['draws']:,}회"), ("검정", f"χ²={t['stat']} · df={t['df']} · p={t['p']}")], "caveats": ["p 가 크다는 것은 '치우침의 증거가 없음'이다."], "kin": f"p = {t['p']}",
        }
    if key == "sum":
        t = r["sum"]["test"]; vk, vt = _verdict(t["p"]); sm = r["sum"]
        return {
            "key": "sum", "title": "당첨번호 6개의 합계는 이론과 같을까?", "hyp": "합계가 중간 근처에 몰릴 것 같다",
            "test": "카이제곱 적합도 검정(합계 분포가 이론 분포와 같은가)", "n": r["draws"], "p": t["p"], "vkey": vk, "verdict": vt,
            "facts": [f"{r['draws']:,}회의 6개 번호 합계 분포를 이론 분포와 비교.", f"실제 평균 합계 {sm['mean']}, 이론 평균 {sm['theory_mean']}.", f"카이제곱 {t['stat']}, 자유도 {t['df']}, p={t['p']}.", f"판정: {vt}."],
            "chart": {"title": "합계 평균 비교", "bars": [{"label": "실제", "v": sm["mean"], "ref": sm["theory_mean"]}, {"label": "이론", "v": sm["theory_mean"], "ref": sm["theory_mean"]}], "unit": "", "dec": 1},
            "rows": [("분석 기록", f"{r['draws']:,}회"), ("평균 합계", f"실제 {sm['mean']} · 이론 {sm['theory_mean']}"), ("검정", f"χ²={t['stat']} · df={t['df']} · p={t['p']}")], "caveats": ["평균이 이론과 가까운 것은 무작위라면 당연한 결과다."], "kin": f"p = {t['p']}",
        }
    if key == "repeat":
        t = r["repeat"]["test"]; vk, vt = _verdict(t["p"]); ob, ex = r["repeat"]["observed"], r["repeat"]["expected"]
        return {
            "key": "repeat", "title": "지난주 번호가 이번 주에 또 나올까?", "hyp": "지난주에 나온 번호가 또 나올 것 같다",
            "test": "카이제곱 적합도 검정(직전 회차와 겹치는 번호 개수 분포가 이론과 같은가)", "n": r["draws"] - 1, "p": t["p"], "vkey": vk, "verdict": vt,
            "facts": [f"{r['draws'] - 1:,}번의 연속 회차 쌍에서 직전 회차와 겹치는 번호 개수(0~6개)를 이론과 비교.", "관측 " + ", ".join(f"{i}개:{v}회" for i, v in enumerate(ob[:4])) + ".", "기대 " + ", ".join(f"{i}개:{v}회" for i, v in enumerate(ex[:4])) + ".",
                      f"카이제곱 {t['stat']}, 자유도 {t['df']}, p={t['p']}.", f"판정: {vt}."],
            "chart": {"title": "직전 회차와 겹치는 번호 수별 회차 (점선 = 이론)", "bars": [{"label": f"{i}개", "v": ob[i], "ref": ex[i]} for i in range(min(4, len(ob)))], "unit": "회", "dec": 0},
            "rows": [("분석 기록", f"{r['draws'] - 1:,}쌍"), ("검정", f"χ²={t['stat']} · df={t['df']} · p={t['p']}")], "caveats": ["추첨은 매회 독립이라 직전 회차의 영향이 없다는 가설과 일치한다."], "kin": f"p = {t['p']}",
        }
    c = r["consecutive"]; vk, vt = _verdict(c["p"])
    return {
        "key": "consec", "title": "연속된 번호가 생각보다 많이 나올까?", "hyp": "연속번호는 잘 안 나올 것 같다",
        "test": "연속번호가 들어간 회차 비율을 이론값과 비교(이항 검정)", "n": r["draws"], "p": c["p"], "vkey": vk, "verdict": vt,
        "facts": [f"{r['draws']:,}회 중 연속번호가 들어간 회차 {c['observed']}회(비율 {c['ratio']}%).", f"이론상 기대 {c['expected']}회(비율 {c['theory']}%).", f"p={c['p']}.", f"판정: {vt}."],
        "chart": {"title": "연속번호가 들어간 회차 비율 (%)", "bars": [{"label": "실제", "v": c["ratio"], "ref": c["theory"]}, {"label": "이론", "v": c["theory"], "ref": c["theory"]}], "unit": "%", "dec": 1},
        "rows": [("분석 기록", f"{r['draws']:,}회"), ("연속번호 포함", f"{c['observed']}회 ({c['ratio']}%) · 이론 {c['theory']}%"), ("검정", f"p={c['p']}")], "caveats": ["연속번호는 생각보다 자주 나오는 게 정상이다(우리 직감이 연속을 덜 뽑기 때문)."], "kin": f"p = {c['p']}",
    }


def _stages(res):
    p, vkey, vt = res["p"], res["vkey"], res["verdict"]
    return [
        ("ppoddo", f"안건은 '{res['title']}'이다. 네 직감으로 '{res['hyp']}'는 가설을 신나게 말하고, 로또에게 데이터로 확인해 보자고 한다.",
         f"로또야, 오늘 안건은 '{res['title']}'야! 난 {res['hyp']}고 생각해. 데이터로 확인해 보자~", ()),
        ("lotto", f"뽀또의 가설을 귀무가설(H0: 그냥 무작위다, 효과 없다)로 바꿔 말하고, 쓸 검정 방법({res['test']})과 데이터 규모(n={res['n']:,})를 쉬운 말로 설명한 뒤 지금 코드로 돌리겠다고 한다.",
         f"좋아 뽀또. 귀무가설은 '그냥 무작위다'야. {res['test']}로 n={res['n']:,}개를 확인해 볼게.", ()),
        ("ppoddo", "결과가 궁금하다며 한 줄로 뭐라고 나왔는지 묻는다.", "와, 결과 나왔다! 로또야, 한마디로 뭐라고 나왔어?", ()),
        ("lotto", f"[검정 결과]의 p값({p})과 판정({vt})을 쉬운 말로 설명한다. p값이 무슨 뜻인지(우연히 이 정도 차이가 날 확률)도 한 줄 넣는다.",
         f"p값이 {p}야. 판정은 '{vt}'.", ("p",)),
        ("kkom", "[검산 메모]와 대조해 로또의 설명이 맞는지 확인한다. 맞으면 짧게 확인하고, 표본 크기·다중 비교·'증거 없음 ≠ 효과 없음 증명' 중 꼭 필요한 한 가지를 덧붙인다.",
         f"검산했습니다. p={p}이고 판정은 '{vt}'입니다.", ("p", "검산", "맞")),
        ("ppoddo", "결과를 듣고 실제로 번호를 고를 때 어떤 의미인지 대장님 입장에서 궁금해서 로또에게 묻는다.", "그럼 이 결과가 번호 고를 때 도움이 돼?", ()),
        ("lotto", "[검정 결과]를 근거로 번호 선택에 도움이 되는지 솔직하게 답한다(예측은 불가능하고 확률은 같다. 다만 남들이 덜 고르는 조합은 1등 때 나눠 가질 사람이 적다).",
         "번호를 맞히는 데는 도움이 안 돼. 어떤 조합이든 1등 확률은 똑같아.", ()),
        ("kkom", "회의 결과를 숫자 한 줄로 정리한다(검정 이름·p값·판정)와 한계 한 가지를 말한다. [검산 메모]의 숫자만 쓴다.",
         f"결과값: p={p}, 판정 '{vt}'. 이 결론은 지금까지의 기록 기준입니다.", ("p",)),
        ("ppoddo", "대장님께 오늘 회의 결론을 한 번 말하고, 재미로만 즐기시라고 다정하게 당부한다.", "대장님, 오늘 결론은 위 카드 그대로예요! 번호는 재미로만 즐기세요~", ("재미",)),
    ]


def run(a, ask, models, emit, topic_text="", cast=None):
    key = topic_of(topic_text)
    res = build(a, key)
    cast = [x for x in (cast or ["lotto", "ppoddo", "kkom"]) if x in NAME]
    emit({"type": "start", "models": models, "cast": cast, "topic": {"key": res["key"], "title": res["title"]}})
    st = meeting.State()
    facts = "\n".join("- " + x for x in res["facts"])
    memo = facts + "\n- 해석 규칙: p ≥ 0.05 → 효과의 증거가 없음(없다고 증명한 것은 아님). 여러 방법을 비교했으면 낮은 p 가 우연일 수 있음."
    shown = {"result": False}

    def say(who, instruction, fallback, must):
        ctx = f"[사실]\n- 안건: {res['title']}\n- 가설(뽀또의 직감): {res['hyp']}\n- 검정 방법: {res['test']}\n- 표본 수 n={res['n']:,} (데이터: 1회~{a.draws[-1]['no']}회 당첨 기록)\n\n[검정 결과]\n{facts if shown['result'] else '(아직 안 돌림)'}\n\n[검산 메모]\n{memo if who == 'kkom' else '(꼼꼼이만 봄)'}\n\n[지금까지 대화]\n" \
              + ("\n".join(f"{NAME[w]}: {t}" for w, t in st.lines[-7:]) or "(아직 없음)")
        user = ctx + f"\n\n[네 차례] 너는 '{NAME[who]}'. {instruction}\n{NAME[who]}의 말만 한두 문장으로 써라."
        text = ""
        for attempt in range(2):
            try:
                raw = ask(models.get(who) or "", RCOMMON + meeting.PERSONA[who], user + ("" if attempt == 0 else "\n(앞의 답에 자료에 없는 숫자나 예측 단정이 있었다. 숫자를 [검정 결과]·[검산 메모]에서만 가져와 다시 써라.)"), 150)
            except Exception as e:
                emit({"type": "error", "message": f"{NAME[who]}의 AI 호출 실패: {type(e).__name__} {str(e)[:100]}"})
                raise
            t = meeting._clean(raw)
            ok = meeting._valid(t, st, ctx) and (not must or any(k in t for k in must))
            if ok and vkey_ok(t):
                text = t
                break
        text = text or fallback
        st.lines.append((who, text))
        emit({"type": "line", "who": who, "text": text})

    def vkey_ok(t):       # 판정과 반대되는 말(효과 없음인데 '효과가 있다')은 버린다
        if res["vkey"] == "none" and re.search(r"(?<!없)(?<!않)효과가 (있|확인)|통계적으로 유의(하|한)", t):
            return False
        return True

    for i, (who, ins, fb, must) in enumerate(_stages(res)):
        if who not in cast:
            continue
        say(who, ins, fb, must)
        if i == 1:                              # 로또가 검정을 돌린다: 결과가 공중 화면과 카드에 나온다
            shown["result"] = True
            emit({"type": "result", "chart": res["chart"], "title": res["title"], "test": res["test"], "p": res["p"], "verdict": res["verdict"], "vkey": res["vkey"], "kin": res["kin"]})
    report = {"title": res["title"], "hypothesis": res["hyp"], "test": res["test"], "n": res["n"], "p": res["p"], "verdict": res["verdict"], "vkey": res["vkey"], "rows": res["rows"], "caveats": res["caveats"]}
    emit({"type": "report", "report": report})
    emit({"type": "done"})
