#!/usr/bin/env bash
# qwen CLI footer의 2번째 줄(모드 표시 줄)이 작업 중에 사라지는 것을 막는다.
#
# 하는 일 (v0.25.2 기준, 청크 이름의 해시 값은 빌드마다 바뀐다):
#   1) 작업 중에만 붙는 "Enter to steer · Ctrl+Q to queue" 문구를 제거한다.
#      chunks/startInteractiveUI-*.js  streamingState==="responding" 분기 (ink — 기본 렌더러)
#      chunks/start-opentui-ui-*.js    modeHint 배열의 streaming 분기 (QWEN_TUI_RENDERER=opentui)
#   2) footer 높이를 항상 2행으로 고정한다. ink는 빈 Text를 {width:0,height:0}으로 재므로
#      (measureText) 내용이 비는 순간 하단 행이 0행으로 붕괴하고, statusLine은 우측 항목 폭이
#      흔들릴 때마다 1↔2행으로 말린다. → 하단 행 Box minHeight:1, statusLine maxHeight:1 + truncate
#   3) DEC 2026 synchronized output 비활성은 **opt-in**이다(QWEN_EXTRA). 2026-10-16 실측: 이것을
#      끄면 매 프레임 다시 그리기가 원자적이지 않게 되어 중앙 본문 깜빡임이 보인다.
#   4) Ink를 incremental 렌더링으로 띄운다. mintty 3.8.1은 DEC 2026을 지원하지 않아(DECRQM 0) 프레임마다
#      전 행 지우기→다시 그리기가 그대로 보인다(화면 떨림·맨 아래 줄 사라짐). 바뀐 행만 덮어쓰면 사라진다.
#   5) 스피너 줄의 "(시간 · 토큰 · esc to cancel)"을 말지 않고 자른다. 2행이 되면 프레임이 화면 높이를
#      넘어 Ink가 매 프레임 화면 전체를 지운다(clearTerminal).
#   화면 겹침(잔상)은 패치가 아니라 설정으로 막는다: ~/.qwen/settings.json ui.showScrollbar=false.
#   스크롤바가 마지막 열에 그려지면 ConPTY(conhost)가 즉시 줄을 넘겨 프레임이 밀린다(2026-10-17 재현).
#   평가 창(ui.enableUserFeedback=false)도 화면 높이를 넘겨 clearTerminal을 부르므로 끈다.
#
# 사용법:
#   qwen_footer_hint_fix.sh            실행에 관여하는 사본만 패치
#   qwen_footer_hint_fix.sh status     패치 여부만 확인 (파일에 손대지 않는다)
#   qwen_footer_hint_fix.sh restore    .bak 원본으로 되돌린다
#   qwen_footer_hint_fix.sh --all      ~/.qwen/updates의 모든 버전 사본까지 처리
#   QWEN_EXTRA="규칙명,…"              opt-in 규칙을 포함한다 (예: ink synchronized output 비활성)
#   QWEN_SKIP="규칙명,…"               특정 규칙을 제외한다 (원인 분리 A/B용)
#   apply는 입력 시그니처(버전+청크 파일 이름+적용 규칙)가 ~/.qwen/footer_hint_fix.state와 같으면
#   본문 스캔을 건너뛴다 — 시작 랩퍼/훅에서 매번 호출해도 비용이 없도록.
#
# 사본 찾는 곳 (경로 탐색·정렬은 전부 node에서 한다 — MSYS 경로 변환 문제 회피):
#   %APPDATA%\npm\node_modules\@qwen-code\qwen-code          qwen.cmd가 exec하는 런처
#   %USERPROFILE%\.qwen\updates\npm\<hash>\versions\<ver>\…  자가업데이트본 (최신 1개)
#
# 주의: 첫 실행 시 <file>.bak을 남기고, node --check이 실패하면 자동으로 .bak을 되돌린다.
#       qwen 자가업데이트는 청크를 새로 내려받으므로 업데이트 후 이 스크립트를 다시 실행해야 한다.
set -u

MODE="apply"
ALL=0
for arg in "$@"; do
  case "$arg" in
    status)     MODE="status" ;;
    restore)    MODE="restore" ;;
    apply)      MODE="apply" ;;
    --all|-a)   ALL=1 ;;
    -h|--help)  sed -n '2,36p' "$0"; exit 0 ;;
    *) echo "알 수 없는 인수: $arg (status|restore|apply|--all)" >&2; exit 2 ;;
  esac
done

command -v node >/dev/null 2>&1 || { echo "node를 찾을 수 없습니다." >&2; exit 1; }

export QWEN_MODE="$MODE"
export QWEN_ALL="$ALL"

