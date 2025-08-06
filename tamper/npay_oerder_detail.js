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
		/**
		 * @param {string} item_name - 상품명
		 * @param {string} url - 상품 주소
		 * @param {number} count - 수량
		 * @param {string} single_price - 상품금액 (할인 전)
		 * @param {string} sale_price - 쿠폰할인
		 * @param {string} used_points - 네이버페이 포인트 사용
		 * @param {string} delivery_fee - 배송비
		 * @param {string} total_price - 최종 결제 금액 (카드 간편결제)
		 */
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
	 * HTML 문서에서 특정 텍스트를 가진 버튼 요소를 찾습니다.
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
	 * @returns {OrderItem[]} - 추출된 OrderItem 객체 목록
	 */
	function extractOrderDetails() {
		const orderItems = [];
		const contentDiv = document.getElementById('content');

		if (!contentDiv) {
			console.error('ID가 "content"인 DIV를 찾을 수 없습니다.');
			return [];
		}

		const productInfoDiv = contentDiv.querySelector('.ProductInfoSection_product-item__dipCB');

		if (productInfoDiv) {
			const getElementText = (selector, elementName) => {
				const element = productInfoDiv.querySelector(selector);
				if (!element) {
					console.warn(`[상품정보] ${elementName} 요소를 찾을 수 없습니다.`);
					return '';
				}
				return element.textContent.trim();
			};

			const getElementHref = (selector, elementName) => {
				const element = productInfoDiv.querySelector(selector);
				if (!element) {
					console.warn(`[상품정보] ${elementName} 요소를 찾을 수 없습니다.`);
					return '';
				}
				const href = element.href;
				if (!href) {
					console.warn(`[상품정보] ${elementName} 요소에 href 속성이 없습니다.`);
					return '';
				}
				const urlParams = new URLSearchParams(href);
				const retUrl = urlParams.get('retUrl');
				return retUrl ? decodeURIComponent(retUrl) : '';
			};

			const item_name = getElementText('.ProductDetail_name__KnKyo', '상품명');
			const url = getElementHref('.ProductDetail_article__J6Izl a', '상품 주소');
			const countStr = getElementText('.ProductDetail_highlight__-5Etn', '수량');
			const count = parseInt(countStr.replace('개', ''), 10) || 0;
			let single_price = getElementText('.ProductDetail_deleted__bSH1G', '단가');

			// 결제 요약 정보 추출 (DL, DIV 모두 탐색)
			let sale_price = '0원';
			let used_points = '0원';
			let delivery_fee = '0원';
			let total_price = '0원';

			const dlElements = contentDiv.querySelectorAll('dl');
			dlElements.forEach(container => {
				const dtElement = container.querySelector('dt');
				const ddElement = container.querySelector('dd');

				if (!dtElement || !ddElement) return;

				const dtText = dtElement.textContent.trim();
				const ddText = ddElement.textContent.trim();

				if (dtText.includes('쿠폰할인')) {
					sale_price = ddText;
				} else if (dtText.includes('네이버페이 포인트 사용')) {
					used_points = ddText;
				} else if (dtText.includes('배송비')) {
					delivery_fee = ddText;
				} else if (dtText.includes('카드 간편결제')) {
					total_price = ddText;
				} else if (dtText.includes('상품금액')) {
					single_price = ddText;
				}
			});

			const summaryElements = contentDiv.querySelectorAll('div[class^="SubSummary_article"] > div[class^="SubSummary_item-detail"]');
			summaryElements.forEach(container => {
				const dtElement = container.querySelector('dt');
				const ddElement = container.querySelector('dd');

				if (!dtElement || !ddElement) return;

				const dtText = dtElement.textContent.trim();
				const ddText = ddElement.textContent.trim();

				if (dtText.includes('쿠폰할인')) {
					sale_price = ddText;
				} else if (dtText.includes('네이버페이 포인트 사용')) {
					used_points = ddText;
				} else if (dtText.includes('배송비')) {
					delivery_fee = ddText;
				} else if (dtText.includes('카드 간편결제')) {
					total_price = ddText;
				} else if (dtText.includes('상품금액')) {
					single_price = ddText;
				}
			});

			orderItems.push(new OrderItem(
				item_name || '정보 없음',
				url || '정보 없음',
				count,
				single_price || '0원',
				sale_price,
				used_points,
				delivery_fee,
				total_price
			));
		}

		return orderItems;
	}


	/**
	 * OrderItem 목록을 마크다운 문자열로 변환하는 함수
	 * @param {OrderItem[]} items - OrderItem 객체 목록
	 * @returns {string} - 마크다운 형식의 문자열
	 */
	function generateMarkdown(items) {
		const date = new Date();
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하므로 1을 더합니다.
		const day = String(date.getDate()).padStart(2, '0');
		const formattedDate = `${year}-${month}-${day}`;

		let markdownString = "\n\n";

		if (items.length === 0) {
			console.log('주문 상세내역을 찾을 수 없습니다.');
			return;
		} else {
			let order_no = '';
			let total_price = 0;
			markdownString += `## ${formattedDate} : 네이버샵() : ${total_price} (네이버페이 ; 신한더모아) ; \n\n`;
			markdownString += `|_. 주문번호 |_. 상품 |_. 단가 |_. 수량 |_. 할인금액 |_. 포인트 |_. 배송비 |_. 결제금액 |\n`;
			items.forEach((item, index) => {
				markdownString += `| "${order_no}":https://order.pay.naver.com/orderStatus/${order_no} `;
				markdownString += `| [${item.item_name}](${item.url}) `;
				markdownString += `| ${item.single_price} `;
				markdownString += `| ${item.count} `;
				markdownString += `| ${item.sale_price} `;
				markdownString += `| ${item.used_points} `;
				markdownString += `| ${item.delivery_fee} `;
				markdownString += `| ${item.total_price} `;
				markdownString += ` |\n`;
			});
		}

		return markdownString;
	}


	/**
	 * 메인 함수: 페이지 로드 후 실행
	 */
	function main() {
		const receiptButton = findButton('영수증');

		if (receiptButton) {
			const copyButton = document.createElement('button');
			copyButton.textContent = '복사';
			copyButton.style.cssText = receiptButton.style.cssText;
			copyButton.style.marginLeft = '10px';
			copyButton.className = receiptButton.className;

			receiptButton.parentElement.insertBefore(copyButton, receiptButton.nextSibling);

			copyButton.addEventListener('click', async () => {
				const orderDetails = extractOrderDetails();
				if (orderDetails.length > 0) {
					const markdownOutput = generateMarkdown(orderDetails);
					console.log(markdownOutput);

					try {
						GM_setClipboard(markdownOutput);
						alert('마크다운 요약 내용이 클립보드에 복사되었습니다.');
					} catch (err) {
						console.error('클립보드 복사 실패:', err);
						alert('클립보드 복사에 실패했습니다.');
					}
				} else {
					alert('추출할 주문 상세내역이 없습니다.');
				}
			});
		}
	}

	// window.addEventListener('load', main);

	setTimeout(() => {
		main();
	}, 1000);
})();