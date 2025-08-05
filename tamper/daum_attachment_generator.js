// ==UserScript==
// @name         daum_attachment_generator
// @namespace    http://hwh.kr/
// @version      2025-08-05
// @description  야문 다음 첨부파일 다운로드용 스크립트 생성기
// @author       hbesthee@naver.com
// @match        https://www.*.com/newboard/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
	/** Start script */
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');

	'use strict';


	function generateWgetScriptFromElement(elementId = "read-content") {
		const targetElement = document.getElementById(elementId);
		let wgetCommands = [];

		if (!targetElement || !targetElement.innerHTML) {
			console.error(`ID가 "${elementId}"인 엘리먼트를 찾을 수 없거나 내용이 없습니다.`);
			return "";
		}

		// 임시 DOM 파서 생성
		const parser = new DOMParser();
		const doc = parser.parseFromString(targetElement.innerHTML, 'text/html');

		// 모든 <a> 엘리먼트를 순회
		const allLinks = doc.querySelectorAll('a');

		allLinks.forEach(linkElement => {
			const url = linkElement.href;
			// href 속성이 "https://attach"로 시작하는 링크만 필터링
			if (! url.startsWith('https://attach'))
				return;

			const title = linkElement.getAttribute('title');
			const textContent = linkElement.textContent ? linkElement.textContent.trim() : '';

			let filename = '';

			// zip 파일 처리 로직 (텍스트 내용에 ".zip"과 "[MB]"가 포함된 경우)
			if (textContent.includes('.zip') && textContent.includes('MB')) {
				const filenameMatch = textContent.match(/(.*)\s*\[.*MB\]/);
				if (filenameMatch && filenameMatch[1]) {
					filename = filenameMatch[1].trim();
				} else {
					// 매칭 실패 시, URL에서 파일명 추정 또는 기본값 설정
					const urlParts = url.split('/');
					filename = urlParts[urlParts.length - 1].split('?')[0]; // URL의 마지막 부분을 파일명으로 사용
				}
			}
			// mp4 파일 처리 로직 (title 속성에 "다운로드"가 포함된 경우 또는 텍스트 내용에 ".mp4"가 포함된 경우)
			else if ((title && title.includes('다운로드')) || textContent.includes('.mp4')) {
				const filenameWithExt = (title && title.includes('다운로드')) ? title.replace(' 다운로드', '') : textContent;
				const baseFilename = filenameWithExt.substring(0, filenameWithExt.lastIndexOf('.')).trim();
				filename = `${baseFilename}-HD.mp4`;
			}

			if (filename) {
				wgetCommands.push(`wget "${url}" -O "${filename}"`);
			}
		});

		return wgetCommands.join(' ; \\\n');
	}

	setTimeout(() => {
		console.log(generateWgetScriptFromElement());
	}, 1500);
})();
