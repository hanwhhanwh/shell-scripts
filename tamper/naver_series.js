// ==UserScript==
// @name         naver_series_mapper
// @namespace    http://hwh.kr/
// @version      v1.2.0
// @date         2025-11-18
// @description  첨부 파일의 네이버 시리즈 점수 표시 + Everything HTTP 로컬 존재 여부 확인 통합
// @author       hbesthee@naver.com
// @match        *://*/newboard/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM.xmlHttpRequest
// @connect      series.naver.com
// @connect      localhost
// ==/UserScript==

(function() {
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');

    'use strict';

    // 툴팁 CSS
    GM_addStyle(`
        .ev-popup {
            position: absolute; background:  #fff; border: 1px solid  #aaa; padding: 8px 10px;
            font-size: 12px; line-height: 1.4; z-index: 9999; box-shadow: 0 3px 6px  rgba(0,0,0,0.2);
            max-height: 250px; overflow-y: auto; white-space: pre-wrap; border-radius: 4px;
            display: none; pointer-events: none;
        }
    `);
    /** 네이버 시리즈 파서 */
    class NaverSeriesParser {
        static parseSearchResults(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const results = [];
            const lists = doc.querySelectorAll('ul.lst_list');
            if (lists.length > 0) {
                const firstList = lists[0];
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
    /** 키워드 추출 및 URL 생성 */
    class TitleExtractor {
        static extractKeywords(filename) {
            let title = filename.replace(/\[[\d.]+\s*[KMG]?B\]/gi, '').trim();
            title = title.replace(/\.\w+$/, '').trim();
            const match = title.match(/^(.*?)\s*\d+-\d+/);
            if (match) title = match[1].trim();
            title = title.replace(/\[[^\]]*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
            title = title.split(',')[0].trim();
            return title.split(/\s+/).filter(w => w.length > 0);
        }
        static createSearchUrl(keywords) {
            const query = keywords.join('+');
            return `https://series.naver.com/search/search.series?t=novel&q=${encodeURIComponent(query)}`;
        }
        // Everything 로컬 검색용 키워드 추출
        static extractEverythingKeyword(filename) {
            let clean = filename.replace(/\[[\d.]+\s*[KMG]?B\]/gi, '').replace(/\.\w+$/, '').trim();
            clean = clean.replace(/\[[^\]]*\]/g, ' ').trim();
            // 품번 패턴 매칭 (공백 제외 대문자/숫자 3~6자리 - 숫자 2~5자리)
            const partNumMatch = clean.match(/^([0-9A-Z]{3,6}-\d{2,5})/);
            if (partNumMatch) return partNumMatch[1];
            // 품번 없으면 앞의 2개 단어
            const words = clean.split(/\s+/).filter(w => w.length > 0);
            return words.slice(0, 2).join(' ');
        }
    }
    /** Everything HTML 파서 */
    class EverythingParser {
        static parse(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const results = [];
            // 테이블 행 기반 파싱
            const rows = doc.querySelectorAll('tr');
            rows.forEach(row => {
                const links = row.querySelectorAll('a');
                links.forEach(link => {
                    const href = link.getAttribute('href') || '';
                    const text = link.textContent.trim();
                    if (!text) return;
                    if (href.startsWith('https://attach')) {
                        results.push(text);
                    } else if (href && !href.startsWith('#') && !href.includes('search=')) {
                        results.push(text);
                    }
                });
            });
            // 테이블이 없을 경우 전체 링크Fallback
            if (results.length === 0) {
                doc.querySelectorAll('a').forEach(link => {
                    const href = link.getAttribute('href') || '';
                    const text = link.textContent.trim();
                    if (text && !href.includes('search=')) results.push(text);
                });
            }
            return [...new Set(results)];
        }
    }
    /** 메인 처리 클래스 */
    class FileLinksProcessor {
        constructor() {
            this.panelElements = document.querySelectorAll('.panel.panel-default');
            this.processedLinks = new Set();
            this.validExtensions = ['.txt', '.zip', '.rar', '.7z'];
            this.tooltipEl = document.createElement('div');
            this.tooltipEl.className = 'ev-popup';
            document.body.appendChild(this.tooltipEl);
        }
        isFilteredFile(link) {
            const href = link.getAttribute('href');
            if (!href) return false;
            const splits = href.split('filename=');
            if (splits.length < 2) return false;
            const filename = splits[1];
            const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
            return this.validExtensions.includes(ext);
        }
        searchNaverSeries(url, callback) {
            const gmXHR = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlhttpRequest;
            gmXHR({
                method: 'GET', url: url,
                onload: res => {
                    if (res.status === 200) callback(NaverSeriesParser.parseSearchResults(res.responseText));
                    else callback([]);
                },
                onerror: () => callback([])
            });
        }
        searchEverything(keyword, callback) {
            const url = `http://localhost:3808/?search=${encodeURIComponent(keyword)}`;
            const gmXHR = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlhttpRequest;
            gmXHR({
                method: 'GET', url: url,
                onload: res => {
                    if (res.status === 200) callback(EverythingParser.parse(res.responseText));
                    else callback([]);
                },
                onerror: () => callback([])
            });
        }
        appendSearchResult(linkEl, result) {
            const span = document.createElement('span');
            span.style.marginLeft = '10px';
            span.style.color = result ? ' #0066cc' : ' #999';
            span.style.fontSize = '0.9em';
            span.textContent = result ? `→ ${result.title} / ${result.author} / ${result.score}` : '→ 검색 결과 없음';
            linkEl.parentNode.insertBefore(span, linkEl.nextSibling);
        }
        appendEverythingStatus(linkEl, results) {
            const span = document.createElement('span');
            span.style.marginLeft = '6px';
            span.style.cursor = 'help';
            span.style.color = results.length > 0 ? ' #28a745' : ' #dc3545';
            span.style.fontWeight = 'bold';
            span.textContent = results.length > 0 ? 'O' : 'X';
            if (results.length > 0) {
                const content = results.join('\n');
                span.addEventListener('mouseenter', (e) => {
                    this.tooltipEl.textContent = content;
                    this.tooltipEl.style.display = 'block';
                    const rect = span.getBoundingClientRect();
                    this.tooltipEl.style.left = `${rect.left}px`;
                    this.tooltipEl.style.top = `${rect.bottom + 5}px`;
                });
                span.addEventListener('mouseleave', () => {
                    this.tooltipEl.style.display = 'none';
                });
            }
            linkEl.parentNode.insertBefore(span, linkEl.nextSibling);
        }
        processFileLink(link) {
            if (this.processedLinks.has(link)) return;
            this.processedLinks.add(link);
            const filename = link.textContent.trim();
            const evKeyword = TitleExtractor.extractEverythingKeyword(filename);
            if (!evKeyword) return;
            // 1. Everything 로컬 검색 (모든 파일 대상)
            this.searchEverything(evKeyword, (evResults) => {
                this.appendEverythingStatus(link, evResults);
                // 2. 유효 확장자일 경우에만 네이버 시리즈 검색
                if (this.isFilteredFile(link)) {
                    const naverKeywords = TitleExtractor.extractKeywords(filename);
                    if (naverKeywords.length > 0) {
                        const naverUrl = TitleExtractor.createSearchUrl(naverKeywords);
                        this.searchNaverSeries(naverUrl, (nResults) => {
                            this.appendSearchResult(link, nResults.length > 0 ? nResults[0] : null);
                        });
                    }
                }
            });
        }
        processAllLinks() {
            this.panelElements = document.querySelectorAll('.panel.panel-default');
            if (this.panelElements.length === 0) return;
            for (const panel of this.panelElements) {
                const fileLinks = panel.querySelectorAll('a.fr-file');
                fileLinks.forEach(link => {
                    if (this.isFilteredFile(link) || link.textContent.trim().length > 0) {
                        this.processFileLink(link);
                    }
                });
            }
        }
        init() {
            const run = () => this.processAllLinks();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', run);
            } else {
                run();
            }
            let observerTimer;
            const observer = new MutationObserver(() => {
                clearTimeout(observerTimer);
                observerTimer = setTimeout(() => this.processAllLinks(), 500);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }
    const processor = new FileLinksProcessor();
    processor.init();
})();