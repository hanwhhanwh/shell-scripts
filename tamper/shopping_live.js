// ==UserScript==
// @name         Shopping Live Auto Clicker
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  5초 지연 실행, 안전한 뒤로가기 주소 변경 및 페이 페이지 내 쇼핑라이브 링크 자동 클릭 로직 추가
// @author       hbesthee@naver.com
// @match        *://*/*shopping-live.html*
// @match        *://*/*live-view.html*
// @match        *://*.com/pc/main
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	// 상수 정의
	const TARGET_BADGE = "imgs/badge/badge_after.svg";
	const REFRESH_INTERVAL = 10 * 60 * 1000; // 10분 (밀리초)
	const BACK_INTERVAL = 10 * 1000;         // 10초 (밀리초)
	const LOG_INTERVAL = 3 * 1000;           // 3초 (밀리초)
	const START_DELAY = 5 * 1000;            // 5초 지연 (밀리초)
	const FALLBACK_URL = "https://point.pay.naver.com/pc/main";

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
	 */
	function safeBack() {
		if (document.referrer && window.history.length > 1) {
			window.history.back();
		} else {
			console.log(`이전 기록이 없어 지정된 주소로 이동합니다: ${FALLBACK_URL}`);
			window.location.href = FALLBACK_URL;
		}
	}

	/**
	 * 메인 실행 함수 (페이지 로드 5초 후 호출됨)
	 */
	function main() {
		const currentUrl = window.location.href;

		// 1. live-view.html 주소인 경우
		if (currentUrl.includes('live-view.html')) {
			let logCount = 0;
			console.log("live-view.html 감지: 10초 후 안전한 뒤로 가기를 수행합니다.");

			// 출력 횟수와 현재 시각 출력하는 타이머
			const logTimer = setInterval(() => {
				logCount++;
				const currentTime = new Date().toLocaleTimeString();
				console.log(`[로그 ${logCount}회] 현재 시각: ${currentTime}`);
			}, LOG_INTERVAL);

			setTimeout(() => {
				clearInterval(logTimer);
				safeBack();
			}, BACK_INTERVAL);

			return;
		}

		// 2. /pc/main 주소인 경우 (메인 페이지 등)
		if (currentUrl.includes('/pc/main')) {
			console.log("/pc/main 감지: '쇼핑라이브 보고' 링크를 탐색합니다.");
			const elms = document.querySelectorAll("a");

			elms.forEach((elm) => {
				if (elm.innerText.includes('쇼핑라이브 보고')) {
					console.log("대상 요소를 찾았습니다:", elm);
					elm.click();
					// 쇼핑라이브 클릭 후, 만약을 위한 새로고침 타이머 구동
					setInterval(() => {
						window.location.reload();
					}, LOG_INTERVAL); // click()를 호출했음에도 페이지 변경 실패 시, 새로고침
				}
			});
			return;
		}

		// 3. shopping-live.html 주소인 경우
		if (currentUrl.includes('shopping-live.html')) {
			const clickedOnAir = processElements('#onair-list .list-item');
			const clickedEndList = processElements('#end-list .comming-list-thumb');

			if (!clickedOnAir && !clickedEndList) {
				console.log("조건에 맞는 요소가 없습니다. 10분 후 페이지를 새로고침합니다.");
				setTimeout(() => {
					window.location.reload();
				}, REFRESH_INTERVAL);
			} else {
				console.log("조건에 맞는 요소를 찾아 클릭 이벤트를 수행했습니다.");
			}
		}
	}

	// 페이지 로드가 완료되고 5초 후에 메인 로직을 실행합니다.
	window.addEventListener('load', () => {
		console.log("페이지 로드 완료. 5초 후 스크립트를 시작합니다...");
		setTimeout(main, START_DELAY);
	});
})();