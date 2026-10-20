"""연구·사례 지식 — 2026-10-20 조사 보고서(출처 포함)를 옮긴 것. 새 내용은 출처를 확인한 뒤에만 추가할 것.

level: 확인 = 원문·초록을 직접 읽음 / 2차 = 기사·요약으로만 확인 / 미확인 = 원문을 열지 못함 / 계산 = 보고서·사이트의 직접 계산 /
       사이트 = 이 사이트가 동행복권 공식 자료로 직접 계산.
"""
import re

ENTRIES = [
    # ---------------------------------------------------------------- 번호 선택 행동
    {"id": "cox1998", "title": "Cox·Daniell·Nicole (1998), 영국 로또 첫 113회 분석",
     "keywords": ["영국", "cox", "최대 엔트로피", "인기 번호", "낮은 번호", "가운데", "7번", "2배", "인기 없는 조합", "기대 상금"],
     "summary": "3·4·5개 일치 당첨자 수로 사람들이 고르는 번호를 추정. 용지 가운데 칸과 낮은 번호를 선호했고, 가장 인기 있는 7은 가장 인기 없는 46보다 25% 더 선택됨. "
                "인기 없는 조합을 고르면 기대 상금이 '2배'가 된다고 주장(영국 규칙 기준). 논문: Using Maximum Entropy to Double One's Expected Winnings in the UK National Lottery, JRSS D 47(4):629-641.",
     "level": "확인(요약)", "source": "https://southampton.ac.uk/~sjc/research/research012.htm"},
    {"id": "haigh", "title": "Haigh (1997 JRSS A, 2004 Plus 해설), 영국 로또 번호 선택",
     "keywords": ["영국", "haigh", "7의 배수", "1~6", "123456", "연속", "40", "생일", "용지 모양", "133명"],
     "summary": "7의 배수 {7,14,21,28,35,42}가 단일 조합 중 최다 선택. 한때 1~6을 약 1만 명이 선택. {7,17,23,32,38,42}가 나온 회차에 1등 133명(줄마다 1개씩, 위아래로 붙지 않게 고른 용지 모양). "
                "연속 3개가 나온 40회는 1등이 기대 135명 대비 약 88명(약 −35%), 연속 쌍이 있는 406회는 약 −25%, 40 넘는 번호가 3개 이상인 58회는 기대의 절반 미만. 1~31(생일) 선호.",
     "level": "확인", "source": "https://plus.maths.org/content/comment/3243 , https://sro.sussex.ac.uk/id/eprint/18912/"},
    {"id": "henze1997", "title": "Henze (1997), 독일 6/49 실제 용지 2,588장",
     "keywords": ["독일", "henze", "용지", "과거 당첨번호", "변형", "50배", "따라 사기", "모양"],
     "summary": "인기 조합은 평균보다 50배 이상 선택됨. 2,588장 중 288장이 과거 당첨번호나 그 변형. 나머지 대부분은 용지 위 모양(미관)으로 채움. "
                "이 사이트가 과거 1등과 4개 이상 같은 조합을 추천에서 빼는 근거.",
     "level": "확인(초록)", "source": "https://ideas.repec.org/a/bla/stanee/v51y1997i2p155-163.html"},
    {"id": "riedwyl", "title": "Riedwyl 필터 (Haigh 인용)",
     "keywords": ["riedwyl", "필터", "합계 177", "가장자리"],
     "summary": "합계 177 이상, 용지 가장자리 번호 3~5개, 몰리지도 흩어지지도 않은 배치로 약 150만 조합을 남기면 상금이 커진다고 주장. 6/49 기준이라 한국 6/45 에 그대로 쓸 수 없음.",
     "level": "2차", "source": "https://plus.maths.org/content/comment/3243"},
    {"id": "polin2021", "title": "Polin 외 (2021), 이스라엘 6/37 수동 1.15억 줄",
     "keywords": ["이스라엘", "polin", "7번", "행", "용지 위쪽", "낮은 번호", "잭팟", "수동"],
     "summary": "7이 118회 모두 1위(최저 3.42%, 무작위 기준 2.7%), 37은 매번 꼴찌. 평균 번호 17.5~17.75(무작위 기준 19)로 낮은 번호 선호. "
                "용지 행별 선택률 1행 3.13% / 2행 2.95% / 3행 2.68% / 4행 2.17%. 잭팟이 클수록 선택이 고르게 퍼짐(R=0.70).",
     "level": "확인", "source": "https://dlab.sauder.ubc.ca/sjdm/journal/21/210322/jdm210322.html"},
    {"id": "wang2016", "title": "Wang 외 (2016), 네덜란드 6/45 175회",
     "keywords": ["네덜란드", "wang", "7번", "8번", "최근 당첨번호", "따라", "자주 사는"],
     "summary": "7이 4.19%, 8이 4.05%(무작위 기준 2.22%). 자주 사는 사람은 최근 당첨번호를 피하고, 가끔 사는 사람은 따라 산다. 가운데 칸·수열·공간 패턴 선호.",
     "level": "2차(초록)", "source": "https://dlab.sauder.ubc.ca/sjdm/journal/15/151103a/jdm151103a.html"},
    {"id": "farrell2000", "title": "Farrell 외 (2000), JBES",
     "keywords": ["farrell", "이월", "고르게", "선택 편향"],
     "summary": "이월이 설계상 예측보다 훨씬 자주 일어남 — 사람들이 번호를 고르게 고르지 않는다는 강한 증거.",
     "level": "확인(초록)", "source": "https://ideas.repec.org/a/bes/jnlbes/v18y2000i2p228-41.html"},
    {"id": "bakermchale", "title": "Baker & McHale (2009, 2011), JRSS A",
     "keywords": ["baker", "mchale", "덩어리", "비슷한 조합", "당첨자 수 분포"],
     "summary": "번호 하나하나의 인기도만 쓴 모델은 당첨자 수 분포를 잘 못 맞춤. '비슷한 조합의 덩어리'를 선호한다는 모델이 꼬리가 긴 분포와 등수 간 당첨자 수 상관을 재현. 세부 수치는 확인 못 함.",
     "level": "확인(초록)", "source": "https://ideas.repec.org/a/bla/jorssa/v174y2011i4p1071-1086.html"},
    {"id": "primes", "title": "'Primes Do Not Pay' (벨기에 10년)",
     "keywords": ["벨기에", "소수", "prime"],
     "summary": "사람들이 소수를 과하게 고르는 경향이 있어 소수 위주 선택은 상금을 줄인다는 연구.",
     "level": "2차", "source": "https://cel.archives-ouvertes.fr/LARJE-UNC/hal-04451846v2"},
    # ---------------------------------------------------------------- 한국
    {"id": "korea_purchase", "title": "한국 로또 자동·수동·반자동 구매 비율",
     "keywords": ["한국", "자동", "수동", "반자동", "비율", "구매 방식"],
     "summary": "동행복권 발표를 인용한 기사 기준 자동 약 65~66%, 수동 약 30%, 반자동 약 4%(예: 1020회 65.4/30.5/4.1, 1055~1061회 평균 66.4/29.6/4.0). "
                "이 사이트가 공식 자료로 잰 1등 당첨자 중 자동 비율은 0.664, 자동 당첨자는 판매량만으로 설명되는 순수 우연(과산포 1.05).",
     "level": "2차 + 사이트", "source": "https://news.tf.co.kr/read/ogmeta/2005694.htm"},
    {"id": "korea_1057", "title": "한국 1057회 — 2등 664장 중 609장 수동",
     "keywords": ["1057", "2등", "664", "수동", "조작", "의혹", "복권위", "패턴", "대각선"],
     "summary": "2등 당첨이 664장으로 무작위 기대(복권위원회 계산 83명 안팎)보다 약 8배 많았고, 그중 609장이 수동. 복권위원회는 원인으로 '기존 당첨번호, 가로·세로·대각선 용지 배열 패턴'을 공식 언급. "
                "한 판매점의 103장 중 100장은 같은 시각 판매 — 한 사람이 같은 번호를 여러 장 산 것으로 추정.",
     "level": "2차(기사)", "source": "https://www.newsis.com/view/NISX20230306_0002215646"},
    {"id": "korea_1128", "title": "한국 1128회(63명)·1162회(36명) — 수동 구매자 사이의 유행 조합",
     "keywords": ["1128", "1162", "63명", "36명", "최다", "유행"],
     "summary": "1128회(1,5,8,16,28,33) 1등 63명 = 자동 11 / 수동 52. 1162회(20,21,22,25,28,29) 1등 36명 = 수동 23 / 자동 11 / 반자동 2. "
                "자동 당첨자는 정상 범위였고 수동 구매자 사이에서 그 조합이 몰린 것.",
     "level": "사이트(동행복권 공식 자료)", "source": "https://www.dhlottery.co.kr (회차별 당첨 결과), https://stg-m.koreaherald.com/article/10438055"},
    {"id": "korea_rules", "title": "한국 로또 6/45 상금 배분·이월·구매 한도",
     "keywords": ["상금", "배분", "이월", "롤다운", "구매 한도", "10만원", "5천원", "복권기금", "규칙", "지급 기한"],
     "summary": "판매액의 50%가 상금(복권기금 43.6%, 판매점 수수료 5.4%, 운영비 1.0%). 4등 5만원·5등 5천원은 고정, 나머지를 1등 75%·2등 12.5%·3등 12.5%. "
                "연속 2회까지만 이월하고 그 뒤에도 1등이 없으면 1·2등 상금을 3등에 합산. 구매 한도: 판매점 1회 10만원, 온라인 회당 5천원. 당첨금 지급 기한 1년.",
     "level": "확인(동행복권)", "source": "https://www.dhlottery.co.kr/lt645/intro"},
    {"id": "korea_tax", "title": "한국 복권 당첨금 세금",
     "keywords": ["세금", "세후", "실수령", "22%", "33%", "비과세", "200만원", "3억"],
     "summary": "200만원 초과~3억원 이하 22%(소득세 20% + 지방소득세 2%), 3억원 초과분 33%(30% + 3%). 200만원 이하는 원천징수 표에 없어 비과세로 읽히나 법 조문은 직접 확인하지 못함.",
     "level": "확인(동행복권) / 비과세 조문 미확인", "source": "https://www.dhlottery.co.kr/guide/wnrGuide"},
    {"id": "korea_hot2004", "title": "2004년 한국 논문 'Are There Hot Numbers in the Lotto Korean Lottery'",
     "keywords": ["한국 논문", "핫넘버 논문", "2004"],
     "summary": "한국 로또의 '핫넘버'를 다룬 논문을 찾았지만 결론은 확인하지 못함. 이 사이트의 자체 검증(핫/콜드 등 7가지 방법)은 모두 무작위와 차이가 없었음.",
     "level": "미확인", "source": "https://koreascience.kr/article/JAKO200411922615107.pub"},
    # ---------------------------------------------------------------- 예측 주장
    {"id": "ml_prediction", "title": "AI·머신러닝(LSTM·트랜스포머) 로또 예측",
     "keywords": ["ai", "인공지능", "머신러닝", "딥러닝", "lstm", "트랜스포머", "예측 모델", "깃허브", "github", "허깅페이스", "논문", "72%"],
     "summary": "시간 순서를 지킨 표본 밖 시험에서 우연보다 나은 성적을 보인 동료심사 연구·저장소·모델은 찾지 못함. 2024년 arXiv 'SmileyNet'(72% 정확도)은 저자가 밝힌 풍자 논문. "
                "Gitee LSTM 프로젝트 README 도 실제로 맞히지 못한다고 적음. 흔한 결함: 창을 먼저 만들고 나중에 나누기·전체 데이터로 정규화하기 같은 누수만으로 성능이 20% 넘게 부풀 수 있음.",
     "level": "확인", "source": "https://arxiv.org/abs/2407.21385 , https://gitee.com/luz/lotto-predict , https://arxiv.org/pdf/2512.06932"},
    {"id": "thamm_cnn", "title": "Alexander Thamm CNN (독일 1955~2023, 4,747회)",
     "keywords": ["cnn", "독일", "thamm", "인기 없는 조합", "환급"],
     "summary": "당첨 예측이 아니라 '인기 없는 조합 찾기'. 독일은 모든 등수를 나눠 갖는 방식이라 한국보다 유리한데도 최고 시뮬레이션 환급은 0.945배(1 미만)였고, 학습 기간과 겹친 자료로 평가함.",
     "level": "확인", "source": "https://www.alexanderthamm.com/en/blog/better-lotto-numbers-with-cnns/"},
    {"id": "wheeling", "title": "휠링(조합 시스템) — Gail Howard, Richard Lustig",
     "keywords": ["휠링", "wheel", "조합 시스템", "보장", "howard", "lustig", "커버링"],
     "summary": "휠은 여러 장을 묶는 커버링 설계일 뿐 표 1장당 기대값은 그대로이고 분산·'최소 n개 보장' 구조만 바뀜. Stömmer(2026)는 흔한 전략이 고를 번호를 좁혀 오히려 확률을 낮춘다고 지적. Howard·Lustig 쪽의 검증 자료는 찾지 못함.",
     "level": "확인 / Howard·Lustig 미확인", "source": "https://arxiv.org/abs/2603.24170 , https://en.wikipedia.org/wiki/Lottery_wheeling"},
    {"id": "venice53", "title": "베네치아 53 (이탈리아, 2005)",
     "keywords": ["베네치아", "53", "이탈리아", "미출현", "오래 안 나온", "지연 번호"],
     "summary": "182회 동안 안 나온 53번에 사람들이 몰려 큰 손실과 사망 사건까지 생김. '오래 안 나온 번호가 나올 때가 됐다'는 근거가 없음 — 이 사이트의 미출현 번호 검증 실패와 같은 결론.",
     "level": "확인", "source": "https://www.quotidiano.net/cronaca/lotto-53-ritardatario-37b1ba08"},
    {"id": "machine_bias", "title": "추첨기·공 편향 연구",
     "keywords": ["추첨기", "공", "편향", "기계", "멕시코", "루마니아", "조작"],
     "summary": "멕시코와 이탈리아 5/90 일부 기간에서 이상 신호(arXiv 0806.4595), 루마니아 2,706회는 통과. 한국 1,246회는 이 사이트의 카이제곱 검정을 모두 통과 — 편향을 노리는 전략은 근거 없음.",
     "level": "확인 + 사이트", "source": "https://arxiv.org/abs/0806.4595"},
    # ---------------------------------------------------------------- 실제 허점 사례
    {"id": "cash_winfall", "title": "미국 매사추세츠 Cash WinFall (Selbee, MIT 팀)",
     "keywords": ["미국", "매사추세츠", "cash winfall", "윈폴", "mit", "selbee", "롤다운", "허점"],
     "summary": "잭팟이 약 200만 달러를 넘고 1등이 없으면 하위 등수로 상금을 몰아주는 규칙(롤다운) 때문에 기대값이 양수가 됨. 10만 달러어치를 사면 이길 확률 72%, 50만 달러 이상이면 거의 무위험. 2012년 폐지. "
                "번호 예측이 아니라 게임 규칙의 허점. 한국도 이월 2회 뒤 3등 합산 규칙이 있지만 회당 약 1.1억 게임이면 1등 없음 확률이 약 1.4×10⁻⁶이고 세 번 연속이어야 해서 사실상 불가능.",
     "level": "확인 + 계산", "source": "https://freakonomics.com/2011/08/a-lottery-loophole-sorry-now-closed-in-massachusetts"},
    {"id": "mandel", "title": "스테판 만델 (버지니아 1992, 7,059,052 조합)",
     "keywords": ["미국", "만델", "mandel", "버지니아", "전 조합", "모든 조합", "14번"],
     "summary": "잭팟이 전 조합 구매 비용보다 크고, 수량 제한이 없고, 집에서 용지를 인쇄할 수 있었던 조건을 이용. 한국은 전 조합 81.45억원, 이월이 거의 없어 기대 환급 약 50%, 1회 10만원(판매점)·5천원(온라인) 한도로 불가능.",
     "level": "확인", "source": "https://thehustle.co/the-man-who-won-the-lottery-14-times"},
    {"id": "ziemba", "title": "Moffitt & Ziemba / Ziemba 외 (캐나다 6/49)",
     "keywords": ["ziemba", "캐나다", "켈리", "kelly", "손익분기", "인기 없는 번호", "7배"],
     "summary": "캐나다 6/49 에서 다른 사람들 판매 2,700만 달러 기준 이월 3,692만 달러가 손익분기. 인기 없는 번호가 나오면 고액 상금이 약 7배. Kelly 방식으로 인기 없는 표를 사면 기대값은 양수지만 확실한 이익까지 '수백만 년'. "
                "매사추세츠에서는 사람들이 따라 하면서 인기 없던 번호가 인기 번호가 되어 이득이 사라짐.",
     "level": "확인(Moffitt·Ziemba 인용)", "source": "https://ar5iv.labs.arxiv.org/html/1801.02959"},
    {"id": "srivastava", "title": "Mohan Srivastava (캐나다 온타리오 즉석복권)",
     "keywords": ["srivastava", "즉석복권", "온타리오", "틱택토", "긁는"],
     "summary": "틱택토 즉석복권은 겉에 보이는 숫자가 당첨 여부 정보를 흘려 약 90% 적중. 추첨식 로또와는 무관.",
     "level": "확인", "source": "https://flowingdata.com/2011/02/07/statistician-cracks-the-scratch-lottery-code/"},
    {"id": "tipton", "title": "Eddie Tipton (미국 Hot Lotto 조작)",
     "keywords": ["미국", "tipton", "hot lotto", "조작", "내부자", "난수"],
     "summary": "복권사 내부자가 난수 생성기 코드를 조작(특정 날짜·시각에만 작동)한 범죄. 한국은 공 추첨 방식이라 해당 없음.",
     "level": "확인", "source": "https://en.wikipedia.org/wiki/Hot_Lotto_fraud_scandal"},
    # ---------------------------------------------------------------- 기대값
    {"id": "ev_ceiling", "title": "인기 없는 조합으로 기대값을 양수로 만들 수 있나",
     "keywords": ["기대값", "양수", "이득", "상한", "최대", "665", "540", "인기 없는", "비인기"],
     "summary": "4·5등 고정 상금이 1,000원당 약 180원. 자동 구매(약 66%)가 모든 조합에 고르게 퍼져 동반 당첨자는 평균의 약 0.67배 아래로 못 내려감. "
                "그래서 최선의 조합도 1,000원당 세전 약 665원 / 세후 약 540원(조사 계산), 이 사이트 계산은 664원 / 522원으로 일치. 기대값이 1,000원을 넘는 경우는 이론상으로도 없음. "
                "독일·캐나다보다 고정 상금 비중과 자동 비율이 높아 한국은 비인기 조합의 이득이 더 작음.",
     "level": "계산 + 사이트", "source": "https://www.dhlottery.co.kr/lt645/intro (상금 규칙), 이 사이트 '인기 번호 분석' 화면"},
]

_TOKEN = re.compile(r"[0-9A-Za-z가-힣]+")
STOP = {"로또", "번호", "당첨", "효과", "있어", "있나", "어떻게", "거야", "뭐야", "사례", "연구", "알려줘", "설명해", "정말", "사람들이", "에서"}


def search(query, limit=3):
    q = (query or "").lower()
    toks = [t for t in _TOKEN.findall(q) if len(t) >= 2 and t not in STOP]
    scored = []
    for e in ENTRIES:
        text = (e["title"] + " " + e["summary"]).lower()
        score = 0.0
        for k in e["keywords"]:
            if k.lower() in q:
                score += 3
        for t in toks:
            if t in text:
                score += 1
            elif len(t) >= 3 and t[:-1] in text:  # 조사 붙은 말: "만델은" → "만델"
                score += 0.5
        if score:
            scored.append((score, e))
    scored.sort(key=lambda x: -x[0])
    return [e for _, e in scored[:limit]]


def titles():
    return [e["title"] for e in ENTRIES]
