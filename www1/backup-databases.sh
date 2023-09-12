#!/bin/bash

# 데이터베이스 백업 스크립트
# server : my-server
# date : 2023-09-11
# author : hbesthee@naver.com

LOG_BACKUP=/home/logs/backup-databases.log
MYSQLDUMP=/usr/bin/mysqldump
BACKUP_FOLDER=/home/backup/mariadb
BACKUP_DATE="$(date +%Y%m%d)"
DB_PORT="$(cat $BACKUP_FOLDER/_db_port.txt)"
PWD_AVDB="$(cat $BACKUP_FOLDER/_AVDB_pwd.txt)"
PWD_REDMINE="$(cat $BACKUP_FOLDER/_redmine_pwd.txt)"
BACKUP_OPTIONS="--add-drop-table -h127.0.0.1 -P${DB_PORT}"

echo "========" | tee -a ${LOG_BACKUP}
echo "[$(date +%Y-%m-%d) $(date +%H:%M:%S)] $0 $@" | tee -a ${LOG_BACKUP}


echo "	backup AVDB db" | tee -a ${LOG_BACKUP}
cd ${BACKUP_FOLDER}
/usr/bin/mysqldump -uavdbuser -p${PWD_AVDB} ${BACKUP_OPTIONS} \
	AVDB | gzip > AVDB-${BACKUP_DATE}.sql.gz


echo "	backup redmine db" | tee -a ${LOG_BACKUP}
/usr/bin/mysqldump -uredmine -p${PWD_REDMINE} ${BACKUP_OPTIONS} \
	redmine | gzip > redmine-${BACKUP_DATE}.sql.gz


echo "	delete old files" | tee -a ${LOG_BACKUP}
find ${BACKUP_FOLDER} -type f -ctime +7 -name "*.gz" -and ! -name "*01.sql.gz" -exec rm -f {} \;
find ${BACKUP_FOLDER} -type f -ctime +365 -name "*.gz" -exec rm -f {} \;