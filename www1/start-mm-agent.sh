#!/bin/bash

# mm-agent 컨테이너 실행 스크립트
# server : www1
# date : 2021-07-30
# author : hbesthee@naver.com

LOG_MM_AGENT=/home/logs/www.log
AGENT_ROOT_DIR=/home/service/mm_agent
AGENT_PORT=13000

echo "========" | tee -a ${LOG_MM_AGENT}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_MM_AGENT}

echo "mm-agent 컨테이너 생성" | tee -a ${LOG_MM_AGENT}
#	-p ${AGENT_PORT}:3000 \
# docker run -d --restart=unless-stopped --name homepage \
docker run -d --network host --restart=unless-stopped --name mm-agent \
	-e SERVICE_PORT=${AGENT_PORT} \
	-v /home/service/start-mm-agent.sh:/start-web.sh \
	-v ${AGENT_ROOT_DIR}:/app/public \
	hanwhhanwh/node:latest 2>&1 | tee -a ${LOG_MM_AGENT}
