# www1 Docker 업그레이드 · Compose 전환 참조

대상: `www1/` (서버 배포본 `/home/bin/www1/`) · 서버 `hbesthee-60337` · Docker 29.1.3 · Docker Compose v5.6.0
최초 작성: 2026-10-15 — 5개 서비스(mariadb·redmine·gitea·haproxy·wireguard) 이미지 업그레이드와
`docker run` 스크립트 → Compose 전환을 실제로 수행하면서 **검증된 내용만** 수록했다.

> 이 문서는 새 세션에서 같은 작업을 할 때 시행착오를 줄이기 위한 절차서다.
> 여기에 적힌 수치·버전·경로는 2026-10-15 시점 실측값이므로 **인용 전에 현재 상태와 재대조**한다.
> 비밀값은 어떤 것도 이 파일에 적지 않는다. 위치만 참조한다(§1.2).

---

## 0. 요약 — 이것만은 지키기

| # | 규칙 | 이유 |
| --- | --- | --- |
| 1 | **`docker inspect` 가 진실이다.** 저장소 스크립트는 신뢰하지 않는다 | 저장소 스크립트가 수정만 되고 재배포되지 않은 경우가 실제로 있었다(§3.2) |
| 2 | 재생성 전에 **백업부터**. 정지 상태의 물리 사본이 유일한 신뢰 가능한 롤백 | 핫카피는 crash-consistent 가 아니다(§6) |
| 3 | healthcheck·이미지 호환성은 **반드시 실측**. 일회성 컨테이너만으로 판단 금지 | 신규 초기화 컨테이너에서는 통과하는데 프로덕션 데이터디렉터리에서는 실패한 사례(§8.1) |
| 4 | `docker compose up` 은 **종료코드를 명시 검사**하고, up 직후 라벨·이미지·healthcheck 를 **단정** | 파이프 때문에 실패를 놓쳐 구버전이 계속 도는 사례(§7.2) |
| 5 | compose 가 만들지 않은 컨테이너에 `--force-recreate` 는 **통하지 않는다** | 이름 충돌로 실패한다(§7.1) |
| 6 | 비밀값은 argv 에 넣지 않는다. stdin → 0600 임시 파일 → 사용 후 삭제 | 프로세스 목록·대화기록에 남는다(§1.3) |
| 7 | `docker pull` · 재시작 · `rmi` 는 **명시 승인 없이 하지 않는다** | 되돌리기 어렵거나 서비스에 영향 |

---

## 1. 접속

### 1.1 Git Bash + OpenSSH (PuTTY 사용 금지)

`sshpass` 가 없으므로 `SSH_ASKPASS` 를 쓴다. 로컬 셸은 Git Bash(MSYS2 MINGW64).

```bash
SSH_ASKPASS=<askpass헬퍼> SSH_ASKPASS_REQUIRE=force \
  ssh -p "$port" \
      -o PreferredAuthentications=password \
      -o PubkeyAuthentication=no \
      -o NumberOfPasswordPrompts=1 \
      -o StrictHostKeyChecking=yes \
      -o ConnectTimeout=20 \
      "$user@$host" '<remote command>'
```

askpass 헬퍼는 비밀번호 파일을 `cat` 하기만 하면 된다:

```bash
#!/bin/bash
exec cat /d/MyProj/shell-scripts/www1/.conf/.data
```

헬퍼 3종을 `.tmp/`(미추적) 에 두고 재사용한다:

| 헬퍼 | 역할 |
| --- | --- |
| `.tmp/askpass.sh` | 비밀번호 출력 — 명령행·대화기록에 노출 안 됨 |
| `.tmp/www1-ssh.sh` | 원격 명령. host/port/user 를 매번 `.conf` 에서 읽음 |
| `.tmp/www1-scp.sh` | 업로드. 텍스트는 **basename 을 보존한** 임시 사본으로 CRLF 정규화 후 전송 |

`-o NumberOfPasswordPrompts=1` 은 필수다. 비밀번호 오타로 반복 실패하면 fail2ban 차단 위험이 있다.

### 1.2 자격증명 위치 (값은 절대 커밋 금지)

| 파일 | 내용 | 비고 |
| --- | --- | --- |
| `www1/.conf/.hostip` `.port` `.user` | SSH 접속 대상 | 미추적 |
| `www1/.conf/.data` | SSH 비밀번호 | 미추적 |
| `www1/.conf/.data2` | **mariadb root 비밀번호** | 미추적 |
| `/home/backup/mariadb/_db_port.txt` | DB 포트 (서버) | |
| `/home/backup/mariadb/_AVDB_pwd.txt` | `avdbuser` 비밀번호 (서버) | |
| `/home/backup/mariadb/_redmine_pwd.txt` | `redmine` 비밀번호 (서버) | |

`www1/.conf/` 는 `.gitignore` 에 디렉터리째 등록돼 있어 새로 파일을 추가해도 자동으로 무시된다.
추가 후 `git check-ignore -v <경로>` 로 확인한다.

### 1.3 호스트키

`ssh-keyscan` 결과를 **승인된 지문과 대조한 뒤** `~/.ssh/known_hosts` 에 등록한다.

