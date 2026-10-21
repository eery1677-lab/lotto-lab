"""로또 확률 연구소 — 로컬 서버 (표준 라이브러리만, 맥·윈도우 공용).

실행: python3 server.py            → http://127.0.0.1:3600 (이 컴퓨터만)
      python3 server.py --lan      → 같은 와이파이 기기(아이패드 등)에서도 접속
      python3 server.py --no-browser
"""
import json
import os
import re
import sys
import threading
import time
import socket
import subprocess
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import lotto_data
import answer_check
import briefing
import chat_tools
import duo
import ai_pick
import meeting
import research
import tickets
from analysis import Analyzer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "web")
PORT = int(os.environ.get("LOTTO_PORT", "3600"))
STATIC_TYPES = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
                ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json"}
DEFAULT_LMS = "http://127.0.0.1:1234"

_lock = threading.Lock()
_state = {"analyzer": None, "updating": False, "last_try": 0.0, "last_error": ""}


# ---------------------------------------------------------------- 데이터
def _rebuild(draws):
    a = Analyzer(draws)
    with _lock:
        _state["analyzer"] = a
    return a


def analyzer():
    with _lock:
        return _state["analyzer"]


def _next_draw_time(last_date):
    """마지막 추첨일 다음 토요일 21시(추첨 후 결과가 올라오는 시각을 넉넉히)."""
    d = datetime.strptime(last_date, "%Y-%m-%d") + timedelta(days=7)
    return d.replace(hour=21, minute=30)


def refresh(force=False):
    """공식 사이트에서 새 회차 받기. force 가 아니면 새 회차가 나왔을 시각 이후에만, 30분에 한 번."""
    a = analyzer()
    now = time.time()
    with _lock:
        if _state["updating"]:
            return False
        if not force:
            if a and datetime.now() < _next_draw_time(a.draws[-1]["date"]):
                return False
            if now - _state["last_try"] < 1800:
                return False
        _state["updating"] = True
        _state["last_try"] = now
    try:
        draws = lotto_data.fetch_all()
        if not a or len(draws) != a.n:
            _rebuild(draws)
            start_briefing()  # 새 회차 → 주간 브리핑(AI 요약)을 백그라운드로
        _state["last_error"] = ""
        return True
    except Exception as e:  # 인터넷 끊김 등 — 저장된 자료로 계속
        _state["last_error"] = f"{type(e).__name__}: {e}"[:200]
        return False
    finally:
        with _lock:
            _state["updating"] = False


_ctx_cache = {}


def model_ctx(base, model):
    """LM Studio 에 로드된 문맥 길이(30초 캐시). 모르면 None."""
    now = time.time()
    hit = _ctx_cache.get((base, model))
    if hit and now - hit[0] < 30:
        return hit[1]
    ctx = None
    try:
        for m in lms_models(base):
            if m["id"] == model and m["loaded"]:
                ctx = m["ctx"]
    except Exception:
        pass
    _ctx_cache[(base, model)] = (now, ctx)
    return ctx


def pick_model():
    """브리핑용 LM Studio 모델: AI 상담에서 마지막으로 쓴 것, 없으면 로드된 첫 모델."""
    base, model = briefing.lms_choice()
    base = base or DEFAULT_LMS
    if model:
        return base, model
    try:
        ms = lms_models(base)
        loaded = [m for m in ms if m["loaded"]] or ms
        return base, (loaded[0]["id"] if loaded else None)
    except Exception:
        return base, None


def start_briefing(force=False):
    a = analyzer()
    if a:
        try:
            briefing.ensure_ai_async(a, _lms_post, pick_model, force=force)
        except Exception:
            pass  # 브리핑은 부가 기능 — 실패해도 사이트는 그대로


def refresh_async(force=False):
    threading.Thread(target=refresh, args=(force,), daemon=True).start()


# ---------------------------------------------------------------- LM Studio
def _lms_base(base):
    base = (base or DEFAULT_LMS).strip().rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    if not re.match(r"^https?://[\w.\-:\[\]]+$", base):
        raise ValueError("LM Studio 주소 형식이 이상합니다 (예: http://127.0.0.1:1234)")
    return base


