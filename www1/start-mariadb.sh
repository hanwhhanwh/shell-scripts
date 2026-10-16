#!/bin/bash

# MariaDB 컨테이너 구동 스크립트
# server : www1
# date : 2021-08-21
# author : hbesthee@naver.com

CONTAINER_NAME=mariadb
LOG_MARIADB=/home/logs/mariadb.log

# 이미지 태그/포트/경로는 .env 에서, 컨테이너에 주입할 환경변수는
# .env.${CONTAINER_NAME} 에서 읽습니다. 비밀값을 이 스크립트에 남기지 않습니다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.${CONTAINER_NAME}"
[ -f "${ENV_FILE}" ] || { echo "FATAL: ${ENV_FILE} 가 없습니다"; exit 1; }
set -a
[ -f "${SCRIPT_DIR}/.env" ] && . "${SCRIPT_DIR}/.env"
. "${ENV_FILE}"
set +a
: "${MARIADB_TAG:?MARIADB_TAG 가 설정되지 않았습니다 (.env 확인)}"
: "${MARIADB_DATA_DIR:?MARIADB_DATA_DIR 가 설정되지 않았습니다 (.env 확인)}"
: "${MARIADB_PORT:?MARIADB_PORT 가 설정되지 않았습니다 (.env 확인)}"

echo "========" | tee -a ${LOG_MARIADB}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_MARIADB}

echo "${CONTAINER_NAME} 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && docker stop ${CONTAINER_NAME} && docker rm -fv ${CONTAINER_NAME} && echo "'${CONTAINER_NAME}' container stopped."

echo "${CONTAINER_NAME} 컨테이너 생성 (mariadb:${MARIADB_TAG})" | tee -a ${LOG_MARIADB}
#	-p ${MARIADB_PORT}:3306 \
# TZ / MYSQL_PORT 는 --env-file 로 주입됩니다.
# MYSQL_ROOT_PASSWORD 는 빈 데이터디렉터리의 최초 초기화에서만 소비되므로
# 필요 시 .env.mariadb 에 넣습니다. 이 스크립트에 평문으로 남기지 않습니다.
docker run -d --network host --restart=unless-stopped --name ${CONTAINER_NAME} \
        --env-file ${ENV_FILE} \
        -v ${MARIADB_DATA_DIR}:/var/lib/mysql \
        -w / \
        mariadb:${MARIADB_TAG} --port ${MARIADB_PORT} 2>&1 | tee -a ${LOG_MARIADB}
