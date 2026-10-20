"""로또 연구소 음성 서비스 (로컬 전용, 127.0.0.1:3650).

Qwen3-TTS 를 이 컴퓨터에서 돌려 로또·뽀또 목소리로 읽어 준다. 글은 밖으로 나가지 않는다.
- voices.json 에 목소리를 적는다. "sample" 파일(휴대폰 녹음 10초 안팎)이 있으면 그 목소리를 따라 한다(0.6B Base 복제).
  sample 이 없으면 정해진 목소리(0.6B CustomVoice)에 말투 지시(style)를 줘서 읽는다.
- POST /speak {"text": "...", "voice": "lotto"}  → audio/wav        GET /health → 상태
- 윈도우(NVIDIA)·맥(MPS)·CPU 를 자동으로 고른다. 모델은 처음 쓸 때 올린다.
실행:  voice/.venv/Scripts/python voice/tts_server.py   (맥: voice/.venv/bin/python voice/tts_server.py)
"""
import hashlib
import io
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("LOTTO_TTS_PORT", "3650"))
BASE_MODEL = os.environ.get("LOTTO_TTS_BASE", "Qwen/Qwen3-TTS-12Hz-0.6B-Base")
CUSTOM_MODEL = os.environ.get("LOTTO_TTS_CUSTOM", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")
LOCK = threading.Lock()          # 모델은 한 번에 한 문장씩
STATE = {"device": None, "models": {}, "prompts": {}, "cache": {}, "last_error": "", "loading": ""}


def voices():
    try:
        with open(os.path.join(HERE, "voices.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def device():
    if STATE["device"]:
        return STATE["device"]
    import torch
    if torch.cuda.is_available():
        d = "cuda"
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        d = "mps"
    else:
        d = "cpu"
    STATE["device"] = d
    return d


def model(kind):
    if kind in STATE["models"]:
        return STATE["models"][kind]
    import torch
    from qwen_tts import Qwen3TTSModel
    name = BASE_MODEL if kind == "base" else CUSTOM_MODEL
    d = device()
    STATE["loading"] = name
    t0 = time.time()
    m = Qwen3TTSModel.from_pretrained(name, device_map=d, dtype=torch.float32 if d == "cpu" else torch.bfloat16)
    STATE["models"][kind] = m
    STATE["loading"] = ""
    print(f"모델 올림 {name} ({d}) {time.time() - t0:.1f}s", flush=True)
    return m


def sample_wav(path):
    """휴대폰 녹음(m4a·mp3·wav …)을 모델이 읽는 24kHz 모노 wav 로 바꿔 캐시한다."""
    src = path if os.path.isabs(path) else os.path.join(HERE, path)
    if not os.path.exists(src):
        return None
    out = os.path.join(HERE, "out", "samples", hashlib.md5((src + str(os.path.getmtime(src))).encode()).hexdigest()[:12] + ".wav")
    if not os.path.exists(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        ff = "ffmpeg"
        try:
            import imageio_ffmpeg
            ff = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "24000", "-t", "20", out], check=True)
    return out


def synth(text, voice):
    import numpy as np
    import soundfile as sf
    cfg = voices().get(voice) or voices().get("lotto") or {}
    key = hashlib.md5(f"{voice}|{text}".encode("utf-8")).hexdigest()
    if key in STATE["cache"]:
        return STATE["cache"][key]
    with LOCK:
        wav = sample_wav(cfg["sample"]) if cfg.get("sample") else None
        if wav:                                           # 복제(Base)
            m = model("base")
            pk = ("base", wav, cfg.get("sample_text") or "")
            if pk not in STATE["prompts"]:
                STATE["prompts"][pk] = m.create_voice_clone_prompt(ref_audio=wav, ref_text=cfg.get("sample_text") or None,
                                                                  x_vector_only_mode=not cfg.get("sample_text"))
            wavs, sr = m.generate_voice_clone(text=text, language="Korean", voice_clone_prompt=STATE["prompts"][pk])
        else:                                             # 정해진 목소리(CustomVoice) + 말투 지시
            m = model("custom")
            wavs, sr = m.generate_custom_voice(text=text, language="Korean", speaker=cfg.get("speaker", "Sohee"),
                                               instruct=cfg.get("style") or None)
        buf = io.BytesIO()
        sf.write(buf, np.asarray(wavs[0], dtype="float32"), sr, format="WAV", subtype="PCM_16")
        data = buf.getvalue()
    if len(STATE["cache"]) > 80:
        STATE["cache"].pop(next(iter(STATE["cache"])))
    STATE["cache"][key] = data
    return data


class H(BaseHTTPRequestHandler):
    server_version = "LottoTTS/1.0"

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            v = voices()
            info = {"ok": True, "device": STATE["device"], "loaded": list(STATE["models"]), "loading": STATE["loading"],
                    "voices": {k: ("복제" if c.get("sample") and os.path.exists(os.path.join(HERE, c["sample"])) else "정해진 목소리") for k, c in v.items()},
                    "error": STATE["last_error"]}
            return self._send(200, json.dumps(info, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")
        self._send(404, b"{}", "application/json")

    def do_POST(self):
        if self.path.split("?")[0] != "/speak":
            return self._send(404, b"{}", "application/json")
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            text = (body.get("text") or "").strip()[:400]
            if not text:
                return self._send(400, b'{"error":"empty"}', "application/json")
            data = synth(text, body.get("voice") or "lotto")
            STATE["last_error"] = ""
            self._send(200, data, "audio/wav")
        except Exception as e:
            STATE["last_error"] = repr(e)[:300]
            print("합성 실패", STATE["last_error"], flush=True)
            self._send(500, json.dumps({"error": STATE["last_error"]}, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")


def main():
    device()
    print(f"로또 음성 서비스 http://127.0.0.1:{PORT}  장치={STATE['device']}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()


if __name__ == "__main__":
    main()
