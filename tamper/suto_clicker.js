// ==UserScript==
// @name         SuperToday Auto Clicker
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  이벤트 자동 응모하기 - bo_v_img 내 naver.com 링크 새 창 열기 (5초 간격)
// @author       hbesthee@naver.com
// @match        https://www.suto.co.kr/ztech/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
	'use strict';

	console.log("SuperToday Auto Clicker loaded...");

	// Find element(s) with id="bo_v_img"
	const boVImgElements = document.querySelectorAll('#bo_v_img');

	let clickCount = 0;
	const allClicks = [];

	// Collect all links to open
	boVImgElements.forEach(imgElement => {
		const aTags = imgElement.querySelectorAll('a');
		aTags.forEach(aTag => {
			const href = aTag.getAttribute('href') || '';
			if (href.includes('naver.com') || href.includes('naverpay')) {
				allClicks.push(aTag);
			}
		});
	});

	// Open links in new tab one by one with 5 second intervals
	let currentIndex = 0;

	function openNext() {
		if (currentIndex < allClicks.length) {
			const aTag = allClicks[currentIndex];
			window.open(aTag.href, '_blank');
			clickCount++;
			currentIndex++;

			setTimeout(openNext, 1000);
		} else {
			alert(`${clickCount}개의 링크를 새 창에서 열었습니다.`);
		}
	}

	if (allClicks.length > 0) {
		openNext();
	} else {
		alert('클릭할 링크가 없습니다.');
	}
})();