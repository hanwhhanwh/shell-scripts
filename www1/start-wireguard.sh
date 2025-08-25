#!/bin/bash

# Wireguard 컨테이너 구동 스크립트
# server : www1
# date : 2025-08-08
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

echo "${CONTAINER_NAME} 컨테이너 생성" | tee -a ${CONTAINER_LOG}
#	-e ALLOWEDIPS=0.0.0.0/0 \
#	-v /lib/modules:/lib/modules \
#	-w / \
#	-e LOG_CONFS=true \
docker run -d --restart=unless-stopped --name ${CONTAINER_NAME} \
	--cap-add=NET_ADMIN \
	--cap-add=SYS_MODULE \
	--sysctl="net.ipv4.conf.all.src_valid_mark=1" \
	-e INTERNAL_SUBNET=10.1.2.0 \
	-e PEERS=5 \
	-e PEERDNS=auto \
	-e PGID=1000 \
	-e PUID=1000 \
	-e SERVERPORT=${CONTAINER_PORT} \
	-e ALLOWEDIPS=0.0.0.0/0 \
	-e TZ=Asia/Seoul \
	-p ${CONTAINER_PORT}:${CONTAINER_PORT}/udp \
	-v ${CONTAINER_DATA_DIR}/config:/config \
	linuxserver/wireguard:${CONTAINER_TAG} 2>&1 | tee -a ${CONTAINER_LOG}
