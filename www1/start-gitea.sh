#!/bin/bash

# Gitea 컨테이너 구동 스크립트 (Rootless 버전)
# server : www1
# date : 2026-02-19
# author : hbesthee@naver.com

CONTAINER_NAME=gitea
CONTAINER_DATA_DIR=/home/${CONTAINER_NAME}
CONTAINER_LOG=/home/logs/${CONTAINER_NAME}.log
# rootless 이미지는 내부적으로 3000(HTTP), 2222(SSH) 포트를 기본 사용합니다.
CONTAINER_HTTP_PORT=3333
CONTAINER_SSH_PORT=2222
CONTAINER_TAG=1.25-rootless

# 로그 디렉토리 및 데이터 디렉토리 생성 및 권한 부여
# rootless 버전은 컨테이너 내부 사용자가 UID 1000이므로 미리 권한을 맞춰야 합니다.
mkdir -p /home/logs
mkdir -p ${CONTAINER_DATA_DIR}
sudo chown -R 1000:1000 ${CONTAINER_DATA_DIR}

echo "========" | tee -a ${CONTAINER_LOG}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 중지 및 삭제" | tee -a ${CONTAINER_LOG}
docker ps -q --filter "name=${CONTAINER_NAME}" | grep -q . && \
	docker stop ${CONTAINER_NAME} && \
	docker rm -fv ${CONTAINER_NAME} && \
	echo "'${CONTAINER_NAME}' container stopped and removed." | tee -a ${CONTAINER_LOG}

echo "${CONTAINER_NAME} 컨테이너 생성" | tee -a ${CONTAINER_LOG}

# Gitea Rootless 이미지 구동
	#-v /etc/timezone:/etc/timezone:ro \
	#-v /etc/localtime:/etc/localtime:ro \
docker run -d \
	--name ${CONTAINER_NAME} \
	--restart=unless-stopped \
	-e TZ=Asia/Seoul \
	-e USER_UID=1000 \
	-e USER_GID=1000 \
	-p ${CONTAINER_HTTP_PORT}:3000 \
	-p ${CONTAINER_SSH_PORT}:2222 \
	-v ${CONTAINER_DATA_DIR}:/var/lib/gitea \
	-v ${CONTAINER_DATA_DIR}/app.ini:/etc/gitea/app.ini \
	gitea/gitea:${CONTAINER_TAG} 2>&1 | tee -a ${CONTAINER_LOG}

echo "Gitea deployment completed. Access via http://g.hwh.kr:${CONTAINER_HTTP_PORT}" | tee -a ${CONTAINER_LOG}
