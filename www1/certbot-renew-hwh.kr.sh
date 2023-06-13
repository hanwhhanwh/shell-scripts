#!/bin/bash

# Let's Encrpyt SSL 인증서 갱신 처리 스크립트
# server : www1
# date : 2023-03-15
# author : hbesthee@naver.com

TARGET_DOMAIN='hwh.kr'
HOME_LETS_ENCRYPT='/share/letsencrypt'
TARGET_SSL_DIR='/etc/haproxy/ssl'
BACKUP_SSL_DIR='/share/backup/ssl'

read -p "https://www.gabia.com/ 을 브라우저로 실행하고 <ENTER>를 입력하세요 :"

docker run -it --rm --name certbot \
	-v "${HOME_LETS_ENCRYPT}:/etc/letsencrypt" \
	-v "${HOME_LETS_ENCRYPT}/lib:/var/lib/letsencrypt" \
	-v "${HOME_LETS_ENCRYPT}/log:/var/log/letsencrypt" \
	certbot/certbot certonly \
	--manual --preferred-challenges dns -d "*.${TARGET_DOMAIN}" \
	--server https://acme-v02.api.letsencrypt.org/directory

read -p "SSL 인증서 발급이 정상이면 <ENTER>를 입력하세요 :"

cd ${HOME_LETS_ENCRYPT}/live/${TARGET_DOMAIN}
cat cert.pem chain.pem privkey.pem > ${TARGET_DOMAIN}.pem
rm -f ${TARGET_SSL_DIR}/${TARGET_DOMAIN}.pem
cp ${TARGET_DOMAIN}.pem ${TARGET_SSL_DIR} # 새로운 SSL 인증서 적용
mv ${TARGET_DOMAIN}.pem ${BACKUP_SSL_DIR}/${TARGET_DOMAIN}.pem-$(date +%Y%m%d) # 새로운 인증서 백업
systemctl reload haproxy # HAProxy 새시작으로 새로운 SSL 인증서가 웹 서비스에 반영되도록 함
