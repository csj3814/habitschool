/**
 * blockchain-manager.js
 * 클레이튼 블록체인 & Klip 지갑 통합 모듈
 * HBT 토큰 거래, 스테이킹, 챌린지 관리
 */

import { 
    KLAYTN_CONFIG, 
    HBT_TOKEN, 
    STAKING_CONTRACT, 
    CONVERSION_RULES, 
    KLIP_CONFIG 
} from './blockchain-config.js';

import { auth, db } from './firebase-config.js';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showToast } from './ui-helpers.js';

// 🔗 Caver.js 라이브러리 (클레이튼 라이브러리)
// <script src="https://cdn.jsdelivr.net/npm/caver-js@1.9.0/dist/caver.min.js"></script>
// 이 파일은 HTML에서 로드되어야 함

let klipProvider = null;
let caverInstance = null;
let userWalletAddress = null;

/**
 * Klip 지갑 연동 초기화
 * 사용자가 "지갑 연결" 버튼을 클릭하면 호출
 */
export async function connectKlipWallet() {
    try {
        // 1. Klip이 설치되어 있는지 확인
        if (!window.klaytn) {
            showToast('⚠️ Klip 지갑이 필요합니다. 카카오톡에서 "Klip" 앱을 찾아주세요.');
            // 클립 설치 유도
            window.open('https://klipwallet.com', '_blank');
            return null;
        }

        // 2. Klip 지갑과 연동 (사용자 승인)
        const result = await window.klaytn.enable();
        if (!result || result.length === 0) {
            showToast('❌ 지갑 연동 실패. 다시 시도해주세요.');
            return null;
        }

        userWalletAddress = result[0];
        console.log('✅ Klip 지갑 연동됨:', userWalletAddress);

        // 3. Caver.js 초기화
        window.caver = new window.Caver(window.klaytn);
        caverInstance = window.caver;

        // 4. Firebase에 지갑 주소 저장
        const currentUser = auth.currentUser;
        if (currentUser) {
            await updateDoc(doc(db, "users", currentUser.uid), {
                walletAddress: userWalletAddress
            });
            console.log('✅ 지갑 주소 Firebase에 저장됨');
        }

        showToast(`✅ 지갑 연동 완료!\n${userWalletAddress.substring(0, 10)}...`);
        return userWalletAddress;

    } catch (error) {
        console.error('❌ 지갑 연동 오류:', error);
        showToast(`❌ 오류: ${error.message}`);
        return null;
    }
}

/**
 * 포인트를 HBT 토큰으로 변환
 * 1000P → 1 HBT
 * 사용자가 "1000P → HBT 전송" 버튼을 클릭하면 호출
 */
export async function convertPointsToHBT(pointAmount = 1000) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        // 1. 포인트 확인
        if (pointAmount < CONVERSION_RULES.minConversion) {
            showToast(`❌ 최소 ${CONVERSION_RULES.minConversion}P 이상 필요합니다.`);
            return false;
        }

        // 2. 지갑 확인
        if (!userWalletAddress) {
            showToast('⚠️ 먼저 지갑을 연동해주세요. (상단 연동 버튼)');
            return false;
        }

        // 3. Klip 트랜잭션 팝업 (사용자 승인 필수)
        // 실제로는 스마트 컨트랙트의 mint() 함수를 호출
        // 현재 MVP에서는 Firebase만 업데이트 (실제 토큰 발급은 나중에)
        
        showToast('⏳ 변환 중입니다... (약 2-5분)');

        // 4. HBT 발급 (현재는 시뮬레이션)
        const hbtAmount = pointAmount / CONVERSION_RULES.pointsPerConversion;
        
        // Firebase 업데이트
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
            coins: firebase.firestore.FieldValue.increment(-pointAmount), // 포인트 차감
            hbtBalance: firebase.firestore.FieldValue.increment(hbtAmount), // HBT 추가
            totalHbtEarned: firebase.firestore.FieldValue.increment(hbtAmount)
        });

        // 변환 기록 저장
        await addDoc(collection(db, "blockchain_transactions"), {
            userId: currentUser.uid,
            type: 'conversion',
            pointsUsed: pointAmount,
            hbtReceived: hbtAmount,
            timestamp: serverTimestamp(),
            status: 'success',
            walletAddress: userWalletAddress,
            txHash: 'pending_' + Date.now() // 임시 ID
        });

        showToast(`✅ ${pointAmount}P를 ${hbtAmount} HBT로 변환했습니다!\n지갑에 도착합니다.`);
        return true;

    } catch (error) {
        console.error('❌ 변환 오류:', error);
        showToast(`❌ 변환 실패: ${error.message}`);
        return false;
    }
}

/**
 * 30일 챌린지 시작
 * HBT를 스테이킹 컨트랙트에 예치
 */