node - <<'NODE'
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const MODE = process.env.QWEN_MODE || "apply";
const ALL = process.env.QWEN_ALL === "1";

// Git Bash는 HOME을 /c/Users/…로 준다. node는 그 형태를 절대경로로 못 쓴다.
const fromMsys = (p) => {
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p || "");
  return m ? `${m[1].toUpperCase()}:/${m[2]}` : p;
};
const HOME = fromMsys(process.env.USERPROFILE) || fromMsys(process.env.HOME) || os.homedir();
const APPDATA = fromMsys(process.env.APPDATA) || path.join(HOME, "AppData", "Roaming");

const pkgOf = (dir) => path.join(dir, "node_modules", "@qwen-code", "qwen-code");
const hasChunks = (root) => {
  try { return fs.statSync(path.join(root, "chunks")).isDirectory(); } catch { return false; }
};
const verCmp = (a, b) => {
  const x = a.split(/[^0-9A-Za-z]+/).filter(Boolean), y = b.split(/[^0-9A-Za-z]+/).filter(Boolean);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const m = Number(x[i] ?? 0), n = Number(y[i] ?? 0);
    if (Number.isFinite(m) && Number.isFinite(n) && m !== n) return m - n;
    if ((x[i] ?? "") !== (y[i] ?? "")) return (x[i] ?? "") < (y[i] ?? "") ? -1 : 1;
  }
  return 0;
};

// ── 사본 수집 ────────────────────────────────────────────────────────────────
const roots = [];
const launcher = path.join(APPDATA, "npm", "node_modules", "@qwen-code", "qwen-code");
if (hasChunks(launcher)) roots.push(["npm 전역(런처)", launcher]);

const cache = path.join(HOME, ".qwen", "updates", "npm");
const found = [];
try {
  for (const hash of fs.readdirSync(cache)) {
    const vdir = path.join(cache, hash, "versions");
    if (!fs.statSync(vdir).isDirectory()) continue;
    for (const ver of fs.readdirSync(vdir)) {
      const root = pkgOf(path.join(vdir, ver));
      if (hasChunks(root)) found.push([ver, root]);
    }
  }
} catch { /* 캐시 없음 */ }
found.sort((a, b) => verCmp(b[0], a[0]));
if (ALL) for (const [ver, root] of found) roots.push([`updates ${ver}`, root]);
else if (found[0]) roots.push([`updates ${found[0][0]} (최신)`, found[0][1]]);

if (!roots.length) { console.error("qwen 설치 경로(chunks)를 찾지 못했습니다."); process.exit(1); }

// ── 고속  ────────────────────────────────────────────────────────────────
// 입력 시그니처(버전 + 청크 파일 이름 목록)가 직전 apply와 같으면 본문 스캔을 건너뛴다.
// qwen 시작 랩퍼/훅에서 매번 호출해도 비용이 없도록 한다. 자가업데이트·npm 재설치는
// 청크 파일 이름의 해시가 바뀌므로 시그니처가 변한다. restore는 상태를 무효화한다.
const sig = roots.map(([label, root]) => {
  let ver = "?";
  try { ver = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version; } catch { /* 없음 */ }
  let names = [];
  try {
    names = fs.readdirSync(path.join(root, "chunks"))
      .filter((f) => /^(start.*|chunk-.*)\.js$/.test(f)).sort();
  } catch { /* 없음 */ }
  return `${label}@${ver}:${names.join(",")}`;
}).join("|");
const STATE = path.join(HOME, ".qwen", "footer_hint_fix.state");

