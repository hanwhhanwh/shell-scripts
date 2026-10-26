import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SRC_PATH = fileURLToPath(new URL('../../tamper/auto_check_in_for_mypikpak.js', import.meta.url));
const LOGIN_HTML_PATH = fileURLToPath(new URL('../../.tmp/tamper/pikpak/login_div.html', import.meta.url));
const src = readFileSync(SRC_PATH, 'utf8');

// 아래 선택자·id 문자열은 스크립트 안의 상수를 그대로 옮긴 것이다.
// 스크립트에서 이름을 바꾸면 가짜 DOM이 따라가지 못해 시험이 실패한다 (의도된 동작).
const CLAIM_BOX = '.claim-now-box';
const CLAIM_LABEL = '.claim-now-box-label';
const LOGIN_BUTTON = 'button.sign-up-in';
const IDENTITY_PANE = '.auth-login-pane';
const IDENTITY_USERNAME = '.user-info .username';
const IDENTITY_BUTTON = 'button.pp-button';
const IDENTITY_TEXT = '신분으로 등록하기';
const DYNAMIC_NAME = '.dynamic-name';
const EXTENSION_ID = '__PIKPAK_EXTENSION__';
const MASK = '.gp-verify-mask';
const FAIL_DIALOG = '.sign-in-fail-dialog';
const SUCCESS_DIALOG = '.sign-in-success-dialog';
const ANCHOR_ID = 'recaptcha-anchor';
const SITEKEY = '6LerFi0pAAAAAB8PSfeUmwtJx6imhQpza2dCjMmG';

// 출석 완료 시 버튼 자리에 오는 문구 — 실제 저장 스냅샷(mypikpak_check_in_done.html) 그대로
const DONE_TEXT = '내일 또 만나요~';

/** 스크립트가 element에서 쓰는 것만 갖춘 가짜 요소 */
function el({ classes = [], text = '', visible = true, attrs = {}, disabled = false } = {}) {
	const node = {
		_classes: classes,
		_attrs: attrs,
		_visible: visible,
		textContent: text,
		disabled,
		clicks: 0,
		classList: { contains: (c) => node._classes.includes(c) },
		getAttribute: (k) => (k in node._attrs ? node._attrs[k] : null),
		getBoundingClientRect: () => (node._visible ? { width: 88, height: 36 } : { width: 0, height: 0 }),
		click() { node.clicks++; },
	};
	return node;
}


/** 로그인 다이얼로그 가운데의 "OO 신분으로 등록하기" 패널 (login_div.html 구조) */
function identityPane({
	username = 'hanwhhanwh',
	buttonText = null,
	dynamic = true,
	paneVisible = true,
	buttonVisible = true,
	disabled = false,
	onClick = null,
} = {}) {
	const name = el({ classes: ['username'], text: username });
	const dynamicName = dynamic ? {} : null;
	const button = el({
		classes: ['pp-button'],
		text: buttonText ?? (dynamic ? `"hanwhh" ${IDENTITY_TEXT}` : IDENTITY_TEXT),
		visible: buttonVisible,
		disabled,
	});
	button.querySelector = (sel) => (sel === DYNAMIC_NAME ? dynamicName : null);
	button.click = () => {
		button.clicks++;
		if (onClick) onClick(button);
	};
	return {
		button,
		username: name,
		querySelector: (sel) => (sel === IDENTITY_USERNAME ? name : null),
		querySelectorAll: (sel) => (sel === IDENTITY_BUTTON ? [button] : []),
		getBoundingClientRect: () => (paneVisible ? { width: 360, height: 480 } : { width: 0, height: 0 }),
	};
}

/**
 * .claim-now-box 한 칸을 흉내 낸다.
 * 클릭하면 실제 페이지처럼 출석 완료 상태(라벨 no-icon + "내일 또 만나요~", 버튼 lock-button)로 넘어간다.
 */
