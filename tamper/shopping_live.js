// ==UserScript==
// @name         Shopping Live Auto Clicker
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  GM_setValue를 이용한 주소 기억 및 복구 로직 추가 + ready-list 및 note.html 대응
// @author       hbesthee@naver.com
// @match        *://*/*shopping-live.html*
// @match        *://*/*live-view.html*
// @match        *://*/*note.html*
// @match        *://*.com/pc/main
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
	'use strict';

	// 상수 정의
	const TARGET_BADGE = "imgs/badge/badge_after.svg";
	const REFRESH_INTERVAL = 10 * 60 * 1000; // 10분 (밀리초)
	const BACK_INTERVAL = 10 * 1000;         // 10초 (밀리초)
	const LOG_INTERVAL = 3 * 1000;           // 3초 (밀리초)
	const START_DELAY = 5 * 1000;            // 5초 지연 (밀리초)
	const ACTION_DELAY = 5 * 1000;           // 작업(클릭/뒤로가기) 이후 강력 새로고침 지연 (5초)
	const FALLBACK_URL = "https://point.pay.naver.com/pc/main";


	/**
	 * 캐시를 무시하는 강력 새로고침을 수행합니다.
	 */
	function forceRefresh() {
		console.log("강력 새로고침을 수행합니다.");
		const url = new URL(window.location.href);
		const datetime = new Date()
			.toISOString()
			.replace(/[-:T]/g, "")
			.slice(0, 14);
		url.searchParams.set('cache_bust', datetime);
		window.location.href = url.toString();
	}


	/**
	 * 특정 조건 도달 후 5초 주기로 강력 새로고침을 수행하는 타이머를 작동시킵니다.
	 */
	function startForceRefreshInterval() {
		console.log("5초 주기 강력 새로고침 타이머가 구동됩니다.");
		setInterval(forceRefresh, ACTION_DELAY);
	}


	/**
	 * UI에 남은 새로고침 시간을 표시하는 타이머를 구동합니다.
	 * @param {number} totalMs - 전체 대기 시간 (밀리초)
	 */
	function updateRemainTimerUI(totalMs) {
		const targetNode = document.querySelector('.alram.noti-off');
		if (!targetNode) return;

		let timerSpan = document.getElementById('remain_timer');
		if (!timerSpan) {
			timerSpan = document.createElement('span');
			timerSpan.id = 'remain_timer';
			timerSpan.style.marginLeft = '10px';
			timerSpan.style.color = '#ff4d4f';
			timerSpan.style.fontWeight = 'bold';
			targetNode.appendChild(timerSpan);
		}

		let remainSec = Math.floor(totalMs / 1000);
		timerSpan.innerText = ` [새로고침까지 ${remainSec}초]`;

		const uiTimer = setInterval(() => {
			remainSec--;
			if (remainSec <= 0) {
				clearInterval(uiTimer);
				timerSpan.innerText = ` [새로고침 중...]`;
			} else {
				timerSpan.innerText = ` [새로고침까지 ${remainSec}초]`;
			}
		}, 1000);
	}


	/**
	 * 특정 선택자로 요소를 찾아 내부 이미지의 src를 검사하고 클릭 이벤트를 발생시킵니다.
	 * @param {string} selector - 검색할 요소의 CSS 선택자
	 * @returns {boolean} - 클릭 동작을 수행했는지 여부
	 */
	function processElements(selector) {
		const elms = document.querySelectorAll(selector);
		let clicked = false;

		elms.forEach((elm) => {
			const img = elm.querySelector('img');
			if (img) {
				const srcValue = img.getAttribute('src');
				if (srcValue !== TARGET_BADGE) {
					elm.click();
					clicked = true;
				}
			}
		});

		return clicked;
	}


	/**
	 * 안전한 뒤로가기 수행 함수
	 * 이동할 수 있는 이전 히스토리가 있으면 뒤로 가고, 없으면 메인 페이지로 이동합니다.
	 * 이동 명령 이후 5초 주기의 강력 새로고침 타이머를 연달아 호출합니다.
	 */
	function safeBack() {
		const previousUrl = GM_getValue("previous_url");
		if (previousUrl) {
			const datetime = new Date()
				.toISOString()
				.replace(/[-:T]/g, "")
				.slice(0, 14);
			const url = new URL(previousUrl)
			url.searchParams.set('cache_bust', datetime);
			console.log(`기억된 이전 주소로 이동합니다: ${url}`);
			window.location.href = url.toString();
		} else if (document.referrer && window.history.length > 1) {
			console.log("기억된 주소가 없어 기본 브라우저 뒤로가기를 수행합니다.");
			window.history.back();
		} else {
			console.log(`이전 기록이 없어 지정된 메인 주소로 이동합니다: ${FALLBACK_URL}`);
			window.location.href = FALLBACK_URL;
		}
		// 이동 명령 직후 5초 강력 새로고침 바인딩
		startForceRefreshInterval();
	}


	/**
	 * 메인 실행 함수 (페이지 로드 5초 후 호출됨)
	 */
	function main() {
		const currentUrl = window.location.href;
		// 쿼리 스트링이나 해시를 제외한 오직 패스 엔드포인트만 추출하여 비교하기 위함
		const urlPath = window.location.pathname; 

		// 1. live-view.html 주소인 경우
		if (currentUrl.includes('live-view.html')) {
			let logCount = 0;
			console.log("live-view.html 감지: 10초 후 안전한 뒤로 가기를 수행합니다.");

			const logTimer = setInterval(() => {
				logCount++;
				const currentTime = new Date().toLocaleTimeString();
				console.log(`[로그 ${logCount}회] 현재 시각: ${currentTime}`);
			}, LOG_INTERVAL);

			setTimeout(() => {
				clearInterval(logTimer);
				safeBack();
				startForceRefreshInterval(); // 이전 페이지로 전환되지 못하면, 강력 새로고침 수행
			}, BACK_INTERVAL);

			return;
		}

		// 2. note.html 주소인 경우 (새로 추가된 로직)
		if (currentUrl.includes('note.html')) {
			console.log("note.html 감지: 버튼 항목 탐색 후 클릭을 시도합니다.");
			const targetBtn = document.querySelector('.button-box .cta-btn');
			
			if (targetBtn) {
				console.log("대상 버튼을 찾았습니다:", targetBtn);
				targetBtn.click();
			} else {
				console.log("버튼을 찾지 못했습니다.");
			}

			// 클릭 여부와 관계없이 5초 주기 강력 새로고침 실행
			startForceRefreshInterval();

			return;
		}

		// 3. /pc/main 으로 끝나는 경우 (단순 포함이 아닌 최종 경로 매칭)
		if (urlPath.endsWith('/pc/main')) {
			console.log("/pc/main 매치 성공: '쇼핑라이브 보고' 링크를 탐색합니다.");
			const elms = document.querySelectorAll("a");

			elms.forEach((elm) => {
				if (elm.innerText.includes('쇼핑라이브 보고')) {
					console.log("대상 요소를 찾았습니다:", elm);
					elm.click();
				}
			});

			// 클릭 여부와 관계없이 5초 주기 강력 새로고침 실행
			startForceRefreshInterval();

			return;
		}

		// 4. shopping-live.html 주소인 경우
		if (currentUrl.includes('shopping-live.html')) {
			const clickedOnAir = processElements('#onair-list .list-item');
			const clickedEndList = processElements('#end-list .comming-list-thumb');
			const clickedReadyList = processElements('#ready-list .comming-list-thumb');

			if (!clickedOnAir && !clickedEndList && !clickedReadyList) {
				console.log("조건에 맞는 요소가 없습니다. 10분 후 페이지를 새로고침합니다.");
				updateRemainTimerUI(REFRESH_INTERVAL);
				setTimeout(() => {
					forceRefresh(); // 일반 reload 대신 강력 새로고침 적용
				}, REFRESH_INTERVAL);
			} else {
				console.log("조건에 맞는 요소를 찾아 클릭 이벤트를 수행했습니다.");
				// 요소 클릭 동작 이후에도 5초 주기 강력 새로고침 타이머 세팅
				startForceRefreshInterval();
			}
		}
	}

	console.log("Shopping Live Auto Clicker loaded...");
	setTimeout(main, START_DELAY);
})();