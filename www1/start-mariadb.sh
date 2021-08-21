#!/bin/bash

# MariaDB 컨테이너 구동 스크립트
# server : www1
# date : 2021-08-21
# author : hbesthee@naver.com

LOG_MARIADB=/home/logs/mariadb.log
MARIADB_DATA_DIR=/home/mariadb
MARIADB_PORT=23306
MARIADB_TAG=10.5.12

echo "========" | tee -a ${LOG_MARIADB}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_MARIADB}

echo "MariaDB 컨테이너 생성" | tee -a ${LOG_MARIADB}
#	-e MYSQL_ROOT_PASSWORD="root_pwd-2@2!"" \
#	-p ${MARIADB_PORT}:3306 \
docker run -d --network host --restart=unless-stopped --name mariadb \
	-v ${MARIADB_DATA_DIR}:/var/lib/mysql \
	-e MYSQL_PORT=${MARIADB_PORT} \
	-w / \
	hbesthee/mariadb:${MARIADB_TAG} 2>&1 | tee -a ${LOG_MARIADB}