```bash
ssh-keyscan -p "$port" -t ed25519 "$host" > /tmp/hk
ssh-keygen -lf /tmp/hk          # 지문이 승인된 값과 일치하는지 확인
grep -v '^#' /tmp/hk >> ~/.ssh/known_hosts
ssh-keygen -F "[$host]:$port"   # 등록 확인
```

비표준 포트를 쓰므로 known_hosts 항목은 `[host]:port` 형태다.

**주의**: PuTTY `plink` 는 쓰지 말 것. 0.83 은 `Store key in cache?` 확인을 stdin 이 아니라 **콘솔**에서 읽어
`echo y |` 도 `< file` 도 타임아웃까지 hang 한다. 영구 캐싱이 불가능하므로 매번 `-hostkey <지문>` 고정이 필요하다.

### 1.4 비밀번호를 argv 에 남기지 않는 패턴

mariadb root 처럼 민감한 값은 stdin 으로 넘겨 **컨테이너 내부의 0600 defaults 파일**로 stage 한다.

```bash
# 로컬: 파일을 stdin 으로 흘린다
printf '%s\n' "$(tr -d '\r\n' < www1/.conf/.data2)" | ./.tmp/www1-ssh.sh 'bash /tmp/작업.sh'

# 원격 스크립트: 첫 줄에서 읽고, 0600 파일로 stage, 종료 시 삭제
read -r PW
PWESC=${PW//\\/\\\\}; PWESC=${PWESC//\"/\\\"}
printf '[client]\nuser=root\npassword="%s"\n' "$PWESC" \
  | docker exec -i mariadb sh -c 'umask 077; cat > /tmp/.mycnf_x'
trap 'docker exec mariadb rm -f /tmp/.mycnf_x' EXIT
q() { docker exec mariadb mariadb --defaults-extra-file=/tmp/.mycnf_x -N -B -e "$1"; }
```

분리 실행(detached) 시에는 0600 임시 파일로 잠시 옮기고 스크립트가 읽은 뒤 `shred -u` 한다.

---

## 2. 권장 작업 순서

```
① 읽기 전용 인벤토리          §3   (docker inspect 가 기준)
② 버전 조사                   §4   (pull 없이 Registry API)
③ healthcheck 설계 + 실측 검증 §5
④ 백업                        §6   ← 이걸 건너뛰고 재생성하지 않는다
⑤ 산출물 작성                 (스크립트 수정, compose, .env, .gitignore)
⑥ 격리 dry-run                §8.2 (메이저 업그레이드는 사본으로 먼저)
⑦ staging 에서 compose config 검증
⑧ 재생성 + 검증               §7, §9
⑩ 정리 + 현황 문서            §11
```

긴 작업은 **서버에서 분리 실행**하고 폴링한다. 클라이언트 쪽 네트워크가 끊겨도 원격 작업이 죽지 않는다.

```bash
./www1-scp.sh 작업.sh /tmp/
./www1-ssh.sh 'rm -f /tmp/x.log; setsid nohup bash /tmp/x.sh > /tmp/x.log 2>&1 < /dev/null &
               sleep 8; pgrep -f "[x].sh" >/dev/null && echo RUNNING || echo NOT_RUNNING'
# 이후 반복 폴링
./www1-ssh.sh 'pgrep -f "[x].sh" >/dev/null && echo RUNNING || echo FINISHED'
```

---

## 3. 읽기 전용 인벤토리

### 3.1 실효 구성 추출

`docker inspect` 가 유일하게 신뢰할 수 있는 소스다. 다음을 전부 뽑아 보관한다.

```bash
docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}'
for c in <서비스...>; do
  docker inspect "$c" > "$BK/$c.json"
  docker inspect -f 'NetworkMode={{.HostConfig.NetworkMode}} Restart={{.HostConfig.RestartPolicy.Name}}
CapAdd={{.HostConfig.CapAdd}} Sysctls={{.HostConfig.Sysctls}} WorkDir={{.Config.WorkingDir}} User={{.Config.User}}' "$c"
  docker inspect -f '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} (rw={{.RW}}){{println}}{{end}}' "$c"
  docker inspect -f '{{range $k,$v := .HostConfig.PortBindings}}{{$k}} -> {{range $v}}{{.HostIp}}:{{.HostPort}} {{end}}{{println}}{{end}}' "$c"
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" | sed -E "$REDACT"   # 비밀 마스킹
  docker inspect -f '{{json .Config.Entrypoint}} {{json .Config.Cmd}} {{json .Config.Healthcheck}}' "$c"
done
```

출력에 비밀값이 섞이지 않게 마스킹 필터를 항상 함께 쓴다:

```bash
REDACT='s/^([^=]*(PASSWORD|PASSWD|SECRET|TOKEN|KEY|CREDENTIAL)[^=]*)=.*/\1=***REDACTED***/I'
```

**이미지 ID 를 반드시 기록**해 둔다. 태그는 float 하지만 ID 는 롤백 시 정확한 대상을 지목한다.

### 3.2 스크립트 ↔ 실체 대조

저장소·서버 배포본·실행 중 컨테이너가 **서로 다를 수 있다.** md5 로 대조한다.

```bash
(cd www1 && md5sum *.sh | sort -k2)                      # 로컬
ssh ... 'cd /home/bin/www1 && md5sum *.sh | sort -k2'     # 배포본
```

2026-10-15 실측에서 드러난 불일치:

