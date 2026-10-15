#!/bin/bash

# HAProxy 컨테이너 구동 스크립트
# server : www1
# date : 2025-08-13
# author : hbesthee@naver.com

CONTAINER_NAME=haproxy
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
: "${HAPROXY_TAG:?HAPROXY_TAG 가 설정되지 않았습니다 (.env 확인)}"
: "${HAPROXY_DATA_DIR:?HAPROXY_DATA_DIR 가 설정되지 않았습니다}"
: "${HAPROXY_PORT:?HAPROXY_PORT 가 설정되지 않았습니다}"

CONTAINER_DATA_DIR=${HAPROXY_DATA_DIR}
CONTAINER_PORT=${HAPROXY_PORT}
CONTAINER_TAG=${HAPROXY_TAG}

echo "========" | tee -a ${CONTAINER_LOG}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && docker stop ${CONTAINER_NAME} && docker rm -fv ${CONTAINER_NAME} && echo "'${CONTAINER_NAME}' container stopped."

echo "${CONTAINER_NAME} 컨테이너 생성 (haproxy:${CONTAINER_TAG})" | tee -a ${CONTAINER_LOG}
# stats UI 자격증명은 HAProxy 가 환경변수를 전개하지 않기 때문에
# ${CONTAINER_DATA_DIR}/conf/haproxy.cfg 의 `stats auth` 지시어에 남습니다.
docker run -d --restart=unless-stopped --name ${CONTAINER_NAME} \
	--sysctl="net.ipv4.ip_unprivileged_port_start=0" \
	--env-file ${ENV_FILE} \
	-p ${CONTAINER_PORT}:${CONTAINER_PORT}/tcp \
	-v ${CONTAINER_DATA_DIR}/conf:/usr/local/etc/haproxy:ro \
	-v ${CONTAINER_DATA_DIR}/lib:/var/lib/haproxy \
	${CONTAINER_NAME}:${CONTAINER_TAG} 2>&1 | tee -a ${CONTAINER_LOG}
