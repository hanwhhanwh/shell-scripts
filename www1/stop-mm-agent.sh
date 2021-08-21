#!/bin/bash

# mm-agent 컨테이너 중지 스크립트
# server : www1
# date : 2021-08-21
# author : hbesthee@naver.com

LOG_MM_AGENT=/home/logs/mm-agent.log
AGENT_ROOT_DIR=/home/service/mm_agent
AGENT_PORT=13000

echo "========" | tee -a ${LOG_MM_AGENT}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_MM_AGENT}

echo "mm-agent 컨테이너 중지" | tee -a ${LOG_MM_AGENT}
docker stop mm-agent ; docker rm mm-agent | tee -a ${LOG_MM_AGENT}
