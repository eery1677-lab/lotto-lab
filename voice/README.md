# 로또 음성 서비스 (로컬)

Qwen3-TTS 0.6B 로 로또·뽀또 목소리를 만든다. 글·소리는 이 컴퓨터 밖으로 나가지 않는다.

## 목소리 샘플 넣는 법 (휴대폰 녹음 → 따라 하기)
1. 조용한 방에서 휴대폰으로 **10초 안팎**, 캐릭터처럼 귀엽게 말한다(대장님 본인 목소리 또는 쓰기로 동의한 분 목소리만).
2. 파일을 이 폴더(`voice/`)에 `lotto.m4a`(로또), `ppoddo.m4a`(뽀또)로 넣는다. wav·mp3 도 되지만 `voices.json` 의 파일 이름을 맞춘다.
3. `voices.json` 의 `sample_text` 에 **녹음에서 말한 내용을 글로** 적는다(비우면 품질이 조금 낮은 간단 모드).
4. 샘플 파일이 없으면 정해진 목소리(Sohee)에 `style` 말투 지시를 줘서 읽는다.

## 실행
- 윈도우: `voice\.venv\Scripts\python voice\tts_server.py`  /  맥: `voice/.venv/bin/python voice/tts_server.py`
- 로또 사이트가 처음 소리가 필요할 때 자동으로 켠다(서버 `server.py` 의 `_ensure_tts`).
- 상태: http://127.0.0.1:3650/health
