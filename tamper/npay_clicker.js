// ==UserScript==
// @name         naverpay event auto click script
// @namespace    http://hwh.kr/
// @version      2025-07-25
// @description  네이버 클릭적립 이벤트에서 페이지 로딩 후 .popup_link 요소를 자동 클릭
// @author       hbesthee@naver.com
// @match        https://campaign2.naver.com/npay/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=suto.co.kr
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	function getClickButton() {
		const div_element = document.querySelector('.layer_popup.type_no_points');
		if (getComputedStyle(div_element).display === 'block') { // display:block 스타일인가? 화면에 표시되는 것인가?
			console.log(`found: ${div_element}`);
			const element = div_element.querySelector('a.popup_link');
			return element
		}
		return null
	}

	/**
	 * DOM이 준비되면 .popup_link 요소를 찾아 클릭
	 */
	function clickPopupLink() {
		const element = getClickButton();
		if (element) {
			console.log('Auto-clicking:', element);
			element.click();
			alert('clicked');
			return true;
		} else {
			console.log('.popup_link 요소가 존재하지 않음.');
			return false;
		}
	}

	// 페이지 로드가 끝난 후 실행
	window.addEventListener('load', clickPopupLink);

	// 혹시 동적 로딩되는 경우를 대비하여 일정 주기로 다시 탐색
	const observer = new MutationObserver(() => {
		const element = getClickButton();
		if (element) {
			console.log('동적으로 추가된 .popup_link 클릭!');
			element.click();
			observer.disconnect(); // 한 번 클릭 후 감시 중단
			alert('clicked');
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });

	clickPopupLink();
})();
