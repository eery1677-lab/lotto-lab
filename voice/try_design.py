"""Qwen3-TTS VoiceDesign 시험: '귀엽고 높은 캐릭터 목소리'를 글로 설명해서 이 PC(CPU)에서 만들어 본다. 속도·품질 확인용."""
import os, sys, time
import torch, soundfile as sf

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(out, exist_ok=True)
t0 = time.time()
from qwen_tts import Qwen3TTSModel
print("import", round(time.time() - t0, 1), "s", flush=True)
t0 = time.time()
model = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", device_map="cpu", dtype=torch.float32)
print("load", round(time.time() - t0, 1), "s", flush=True)
torch.set_num_threads(12)
text = "안녕하세요, 대장님! 저는 로또예요. 궁금한 걸 물어보세요."
instruct = "귀엽고 밝은 어린 캐릭터의 목소리. 톤이 높고 또랑또랑하며 통통 튀는 듯 명랑하게, 조금 빠르게 말한다."
t0 = time.time()
wavs, sr = model.generate_voice_design(text=text, language="Korean", instruct=instruct)
dt = time.time() - t0
sf.write(os.path.join(out, "design1.wav"), wavs[0], sr)
print("generate", round(dt, 1), "s, audio", round(len(wavs[0]) / sr, 1), "s, sr", sr, flush=True)