PERSONA_HEAD = {
    "ppoddo": ("뽀또", "너는 '로또 확률 연구소'의 '뽀또'다(로또의 여자친구, 분홍색 공 캐릭터). 밝고 다정하며 호기심이 많고, 어려운 숫자 이야기도 쉽게 풀어 준다. 그래도 사실과 숫자는 정확하게 말한다.",
               "말투는 밝고 귀여운 존댓말(~요, ~해요)이고 이모지는 쓰지 않는다. 게임은 '로또 6/45' 또는 '복권'이라고 부른다."),
    "kkom": ("꼼꼼이", "너는 '로또 확률 연구소'의 '꼼꼼이'다(회계사·검증 담당, 초록 눈가리개를 쓴 민트색 공 캐릭터). 숫자·비용·세금·예산을 꼼꼼히 따지고, 근거 없는 말은 바로잡는다.",
             "말투는 차분하고 또박또박한 존댓말(~입니다/~예요)로 짧고 정확하게 말하며 이모지는 쓰지 않는다. 게임은 '로또 6/45' 또는 '복권'이라고 부른다."),
}


def persona_prompt(who):
    """대장님이 이름을 부른 캐릭터의 말투로 바꾼다. 첫 줄(정체)과 넷째 줄(말투)만 바꾸고 나머지 규칙은 그대로."""
    if who not in PERSONA_HEAD:
        return SYSTEM_PROMPT
    name, head, tone = PERSONA_HEAD[who]
    lines = SYSTEM_PROMPT.split("\n")
    lines[0], lines[3] = head, tone
    lines[2] = lines[2].replace("저는 로또입니다", f"저는 {name}입니다")
    return "\n".join(lines)


def lms_models(base):
    base = _lms_base(base)
    try:  # LM Studio 전용 API: 로드 여부까지 나옴
        with urllib.request.urlopen(base + "/api/v0/models", timeout=5) as r:
            data = json.loads(r.read().decode("utf-8"))["data"]
        return [{"id": m["id"], "loaded": m.get("state") == "loaded",
                 "ctx": m.get("loaded_context_length") or m.get("max_context_length")}
                for m in data if m.get("type") in ("llm", "vlm")]
    except Exception:
        with urllib.request.urlopen(base + "/v1/models", timeout=5) as r:
            data = json.loads(r.read().decode("utf-8"))["data"]
        return [{"id": m["id"], "loaded": True, "ctx": None} for m in data if "embed" not in m["id"].lower()]


SYSTEM_PROMPT = """너는 '로또 확률 연구소'의 분석 상담가 '로또'다(공 모양의 박사 캐릭터). 수학·확률·통계 전문가처럼 정확하고 정직하게 말한다.
모든 답은 반드시 "대장님,"으로 시작한다. 사용자를 "사장님/고객님/사용자/원장님"이라고 부르지 않는다.
자기소개나 인사말은 묻기 전에는 하지 않고 곧바로 본론을 말한다("저는 로또입니다" 같은 말 금지).
말투는 차분하고 다정한 존댓말(~해요/~합니다)이고 이모지는 쓰지 않는다. 게임은 '로또 6/45' 또는 '복권'이라고 부른다.

[반드시 지킬 것]
1. 로또 번호는 예측할 수 없다. 추첨은 매번 독립이고 모든 조합의 1등 확률은 1/8,145,060 으로 같다.
   "이번 주 당첨 번호", "당첨 확률을 올리는 번호"를 달라고 하면 예측은 불가능하다고 짧게 말하고,
   아래 [코드가 만든 조합]이 있으면 그것을 "당첨 확률은 같지만, 당첨되면 나눠 가질 사람이 적을 것으로 추정되는 조합"으로 소개한다.
2. 숫자는 아래 [사실]과 [코드가 만든 조합]/[검사한 번호]에 있는 것만 쓴다. 새 숫자를 지어내거나 계산해서 만들지 않는다.
   자료에 없으면 "자료에 없습니다"라고 말한다.
3. 핫넘버·콜드넘버·미출현·패턴·궁합수·AI 예측이 효과 있다고 말하지 않는다. [사실]의 예측법 검증 '결론(코드 판정)'을 그대로 따른다.
   어떤 방법의 횟수나 환급률이 조금 높게 나온 것을 "가장 많았다", "참고하면 도움이 된다"처럼 장점으로 말하지 않는다 — 운의 범위다.
4. 미국 등 해외 사례: 매사추세츠 Cash WinFall(이월 분배 규칙의 허점, 예측 아님), 스테판 만델(모든 조합을 사들임, 지금은 규정상 불가)처럼
   '게임 규칙/구매 방식'의 문제였지 번호 예측이 아니었다는 점을 정확히 말한다. 모르는 사례는 지어내지 않는다.
5. 로또의 기대값은 음수(1,000원당 약 500원 환급)다. 여유 돈으로 재미로만, 예산을 정해서 하라고 권한다.
   돈 문제·중독 고민이 보이면 한국도박문제예방치유원 국번없이 1336 을 알려 준다.
6. 한국어로, 짧고 쉽게. 표나 목록은 필요할 때만. 생각 과정(<think>)을 쓰지 말고 답만 쓴다.

[사실 — 동행복권 공식 자료를 코드가 계산]
{facts}
"""

