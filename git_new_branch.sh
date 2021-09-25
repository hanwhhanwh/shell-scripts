#!/bin/bash

# @brief 입력한 이슈 번호로 GIT 신규 브랜치를 생성합니다.
# @author hbesthee@naver.com
# @date 2021-09-24
# @param $1 프로젝트 이슈 번호

if [ $# != 1 ]; then
    echo "usage : $0 <project issue no>"
	echo "    example : $0 210"
    exit 0
fi

ISSUE_NO=$1

git pull
git checkout -b ${ISSUE_NO}
git push origin ${ISSUE_NO}
git branch --set-upstream-to origin/${ISSUE_NO}
