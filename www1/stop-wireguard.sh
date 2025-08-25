#!/bin/bash

# WireGuard 컨테이너 중지 스크립트
# server : www1
# date : 2025-08-13
# author : hbesthee@naver.com

CONTAINER_NAME=wireguard
CONTAINER_DATA_DIR=/home/${CONTAINER_NAME}
CONTAINER_LOG=/home/logs/${CONTAINER_NAME}.log
CONTAINER_PORT=51820
CONTAINER_TAG=1.0.20250521


echo "========" | tee -a ${CONTAINER_LOG}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && docker stop ${CONTAINER_NAME} && docker rm -fv ${CONTAINER_NAME} && echo "'${CONTAINER_NAME}' container stopped."
