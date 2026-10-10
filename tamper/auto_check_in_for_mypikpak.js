// ==UserScript==
// @name         auto_check_in_for_mypikpak
// @namespace    http://hwh.kr/
// @version      v1.0.1
// @made         2026-10-10
// @modified     2026-10-10
// @description  PikPak 출석 체크 자동화 - 로그인·출석 완료 상태 안내, "프리미엄 획득"의 Check in 버튼 클릭, reCAPTCHA 체크박스 선택, 버튼 소멸로 성공 확인
// @author       hbesthee@naver.com
// @match        https://mypikpak.com/ko/check-in*
// @match        https://mypikpak.com/*/check-in*
// @match        https://www.google.com/recaptcha/api2/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
	/** Start script - @grant none이라 GM_info를 쓸 수 없으므로 이름을 직접 적는다 */
	console.log('%cStart auto_check_in_for_mypikpak', 'color: darkgray');

	const LOG = '[PikPak Check-in]';

	// CheckInPane의 렌더 구조 (check-in 번들 기준)
	//   출석 전 : .claim-now-box > .claim-now-box-label("프리미엄 획득") + button.el-button--primary(" Check in ")
	//   출석 후 : .claim-now-box > .claim-now-box-label.no-icon("내일 또 만나요~") + button.el-button--primary.lock-button(카운트다운)
	//   로그인 전 : 헤더에 button.sign-up-in("로그인/가입") — 그런데도 Check in 버튼은 그대로 그려진다
	// 즉 출석 뒤에도 같은 자리에 primary 버튼이 남고 로그인 전에도 누를 버튼이 보이므로,
	// no-icon·lock-button·버튼 텍스트로 걸러내고 로그인 여부부터 확인해야 한다.
	const CLAIM_BOX = '.claim-now-box';
	const CLAIM_LABEL = '.claim-now-box-label';
	const CLAIM_BUTTON = 'button';
	const NO_ICON_CLASS = 'no-icon';
	const LOCK_BUTTON_CLASS = 'lock-button';
	const CHECK_IN_TEXT = 'Check in';   // i18n을 타지 않는 고정 문자열
	const ALREADY_TEXT = '내일 또 만나요';   // 출석을 마치면 버튼 자리에 오는 문구

	const LOGIN_BUTTON = 'button.sign-up-in';   // 로그인 전 화면에만 그려지는 헤더 버튼
	const LOGIN_MESSAGE = '로그인 하면 출석체크를 진행합니다.';
	const ALREADY_MESSAGE = '이미 출석하였습니다.';

	// GoogleVerify가 띄우는 reCAPTCHA v2 — sitekey는 check-in 번들에 하드코딩되어 있다
	const RECAPTCHA_SITEKEY = '6LerFi0pAAAAAB8PSfeUmwtJx6imhQpza2dCjMmG';
	const RECAPTCHA_ANCHOR = 'recaptcha-anchor';
	const RECAPTCHA_MASK = '.gp-verify-mask';

	const EXTENSION_MARKER = '__PIKPAK_EXTENSION__';   // 픽팍 브라우저 확장이 심는 표식 — 없으면 페이지가 출석 요청 자체를 거부한다
	const FAIL_DIALOG = '.sign-in-fail-dialog';
	const SUCCESS_DIALOG = '.sign-in-success-dialog';

	const POLL_INTERVAL = 500;      // 탐색 주기(ms)
	const BUTTON_TIMEOUT = 20000;   // Check in 버튼이 그려질 때까지 — SPA라 로그인 확인 뒤에 렌더된다
	const RESULT_TIMEOUT = 120000;  // reCAPTCHA 통과까지 — 이미지 챌린지는 손으로 풀어야 하므로 넉넉히
	const CAPTCHA_RETRY = 3;        // 체크박스 클릭 재시도 횟수
	const CLICK_SETTLE = 1000;      // 체크박스 클릭 후 상태가 반영되기를 기다리는 시간(ms)
	const ALERT_ON_FAIL = true;     // 실패를 alert로도 알릴지

	'use strict';


	/**
	 * 요소가 화면에 보이는지(크기를 갖는지) 확인합니다.
	 * display:none인 조상 아래에 있으면 rect가 0이 된다.
	 * @param {Element} element - 검사할 요소
	 * @returns {boolean} 보이면 true
	 */
	function isVisible(element) {
		if (!element) {
			return false;
		}
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}


	/**
	 * 주어진 시간만큼 기다립니다.
	 * @param {number} ms - 대기 시간(ms)
	 * @returns {Promise<void>}
	 */
	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}


	/**
	 * 조건이 참이 될 때까지 POLL_INTERVAL 주기로 기다립니다.
	 * @param {function(): *} predicate - 매 주기마다 부를 검사 함수 ; 참인 값을 돌려주면 거기서 멈춘다
	 * @param {number} timeout - 최대 대기 시간(ms)
	 * @returns {Promise<*>} predicate가 돌려준 참값, 시간을 넘기면 null
	 */
	function waitFor(predicate, timeout) {
		return new Promise((resolve) => {
			const startedAt = Date.now();
			const tick = () => {
				const value = predicate();
				if (value) {
					resolve(value);
					return;
				}
				if (Date.now() - startedAt >= timeout) {
					resolve(null);
					return;
				}
				setTimeout(tick, POLL_INTERVAL);
			};
			tick();
		});
	}


	/**
	 * "프리미엄 획득" 상자 안의 Check in 버튼을 찾습니다.
	 * 출석을 마치면 같은 자리에 no-icon 라벨과 lock-button(카운트다운)이 오므로 둘 다 걸러낸다.
	 * @returns {HTMLElement} 클릭할 버튼, 없으면 null
	 */
	function findCheckInButton() {
		const boxes = document.querySelectorAll(CLAIM_BOX);
		for (const box of boxes) {
			const label = box.querySelector(CLAIM_LABEL);
			const button = box.querySelector(CLAIM_BUTTON);
			if (!label || !button) {
				continue;
			}
			if (label.classList.contains(NO_ICON_CLASS)) {
				continue;
			}
			if (button.classList.contains(LOCK_BUTTON_CLASS)) {
				continue;
			}
			if (button.textContent.trim() !== CHECK_IN_TEXT) {
				continue;
			}
			if (button.disabled === true || button.getAttribute('aria-disabled') === 'true') {
				continue;
			}
			if (!isVisible(button)) {
				continue;
			}
			return button;
		}
		return null;
	}


	/**
	 * 헤더의 "로그인/가입" 버튼을 찾습니다.
	 * @returns {HTMLElement} 로그인 버튼, 로그인된 화면이면 null
	 */
	function findLoginButton() {
		const button = document.querySelector(LOGIN_BUTTON);
		return isVisible(button) ? button : null;
	}


	/**
	 * 버튼이 있어야 할 자리에 대신 그려진 "출석 완료" 라벨을 찾습니다.
	 * 문구는 언어마다 바뀌므로 no-icon 클래스를 기준으로 삼고, "내일 또 만나요" 문구는 보조 신호로 본다.
	 * @returns {HTMLElement} 출석 완료 라벨, 아직 출석할 수 있으면 null
	 */
	function findDoneLabel() {
		for (const label of document.querySelectorAll(CLAIM_LABEL)) {
			if (!isVisible(label)) {
				continue;
			}
			if (label.classList.contains(NO_ICON_CLASS) || label.textContent.includes(ALREADY_TEXT)) {
				return label;
			}
		}
		return null;
	}


	/**
	 * 출석 영역이 그려지기를 기다렸다가 지금 상태를 판별합니다.
	 * 로그인 전에도 Check in 버튼이 그대로 그려지므로, 버튼만 보자마자 누르면 로그인 창만 뜬다.
	 * @returns {object} state("login"|"done"|"ready")와 근거 요소/문구 ; 아직 아무것도 안 그려졌으면 null
	 */
	function detectState() {
		const login = findLoginButton();
		if (login) {
			return { state: 'login', text: login.textContent.trim() };
		}
		const done = findDoneLabel();
		if (done) {
			return { state: 'done', text: done.textContent.trim() };
		}
		const button = findCheckInButton();
		if (button) {
			return { state: 'ready', element: button };
		}
		return null;
	}


	/**
	 * 지금 화면에 드러난 상태를 진단 문자열로 모읍니다.
	 * @returns {string} 감지된 상태들 ; 없으면 "특이 상태 없음"
	 */
	function describeState() {
		const found = [];
		if (findLoginButton()) {
			found.push('로그인 전 화면');
		}
		const done = findDoneLabel();
		if (done) {
			found.push(`출석 완료 라벨("${done.textContent.trim()}")`);
		}
		if (isVisible(document.querySelector(FAIL_DIALOG))) {
			found.push('출석 실패 다이얼로그(IP·기기 제한)');
		}
		if (isVisible(document.querySelector(SUCCESS_DIALOG))) {
			found.push('출석 성공 다이얼로그');
		}
		if (document.querySelector(RECAPTCHA_MASK)) {
			found.push('reCAPTCHA 모달 열림');
		}
		if (!document.getElementById(EXTENSION_MARKER)) {
			found.push('픽팍 확장 표식 없음');
		}
		return found.length ? found.join(' / ') : '특이 상태 없음';
	}


	/**
	 * 출석 체크를 끝까지 수행합니다.
	 * 상태 판별(로그인·출석 완료) → Check in 버튼 클릭 → reCAPTCHA 통과 대기 → 버튼이 사라졌는지 확인.
	 * 체크박스 클릭은 @match로 같이 잡히는 google 프레임에서 이 스크립트가 대신 한다.
	 * @returns {Promise<boolean>} 출석 성공(버튼 소멸)이면 true
	 */
	async function runCheckIn() {
		if (!document.getElementById(EXTENSION_MARKER)) {
			console.warn(LOG, `확장 표식(#${EXTENSION_MARKER})이 없습니다 — 확장 설치 안내만 뜨고 출석은 거부될 수 있습니다.`);
		}

		const found = await waitFor(detectState, BUTTON_TIMEOUT);
		if (!found) {
			console.log(LOG, '출석 영역이 그려지지 않았습니다.', describeState());
			return false;
		}
		if (found.state === 'login') {
			console.log(LOG, `로그인되지 않았습니다 — "${found.text}" 버튼이 보입니다.`);
			alert(LOGIN_MESSAGE);
			return false;
		}
		if (found.state === 'done') {
			console.log(LOG, `이미 출석했습니다 — 버튼 자리에 "${found.text}"`);
			alert(ALREADY_MESSAGE);
			return false;
		}

		const button = found.element;
		console.log(LOG, `Check in 버튼 클릭: "${button.textContent.trim()}"`);
		button.click();

		// reCAPTCHA 모달이 뜨거나 버튼이 바로 사라지는 것 중 먼저 오는 쪽을 본다.
		// 서버가 봇 검사를 이미 통과시킨 계정(bot_checked)은 모달 없이 곧바로 출석된다.
		await waitFor(() => document.querySelector(RECAPTCHA_MASK) || !findCheckInButton(), 5000);
		if (document.querySelector(RECAPTCHA_MASK)) {
			console.log(LOG, 'reCAPTCHA 모달 감지 — 체크박스 선택을 기다립니다. 이미지 챌린지가 뜨면 손으로 풀어야 합니다.');
		}

		const gone = await waitFor(() => !findCheckInButton(), RESULT_TIMEOUT);
		if (gone) {
			console.log(LOG, '성공 — Check in 버튼이 사라졌습니다.', describeState());
			return true;
		}

		const reported = describeState();
		console.error(LOG, '실패 — 제한 시간 안에 Check in 버튼이 사라지지 않았습니다.', reported);
		if (ALERT_ON_FAIL) {
			alert(`PikPak 출석 실패: ${reported}`);
		}
		return false;
	}


	/**
	 * 지금 프레임이 PikPak 출석용 reCAPTCHA 프레임인지 확인합니다.
	 * @match가 모든 google reCAPTCHA 프레임을 잡으므로 sitekey로 가려낸다.
	 * @param {string} kind - 프레임 종류 : "anchor"(체크박스) 또는 "bframe"(이미지 챌린지)
	 * @returns {boolean} PikPak 출석용 프레임이면 true
	 */
	function isPikPakRecaptchaFrame(kind) {
		if (window.self === window.top) {
			return false;
		}
		if (!location.pathname.includes(`/${kind}`)) {
			return false;
		}
		return new URLSearchParams(location.search).get('k') === RECAPTCHA_SITEKEY;
	}


	/**
	 * reCAPTCHA "로봇이 아닙니다" 체크박스를 선택합니다.
	 * 클릭이 바로 반영되지 않는 경우가 있어 CAPTCHA_RETRY만큼 다시 누른다.
	 * @returns {Promise<boolean>} 체크박스가 선택되면 true
	 */
	async function checkRecaptchaBox() {
		const anchor = await waitFor(() => document.getElementById(RECAPTCHA_ANCHOR), BUTTON_TIMEOUT);
		if (!anchor) {
			console.warn(LOG, 'reCAPTCHA 체크박스를 찾지 못했습니다.');
			return false;
		}

		const isChecked = () => anchor.getAttribute('aria-checked') === 'true';
		for (let i = 1; i <= CAPTCHA_RETRY && !isChecked(); i++) {
			console.log(LOG, `reCAPTCHA 체크박스 클릭 (${i}/${CAPTCHA_RETRY})`);
			anchor.click();
			await sleep(CLICK_SETTLE);
		}

		if (isChecked()) {
			console.log(LOG, 'reCAPTCHA 체크박스 선택됨 — 페이지가 이어서 출석을 요청합니다.');
			return true;
		}
		console.warn(LOG, '체크박스가 선택 상태로 바뀌지 않았습니다 — 이미지 챌린지는 손으로 풀어야 합니다.');
		return false;
	}


	// google reCAPTCHA 프레임과 PikPak 페이지를 갈라 처리한다
	if (location.hostname.endsWith('google.com')) {
		if (isPikPakRecaptchaFrame('anchor')) {
			checkRecaptchaBox();
		} else if (isPikPakRecaptchaFrame('bframe')) {
			console.warn(LOG, 'reCAPTCHA 이미지 챌린지가 떴습니다 — 손으로 풀면 출석이 이어집니다.');
		}
		return;
	}

	runCheckIn();
})();