| 경우 | 내용 |
| --- | --- |
| 저장소 = 배포본 ≠ 실행 중 | `start-wireguard.sh` 는 2025-11-11 에 `PEERDNS=auto`·`ALLOWEDIPS=0.0.0.0/0` 가 추가됐지만 **한 번도 재배포되지 않음.** 실행 중 컨테이너는 `start-wireguard_2.sh` 와 일치 |
| 저장소 ≠ 배포본 | `backup-databases.sh`, `start-mm-agent.sh`, `stop-mariadb.sh`, `stop-mm-agent.sh` |
| 저장소 사본이 완전히 낡음 | `www1/haproxy/haproxy.cfg` — 백엔드 9개 vs 실전 2개, maxconn 4000 vs 400, 인증서 경로도 다름 |

**주의**: 저장소 스크립트대로 재생성하면 **배포된 적 없는 설정이 조용히 활성화**될 수 있다.
`ALLOWEDIPS=0.0.0.0/0` 는 VPN 피어 전체를 풀 터널로 바꾼다. 버전 업그레이드라면 **실행 중 구성을 보존**하는 것이 원칙이고,
차이는 사용자에게 명시적으로 물어본다.

서버에는 저장소에 없는 `_2` 변형과 레거시(`/home/bin/start-redmine.sh`) 가 남아 있으니 `ls -la /home/bin/www1/` 로 전부 확인한다.

---

## 4. 버전 조사 — `docker pull` 없이

Registry v2 API 로 읽기 전용 조사한다. 서버에 `curl`·`jq` 가 있다.

```bash
REG=https://registry-1.docker.io/v2
tok()  { curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:$1:pull" | jq -r '.token'; }
tags() { curl -s -H "Authorization: Bearer $2" "$REG/$1/tags/list" | jq -r '.tags[]?'; }
dig()  { curl -s -I -H "Authorization: Bearer $3" \
           -H 'Accept: application/vnd.oci.image.index.v1+json' \
           -H 'Accept: application/vnd.docker.distribution.manifest.list.v2+json' \
           -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
           "$REG/$1/manifests/$2" | tr -d '\r' \
           | sed -n 's/^[Dd]ocker-[Cc]ontent-[Dd]igest:[[:space:]]*//p'; }
```

공식 이미지는 저장소 이름이 `library/<name>` 이다. 태그 수천 개를 `sort -V` 로 정렬해 최고버전을 찾는 방식은
**variant(알파인/noble 등) 를 무시하므로 그대로 쓰면 안 된다.** 반드시 두 가지를 따로 구한다:

- `latest_same_variant` — 지금 쓰는 variant 안에서의 최고 버전
- `latest_overall` — 저장소 최고 버전 (variant 가 달라질 수 있음)

### 4.1 `latest` 앵커 기법 (권장)

"최신" 이 실제로 무엇을 가리키는지는 **다이제스트 대조**로 확정한다.

```bash
L=$(dig <repo> latest "$T")
for cand in <후보태그...>; do
  [ "$(dig <repo> "$cand" "$T")" = "$L" ] && echo "$cand == latest"
done
```

이 방법으로 다음을 확정했다:

| 저장소 | `latest` 가 가리키는 것 | 발견 |
| --- | --- | --- |
| `gitea/gitea` | `28.1.0-rootless` | 1.x 계열 최고는 `1.27.3` 인데 **28.x 로 체계가 바뀌어 있었다.** 숫자 정렬만 봤으면 놓쳤을 정보 |
| `library/redmine` | `7.0.2` | `alpine3.21` variant 는 `6.1.0` 이 마지막 → 현재 variant 로는 7.x 불가능 |
| `library/mariadb` | `13.0.2` | 11.7 계열은 `11.7.2` 가 끝 (11.7.3+ 태그 자체가 없음) |
| `linuxserver/wireguard` | `1.0.20260223` | 날짜 태그 |

**주의**: `latest-alpine` 처럼 존재하지 않는 태그에 앵커를 걸면 빈 값이 나와 대조가 무의미해진다. 앵커 태그 존재를 먼저 확인한다.

### 4.2 태그 재푸시(드리프트) 감지

`docker inspect -f '{{index .RepoDigests 0}}'` 의 다이제스트를 registry 값과 비교한다.

- `gitea:1.25-rootless` 처럼 **float 하는 태그**는 같은 태그가 새 패치를 가리키므로 드리프트가 정상이다
- `linuxserver/*` 는 같은 날짜 태그도 리빌드된다
- `RepoDigests` 가 비어 있으면(`none`) 비교 불가 — `pull` 이 아닌 경로로 들어온 이미지다

---

## 5. healthcheck 설계와 검증

### 5.1 검증 방법

**두 곳에서 모두** 확인한다. 한쪽만 보면 오판한다.

```bash
# (a) 대상 이미지 안에 도구가 있는가
docker run --rm --entrypoint /bin/sh <image> -c \
  'for c in sh bash wget curl socat nc wg healthcheck.sh haproxy; do
     command -v "$c" >/dev/null && echo "yes $c"; done'

# (b) 실행 중 컨테이너에서 실제로 동작하는가 + 음성 대조군
docker exec <container> sh -c 'nc -z 127.0.0.1 443'; echo rc=$?      # 0 기대
docker exec <container> sh -c 'nc -z 127.0.0.1 9999'; echo rc=$?     # **0 아니어야 함**
```