function claimBox({ checkedIn = false, text = ' Check in ', labelText = null, labelClasses = null, visible = true, ariaDisabled = 'false', onClick = null } = {}) {
	const label = el({
		classes: labelClasses ?? (checkedIn ? ['claim-now-box-label', 'no-icon'] : ['claim-now-box-label']),
		text: labelText ?? (checkedIn ? DONE_TEXT : '프리미엄 획득'),
	});
	const button = el({
		classes: checkedIn ? ['el-button', 'el-button--primary', 'lock-button'] : ['el-button', 'el-button--primary'],
		text: checkedIn ? '08:49:10' : text,
		visible,
		attrs: { 'aria-disabled': ariaDisabled },
	});
	button.click = () => {
		button.clicks++;
		if (onClick) {
			onClick(button);
			return;
		}
		label._classes.push('no-icon');
		label.textContent = DONE_TEXT;
		button._classes.push('lock-button');
		button.textContent = '08:49:10';
	};
	return {
		label,
		button,
		querySelector: (sel) => (sel === CLAIM_LABEL ? label : sel === 'button' ? button : null),
	};
}

/** 출석 체크 페이지의 가짜 document */
function paneDoc(boxes, { mask = null, failDialog = null, successDialog = null, loginButton = null, extension = true, panes = [] } = {}) {
	const loginPanes = [...panes];
	return {
		querySelectorAll: (sel) => {
			if (sel === CLAIM_BOX) return boxes;
			if (sel === CLAIM_LABEL) return boxes.map((b) => b.label);
			if (sel === IDENTITY_PANE) return loginPanes;
			return [];
		},
		querySelector: (sel) => {
			switch (sel) {
				case LOGIN_BUTTON: return loginButton;
				case MASK: return mask;
				case FAIL_DIALOG: return failDialog;
				case SUCCESS_DIALOG: return successDialog;
				default: return null;
			}
		},
		getElementById: (id) => (id === EXTENSION_ID && extension ? {} : null),
		openLogin: (next = panes) => { loginPanes.splice(0, loginPanes.length, ...next); },
		closeLogin: () => { loginPanes.length = 0; },
	};
}

/** 헤더의 "로그인/가입" 버튼 */
function loginButtonEl(text = '로그인/가입') {
	return el({ classes: ['el-button', 'pp-link-button', 'sign-up-in'], text });
}

/** reCAPTCHA anchor 프레임의 가짜 document */
function recaptchaDoc({ checked = false, flipOnClick = true, hasAnchor = true } = {}) {
	const anchor = el({ attrs: { 'aria-checked': checked ? 'true' : 'false' } });
	anchor.click = () => {
		anchor.clicks++;
		if (flipOnClick) anchor._attrs['aria-checked'] = 'true';
	};
	return {
		anchor,
		getElementById: (id) => (id === ANCHOR_ID && hasAnchor ? anchor : null),
		querySelector: () => null,
		querySelectorAll: () => [],
	};
}

/**
 * 스크립트를 가짜 브라우저에서 실행한다.
 * setTimeout은 곧바로 돌리고 Date.now는 부를 때마다 1초씩 가게 해서,
 * 실제 대기 없이 탐색·재시도·시간넘김 흐름을 끝까지 돌려본다.
 */
async function run(document, { frame = 'top', location = null } = {}) {
	const logs = { log: [], warn: [], error: [] };
	const alerts = [];
	let now = 0;
	const win = {};
	win.self = win;
	win.top = frame === 'top' ? win : {};

	const box = {
		console: {
			log: (...a) => logs.log.push(a.join(' ')),
			warn: (...a) => logs.warn.push(a.join(' ')),
			error: (...a) => logs.error.push(a.join(' ')),
		},
		document,
		window: win,
		location: location ?? { hostname: 'mypikpak.com', pathname: '/ko/check-in', search: '?from_source=pp_browser_extension' },
		URLSearchParams,
		setTimeout: (fn) => { fn(); return 1; },
		clearTimeout: () => {},
		Date: { now: () => (now += 1000) },
		alert: (msg) => alerts.push(msg),
	};

	vm.createContext(box);
	vm.runInContext(src, box, { filename: 'auto_check_in_for_mypikpak.js' });
	await new Promise((resolve) => setImmediate(resolve));   // fire-and-forget async 흐름까지 끝낸다
	return { logs, alerts, all: [...logs.log, ...logs.warn, ...logs.error].join('\n') };
}

