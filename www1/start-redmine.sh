#!/bin/bash

# redmine 구동 스크립트
# server : www1
# date : 2021-08-21
# author : hbesthee@naver.com

CONTAINER_NAME=redmine
LOG_REDMINE=/home/logs/redmine.log

# 이미지 태그/포트/경로는 .env 에서, DB 접속정보(비밀번호 포함)는
# .env.${CONTAINER_NAME} 에서 읽습니다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.${CONTAINER_NAME}"
[ -f "${ENV_FILE}" ] || { echo "FATAL: ${ENV_FILE} 가 없습니다"; exit 1; }
set -a
[ -f "${SCRIPT_DIR}/.env" ] && . "${SCRIPT_DIR}/.env"
. "${ENV_FILE}"
set +a
: "${REDMINE_TAG:?REDMINE_TAG 가 설정되지 않았습니다 (.env 확인)}"
: "${REDMINE_FILES:?REDMINE_FILES 가 설정되지 않았습니다}"
: "${REDMINE_LOG_CONFIG:?REDMINE_LOG_CONFIG 가 설정되지 않았습니다}"
: "${REDMINE_DB_CONFIG:?REDMINE_DB_CONFIG 가 설정되지 않았습니다}"
: "${REDMINE_LOGS:?REDMINE_LOGS 가 설정되지 않았습니다}"
: "${REDMINE_PLUGINS:?REDMINE_PLUGINS 가 설정되지 않았습니다}"
: "${REDMINE_DATA:?REDMINE_DATA 가 설정되지 않았습니다}"

echo "========" | tee -a ${LOG_REDMINE}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_REDMINE}

echo "${CONTAINER_NAME} 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && docker stop ${CONTAINER_NAME} && docker rm -fv ${CONTAINER_NAME} && echo "'${CONTAINER_NAME}' container stopped."

echo "${CONTAINER_NAME} 컨테이너 생성 (redmine:${REDMINE_TAG})" | tee -a ${LOG_REDMINE}
# REDMINE_NO_DB_MIGRATE 는 .env.redmine 에서 통제합니다.
# 6.0.x -> 7.0.x 는 스키마 마이그레이션이 필요하므로 비워 두어야 하며,
# entrypoint 가 -z 로 판별하기 때문에 "=0" 으로 넣어도 건너뛰어집니다.
	# -p {REDMINE_PORT}:3000 \
docker run -d --network host --restart=unless-stopped --name ${CONTAINER_NAME} \
	--env-file ${ENV_FILE} \
	-v ${REDMINE_FILES}:/usr/src/redmine/files \
	-v ${REDMINE_LOGS}:/usr/src/redmine/log \
	-v ${REDMINE_PLUGINS}:/usr/src/redmine/plugins \
	-v ${REDMINE_DATA}:/usr/src/redmine/public/data \
	-v ${REDMINE_LOG_CONFIG}:/usr/src/redmine/config/additional_environment.rb \
	-v ${REDMINE_DB_CONFIG}:/usr/src/redmine/config/database.yml \
	redmine:${REDMINE_TAG} 2>&1 | tee -a ${LOG_REDMINE}
