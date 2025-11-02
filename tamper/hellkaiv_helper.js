// ==UserScript==
// @name         hellkaiv helper
// @namespace    http://hwh.kr/
// @version      v1.0.0
// @date         2025-11-02
// @description  헬카이브용 도움 스크립트
// @author       hbesthee@naver.com
// @match        https://hellkaiv.net/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
	/** Start script */
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: darkgray');

	// document.querySelector('#captcha_img').style.height="100px"
	const CAPCHA_ID = 'captcha_img';
	const YA_BASE = 'https://www.ya-moon.com/newboard/yamoonboard/admin-board/download.asp?fullboardname=';
	'use strict';

	let captcha_img = document.querySelector(`#${CAPCHA_ID}`);
	if (captcha_img) {
		captcha_img.style.height="100px";
		console.log('captcha_img enlarged.')
	}
})();