TOOL_RULES = """
[도구 사용 — 이 규칙이 위 규칙보다 우선]
- 특정 회차·날짜의 당첨번호, 번호 하나의 출현 통계, 많이/적게 나온 번호 순위, 번호들이 함께 나온 회차,
  번호 추천, 번호 6개 검사, 대장님 구매 기록 질문은 **반드시 먼저 해당 도구를 불러서** 그 결과로만 답한다.
- 번호 추천은 generate_numbers 결과를 그대로 보여 주고, "당첨 확률은 같지만 당첨되면 나눠 가질 사람이 적을 것으로 추정되는 조합"이라고 소개한다.
- 도구 결과에 있는 숫자만 옮겨 쓴다. 도구 결과끼리 더하거나 나눠서 새 숫자를 만들지 않는다.
- 도구가 '오류'를 돌려주면 그 내용을 그대로 알린다. 도구로 알 수 없는 것은 "자료에 없습니다"라고 말한다.
- 도구 결과의 '주의' 문장은 답에 반영한다(과거 횟수는 앞으로의 확률과 무관).
- 연구·논문·해외 사례·AI 예측·휠링·추첨기·상금 규칙·근거를 묻는 질문은 search_research 를 먼저 부른다.
  찾은 자료의 내용만 쓰고, 답 마지막 줄에 "출처:" 다음에 쓴 자료의 출처 주소를 그대로 적는다(주소를 바꾸거나 지어내지 않는다).
  확인 수준이 '2차'·'미확인'이면 "기사·요약으로만 확인된 내용" / "확인하지 못한 내용"이라고 밝힌다.
"""

RESEARCH = re.compile(r"논문|연구|출처|근거|사례|해외|외국|미국|영국|독일|이스라엘|네덜란드|캐나다|이탈리아|만델|윈폴|winfall|MIT|휠링|"
                      r"LSTM|딥러닝|머신러닝|깃허브|허깅|조작|추첨기|AI\s*예측|인공지능", re.I)
RECOMMEND = re.compile(r"(번호|조합|게임).{0,10}(추천|뽑|골라|만들|생성)|(추천|뽑아|골라|만들어).{0,8}(번호|조합|게임)")


def forced_tool(question):
    """작은 모델이 도구를 빠뜨리기 쉬운 질문은 첫 차례에 그 도구만 주고 반드시 부르게 한다."""
    if _extract_six(question):
        return "check_numbers"
    if RECOMMEND.search(question):
        return "generate_numbers"
    if RESEARCH.search(question):
        return "search_research"
    # 아래도 gemma-4-e4b 가 도구 없이 "조회했습니다"라고 지어낸 일이 있어 강제한다
    if re.search(r"(\d{1,2})\s*(번)?\s*(하고|과|와|랑|이랑|,|및)\s*(\d{1,2}).{0,20}(같이|함께|동시|모두)", question):
        return "find_draws"
    if re.search(r"(가장|제일|많이|적게|자주|덜).{0,8}(나온|나왔|출현|뽑힌)|순위|top|핫\s*넘버\s*(뭐|알려|목록)", question, re.I):
        return "top_numbers"
    if re.search(r"(?<!\d)(\d{1,2})\s*번(은|이|는)?.{0,15}(몇\s*번|몇번|횟수|나왔|안\s*나온|마지막|언제)", question):
        return "number_stats"
    if re.search(r"내\s*(구매|기록|성적|번호\s*결과|손익)|구매\s*기록|손익|예산", question):
        return "my_tickets"
    if re.search(r"\d\s*(억|만\s*원|원)", question) and re.search(r"세후|세금|실수령|떼고|떼면", question):
        return "after_tax"
    if re.search(r"(이번\s*주|지난\s*주|저번\s*주|최신|최근|마지막)\s*(회차)?\s*(로또\s*)?(당첨\s*번호|결과|번호\s*뭐)", question):
        return "get_draw"
    if re.search(r"(?<!최근\s)(?<!최근)(\d{1,4})\s*회(차)?\s*(당첨|번호|결과|1등|몇)|(\d{4})[-./년]\s*\d{1,2}[-./월]\s*\d{1,2}", question):
        return "get_draw"
    return None


