// 인증 관리 모듈
import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from './ui-helpers.js';
import { getDatesInfo } from './ui-helpers.js';

// 구글 로그인
export function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) {
        console.error('로그인 버튼을 찾을 수 없습니다.');
        return;
    }
    
    loginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider).catch(error => {
            console.error('로그인 오류:', error);
            let errorMsg = '로그인에 실패했습니다.';
            if (error.code === 'auth/popup-closed-by-user') {
                errorMsg = '로그인 창이 닫혔습니다.';
            } else if (error.code === 'auth/popup-blocked') {
                errorMsg = '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
            }
            showToast(`⚠️ ${errorMsg}`);
        });
    });
}

// 피드백 숨기기
export function hideFeedback() {
    document.getElementById('admin-feedback-box').style.display = 'none';
    const user = auth.currentUser;
    if(user) localStorage.setItem('hide_fb_' + user.uid, 'true');
}

// 인증 상태 변경 리스너
export function setupAuthListener(callbacks) {
    const { todayStr } = getDatesInfo();
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('point-badge-ui').style.display = 'block';
            document.getElementById('date-ui').style.display = 'flex';
            document.getElementById('user-greeting').innerText = `☀️ ${user.displayName}`;
            
            // 알림 권한 요청 및 리스너 설정 (전역 함수 사용)
            if (window.requestNotificationPermission) {
                window.requestNotificationPermission();
            }
            if (window.setupReactionListener) {
                window.setupReactionListener(user.uid);
            }
            
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
            
            // Firebase 리스너 정리
            if (window.reactionListenerUnsubscribe) {
                window.reactionListenerUnsubscribe();
                window.reactionListenerUnsubscribe = null;
            }
            
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
