// UI 헬퍼 함수들
import { MISSIONS } from './firebase-config.js';

// 날짜 정보 가져오기 (한국 시간 기준)
export function getDatesInfo() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000));
    const todayStr = kstDate.toISOString().split('T')[0];
    const yesDate = new Date(kstDate.getTime() - (24 * 60 * 60 * 1000));
    const yesterdayStr = yesDate.toISOString().split('T')[0];
    const dayOfWeek = kstDate.getDay(); 
    const diffToMon = kstDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(kstDate.setDate(diffToMon));
    let weekStrs = [];
    let tempDate = new Date(monday);
    for(let i=0; i<7; i++) {
        weekStrs.push(new Date(tempDate).toISOString().split('T')[0]);
        tempDate.setDate(tempDate.getDate() + 1);
    }
    return { todayStr, yesterdayStr, weekStrs };
}

// 토스트 메시지 표시
export function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "show";
    setTimeout(() => { 
        toast.className = toast.className.replace("show", ""); 
    }, 3500);
}

// 라이트박스 열기
export function openLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-modal').style.display = 'flex';
}

// 탭 전환
export function openTab(tabName, pushState = true) {
    // 이 함수는 많은 전역 변수와 상태에 의존하므로 
    // 현재는 index.html에 남겨두는 것이 안전
}

// 날짜 변경
export function changeDateTo(dStr) {
    document.getElementById('selected-date').value = dStr;
    // loadDataForSelectedDate 함수는 data-manager에 있어야 함
    window.scrollTo(0,0);
}
