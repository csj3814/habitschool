/**
 * main.js
 * 애플리케이션 진입점 - 모듈 초기화 및 최소한의 전역 노출
 * 대부분의 함수는 app.js에서 직접 import하여 사용
 */

// 인증 모듈 (initializeApp에서 직접 호출)
import { initAuth, setupAuthListener } from './auth.js';

// ========== 인증 초기화를 최우선으로 실행 ==========
function initializeApp() {
    console.log('🚀 애플리케이션 초기화 시작...');
    
    // 인증 초기화 (직접 호출)
    initAuth();
    console.log('✅ 인증 초기화 완료');
    
    // 인증 상태 리스너 설정 (직접 호출)
    setupAuthListener({
        onLogin: (user) => {
            console.log('👤 로그인:', user.displayName);
        },
        onLogout: () => {
            console.log('👋 로그아웃');
        }
    });
    console.log('✅ 인증 리스너 설정 완료');
    
    console.log('✅ 애플리케이션 초기화 완료');
}

// DOM 로드되면 즉시 인증 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ========== 블록체인 모듈은 비동기 로드 (실패해도 인증에 영향 없음) ==========
// 기본 fallback 먼저 설정
window.convertPointsToHBT = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.'); };
window.startChallenge30D = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.'); };
window.fetchOnchainBalance = async () => null;
window.fetchTokenStats = async () => null;

// 비동기로 블록체인 모듈 로드 (then 패턴 — top-level await 미사용)
import('./blockchain-manager.js').then(blockchainModule => {
    window.convertPointsToHBT = blockchainModule.convertPointsToHBT;
    window.startChallenge30D = blockchainModule.startChallenge30D;
    window.fetchOnchainBalance = blockchainModule.fetchOnchainBalance;
    window.fetchTokenStats = blockchainModule.fetchTokenStats;
    console.log('✅ 블록체인 모듈 로드 완료');
}).catch(e => {
    console.warn('⚠️ 블록체인 모듈 로드 실패 (인증은 정상 작동):', e.message);
});

// 챌린지 HBT 예치 % 버튼
window._stakePctAccum = { weekly: 0, master: 0 };
window.addStakePct = function(tier, pct) {
    const hbtText = document.getElementById('asset-hbt-display')?.textContent || '0';
    const balance = parseFloat(hbtText) || 0;
    if (balance <= 0) { alert('❌ 보유 HBT가 없습니다.'); return; }

    if (pct >= 50) {
        window._stakePctAccum[tier] = pct;
    } else {
        window._stakePctAccum[tier] = Math.min(window._stakePctAccum[tier] + pct, 100);
    }
    const amount = Math.round(balance * window._stakePctAccum[tier]) / 100;
    const rounded = Math.round(amount * 100) / 100;
    document.getElementById('stake-' + tier).value = rounded;
    document.getElementById('stake-display-' + tier).textContent = rounded;
};

// cleanupGalleryResources는 app.js에서 window에 설정됨
console.log('✅ 모든 모듈이 로드되었습니다.');