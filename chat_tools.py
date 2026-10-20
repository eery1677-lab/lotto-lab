"""AI 상담이 부르는 도구 — 모든 숫자는 여기(코드)에서 계산하고 AI 는 결과를 설명만 한다.

LM Studio(OpenAI 호환)의 tools/tool_calls 형식. 각 도구는 (결과 dict) 를 돌려주고,
서버는 결과를 AI 에게 넘기는 동시에 화면의 '숫자 검사' 자료에도 붙인다.
"""
import json
import re

import knowledge
import tickets
from analysis import TAX_BRACKET, TAX_FREE_LIMIT, TICKET_COST, after_tax

TOOLS = [
    {"type": "function", "function": {
        "name": "get_draw",
        "description": "특정 회차(또는 날짜, 생략하면 최신 회차)의 당첨번호·보너스·등수별 당첨자 수와 1인당 금액, 1등 자동/수동 인원을 조회한다.",
        "parameters": {"type": "object", "properties": {
            "no": {"type": "integer", "description": "회차 번호. 예: 1200"},
            "date": {"type": "string", "description": "추첨일 YYYY-MM-DD (회차 대신)"}}}}},
    {"type": "function", "function": {
        "name": "number_stats",
        "description": "번호 하나(1~45)가 당첨번호로 몇 번 나왔는지, 마지막으로 나온 회차, 지금까지 안 나온 기간, 최장 공백을 조회한다. 연도나 최근 N회로 범위를 좁힐 수 있다.",
        "parameters": {"type": "object", "properties": {
            "number": {"type": "integer", "description": "1~45"},
            "year": {"type": "integer", "description": "이 연도의 추첨만 (예: 2025)"},
            "last_n": {"type": "integer", "description": "최근 N회만"}},
            "required": ["number"]}}},
    {"type": "function", "function": {
        "name": "top_numbers",
        "description": "가장 많이(또는 적게) 나온 번호 순위. 연도나 최근 N회로 범위를 좁힐 수 있다. 순위는 과거 기록일 뿐 앞으로를 예측하지 않는다.",
        "parameters": {"type": "object", "properties": {
            "order": {"type": "string", "enum": ["most", "least"], "description": "most=많이, least=적게"},
            "year": {"type": "integer"}, "last_n": {"type": "integer"},
            "limit": {"type": "integer", "description": "몇 개 (기본 10)"}}}}},
    {"type": "function", "function": {
        "name": "find_draws",
        "description": "주어진 번호들이 당첨번호에 함께 들어 있던 회차를 찾는다. 예: 7과 17이 같이 나온 회차.",
        "parameters": {"type": "object", "properties": {
            "numbers": {"type": "array", "items": {"type": "integer"}, "description": "1~6개 번호"},
            "min_match": {"type": "integer", "description": "그중 최소 몇 개가 들어 있어야 하나 (기본: 전부)"}},
            "required": ["numbers"]}}},
    {"type": "function", "function": {
        "name": "generate_numbers",
        "description": "번호 추천 요청에 쓴다. 운영체제 난수로 뽑고, 수동 구매자가 덜 고르는 조합만 남긴다(당첨 확률은 같고, 당첨 시 나눠 가질 사람이 적음).",
        "parameters": {"type": "object", "properties": {
            "count": {"type": "integer", "description": "게임 수 1~10 (기본 5)"},
            "strength": {"type": "integer", "enum": [5, 10, 20], "description": "비인기 하위 몇 % (기본 10)"}}}}},
    {"type": "function", "function": {
        "name": "check_numbers",
        "description": "번호 6개를 검사한다: 인기도, 1등 동반 당첨자, 기대 수령액(세전·세후), 1,000원당 기대 환급, 2002년부터 매주 샀다면의 결과.",
        "parameters": {"type": "object", "properties": {
            "numbers": {"type": "array", "items": {"type": "integer"}, "description": "서로 다른 1~45 숫자 6개"}},
            "required": ["numbers"]}}},
    {"type": "function", "function": {
        "name": "search_research",
        "description": "로또 연구·논문·해외 사례(미국 Cash WinFall, 만델 등)·AI 예측 연구·휠링·추첨기 편향·한국 상금 규칙과 세금·1057회 같은 사건의 근거와 출처를 찾는다. 연구·사례·근거·출처를 묻는 질문에 쓴다.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "찾을 주제. 예: '미국 로또 당첨 사례', 'AI 예측 논문'"}},
            "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "after_tax",
        "description": "당첨금(1인당, 세전)을 넣으면 세금과 실수령액을 계산한다. 세금·실수령액 질문에는 직접 계산하지 말고 반드시 이 도구를 쓴다.",
        "parameters": {"type": "object", "properties": {
            "amount": {"type": "integer", "description": "1인당 당첨금(원, 세전). 예: 3700000000"}},
            "required": ["amount"]}}},
    {"type": "function", "function": {
        "name": "my_tickets",
        "description": "대장님의 구매 기록: 쓴 돈, 받은 돈, 손익, 환급률, 회차별 결과, 이번 달 예산.",
        "parameters": {"type": "object", "properties": {}}}},
]

