#!/bin/bash

# MariaDB 컨테이너 중지 스크립트
# server : dev
# date : 2021-08-22
# author : hbesthee@naver.com

LOG_MARIADB=/home/logs/mariadb.log
MARIADB_DATA_DIR=/home/mariadb
MARIADB_PORT=23306
#MARIADB_TAG=10.4.15
MARIADB_TAG=10.6.4

echo "========" | tee -a ${LOG_MARIADB}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_MARIADB}

echo "MariaDB 컨테이너 중지" | tee -a ${LOG_MARIADB}
docker stop mariadb ; docker rm mariadb