NUM_REQUEST = re.compile(r"(번호|조합).{0,8}(추천|뽑|생성|만들|골라|줘|알려)|(추천|뽑아|골라).{0,6}(번호|조합)|이번\s*주|다음\s*주|당첨\s*번호\s*(예측|알려)")


def _extract_six(text):
    nums = [int(x) for x in re.findall(r"(?<!\d)([1-9]|[1-3]\d|4[0-5])(?!\d)", text)]
    uniq = []
    for n in nums:
        if n not in uniq:
            uniq.append(n)
    return sorted(uniq) if len(uniq) == 6 else None


def build_context(a, question):
    """질문에 맞춰 코드가 계산한 추가 자료를 붙인다."""
    extra = []
    six = _extract_six(question)
    if six:
        ev = a.evaluate(six)
        hc = a.history_check(six)
        extra.append(
            f"[검사한 번호 {', '.join(map(str, six))}]\n"
            f"- 1등 확률 1/8,145,060 (다른 조합과 동일)\n"
            f"- 인기도 {ev['popularity']}배(1.0=평균 조합), 무작위 조합 중 하위 {ev['percentile']}% 위치(낮을수록 덜 인기)\n"
            f"- 1등이면 함께 당첨될 사람 평균 {ev['co_winners']}명 추정, 1등 기대 수령액 세전 약 {ev['expected_rank1']:,}원 "
            f"/ 세후 약 {ev['expected_rank1_net']:,}원 (평균 조합 세전 {ev['expected_rank1_avg']:,}원 / 세후 {ev['expected_rank1_net_avg']:,}원)\n"
            f"- 1회부터 매주 이 번호를 샀다면: 1~5등 {hc['prizes'][0]}/{hc['prizes'][1]}/{hc['prizes'][2]}/{hc['prizes'][3]}/{hc['prizes'][4]}회, "
            f"쓴 돈 {hc['spent']:,}원, 받은 돈 {hc['won']:,}원, 최고 {hc['best']['match']}개 일치"
            + (f"({hc['best']['no']}회)" if hc["best"]["no"] else "")
            + (f"\n- 이 조합은 과거 {', '.join(map(str, hc['exact']))}회 1등 번호와 같다" if hc["exact"] else ""))
    elif NUM_REQUEST.search(question):
        combos = a.generate(5, "unpopular", strength=10)
        lines = [f"- {', '.join(map(str, c['nums']))} : 인기도 {c['popularity']}배, 1등 동반 당첨자 약 {c['co_winners']}명, "
                 f"1등 기대 수령액 세전 약 {c['expected_rank1']:,}원 / 세후 약 {c['expected_rank1_net']:,}원" for c in combos]
        extra.append("[코드가 만든 조합 — 운영체제 난수로 무작위 생성 후 비인기 하위 10%만 남김. 당첨 확률은 다른 조합과 같음]\n"
                     + "\n".join(lines) + f"\n(평균 조합의 1등 기대 수령액 세전 약 {combos[0]['expected_rank1_avg']:,}원 "
                     f"/ 세후 약 {combos[0]['expected_rank1_net_avg']:,}원)")
    if re.search(r"내\s*(번호|기록|구매|성적)|구매|샀|손익|얼마나\s*(잃|땄|벌)|예산", question):
        mine = tickets.facts_text(a.draws, a.draws[-1]["no"] + 1)
        extra.append(mine or "[대장님 구매 기록] 저장된 구매 기록이 없음.")
    return a.facts_text() + ("\n\n" + "\n\n".join(extra) if extra else "")