export async function startChallenge30D(challengeId, hbtAmount = 1) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        // 1. HBT 보유량 확인
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await firebase.firestore.getDoc(userRef);
        const userData = userSnap.data();

        if ((userData.hbtBalance || 0) < hbtAmount) {
            showToast(`❌ HBT가 부족합니다.\n필요: ${hbtAmount}, 보유: ${userData.hbtBalance || 0}`);
            return false;
        }

        // 2. 지갑 확인
        if (!userWalletAddress) {
            showToast('⚠️ 먼저 지갑을 연동해주세요.');
            return false;
        }

        showToast('⏳ 챌린지 시작 중... (Klip 승인 필요)');

        // 3. 스마트 컨트랙트에 stake() 호출 (실제는 Klip에서 거래 서명)
        // 현재 MVP에서는 Firebase만 업데이트
        
        const challengeData = {
            challengeId: challengeId,
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            completedDays: 0,
            hbtStaked: hbtAmount,
            status: 'ongoing',
            rewardHbt: hbtAmount * 1.05, // 5% 이자
            rewardPoints: 50
        };

        // 4. Firebase 업데이트
        await updateDoc(userRef, {
            activeChallenge: challengeData,
            hbtBalance: firebase.firestore.FieldValue.increment(-hbtAmount) // HBT 차감
        });

        // 거래 기록 저장
        await addDoc(collection(db, "blockchain_transactions"), {
            userId: currentUser.uid,
            type: 'staking',
            challengeId: challengeId,
            amount: hbtAmount,
            timestamp: serverTimestamp(),
            status: 'success',
            walletAddress: userWalletAddress
        });

        showToast(`✅ 챌린지 시작!\n${hbtAmount} HBT를 예치했습니다.\n30일 동안 화이팅!`);
        return true;

    } catch (error) {
        console.error('❌ 챌린지 시작 오류:', error);
        showToast(`❌ 오류: ${error.message}`);
        return false;
    }
}

/**
 * 일일 인증 시 챌린지 진행도 업데이트
 * (기존 saveDataBtn 함수에서 호출)
 */
export async function updateChallengeProgress() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await firebase.firestore.getDoc(userRef);
        const userData = userSnap.data();

        const challenge = userData.activeChallenge;
        if (!challenge || challenge.status !== 'ongoing') return;

        // 오늘 인증했는지 확인
        const today = new Date().toISOString().split('T')[0];
        const todayLog = userData.todayLog; // (기존 필드 가정)

        if (todayLog && (todayLog.diet || todayLog.exercise || todayLog.mind)) {
            // 챌린지 카테고리와 맞는지 확인
            const matchesChallenge = 
                (challenge.challengeId.includes('diet') && todayLog.diet) ||
                (challenge.challengeId.includes('exercise') && todayLog.exercise) ||
                (challenge.challengeId.includes('mind') && todayLog.mind);

            if (matchesChallenge) {
                challenge.completedDays += 1;

                // 30일 완료 확인
                if (challenge.completedDays >= 30) {
                    challenge.status = 'completed';
                    
                    // 보상 지급
                    await updateDoc(userRef, {
                        activeChallenge: null,
                        hbtBalance: firebase.firestore.FieldValue.increment(challenge.rewardHbt),
                        coins: firebase.firestore.FieldValue.increment(challenge.rewardPoints),
                        completedChallenges: firebase.firestore.FieldValue.arrayUnion(challenge)
                    });

                    showToast(`🎉 챌린지 완료!\n${challenge.rewardHbt} HBT + ${challenge.rewardPoints}P 받았습니다!`);
                } else {
                    // 진행 중 업데이트
                    await updateDoc(userRef, {
                        activeChallenge: challenge
                    });

                    const remainDays = 30 - challenge.completedDays;
                    showToast(`✅ 챌린지 진행: ${challenge.completedDays}/30일 (${remainDays}일 남음)`);
                }
            }
        }

    } catch (error) {
        console.error('⚠️ 챌린지 진행도 업데이트 오류 (계속 진행):', error);
        // 에러가 발생해도 앱 작동을 방해하지 않음
    }
}

/**
 * 사용자의 지갑 정보 조회
 */
export async function getUserWalletInfo() {
    if (!userWalletAddress) return null;

    // 향후 구현: Klaytn Explorer에서 지갑 잔액 조회
    // const balance = await caverInstance.rpc.call('klay_getBalance', [userWalletAddress, 'latest']);
    
    return {
        address: userWalletAddress,
        // hbtBalance는 Firebase에서 관리
    };
}

/**
 * 현재 연결된 지갑 주소 반환
 */
export function getConnectedWalletAddress() {
    return userWalletAddress;
}

/**
 * 지갑 연결 해제
 */
export function disconnectWallet() {
    userWalletAddress = null;
    caverInstance = null;
    showToast('✅ 지갑이 연결 해제되었습니다.');
}

console.log('✅ 블록체인 매니저 로드됨. (Klip, HBT, Staking)');
