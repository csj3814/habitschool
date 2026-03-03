// 인증 관리 모듈
import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from './ui-helpers.js';
import { getDatesInfo } from './ui-helpers.js';
// blockchain-manager는 동적 import (로드 실패해도 인증에 영향 없음)

// WebView(인앱 브라우저) 감지
function isWebView() {
    const ua = navigator.userAgent || navigator.vendor || '';
    // 주요 인앱 브라우저 패턴
    const webviewPatterns = [
        /KAKAOTALK/i,
        /NAVER\(/i,           // 네이버 앱 (NAVER( 패턴)
        /NAVER/i,             // 네이버 관련 전반
        /NaverMatome/i,
        /FBAN|FBAV/i,         // Facebook
        /FB_IAB/i,            // Facebook In-App Browser
        /Instagram/i,
        /Line\//i,
        /Twitter/i,
        /Snapchat/i,
        /DaumApps/i,          // 다음/카카오 계열
        /everytimeApp/i,
        /BAND\//i,            // 네이버 밴드
        /Whale\//i,           // 네이버 웨일 앱 내 WebView
        /\bwv\b/i,            // Android WebView 플래그
        /;\s*wv\)/i,          // Android WebView (정확한 패턴)
        /WebView/i,
        /GSA\//i,             // Google Search App
        /CriOS.*Mobile/i,     // Chrome iOS (WebView 가능성)
        /\[FB/i,              // Facebook bracket 패턴
    ];
    
    // Safari가 아닌데 iOS인 경우 = WebView일 가능성 높음
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
    if (isIOS && !isSafari && !/Chrome/i.test(ua)) return true;
    
    return webviewPatterns.some(pattern => pattern.test(ua));
}

// 외부 브라우저로 열기 (Android intent, iOS Safari fallback)
function openInExternalBrowser() {
    const currentUrl = window.location.href;
    const ua = navigator.userAgent || '';
    
    if (/android/i.test(ua)) {
        // Android: Chrome intent로 열기
        window.location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
        // iOS: Safari로 열기 시도
        window.location.href = currentUrl;
    } else {
        window.open(currentUrl, '_system');
    }
}

// 구글 로그인
export function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const webviewWarning = document.getElementById('webview-warning');
    
    if (!loginBtn) {
        console.error('로그인 버튼을 찾을 수 없습니다.');
        return;
    }
    
    // WebView 감지 시 경고 표시
    if (isWebView()) {
        loginBtn.style.display = 'none';
        if (webviewWarning) {
            webviewWarning.style.display = 'block';
            const openBrowserBtn = document.getElementById('openExternalBrowser');
            if (openBrowserBtn) {
                openBrowserBtn.addEventListener('click', openInExternalBrowser);
            }
            const copyLinkBtn = document.getElementById('copyLinkBtn');
            if (copyLinkBtn) {
                copyLinkBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                        showToast('✅ 링크가 복사되었습니다. 브라우저에 붙여넣기 해주세요!');
                    }).catch(() => {
                        // clipboard API 실패 시 폴백
                        const textArea = document.createElement('textarea');
                        textArea.value = window.location.href;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        showToast('✅ 링크가 복사되었습니다. 브라우저에 붙여넣기 해주세요!');
                    });
                });
            }
        }
        return;
    }
    
    loginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        
        // 모바일/데스크톱 모두 signInWithPopup 사용
        // (signInWithRedirect는 서드파티 쿠키 차단 정책으로 크로스 오리진 환경에서 실패)
        signInWithPopup(auth, provider).catch(error => {
            console.error('로그인 오류:', error);
            
            // 미감지 WebView 폴백
            if (error.message && (error.message.includes('disallowed_useragent') || error.message.includes('web-storage-unsupported'))) {
                showWebViewWarning();
                return;
            }
            
            let errorMsg = '로그인에 실패했습니다.';
            if (error.code === 'auth/popup-closed-by-user') {
                errorMsg = '로그인 창이 닫혔습니다.';
            } else if (error.code === 'auth/popup-blocked') {
                errorMsg = '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMsg = '이 도메인은 승인되지 않았습니다. 관리자에게 문의하세요.';
            }
            showToast(`⚠️ ${errorMsg}`);
        });
    });
}

