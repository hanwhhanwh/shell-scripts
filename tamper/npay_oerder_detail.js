// ==UserScript==
// @name         네이버페이 주문 상세내역 복사
// @namespace    http://www.hwh.kr/
// @version      1.0
// @description  네이버페이 주문 상세 페이지에서 주문 상세내역을 마크다운 형식으로 클립보드에 복사합니다.
// @author       hbesthee@naver.com
// @match        https://orders.pay.naver.com/order/status/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
	/** Start script */
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');

	'use strict';

	/**
	 * 주문 상품 정보를 담을 클래스
	 * @class
	 */
	class OrderItem {
		constructor(item_name, url, count, single_price, sale_price, used_points, delivery_fee, total_price) {
			this.item_name = item_name;
			this.url = url;
			this.count = count;
			this.single_price = single_price;
			this.sale_price = sale_price;
			this.used_points = used_points;
			this.delivery_fee = delivery_fee;
			this.total_price = total_price;
		}
	}


	/**
	 * 특정 텍스트를 가진 버튼 요소를 찾습니다.
	 * @param {string} buttonText - 찾고자 하는 버튼의 텍스트
	 * @returns {HTMLButtonElement | null} - 찾은 버튼 요소 또는 찾지 못했을 경우 null
	 */
	function findButton(buttonText) {
		const buttons = document.querySelectorAll('button');
		for (const button of buttons) {
			if (button.textContent.trim() === buttonText) {
				return button;
			}
		}
		return null;
	}


	/**
	 * HTML에서 주문 상세내역을 추출하는 함수
	 * @param {string} html - 전체 HTML 소스
	 * @returns {OrderItem[]} - 추출된 OrderItem 객체 목록
	 */
	function extractOrderDetails(html) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const orderItems = [];
		const contentDiv = doc.getElementById('content');

		if (!contentDiv) {
			console.error('ID가 "content"인 DIV를 찾을 수 없습니다.');
			return [];
		}

		// 개별 상품 정보 추출 (div 기반)
		const productInfoDiv = contentDiv.querySelector('.ProductInfoSection_product-item__dipCB');
		if (productInfoDiv) {
			const item_name = productInfoDiv.querySelector('.ProductDetail_name__KnKyo').textContent.trim();
			const urlEl = productInfoDiv.querySelector('.ProductDetail_article__J6Izl a');
			const url = urlEl && urlEl.href ? new URLSearchParams(urlEl.href).get('retUrl') : '정보 없음';
			const count = parseInt(productInfoDiv.querySelector('.ProductDetail_highlight__-5Etn').textContent, 10);
			const single_price = productInfoDiv.querySelector('.ProductDetail_deleted__bSH1G').textContent.trim();
			const decodedUrl = url !== '정보 없음' ? decodeURIComponent(url) : url;

			// 요약 정보 추출 (DL 및 Summary_item-detail 클래스 기반)
			let sale_price = '0원';
			let used_points = '0원';
			let delivery_fee = '0원';
			let total_price = '0원';

			const summaryItems = contentDiv.querySelectorAll('dl, [class*="Summary_item-detail"]');
			summaryItems.forEach(item => {
				const dtText = item.querySelector('dt span')?.textContent.trim() || item.querySelector('dt')?.textContent.trim();
				const ddText = item.querySelector('dd')?.textContent.trim();
				if (!dtText || !ddText) return;

				if (dtText.includes('쿠폰할인')) {
					sale_price = ddText;
				} else if (dtText.includes('네이버페이 포인트 사용')) {
					used_points = ddText;
				} else if (dtText.includes('배송비')) {
					delivery_fee = ddText;
				} else if (dtText.includes('카드 간편결제')) {
					total_price = ddText;
				}
			});

			orderItems.push(new OrderItem(item_name, decodedUrl, count, single_price, sale_price, used_points, delivery_fee, total_price));
		}

		return orderItems;
	}


	/**
	 * OrderItem 목록을 마크다운 문자열로 변환하는 함수
	 * @param {OrderItem[]} items - OrderItem 객체 목록
	 * @returns {string} - 마크다운 형식의 문자열
	 */
	function generateMarkdown(items) {
		let markdownString = '## 주문 상세내역 요약\n\n';
		markdownString += '------------------\n\n';

		items.forEach((item, index) => {
			markdownString += `### 상품 ${index + 1}\n\n`;
			markdownString += `- 상품명: **[${item.item_name}](${item.url})**\n`;
			markdownString += `- 수량: ${item.count}개\n`;
			markdownString += `- 단가: ${item.single_price}\n`;
			markdownString += `- 할인가격: ${item.sale_price}\n`;
			markdownString += `- 사용 포인트: ${item.used_points}\n`;
			markdownString += `- 배송비: ${item.delivery_fee}\n`;
			markdownString += `- 최종 결제 금액: ${item.total_price}\n\n`;
		});

		markdownString += '------------------\n\n';
		markdownString += '※ 위 내용은 첨부된 HTML 파일에서 추출되었습니다.';

		return markdownString;
	}


	/**
	 * 페이지 로드 후 실행되는 메인 함수
	 */
	function main() {
		// "영수증" 버튼 찾기
		const receiptButton = findButton('영수증');

		if (receiptButton) {
			// "복사" 버튼 생성 및 스타일 복제
			const copyButton = receiptButton.cloneNode(true);
			copyButton.textContent = '복사';
			copyButton.style.marginLeft = '8px'; // 영수증 버튼과의 간격 조정

			// 클릭 이벤트 리스너 추가
			copyButton.addEventListener('click', () => {
				const htmlSource = document.getElementById('content')?.outerHTML || '';
				if (!htmlSource) {
					console.error('HTML 소스를 찾을 수 없습니다. "content" ID를 가진 요소가 있는지 확인해주세요.');
					return;
				}

				const orderDetails = extractOrderDetails(htmlSource);
				if (orderDetails.length > 0) {
					const markdownOutput = generateMarkdown(orderDetails);

					// 클립보드에 복사
					GM_setClipboard(markdownOutput, 'text/plain');
					alert('주문 상세내역이 클립보드에 복사되었습니다.');
					console.log(markdownOutput);
				}
			});

			// "영수증" 버튼 뒤에 "복사" 버튼 삽입
			receiptButton.parentNode.insertBefore(copyButton, receiptButton.nextSibling);
			console.log('복사 버튼이 추가되었습니다.');
		} else {
			console.log('영수증 버튼을 찾을 수 없습니다.');
		}
	}

	// window.addEventListener('load', main);

	setTimeout(() => {
		main();
	}, 1000);
})();