NAMES_KO = {"search_research": "연구 찾기", "after_tax": "세후 계산", "get_draw": "회차 조회", "number_stats": "번호 통계", "top_numbers": "번호 순위", "find_draws": "회차 찾기",
            "generate_numbers": "번호 생성", "check_numbers": "번호 검사", "my_tickets": "구매 기록"}


def _window(draws, year=None, last_n=None):
    ds = draws
    if year:
        ds = [d for d in ds if d["date"].startswith(str(int(year)))]
    if last_n:
        ds = ds[-max(1, min(int(last_n), len(ds))):]
    return ds


def _draw_info(d):
    names = ["1등", "2등", "3등", "4등", "5등"]
    out = {"회차": d["no"], "추첨일": d["date"], "당첨번호": d["nums"], "보너스": d["bonus"],
           "등수별": {names[i]: {"당첨자": d["winners"][i], "1인당 당첨금(세전)": d["amounts"][i]} for i in range(5)}}
    bt = d.get("rank1_by_type")
    if bt:
        out["1등 구매방식"] = {"자동": bt["auto"], "수동": bt["manual"], "반자동": bt["semi"]}
    return out


def run(a, name, args):
    """도구 실행 → 결과 dict. 잘못된 입력은 {'오류': ...}."""
    draws = a.draws
    try:
        if name == "get_draw":
            d = None
            if args.get("no"):
                no = int(args["no"])
                d = next((x for x in draws if x["no"] == no), None)
                if not d:
                    return {"오류": f"{no}회는 아직 없거나 범위 밖입니다(1~{draws[-1]['no']}회)"}
            elif args.get("date"):
                d = next((x for x in draws if x["date"] == str(args["date"])[:10]), None)
                if not d:
                    return {"오류": f"{args['date']} 에 추첨한 회차가 없습니다(추첨은 토요일)"}
            else:
                d = draws[-1]
            return _draw_info(d)

        if name == "number_stats":
            n = int(args["number"])
            if not 1 <= n <= 45:
                return {"오류": "번호는 1~45 입니다"}
            ds = _window(draws, args.get("year"), args.get("last_n"))
            if not ds:
                return {"오류": "그 범위에 추첨이 없습니다"}
            hits = [d["no"] for d in ds if n in d["nums"]]
            bonus = sum(1 for d in ds if d["bonus"] == n)
            gaps, prev = [], ds[0]["no"] - 1
            for h in hits:
                gaps.append(h - prev - 1)
                prev = h
            return {"번호": n, "범위": f"{ds[0]['no']}~{ds[-1]['no']}회 ({len(ds)}회)",
                    "당첨번호로 나온 횟수": len(hits), "무작위일 때 기대 횟수": round(len(ds) * 6 / 45, 1),
                    "보너스로 나온 횟수": bonus,
                    "마지막으로 나온 회차": hits[-1] if hits else None,
                    "지금까지 안 나온 회차 수": ds[-1]["no"] - hits[-1] if hits else len(ds),
                    "최장 공백(회)": max(gaps + [ds[-1]["no"] - (hits[-1] if hits else ds[0]["no"] - 1)]),
                    "주의": "과거 횟수는 앞으로 나올 확률과 무관하다(예측법 검증에서 확인)"}

        if name == "top_numbers":
            ds = _window(draws, args.get("year"), args.get("last_n"))
            if not ds:
                return {"오류": "그 범위에 추첨이 없습니다"}
            cnt = {k: 0 for k in range(1, 46)}
            for d in ds:
                for x in d["nums"]:
                    cnt[x] += 1
            limit = max(1, min(int(args.get("limit") or 10), 45))
            rev = (args.get("order") or "most") != "least"
            ranked = sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]) if rev else (kv[1], kv[0]))[:limit]
            return {"범위": f"{ds[0]['no']}~{ds[-1]['no']}회 ({len(ds)}회)", "순서": "많이 나온 순" if rev else "적게 나온 순",
                    "순위": [{"번호": k, "횟수": v} for k, v in ranked],
                    "무작위일 때 번호당 기대 횟수": round(len(ds) * 6 / 45, 1),
                    "주의": "이 순위로 고른 번호(핫/콜드)는 예측법 검증에서 무작위와 차이가 없었다"}

        if name == "find_draws":
            nums = sorted({int(x) for x in (args.get("numbers") or [])})
            if not nums or len(nums) > 6 or not all(1 <= x <= 45 for x in nums):
                return {"오류": "1~45 번호 1~6개를 주세요"}
            need = max(1, min(int(args.get("min_match") or len(nums)), len(nums)))
            found = [d for d in draws if len(set(nums) & set(d["nums"])) >= need]
            return {"찾은 번호": nums, "최소 일치": need, "해당 회차 수": len(found), "전체 회차": len(draws),
                    "최근 회차(최대 15개)": [{"회차": d["no"], "추첨일": d["date"], "당첨번호": d["nums"]} for d in found[-15:][::-1]]}

        if name == "generate_numbers":
            count = max(1, min(int(args.get("count") or 5), 10))
            strength = int(args.get("strength") or 10)
            strength = strength if strength in (5, 10, 20) else 10
            combos = a.generate(count, "unpopular", strength=strength)
            return {"방법": f"운영체제 난수 + 수동 구매자 비인기 하위 {strength}%만, 과거 1등과 4개 이상 같은 조합·알려진 인기 모양(연속·등차·용지 일직선) 제외",
                    "1등 확률": "1/8,145,060 (모든 조합 동일)",
                    "조합": [{"번호": c["nums"], "인기도": c["popularity"], "1등 동반 당첨자": c["co_winners"],
                             "1등 기대 수령액 세전": c["expected_rank1"], "세후": c["expected_rank1_net"],
                             "1000원당 기대 환급": c["ev"][0]} for c in combos],
                    "평균 조합": {"1등 기대 수령액 세전": combos[0]["expected_rank1_avg"], "세후": combos[0]["expected_rank1_net_avg"],
                               "1000원당 기대 환급": combos[0]["ev_avg"][0]},
                    "이론상 최대 1000원당 기대 환급": combos[0]["ev_floor"][0]}

        if name == "check_numbers":
            nums = [int(x) for x in (args.get("numbers") or [])]
            if len(nums) != 6 or len(set(nums)) != 6 or not all(1 <= x <= 45 for x in nums):
                return {"오류": "서로 다른 1~45 숫자 6개가 필요합니다"}
            ev = a.evaluate(nums)
            hc = a.history_check(nums)
            return {"번호": ev["nums"], "1등 확률": "1/8,145,060 (모든 조합 동일)", "인기도": ev["popularity"],
                    "무작위 조합 중 위치(하위 %)": ev["percentile"], "1등 동반 당첨자": ev["co_winners"],
                    "1등 기대 수령액 세전": ev["expected_rank1"], "세후": ev["expected_rank1_net"],
                    "평균 조합 세전": ev["expected_rank1_avg"], "1000원당 기대 환급": ev["ev"][0],
                    "과거 1등과 4개 이상 같음": bool(ev["past4"]),
                    "알려진 인기 모양": ev["known_patterns"] or "없음",
                    **({"모양 주의": "이 모양은 당첨번호로 거의 나오지 않아 위 인기도 계산에 반영되지 못했다. 해외 연구상 이런 모양은 수천 명이 같이 사므로 실제 동반 당첨자는 위 추정보다 훨씬 많을 수 있다."}
                       if ev["known_patterns"] else {}),
                    "2002년부터 매주 샀다면": {"1~5등 횟수": hc["prizes"], "쓴 돈": hc["spent"], "받은 돈": hc["won"],
                                         "최고 일치": hc["best"]["match"], "그 회차": hc["best"]["no"],
                                         "과거 1등과 완전히 같은 회차": hc["exact"]}}

        if name == "search_research":
            found = knowledge.search(str(args.get("query") or ""))
            if not found:
                return {"결과": "해당 주제의 조사 자료가 없음", "조사된 주제 목록": knowledge.titles()}
            def note(level):
                if level.startswith("미확인"):
                    return "[확인하지 못한 내용] "
                if level.startswith("2차"):
                    return "[기사·요약으로만 확인된 내용] "
                return ""
            return {"찾은 자료": [{"제목": e["title"], "내용": note(e["level"]) + e["summary"], "확인 수준": e["level"], "출처": e["source"]}
                               for e in found],
                    "안내": "확인 수준이 '2차'나 '미확인'이면 그렇다고 밝히고, 답 끝에 출처 주소를 그대로 적는다."}

        if name == "after_tax":
            amt = int(float(str(args.get("amount")).replace(",", "")))
            if amt < 0:
                return {"오류": "금액이 이상합니다"}
            net = round(after_tax(amt))
            return {"세전 당첨금": amt, "세금": amt - net, "실수령액(세후)": net,
                    "적용 규칙": (f"{TAX_FREE_LIMIT:,}원 이하 비과세" if amt <= TAX_FREE_LIMIT else
                              f"(당첨금 − 구입금액 {TICKET_COST:,}원)에 {TAX_BRACKET:,}원까지 22%, 초과분 33% (지방소득세 포함)")}

        if name == "my_tickets":
            rep = tickets.report(draws, draws[-1]["no"] + 1)
            if not rep["tickets"]:
                return {"구매 기록": "없음 — '내 구매 기록' 화면이나 번호 만들기의 '구매 기록에 담기'로 추가할 수 있다"}
            t = rep["total"]
            return {"총계": {"쓴 돈": t["spent"], "받은 돈": t["won"], "손익": t["net"], "환급률(%)": t["return_pct"],
                           "1~5등 횟수": t["prizes"], "추첨 전 게임": t["pending_games"]},
                    "이번 달 예산": rep["budget"],
                    "최근 기록": [{"회차": r["draw"], "게임 수": len(r["games"]), "상태": "추첨 전" if r["status"] == "pending" else "결과 나옴",
                               "받은 돈": r["won"], "최고 일치": max((g["match"] or 0) for g in r["games"])} for r in rep["tickets"][:8]]}
    except (TypeError, ValueError, KeyError) as e:
        return {"오류": f"입력을 이해하지 못했습니다: {e}"}
    return {"오류": f"없는 도구: {name}"}


def parse_args(raw):
    if isinstance(raw, dict):
        return raw
    try:
        v = json.loads(raw or "{}")
        return v if isinstance(v, dict) else {}
    except ValueError:
        # 작은 모델이 따옴표를 빼먹는 경우 대비: 숫자만 건진다
        nums = [int(x) for x in re.findall(r"\d+", raw or "")]
        return {"numbers": nums, "no": nums[0] if nums else None, "number": nums[0] if nums else None}


def label(name, args):
    ko = NAMES_KO.get(name, name)
    if name == "get_draw" and args.get("no"):
        return f"{ko}: {args['no']}회"
    if name in ("number_stats",) and args.get("number"):
        return f"{ko}: {args['number']}번" + (f" ({args['year']}년)" if args.get("year") else "")
    if name == "search_research" and args.get("query"):
        return f"{ko}: {str(args['query'])[:30]}"
    if name in ("check_numbers", "find_draws") and args.get("numbers"):
        return f"{ko}: {' '.join(map(str, args['numbers']))}"
    return ko