// WebView 경고 UI 표시 (폴백용)
function showWebViewWarning() {
    const loginBtn = document.getElementById('loginBtn');
    const webviewWarning = document.getElementById('webview-warning');
    if (loginBtn) loginBtn.style.display = 'none';
    if (webviewWarning) {
        webviewWarning.style.display = 'block';
        const openBrowserBtn = document.getElementById('openExternalBrowser');
        if (openBrowserBtn) {
            openBrowserBtn.addEventListener('click', openInExternalBrowser);
        }
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    showToast('✅ 링크가 복사되었습니다!');
                }).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = window.location.href;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showToast('✅ 링크가 복사되었습니다!');
                });
            });
        }
    }
}

// 인증 상태 변경 리스너
export function setupAuthListener(callbacks) {
    const { todayStr } = getDatesInfo();
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('point-badge-ui').style.display = 'block';
            document.getElementById('date-ui').style.display = 'flex';
            document.getElementById('user-greeting').innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${user.displayName}`;
            
            // 갤러리 알림 요약은 갤러리 탭 진입 시 로드 (push 알림 제거)
            
            const userRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userRef);
            
            if(userDoc.exists()) {
                const ud = userDoc.data();
                if(ud.coins) document.getElementById('point-balance').innerText = ud.coins;
                
                // 관리자 피드백 표시
                if(ud.adminFeedback && ud.feedbackDate) {
                    const fbDate = new Date(ud.feedbackDate);
                    const now = new Date(todayStr);
                    const diffDays = (now - fbDate) / (1000 * 60 * 60 * 24);
                    const isHidden = localStorage.getItem('hide_fb_' + user.uid);
                    
                    if(diffDays <= 3 && !isHidden) {
                        document.getElementById('admin-feedback-box').style.display = 'block';
                        document.getElementById('admin-feedback-text').innerText = ud.adminFeedback;
                    }
                }
                
                // 건강 프로필 로드
                if(ud.healthProfile) {
                    const prof = ud.healthProfile;
                    const profSmm = document.getElementById('prof-smm');
                    const profFat = document.getElementById('prof-fat');
                    const profVisceral = document.getElementById('prof-visceral');
                    const profHba1c = document.getElementById('prof-hba1c');
                    const profMedOther = document.getElementById('prof-med-other');
                    
                    if (profSmm) profSmm.value = prof.smm || '';
                    if (profFat) profFat.value = prof.fat || '';
                    if (profVisceral) profVisceral.value = prof.visceral || '';
                    if (profHba1c) profHba1c.value = prof.hba1c || '';
                    if (profMedOther) profMedOther.value = prof.medOther || '';
                    
                    if(prof.meds) {
                        document.querySelectorAll('input[name="med-chk"]').forEach(chk => {
                            if(prof.meds.includes(chk.value)) chk.checked = true;
                        });
                    }
                }
            }
            
            // 내장형 지갑 자동 초기화 (비동기, 백그라운드 — 동적 import)
            import('./blockchain-manager.js').then(mod => {
                mod.initializeUserWallet().catch(err => {
                    console.error('⚠️ 지갑 초기화 오류 (계속 진행):', err);
                });
            }).catch(err => {
                console.warn('⚠️ 블록체인 모듈 로드 실패 (계속 진행):', err.message);
            });
            
            // 오늘 날짜 데이터 로드
            if (window.loadDataForSelectedDate) {
                window.loadDataForSelectedDate(todayStr);
            }
            
            // 대시보드 탭으로 이동
            if (window.openTab) {
                window.openTab('dashboard', false);
            }
            
            // 콜백 실행
            if (callbacks && callbacks.onLogin) {
                callbacks.onLogin(user);
            }
        } else {
            // 로그아웃 시 모든 리소스 정리 (메모리 누수 방지)
            document.getElementById('login-modal').style.display = 'flex';
            document.getElementById('point-badge-ui').style.display = 'none';
            document.getElementById('date-ui').style.display = 'none';
            
            // 갤러리 리소스 정리
            if (window.cleanupGalleryResources) {
                window.cleanupGalleryResources();
            }
            
            // 갤러리 탭으로 이동
            if (window.openTab) {
                window.openTab('gallery', false);
            }
            
            // 콜백 실행
            if (callbacks && callbacks.onLogout) {
                callbacks.onLogout();
            }
        }
    });
}