// ── 패치 규칙 ────────────────────────────────────────────────────────────────
// 청크 안의 구분자는 리터럴 "\xB7"(백슬래시+x+B+7) 또는 실제 '·' 문자로 적힌다.
const SEP = String.raw`(?:\\xB7|\u00b7)`;
const RT = String.raw`import_jsx_runtime\w*`;
const RULES = [
  // opentui가 먼저다: 이 파일의 `text:t("…"),` 조각을 ink 규칙이 삼키면 `[{text:color:…}`가 되어 문법이 깨진다.
  ["opentui streaming 분기",
    new RegExp(`\\.\\.\\.streaming\\?\\[\\{text:t\\("Enter to steer ${SEP} Ctrl\\+Q to queue"\\),color:[\\w.]+\\.dim\\},\\.\\.\\.approvalMode\\?\\[\\{text:"\\s*${SEP}\\s*",color:[\\w.]+\\.dim\\}\\]:\\[\\]\\]:\\[\\]`, "g"),
    "...streaming?[]:[]"],
  ["ink hint 텍스트",
    new RegExp(`(?<!text:)t\\("Enter to steer ${SEP} Ctrl\\+Q to queue"\\),`, "g"), ""],
  ["ink 모드 문구 앞 구분자",
    new RegExp(`"\\s*${SEP}\\s*"\\s*,(\\(0,${RT}\\.jsx\\)\\(AutoAcceptIndicator)`, "g"), '"",$1'],
  // ── footer 높이 고정 ────────────────────────────────────────────────────
  // ink는 빈 Text를 {width:0,height:0}으로 잰다(measureText). 내용이 비는 순간 하단 행이
  // 0행으로 붕괴하고, statusLine은 우측 항목(context 지표·pill) 폭이 바뀔 때마다 1↔2행으로
  // 말린다. 둘 다 footer 높이를 흔들어 화면이 깜빡이므로 행 수를 고정한다.
  ["ink 하단 행 minHeight",
    new RegExp(`(Box_default,\\{flexDirection:"row",flexShrink:1,)(children:\\[\\(0,${RT}\\.jsx\\)\\(Text,\\{wrap:"truncate",children:leftBottomContent\\}\\))`, "g"),
    "$1minHeight:1,$2"],
  ["ink statusLine 단일 행", /maxHeight:MAX_STATUS_LINES/g, "maxHeight:1"],
  ["ink statusLine 말림 금지", /wrap:"wrap",children:statusLineLines\.join/g,
    'wrap:"truncate",children:statusLineLines.join'],
  // mintty에서 DEC 2026(synchronized output) 처리가 온전치 않으면 프레임 도중 구 화면이
  // 잠시 보여 깜빡임으로 보인다. TTY면 무조건 켜지므로 끈다.
  // 단, 2026-10-16 실측: 이 규칙을 끄면 매 프레임 다시 그리기가 원자적이지 않게 되어
  // **중앙 본문 깜빡임**이 보인다. 그래서 기본 제외(opt-in) — 필요 시 QWEN_EXTRA="ink synchronized output 비활성".
  // mintty 3.8.1은 DEC 2026을 모른다(DECRQM ?2026 → 0, 2026-10-17 실측). 그래서 BSU/ESU가 무시되고,
  // 기본 log-update가 매 프레임 전 행을 지운 뒤 다시 그리는 과정이 그대로 보인다(가상화 이력 모드는
  // 프레임이 화면 전체라 화면 전체가 떨리고, 맨 아래 행이 가장 먼저 지워져 가장 늦게 그려진다).
  // incremental 모드는 바뀐 행만 덮어써 중간 빈 화면이 없다.
  // 스피너 줄의 "(시간 · 토큰 · esc to cancel)"는 기본 wrap이라 폭을 넘으면 2행이 된다. 가상화 이력
  // 모드는 프레임이 화면 높이에 딱 맞춰져 있어 1행만 늘어도 overflow → Ink가 매 프레임
  // clearTerminal(2J+3J)로 전체를 다시 그린다(2026-10-17 실측: 15초간 370회). 앞의 primaryText처럼 자른다.
  ["ink 스피너 줄 말림 금지",
    /(Text,\{color:theme\.text\.secondary,)(children:\[" ",cancelAndTimerContent\]\})/g,
    '$1wrap:"truncate-end",$2'],
  ["ink incremental 렌더링",
    /(isScreenReaderEnabled:config\.getScreenReader\(\),alternateScreen:useVP,)(?!incrementalRendering)/g,
    "$1incrementalRendering:true,"],
  ["ink synchronized output 비활성",
    /function shouldSynchronize\(stream,interactive\)\{return"isTTY"in stream&&stream\.isTTY&&\(interactive\?\?!is_in_ci_default\)\}/g,
    'function shouldSynchronize(stream,interactive){return false}'],
];
// opt-in 규칙은 QWEN_EXTRA로 포함, QWEN_SKIP으로 제외 — 원인 분리 A/B용.
const OPTIN = new Set(["ink synchronized output 비활성"]);
const EXTRA = new Set((process.env.QWEN_EXTRA || "").split(",").map((s) => s.trim()).filter(Boolean));
const SKIP = new Set((process.env.QWEN_SKIP || "").split(",").map((s) => s.trim()).filter(Boolean));
const EFFECTIVE = RULES.filter(([name]) => !SKIP.has(name) && (!OPTIN.has(name) || EXTRA.has(name)));
// 시그니처에 적용 규칙 목록도 넣는다 — 규칙이 추가·제외되면 같은 청크라도 다시 스캔해야 한다.
const SIG = `${sig}#${EFFECTIVE.map(([name]) => name).join(",")}`;
if (MODE === "restore") { try { fs.unlinkSync(STATE); } catch { /* 없음 */ } }
if (MODE === "apply") {
  let prev = "";
  try { prev = fs.readFileSync(STATE, "utf8"); } catch { /* 없음 */ }
  if (prev === SIG) { console.log("입력 시그니처 동일 — 건너뜀 (state 일치)"); process.exit(0); }
}
// 규칙이 하나라도 맞으면 패치가 필요하다 — 문구를 이미 지운 사본에도 높이 고정 규칙이 남는다.
const needsPatchOf = (src) => EFFECTIVE.some(([, re]) => { re.lastIndex = 0; return re.test(src); });

