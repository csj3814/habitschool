/**
 * security.js
 * 보안 관련 유틸리티 함수 모듈
 */

/**
 * XSS 방지: HTML 특수 문자 이스케이프
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 안전한 텍스트
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * URL 검증 (Firebase Storage URL만 허용)
 * @param {string} url - 검증할 URL
 * @returns {boolean} 유효한 URL 여부
 */
export function isValidStorageUrl(url) {
    if (!url) return false;
    // Firebase Storage URL 패턴
    const firebasePattern = /^https:\/\/firebasestorage\.googleapis\.com\//;
    // data: URL (Base64) 패턴
    const dataUrlPattern = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
    
    return firebasePattern.test(url) || dataUrlPattern.test(url);
}

/**
 * 입력값 길이 제한 검증
 * @param {string} text - 검증할 텍스트
 * @param {number} maxLength - 최대 길이
 * @returns {string} 잘린 텍스트
 */
export function limitLength(text, maxLength = 500) {
    if (!text) return '';
    return text.substring(0, maxLength);
}

/**
 * 파일 타입 검증 (이미지/비디오만 허용)
 * @param {File} file - 검증할 파일
 * @returns {boolean} 유효한 파일 여부
 */
export function isValidFileType(file) {
    if (!file) return false;
    // 브라우저가 감지한 MIME 타입이 image/* 또는 video/* 이면 허용
    // (모바일 기기별 다양한 코덱/컨테이너 대응: 3gpp, x-m4v, hevc 등)
    if (file.type && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        return true;
    }
    // type이 빈 문자열인 경우 확장자로 판별
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const allowedExts = ['jpg','jpeg','png','gif','webp','heic','heif',
                         'mp4','mov','avi','mkv','webm','3gp','m4v','mpeg'];
    return allowedExts.includes(ext);
}

/**
 * 파일 크기 검증
 * @param {File} file - 검증할 파일
 * @param {number} maxSize - 최대 크기 (바이트)
 * @returns {boolean} 유효한 크기 여부
 */
export function isValidFileSize(file, maxSize) {
    if (!file) return false;
    return file.size <= maxSize;
}

/**
 * 텍스트에서 위험한 패턴 제거
 * @param {string} text - 정제할 텍스트
 * @returns {string} 안전한 텍스트
 */
export function sanitizeText(text) {
    if (!text) return '';
    
    // 스크립트 태그 제거
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // 이벤트 핸들러 제거
    text = text.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    text = text.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
    
    // javascript: 프로토콜 제거
    text = text.replace(/javascript:/gi, '');
    
    return text;
}

/**
 * 날짜 형식 검증 (YYYY-MM-DD)
 * @param {string} dateStr - 검증할 날짜 문자열
 * @returns {boolean} 유효한 날짜 여부
 */
export function isValidDate(dateStr) {
    if (!dateStr) return false;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(dateStr)) return false;
    
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

/**
 * 숫자 입력값 검증
 * @param {string|number} value - 검증할 값
 * @param {number} min - 최소값
 * @param {number} max - 최대값
 * @returns {boolean} 유효한 숫자 여부
 */
export function isValidNumber(value, min = 0, max = 10000) {
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    return num >= min && num <= max;
}

/**
 * 사용자 ID 검증 (Firebase UID 형식)
 * @param {string} uid - 검증할 사용자 ID
 * @returns {boolean} 유효한 UID 여부
 */
export function isValidUserId(uid) {
    if (!uid) return false;
    // Firebase UID는 일반적으로 28자의 알파벳과 숫자
    return /^[a-zA-Z0-9]{20,128}$/.test(uid);
}

/**
 * Rate limiting을 위한 간단한 캐시
 */
const actionTimestamps = new Map();

/**
 * Rate limiting 체크 (동일 작업을 너무 자주 실행하는 것 방지)
 * @param {string} actionKey - 작업 키
 * @param {number} minInterval - 최소 간격 (밀리초)
 * @returns {boolean} 실행 가능 여부
 */
export function checkRateLimit(actionKey, minInterval = 1000) {
    const now = Date.now();
    const lastTime = actionTimestamps.get(actionKey);
    
    if (lastTime && (now - lastTime) < minInterval) {
        return false; // 너무 빠름
    }
    
    actionTimestamps.set(actionKey, now);
    return true;
}

/**
 * 안전한 JSON 파싱
 * @param {string} jsonString - JSON 문자열
 * @param {*} defaultValue - 파싱 실패 시 기본값
 * @returns {*} 파싱된 객체 또는 기본값
 */
export function safeJsonParse(jsonString, defaultValue = null) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('JSON 파싱 오류:', e);
        return defaultValue;
    }
}