음성 대조군(negative control) 없이 "rc=0 이니까 통과" 로 판단하면 안 된다.

### 5.2 검증된 healthcheck (2026-10-15 기준)

| 서비스 | test | 근거 |
| --- | --- | --- |
| mariadb | `["CMD","/usr/local/bin/healthcheck.sh","--connect","--innodb_initialized"]` | 이미지 동봉 공식. exit=0 실측 |
| redmine | `wget -qO- http://127.0.0.1:${REDMINE_PORT}/ >/dev/null 2>&1` | HTML 200 실측 |
| gitea | `wget -qO- http://127.0.0.1:3000/api/healthz >/dev/null 2>&1` | `{"status":"pass", checks:{database:ping, cache:ping}}` 실측 |
| haproxy | `nc -z 127.0.0.1 ${HAPROXY_PORT}` | 443→0, 8888→0, 9999→1 |
| wireguard | `wg show wg0 listen-port >/dev/null 2>&1` | `51820` 반환, `ip link` 에서 `wg0` UP |

**주의**: haproxy 에 `socat` stats 소켓 검증을 쓰려다 폐기했다. **`socat` 은 3.2.3-alpine 에 없고 3.2.26-alpine 에만 있다**
(실행 중 컨테이너에서 `socat: not found`, rc=127). 대상 이미지만 조사했다면 잘못된 헬스체크를 넣을 뻔했다.
→ **도구 가용성은 대상 이미지와 현재 이미지 양쪽에서 확인한다.**

`haproxy -c -f <cfg>` 는 rc=0 이 나오지만 설정 유효성 검사일 뿐 liveness 가 아니다. 단독 사용 금지.

### 5.3 `start_period` 산정

실측 부팅 시간을 재서 넉넉히 잡는다. 너무 짧으면 업그레이드 중에 unhealthy 로 오판된다.

| 서비스 | 값 | 근거 |
| --- | --- | --- |
| mariadb | 600s | 신규 초기화 시 healthy 까지 ~110s, 메이저 업그레이드 시 `mariadb-upgrade` 추가 |
| redmine | 300s | bundle install + db:migrate + asset precompile, 실측 부팅 ~90s |
| gitea | 180s | sqlite 마이그레이션, 실측 healthz 통과 ~15s |
| wireguard | 120s | 실측 20s |
| haproxy | 30s | 실측 10s |

---

## 6. 백업

### 6.1 재생성 전에 반드시

| 대상 | 방법 | 비고 |
| --- | --- | --- |
| DB 전체 | `mariadb-dump --single-transaction --quick --add-drop-table` | **모든** 데이터베이스 |
| DB 물리본 | `tar -C /home -cf - mariadb \| xz -T0 -1` | 핫카피는 참고용 |
| **정지 상태 물리본** | 컨테이너 `stop` 후 `cp -a /home/mariadb <백업>/datadir` | **유일한 신뢰 가능한 롤백.** 메이저 업그레이드 전에 필수 |
| 앱 설정 | `tar -czf` — gitea `app.ini`·`data/`·`ssh/`, redmine `config/`·`plugins/`, haproxy `conf/`, wireguard `config/` | |
| 컨테이너 정의 | `docker inspect` JSON + `docker logs` | 롤백 시 정확한 플래그 재현용 |
| 배포 스크립트 | `tar -czf <백업> -C /home/bin www1` | 덮어쓰기 전에 |

`/home/redmine/files`(2GB) 는 사용자 결정으로 백업하지 않았다. 필요 시 용량부터 확인한다.

### 6.2 mariadb 접속 — 소켓 vs TCP

**가장 자주 걸리는 함정.**

| 계정 | 인증 | 접속 방법 |
| --- | --- | --- |
| `root@localhost` | 비밀번호 있음 | **소켓** (`/run/mysqld/mysqld.sock`, 기본) |
| `root@127.0.0.1`, `root@::1` | **비밀번호 없음** | TCP |
| `avdbuser@%`, `redmine@%`, `mining@%` | 비밀번호 있음 | TCP 가능 |

그래서 root 로 `-h127.0.0.1` 을 붙이면 **비밀번호가 맞는 데도**
`Access denied for user 'root'@'127.0.0.1' (using password: YES)` 가 나온다.
`-h` 를 빼고 소켓으로 붙거나 `--protocol=socket --socket=$(... @@socket)` 을 쓴다.

### 6.3 기존 백업 스크립트의 공백

`www1/backup-databases.sh` 는 **AVDB 와 redmine 만** 덤프한다.
2026-10-15 기준 데이터디렉터리에는 `MPH_MONITOR`(1,146MB, 7테이블) 와 `MINING`(1테이블) 도 있어
**이 둘은 한 번도 논리 백업된 적이 없었다.** 그리고 root crontab 이 비어 있어 이 스크립트는 자동 실행되지 않는다.

덤프 검증은 크기만 보지 말고 **트레일러와 줄 수**를 본다. `gzip` 은 빈 입력에도 성공한다.

```bash
zcat "$f" | tail -1 | grep -q "Dump completed" && echo OK || echo INCOMPLETE
zcat "$f" | wc -l
```

---

## 7. Compose 로 전환 (기존 컨테이너 흡수)

### 7.1 `--force-recreate` 는 통하지 않는다

