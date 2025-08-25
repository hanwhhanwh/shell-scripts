#!/bin/bash

# HAProxy 컨테이너 구동 스크립트
# server : www1
# date : 2025-08-13
# author : hbesthee@naver.com

CONTAINER_NAME=haproxy
CONTAINER_DATA_DIR=/home/${CONTAINER_NAME}
CONTAINER_LOG=/home/logs/${CONTAINER_NAME}.log
CONTAINER_PORT=443
CONTAINER_TAG=3.2.3-alpine

echo "========" | tee -a ${CONTAINER_LOG}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && docker stop ${CONTAINER_NAME} && docker rm -fv ${CONTAINER_NAME} && echo "'${CONTAINER_NAME}' container stopped."

echo "${CONTAINER_NAME} 컨테이너 생성" | tee -a ${CONTAINER_LOG}
docker run -d --restart=unless-stopped --name ${CONTAINER_NAME} \
	--sysctl="net.ipv4.ip_unprivileged_port_start=0" \
	-e TZ=Asia/Seoul \
	-p ${CONTAINER_PORT}:${CONTAINER_PORT}/tcp \
	-v ${CONTAINER_DATA_DIR}/conf:/usr/local/etc/haproxy:ro \
	-v ${CONTAINER_DATA_DIR}/lib:/var/lib/haproxy \
	${CONTAINER_NAME}:${CONTAINER_TAG} 2>&1 | tee -a ${CONTAINER_LOG}