const recaptchaUrl = (kind, k = SITEKEY) => ({
	hostname: 'www.google.com',
	pathname: `/recaptcha/api2/${kind}`,
	search: `?ar=1&k=${k}&hl=ko&size=normal`,
});


test('메타데이터: 출석 주소와 reCAPTCHA 프레임을 모두 잡고 iframe 실행을 막지 않는다', () => {
	const header = src.slice(0, src.indexOf('==/UserScript=='));
	assert.ok(header.includes('@match        https://mypikpak.com/ko/check-in*'), '동작 주소가 @match에 없다');
	assert.ok(header.includes('@match        https://www.google.com/recaptcha/api2/*'), '체크박스는 google iframe에 있으므로 이 @match가 있어야 한다');
	assert.ok(!header.includes('@noframes'), '@noframes면 reCAPTCHA iframe에서 실행되지 않는다');
	assert.ok(header.includes('@grant        none'), 'GM API를 쓰지 않으므로 @grant none');
});

test('메타데이터: 빌드마다 바뀌는 Vue scoped 속성(data-v-)에 의존하지 않는다', () => {
	assert.ok(!src.includes('data-v-'), 'data-v-<해시>는 다음 빌드에서 깨진다');
	assert.ok(!src.includes('CaPKIKUn'), '번들 파일명에 의존하면 안 된다');
});

test('실제 로그인 다이얼로그 스냅샷에 자동 로그인 선택자가 모두 있다', (t) => {
	if (!existsSync(LOGIN_HTML_PATH)) {
		t.skip('.tmp/tamper/pikpak/login_div.html 이 없어 실데이터 검증은 건너뛴다');
		return;
	}
	const html = readFileSync(LOGIN_HTML_PATH, 'utf8');
	const tokens = ['id="login-dialog"', 'class="auth-login-pane"', 'class="user-info"', 'class="username"', 'class="pp-button"', 'class="dynamic-name"', IDENTITY_TEXT];
	for (const token of tokens) {
		assert.ok(html.includes(token), `${token} 없음 — 구조가 바뀌면 선택자를 함께 고친다`);
	}
});

test('출석 전: Check in 버튼을 눌러 출석 완료 상태로 만들고 성공을 보고한다', async () => {
	const box = claimBox();
	const { logs, alerts, all } = await run(paneDoc([box]));

	assert.equal(box.button.clicks, 1, 'Check in 버튼을 한 번 눌러야 한다');
	assert.ok(box.button._classes.includes('lock-button'), '클릭 뒤에는 카운트다운 버튼으로 바뀌어야 한다');
	assert.equal(box.label.textContent, DONE_TEXT, '클릭 뒤 버튼 자리에는 출석 완료 문구가 온다');
	assert.ok(logs.log.some((l) => l.includes('성공')), `성공 보고가 없다: ${all}`);
	assert.equal(alerts.length, 0, '성공한 출석에 안내 팝업은 필요 없다');
});

test('reCAPTCHA 모달이 떠 있으면 체크박스를 기다린다고 알린다', async () => {
	const box = claimBox();
	const { logs } = await run(paneDoc([box], { mask: el() }));

	assert.equal(box.button.clicks, 1);
	assert.ok(logs.log.some((l) => l.includes('reCAPTCHA 모달 감지')));
});

test('출석 완료: 버튼 자리에 "내일 또 만나요~"가 있으면 이미 출석했다고 알린다', async () => {
	const box = claimBox({ checkedIn: true });
	const { logs, alerts } = await run(paneDoc([box]));

	assert.equal(box.button.clicks, 0, '이미 출석한 뒤의 카운트다운 버튼을 누르면 안 된다');
	assert.deepEqual(alerts, ['이미 출석하였습니다.'], '요구한 안내 문구와 다르다');
	assert.ok(logs.log.some((l) => l.includes(DONE_TEXT)), `어떤 문구를 보고 판단했는지 남겨야 한다: ${logs.log.join('|')}`);
});

