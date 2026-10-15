#!/bin/bash

# Wireguard 컨테이너 구동 스크립트
# server : www1
# date : 2025-08-08
# author : hbesthee@naver.com

CONTAINER_NAME=wireguard
CONTAINER_LOG=/home/logs/${CONTAINER_NAME}.log

# 이미지 태그/포트/경로는 .env 에서, 컨테이너 환경변수는
# .env.${CONTAINER_NAME} 에서 읽습니다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.${CONTAINER_NAME}"
[ -f "${ENV_FILE}" ] || { echo "FATAL: ${ENV_FILE} 가 없습니다"; exit 1; }
set -a
[ -f "${SCRIPT_DIR}/.env" ] && . "${SCRIPT_DIR}/.env"
. "${ENV_FILE}"
set +a
: "${WIREGUARD_TAG:?WIREGUARD_TAG 가 설정되지 않았습니다 (.env 확인)}"
: "${WIREGUARD_DATA_DIR:?WIREGUARD_DATA_DIR 가 설정되지 않았습니다}"
: "${WIREGUARD_PORT:?WIREGUARD_PORT 가 설정되지 않았습니다}"

CONTAINER_DATA_DIR=${WIREGUARD_DATA_DIR}
CONTAINER_PORT=${WIREGUARD_PORT}
CONTAINER_TAG=${WIREGUARD_TAG}

echo "========" | tee -a ${CONTAINER_LOG}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && docker stop ${CONTAINER_NAME} && docker rm -fv ${CONTAINER_NAME} && echo "'${CONTAINER_NAME}' container stopped."

echo "${CONTAINER_NAME} 컨테이너 생성 (linuxserver/wireguard:${CONTAINER_TAG})" | tee -a ${CONTAINER_LOG}
#	-e ALLOWEDIPS=0.0.0.0/0 \
#	-v /lib/modules:/lib/modules \
#	-w / \
#	-e LOG_CONFS=true \
# PEERDNS / ALLOWEDIPS 는 의도적으로 .env.wireguard 에 넣지 않았습니다.
# 실행 중이던 구성(2025-08-16 생성, start-wireguard_2.sh 와 일치)을 유지하기
# 위함이며, ALLOWEDIPS=0.0.0.0/0 는 피어 5개를 풀 터널로 바꿉니다.
docker run -d --restart=unless-stopped --name ${CONTAINER_NAME} \
	--cap-add=NET_ADMIN \
	--cap-add=SYS_MODULE \
	--sysctl="net.ipv4.conf.all.src_valid_mark=1" \
	--env-file ${ENV_FILE} \
	-p ${CONTAINER_PORT}:${CONTAINER_PORT}/udp \
	-v ${CONTAINER_DATA_DIR}/config:/config \
	linuxserver/wireguard:${CONTAINER_TAG} 2>&1 | tee -a ${CONTAINER_LOG}
