#!/bin/bash
# 맥: 이 파일을 더블클릭하면 로또 확률 연구소가 켜지고 브라우저가 열립니다.
# 처음 한 번 "확인되지 않은 개발자" 경고가 나오면: 파일을 우클릭 → 열기.
# 실행 권한이 없다고 나오면 터미널에서: chmod +x start_mac.command
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 가 없습니다. 터미널에서 'xcode-select --install' 을 실행하거나 python.org 에서 설치해 주세요."
  read -r -p "엔터를 누르면 닫힙니다…"
  exit 1
fi

# 이미 켜져 있으면 브라우저만 연다
if curl -s -o /dev/null --max-time 1 http://127.0.0.1:3600/; then
  open http://127.0.0.1:3600/
  exit 0
fi

echo "로또 확률 연구소를 시작합니다 — 이 창을 닫으면 서버가 꺼집니다."
python3 server.py "$@"
