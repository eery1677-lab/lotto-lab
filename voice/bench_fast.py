"""faster-qwen3-tts(CUDA 그래프) 속도: 한 번에 만들기 / 스트리밍(첫 소리 시간) 을 잰다."""
import os, time
os.environ["HF_HUB_DISABLE_XET"] = "1"
import torch, numpy as np, soundfile as sf
from faster_qwen3_tts import FasterQwen3TTS
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"); os.makedirs(out, exist_ok=True)
text = "안녕하세요, 대장님! 저는 로또예요. 궁금한 걸 물어보세요."
ins = "귀엽고 밝은 목소리로, 톤을 높게 통통 튀듯 명랑하게 말해 주세요."
t0 = time.time(); m = FasterQwen3TTS.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", device="cuda", dtype=torch.bfloat16); print("load", round(time.time() - t0, 1), flush=True)
for i in range(3):
    t0 = time.time(); w, sr = m.generate_custom_voice(text=text, speaker="sohee", language="Korean", instruct=ins); torch.cuda.synchronize()
    dt = time.time() - t0; a = np.asarray(w[0]); print(f"일괄 {i}: {dt:.1f}s, 소리 {len(a)/sr:.1f}s, RTF {len(a)/sr/dt:.2f}", flush=True)
    if i == 2: sf.write(os.path.join(out, "fast0.wav"), a, sr)
for i in range(2):
    t0 = time.time(); first = None; n = 0
    for chunk, sr, info in m.generate_custom_voice_streaming(text=text, speaker="sohee", language="Korean", instruct=ins, chunk_size=8):
        if first is None: first = time.time() - t0
        n += len(chunk)
    dt = time.time() - t0; print(f"스트리밍 {i}: 첫 소리 {first:.2f}s, 전체 {dt:.1f}s, 소리 {n/sr:.1f}s, RTF {n/sr/dt:.2f}", flush=True)
