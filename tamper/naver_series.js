// ==UserScript==
// @name         naver_series_mapper
// @namespace    http://hwh.kr/
// @version      v1.2.0
// @date         2025-11-18
// @description  첨부 파일의 네이버 시리즈 점수 + Everything HTTP 로컬 존재 여부 확인 통합
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
    'use strict';
    console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');
    // 툴팁 스타일 (position: fixed로 스크롤 문제 해결)
    GM_addStyle(`
        .ev-popup {
            position: fixed; background:  #fff; border: 1px solid  #aaa; padding: 8px 10px;
            font-size: 12px; line-height: 1.4; z-index: 99999; box-shadow: 0 3px 6px  rgba(0,0,0,0.2);
            max-height: 300px; overflow-y: auto; white-space: pre-wrap; border-radius: 4px;
            display: none; pointer-events: none; word-break: break-all;
        }
        .ev-popup strong { color:  #333; }
        .ev-popup .ev-meta { color:  #666; font-size: 11px; margin-top: 2px; }
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
        static extractEverythingKeyword(filename) {
            let clean = filename.replace(/\[[\d.]+\s*[KMG]?B\]/gi, '').replace(/\.\w+$/, '').trim();
            clean = clean.replace(/\[[^\]]*\]/g, ' ').trim();
            const partNumMatch = clean.match(/^([0-9A-Z]{3,6}-\d{2,5})/);
            if (partNumMatch) return partNumMatch[1];
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
            const rows = doc.querySelectorAll('tr');
            // 테이블 행 기준 파싱 (Name, Path, Size, Date 순서 예상)
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    const name = cells[0].textContent.trim();
                    const size = cells[2].textContent.trim();
                    const date = cells[3].textContent.trim();
                    // 헤더 제외 및 유효한 파일명 필터링
                    if (name && name !== '이름' && name !== 'Name' && !name.includes('Everything')) {
                        results.push({ name, size, date });
                    }
                }
            });
            // 테이블 구조가 아닐 경우 Fallback
            if (results.length === 0) {
                doc.querySelectorAll('a').forEach(link => {
                    const href = link.getAttribute('href') || '';
                    const text = link.textContent.trim();
                    if (text && !href.includes('search=')) {
                        results.push({ name: text, size: '-', date: '-' });
                    }
                });
            }
            return results;
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
            this.scrollHideHandler = this.hideTooltip.bind(this);
        }
        // Everything 검색 대상 파일 여부 확인 (요청 조건 반영)
        shouldProcessForEverything(link) {
            const href = link.getAttribute('href');
            if (!href) return false;
            return href.startsWith('https://attach') || href.includes('filename=');
        }
        // 네이버 시리즈 검색 대상 파일 여부 확인
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
                onload: res => res.status === 200 ? callback(NaverSeriesParser.parseSearchResults(res.responseText)) : callback([]),
                onerror: () => callback([])
            });
        }
        searchEverything(keyword, callback) {
            const url = `http://localhost:3808/?search=${encodeURIComponent(keyword)}`;
            const gmXHR = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlhttpRequest;
            gmXHR({
                method: 'GET', url: url,
                onload: res => res.status === 200 ? callback(EverythingParser.parse(res.responseText)) : callback([]),
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
                const content = results.map(r => 
                    `<strong>${r.name}</strong><div class="ev-meta">크기: ${r.size} | 날짜: ${r.date}</div>`
                ).join('<hr style="margin:4px 0;border:0;border-top:1px solid  #eee;">');
                span.addEventListener('mouseenter', () => {
                    const rect = linkEl.getBoundingClientRect();
                    this.tooltipEl.innerHTML = content;
                    this.tooltipEl.style.display = 'block';
                    // 뷰포트 기준 고정 위치
                    this.tooltipEl.style.left = `${rect.left}px`;
                    this.tooltipEl.style.top = `${rect.bottom + 5}px`;
                    // 스크롤 시 팝업 숨김 (위치 땡겨짐 방지)
                    window.addEventListener('scroll', this.scrollHideHandler, { once: true });
                });
                span.addEventListener('mouseleave', () => {
                    this.tooltipEl.style.display = 'none';
                    window.removeEventListener('scroll', this.scrollHideHandler);
                });
            }
            linkEl.parentNode.insertBefore(span, linkEl.nextSibling);
        }
        hideTooltip() {
            this.tooltipEl.style.display = 'none';
        }
        processFileLink(link) {
            if (this.processedLinks.has(link)) return;
            this.processedLinks.add(link);
            if (!this.shouldProcessForEverything(link)) return;
            const filename = link.textContent.trim();
            const evKeyword = TitleExtractor.extractEverythingKeyword(filename);
            if (!evKeyword) return;
            // 1. Everything 로컬 검색
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
                fileLinks.forEach(link => this.processFileLink(link));
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