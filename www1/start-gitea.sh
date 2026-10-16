#!/bin/bash

# Gitea 컨테이너 구동 스크립트 (Rootless 버전)
# server : www1
# date : 2026-02-19
# author : hbesthee@naver.com

CONTAINER_NAME=gitea
CONTAINER_LOG=/home/logs/${CONTAINER_NAME}.log

# 이미지 태그/포트/경로는 .env 에서, 컨테이너 환경변수(USER_UID 등)는
# .env.${CONTAINER_NAME} 에서 읽습니다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.${CONTAINER_NAME}"
[ -f "${ENV_FILE}" ] || { echo "FATAL: ${ENV_FILE} 가 없습니다"; exit 1; }
set -a
[ -f "${SCRIPT_DIR}/.env" ] && . "${SCRIPT_DIR}/.env"
. "${ENV_FILE}"
set +a
: "${GITEA_TAG:?GITEA_TAG 가 설정되지 않았습니다 (.env 확인)}"
: "${GITEA_DATA_DIR:?GITEA_DATA_DIR 가 설정되지 않았습니다}"
: "${GITEA_HTTP_PORT:?GITEA_HTTP_PORT 가 설정되지 않았습니다}"
: "${GITEA_SSH_PORT:?GITEA_SSH_PORT 가 설정되지 않았습니다}"

CONTAINER_DATA_DIR=${GITEA_DATA_DIR}
CONTAINER_HTTP_PORT=${GITEA_HTTP_PORT}
CONTAINER_SSH_PORT=${GITEA_SSH_PORT}
CONTAINER_TAG=${GITEA_TAG}

# rootless 이미지는 내부적으로 3000(HTTP), 2222(SSH) 포트를 기본 사용합니다.

# 로그 디렉토리 및 데이터 디렉토리 생성 및 권한 부여
# rootless 버전은 컨테이너 내부 사용자가 UID 1000이므로 미리 권한을 맞춰야 합니다.
mkdir -p /home/logs
mkdir -p ${CONTAINER_DATA_DIR}
sudo chown -R ${USER_UID:-1000}:${USER_GID:-1000} ${CONTAINER_DATA_DIR}

echo "========" | tee -a ${CONTAINER_LOG}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 중지 및 삭제" | tee -a ${CONTAINER_LOG}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && \
	docker stop ${CONTAINER_NAME} && \
	docker rm -fv ${CONTAINER_NAME} && \
	echo "'${CONTAINER_NAME}' container stopped and removed." | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 생성 (gitea/gitea:${CONTAINER_TAG})" | tee -a ${CONTAINER_LOG}

# Gitea Rootless 이미지 구동
	#-v /etc/timezone:/etc/timezone:ro \
	#-v /etc/localtime:/etc/localtime:ro \
# 이미지가 VOLUME /etc/gitea 를 선언하므로 익명 볼륨이 생성되고, app.ini 는
# 그 안으로 바인드 마운트됩니다 (기존 동작과 동일).
docker run -d \
	--name ${CONTAINER_NAME} \
	--restart=unless-stopped \
	--env-file ${ENV_FILE} \
	-p ${CONTAINER_HTTP_PORT}:3000 \
	-p ${CONTAINER_SSH_PORT}:2222 \
	-v ${CONTAINER_DATA_DIR}:/var/lib/gitea \
	-v ${CONTAINER_DATA_DIR}/app.ini:/etc/gitea/app.ini \
	gitea/gitea:${CONTAINER_TAG} 2>&1 | tee -a ${CONTAINER_LOG}

echo "Gitea deployment completed. Access via http://g.hwh.kr:${CONTAINER_HTTP_PORT}" | tee -a ${CONTAINER_LOG}
