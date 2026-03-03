// UI 헬퍼 함수들
import { MISSIONS } from './firebase-config.js';

// 한국 표준시(KST) 날짜 및 정보 관련 헬퍼
export function getKstDateString() {
    // toLocaleDateString('en-CA')는 YYYY-MM-DD 형식 반환
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export function getKstDateObj() {
    // KST 날짜의 정오(UTC)를 기준으로 Date 객체 생성 (날짜 경계 문제 방지)
    return new Date(getKstDateString() + 'T12:00:00Z');
}

// 날짜 정보 가져오기 (한국 시간 기준)
export function getDatesInfo() {
    const todayStr = getKstDateString();
    const todayNoon = new Date(todayStr + 'T12:00:00Z');
    const yesNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesNoon.toISOString().split('T')[0];
    const dayOfWeek = todayNoon.getUTCDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayNoon = new Date(todayNoon.getTime() + diffToMon * 24 * 60 * 60 * 1000);
    let weekStrs = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(mondayNoon.getTime() + i * 24 * 60 * 60 * 1000);
        weekStrs.push(d.toISOString().split('T')[0]);
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