compose 가 만들지 않은 컨테이너에는 `com.docker.compose.*` 라벨이 없어서, compose 는 "재생성" 이 아니라
"**신규 생성**" 을 시도하고 이름 충돌로 실패한다.

```
Error response from daemon: Conflict. The container name "/redmine" is already in use
```

올바른 순서:

```bash
docker stop -t 90 "$svc"                       # clean shutdown
docker rm "$svc"
docker ps -a --format '{{.Names}}' | grep -qx "$svc" && { echo "이름 여전히 점유"; exit 1; }
if ! docker compose up -d "$svc"; then echo "compose up 실패"; exit 1; fi
```

### 7.2 종료코드를 파이프가 삼키게 두지 않는다

```bash
docker compose up -d redmine | sed 's/^/  /'   # ← 실패해도 rc=0 처럼 보인다
if ! docker compose up -d redmine; then ...    # ← 이렇게
```

실패를 놓치면 스크립트는 "부팅 대기" 루프만 수백 초 돌고, 그 사이 **구버전 컨테이너가 계속 서비스 중이다.**
2026-10-15 에 실제로 발생했다. 적발 방법은 컨테이너 내부 `ps` 의 PID 1 경과시간이었다:

```bash
docker exec <c> sh -c 'ps -o pid,etime,args | head -3'   # ELAPSED 427d = 전환 안 됨
```

### 7.3 up 직후 단정(assert) 하기

```bash
NEW_IMG=$(docker inspect -f '{{.Config.Image}}' "$svc")
PROJ=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$svc")
HC=$(docker inspect -f '{{json .Config.Healthcheck}}' "$svc")
[ "$NEW_IMG" = "$TARGET" ] || fail "wrong image"
[ -n "$PROJ" ]             || fail "not compose-managed"
[ "$HC" != "null" ]        || fail "healthcheck missing"
```

### 7.4 env 파일 2층 구조

| 파일 | 역할 | Compose 보간 | 추적 |
| --- | --- | --- | --- |
| `.env` | 이미지 태그·공개 포트·호스트 경로 | `${VAR}` 로 YAML 에 전개됨 | 미추적 |
| `.env.<svc>` | 그 컨테이너에 주입될 환경변수·비밀값 | **안 됨** — `env_file:` 로만 주입 | 미추적 |
| `.env.example`, `.env.<svc>.example` | 위 둘의 템플릿 | — | **추적** |

`env_file:` 의 값은 YAML 보간에 쓰이지 않는다. 태그를 `.env.<svc>` 에만 넣으면
`image: mariadb:${MARIADB_TAG}` 가 해석되지 않으므로 **태그는 프로젝트 `.env` 에** 둔다.

`.gitignore`:

```
www1/.env
www1/.env.*
!www1/.env.example
!www1/.env.*.example
```

### 7.5 `--env-file`(docker) vs `env_file`(compose) 파싱 차이

| 입력 | `docker run --env-file` | compose `env_file` |
| --- | --- | --- |
| 줄 시작 `#` 주석 | 무시 | 무시 |
| 빈 줄 | 무시 | 무시 |
| `FOO=bar # trailing` | 값 = `bar # trailing` (**주석이 값에 포함**) | 값 = `bar` (제거) |

**따라서 주석은 반드시 독립 줄에 둔다.** 값 뒤에 주석을 붙이면 docker run 경로에서만 값이 오염된다.
`!@` 같은 특수문자는 이스케이프 불필요(셸을 거치지 않음).

### 7.6 faithful 재현 체크리스트

`docker inspect` 에서 다음을 놓치기 쉽다:

- `network_mode: host` (mariadb·redmine) — 포트 매핑이 없고 `PortBindings` 가 비어 있다
- `working_dir` (mariadb 는 `/`)
- `command` (mariadb 는 `["--port","23306"]`)
- `sysctls` (haproxy `net.ipv4.ip_unprivileged_port_start=0`, wireguard `net.ipv4.conf.all.src_valid_mark=1`)
- `cap_add` (wireguard `NET_ADMIN`, `SYS_MODULE`)
- `:ro` 마운트 (haproxy conf)
- **이미지가 선언한 익명 볼륨** (gitea 는 `VOLUME /etc/gitea`) — compose 도 동일하게 익명 볼륨을 만든다.
  재생성마다 새 볼륨이 쌓이므로 `docker volume ls` 로 주기적으로 정리한다
- 재현 불필요: `PATH`, `HOME`, `LANG` 등 이미지가 넣는 기본값

---

## 8. 이미지별 함정

### 8.1 mariadb

**`MARIADB_AUTO_UPGRADE` 가 비어 있으면 entrypoint 가 업그레이드와 헬스체크 계정 생성을 둘 다 건너뛴다.**

```
[Entrypoint]: MariaDB upgrade information missing, assuming required
[Entrypoint]: MariaDB upgrade (mariadb-upgrade or creating healthcheck users) required,
              but skipped due to $MARIADB_AUTO_UPGRADE setting
```

결과: `healthcheck.sh --connect` 가 `Access denied for user 'root'@'localhost' (using password: NO)` 로
**영원히 실패**하고 컨테이너가 `starting` 에 머문다. `.env.mariadb` 에 `MARIADB_AUTO_UPGRADE=true` 를 넣는다.

