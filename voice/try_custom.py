"""Qwen3-TTS 0.6B CustomVoice 시험: 정해진 목소리 + 말투 지시로 귀여운 캐릭터 목소리. 이 PC(CPU)에서 속도·품질 확인용."""
import os, time
import torch, soundfile as sf

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(out, exist_ok=True)
from qwen_tts import Qwen3TTSModel
t0 = time.time()
dev = "cuda" if torch.cuda.is_available() else ("mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu")
model = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", device_map=dev, dtype=torch.float32 if dev == "cpu" else torch.bfloat16)
print("device", dev, "load", round(time.time() - t0, 1), "s", flush=True)
try:
    print("speakers", model.get_supported_speakers(), flush=True)
except Exception as e:
    print("speakers?", e, flush=True)
text = "안녕하세요, 대장님! 저는 로또예요. 궁금한 걸 물어보세요."
for i, (spk, ins) in enumerate([("Sohee", "귀엽고 밝은 목소리로, 톤을 높게 통통 튀듯 명랑하게 말해 주세요."), ("Sohee", "")]):
    t0 = time.time()
    try:
        wavs, sr = model.generate_custom_voice(text=text, language="Korean", speaker=spk, instruct=ins)
    except Exception as e:
        print("fail", spk, repr(e)[:300], flush=True); continue
    sf.write(os.path.join(out, f"custom{i}.wav"), wavs[0], sr)
    print("generate", i, round(time.time() - t0, 1), "s, audio", round(len(wavs[0]) / sr, 1), "s", flush=True)
