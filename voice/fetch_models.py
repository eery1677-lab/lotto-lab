"""Qwen3-TTS 0.6B 모델 내려받기(xet 대신 일반 HTTP — 이 PC 에서 xet 가 멈춰서). 사용: python fetch_models.py [custom] [base]"""
import os, sys
os.environ["HF_HUB_DISABLE_XET"] = "1"
from huggingface_hub import snapshot_download
names = {"custom": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "base": "Qwen/Qwen3-TTS-12Hz-0.6B-Base"}
for k in (sys.argv[1:] or ["custom", "base"]):
    print("받는 중", names[k], flush=True)
    print(snapshot_download(names[k]), flush=True)