test('출석 완료: 문구가 다른 언어여도 no-icon 클래스로 알아챈다', async () => {
	const box = claimBox({ checkedIn: true, labelText: 'See you tomorrow~' });
	const { alerts } = await run(paneDoc([box]));

	assert.equal(box.button.clicks, 0);
	assert.deepEqual(alerts, ['이미 출석하였습니다.']);
});

test('출석 완료: no-icon 클래스가 떨어져 나가도 "내일 또 만나요" 문구로 알아챈다', async () => {
	const box = claimBox({ checkedIn: true, labelClasses: ['claim-now-box-label'] });
	const { alerts } = await run(paneDoc([box]));

	assert.equal(box.button.clicks, 0);
	assert.deepEqual(alerts, ['이미 출석하였습니다.']);
});

test('로그인 전: 신분 버튼이 없으면 출석을 시도하지 않고 로그인을 안내한다', async () => {
	// 로그인 전 화면에도 Check in 버튼은 그대로 그려진다 (mypikpak_check_in_not_logined.html)
	const box = claimBox();
	const loginButton = loginButtonEl();
	const { logs, alerts } = await run(paneDoc([box], { loginButton }));

	assert.equal(loginButton.clicks, 1, '다이얼로그를 열기 위해 로그인/가입 버튼은 눌러야 한다');
	assert.equal(box.button.clicks, 0, '로그인 전에 Check in을 누르면 로그인 창만 뜬다');
	assert.deepEqual(alerts, ['로그인 하면 출석체크를 진행합니다.']);
	assert.ok(logs.log.some((l) => l.includes('로그인/가입')), `무슨 버튼을 보고 판단했는지 남겨야 한다: ${logs.log.join('|')}`);
	assert.ok(logs.warn.some((l) => l.includes(IDENTITY_TEXT)), `자동 로그인 실패 원인을 남겨야 한다: ${logs.warn.join('|')}`);
});

/** 헤더 버튼을 누르면 로그인 다이얼로그가 열리고, 신분 버튼을 누르면 로그인이 끝나는 화면을 만든다. */
function autoLoginDoc({ preopened = false, ...paneOptions } = {}) {
	const box = claimBox();
	const loginButton = loginButtonEl();
	const pane = identityPane(paneOptions);
	const doc = paneDoc([box], { loginButton, panes: preopened ? [pane] : [] });
	loginButton.click = () => {
		loginButton.clicks++;
		doc.openLogin([pane]);
	};
	pane.button.click = () => {
		pane.button.clicks++;
		loginButton._visible = false;   // 로그인 성공 — 헤더의 "로그인/가입"이 사라진다
		doc.closeLogin();
	};
	return { box, loginButton, pane, doc };
}

test('자동 로그인: 다이얼로그가 이미 떠 있으면 헤더 버튼을 다시 누르지 않고 신분 버튼을 누른다', async () => {
	// 페이지가 스스로 띄워 둔 경우 헤더 버튼을 또 누르면 다이얼로그가 닫힐 수 있다
	const { box, loginButton, pane, doc } = autoLoginDoc({ preopened: true });
	const { logs, alerts } = await run(doc);

	assert.equal(loginButton.clicks, 0, '이미 열린 다이얼로그를 건드리면 안 된다');
	assert.equal(pane.button.clicks, 1);
	assert.equal(box.button.clicks, 1, '로그인 뒤 출석까지 이어가야 한다');
	assert.equal(alerts.length, 0, '자동 로그인에 성공했으면 팝업은 필요 없다');
	assert.ok(logs.log.some((l) => l.includes('로그인 완료')), logs.log.join('|'));
});

test('자동 로그인: 로그인/가입 버튼으로 다이얼로그를 열고 신분 버튼을 눌러 출석까지 진행한다', async () => {
	const { box, loginButton, pane, doc } = autoLoginDoc();
	const { logs, alerts } = await run(doc);

	assert.equal(loginButton.clicks, 1, '다이얼로그를 열려면 헤더 버튼을 눌러야 한다');
	assert.equal(pane.button.clicks, 1);
	assert.equal(box.button.clicks, 1, '로그인 뒤 Check in 버튼도 눌러야 한다');
	assert.equal(alerts.length, 0);
	assert.ok(logs.log.some((l) => l.includes('로그인 완료')), logs.log.join('|'));
});

