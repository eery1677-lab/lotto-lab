"""로또 6/45 분석 엔진 — 표준 라이브러리만 사용(맥·윈도우 동일).

원칙: 모든 숫자는 이 코드가 계산한다. AI 는 이 결과를 풀어 쓰기만 한다.
1) 무작위성 검정 — 번호 빈도·합계·홀짝·연번·직전 회차 반복을 정확한 이론 분포와 비교.
2) 예측법 검증 — 핫/콜드/미출현 등 유행하는 방법을 과거 회차에 미리 적용해(미래 정보 사용 없음) 무작위와 비교.
3) 인기 조합 모델 — 회차별 실제 당첨자 수 / 판매량 기준 기대 당첨자 수 = "그 번호를 고른 사람이 얼마나 많았나".
   이것으로 '당첨되면 나눠 가질 사람 수'를 추정한다. 당첨 확률은 어떤 조합이든 같다.
"""
import bisect
import math
import random
import secrets
from math import comb

BALLS = 45
PICK = 6
TOTAL = comb(BALLS, PICK)  # 8,145,060
# 등수별 1게임 확률 (2등=5개+보너스, 3등=5개, 4등=4개, 5등=3개)
RANK_COMBOS = [1, 6, 228, comb(6, 4) * comb(39, 2), comb(6, 3) * comb(39, 3)]
RANK_PROB = [c / TOTAL for c in RANK_COMBOS]
HYPER_MEAN = PICK * PICK / BALLS  # 한 게임이 맞히는 개수의 평균 0.8
HYPER_VAR = PICK * (PICK / BALLS) * (1 - PICK / BALLS) * (BALLS - PICK) / (BALLS - 1)


# ---------------------------------------------------------------- 수학 도구
def _gammq(a, x):
    """정규화 상부 불완전 감마 Q(a, x) — 카이제곱 p값용 (Numerical Recipes)."""
    if x <= 0:
        return 1.0
    gln = math.lgamma(a)
    if x < a + 1:
        ap, s, d = a, 1.0 / a, 1.0 / a
        for _ in range(1000):
            ap += 1
            d *= x / ap
            s += d
            if abs(d) < abs(s) * 1e-15:
                break
        return max(0.0, 1.0 - s * math.exp(-x + a * math.log(x) - gln))
    b = x + 1 - a
    c = 1e300
    d = 1 / b
    h = d
    for i in range(1, 1000):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = 1e-300 if abs(d) < 1e-300 else d
        c = b + an / c
        c = 1e-300 if abs(c) < 1e-300 else c
        d = 1 / d
        de = d * c
        h *= de
        if abs(de - 1) < 1e-15:
            break
    return min(1.0, math.exp(-x + a * math.log(x) - gln) * h)


def chi2_p(stat, df):
    return _gammq(df / 2.0, stat / 2.0)


def normal_p_two(z):
    return math.erfc(abs(z) / math.sqrt(2))


def chi2_test(observed, expected, min_expected=5.0):
    """기대값이 작은 칸은 이웃과 합친 뒤 카이제곱 적합도 검정."""
    obs, exp_ = [], []
    o_acc = e_acc = 0.0
    for o, e in zip(observed, expected):
        o_acc += o
        e_acc += e
        if e_acc >= min_expected:
            obs.append(o_acc)
            exp_.append(e_acc)
            o_acc = e_acc = 0.0
    if e_acc > 0:
        if exp_:
            obs[-1] += o_acc
            exp_[-1] += e_acc
        else:
            obs.append(o_acc)
            exp_.append(e_acc)
    stat = sum((o - e) ** 2 / e for o, e in zip(obs, exp_) if e > 0)
    df = max(1, len(obs) - 1)
    return {"stat": round(stat, 2), "df": df, "p": round(chi2_p(stat, df), 4)}


def _sum_distribution():
    """6개 합계의 정확한 분포(모든 8,145,060 조합) — 동적 계획법."""
    dp = [[0] * 256 for _ in range(PICK + 1)]
    dp[0][0] = 1
    for n in range(1, BALLS + 1):
        for k in range(PICK, 0, -1):
            row, prev = dp[k], dp[k - 1]
            for s in range(255, n - 1, -1):
                if prev[s - n]:
                    row[s] += prev[s - n]
    return [c / TOTAL for c in dp[PICK]]


SUM_PROB = _sum_distribution()


