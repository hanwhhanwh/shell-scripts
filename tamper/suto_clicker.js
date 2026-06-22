// ==UserScript==
// @name         SuperToday Auto Clicker
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  이벤트 자동 응모하기 - bo_v_img 내 naver.com 링크 클릭
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
	
	// Iterate through each #bo_v_img element
	boVImgElements.forEach(imgElement => {
		// Find all A tags within the current #bo_v_img element
		const aTags = imgElement.querySelectorAll('a');
		
		aTags.forEach(aTag => {
			const href = aTag.getAttribute('href') || '';
			
			// Check if href contains "naver.com"
			if (href.includes('naver.com')) {
				aTag.click();
				clickCount++;
			}
		});
	});
	
	// Wait 5 seconds after all clicks are initiated
	setTimeout(() => {
		alert(`${clickCount}개의 링크를 클릭했습니다.`);
	}, 5000);
})();