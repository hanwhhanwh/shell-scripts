// ==UserScript==
// @name         daum_attachment_generator
// @namespace    http://hwh.kr/
// @version      v1.1.4
// @date         2025-08-13
// @description  야문 다음 첨부파일 다운로드용 스크립트 생성기
// @author       hbesthee@naver.com
// @match        https://*/newboard/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
	/** Start script */
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');

	const DAUM_BASE = 'https://attach.mail.daum.net/bigfile/v1/urls';
	const YA_BASE = 'https://www.ya-moon.com/newboard/yamoonboard/admin-board/download.asp?fullboardname=';
	'use strict';


	/**
	 * 파일명에서 패턴과 확장자를 추출하여 새로운 파일명을 생성합니다.
	 * 파일명에 "Reducing_Mosaic"가 포함되어 있으면 -HU를 추가합니다.
	 * @param {string} filename - 원본 파일명
	 * @returns {string} 수정된 파일명
	 */
	function createModifiedFilename(filename) {
		const pattern = /^([A-Z]{3,5}-\d{2,5})/;
		const filenameMatch = filename.match(pattern);

		// 패턴에 일치하는 부분이 없으면 원본 파일명 반환
		if (!filenameMatch) {
			return null;
		}

		const baseName = filenameMatch[1];
		const extensionMatch = filename.match(/\.([0-9a-z]+)(?:[\?#]|$)/i);
		const extension = extensionMatch ? `.${extensionMatch[1]}` : '';

		let newFilename = baseName.toUpperCase();

		if (filename.includes("Reducing_Mosaic") || filename.includes(".uncen")) {
			newFilename += "-HU";
		}
		if ( filename.includes(".korsub") ) {
			newFilename += "-S";
		}

		// 최종 파일명에 확장자 추가
		newFilename += extension;

		return newFilename;
	}


	/**
	 * HTML 엘리먼트의 ID를 받아 해당 엘리먼트의 내용에서 다운로드 가능한 파일 정보를 추출하여 wget 명령어를 생성합니다.
	 * A 엘리먼트를 순회하며, createModifiedFilename() 함수를 통해 유효성이 확인된 파일에 대해서만 스크립트를 생성합니다.
	 * @param {string} elementId - 내용을 추출할 HTML 엘리먼트의 ID (기본값: "read-content")
	 * @returns {string} 생성된 wget 명령어 스크립트 문자열
	 */
	function generateWgetScriptFromElement(elementId = "read-content") {
		const targetElement = document.getElementById(elementId);
		const wgetCommands = [];

		if (!targetElement || !targetElement.innerHTML) {
			console.error(`ID가 "${elementId}"인 엘리먼트를 찾을 수 없거나 내용이 없습니다.`);
			return "";
		}

		// 현재 페이지의 쿠키 정보 설정하기
		if (sessionStorage.getItem('cookie') === null) {
			// 사용자에게 문자열을 입력받음
			const userInput = prompt(`세션 스토리지에 저장할 값을 입력하세요.`);
			if (userInput !== null && userInput.trim() !== '') {
				sessionStorage.setItem('cookie', userInput);
			}
			else {
				console.log("입력이 취소되었거나 유효하지 않아 저장되지 않았습니다.");
				return "";
			}
		}
		const cookieHeader = `--header="Cookie: ${sessionStorage.getItem('cookie').trim()}"`;
		console.log(`cookieHeader=${cookieHeader}`)
		// 현 페이지 주소를 Referer 헤더로 준비
		const referrerHeader = `--header="Referer: ${document.location.href}"`;
		// 임시 DOM 파서 생성
		const parser = new DOMParser();
		const doc = parser.parseFromString(targetElement.innerHTML, 'text/html');
		// 모든 <a> 엘리먼트를 순회
		const allLinks = doc.querySelectorAll('a');

		allLinks.forEach(linkElement => {
			const url = linkElement.href;
			const textContent = linkElement.textContent ? linkElement.textContent.trim() : '';
			let originalFilename = '';
			let modifiedFilename = null;
			let wget_headers = '';

			// "https://attach" 또는 "download.asp"가 포함된 링크만 처리
			if (url.startsWith('https://attach')) {
				const title = linkElement.getAttribute('title');
				if (title && title.endsWith(' 다운로드')) {
					originalFilename = title.replace(' 다운로드', '');
				} else {
					originalFilename = textContent;
				}
				modifiedFilename = createModifiedFilename(originalFilename);

			} else if (url.includes('download.asp')) {
				// "download.asp" 링크는 텍스트 내용을 파일명으로 사용하고, 파일 확장자가 포함된 경우에만 처리
				const filenameMatch = textContent.match(/^(.*)\s*\[.*B\]/);
				if (filenameMatch && filenameMatch[1]) {
					originalFilename = filenameMatch[1].trim();
					modifiedFilename = createModifiedFilename(originalFilename); // "download.asp" 링크는 파일명을 변경하지 않고 그대로 사용
					wget_headers = `${cookieHeader} ${referrerHeader}`;
				}
			}

			// createModifiedFilename 함수가 null을 반환하지 않았을 때만 스크립트 생성
			if (modifiedFilename !== null && modifiedFilename !== '') {
				if (wget_headers !== '') {
					wgetCommands.push(`curl -o "${modifiedFilename}" -K "\${HOME}/.conf/down.conf" -sS "${url.replace(YA_BASE, '\${YA_BASE}')}"`);
				}
				else {
					wgetCommands.push(`wget -O "${modifiedFilename}" "${url.replace(DAUM_BASE, '\${DAUM_BASE}')}"`);
				}
			}
		});

		return `export DAUM_BASE="${DAUM_BASE}" ; \\\n`
					+ `export YA_BASE="${YA_BASE}" ; \\\n`
					+ wgetCommands.join(' ; \\\n');
	}


	/**
	 * 특정 div에 버튼을 추가하고, 버튼 클릭 시 wget 스크립트를 생성하여 콘솔에 출력합니다.
	 * @param {string} containerId - 버튼을 추가할 div의 ID
	 * @param {string} contentId - wget 스크립트 생성을 위해 내용을 추출할 div의 ID
	 */
	function addWgetButtonToDiv(contentId = "read-content") {
		const containerDiv = document.querySelector('div.pull-left.margin-bottom--8');
		if (!containerDiv) {
			console.error(`버튼을 추가할 컨테이너 div를 찾을 수 없습니다.`);
			return;
		}

		// 버튼 엘리먼트 생성
		const button = document.createElement('button');
		button.textContent = 'wget scripts';

		// 버튼에 스타일 적용
		button.style.cssText = `
			background-color: #4CAF50;
			color: white;
			padding: 4px 20px;
			border: none;
			border-radius: 5px;
			cursor: pointer;
			font-size: 12px;
			transition: background-color 0.3s ease;
		`;

		// 마우스 오버 시 색상 변경
		button.onmouseover = () => {
			button.style.backgroundColor = '#45a049';
		};
		button.onmouseout = () => {
			button.style.backgroundColor = '#4CAF50';
		};

		// 버튼 클릭 이벤트 리스너 추가
		button.addEventListener('click', () => {
			try {
				const wgetScript = generateWgetScriptFromElement(contentId);
				if (wgetScript) {
					// 스크립트를 클립보드에 복사 (선택 사항)
					// GM_setClipboard(wgetScript)
					navigator.clipboard.writeText(wgetScript)
						.then(() => alert('Wget 스크립트가 클립보드에 복사되었습니다.'))
						.catch(err => console.error('클립보드 복사 실패:', err));
				} else {
					console.log('생성할 wget 스크립트가 없습니다.');
				}
			} catch (e) {
				console.error('스크립트 생성 중 오류 발생:', e);
			}
		});

		// 컨테이너 div에 버튼 추가
		containerDiv.appendChild(button);
	}


	addWgetButtonToDiv();
	// setTimeout(() => {
	// 	console.log(generateWgetScriptFromElement());
	// }, 1500);
})();