def _solve(a, b):
    """가우스 소거로 a x = b."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        if abs(m[c][c]) < 1e-12:
            raise ValueError("특이 행렬")
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for k in range(c, n + 1):
                    m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def _inverse(a):
    n = len(a)
    cols = []
    for j in range(n):
        e = [1.0 if i == j else 0.0 for i in range(n)]
        cols.append(_solve(a, e))
    return [[cols[j][i] for j in range(n)] for i in range(n)]


def ols(X, y):
    """최소제곱 회귀(절편 포함). 계수·표준오차·t·R²."""
    Xi = [[1.0] + list(r) for r in X]
    k = len(Xi[0])
    xtx = [[sum(r[i] * r[j] for r in Xi) for j in range(k)] for i in range(k)]
    xty = [sum(r[i] * yy for r, yy in zip(Xi, y)) for i in range(k)]
    beta = _solve(xtx, xty)
    pred = [sum(b * v for b, v in zip(beta, r)) for r in Xi]
    resid = [yy - p for yy, p in zip(y, pred)]
    n = len(y)
    sse = sum(e * e for e in resid)
    ybar = sum(y) / n
    sst = sum((yy - ybar) ** 2 for yy in y)
    sigma2 = sse / max(1, n - k)
    inv = _inverse(xtx)
    se = [math.sqrt(max(0.0, inv[i][i] * sigma2)) for i in range(k)]
    return {"beta": beta, "se": se, "r2": 1 - sse / sst if sst else 0.0, "n": n, "sigma": math.sqrt(sigma2)}


# ---------------------------------------------------------------- 인기 조합 특징
# 동행복권 용지: 한 줄 7칸 (1~7, 8~14, … 43~45)
FEATURES = [
    ("le31", "생일 번호(1~31) 개수", "날짜로 고르는 사람이 많아 31 이하 번호가 많을수록 인기"),
]
PATTERNS = [
    ("consec", "연속 번호 쌍 수", "12·13 처럼 붙은 번호"),
    ("prev", "직전 회차 번호 개수", "지난주 당첨번호를 다시 사는 사람"),
    ("col", "용지 같은 세로줄 최대 개수", "용지에 세로로 줄 긋기"),
    ("row", "용지 같은 가로줄 최대 개수", "용지에 가로로 줄 긋기"),
    ("digit", "끝자리 같은 번호 최대 개수", "3·13·23 처럼 끝자리 맞추기"),
    ("mult", "5·7의 배수 위주 정도", "5·10·15… 또는 7·14·21… 같은 규칙 고르기"),
]


def poisson_reg(X, y, offset, iters=50):
    """포아송 회귀(로그 연결, offset) — 뉴턴법. 계수와 정보행렬 역행렬."""
    k = len(X[0]) + 1
    b = [0.0] * k
    b[0] = math.log(sum(y) / sum(math.exp(o) for o in offset))
    H = None
    for _ in range(iters):
        H = [[0.0] * k for _ in range(k)]
        g = [0.0] * k
        for xr, yy, o in zip(X, y, offset):
            xi = [1.0] + list(xr)
            mu = math.exp(o + sum(bb * v for bb, v in zip(b, xi)))
            for i in range(k):
                g[i] += (yy - mu) * xi[i]
                for j in range(i, k):
                    H[i][j] += mu * xi[i] * xi[j]
        for i in range(k):
            for j in range(i):
                H[i][j] = H[j][i]
        step = _solve(H, g)
        b = [bb + s for bb, s in zip(b, step)]
        if max(abs(s) for s in step) < 1e-9:
            break
    # 과산포(분산/평균) 보정
    disp = 0.0
    for xr, yy, o in zip(X, y, offset):
        mu = math.exp(o + b[0] + sum(bb * v for bb, v in zip(b[1:], xr)))
        disp += (yy - mu) ** 2 / mu
    disp /= max(1, len(y) - k)
    inv = _inverse(H)
    se = [math.sqrt(max(0.0, inv[i][i] * max(1.0, disp))) for i in range(k)]
    return {"beta": b, "se": se, "dispersion": disp}


def per_number_weights(rows, key, ridge=1.0):
    """y = a + Σ w_n (당첨번호 6개) — 번호별 인기도(로그). 릿지로 안정화."""
    k = BALLS + 1
    H = [[0.0] * k for _ in range(k)]
    g = [0.0] * k
    for r in rows:
        idx = [0] + r["nums"]
        for i in idx:
            g[i] += r[key]
            for j in idx:
                H[i][j] += 1
    for i in range(1, k):
        H[i][i] += ridge
    return _solve(H, g)


def _corr(a, b):
    ma = sum(a) / len(a)
    mb = sum(b) / len(b)
    sa = math.sqrt(sum((x - ma) ** 2 for x in a))
    sb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb) if sa and sb else 0.0


def features(nums, prev=None):
    s = sorted(nums)
    cols = [0] * 7
    rows = [0] * 7
    digits = [0] * 10
    for n in s:
        cols[(n - 1) % 7] += 1
        rows[(n - 1) // 7] += 1
        digits[n % 10] += 1
    m5 = sum(1 for n in s if n % 5 == 0)
    m7 = sum(1 for n in s if n % 7 == 0)
    return [
        sum(1 for n in s if n <= 31),
        sum(1 for a, b in zip(s, s[1:]) if b == a + 1),
        len(set(s) & set(prev)) if prev else 0,
        max(cols),
        max(rows),
        max(digits),
        max(m5, m7),
    ]


# ---------------------------------------------------------------- 메인 분석
def _tickets(d):
    price = 2000 if d["no"] <= 87 else 1000  # 2004-08(88회)부터 1게임 1,000원
    return d["sales"] / price


def _rank1_pool(d):
    return d["rank1_total"] or d["winners"][0] * d["amounts"][0]


class Analyzer:
    def __init__(self, draws):
        self.draws = draws
        self.n = len(draws)
        self._build()

    # ---------- 1. 무작위성 검정
    def _randomness(self):
        ds = self.draws
        n = self.n
        freq = [0] * (BALLS + 1)
        bonus_freq = [0] * (BALLS + 1)
        last_seen = [0] * (BALLS + 1)
        max_gap = [0] * (BALLS + 1)
        for d in ds:
            for x in d["nums"]:
                gap = d["no"] - last_seen[x] - 1
                max_gap[x] = max(max_gap[x], gap)
                freq[x] += 1
                last_seen[x] = d["no"]
            bonus_freq[d["bonus"]] += 1
        p = PICK / BALLS
        exp_each = n * p
        sd_each = math.sqrt(n * p * (1 - p))
        freq_test = chi2_test(freq[1:], [exp_each] * BALLS)
        numbers = []
        for x in range(1, BALLS + 1):
            numbers.append({
                "n": x,
                "count": freq[x],
                "z": round((freq[x] - exp_each) / sd_each, 2),
                "bonus": bonus_freq[x],
                "gap": ds[-1]["no"] - last_seen[x],
                "max_gap": max(max_gap[x], ds[-1]["no"] - last_seen[x]),
            })
        # 최근 100회만 따로(“요즘 잘 나오는 번호”도 무작위 범위인지)
        recent = ds[-100:]
        rfreq = [0] * (BALLS + 1)
        for d in recent:
            for x in d["nums"]:
                rfreq[x] += 1
        recent_test = chi2_test(rfreq[1:], [len(recent) * p] * BALLS)

        # 합계 (10 단위 구간)
        sums = [sum(d["nums"]) for d in ds]
        bins = list(range(20, 260, 10))
        obs_s, exp_s, labels = [], [], []
        for lo in bins:
            hi = lo + 9
            obs_s.append(sum(1 for s in sums if lo <= s <= hi))
            exp_s.append(n * sum(SUM_PROB[s] for s in range(lo, min(hi, 255) + 1)))
            labels.append(f"{lo}~{hi}")
        sum_test = chi2_test(obs_s, exp_s)
        mean_sum = sum(sums) / n

        # 홀수 개수 (초기하분포: 홀 23개, 짝 22개)
        odd_obs = [0] * 7
        for d in ds:
            odd_obs[sum(1 for x in d["nums"] if x % 2)] += 1
        odd_exp = [n * comb(23, k) * comb(22, 6 - k) / TOTAL for k in range(7)]
        odd_test = chi2_test(odd_obs, odd_exp)

        # 직전 회차와 겹치는 개수 (독립이면 초기하분포)
        rep_obs = [0] * 7
        for a, b in zip(ds, ds[1:]):
            rep_obs[len(set(a["nums"]) & set(b["nums"]))] += 1
        rep_exp = [(n - 1) * comb(6, k) * comb(39, 6 - k) / TOTAL for k in range(7)]
        rep_test = chi2_test(rep_obs, rep_exp)

        # 연속 번호가 하나라도 있는 회차 비율
        p_consec = 1 - comb(40, 6) / TOTAL
        consec_obs = sum(1 for d in ds if any(b - a == 1 for a, b in zip(d["nums"], d["nums"][1:])))
        z_consec = (consec_obs - n * p_consec) / math.sqrt(n * p_consec * (1 - p_consec))

        # 같은 6개 조합이 두 번 나온 적이 있는가 (생일 문제)
        seen = {}
        dup = []
        for d in ds:
            key = tuple(d["nums"])
            if key in seen:
                dup.append([seen[key], d["no"]])
            seen[key] = d["no"]
        p_any_dup = 1 - math.exp(-n * (n - 1) / 2 / TOTAL)

        outliers = [x for x in numbers if abs(x["z"]) >= 1.96]
        return {
            "draws": n,
            "expected_per_number": round(exp_each, 1),
            "sd_per_number": round(sd_each, 1),
            "numbers": numbers,
            "freq_test": freq_test,
            "recent100_test": recent_test,
            "outside_95": len(outliers),
            "outside_95_expected": round(BALLS * 0.05, 1),
            "sum": {"labels": labels, "observed": obs_s, "expected": [round(e, 1) for e in exp_s],
                    "test": sum_test, "mean": round(mean_sum, 1), "theory_mean": 138.0},
            "odd": {"observed": odd_obs, "expected": [round(e, 1) for e in odd_exp], "test": odd_test},
            "repeat": {"observed": rep_obs, "expected": [round(e, 1) for e in rep_exp], "test": rep_test},
            "consecutive": {"observed": consec_obs, "expected": round(n * p_consec, 1),
                            "ratio": round(consec_obs / n * 100, 1), "theory": round(p_consec * 100, 1),
                            "p": round(normal_p_two(z_consec), 4)},
            "duplicates": {"found": dup, "chance": round(p_any_dup * 100, 2)},
        }

    # ---------- 2. 예측법 검증 (워크포워드)
    STRATEGIES = [
        ("random", "무작위(기준)", "아무 번호나 6개 — 비교 기준"),
        ("hot50", "핫넘버(최근 50회 최다)", "최근 50회에 가장 많이 나온 6개"),
        ("cold50", "콜드넘버(최근 50회 최소)", "최근 50회에 가장 적게 나온 6개"),
        ("overdue", "미출현(가장 오래 안 나옴)", "“나올 때가 됐다” — 가장 오래 안 나온 6개"),
        ("hot_all", "역대 최다 출현", "지금까지 가장 많이 나온 6개"),
        ("repeat", "지난주 번호 그대로", "직전 회차 당첨번호 다시 사기"),
        ("pattern", "황금 패턴 필터", "홀짝 3:3·2:4·4:2, 합계 100~175, 연번 1쌍 이하, 고저 균형만 무작위로"),
        ("weighted", "빈도 가중 무작위", "많이 나온 번호일수록 잘 뽑히게 무작위"),
    ]

    @staticmethod
    def _pattern_ok(s):
        odd = sum(1 for x in s if x % 2)
        low = sum(1 for x in s if x <= 22)
        consec = sum(1 for a, b in zip(s, s[1:]) if b == a + 1)
        return 2 <= odd <= 4 and 100 <= sum(s) <= 175 and consec <= 1 and 2 <= low <= 4

    def _backtest(self, start=51):
        ds = self.draws
        rng = random.Random(20021207)  # 결과가 매번 같도록 고정 시드
        res = {k: {"dist": [0] * 7, "spent": 0, "won": 0, "prizes": [0] * 5} for k, _, _ in self.STRATEGIES}
        freq_all = [0] * (BALLS + 1)
        last_seen = [0] * (BALLS + 1)
        window = []
        for d in ds[:start - 1]:
            for x in d["nums"]:
                freq_all[x] += 1
                last_seen[x] = d["no"]
            window.append(d["nums"])
        window = window[-50:]
        for t in range(start - 1, self.n):
            d = ds[t]
            prev = ds[t - 1]
            f50 = [0] * (BALLS + 1)
            for w in window:
                for x in w:
                    f50[x] += 1
            nums = list(range(1, BALLS + 1))
            picks = {
                "random": sorted(rng.sample(nums, 6)),
                "hot50": sorted(sorted(nums, key=lambda x: (-f50[x], x))[:6]),
                "cold50": sorted(sorted(nums, key=lambda x: (f50[x], x))[:6]),
                "overdue": sorted(sorted(nums, key=lambda x: (last_seen[x], x))[:6]),
                "hot_all": sorted(sorted(nums, key=lambda x: (-freq_all[x], x))[:6]),
                "repeat": list(prev["nums"]),
            }
            while True:
                c = sorted(rng.sample(nums, 6))
                if self._pattern_ok(c):
                    picks["pattern"] = c
                    break
            pool = nums[:]
            wts = [freq_all[x] + 1 for x in pool]
            chosen = []
            for _ in range(6):
                x = rng.choices(pool, weights=wts)[0]
                i = pool.index(x)
                pool.pop(i)
                wts.pop(i)
                chosen.append(x)
            picks["weighted"] = sorted(chosen)

            win = set(d["nums"])
            price = 2000 if d["no"] <= 87 else 1000
            for k, c in picks.items():
                m = len(win & set(c))
                r = res[k]
                r["dist"][m] += 1
                r["spent"] += price
                rank = None
                if m == 6:
                    rank = 0
                elif m == 5:
                    rank = 1 if d["bonus"] in c else 2
                elif m == 4:
                    rank = 3
                elif m == 3:
                    rank = 4
                if rank is not None:
                    r["prizes"][rank] += 1
                    r["won"] += d["amounts"][rank]
            # 다음 회차를 위해 갱신
            for x in d["nums"]:
                freq_all[x] += 1
                last_seen[x] = d["no"]
            window.append(d["nums"])
            if len(window) > 50:
                window.pop(0)

        tested = self.n - start + 1
        sd_mean = math.sqrt(HYPER_VAR / tested)
        out = []
        for k, label, desc in self.STRATEGIES:
            r = res[k]
            mean = sum(i * c for i, c in enumerate(r["dist"])) / tested
            z = (mean - HYPER_MEAN) / sd_mean
            hits3 = sum(r["dist"][3:])
            out.append({
                "key": k, "label": label, "desc": desc,
                "mean": round(mean, 4), "z": round(z, 2), "p": round(normal_p_two(z), 3),
                "dist": r["dist"], "hits3": hits3,
                "hits3_rate": round(hits3 / tested * 100, 2),
                "prizes": r["prizes"], "spent": r["spent"], "won": r["won"],
                "return_pct": round(r["won"] / r["spent"] * 100, 1) if r["spent"] else 0,
            })
        p3 = sum(RANK_PROB[2:]) + RANK_PROB[1] + RANK_PROB[0]
        return {
            "from": start, "to": self.n, "tested": tested,
            "theory_mean": HYPER_MEAN, "sd_mean": round(sd_mean, 4),
            "theory_hits3_rate": round(p3 * 100, 2),
            "strategies": out,
        }

    # ---------- 3. 인기 조합 모델
    # 1단계: 5등(3개 일치, 회당 약 260만 명) 당첨자 수 / 기대값 → 번호 45개 각각의 인기도.
    #        당첨자가 많아 잡음이 거의 없다.
    # 2단계: 1등 당첨자 수를 [번호 인기 합 + 모양 특징] 으로 포아송 회귀(판매량 offset).
    # 검증: 앞부분으로만 맞춘 모델을 최근 300회 1등 당첨자 수에 적용.
    def _pop_rows(self, start):
        ds = self.draws
        rows = []
        for t in range(start - 1, self.n):
            d = ds[t]
            tk = _tickets(d)
            e5 = tk * RANK_COMBOS[4] / TOTAL
            if tk <= 0 or d["winners"][4] <= 0:
                continue
            rows.append({
                "no": d["no"], "nums": d["nums"], "prev": ds[t - 1]["nums"],
                "y5": math.log(d["winners"][4] / e5),
                "w1": d["winners"][0], "off1": math.log(tk / TOTAL), "exp1": tk / TOTAL,
            })
        return rows

    @staticmethod
    def _pop_x(w, nums, prev):
        return [sum(w[n] for n in nums)] + features(nums, prev)[1:]

    def _fit_pop(self, rows):
        w = per_number_weights(rows, "y5")
        fit = poisson_reg([self._pop_x(w, r["nums"], r["prev"]) for r in rows],
                          [r["w1"] for r in rows], [r["off1"] for r in rows])
        return w, fit

    def _popularity(self, start=100):
        rows = self._pop_rows(start)
        w, fit = self._fit_pop(rows)
        self.pop_w, self.pop_beta = w, fit["beta"]

        # 표본 밖 검증
        cut = len(rows) - 300
        train, test = rows[:cut], rows[cut:]
        wt, ft = self._fit_pop(train)
        pred = [sum(b * v for b, v in zip(ft["beta"][1:], self._pop_x(wt, r["nums"], r["prev"]))) for r in test]
        corr5 = _corr([sum(wt[n] for n in r["nums"]) for r in test], [r["y5"] for r in test])
        corr1 = _corr(pred, [math.log((r["w1"] + 0.5) / r["exp1"]) for r in test])
        order = sorted(range(len(test)), key=lambda i: pred[i])
        q = len(order) // 4

        def r1(idx):
            return sum(test[i]["w1"] for i in idx) / sum(test[i]["exp1"] for i in idx)

        # 번호별 인기(1등 기준으로 환산: 계수 × w)
        scale = fit["beta"][1]
        wm = sum(w[1:]) / BALLS
        numbers = [{"n": n, "pct": round((math.exp(scale * (w[n] - wm)) - 1) * 100, 1)} for n in range(1, BALLS + 1)]
        coefs = [{"key": "numsum", "label": "번호 인기 합", "desc": "고른 6개 번호 각각의 인기도 합(5등 당첨자 수로 추정)",
                  "effect_pct": None, "t": round(fit["beta"][1] / fit["se"][1], 1) if fit["se"][1] else 0.0}]
        for i, (key, label, desc) in enumerate(PATTERNS):
            b = fit["beta"][i + 2]
            se = fit["se"][i + 2]
            coefs.append({"key": key, "label": label, "desc": desc,
                          "effect_pct": round((math.exp(b) - 1) * 100, 1),
                          "t": round(b / se, 1) if se else 0.0})
        top = sorted(rows, key=lambda r: -(r["w1"] / r["exp1"]))[:10]
        return {
            "from": start, "rows": len(rows), "dispersion": round(fit["dispersion"], 2),
            "numbers": numbers,
            "coefs": coefs,
            "holdout": {"draws": len(test), "corr5": round(corr5, 3), "corr1": round(corr1, 3),
                        "popular_quarter": round(r1(order[-q:]), 2),
                        "unpopular_quarter": round(r1(order[:q]), 2)},
            "top_shared": [{"no": r["no"], "nums": r["nums"], "winners": r["w1"],
                            "times": round(r["w1"] / r["exp1"], 1)} for r in top],
        }

    def _money(self):
        recent = [d for d in self.draws[-52:]]
        tickets = sum(_tickets(d) for d in recent) / len(recent)
        pools = [_rank1_pool(d) for d in recent if d["winners"][0] > 0 and _rank1_pool(d) > 0]
        pool = sum(pools) / len(pools) if pools else 0
        all_d = [d for d in self.draws if d["prize_total"] > 0 and d["sales"] > 0]
        payout = sum(d["prize_total"] for d in all_d) / sum(d["sales"] for d in all_d)
        last52_payout = sum(d["prize_total"] for d in recent) / sum(d["sales"] for d in recent)
        maxw = max(self.draws, key=lambda d: d["winners"][0])
        return {
            "tickets_per_draw": round(tickets),
            "rank1_pool": round(pool),
            "lambda_avg": round(tickets / TOTAL, 2),
            "payout_pct_all": round(payout * 100, 1),
            "payout_pct_recent": round(last52_payout * 100, 1),
            "payout_basis_draws": len(all_d),
            "most_rank1": {"no": maxw["no"], "date": maxw["date"], "nums": maxw["nums"],
                           "winners": maxw["winners"][0], "amount": maxw["amounts"][0]},
            "prob": {"rank": [f"1/{round(1 / p):,}" for p in RANK_PROB]},
            "buy_all_cost": TOTAL * 1000,
        }

    def _build(self):
        self.randomness = self._randomness()
        self.backtest = self._backtest()
        self.popularity = self._popularity()
        self.money = self._money()
        # 무작위 조합의 인기 점수 분포(백분위 계산용)
        rng = random.Random(45)
        prev = self.draws[-1]["nums"]
        ref = sorted(self._log_rel(sorted(rng.sample(range(1, 46), 6)), prev) for _ in range(20000))
        self._ref = ref
        # 평균 조합의 λ 가 판매량 기준 기대값과 같아지도록 보정
        self._log_norm = math.log(sum(math.exp(v) for v in ref) / len(ref))

    # ---------- 조합 평가 · 생성
    def _log_rel(self, nums, prev):
        return sum(bb * v for bb, v in zip(self.pop_beta[1:], self._pop_x(self.pop_w, nums, prev)))

    def evaluate(self, nums, prev=None):
        nums = sorted(nums)
        prev = prev or self.draws[-1]["nums"]
        lr = self._log_rel(nums, prev)
        rel = math.exp(lr - self._log_norm)
        lam = self.money["tickets_per_draw"] / TOTAL * rel  # 나 말고 같은 조합을 산 사람 수(평균)
        share = (1 - math.exp(-lam)) / lam if lam > 0 else 1.0  # E[1/(1+K)], K~Poisson(λ)
        lam_avg = self.money["tickets_per_draw"] / TOTAL
        share_avg = (1 - math.exp(-lam_avg)) / lam_avg
        pct = bisect.bisect_left(self._ref, lr) / len(self._ref) * 100
        feats = features(nums, prev)
        return {
            "nums": nums,
            "popularity": round(rel, 2),          # 1.0 = 평균 조합
            "percentile": round(pct, 1),          # 낮을수록 덜 인기
            "co_winners": round(lam, 2),
            "expected_rank1": round(self.money["rank1_pool"] * share),
            "expected_rank1_avg": round(self.money["rank1_pool"] * share_avg),
            "features": {k: v for (k, _, _), v in zip(FEATURES + PATTERNS, feats)},
            "sum": sum(nums), "odd": sum(1 for x in nums if x % 2),
        }

    def generate(self, count=5, mode="unpopular", strength=10, exclude_past=True):
        """운영체제 난수로 조합을 뽑고, unpopular 면 인기 점수 하위 strength% 만 남긴다.
        과거 1등 조합은 일부러 사는 사람이 많아 뺀다(확률은 똑같다)."""
        sysrand = secrets.SystemRandom()  # 운영체제 암호학적 난수
        prev = self.draws[-1]["nums"]
        past = {tuple(d["nums"]) for d in self.draws} if exclude_past else set()
        cut = self._ref[int(len(self._ref) * strength / 100)]
        out = []
        seen = set()
        tries = 0
        while len(out) < count and tries < 200000:
            tries += 1
            c = tuple(sorted(sysrand.sample(range(1, 46), 6)))
            if c in seen or c in past:
                continue
            if mode == "unpopular" and self._log_rel(list(c), prev) > cut:
                continue
            seen.add(c)
            out.append(self.evaluate(list(c), prev))
        return out

    def history_check(self, nums):
        """이 조합을 1회부터 매주 샀다면."""
        s = set(nums)
        prizes = [0] * 5
        dist = [0] * 7
        won = spent = 0
        best = (0, None)
        for d in self.draws:
            m = len(s & set(d["nums"]))
            dist[m] += 1
            spent += 2000 if d["no"] <= 87 else 1000
            rank = {6: 0, 4: 3, 3: 4}.get(m)
            if m == 5:
                rank = 1 if d["bonus"] in s else 2
            if rank is not None:
                prizes[rank] += 1
                won += d["amounts"][rank]
            if m > best[0]:
                best = (m, d["no"])
        exact = [d["no"] for d in self.draws if set(d["nums"]) == s]
        return {"prizes": prizes, "dist": dist, "spent": spent, "won": won,
                "best": {"match": best[0], "no": best[1]}, "exact": exact}

    # ---------- 화면·AI 용 요약
    def summary(self):
        last = self.draws[-1]
        return {
            "latest": last,
            "recent": self.draws[-12:][::-1],
            "randomness": self.randomness,
            "backtest": self.backtest,
            "popularity": self.popularity,
            "money": self.money,
        }

    def facts_text(self):
        """AI 에게 줄 사실 목록(모든 숫자는 코드 계산)."""
        r, b, p, m = self.randomness, self.backtest, self.popularity, self.money
        last = self.draws[-1]
        lines = [
            f"- 데이터: 1회(2002-12-07)~{last['no']}회({last['date']}) 총 {self.n}회, 동행복권 공식 자료.",
            f"- 최신 {last['no']}회 당첨번호: {', '.join(map(str, last['nums']))} + 보너스 {last['bonus']}, "
            f"1등 {last['winners'][0]}명(1인당 {last['amounts'][0]:,}원).",
            f"- 1등 확률: 1/{TOTAL:,} (어떤 조합이든 동일). 2등 {m['prob']['rank'][1]}, 3등 {m['prob']['rank'][2]}, "
            f"4등 {m['prob']['rank'][3]}, 5등 {m['prob']['rank'][4]}.",
            f"- 번호별 출현 횟수 카이제곱 검정: p={r['freq_test']['p']} (0.05보다 크면 '무작위와 구별 안 됨'). "
            f"번호당 기대 {r['expected_per_number']}회, 95% 범위를 벗어난 번호 {r['outside_95']}개(무작위라도 약 {r['outside_95_expected']}개는 벗어남).",
            f"- 최근 100회 빈도 검정 p={r['recent100_test']['p']}.",
            f"- 합계 분포 검정 p={r['sum']['test']['p']} (실제 평균 {r['sum']['mean']}, 이론 138).",
            f"- 홀수 개수 분포 검정 p={r['odd']['test']['p']}. 직전 회차와 겹치는 개수 분포 검정 p={r['repeat']['test']['p']} (회차끼리 독립).",
            f"- 연속번호 포함 회차 {r['consecutive']['ratio']}% (이론 {r['consecutive']['theory']}%).",
            f"- 예측법 검증({b['from']}~{b['to']}회, {b['tested']}회, 미래 정보 없이 매주 1게임): 이론상 평균 맞힌 개수 {b['theory_mean']}.",
        ]
        for s in b["strategies"]:
            lines.append(f"  · {s['label']}: 평균 {s['mean']}개, p={s['p']}, 3개 이상 {s['hits3']}회, 환급률 {s['return_pct']}%")
        sig = [s["label"] for s in b["strategies"] if s["key"] != "random" and s["p"] < 0.05]
        e3 = b["tested"] * b["theory_hits3_rate"] / 100
        lo3, hi3 = max(0, round(e3 - 1.96 * math.sqrt(e3))), round(e3 + 1.96 * math.sqrt(e3))
        lines.append(
            "  · 결론(코드 판정): "
            + ("모든 방법이 무작위와 통계적으로 구별되지 않는다(p값 모두 0.05 이상). 어떤 방법도 효과가 없다."
               if not sig else f"{', '.join(sig)} 가 p<0.05 이지만 방법 {len(b['strategies']) - 1}개를 비교했으므로 다중 비교에 의한 우연일 가능성이 크다.")
            + f" '3개 이상' 횟수의 이론 기대는 약 {round(e3)}회이고 운만으로 {lo3}~{hi3}회는 흔하다. 환급률 차이는 4등 이상 1~2번에 좌우되는 운이다."
            " 따라서 어느 방법이 '많았다/높았다'고 해서 효과가 있다고 말하면 틀린 말이다.")
        lines += [
            f"- 인기 조합 모델({p['from']}회~ {p['rows']}회): 5등 당첨자 수로 번호별 인기도를 구하고 1등 당첨자 수로 포아송 회귀.",
            "  · 사람들이 많이 고르는 번호(1등 동반 당첨자 증감): "
            + ", ".join(f"{x['n']}번 {x['pct']:+}%" for x in sorted(p["numbers"], key=lambda x: -x["pct"])[:6]),
            "  · 적게 고르는 번호: " + ", ".join(f"{x['n']}번 {x['pct']:+}%" for x in sorted(p["numbers"], key=lambda x: x["pct"])[:6]),
        ]
        for c in p["coefs"][1:]:
            lines.append(f"  · {c['label']} 1 증가 → 1등 동반 당첨자 {c['effect_pct']:+}% (t={c['t']}, |t|<2 이면 근거 약함)")
        lines += [
            f"  · 최근 {p['holdout']['draws']}회 표본 밖 검증: 모델이 '인기'로 본 상위 1/4 회차의 1등 당첨자는 기대의 {p['holdout']['popular_quarter']}배, "
            f"'비인기' 하위 1/4 회차는 {p['holdout']['unpopular_quarter']}배.",
            "  · 주의: 이 모델은 당첨 확률이 아니라 '당첨됐을 때 나눠 가질 사람 수'만 예측한다. 한국은 자동 구매 비중이 커서 효과는 10~25% 정도로 크지 않다.",
            f"- 최근 52회 평균: 회당 {m['tickets_per_draw']:,}게임 판매, 1등 총상금 평균 {m['rank1_pool']:,}원, "
            f"평균 조합의 1등 동반 당첨자 {m['lambda_avg']}명.",
            f"- 환급률(당첨금 총액/판매액): 전체 {m['payout_pct_all']}%, 최근 52회 {m['payout_pct_recent']}%. 즉 1,000원당 평균 약 {round(m['payout_pct_recent'] * 10)}원이 돌아옴.",
            f"- 1등 최다 당첨: {m['most_rank1']['no']}회({m['most_rank1']['date']}) {m['most_rank1']['winners']}명, "
            f"1인당 {m['most_rank1']['amount']:,}원, 번호 {', '.join(map(str, m['most_rank1']['nums']))}.",
            f"- 모든 조합을 사는 비용: {m['buy_all_cost']:,}원 (1인 1회 구매 한도 10만원이라 불가능).",
        ]
        return "\n".join(lines)


if __name__ == "__main__":
    import json
    import time
    from lotto_data import load
    t = time.time()
    a = Analyzer(load())
    print(f"분석 {time.time() - t:.2f}초")
    print(a.facts_text())
    print(json.dumps(a.generate(3), ensure_ascii=False))
    print(a.popularity["top_shared"][:3])
