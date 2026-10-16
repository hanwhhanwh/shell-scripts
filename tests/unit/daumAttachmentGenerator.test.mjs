import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../tamper/daum_attachment_generator.js', import.meta.url));

const DAUM_BASE = 'https://attach.mail.daum.net/bigfile/v1/urls';
const YA_BASE = 'https://www.ya-moon.com/newboard/yamoonboard/admin-board/download.asp?fullboardname=';
const YA_REFERER = 'https://www.ya-moon.com/newboard/yamoonboard/board-read.asp?fullboardname=';
const PAGE = 'yamoonmemberboard&mtablename=request&num=58540&ref=30253&page=1';

/** innerHTML의 <a>를 스크립트가 읽는 3속성(href/textContent/title)만 뽑아 재현한다. */
function parseAnchors(html) {
	const anchors = [];
	for (const [, attrs, text] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
		const attr = (name) => attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? null;
		anchors.push({ href: attr('href'), textContent: text.trim(), getAttribute: () => attr('title') });
	}
	return anchors;
}

const yaLink = (filename) =>
	`<a href="${YA_BASE}${PAGE.replace('&ref=30253', '')}&filename=${filename}">${filename} [12.3KB]</a>`;
const daumLink = (title, id) => `<a href="${DAUM_BASE}/d/${id}" title="${title} 다운로드">${title}</a>`;

/** IIFE 안의 private 함수를 회수하려고 맨 마지막 })(); 앞에 노출 코드를 심는다. */
function scriptSource() {
	const src = readFileSync(SRC, 'utf8');
	const injected = src.replace(
		/\n\}\)\(\);/,
		'\nglobalThis.__expose = { createDaumDownloadArgs, createModifiedFilename };\n})();'
	);
	if (injected === src) throw new Error('스크립트 끝의 })();를 찾지 못해 함수를 회수하지 못했다');
	return injected;
}

/** 유저스크립트를 vm에서 구동하고 버튼 목록·클립보드·회수된 private 함수를 돌려준다. */
function runScript(linksHtml) {
	const buttons = [];
	const copied = [];
	const panel = { innerHTML: linksHtml };
	const makeButton = () => ({
		textContent: '',
		style: {},
		listeners: {},
		addEventListener(type, fn) { this.listeners[type] = fn; },
	});
	const box = {
		console: { log() {}, error() {} },
		GM_info: { script: { name: 'test', version: 'v0', author: 'test' } },
		location: { href: YA_REFERER + PAGE },
		DOMParser: class { parseFromString(html) { return { querySelectorAll: () => parseAnchors(html) }; } },
		document: {
			querySelector: (sel) => (sel.includes('panel-default') ? panel : { appendChild() {} }),
			createElement: () => { const b = makeButton(); buttons.push(b); return b; },
		},
		navigator: { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } },
		alert: () => {},
	};
	vm.createContext(box);
	vm.runInContext(scriptSource(), box, { filename: 'daum_attachment_generator.js' });
	return { buttons, copied, fns: box.__expose };
}

async function copyFromButton(linksHtml, buttonIndex) {
	const { buttons, copied } = runScript(linksHtml);
	buttons[buttonIndex].listeners.click();
	await new Promise((res) => setImmediate(res));
	return { text: copied[0], buttons };
}

/** IIFE 안의 private 함수를 그대로 꺼낸다 (라인 번호 의존 없이 실 클로저 사용). */
function loadFn(name) {
	const fn = runScript('').fns?.[name];
	if (typeof fn !== 'function') throw new Error(`${name}을 회수하지 못했다 — 선언/이동이 바뀌었는지 확인한다`);
	return fn;
}

const header =
	`export DAUM_BASE="${DAUM_BASE}" ; \\\n` +
	`export YA_BASE="${YA_BASE}" ; \\\n` +
	`export YA_REFERER="${YA_REFERER}" ; \\\n`;
const yaCurl = `curl -K "\${HOME}/.conf/ym.conf"`;
const daumCurl = `curl -K "\${HOME}/.conf/daum.conf" \\\n`;
const yaItem = (f, sep) => ` -o "${f}" "\${YA_BASE}${PAGE.replace('&ref=30253', '')}&filename=${f}&download_start=y&_dl=TS" -e "\${YA_REFERER}${PAGE}"${sep}`;
const daumItem = (f, id) => ` -o "${f}" "\${DAUM_BASE}/d/${id}" \\\n`;