**주의**: 이 함정은 **신규 초기화한 일회성 컨테이너 검증에서는 드러나지 않는다.** 신규 초기화 경로는
헬스체크 계정을 만들기 때문이다. 반드시 기존 데이터디렉터리로 확인한다.

기타:

- `MYSQL_ROOT_PASSWORD` 는 **빈 데이터디렉터리의 최초 초기화에서만** 소비된다. 기존 데이터디렉터리에는 무효과.
- `mysql_upgrade_info` 파일은 업그레이드 후 **사라진다**(MariaDB 가 폐기). 이 파일로 성공 여부를 판정하면 안 된다.
  판정 근거는 ①`mysql.column_stats` 의 `hist_type` enum 에 `JSON_HB` 포함 ②로그 `[ERROR]` 0건 ③`SELECT VERSION()`.
- 업그레이드 성공 시 entrypoint 가 `Backing up system database to system_mysql_backup_<ver>.sql.zst` 를 남긴다.
- 메이저 업그레이드는 버전 건너뛰기를 지원하지 않는다. 시스템 테이블이 오래됐다면
  `10.6 → 10.11 → 11.4 LTS → 11.8 LTS → 12.x` 단계 업그레이드를 **사본으로 먼저** 검증한다.
- 12.3.3 은 레거시 `sql_mode`(`NO_AUTO_CREATE_USER` 포함) 를 그대로 수용하고,
  `utf8mb3_general_ci`·`latin1_swedish_ci`·`utf8mb4_uca1400_ai_ci` 를 모두 지원함을 실측 확인했다.
  그래도 업그레이드 전에는 **엔진·콜레이션·sql_mode 를 미리 조회**해 대상 이미지에서 수용하는지 확인한다.

### 8.2 redmine

**`REDMINE_NO_DB_MIGRATE=0` 은 마이그레이션을 막는다.** `/docker-entrypoint.sh` 가 `-z`(비어 있음) 로 판별한다:

```sh
if [ "$1" != 'rake' -a -z "$REDMINE_NO_DB_MIGRATE" ]; then
        rake db:migrate
```

`=0` 도 "설정됨" 이므로 **통째로 비워야** 한다. 메이저 업그레이드(6.0.x → 7.0.x) 는 마이그레이션이 필수다.

기타:

- `config/database.yml` 을 바인드 마운트하면 entrypoint 가 재생성하지 않으므로 **이 파일이 `REDMINE_DB_*` 보다 우선**한다.
- `schema_migrations.version` 은 varchar 이므로 `MAX(version)` 은 **사전순**이라 `99` 같은 엉뚱한 값이 나온다.
  `MAX(CAST(version AS UNSIGNED))` 를 쓴다.
- 플러그인은 `required_redmine_version` 을 선언하지 않는 경우가 많다. Ruby 메이저가 올라가면 **반드시 dry-run**.
- 격리 dry-run 방법: 프로덕션 덤프를 일회성 mariadb 에 복원 → **프라이빗 네트워크**(host 네트워크 금지, 포트 공개 금지) →
  `database.yml` 을 **호스트에서** 재생성해 일회성 DB 호스트명을 가리키게 함 → 플러그인은 **복사본** 마운트 →
  부팅 전 `getent hosts` 로 DNS 가드 → 마이그레이션 전후 건수 비교.
  dry-run 스크립트에 **가드**를 넣어 "기대한 마이그레이션 건수(예: 317)" 가 아니면 중단하게 한다.
  프로덕션 DB 를 실수로 마이그레이션하는 사고를 막는다.
- dry-run 재사용 시 **이전 라운드의 컨테이너 이름과 `database.yml` 의 호스트명을 일치**시킨다.
  불일치하면 `Unknown server host` 로 실패한다.

### 8.3 gitea

- DB 가 **sqlite3** (`/var/lib/gitea/data/gitea.db`) 이므로 mariadb 와 무관하게 업그레이드된다. 이 파일 하나가 전체 DB 다.
- rootless 는 컨테이너 내부 UID/GID 1000. 호스트 데이터 디렉터리 소유권을 미리 맞춰야 한다.
- 이미지가 `VOLUME /etc/gitea` 를 선언하므로 익명 볼륨이 생기고 `app.ini` 는 그 안으로 바인드된다.
- `latest-rootless` 가 1.x 가 아닐 수 있다. §4.1 앵커 기법으로 확인한다.

### 8.4 haproxy

- 443 바인드에 `net.ipv4.ip_unprivileged_port_start=0` sysctl 이 필요하다.
- **설정 파일에서 환경변수를 전개하지 않는다.** `stats auth <user>:<pw>` 는 cfg 에 남을 수밖에 없고,
  `.env` 로 옮기려면 기동 전 `envsubst` 렌더링 단계가 필요하다(conf 를 `:ro` 로 마운트 중이라면 마운트도 바꿔야 함).
- 재생성 전에 **실전 cfg 를 대상 이미지로 `-c` 검증**한다. 실패하면 HTTPS 전체가 죽는다.

```bash
docker run --rm -v /home/haproxy/conf:/usr/local/etc/haproxy:ro \
  -v /home/haproxy/lib:/var/lib/haproxy:ro \
  --sysctl net.ipv4.ip_unprivileged_port_start=0 \
  --entrypoint /bin/sh <target-image> -c \
  'haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg; echo CFG_EXIT=$?'
```

  listener 가 없는 cfg 는 `exit(2)` 다. 0 이어야 한다.
