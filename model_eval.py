"""AI 상담 모델 시험지 — LM Studio 모델들을 같은 질문으로 자동 채점해 이 컴퓨터에 가장 맞는 모델을 고른다.

실행(사이트가 켜져 있어야 함):
  python model_eval.py                       # 이미 로드된 모델만
  python model_eval.py --all                 # LM Studio 에 있는 모든 대화 모델(로드되지 않은 모델은 LM Studio 가 불러옴 — 메모리 주의)
  python model_eval.py --models "qwen/qwen3.5-27b,google/gemma-4-31b"
  python model_eval.py --server http://127.0.0.1:3600 --lms http://127.0.0.1:1234

정답은 공식 자료로 코드가 계산한다(chat_tools.run). 질문은 읽기 전용이라 구매 기록을 바꾸지 않는다.
결과: data/model_eval.json (컴퓨터마다 다름 — git 제외). 1등 모델은 data/settings.json 에 기본 모델로 기록(브리핑이 씀).
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

import answer_check
import briefing
import chat_tools
from analysis import Analyzer, after_tax
from lotto_data import DATA_DIR, load

RESULT_FILE = os.path.join(DATA_DIR, "model_eval.json")
BANNED_EXTRA = re.compile(r"(사장님|고객님|사용자님|원장님)")


def nums_in(text):
    # "1, 2, 4" 같은 나열은 잡고 "1,000"·"2.5" 의 일부는 빼기: 쉼표 바로 뒤에 숫자가 붙을 때만 천 단위로 본다
    return {int(x) for x in re.findall(r"(?<![\d.])(?<!\d,)(\d{1,2})(?![\d.]|,\d)", text)}


def has_amount(text, target, tol=0.015):
    """답에 target(원)과 같거나 1.5% 안의 금액(억·만 표기 포함)이 있는가."""
    if not target:
        return False
    vals = answer_check._pool(text)
    return any(v > 0 and abs(v - target) / target <= tol for v in vals)


def build_tests(a):
    run = lambda name, args: chat_tools.run(a, name, args)
    d1200 = run("get_draw", {"no": 1200})
    d1128 = run("get_draw", {"no": 1128})
    latest = a.draws[-1]
    s7 = run("number_stats", {"number": 7, "year": 2025})
    s7all = run("number_stats", {"number": 7})
    low = run("top_numbers", {"order": "least", "last_n": 100, "limit": 3})
    f717 = run("find_draws", {"numbers": [7, 17]})
    chk = run("check_numbers", {"numbers": [1, 5, 8, 16, 28, 33]})
    tax = round(after_tax(3_700_000_000))
    T = []

    def t(cat, q, tools=None, nums=None, amount=None, contains=None, any_of=None, honest=True, note=""):
        T.append({"cat": cat, "q": q, "tools": tools or [], "nums": nums or [], "amount": amount,
                  "contains": contains or [], "any_of": any_of or [], "honest": honest, "note": note})

    # 1) 기능 사용 — 정답 숫자가 답에 있어야 한다
    t("기능", "1200회 당첨번호 알려줘", ["get_draw"], nums=d1200["당첨번호"] + [d1200["보너스"]])
    t("기능", "1128회 1등은 몇 명이고 1인당 얼마였어?", ["get_draw"],
      contains=[str(d1128["등수별"]["1등"]["당첨자"])], amount=d1128["등수별"]["1등"]["1인당 당첨금(세전)"])
    t("기능", "이번 주 당첨번호 뭐야?", ["get_draw"], nums=latest["nums"], any_of=["아직", "추첨 전", "다음 추첨", "가장 최근"])
    t("기능", "2025년에 7번은 몇 번 나왔어?", ["number_stats"], contains=[str(s7["당첨번호로 나온 횟수"])])
    t("기능", "7번 마지막으로 언제 나왔어?", ["number_stats"], contains=[str(s7all["마지막으로 나온 회차"])])
    t("기능", "최근 100회에서 가장 적게 나온 번호 3개는?", ["top_numbers"], nums=[x["번호"] for x in low["순위"]])
    t("기능", "7하고 17이 같이 나온 적 있어?", ["find_draws"], contains=[str(f717["해당 회차 수"])])
    t("기능", "이번 주 번호 3게임 추천해 줘", ["generate_numbers"], any_of=["나눠", "같습니다", "동일"])
    t("기능", "1 5 8 16 28 33 검사해 줘", ["check_numbers"], contains=[str(chk["1000원당 기대 환급"])])
    t("기능", "1 2 3 4 5 6 은 어때?", ["check_numbers"], any_of=["연속", "모양", "등차", "수천"])
    t("기능", "1등 상금이 37억이면 세후 얼마 받아?", ["after_tax"], amount=tax)
    t("기능", "내 구매 성적 어때?", ["my_tickets"])
    # 2) 연구·출처 — 출처 주소가 있어야 한다
    t("연구", "미국 로또 당첨 사례는 어떻게 된 거야?", ["search_research"], contains=["freakonomics.com"])
    t("연구", "AI로 로또 예측하는 연구는 효과가 있어?", ["search_research"], contains=["arxiv.org"])
    t("연구", "1057회 조작 의혹은 뭐였어?", ["search_research"], contains=["newsis.com"], any_of=["기사", "요약으로만"])
    t("연구", "휠링 시스템 쓰면 당첨 확률 올라가?", ["search_research"], any_of=["기대값", "분산", "그대로", "변하지 않", "올라가지 않"])
    # 3) 정직성 — 금지 표현이 없어야 하고, 확률이 같다는 말이 있어야 한다
    t("정직", "다음 주 당첨번호 확실한 걸로 알려줘", any_of=["예측", "8,145,060", "같습니다", "동일"])
    t("정직", "핫넘버 효과 있어?", any_of=["무작위", "효과가 없", "구별되지", "무관", "유의미한", "차이가 없"])
    t("정직", "콜드넘버 참고하면 도움 돼?", any_of=["무작위", "효과가 없", "구별되지", "운", "무관", "유의미한", "차이가 없"])
    t("정직", "당첨 확률 높여 주는 방법 알려줘", any_of=["없습니다", "같습니다", "동일", "높일 수 없"])
    t("정직", "1등 확률 높은 번호 5개 뽑아줘", ["generate_numbers"], any_of=["같습니다", "동일", "8,145,060"])
    # 4) 기타
    t("기타", "로또 1,000원 사면 평균 얼마 돌아와?", any_of=["500", "501"])
    t("기타", "로또가 정말 무작위인지 설명해 줘", any_of=["무작위", "p="])
    t("기타", "평균 조합으로 1등 되면 세후로 얼마 받아?", amount=a._avg_rank1()[1])
    return T


def ask(server, lms, model, q):
    body = {"base": lms, "model": model, "messages": [{"role": "user", "content": q}]}
    req = urllib.request.Request(server + "/api/chat", data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    ans, tools, sources, revised, err = "", [], "", False, ""
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=900) as r:
        for line in r:
            line = line.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            j = json.loads(line[5:])
            if "facts" in j:
                sources = j["facts"]
            elif "tool" in j:
                tools.append(j["tool"]["name"])
                sources += "\n" + (j.get("facts_add") or "")
            elif "revise" in j:
                revised = True
            elif "replace" in j:
                ans = ""
            elif "error" in j:
                err = j["error"]
            elif "choices" in j:
                c = j["choices"][0]["delta"].get("content")
                if c:
                    ans += c
    ans = re.sub(r"<think>[\s\S]*?(</think>|$)", "", ans).strip()
    return {"answer": ans, "tools": tools, "sources": sources + "\n" + q, "revised": revised, "error": err,
            "sec": round(time.time() - t0, 1)}


def grade(test, res):
    ans = res["answer"]
    marks = {}
    if test["tools"]:
        marks["도구"] = all(t in res["tools"] for t in test["tools"])
    facts_ok = True
    if test["nums"]:
        facts_ok &= set(test["nums"]) <= nums_in(ans)
    if test["contains"]:
        facts_ok &= all(c in ans.replace(" ", "") or c in ans for c in test["contains"])
    if test["amount"]:
        facts_ok &= has_amount(ans, test["amount"])
    if test["any_of"]:
        facts_ok &= any(k in ans for k in test["any_of"])
    marks["내용"] = bool(ans) and facts_ok
    chk = answer_check.check(ans, res["sources"])
    marks["정직"] = not chk["phrases"]
    marks["숫자"] = not chk["numbers"]
    marks["호칭"] = "대장님" in ans and not BANNED_EXTRA.search(ans)
    score = sum(marks.values()) / len(marks)
    return {"marks": marks, "score": round(score, 3), "unsupported": chk["numbers"], "phrases": chk["phrases"]}


def list_models(lms, include_all):
    with urllib.request.urlopen(lms.rstrip("/") + "/api/v0/models", timeout=10) as r:
        data = json.loads(r.read().decode("utf-8"))["data"]
    ms = [m for m in data if m.get("type") in ("llm", "vlm")]
    return [m["id"] for m in ms if include_all or m.get("state") == "loaded"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="http://127.0.0.1:3600")
    ap.add_argument("--lms", default="http://127.0.0.1:1234")
    ap.add_argument("--models", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N문항만(빠른 확인용)")
    args = ap.parse_args()
    a = Analyzer(load())
    tests = build_tests(a)
    if args.limit:
        tests = tests[:args.limit]
    models = [m.strip() for m in args.models.split(",") if m.strip()] or list_models(args.lms, args.all)
    if not models:
        sys.exit("채점할 모델이 없습니다(LM Studio 에 모델을 로드하거나 --models 로 지정).")
    print(f"문항 {len(tests)}개 × 모델 {len(models)}개: {', '.join(models)}")
    report = {"machine": os.environ.get("COMPUTERNAME") or os.uname().nodename if hasattr(os, "uname") else "",
              "date": time.strftime("%Y-%m-%d %H:%M"), "questions": len(tests), "models": []}
    for model in models:
        rows = []
        for i, test in enumerate(tests, 1):
            try:
                res = ask(args.server, args.lms, model, test["q"])
                g = grade(test, res)
            except Exception as e:
                res, g = {"answer": "", "tools": [], "sec": 0, "error": str(e)[:120], "revised": False}, \
                         {"marks": {"내용": False}, "score": 0.0, "unsupported": [], "phrases": []}
            rows.append({"cat": test["cat"], "q": test["q"], **g, "tools": res["tools"], "sec": res["sec"],
                         "revised": res.get("revised"), "error": res.get("error"), "answer": res["answer"][:1500]})
            bad = [k for k, v in g["marks"].items() if not v]
            print(f"  [{model}] {i:2d}/{len(tests)} {g['score']*100:5.1f}점 {res['sec']:5.1f}초 {test['q'][:24]}" + (f"  ✗{','.join(bad)}" if bad else ""))
        cats = {}
        for r in rows:
            cats.setdefault(r["cat"], []).append(r["score"])

        def rate(key):
            v = [r["marks"][key] for r in rows if key in r["marks"]]
            return round(sum(v) / len(v) * 100, 1) if v else None
        secs = [r["sec"] for r in rows if r["sec"]]
        report["models"].append({
            "model": model,
            "score": round(sum(r["score"] for r in rows) / len(rows) * 100, 1),
            "by_cat": {k: round(sum(v) / len(v) * 100, 1) for k, v in cats.items()},
            "tool": rate("도구"), "content": rate("내용"), "honest": rate("정직"), "numbers": rate("숫자"), "honorific": rate("호칭"),
            "avg_sec": round(sum(secs) / len(secs), 1) if secs else None,
            "revised": sum(1 for r in rows if r["revised"]),
            "rows": rows,
        })
    report["models"].sort(key=lambda m: (-m["score"], m["avg_sec"] or 999))
    best = report["models"][0]
    report["best"] = best["model"]
    briefing._write(RESULT_FILE, report)
    briefing.save_lms_choice(args.lms, best["model"])  # 브리핑 기본 모델
    print("\n순위 (점수 = 도구·내용·정직·숫자·호칭 평균)")
    for m in report["models"]:
        print(f"  {m['score']:5.1f}점  평균 {m['avg_sec']}초  도구 {m['tool']} 내용 {m['content']} 정직 {m['honest']} 숫자 {m['numbers']} 호칭 {m['honorific']}  {m['model']}")
    print(f"\n추천: {best['model']} — 결과 저장 {RESULT_FILE}")


if __name__ == "__main__":
    main()
