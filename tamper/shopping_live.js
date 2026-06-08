// ==UserScript==
// @name         Shopping Live Auto Clicker
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  shopping-live.html에서는 요소 검사 및 클릭을, live-view.html에서는 15초 후 뒤로 가기를 수행합니다.
// @author       You
// @match        *://*/*shopping-live.html*
// @match        *://*/*live-view.html*
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	// 상수 정의
	const TARGET_BADGE = "imgs/badge/badge_after.svg";
	const REFRESH_INTERVAL = 10 * 60 * 1000; // 10분 (밀리초)
	const BACK_INTERVAL = 15 * 1000;         // 15초 (밀리초)

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
				// getAttribute('src')를 사용하여 HTML에 작성된 상대 경로 그대로 비교합니다.
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
	 * 메인 실행 함수
	 */
	function main() {
		const currentUrl = window.location.href;

		// 1. live-view.html 주소인 경우: 15초 후 뒤로 가기
		if (currentUrl.includes('live-view.html')) {
			console.log("live-view.html 감지: 15초 후 이전 페이지로 이동합니다.");
			setTimeout(() => {
				history.back();
			}, BACK_INTERVAL);
			return; // live-view 로직 수행 후 종료
		}

		// 2. shopping-live.html 주소인 경우: 기존 리스트 검사 로직 수행
		if (currentUrl.includes('shopping-live.html')) {
			const clickedOnAir = processElements('#onair-list .list-item');
			const clickedEndList = processElements('#end-list .comming-list-thumb');

			// 조건에 맞는 요소가 전혀 없으면 10분 타이머 구동
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

	// 페이지 로드 완료 시 실행
	window.addEventListener('load', main);
})();