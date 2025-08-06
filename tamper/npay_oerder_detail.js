// ==UserScript==
// @name         네이버페이 주문 상세내역 복사
// @namespace    http://www.hwh.kr/
// @version      1.0
// @description  네이버페이 주문 상세 페이지에서 주문 내역을 마크다운으로 복사하는 버튼을 추가합니다.
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
	 * @description HTML 문서에서 특정 텍스트를 가진 버튼 요소를 찾습니다.
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

	function extractOrderDetails(html) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const orderItems = [];
		const contentDiv = doc.getElementById('content');

		if (!contentDiv) {
			console.error('ID가 "content"인 DIV를 찾을 수 없습니다.');
			return [];
		}

		const productInfoDiv = contentDiv.querySelector('.ProductInfoSection_product-item__dipCB');
		if (productInfoDiv) {
			const item_name = productInfoDiv.querySelector('.ProductDetail_name__KnKyo').textContent.trim();
			const urlEl = productInfoDiv.querySelector('.ProductDetail_article__J6Izl a');
			const url = urlEl && urlEl.href ? new URLSearchParams(urlEl.href).get('retUrl') : '정보 없음';
			const count = parseInt(productInfoDiv.querySelector('.ProductDetail_highlight__-5Etn').textContent, 10);
			const single_price = productInfoDiv.querySelector('.ProductDetail_deleted__bSH1G').textContent.trim();

			let sale_price = '0원';
			let used_points = '0원';
			let delivery_fee = '0원';
			let total_price = '0원';

			const dls = contentDiv.querySelectorAll('dl');
			dls.forEach(dl => {
				const dtText = dl.querySelector('dt span')?.textContent.trim();
				const ddText = dl.querySelector('dd')?.textContent.trim();
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

			const decodedUrl = url !== '정보 없음' ? decodeURIComponent(url) : url;
			orderItems.push(new OrderItem(item_name, decodedUrl, count, single_price, sale_price, used_points, delivery_fee, total_price));
		}
		return orderItems;
	}

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

	function createCopyButton(receiptButton) {
		const copyButton = document.createElement('button');
		copyButton.textContent = '복사';
		copyButton.style.cssText = `
			font-size: 16px;
			font-weight: 700;
			padding: 10px 15px;
			border-radius: 6px;
			background-color: #03c75a;
			color: #fff;
			border: none;
			cursor: pointer;
			margin-left: 10px;
		`;

		copyButton.addEventListener('click', async () => {
			const contentDiv = document.getElementById('content');
			if (contentDiv) {
				const orderDetails = extractOrderDetails(contentDiv.outerHTML);
				if (orderDetails.length > 0) {
					const markdownOutput = generateMarkdown(orderDetails);
					GM_setClipboard(markdownOutput, 'text');
					alert('주문 상세내역이 클립보드에 복사되었습니다.');
				} else {
					alert('주문 상세내역을 찾을 수 없습니다.');
				}
			} else {
				alert('HTML 소스에서 "content" 요소를 찾을 수 없습니다.');
			}
		});

		receiptButton.parentNode.insertBefore(copyButton, receiptButton.nextSibling);
	}

	setTimeout(() => {
		const receiptButton = findButton('영수증');
		if (receiptButton) {
			createCopyButton(receiptButton);
			console.log('네이버페이 주문 상세내역 복사 버튼이 추가되었습니다.');
		} else {
			console.log('영수증 버튼을 찾을 수 없습니다. 복사 버튼을 추가하지 않습니다.');
		}
	}, 1000);
})();