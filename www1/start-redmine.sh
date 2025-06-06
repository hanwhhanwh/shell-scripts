#!/bin/bash

# redmine 구동 스크립트
# server : www1
# date : 2021-08-21
# author : hbesthee@naver.com

CONTAINER_NAME=redmine
LOG_REDMINE=/home/logs/redmine.log
REDMINE_FILES=/home/redmine/files
REDMINE_LOG_CONFIG=/home/redmine/config/additional_environment.rb
REDMINE_DB_CONFIG=/home/redmine/config/database.yml
REDMINE_LOGS=/home/redmine/logs
REDMINE_PLUGINS=/home/redmine/plugins
EXTERNAL_DATA=/home/redmine/data
REDMINE_PORT=3000
#REDMINE_TAG=5.1.1-alpine3.18
REDMINE_TAG=6.0.5-alpine3.21
REDMINE_DB_HOST=172.17.0.1
REDMINE_DB_PORT=23306
REDMINE_DB_USERNAME=redmine
REDMINE_DB_PASSWORD=redmine2019!@
REDMINE_DB_DATABASE=redmine


echo "========" | tee -a ${LOG_REDMINE}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_REDMINE}

echo "${CONTAINER_NAME} 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && docker stop ${CONTAINER_NAME} && docker rm -fv ${CONTAINER_NAME} && echo "'${CONTAINER_NAME}' container stopped."

echo "${CONTAINER_NAME} 컨테이너 생성" | tee -a ${LOG_REDMINE}
	# -p {REDMINE_PORT}:3000 \
docker run -d --network host --restart=unless-stopped --name ${CONTAINER_NAME} \
	-e REDMINE_NO_DB_MIGRATE=1 \
	-e REDMINE_DB_MYSQL=${REDMINE_DB_HOST} \
	-e REDMINE_DB_PORT=${REDMINE_DB_PORT} \
	-e REDMINE_DB_USERNAME=${REDMINE_DB_USERNAME} \
	-e REDMINE_DB_PASSWORD=${REDMINE_DB_PASSWORD} \
	-e REDMINE_DB_DATABASE=${REDMINE_DB_DATABASE} \
	-v ${REDMINE_FILES}:/usr/src/redmine/files \
	-v ${REDMINE_LOGS}:/usr/src/redmine/log \
	-v ${REDMINE_PLUGINS}:/usr/src/redmine/plugins \
	-v ${EXTERNAL_DATA}:/usr/src/redmine/public/data \
	-v ${REDMINE_LOG_CONFIG}:/usr/src/redmine/config/additional_environment.rb \
	-v ${REDMINE_DB_CONFIG}:/usr/src/redmine/config/database.yml \
	redmine:${REDMINE_TAG} 2>&1 | tee -a ${LOG_REDMINE}