test('야문은 항목별 curl + 사이 sleep, 카카오는 daum.conf 묶음 (요구 출력과 동일)', async () => {
	const html =
		yaLink('ADN-532.srt') + yaLink('ADN-605.srt') +
		daumLink('JUQ-342.uncen.mp4', 'aeyYqjhrcWmVQX7YHPXqCcFRS4U/Z4QUxkBrWC2dfdRairG_1w') +
		daumLink('ADN-532.mp4', 'vzepr_GRHZ4jYXkMYnV1VQusvbU/C_y5e815lt4csLvJ95AeHA') +
		daumLink('ADN-605.mp4', '819ONR-TgkZktBX9Q64zd3eq72A/C_y5e815lt4eEHx_ayEyUA');
	const { text } = await copyFromButton(html, 0);

	const expected =
		header +
		yaCurl + yaItem('ADN-532.srt', ' ; sleep 30 ; \\') + '\n' +
		yaCurl + yaItem('ADN-605.srt', ' ; \\') + '\n' +
		daumCurl +
		daumItem('JUQ-342-HU.mp4', 'aeyYqjhrcWmVQX7YHPXqCcFRS4U/Z4QUxkBrWC2dfdRairG_1w') +
		daumItem('ADN-532.mp4', 'vzepr_GRHZ4jYXkMYnV1VQusvbU/C_y5e815lt4csLvJ95AeHA') +
		daumItem('ADN-605.mp4', '819ONR-TgkZktBX9Q64zd3eq72A/C_y5e815lt4eEHx_ayEyUA');

	assert.equal(text.replace(/_dl=\d+/g, '_dl=TS'), expected);
});

test('야문 항목은 curl -K ~ -o 가 같은 줄에 있다 (2줄 아닌 1줄)', async () => {
	const html = yaLink('AAA-111.srt') + yaLink('BBB-222.srt') + yaLink('CCC-333.srt');
	const { text } = await copyFromButton(html, 0);

	assert.equal((text.match(/sleep 30/g) || []).length, 2);
	assert.equal((text.match(/curl -K "\$\{HOME\}\/\.conf\/ym\.conf"/g) || []).length, 3);
	assert.ok(!text.includes('daum.conf'));
	assert.ok(!/ym\.conf" \\\n/.test(text), 'ym.conf 줄이 여전히 두 줄로 나뉘었다');
	assert.equal(text.split('\n').filter((l) => l.includes('ym.conf')).length, 3);
	assert.ok(text.endsWith(`-e "\${YA_REFERER}${PAGE}" \\\n`), '마지막 줄은 빈 칸 + 역슬래시로 끝난다');
});

test('카카오만 있으면 ym.conf 블록은 생성되지 않는다', async () => {
	const { text } = await copyFromButton(daumLink('ADN-532.mp4', 'xyz'), 0);

	assert.ok(!text.includes('ym.conf'));
	assert.ok(text.includes(daumCurl));
});

test('유효 파일이 없으면 클립보드에 복사하지 않는다 (생성기 "" 반환)', async () => {
	const { text } = await copyFromButton('<a href="https://www.ya-moon.com/etc/x.asp">기타 링크</a>', 0);

	assert.equal(text, undefined);
});

test('Original Copy(필터 제외)도 같은 두 블록 구조를 쓴다', async () => {
	const html = yaLink('ZZZ-999.[uncen].mp4') + daumLink('QQQ-111.mp4', 'k');
	const { buttons, text } = await copyFromButton(html, 1);

	assert.equal(buttons.map((b) => b.textContent).join('|'), 'Filterd Copy|Original Copy');
	assert.ok(text.includes(yaCurl) && text.includes(daumCurl));
});

test('카카오 .mkv 첨부파일은 생성된 스크립트에서 .mp4 로 바뀐다', async () => {
	const { text } = await copyFromButton(daumLink('JUQ-342.uncen.mkv', 'k'), 0);

	assert.ok(text.includes(' -o "JUQ-342-HU.mp4" "${DAUM_BASE}/d/k"'), text);
	assert.ok(!text.includes('.mkv'));
});

test('createDaumDownloadArgs: .mkv 확장자를 .mp4 로 바꾸고 URL은 ${DAUM_BASE}로 치환한다', () => {
	const args = loadFn('createDaumDownloadArgs')('JUQ-342-HU.mkv', `${DAUM_BASE}/d/xyz`);

	assert.equal(args, ` -o "JUQ-342-HU.mp4" "\${DAUM_BASE}/d/xyz"`);
});

test('createDaumDownloadArgs: 대/소문자 .mkv도 바꾸고 .mkv가 아닌 확장자는 그대로 둔다', () => {
	const fn = loadFn('createDaumDownloadArgs');
	const saved = (f) => fn(f, 'x').match(/^ -o "([^"]*)"/)[1];

	assert.equal(saved('ADN-532.mkv'), 'ADN-532.mp4');
	assert.equal(saved('ADN-532.MKV'), 'ADN-532.mp4');
	assert.equal(saved('ADN-532.Mkv'), 'ADN-532.mp4');
	assert.equal(saved('ADN-532.mp4'), 'ADN-532.mp4');
	assert.equal(saved('ADN-532.MP4'), 'ADN-532.MP4');
	assert.equal(saved('ADN-532.mkv.torrent'), 'ADN-532.mkv.torrent');
	assert.equal(saved('ADN-532'), 'ADN-532');
});

test('createDaumDownloadArgs: 접두사가 DAUM_BASE가 아닌 URL은 원문 그대로 쓴다', () => {
	const url = 'https://attach.mail.daum.net/other/path';

	assert.equal(loadFn('createDaumDownloadArgs')('ADN-532.mp4', url), ` -o "ADN-532.mp4" "${url}"`);
});
