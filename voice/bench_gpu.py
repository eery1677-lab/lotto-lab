"""GPU 속도 비교: attention 방식(sdpa/기본)·정밀도(bf16/fp16)별로 한 문장 만드는 시간을 잰다."""
import os, time, sys
os.environ["HF_HUB_DISABLE_XET"] = "1"
import torch
from qwen_tts import Qwen3TTSModel
text = "안녕하세요, 대장님! 저는 로또예요. 궁금한 걸 물어보세요."
ins = "귀엽고 밝은 목소리로, 톤을 높게 통통 튀듯 명랑하게 말해 주세요."
for name, kw in [("sdpa+bf16", dict(dtype=torch.bfloat16, attn_implementation="sdpa")), ("sdpa+fp16", dict(dtype=torch.float16, attn_implementation="sdpa")), ("기본+bf16", dict(dtype=torch.bfloat16))]:
    try:
        t0 = time.time(); m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", device_map="cuda", **kw); lt = time.time() - t0
        ts = []
        for _ in range(2):
            t0 = time.time(); w, sr = m.generate_custom_voice(text=text, language="Korean", speaker="sohee", instruct=ins); torch.cuda.synchronize(); ts.append((round(time.time() - t0, 1), round(len(w[0]) / sr, 1)))
        print(name, "load", round(lt, 1), "gen(초, 소리초):", ts, flush=True)
        del m; torch.cuda.empty_cache()
    except Exception as e:
        print(name, "실패", repr(e)[:160], flush=True)
