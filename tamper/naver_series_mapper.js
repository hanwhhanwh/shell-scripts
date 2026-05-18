// ==UserScript==
// @name         naver_series_mapper
// @namespace    http://hwh.kr/
// @version      v1.2.0
// @date         2026-05-18
// @description  첨부된 소설의 점수를 네이버 시리즈에서 검색하여 표시하고, 로컬 Everything에서 파일 존재 여부를 확인하는 스크립트
// @author       hbesthee@naver.com
// @match        https://*/newboard/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM.xmlHttpRequest
// @connect      series.naver.com
// @connect      localhost
// ==/UserScript==

(function() {
	/** Start script */
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');

	'use strict';

	// ─── 상수 ───────────────────────────────────────────────────────────────────

	/** Everything HTTP 서버 기본 URL */
	const EVERYTHING_BASE_URL = 'http://localhost:3808/';

	/** 품번 패턴 (예: ABC-12345, 12345-678) */
	const PRODUCT_CODE_PATTERN = /^([0-9,A-Z]{3,6}-\d{2,5})/;

	// ─── Everything HTTP 파서 ────────────────────────────────────────────────────

	// Everything HTTP 검색 결과를 파싱하는 클래스
	class EverythingParser {
		/**
		 * Everything HTTP 검색 결과 HTML에서 파일 목록을 추출합니다.
		 *
		 * @param {string} html - Everything 검색 결과 HTML 문자열
		 * @returns {Array<{name: string, path: string, size: string, modified: string}>} 파일 정보 배열
		 */
		static parseSearchResults(html) {
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			// 결과 없음: numresults 텍스트로 판별
			const numResultsEl = doc.querySelector('p.numresults');
			if (!numResultsEl) {
				return [];
			}

			const numText = numResultsEl.textContent.trim();
			// "0개 결과" 또는 결과 없음인 경우
			if (numText.startsWith('0')) {
				return [];
			}

			const results = [];

			// trdata1, trdata2, ... 행 순회
			const rows = doc.querySelectorAll('tr[class^="trdata"]');

			for (const row of rows) {
				// 파일명: td.file > span.nobr > nobr (img 이후 텍스트)
				const fileCell = row.querySelector('td.file nobr');
				if (!fileCell) {
					continue;
				}

				// img 태그를 제외한 텍스트만 추출
				let name = '';
				for (const node of fileCell.childNodes) {
					if (node.nodeType === Node.TEXT_NODE) {
						name += node.textContent;
					}
				}
				name = name.trim();
				if (!name) {
					continue;
				}

				// 경로: td.pathdata a
				const pathEl = row.querySelector('td.pathdata a');
				const path = pathEl ? pathEl.textContent.trim() : '';

				// 크기: td.sizedata
				const sizeEl = row.querySelector('td.sizedata');
				const size = sizeEl ? sizeEl.textContent.trim() : '';

				// 수정 날짜: td.modifieddata
				const modifiedEl = row.querySelector('td.modifieddata');
				const modified = modifiedEl ? modifiedEl.textContent.trim() : '';

				results.push({ name, path, size, modified });
			}

			return results;
		}
	}



	// 네이버 시리즈 검색 결과를 파싱하는 클래스
	class NaverSeriesParser {
		/**
		 * HTML 문자열에서 검색 결과를 추출합니다.
		 *
		 * @param {string} html - 네이버 시리즈 검색 결과 HTML 문자열
		 * @returns {Array<{title: string, score: string, author: string}>} 검색 결과 배열
		 */
		static parseSearchResults(html) {
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			const results = [];
			const lstLists = doc.querySelectorAll('ul.lst_list');

			// 첫 번째 ul.lst_list만 처리
			if (lstLists.length > 0) {
				const firstList = lstLists[0];
				const titleEl = firstList.querySelector('.N\\=a\\:nov\\.title');
				const scoreEl = firstList.querySelector('.score_num');
				const authorEl = firstList.querySelector('.author');

				if (titleEl) {
					results.push({
						title: titleEl.textContent.trim(),
						score: scoreEl ? scoreEl.textContent.trim() : 'N/A',
						author: authorEl ? authorEl.textContent.trim() : 'N/A'
					});
				}
			}

			return results;
		}
	}


	// ─── 제목/키워드 추출 ────────────────────────────────────────────────────────

	// 제목 추출 및 처리 클래스
	class TitleExtractor {
		/**
		 * 파일명에서 Everything 검색용 키워드를 추출합니다.
		 * 품번 패턴이 있으면 해당 패턴을, 없으면 앞의 2 단어를 반환합니다.
		 *
		 * @param {string} filename - 원본 파일명 문자열 (URL 인코딩 포함 가능)
		 * @returns {string} 검색 키워드 문자열
		 */
		static extractEverythingKeyword(filename) {
			// URL 디코딩
			let decoded = filename;
			try {
				decoded = decodeURIComponent(filename);
			} catch (_) {
				// 디코딩 실패 시 원본 사용
			}

			// 확장자 제거
			const baseName = decoded.replace(/\.\w+$/, '').trim();

			// 품번 패턴 우선 탐색
			const match = baseName.match(PRODUCT_CODE_PATTERN);
			if (match) {
				return match[1];
			}

			// 품번 없을 경우: 공백으로 분리 후 앞 2 단어
			const words = baseName.split(/\s+/).filter(w => w.length > 0);
			return words.slice(0, 2).join(' ');
		}


		/**
		 * 파일명에서 네이버 시리즈 검색 키워드를 추출합니다.
		 *
		 * @param {string} filename - 파일명 문자열
		 * @returns {Array<string>} 추출된 키워드 배열
		 */
		static extractNaverKeywords(filename) {
			// 파일 크기 정보 제거 (예: [599.53 KB])
			let title = filename.replace(/\[[\d.]+\s*[KMG]?B\]/gi, '').trim();

			// 파일 확장자 제거
			title = title.replace(/\.\w+$/, '').trim();

			// 숫자-숫자 패턴 이전까지 추출 (예: "1-68" 이전)
			const match = title.match(/^(.*?)\s*\d+-\d+/);
			if (match) {
				title = match[1].trim();
			}

			title = title.replace(/\[[^\]]*\]/g, '');    // [] 문자열 제거
			title = title.replace(/\s{2,}/g, ' ').trim(); // 2개 이상의 공백을 1개로

			// 쉼표 이후 내용 제거
			title = title.split(',')[0].trim();

			// 공백으로 분리
			const words = title.split(/\s+/).filter(word => word.length > 0);

			return words;
		}


		/**
		 * 키워드 배열로 네이버 시리즈 검색 URL을 생성합니다.
		 *
		 * @param {Array<string>} keywords - 검색 키워드 배열
		 * @returns {string} 네이버 시리즈 검색 URL
		 */
		static createNaverSearchUrl(keywords) {
			const query = keywords.join('+');
			return `https://series.naver.com/search/search.series?t=novel&q=${encodeURIComponent(query)}`;
		}


		/**
		 * 키워드로 Everything HTTP 검색 URL을 생성합니다.
		 *
		 * @param {string} keyword - 검색 키워드
		 * @returns {string} Everything HTTP 검색 URL
		 */
		static createEverythingSearchUrl(keyword) {
			return `${EVERYTHING_BASE_URL}?search=${encodeURIComponent(keyword)}`;
		}
	}


	// ─── 팝업 UI ─────────────────────────────────────────────────────────────────

	// Everything 검색 결과 팝업을 관리하는 클래스
	class EverythingPopup {
		constructor() {
			this._popupEl = null;
			this._hideTimer = null;
			this._init();
		}


		/**
		 * 팝업 DOM 요소를 초기화합니다.
		 *
		 * @returns {void}
		 */
		_init() {
			this._popupEl = document.createElement('div');
			this._popupEl.id = 'everything-popup';
			Object.assign(this._popupEl.style, {
				position: 'fixed',
				zIndex: '99999',
				background: '#fff',
				border: '1px solid #aaa',
				borderRadius: '4px',
				boxShadow: '2px 4px 12px rgba(0,0,0,0.18)',
				padding: '8px 12px',
				fontSize: '12px',
				lineHeight: '1.6',
				maxWidth: '520px',
				wordBreak: 'break-all',
				display: 'none',
				pointerEvents: 'none',
			});
			document.body.appendChild(this._popupEl);
		}


		/**
		 * 지정 위치에 팝업을 표시합니다.
		 *
		 * @param {Array<{name: string, path: string, size: string, modified: string}>} results - 검색 결과 배열
		 * @param {number} x - 팝업 X 좌표 (px)
		 * @param {number} y - 팝업 Y 좌표 (px)
		 * @returns {void}
		 */
		show(results, x, y) {
			clearTimeout(this._hideTimer);

			const lines = results.map(r =>
				`📄 ${r.name}<br>` +
				`　　<span style="color:#555">${r.path}</span>` +
				(r.size ? `　<span style="color:#888">${r.size}</span>` : '') +
				(r.modified ? `　<span style="color:#aaa">${r.modified}</span>` : '')
			).join('<hr style="margin:4px 0;border:none;border-top:1px solid #eee">');

			this._popupEl.innerHTML = lines;
			this._popupEl.style.display = 'block';

			// 뷰포트 넘침 방지
			const vw = window.innerWidth;
			const popupW = 520;
			const left = (x + popupW > vw) ? (vw - popupW - 8) : x;
			this._popupEl.style.left = `${left}px`;
			this._popupEl.style.top = `${y + 18}px`;
		}


		/**
		 * 팝업을 숨깁니다.
		 *
		 * @param {number} [delay=0] - 숨김 지연 시간 (ms)
		 * @returns {void}
		 */
		hide(delay = 0) {
			clearTimeout(this._hideTimer);
			if (delay > 0) {
				this._hideTimer = setTimeout(() => {
					this._popupEl.style.display = 'none';
				}, delay);
			} else {
				this._popupEl.style.display = 'none';
			}
		}
	}


	// ─── 메인 처리 ───────────────────────────────────────────────────────────────

	// 메인 처리 클래스
	class FileLinksProcessor {
		constructor() {
			this.panelElements = document.querySelectorAll('.panel.panel-default');
			this.processedLinks = new Set();
			this.validExtensions = ['.txt', '.zip', '.rar', '.7z'];
			this.popup = new EverythingPopup();
		}


		/**
		 * 파일 링크로 네이버 시리즈에 검색해야할지 유효성을 검사합니다.
		 *
		 * @param {HTMLElement} link - 검사할 파일 링크 요소
		 * @returns {boolean} 유효한 파일이면 true, 아니면 false
		 */
		isFilteredFile(link) {
			const href = link.getAttribute('href');
			if (!href) {
				return false;
			}

			// "/newboard/yamoonboard/admin-board/download.asp?fullboardname=yamoonmemberboard&mtablename=request&num=51031&filename=%5B%EC%99%84%5D%EB%AC%B4%EB%A6%BC%EC%98%A4%EC%A0%81%20%EC%97%B0%EC%9E%91%2004.%EB%AC%B4%EB%A6%BC%EC%98%A4%EC%A0%81.rar"
			// URL에서 파일명 추출
			const splits = href.split('filename=');
			if (splits.length < 2) {
				return false;
			}
			const filename = splits[1];
			// 확장자 추출 (소문자로 변환)
			const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));

			// 유효한 확장자인지 확인
			return this.validExtensions.includes(extension);
		}


		/**
		 * href에서 파일명 부분을 추출합니다.
		 *
		 * @param {HTMLElement} link - 대상 링크 요소
		 * @returns {string} 파일명 문자열 (URL 인코딩 상태)
		 */
		_extractFilenameFromHref(link) {
			const href = link.getAttribute('href') || '';
			const splits = href.split('filename=');
			return splits.length >= 2 ? splits[1] : '';
		}


		/**
		 * GM.xmlHttpRequest 래퍼 (레거시 호환).
		 *
		 * @param {string} url - 요청 URL
		 * @param {function(string): void} onSuccess - 성공 콜백 (responseText)
		 * @param {function(): void} onFail - 실패 콜백
		 * @returns {void}
		 */
		_gmGet(url, onSuccess, onFail) {
			const gmXHR = (typeof GM !== 'undefined' && GM.xmlHttpRequest)
				? GM.xmlHttpRequest
				: GM_xmlhttpRequest;

			gmXHR({
				method: 'GET',
				url: url,
				onload: (response) => {
					if (response.status === 200) {
						onSuccess(response.responseText);
					} else {
						console.error('요청 실패:', url, response.status);
						onFail();
					}
				},
				onerror: (error) => {
					console.error('요청 오류:', url, error);
					onFail();
				},
			});
		}


		/**
		 * Everything HTTP 검색을 수행합니다.
		 *
		 * @param {string} url - Everything 검색 URL
		 * @param {function(Array<{name: string, path: string, size: string, modified: string}>): void} callback - 결과 콜백
		 * @returns {void}
		 */
		searchEverything(url, callback) {
			this._gmGet(
				url,
				(html) => callback(EverythingParser.parseSearchResults(html)),
				() => callback([])
			);
		}


		/**
		 * 네이버 시리즈 검색을 수행합니다.
		 *
		 * @param {string} url - 검색 URL
		 * @param {function(Array<{title: string, score: string, author: string}>): void} callback - 검색 완료 후 호출될 콜백 함수
		 * @returns {void}
		 */
		searchNaverSeries(url, callback) {
			this._gmGet(
				url,
				(html) => callback(NaverSeriesParser.parseSearchResults(html)),
				() => callback([])
			);
		}


		/**
		 * 링크 옆에 Everything 존재 여부 기호("O" / "X")를 추가합니다.
		 *
		 * @param {HTMLElement} linkElement - 대상 링크 요소
		 * @param {Array<{name: string, path: string, size: string, modified: string}>} results - Everything 검색 결과
		 * @returns {void}
		 */
		appendEverythingBadge(linkElement, results) {
			const badge = document.createElement('span');
			badge.style.marginLeft = '6px';
			badge.style.fontWeight = 'bold';
			badge.style.cursor = results.length > 0 ? 'pointer' : 'default';

			if (results.length > 0) {
				badge.textContent = 'O';
				badge.style.color = '#007700';
				badge.title = `${results.length}개 파일 발견`;

				// 마우스 오버 시 팝업 표시
				badge.addEventListener('mouseenter', (e) => {
					this.popup.show(results, e.clientX, e.clientY);
				});
				badge.addEventListener('mousemove', (e) => {
					this.popup.show(results, e.clientX, e.clientY);
				});
				badge.addEventListener('mouseleave', () => {
					this.popup.hide(200);
				});
			} else {
				badge.textContent = 'X';
				badge.style.color = '#cc0000';
				badge.title = '로컬에 파일 없음';
			}

			linkElement.parentNode.insertBefore(badge, linkElement.nextSibling);
		}


		/**
		 * 링크에 네이버 시리즈 검색 결과를 추가합니다.
		 *
		 * @param {HTMLElement} linkElement - 대상 링크 요소
		 * @param {{title: string, score: string, author: string}|null} result - 검색 결과 객체 또는 null
		 * @returns {void}
		 */
		appendNaverSearchResult(linkElement, result) {
			const infoSpan = document.createElement('span');
			infoSpan.style.marginLeft = '10px';
			infoSpan.style.fontSize = '0.9em';

			if (result) {
				infoSpan.style.color = '#0066cc';
				infoSpan.textContent = `→ ${result.title} / ${result.author} / ${result.score}`;
			} else {
				infoSpan.style.color = '#999';
				infoSpan.textContent = '→ 검색 결과 없음';
			}

			linkElement.parentNode.insertBefore(infoSpan, linkElement.nextSibling);
		}


		/**
		 * 파일 링크를 처리합니다 (Everything 확인 + 네이버 시리즈 검색).
		 *
		 * @param {HTMLElement} link - 처리할 파일 링크 요소
		 * @returns {void}
		 */
		processFileLink(link) {
			if (this.processedLinks.has(link)) {
				return;
			}
			this.processedLinks.add(link);

			// ── Everything 로컬 검색 ──────────────────────────────────────
			const rawFilename = this._extractFilenameFromHref(link);
			const everythingKeyword = TitleExtractor.extractEverythingKeyword(rawFilename);

			if (everythingKeyword) {
				const everythingUrl = TitleExtractor.createEverythingSearchUrl(everythingKeyword);
				this.searchEverything(everythingUrl, (results) => {
					this.appendEverythingBadge(link, results);
				});
			}

			// ── 네이버 시리즈 검색 ───────────────────────────────────────
			const displayFilename = link.textContent.trim();
			const naverKeywords = TitleExtractor.extractNaverKeywords(displayFilename);

			if (naverKeywords.length === 0) {
				return;
			}

			const naverUrl = TitleExtractor.createNaverSearchUrl(naverKeywords);
			this.searchNaverSeries(naverUrl, (results) => {
				this.appendNaverSearchResult(link, results.length > 0 ? results[0] : null);
			});
		}


		/**
		 * 모든 파일 링크를 처리합니다.
		 *
		 * @returns {void}
		 */
		processAllLinks() {
			if (this.panelElements.length === 0) {
				return;
			}

			for (const panel of this.panelElements) {
				const fileLinks = panel.querySelectorAll('a.fr-file');

				for (const link of fileLinks) {
					if (this.isFilteredFile(link)) {
						this.processFileLink(link);
					}
				}
			}
		}


		/**
		 * 스크립트를 초기화하고 실행합니다.
		 *
		 * @returns {void}
		 */
		init() {
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', () => {
					this.processAllLinks();
				});
			} else {
				this.processAllLinks();
			}

			// 동적으로 추가되는 링크 감지
			const observer = new MutationObserver(() => {
				this.panelElements = document.querySelectorAll('.panel.panel-default');
				this.processAllLinks();
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
		}
	}


	// 메인 실행
	const processor = new FileLinksProcessor();
	processor.init();
})();