#!/bin/bash

# redmine 구동 스크립트
# server : www1
# date : 2021-08-21
# author : hbesthee@naver.com

LOG_REDMINE=/home/logs/redmine.log
REDMINE_FILES=/home/redmine/files
REDMINE_LOGS=/home/redmine/logs
REDMINE_PORT=3000
REDMINE_DB_HOST=172.17.0.1
REDMINE_DB_PORT=23306
REDMINE_DB_USERNAME=redmine
REDMINE_DB_PASSWORD=redmine2019!@
REDMINE_DB_DATABASE=redmine


echo "========" | tee -a ${LOG_REDMINE}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_REDMINE}

echo "redmine 컨테이너 중지" | tee -a ${LOG_REDMINE}
docker stop redmine ; docker rm redmine

echo "redmine 컨테이너 생성" | tee -a ${LOG_REDMINE}
	# -e REDMINE_NO_DB_MIGRATE=1 \
	# -p {REDMINE_PORT}:3000 \
docker run -d --network host --restart=unless-stopped --name redmine \
	-e REDMINE_DB_MYSQL=${REDMINE_DB_HOST} \
	-e REDMINE_DB_PORT=${REDMINE_DB_PORT} \
	-e REDMINE_DB_USERNAME=${REDMINE_DB_USERNAME} \
	-e REDMINE_DB_PASSWORD=${REDMINE_DB_PASSWORD} \
	-e REDMINE_DB_DATABASE=${REDMINE_DB_DATABASE} \
	-v ${REDMINE_FILES}:/usr/src/redmine/files \
	-v ${REDMINE_LOGS}:/usr/src/redmine/log \
	redmine:4.2.2-alpine 2>&1 | tee -a ${LOG_REDMINE}