test('자동 로그인: 계정명이 .dynamic-name으로 쪼개져 문구가 달라도 신분 버튼을 누른다', async () => {
	const { box, pane, doc } = autoLoginDoc({ buttonText: 'Register with this identity' });
	const { alerts } = await run(doc);

	assert.equal(pane.button.clicks, 1, '다른 언어 화면에서도 구조로 찾아야 한다');
	assert.equal(box.button.clicks, 1);
	assert.equal(alerts.length, 0);
});

test('자동 로그인: 숨겨진 신분 버튼은 누르지 않고 로그인을 안내한다', async () => {
	const { box, pane, doc } = autoLoginDoc({ preopened: true, buttonVisible: false });
	const { logs, alerts } = await run(doc);

	assert.equal(pane.button.clicks, 0);
	assert.equal(box.button.clicks, 0);
	assert.deepEqual(alerts, ['로그인 하면 출석체크를 진행합니다.']);
	assert.ok(logs.warn.some((l) => l.includes(IDENTITY_TEXT)), logs.warn.join('|'));
});

test('자동 로그인: 비활성(disabled) 신분 버튼은 누르지 않는다', async () => {
	const { box, pane, doc } = autoLoginDoc({ preopened: true, disabled: true });
	const { alerts } = await run(doc);

	assert.equal(pane.button.clicks, 0);
	assert.equal(box.button.clicks, 0);
	assert.deepEqual(alerts, ['로그인 하면 출석체크를 진행합니다.']);
});

test('자동 로그인: 신분 버튼을 눌러도 로그인이 끝나지 않으면 출석하지 않고 안내한다', async () => {
	// 예: 추가 본인 인증 창이 떠서 헤더의 "로그인/가입"이 그대로 남은 경우
	const { box, pane, doc } = autoLoginDoc();
	pane.button.click = () => { pane.button.clicks++; };   // 다이얼로그만 닫히고 로그인은 안 됨

	const { logs, alerts } = await run(doc);

	assert.equal(pane.button.clicks, 1);
	assert.equal(box.button.clicks, 0, '로그인 전에 Check in을 누르면 로그인 창만 뜬다');
	assert.deepEqual(alerts, ['로그인 하면 출석체크를 진행합니다.']);
	assert.ok(logs.warn.some((l) => l.includes('로그인이 끝나지 않았습니다')), logs.warn.join('|'));
});

test('로그인 전: 로그인 버튼이 화면에 안 보이면(숨겨짐) 출석을 진행할 수 있다', async () => {
	const box = claimBox();
	const hidden = loginButtonEl();
	hidden.getBoundingClientRect = () => ({ width: 0, height: 0 });
	const { alerts } = await run(paneDoc([box], { loginButton: hidden }));

	assert.equal(box.button.clicks, 1);
	assert.equal(alerts.length, 0);
});

test('버튼 텍스트가 Check in 이 아니면 누르지 않는다', async () => {
	const box = claimBox({ text: '출석하기' });
	await run(paneDoc([box]));
	assert.equal(box.button.clicks, 0);
});

test('aria-disabled=true 인 버튼은 누르지 않는다', async () => {
	const box = claimBox({ ariaDisabled: 'true' });
	await run(paneDoc([box]));
	assert.equal(box.button.clicks, 0);
});

test('화면에 보이지 않는 버튼은 누르지 않는다', async () => {
	const box = claimBox({ visible: false });
	await run(paneDoc([box]));
	assert.equal(box.button.clicks, 0);
});

test('빈 화면: 출석 영역이 끝내 안 그려지면 조용히 알리고 끝낸다', async () => {
	const { logs, alerts } = await run(paneDoc([]));
	assert.ok(logs.log.some((l) => l.includes('출석 영역이 그려지지 않았습니다')), `대기 초과를 알려야 한다: ${logs.log.join('|')}`);
	assert.equal(alerts.length, 0, '아직 판단할 근거가 없으므로 팝업은 띄우지 않는다');
});

