// ==UserScript==
// @name         홈플러스 주문상세 내역 복사 스크립트
// @namespace    http://www.hwh.kr/
// @version      1.0
// @description  홈플러스 주문상세 페이지에서 주문상세 내역을 마크다운 형식으로 클립보드에 복사합니다.
// @author       hbesthee@naver.com
// @match        https://mfront.homeplus.co.kr/mypage/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
	/** Start script */
	console.log('%cStart ' + GM_info.script.name + ', v' + GM_info.script.version + ' by ' + GM_info.script.author, 'color: red');

	'use strict';

	// 주어진 HTML 문자열에서 주문 상세 정보를 추출하고 마크다운 형식으로 변환하는 함수
	function extractAndFormatOrderDetails() {
		// 주문 정보 추출
		const orderInfo = document.querySelector('.orderDetailInfo .orderInfo');
		const orderDate = orderInfo.querySelector('.orderDate strong').textContent.trim().replaceAll('.', '-');
		const orderNumber = orderInfo.querySelector('.orderNum').textContent.replace('주문번호 ', '').trim();

		// 결제 정보 추출
		const paymentInfoWrapper = document.querySelector('.paymentInfoWrapper');
		const finalPayment = paymentInfoWrapper.querySelector('.totPaymentAmt').textContent.trim();

		let totalPayment = '0'; // '상품금액'
		let totalDiscount = '0'; // '총 할인금액'
		const paymentSummaryItems = paymentInfoWrapper.querySelectorAll('.paymentDetailItem');
		for (const item of paymentSummaryItems) {
			const subject = item.querySelector('.subject');
			if (subject && subject.textContent.trim() === '총 주문금액') {
				totalPayment = item.querySelector('.price strong').textContent.trim();
			}
			else if (subject && subject.textContent.trim() === '총 할인금액') {
				totalDiscount = item.querySelector('.price strong').textContent.trim();
			}
		}

		// 결제 수단 추출
		const paymentsWrapper = document.querySelector('.paymentsWrapper');
		let paymentMethod = '';
		if (paymentsWrapper) {
			const homeplusPay = paymentsWrapper.querySelector('.paymentDetail li:first-child');
			const payAmount = homeplusPay.querySelector('.detailPrice').textContent.trim();
			const paySource = homeplusPay.querySelector('p').textContent.trim();
			const cardInfoMatch = paySource.match(/\((.*?)\)/);
			const cardInfo = cardInfoMatch ? cardInfoMatch[1] : '';
			paymentMethod = `${payAmount} (홈플페이 ; ${cardInfo})`;
		}

		// 마이홈플러스포인트 추출
		let myHomeplusPoint = '0'; // 기본값 설정
		const paymentDetailList = paymentsWrapper.querySelectorAll('.paymentDetail li');
		for (const li of paymentDetailList) {
			const title = li.querySelector('.detailTit');
			if (title && title.textContent.trim() === '마이홈플러스포인트') {
				myHomeplusPoint = li.querySelector('.detailPrice').textContent.trim();
				break;
			}
		}

		// 주문 상품 목록 추출
		const productItems = document.querySelectorAll('.productItems .orderItemBoxWrap');
		const products = [];
		productItems.forEach(item => {
			const flag = item.querySelector('.flag').textContent.trim();
			let title = item.querySelector('.title').textContent.trim();
			if (flag) {
				title = `${flag} ${title}`;
			}
			const originalPrice = item.querySelector('.marketPrice small').textContent.trim();
			const salePrice = item.querySelector('.price strong').textContent.trim();
			const quantity = item.querySelector('.count strong').textContent.trim();
			
			products.push({
				name: title,
				originalPrice: originalPrice,
				salePrice: salePrice,
				quantity: quantity
			});
		});

		// 마크다운 표 생성
		let markdown = `\n\n## ${orderDate} : 홈플러스 : ${paymentMethod}\n\n`;
		markdown += `| 주문번호 | 상품금액 | 총 할인금액 | 마이홈플러스포인트 | 최종 결제금액 |\n`;
		markdown += `|---|---:|---:|---:|---:|\n`;
		markdown += `| [${orderNumber}](https://mfront.homeplus.co.kr/mypage/orderdetail?purchaseOrderNo=${orderNumber}) |`;
		markdown += ` ${totalPayment} 원 | -${totalDiscount} 원 | -${myHomeplusPoint} | ${finalPayment} 원 |\n\n`;
		markdown += `| 상품명 | 상품가격 | 구매가격 | 수량 |\n`;
		markdown += `|---|---:|---:|---:|\n`;

		products.forEach(product => {
			markdown += `| ${product.name} | ${product.originalPrice} 원 | ${product.salePrice} 원 | ${product.quantity} |\n`;
		});

		return markdown;
	}
	// window.addEventListener('load', main);


	/** HTML에 버튼을 추가하고 클릭 이벤트를 연결하는 함수 */
	function addCopyButton() {
		// 주문상세 제목을 찾습니다.
		const orderTitle = document.querySelector('.mypage-sub-title');
		if (!orderTitle) {
			console.error("주문상세 제목을 찾을 수 없습니다.");
			return;
		}

		// 버튼을 생성하고 스타일을 추가합니다.
		const copyButton = document.createElement('button');
		copyButton.textContent = '복사';
		copyButton.style.cssText = `
			margin-left: 10px;
			padding: 8px 16px;
			font-size: 14px;
			font-weight: bold;
			color: #fff;
			background-color: #007bff;
			border: none;
			border-radius: 5px;
			cursor: pointer;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
			transition: background-color 0.3s ease;
		`;

		// 마우스 오버 시 색상 변경
		copyButton.onmouseover = function() {
			this.style.backgroundColor = '#0056b3';
		};

		copyButton.onmouseout = function() {
			this.style.backgroundColor = '#007bff';
		};

		// 버튼 클릭 이벤트 리스너 추가
		copyButton.addEventListener('click', async () => {
			const fullHTML = document.documentElement.outerHTML;
			const markdownContent = extractAndFormatOrderDetails(fullHTML);

			try {
				await navigator.clipboard.writeText(markdownContent);
				alert('"주문상세" 정보가 클립보드에 복사되었습니다!');
			} catch (err) {
				console.error('클립보드 복사 실패:', err);
				alert('클립보드 복사에 실패했습니다.');
			}
		});

		// '주문상세' 제목 뒤에 버튼을 추가합니다.
		orderTitle.appendChild(copyButton);
	}


	setTimeout(() => {
		addCopyButton();
	}, 1500);
})();