- 저장소의 `www1/haproxy/haproxy.cfg` 는 실전과 다르다(§3.2). **실전 cfg 를 기준으로** 작업한다.

### 8.5 wireguard (linuxserver)

- `wg0.conf` md5 를 전환 전후로 비교해 **피어 설정이 보존됐는지** 확인한다. 바뀌면 클라이언트 재설정이 필요하다.
- `PEERS`, `INTERNAL_SUBNET` 등은 **신규 conf 생성 시에만** 영향을 주므로 기존 구성은 대체로 보존된다. 그래도 md5 로 검증한다.
- `ALLOWEDIPS=0.0.0.0/0` 는 모든 피어를 풀 터널로 만든다. 실수로 넣지 않는다.

---

## 9. 서비스별 검증 체크리스트

재생성 후 **전부** 확인한다. 하나라도 실패하면 롤백을 검토한다.

| 공통 | 명령 |
| --- | --- |
| 목표 이미지 | `docker inspect -f '{{.Config.Image}}'` |
| compose 관리 | `com.docker.compose.project` 라벨 |
| healthcheck 정의 | `{{json .Config.Healthcheck}}` ≠ `null` |
| healthy | `{{.State.Health.Status}}` |
| 크래시 루프 아님 | `{{.RestartCount}}` = 0 |
| 최근 에러 없음 | `docker logs --since 15m \| grep -icE '\[ERROR\]\|FATAL\|panic\|rake aborted'` = 0 |

| 서비스 | 추가 검증 |
| --- | --- |
| mariadb | `SELECT VERSION()`, DB별 테이블 수·크기 pre=post, 계정 수, 앱 계정 로그인, `hist_type` 에 `JSON_HB` |
| redmine | `schema_migrations` 건수 증가, `MAX(CAST(version AS UNSIGNED))`, `/login` 200, `<title>`, 플러그인 로드, `ruby -v` |
| gitea | `gitea --version`, `/api/healthz` 의 `database:ping`·`cache:ping`, `Migration[n]` 로그, `gitea.db` 크기 증가, SSH 포트 |
| haproxy | `haproxy -v`, `haproxy -c` rc=0, `nc -z 443`, TLS 핸드셰이크, **서빙 인증서 `notAfter`** |
| wireguard | `wg show wg0 listen-port`, `ip link show wg0` UP, 피어 수, `wg0.conf` md5 불변, 환경변수 목록 |

엔드투엔드:

```bash
curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1/     # haproxy 경유
curl -s  -o /dev/null -w '%{http_code}' http://127.0.0.1:3333/ # gitea
curl -s  -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login
ss -ulpn | grep -c 51820      # wireguard
ss -ltnp | grep -c 23306      # mariadb
```

---

## 10. 셸·도구 함정 (전부 실제로 걸린 것)

| 함정 | 증상 | 올바른 방법 |
| --- | --- | --- |
| `grep -c $'\r'` | `$'\r'` 이 전달 중 뭉개져 **빈 패턴 → 전 줄 매칭.** 파일 줄 수와 같은 값이 나옴 | `tr -cd '\r' < f \| wc -c` |
| `git show HEAD:f \| tr -cd '\r'` | MSYS 파이프의 텍스트 변환으로 CR 측정 부정확 | 워크트리 파일에 직접 `od -c` / `head -1 \| od -An -c` |
| `cmd \| tee f \| head -N` | `head` 가 파이프를 닫아 SIGPIPE 로 `tee` 가 죽음 → **저장 파일이 잘림** | 전체 저장이 목적이면 `> f 2>&1` 만 쓴다 |
| `pscp`/`scp` + `mktemp "x.XXXXXX"` | 임시 파일의 **접미사 이름 그대로** 업로드됨 (`check_versions.sh.kpdhoC`) | `mktemp -d` 후 그 안에 **원래 basename** 으로 사본 생성 |
| `pkill -f "<pattern>"` | 같은 명령행의 다른 리터럴(예: `rm -f /tmp/<동일파일>`) 이 매칭돼 **자기 셸을 죽임** (exit 255, 출력 절단) | 필드 기반: `ps -eo pid,args \| awk '$2=="bash" && index($3,"/tmp/x")==1{print $1}'` |
| MSYS 의 `/Create` 등 | POSIX 경로로 오인해 `C:/Program Files/Git/Create` 로 변환 | `MSYS2_ARG_CONV_EXCL='*'` prefixed (예: `schtasks`) |
| Windows 에서 쓴 스크립트 | CRLF 때문에 서버 bash 가 `\r` 을 명령 일부로 인식 | 업로드 전 `sed 's/\r$//'` 로 정규화한 사본 전송, 또는 서버에서 `sed -i 's/\r$//'` |
| `read -r PW` + `set -e` | 개행 없이 EOF 를 만나면 `read` 가 rc=1 | `set -e` 를 쓰지 않거나 `read -r PW \|\| true` 후 빈 값 검사 |