def _lms_post(base, body, stream):
    """LM Studio 호출. 거절(400/422)되면 생각 끄기 옵션 → 도구 순서로 빼고 다시 보낸다.
    돌려주는 값: (응답, 도구를 실제로 보냈는지)."""
    def send(b):
        req = urllib.request.Request(base + "/v1/chat/completions", data=json.dumps(b).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
        # 다른 앱(거래처·삐삐 등)이 다른 모델을 불러오는 순간 LM Studio 가 5xx 를 낼 수 있다 → 잠시 뒤 다시
        for wait in (3, 8, None):
            try:
                return urllib.request.urlopen(req, timeout=600)
            except urllib.error.HTTPError as e:
                if e.code < 500 or wait is None:
                    raise
            except urllib.error.URLError:
                if wait is None:
                    raise
            time.sleep(wait)
    b = dict(body, stream=stream, reasoning_effort="none")
    attempts = [lambda x: x, lambda x: x.pop("reasoning_effort", None),
                lambda x: (x.pop("tools", None), x.pop("tool_choice", None))]
    last = None
    for step in attempts:
        step(b)
        try:
            return send(b), "tools" in b
        except urllib.error.HTTPError as e:
            if e.code not in (400, 422):
                raise
            last = e
    raise last


# ---------------------------------------------------------------- HTTP
# ---------------------------------------------------------------- 로컬 음성 서비스(voice/tts_server.py) 연결
TTS_PORT = int(os.environ.get("LOTTO_TTS_PORT", "3650"))
_tts = {"proc": None, "started": 0.0}


TTS_SPEAKERS = [("sohee", "소희 — 한국어 여성 (추천)"), ("serena", "세레나 — 여성"), ("vivian", "비비안 — 여성"), ("ono_anna", "오노 안나 — 일본어 여성"),
                ("ryan", "라이언 — 남성"), ("aiden", "에이든 — 남성"), ("dylan", "딜런 — 남성"), ("eric", "에릭 — 남성"), ("uncle_fu", "푸 아저씨 — 중년 남성")]
VOICES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice", "voices.json")


def _voices_read():
    try:
        with open(VOICES_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _tts_python():
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice", ".venv")
    for rel in (("Scripts", "pythonw.exe"), ("Scripts", "python.exe"), ("bin", "python")):
        p = os.path.join(d, *rel)
        if os.path.exists(p):
            return p
    return None


def _tts_get(path, timeout=3):
    with urllib.request.urlopen(f"http://127.0.0.1:{TTS_PORT}{path}", timeout=timeout) as r:
        return r.read()


def _ensure_tts():
    """음성 서비스가 꺼져 있으면 한 번 켠다(30초 안에 다시 켜지 않음). 켜져 있으면 True."""
    try:
        _tts_get("/health", 1.5)
        return True
    except Exception:
        pass
    py = _tts_python()
    if not py or time.time() - _tts["started"] < 30:
        return False
    _tts["started"] = time.time()
    root = os.path.dirname(os.path.abspath(__file__))
    log = open(os.path.join(root, "voice", "tts.log"), "ab")
    flags = 0x08000000 if os.name == "nt" else 0     # 콘솔 창 없이
    _tts["proc"] = subprocess.Popen([py, os.path.join(root, "voice", "tts_server.py")], cwd=os.path.join(root, "voice"),
                                    stdout=log, stderr=log, creationflags=flags)
    return False


LAN = {"on": False}


def _local_ips():
    """이 PC 의 접속 주소 후보: Tailscale(100.64~127.x) 과 같은 와이파이."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.append(info[4][0])
    except Exception:
        pass
    out, seen = [], set()
    for ip in ips:
        if not ip or ip in seen or ip.startswith("127.") or ip.startswith("169.254."):
            continue
        seen.add(ip)
        a, b = (int(x) for x in ip.split(".")[:2])
        out.append({"ip": ip, "kind": "tailscale" if a == 100 and 64 <= b <= 127 else "wifi"})
    out.sort(key=lambda x: x["kind"] != "tailscale")
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "LottoLab/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ValueError("요청이 너무 큽니다")
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}") if n else {}

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/summary":
            refresh_async()
            a = analyzer()
            s = a.summary()
            s["status"] = {"updated": lotto_data.updated_at(), "updating": _state["updating"],
                           "error": _state["last_error"],
                           "next_draw": _next_draw_time(a.draws[-1]["date"]).strftime("%Y-%m-%d")}
            return self._json(s)
        if path == "/api/network":
            return self._json({"lan": LAN["on"], "port": PORT, "ips": _local_ips()})
        if path == "/api/ai-picks":
            return self._json({"records": ai_pick.records(analyzer())})
        if path == "/api/tts/voices":
            v = _voices_read()
            out = {k: {"label": c.get("label", k), "speaker": c.get("speaker", "sohee"), "style": c.get("style", ""),
                       "sample": bool(c.get("sample") and os.path.exists(os.path.join(os.path.dirname(VOICES_FILE), c["sample"])))} for k, c in v.items()}
            return self._json({"voices": out, "speakers": [{"id": i, "label": l} for i, l in TTS_SPEAKERS]})
        if path == "/api/tts/status":
            installed = _tts_python() is not None
            try:
                return self._json(dict(json.loads(_tts_get("/health")), installed=installed, running=True))
            except Exception:
                if installed:
                    _ensure_tts()
                return self._json({"installed": installed, "running": False})
        if path == "/api/briefing":
            a = analyzer()
            b = dict(briefing.get(a))
            if not (b.get("ai") or {}).get("status") in ("ok", "rejected"):
                start_briefing()
            b["my"] = briefing.my_result(a, b["no"])
            b["ai_running"] = briefing.is_running(b["no"])
            return self._json(b)
        if path == "/api/model-eval":
            ev = briefing._read(os.path.join(lotto_data.DATA_DIR, "model_eval.json"))
            if not ev:
                return self._json({"models": [], "best": None})
            slim = dict(ev, models=[{k: v for k, v in m.items() if k != "rows"} for m in ev["models"]])
            return self._json(slim)
        if path == "/api/tickets":
            a = analyzer()
            return self._json(tickets.report(a.draws, a.draws[-1]["no"] + 1))
        if path == "/api/draws":
            return self._json(analyzer().draws)
        if path == "/api/lms/models":
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            try:
                return self._json({"models": lms_models(q.get("base", [""])[0])})
            except Exception as e:
                return self._json({"error": f"LM Studio 에 연결할 수 없습니다 ({type(e).__name__})"}, 502)
        return self._static(path)

    def _static(self, path):
        if path == "/":
            path = "/index.html"
        rel = path.lstrip("/")
        ext = os.path.splitext(rel)[1].lower()
        if ".." in rel or rel.startswith(".") or "\\" in rel or ext not in STATIC_TYPES:
            return self._json({"error": "없음"}, 404)
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(STATIC_DIR) or not os.path.isfile(full):
            return self._json({"error": "없음"}, 404)
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", STATIC_TYPES[ext])
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            body = self._body()
        except Exception as e:
            return self._json({"error": str(e)}, 400)
        a = analyzer()
        if path == "/api/update":
            ok = refresh(force=True)
            a = analyzer()
            return self._json({"ok": ok, "draws": a.n, "latest": a.draws[-1]["no"], "error": _state["last_error"]})
        if path == "/api/generate":
            count = max(1, min(10, int(body.get("count", 5))))
            mode = "random" if body.get("mode") == "random" else "unpopular"
            strength = int(body.get("strength", 10))
            strength = strength if strength in (5, 10, 20, 50) else 10
            return self._json({"combos": a.generate(count, mode, strength=strength)})
        if path == "/api/check":
            nums = body.get("nums") or []
            try:
                nums = sorted(int(x) for x in nums)
            except (TypeError, ValueError):
                nums = []
            if len(nums) != 6 or len(set(nums)) != 6 or not all(1 <= x <= 45 for x in nums):
                return self._json({"error": "1~45 사이 서로 다른 숫자 6개를 넣어 주세요"}, 400)
            return self._json({"eval": a.evaluate(nums), "history": a.history_check(nums)})
        if path == "/api/briefing/regenerate":
            start_briefing(force=True)
            return self._json({"ok": True})
        if path.startswith("/api/tickets/"):
            try:
                if path == "/api/tickets/add":
                    tickets.add(body.get("draw") or a.draws[-1]["no"] + 1, body.get("games"),
                                body.get("source") or "직접", body.get("memo") or "")
                elif path == "/api/tickets/delete":
                    tickets.delete(str(body.get("id", "")))
                elif path == "/api/tickets/budget":
                    tickets.set_budget(body.get("amount") or 0)
                else:
                    return self._json({"error": "없음"}, 404)
            except (ValueError, TypeError) as e:
                return self._json({"error": str(e)}, 400)
            return self._json(tickets.report(a.draws, a.draws[-1]["no"] + 1))
        if path == "/api/tts/voices":
            v = _voices_read()
            who, spk, style = str(body.get("who") or ""), str(body.get("speaker") or ""), str(body.get("style") or "").strip()[:200]
            if who not in v or spk not in dict(TTS_SPEAKERS):
                return self._json({"error": "알 수 없는 캐릭터나 목소리"}, 400)
            v[who]["speaker"], v[who]["style"] = spk, style
            tmp = VOICES_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8", newline="") as f:
                json.dump(v, f, ensure_ascii=False, indent=2)
            os.replace(tmp, VOICES_FILE)
            return self._json({"ok": True})
        if path == "/api/tts":
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{TTS_PORT}/speak", data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                             headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    data = r.read()
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return self.wfile.write(data)
            except urllib.error.HTTPError as e:
                return self._json({"error": "음성 합성 실패"}, e.code)
            except Exception:
                _ensure_tts()
                return self._json({"error": "음성 서비스를 켜는 중입니다"}, 503)
        if path == "/api/meeting":
            return self._meeting(a, body)
        if path == "/api/research":
            return self._meeting(a, body, research_mode=True)
        if path == "/api/duo":
            def ask(system, user):
                base = _lms_base(body.get("base"))
                payload = {"model": body.get("model") or "", "temperature": 0.7, "max_tokens": 900,
                           "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
                resp, _ = _lms_post(base, payload, stream=False)
                return json.loads(resp.read().decode("utf-8"))["choices"][0]["message"]["content"] or ""
            return self._json(duo.build(a, ask))
        if path == "/api/chat":
            return self._chat(a, body)
        return self._json({"error": "없음"}, 404)

    def _meeting(self, a, body, research_mode=False):
        """로또·뽀또 회의: 캐릭터마다 다른 모델을 쓸 수 있고, 한 줄씩 SSE 로 내보낸다."""
        try:
            base = _lms_base(body.get("base"))
        except ValueError as e:
            return self._json({"error": str(e)}, 400)
        m = body.get("models") or {}
        models = {"lotto": str(m.get("lotto") or "")[:120], "ppoddo": str(m.get("ppoddo") or m.get("lotto") or "")[:120]}
        models["kkom"] = str(m.get("kkom") or models["ppoddo"])[:120]
        cast = [x for x in (body.get("cast") or ["lotto", "ppoddo"]) if x in ("lotto", "ppoddo", "kkom")]

        def ask(model, system, user, max_tokens):
            payload = {"model": model, "temperature": 0.8, "max_tokens": max_tokens,
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
            resp, _ = _lms_post(base, payload, stream=False)
            return json.loads(resp.read().decode("utf-8"))["choices"][0]["message"]["content"] or ""

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            if body.get("mode") == "ai":
                w = body.get("window"); w = 0 if w in ("all", 0, "0") else (int(w) if str(w).isdigit() else ai_pick.WINDOW)
                ai_pick.run(a, ask, models, self._sse, cast, w)
            elif research_mode:
                research.run(a, ask, models, self._sse, str(body.get("topic") or ""), cast)
            else:
                meeting.run(a, ask, models, self._sse, cast)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        except Exception as e:
            try:
                self._sse({"type": "error", "message": f"{type(e).__name__} {str(e)[:120]}"})
            except Exception:
                pass

    def _sse(self, obj):
        self.wfile.write(("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode("utf-8"))
        self.wfile.flush()

    def _relay(self, upstream):
        """LM Studio 스트림을 화면으로 넘기고, 도구 호출 조각은 모아서 돌려준다."""
        content = ""
        calls = {}
        for line in upstream:
            line = line.strip()
            if not line.startswith(b"data:"):
                continue
            data = line[5:].strip()
            if data == b"[DONE]":
                continue
            try:
                j = json.loads(data.decode("utf-8"))
            except ValueError:
                continue
            ch = (j.get("choices") or [{}])[0]
            delta = ch.get("delta") or ch.get("message") or {}
            for tc in delta.get("tool_calls") or []:
                slot = calls.setdefault(tc.get("index", len(calls)), {"id": "", "name": "", "args": ""})
                slot["id"] = tc.get("id") or slot["id"]
                fn = tc.get("function") or {}
                slot["name"] += fn.get("name") or ""
                args = fn.get("arguments")
                slot["args"] += args if isinstance(args, str) else (json.dumps(args) if args else "")
            if delta.get("content") or delta.get("reasoning_content") or delta.get("reasoning"):
                content += delta.get("content") or ""
                self._sse({"choices": [{"delta": {k: v for k, v in delta.items() if k != "tool_calls"}}]})
        return content, [calls[k] for k in sorted(calls)]

    def _chat(self, a, body):
        try:
            base = _lms_base(body.get("base"))
        except ValueError as e:
            return self._json({"error": str(e)}, 400)
        msgs = [m for m in (body.get("messages") or []) if m.get("role") in ("user", "assistant")][-12:]
        if not msgs or msgs[-1]["role"] != "user":
            return self._json({"error": "질문이 없습니다"}, 400)
        question = str(msgs[-1]["content"])
        try:
            briefing.save_lms_choice(base, body.get("model") or "")
        except OSError:
            pass
        want_tools = body.get("tools") is not False

        who = body.get("persona") if body.get("persona") in PERSONA_HEAD else "lotto"

        def system(tools_on):
            facts = a.facts_text() if tools_on else build_context(a, question)
            return facts, persona_prompt(who).format(facts=facts) + (TOOL_RULES if tools_on else "")

        facts, sys_text = system(want_tools)
        # 문맥이 작게 로드된 모델(예: 다른 앱이 8K 로 다시 불러온 경우)은 지시문·자료만 약 4,100토큰이라 대화를 줄인다
        ctx = model_ctx(base, body.get("model") or "")
        small = bool(ctx) and ctx <= 16384
        keep, cut = (4, 1200) if small else (12, 4000)
        convo = [{"role": "system", "content": sys_text}] + [{"role": m["role"], "content": str(m["content"])[:cut]} for m in msgs[-keep:]]
        payload = {"model": body.get("model") or "", "temperature": 0.3, "max_tokens": 900 if small else 1500}
        first = {}
        if want_tools:
            force = forced_tool(question)
            first = ({"tools": [t for t in chat_tools.TOOLS if t["function"]["name"] == force], "tool_choice": "required"}
                     if force else {"tools": chat_tools.TOOLS})
        try:
            upstream, sent_tools = _lms_post(base, dict(payload, messages=convo, **first), stream=True)
        except Exception as e:
            return self._json({"error": f"LM Studio 호출 실패: {type(e).__name__} {str(e)[:120]}"}, 502)
        if want_tools and not sent_tools:  # 이 모델은 도구를 모름 → 예전 방식(질문에 맞춘 자료)으로
            upstream.close()
            facts, sys_text = system(False)
            convo[0]["content"] = sys_text
            upstream, sent_tools = _lms_post(base, dict(payload, messages=convo), stream=True)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self._sse({"facts": facts, "mode": "tools" if sent_tools else "context"})
            sources = facts + "\n" + question
            content = ""
            for rnd in range(5):
                try:
                    content, calls = self._relay(upstream)
                finally:
                    upstream.close()
                if not calls:
                    break
                convo.append({"role": "assistant", "content": content or "",
                              "tool_calls": [{"id": c["id"] or f"call_{rnd}_{i}", "type": "function",
                                              "function": {"name": c["name"], "arguments": c["args"] or "{}"}}
                                             for i, c in enumerate(calls)]})
                for i, c in enumerate(calls):
                    args = chat_tools.parse_args(c["args"])
                    result = chat_tools.run(a, c["name"], args)
                    text = json.dumps(result, ensure_ascii=False)
                    self._sse({"tool": {"name": c["name"], "label": chat_tools.label(c["name"], args),
                                        "error": result.get("오류")}, "facts_add": text})
                    convo.append({"role": "tool", "tool_call_id": c["id"] or f"call_{rnd}_{i}", "content": text})
                    sources += "\n" + text
                last = rnd == 3  # 마지막 차례에는 도구 없이 답만 하게
                upstream, _ = _lms_post(base, dict(payload, messages=convo,
                                                   **({} if last else {"tools": chat_tools.TOOLS})), stream=True)
            # 답변 검사: 자료에 없는 숫자·금지 표현이 있으면 한 번 고쳐 쓰게 한다
            answer = re.sub(r"<think>[\s\S]*?(</think>|$)", "", content).strip()
            result = answer_check.check(answer, sources)
            if answer and (result["numbers"] or result["phrases"]):
                self._sse({"revise": result})
                fix = convo + [{"role": "assistant", "content": answer},
                               {"role": "user", "content": answer_check.revise_prompt(result)}]
                upstream, _ = _lms_post(base, dict(payload, messages=fix), stream=True)
                self._sse({"replace": True})
                try:
                    content, _ = self._relay(upstream)
                finally:
                    upstream.close()
                answer = re.sub(r"<think>[\s\S]*?(</think>|$)", "", content).strip()
                self._sse({"check": answer_check.check(answer, sources)})
        except (BrokenPipeError, ConnectionResetError):
            pass  # 사용자가 '중지'를 누름
        except Exception as e:  # 도구 실행 뒤 LM Studio 오류 등
            try:
                self._sse({"error": f"{type(e).__name__}: {str(e)[:150]}"})
            except OSError:
                pass


def main():
    lan = "--lan" in sys.argv or os.environ.get("LOTTO_LAN") == "1"
    LAN["on"] = lan
    host = "0.0.0.0" if lan else "127.0.0.1"
    draws = lotto_data.load()
    if not draws:
        print("저장된 자료가 없어 동행복권에서 받는 중…")
        draws = lotto_data.fetch_all()
    _rebuild(draws)
    refresh_async()
    start_briefing()
    url = f"http://127.0.0.1:{PORT}"
    try:
        httpd = ThreadingHTTPServer((host, PORT), Handler)
    except OSError:
        print(f"{PORT} 포트가 이미 사용 중 — 이미 켜져 있으면 브라우저만 엽니다: {url}")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        return
    httpd.daemon_threads = True
    print(f"로또 확률 연구소: {url}" + ("  (같은 와이파이 기기에서도 접속 가능)" if lan else ""))
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