let failed = 0;
for (const [label, root] of roots) {
  const version = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version; } catch { return "?"; }
  })();
  console.log(`\n===== [${label}] v${version}  ${root}`);

  const chunks = path.join(root, "chunks");
  const cands = fs.readdirSync(chunks)
    .filter((f) => /^(start.*|chunk-.*)\.js$/.test(f))
    .map((f) => path.join(chunks, f));

  // ink 변형은 t("…") 호출째 사라지므로, 마커 문자열 유무만으로는 "패치됨"을 못区分한다.
  let relevant = 0;
  for (const file of cands) {
    const bak = `${file}.bak`;
    const base = path.basename(file);
    const src = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const needsPatch = needsPatchOf(src);
    const hasBak = fs.existsSync(bak);
    const mine = needsPatch || hasBak || src.includes("Enter to steer")
      || /streamingState==="responding"|const modeHint=|leftBottomContent|previousLineCount=lines\.length/.test(src);
    if (!mine) continue;
    relevant++;

    if (MODE === "restore") {
      if (!hasBak) { console.log(`  ${base} : .bak 없음 — 건너뜀`); continue; }
      fs.writeFileSync(file, fs.readFileSync(bak));
      console.log(`  ${base} : 원본 복원 (.bak 유지)`);
      continue;
    }

    if (MODE === "status") {
      const state = needsPatch ? "패치 필요"
        : src.includes("Enter to steer") ? "패치 안 됨 — 패턴 확인 필요"
        : hasBak ? "패치 적용됨" : "패치 불요 (이 빌드에 없음)";
      const off = RULES.filter(([name, re]) => !EFFECTIVE.some(([n]) => n === name)
        && (re.lastIndex = 0, re.test(src))).map(([name]) => name);
      console.log(`  ${base} : ${state}${hasBak ? "  (.bak 있음)" : ""}${off.length ? `  [제외 중: ${off.join(", ")}]` : ""}`);
      continue;
    }
    if (!needsPatch) { console.log(`  ${base} : 이미 패치 상태 — 건너뜀`); continue; }

    let out = src;
    const applied = [];
    for (const [name, re, repl] of EFFECTIVE) {
      const n = (out.match(re) || []).length;
      if (!n) continue;
      out = out.replace(re, repl);
      applied.push(`${name} x${n}`);
    }
    if (!applied.length) {
      const at = ["Enter to steer", "maxHeight:MAX_STATUS_LINES", "leftBottomContent"]
        .map((m) => src.indexOf(m)).find((i) => i >= 0) ?? 0;
      console.error(`  ${base} : 패턴 불일치 — 빌드가 바뀌었습니다. 수동 확인 필요`);
      console.error(`    ${JSON.stringify(src.slice(Math.max(0, at - 140), at + 180))}`);
      failed++;
      continue;
    }

    if (!fs.existsSync(bak)) fs.writeFileSync(bak, src);          // 원본은 딱 한 번만
    try {
      fs.writeFileSync(file, out);
    } catch (e) {
      console.error(`  ${base} : 쓰기 실패 (${e.code}) — qwen을 종료한 뒤 다시 실행하세요.`);
      failed++;
      continue;
    }
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
      console.log(`  ${base} : 패치됨 [${applied.join(", ")}]  node --check OK`);
    } catch (e) {
      fs.writeFileSync(file, fs.readFileSync(bak));
      console.error(`  ${base} : 문법 검사 실패 → .bak으로 자동 복원`);
      // minified源码라 stderr가 한 줄에 수십 MB일 수 있다 — 보고서는 앞부분만 남긴다.
      console.error(`    ${String(e.stderr || e.message).replace(/\s+/g, " ").slice(0, 300)}`);
      failed++;
    }
  }
}

if (MODE === "apply") {
  if (!failed) { try { fs.writeFileSync(STATE, SIG); } catch { /* 없음 */ } }
  console.log(failed ? `\n미완: ${failed}건은 손대지 않았습니다.`
                     : "\n완료. qwen을 재시작하면 footer에서 문구가 사라집니다.");
}
process.exit(failed ? 1 : 0);
NODE
exit $?