저장소 개행: `core.autocrlf=false` 이고 파일별로 **혼합**이다(`start-wireguard.sh`·`start-mm-agent.sh` 는 CRLF,
나머지 LF). `.editorconfig` 는 `lf` 를 요구하지만, 정규화하면 전체 줄이 diff 로 잡히므로
**각 파일의 기존 개행을 보존**한다. `od` 로 확인하고 `git diff --numstat` 이 비정상적으로 크지 않은지 본다.

---

## 11. 롤백

### 11.1 준비물 (전환 전에 확보)

- 구 `docker inspect` JSON — 정확한 플래그 재현용
- 구 이미지 ID — 태그가 float 해도 대상을 특정
- 정지 상태의 데이터디렉터리 물리 사본
- DB 논리 덤프 (전 DB)
- 앱 설정 tar

### 11.2 일반 절차

```bash
cd /home/bin/www1
docker rm -f <svc>
sed -i 's/^<SVC>_TAG=.*/<SVC>_TAG=<구버전>/' .env
docker compose up -d <svc>
docker inspect -f '{{.Config.Image}} {{.State.Status}}' <svc>
```

### 11.3 mariadb 데이터디렉터리 복원

```bash
docker rm -f mariadb
mv /home/mariadb /home/mariadb.failed          # 증거 보존, 바로 삭제하지 않는다
cp -a <백업>/datadir /home/mariadb
sed -i 's/^MARIADB_TAG=.*/MARIADB_TAG=11.7.2-noble/' .env
docker compose up -d mariadb
```

### 11.4 자동 롤백은 하지 않는다

실패 시 **자동 되돌리기를 하지 말고 로그를 먼저 본다.** 업그레이드 중인데 unhealthy 로 오판해
되돌리면 오히려 손상된다. 재시도는 `start_period` 만료 후, 로그로 원인을 확인하고 결정한다.

**주의**: mariadb 메이저 업그레이드로 데이터디렉터리를 새 버전이 열었다면 **다운그레이드는 불가능**하다.
되돌리려면 물리 사본 복원 외에는 방법이 없다. 그래서 §6.1 의 정지 상태 사본이 필수다.

---

## 12. 정리

작업 후 남기는 것:

| 항목 | 처리 |
| --- | --- |
| 서버 `/tmp` 의 스크래치 스크립트·로그 | 삭제 |
| 테스트 컨테이너·네트워크 (`hctest_*`, `rmtest_*`) | `trap` 으로 삭제 확인 |
| 비밀번호를 담은 임시 파일 (`/root/.pw_*`, 컨테이너 내 `/tmp/.mycnf*`) | 삭제 확인 |
| dry-run 작업 디렉터리 | 크기 확인 후 사용자 판단으로 삭제 |
| 로컬 `.tmp/` 산출물 | 미추적이므로 보존 가능 (현황 문서 포함) |

```bash
docker ps -a --format '{{.Names}}' | grep -E '^(hctest_|rmtest_)' || echo "테스트 컨테이너 없음"
ls /root/.pw_* /tmp/.mycnf* 2>/dev/null || echo "비밀 임시파일 없음"
```

회수 가능 자원도 함께 보고한다: `docker system df` (이미지·볼륨), `df -h /home`.
gitea 익명 볼륨이 재생성마다 쌓이므로 `docker volume ls` 를 periodically 확인한다.

---

## 13. 2026-10-15 시점 미해결 사항

다음 세션에서 **다시 조사하지 말 것** — 이미 확인된 사실이다. 다만 현재 상태는 재확인한다.

| 항목 | 내용 |
| --- | --- |
| **SSL 인증서 만료** | `CN=*.hwh.kr`, `notAfter=Nov 7 23:51:29 2026 GMT`. `certbot-renew-hwh.kr.sh` 는 완전 수동(`read -p` 2회, DNS-01), **root crontab 비어 있음**, certbot 이미지는 5년 전 것 |
| **DB 백업 미스케줄** | `backup-databases.sh` 가 cron 에 없음. 마지막 덤프 2025-08-13. MPH_MONITOR·MINING 은 대상에서 빠져 있음 |
| **비밀번호 로테이션 필요** | `start-redmine.sh` 에 있던 redmine DB 비밀번호, haproxy `stats auth` 값, 주석 처리됐던 mariadb root 값이 **git 이력에 커밋돼 되돌릴 수 없음.** 값은 여기에 적지 않는다 — `git log -p` 로 확인 |
| **mariadb 계정 위생** | 익명 계정 `''@localhost`·`''@hbesthee-60337.novalocal`, 원격 root `root@1.235.32.154`·`root@122.32.136.237`, 무비밀 root 3종 |
| **저장소 haproxy.cfg 가 낡음** | 실전과 백엔드·maxconn·인증서 경로가 모두 다름 |
| **서버의 `_2` 변형 스크립트** | `start-haproxy_2.sh`, `start-wireguard_2.sh`, `stop-wireguard_2.sh`, `start-superbin.sh`. Compose 가 유일한 소스가 되었으므로 정리 여부 결정 필요 |
| **미사용 이미지** | `redmine:5.1.7`, 구버전 5종, `hanwhhanwh/node:latest`(5년), `certbot/certbot:latest`(5년) |
| **미구동 서비스** | `mm-agent`, `superbin` 컨테이너 없음 |
| **gitea 28.x** | `latest-rootless` = `28.1.0-rootless`. 현재는 `1.27.3-rootless`. 전환하려면 별도 마이그레이션 검토 |
