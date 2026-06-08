// ==UserScript==
// @name         Shopping Live Auto Clicker & Refresher
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  특정 배지가 없는 요소를 클릭하고, 조건이 맞지 않으면 10분 후 새로고침합니다.
// @author       You
// @match        *://*/*shopping-live.html*
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	// 상수 정의
	const TARGET_BADGE = "imgs/badge/badge_after.svg";
	const REFRESH_INTERVAL = 10 * 60 * 1000; // 10분을 밀리초로 계산 (10 * 60 * 1000)

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
		// 1. #onair-list .list-item 검사 및 클릭
		const clickedOnAir = processElements('#onair-list .list-item');

		// 2. #end-list .comming-list-thumb 검사 및 클릭
		const clickedEndList = processElements('#end-list .comming-list-thumb');

		// 3. 위 조건 중 하나라도 클릭이 발생하지 않았다면 10분 타이머 구동
		if (!clickedOnAir && !clickedEndList) {
			console.log("조건에 맞는 요소가 없습니다. 10분 후 페이지를 새로고침합니다.");
			setTimeout(() => {
				window.location.reload();
			}, REFRESH_INTERVAL);
		} else {
			console.log("조건에 맞는 요소를 찾아 클릭 이벤트를 수행했습니다.");
		}
	}

	// 페이지 로드가 완료된 후 혹은 DOM이 준비된 시점에 실행되도록 설정
	// 사이트가 SPA(Single Page Application) 방식으로 늦게 로딩된다면 필요에 따라 setTimeout 등으로 지연 실행할 수 있습니다.
	window.addEventListener('load', main);
})();