test('클릭 후에도 버튼이 남으면 실패를 보고하고 alert를 띄운다', async () => {
	const box = claimBox({ onClick: () => {} });   // 눌러도 상태가 바뀌지 않는 상황
	const { logs, alerts } = await run(paneDoc([box]));

	assert.equal(box.button.clicks, 1);
	assert.ok(logs.error.some((l) => l.includes('실패')), 'console.error로 실패를 남겨야 한다');
	assert.equal(alerts.length, 1, '실패는 alert로 알려야 한다');
});

test('출석 실패 다이얼로그가 뜨면 원인을 진단 문자열에 담는다', async () => {
	const box = claimBox({ onClick: () => {} });
	const failDialog = el();
	const { logs } = await run(paneDoc([box], { failDialog }));

	const reported = logs.error.find((l) => l.includes('실패'));
	assert.ok(reported.includes('출석 실패 다이얼로그'), `진단 문자열에 다이얼로그가 없다: ${reported}`);
});

test('픽팍 확장 표식이 없으면 경고를 남긴다', async () => {
	const box = claimBox();
	const { logs } = await run(paneDoc([box], { extension: false }));

	assert.ok(logs.warn.some((l) => l.includes(EXTENSION_ID)), '확장 미설치는 출석이 거부되는 흔한 원인이다');
	assert.equal(box.button.clicks, 1, '그래도 버튼은 눌러 본다');
});

test('reCAPTCHA anchor 프레임: 체크박스를 한 번 눌러 선택한다', async () => {
	const doc = recaptchaDoc({});
	const { logs } = await run(doc, { frame: 'iframe', location: recaptchaUrl('anchor') });

	assert.equal(doc.anchor.clicks, 1);
	assert.equal(doc.anchor.getAttribute('aria-checked'), 'true');
	assert.ok(logs.log.some((l) => l.includes('체크박스 선택됨')));
});

test('reCAPTCHA anchor 프레임: 클릭이 반영되지 않으면 정해진 횟수만 다시 누른다', async () => {
	const doc = recaptchaDoc({ flipOnClick: false });
	const { logs } = await run(doc, { frame: 'iframe', location: recaptchaUrl('anchor') });

	assert.equal(doc.anchor.clicks, 3, 'CAPTCHA_RETRY(3)만큼만 재시도해야 한다');
	assert.ok(logs.warn.some((l) => l.includes('손으로 풀어야 합니다')));
});

test('reCAPTCHA anchor 프레임: 체크박스가 아직 없으면 나타날 때까지 기다린다', async () => {
	const doc = recaptchaDoc({ hasAnchor: false });
	const { logs } = await run(doc, { frame: 'iframe', location: recaptchaUrl('anchor') });

	assert.ok(logs.warn.some((l) => l.includes('체크박스를 찾지 못했습니다')));
});

test('다른 sitekey의 reCAPTCHA 프레임은 건드리지 않는다', async () => {
	const doc = recaptchaDoc({});
	await run(doc, { frame: 'iframe', location: recaptchaUrl('anchor', 'OTHER_SITEKEY_AAAA') });
	assert.equal(doc.anchor.clicks, 0);
});

test('bframe(이미지 챌린지)은 자동 해결하지 않고 손으로 풀라고 알린다', async () => {
	const doc = recaptchaDoc({});
	const { logs } = await run(doc, { frame: 'iframe', location: recaptchaUrl('bframe') });

	assert.equal(doc.anchor.clicks, 0);
	assert.ok(logs.warn.some((l) => l.includes('이미지 챌린지')));
});

test('google.com 최상위 창에서는 아무것도 하지 않는다', async () => {
	const doc = recaptchaDoc({});
	const { logs } = await run(doc, { frame: 'top', location: { hostname: 'www.google.com', pathname: '/recaptcha/api2/anchor', search: `?k=${SITEKEY}` } });

	assert.equal(doc.anchor.clicks, 0);
	assert.equal(logs.log.length, 1, 'Start 로그만 남아야 한다');
});
