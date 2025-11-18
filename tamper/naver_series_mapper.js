// ==UserScript==
// @name         naver_series_mapper
// @namespace    http://hwh.kr/
// @version      v1.0.0
// @date         2025-11-18
// @description  첨부된 소설의 점수를 네이버 시리즈에서 검색하여 표시하는 스크립트
// @author       hbesthee@naver.com
// @match        https://*/newboard/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM.xmlHttpRequest
// @connect      series.naver.com
// ==/UserScript==

(function() {
	/** Start script */
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');

	'use strict';

	// 네이버 시리즈 검색 결과를 파싱하는 클래스
	class NaverSeriesParser {

		/**
		 * 키워드 배열로 검색 URL을 생성합니다.
		 *
		 * @param {Array<string>} keywords - 검색 키워드 배열
		 * @returns {string} 네이버 시리즈 검색 URL
		 */
		static createSearchUrl(keywords) {
			const query = keywords.join('+');
			return `https://series.naver.com/search/search.series?t=novel&q=${encodeURIComponent(query)}`;
		}


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



	// 메인 처리 클래스
	class FileLinksProcessor {
		constructor() {
			this.readContent = document.getElementById('read-content');
			this.processedLinks = new Set();
		}


		/**
		 * 파일명에서 검색 키워드를 추출합니다.
		 *
		 * @param {string} filename - 파일명 문자열
		 * @returns {Array<string>} 추출된 키워드 배열
		 */
		extractKeywords(filename) {
			// 파일 크기 정보 제거 (예: [599.53 KB])
			let title = filename.replace(/\[[\d.]+\s*[KMG]?B\]/gi, '').trim();

			// 파일 확장자 제거
			title = title.replace(/\.\w+$/, '').trim();

			// 숫자-숫자 패턴 이전까지 추출 (예: "1-68" 이전)
			const match = title.match(/^(.*?)\s*\d+-\d+/);
			if (match) {
				title = match[1].trim();
			}

			// 쉼표 이후 내용 제거
			title = title.split(',')[0].trim();

			// 공백으로 분리
			const words = title.split(/\s+/).filter(word => word.length > 0);

			return words;
		}


		/**
		 * 네이버 시리즈 검색을 수행합니다.
		 *
		 * @param {string} url - 검색 URL
		 * @param {function(Array<{title: string, score: string, author: string}>): void} callback - 검색 완료 후 호출될 콜백 함수
		 * @returns {void}
		 */
		searchNaverSeries(url, callback) {
			// GM.xmlHttpRequest (Tampermonkey 4.0+) 또는 GM_xmlhttpRequest (레거시) 사용
			const gmXHR = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlhttpRequest;

			gmXHR({
				method: 'GET',
				url: url,
				onload: function(response) {
					if (response.status === 200) {
						const results = NaverSeriesParser.parseSearchResults(response.responseText);
						callback(results);
					} else {
						console.error('네이버 시리즈 검색 실패:', response.status);
						callback([]);
					}
				},
				onerror: function(error) {
					console.error('네이버 시리즈 검색 오류:', error);
					callback([]);
				}
			});
		}


		/**
		 * 링크에 검색 결과를 추가합니다.
		 *
		 * @param {HTMLElement} linkElement - 대상 링크 요소
		 * @param {{title: string, score: string, author: string}|null} result - 검색 결과 객체 또는 null
		 * @returns {void}
		 */
		appendSearchResult(linkElement, result) {
			if (result) {
				const infoSpan = document.createElement('span');
				infoSpan.style.marginLeft = '10px';
				infoSpan.style.color = '#0066cc';
				infoSpan.style.fontSize = '0.9em';
				infoSpan.textContent = `→ ${result.title} / ${result.author} / ${result.score}`;

				linkElement.parentNode.insertBefore(infoSpan, linkElement.nextSibling);
			} else {
				const infoSpan = document.createElement('span');
				infoSpan.style.marginLeft = '10px';
				infoSpan.style.color = '#999';
				infoSpan.style.fontSize = '0.9em';
				infoSpan.textContent = '→ 검색 결과 없음';

				linkElement.parentNode.insertBefore(infoSpan, linkElement.nextSibling);
			}
		}


		/**
		 * 파일 링크를 처리합니다.
		 *
		 * @param {HTMLElement} link - 처리할 파일 링크 요소
		 * @returns {void}
		 */
		processFileLink(link) {
			// 이미 처리된 링크는 건너뛰기
			if (this.processedLinks.has(link)) {
				return;
			}

			this.processedLinks.add(link);

			const filename = link.textContent.trim();
			const keywords = this.extractKeywords(filename);

			if (keywords.length === 0) {
				return;
			}

			const searchUrl = NaverSeriesParser.createSearchUrl(keywords);

			// 검색 수행
			this.searchNaverSeries(searchUrl, (results) => {
				if (results.length > 0) {
					// 첫 번째 결과 사용
					this.appendSearchResult(link, results[0]);
				} else {
					this.appendSearchResult(link, null);
				}
			});
		}


		/**
		 * 모든 파일 링크를 처리합니다.
		 *
		 * @returns {void}
		 */
		processAllLinks() {
			if (!this.readContent) {
				return;
			}

			const fileLinks = this.readContent.querySelectorAll('a.fr-file');

			for (const link of fileLinks) {
				this.processFileLink(link);
			}
		}


		/**
		 * 스크립트를 초기화하고 실행합니다.
		 *
		 * @returns {void}
		 */
		init() {
			// 페이지 로드 후 처리
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', () => {
					this.processAllLinks();
				});
			} else {
				this.processAllLinks();
			}

			// 동적으로 추가되는 링크 감지
			const observer = new MutationObserver(() => {
				this.processAllLinks();
			});

			if (this.readContent) {
				observer.observe(this.readContent, {
					childList: true,
					subtree: true
				});
			}
		}
	}


	// 메인 실행
	const processor = new FileLinksProcessor();
	processor.init();
})();
