// ==UserScript==
// @name         SuperToday Auto Clicker
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  이벤트 자동 응모하기 - bo_v_img 내 링크 배열 저장 후 새 창 열기
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

	const hrefArray = [];

	boVImgElements.forEach(imgElement => {
		const aTags = imgElement.querySelectorAll('a');

		aTags.forEach(aTag => {
			const href = aTag.getAttribute('href') || '';

			// Save all href attributes to array
			if (href.includes('naver.com') || href.includes('naverpay')) {
				if (hrefArray[hrefArray.length-1] != href) {
					hrefArray.push(href);
					console.log(`[Link href] ${href}`);
				}
			}
			// If href contains "/bbs/link.php", save the text content to console
			else if (href.includes('/bbs/link.php')) {
				const text = aTag.innerText.trim();
				if (text.startsWith('https://') && (hrefArray[hrefArray.length-1] != text)) {
					hrefArray.push(text);
					console.log(`[Link Text] ${href} -> ${text}`);
				}
			}
		});
	});

	// console.log('Href Array:', hrefArray);

	// Open all href links in new tabs with 1 second intervals
	let currentIndex = 0;

	function openNext() {
		if (currentIndex < hrefArray.length) {
			window.open(hrefArray[currentIndex], '_blank');
			currentIndex++;
			setTimeout(openNext, 1000);
		}
	}

	if (hrefArray.length > 0) {
		openNext();

		// Show alert after all links are opened
		setTimeout(() => {
			alert(`Href: ${hrefArray.length}개의 링크를 새 창에서 열었습니다.`);
		}, hrefArray.length * 1000 + 500);
	} else {
		alert('클릭할 링크가 없습니다.');
	}
})();