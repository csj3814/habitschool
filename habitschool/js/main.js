/**
 * main.js
 * 애플리케이션 진입점 - 모든 모듈을 가져와서 전역으로 노출
 */

// Firebase 및 기본 설정
import { app, auth, db, storage, BADGES, MISSIONS, MAX_IMG_SIZE, MAX_VID_SIZE } from './firebase-config.js';

// 인증 모듈
import { initAuth, setupAuthListener, hideFeedback } from './auth.js';

// UI 헬퍼
import { getDatesInfo, showToast, openLightbox, changeDateTo } from './ui-helpers.js';

// 데이터 관리
import { sanitize, compressImage, uploadFileAndGetUrl, fetchImageAsBase64 } from './data-manager.js';

// 갤러리 모듈
import { 
    loadGalleryData, 
    renderFeedOnly, 
    collectGalleryMedia,
    setupInfiniteScroll,
    cleanupGalleryResources,
    setGalleryFilter,
    cachedGalleryLogs,
    cachedMyFriends
} from './gallery.js';

// 보안 모듈
import { 
    escapeHtml, 
    isValidStorageUrl, 
    limitLength,
    isValidFileType,
    isValidFileSize,
    sanitizeText,
    isValidDate,
    isValidNumber,
    isValidUserId,
    checkRateLimit,
    safeJsonParse
} from './security.js';

// 블록체인 & M2E 모듈
import { 
    KLAYTN_CONFIG, 
    HBT_TOKEN, 
    STAKING_CONTRACT, 
    CONVERSION_RULES, 
    KLIP_CONFIG 
} from './blockchain-config.js';

import { 
    connectKlipWallet,
    convertPointsToHBT,
    startChallenge30D,
    updateChallengeProgress,
    getUserWalletInfo,
    getConnectedWalletAddress,
    disconnectWallet
} from './blockchain-manager.js';

// Firebase 모듈 가져오기
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    signInAnonymously, 
    signOut 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    query, 
    where, 
    orderBy, 
    limit,
    serverTimestamp,
    onSnapshot,
    arrayUnion,
    arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

import { 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

// 전역으로 노출할 항목들 (window 객체에 할당)
window.app = app;
window.auth = auth;
window.db = db;
window.storage = storage;
window.BADGES = BADGES;
window.MISSIONS = MISSIONS;
window.MAX_IMG_SIZE = MAX_IMG_SIZE;
window.MAX_VID_SIZE = MAX_VID_SIZE;

// Firebase 함수들
window.signInWithPopup = signInWithPopup;
window.GoogleAuthProvider = GoogleAuthProvider;
window.signInAnonymously = signInAnonymously;
window.signOut = signOut;
window.collection = collection;
window.doc = doc;
window.getDoc = getDoc;
window.getDocs = getDocs;
window.setDoc = setDoc;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.limit = limit;
window.serverTimestamp = serverTimestamp;
window.onSnapshot = onSnapshot;
window.arrayUnion = arrayUnion;
window.arrayRemove = arrayRemove;
window.ref = ref;
window.uploadBytes = uploadBytes;
window.getDownloadURL = getDownloadURL;

// 인증 함수들
window.initAuth = initAuth;
window.setupAuthListener = setupAuthListener;
window.hideFeedback = hideFeedback;

// UI 헬퍼 함수들
window.getDatesInfo = getDatesInfo;
window.showToast = showToast;
window.openLightbox = openLightbox;
window.changeDateTo = changeDateTo;

// 데이터 관리 함수들
window.sanitize = sanitize;
window.compressImage = compressImage;
window.uploadFileAndGetUrl = uploadFileAndGetUrl;
window.fetchImageAsBase64 = fetchImageAsBase64;

// 갤러리 함수들
window.loadGalleryData = loadGalleryData;
window.renderFeedOnly = renderFeedOnly;
window.collectGalleryMedia = collectGalleryMedia;
window.setupInfiniteScroll = setupInfiniteScroll;
window.cleanupGalleryResources = cleanupGalleryResources;
window.setGalleryFilter = setGalleryFilter;

// 보안 함수들
window.escapeHtml = escapeHtml;
window.isValidStorageUrl = isValidStorageUrl;
window.limitLength = limitLength;
window.isValidFileType = isValidFileType;
window.isValidFileSize = isValidFileSize;
window.sanitizeText = sanitizeText;
window.isValidDate = isValidDate;
window.isValidNumber = isValidNumber;
window.isValidUserId = isValidUserId;
window.checkRateLimit = checkRateLimit;
window.safeJsonParse = safeJsonParse;

// 블록체인 설정 및 함수들
window.KLAYTN_CONFIG = KLAYTN_CONFIG;
window.HBT_TOKEN = HBT_TOKEN;
window.STAKING_CONTRACT = STAKING_CONTRACT;
window.CONVERSION_RULES = CONVERSION_RULES;
window.KLIP_CONFIG = KLIP_CONFIG;

window.connectKlipWallet = connectKlipWallet;
window.convertPointsToHBT = convertPointsToHBT;
window.startChallenge30D = startChallenge30D;
window.updateChallengeProgress = updateChallengeProgress;
window.getUserWalletInfo = getUserWalletInfo;
window.getConnectedWalletAddress = getConnectedWalletAddress;
window.disconnectWallet = disconnectWallet;

// 전역 함수 할당 (index.html에서 사용)
window.requestNotificationPermission = null; // index.html에서 재할당
window.setupReactionListener = null; // index.html에서 재할당

// 모듈 로드 완료 표시
console.log('✅ 모든 모듈이 로드되었습니다.');

// DOM이 로드되면 초기화 함수 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // 이미 로드된 경우 즉시 실행
    initializeApp();
}

function initializeApp() {
    console.log('🚀 애플리케이션 초기화 시작...');
    
    // 인증 초기화
    if (window.initAuth) {
        window.initAuth();
        console.log('✅ 인증 초기화 완료');
    }
    
    // 인증 상태 리스너 설정
    if (window.setupAuthListener) {
        window.setupAuthListener({
            onLogin: (user) => {
                console.log('👤 로그인:', user.displayName);
                // 로그인 후 초기 데이터 로드
                if (window.loadDataForSelectedDate) {
                    const dateInput = document.getElementById('selected-date');
                    if (dateInput && dateInput.value) {
                        window.loadDataForSelectedDate(dateInput.value);
                    }
                }
            },
            onLogout: () => {
                console.log('👋 로그아웃');
            }
        });
        console.log('✅ 인증 리스너 설정 완료');
    }
    
    console.log('✅ 애플리케이션 초기화 완료');
}

