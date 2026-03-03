/**
 * blockchain-manager.js
 * Base 체인 블록체인 & 내장형 지갑 통합 모듈
 * HaBit (HBT) 토큰 거래, 스테이킹, 챌린지 관리
 * 
 * 내장형 지갑 전략: Firebase UID 기반 지갑 자동 생성
 * - 사용자가 로그인만 하면 자동으로 지갑 생성
 * - 별도 앱 설치나 복잡한 설정 불필요
 * - ethers.js를 사용하여 Base 체인 호환 지갑 생성
 * 
 * 온체인 연동: Cloud Functions를 통한 실제 스마트 컨트랙트 호출
 */

import { 
    BASE_CONFIG, 
    HBT_TOKEN, 
    STAKING_CONTRACT, 
    CONVERSION_RULES,
    CHALLENGES
} from './blockchain-config.js';

import { auth, db, app } from './firebase-config.js';
import { doc, updateDoc, setDoc, getDoc, collection, addDoc, serverTimestamp, increment } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showToast } from './ui-helpers.js';
import { getKstDateString } from './ui-helpers.js';

// Cloud Function 참조 (lazy 초기화 — import 실패해도 모듈 로드에 영향 없음)
let mintHBTFunction = null;
let getOnchainBalanceFunction = null;
let getTokenStatsFunction = null;
let _functionsInitialized = false;

async function ensureFunctions() {
    if (_functionsInitialized) return;
    try {
        const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
        const functions = getFunctions(app, 'asia-northeast3');
        
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            connectFunctionsEmulator(functions, 'localhost', 5001);
            console.log('🛠️ Functions 에뮬레이터 연결');
        }
        
        mintHBTFunction = httpsCallable(functions, 'mintHBT');
        getOnchainBalanceFunction = httpsCallable(functions, 'getOnchainBalance');
        getTokenStatsFunction = httpsCallable(functions, 'getTokenStats');
        _functionsInitialized = true;
        console.log('✅ Cloud Functions 초기화 완료');
    } catch (e) {
        console.error('⚠️ Cloud Functions 초기화 실패:', e.message);
    }
}

let userWallet = null; // ethers.Wallet 인스턴스
let userWalletAddress = null; // 0x... 주소

// ========== 보안 지갑 관리 (v2) ==========
// 개선 사항:
// - 랜덤 지갑 생성 (UID 파생 X → 탈취 불가)
// - AES-GCM으로 개인키 암호화 후 Firestore 저장
// - PBKDF2 키 파생 (100,000 iterations)

/**
 * 사용자 인증 정보로부터 암호화 키 파생 (PBKDF2)
 * UID만으로는 키를 알 수 없음 (email 필요)
 */
async function deriveEncryptionKey(uid, email) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(uid),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    // 이메일을 salt로 사용 (사용자별 고유)
    const salt = encoder.encode(email + '_hbt_wallet_v2');
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * 개인키 암호화 (AES-GCM)
 */
async function encryptPrivateKey(privateKeyHex, uid, email) {
    const key = await deriveEncryptionKey(uid, email);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(privateKeyHex)
    );
    return {
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

/**
 * 개인키 복호화 (AES-GCM)
 */
async function decryptPrivateKey(encryptedData, iv, uid, email) {
    const key = await deriveEncryptionKey(uid, email);
    const ivArray = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
    const encryptedArray = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivArray },
        key,
        encryptedArray
    );
    return new TextDecoder().decode(decrypted);
}

/**
 * 사용자 지갑 초기화 (로그인 시 자동 호출)
 * v2: 랜덤 지갑 + 암호화 저장
 * @returns {string} 지갑 주소
 */
export async function initializeUserWallet() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn('⚠️ 로그인되지 않음. 지갑 생성 불가.');
            return null;
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        // Case 1: v2 암호화 지갑이 있는 경우 → 복호화하여 복원
        if (userData?.walletVersion === 2 && userData?.encryptedKey && userData?.walletIv) {
            try {
                const privateKeyHex = await decryptPrivateKey(
                    userData.encryptedKey,
                    userData.walletIv,
                    currentUser.uid,
                    currentUser.email
                );
                const wallet = new ethers.Wallet(privateKeyHex);
                userWallet = wallet;
                userWalletAddress = wallet.address;
                console.log('✅ v2 지갑 복원:', userWalletAddress.substring(0, 10) + '...');
                updateWalletUI(userWalletAddress);
                return userWalletAddress;
            } catch (e) {
                console.error('⚠️ v2 지갑 복호화 실패:', e);
                // 주소만이라도 표시
                userWalletAddress = userData.walletAddress;
                updateWalletUI(userWalletAddress);
                return userWalletAddress;
            }
        }

        // Case 2: v1 구형 지갑이 있는 경우 → v2로 마이그레이션
        if (userData?.walletAddress && !userData?.walletVersion) {
            console.log('🔄 v1 → v2 지갑 마이그레이션 중...');
            // 새 랜덤 지갑 생성 (v1 주소는 보안 결함으로 폐기)
            const newWallet = ethers.Wallet.createRandom();
            const { encrypted, iv } = await encryptPrivateKey(
                newWallet.privateKey, currentUser.uid, currentUser.email
            );
            
            userWallet = newWallet;
            userWalletAddress = newWallet.address;

            await updateDoc(userRef, {
                walletAddress: userWalletAddress,
                walletCreatedAt: serverTimestamp(),
                encryptedKey: encrypted,
                walletIv: iv,
                walletVersion: 2,
                oldWalletAddress: userData.walletAddress // 기존 주소 백업
            });

            console.log('✅ v2 지갑 마이그레이션 완료:', userWalletAddress.substring(0, 10) + '...');
            updateWalletUI(userWalletAddress);
            showToast('🔐 지갑 보안이 업그레이드되었습니다!');
            return userWalletAddress;
        }

        // Case 3: 지갑 없음 → 새 v2 지갑 생성
        console.log('🆕 새 보안 지갑 생성 중...');
        const newWallet = ethers.Wallet.createRandom();
        const { encrypted, iv } = await encryptPrivateKey(
            newWallet.privateKey, currentUser.uid, currentUser.email
        );
        
        userWallet = newWallet;
        userWalletAddress = newWallet.address;

        await setDoc(userRef, {
            walletAddress: userWalletAddress,
            walletCreatedAt: serverTimestamp(),
            encryptedKey: encrypted,
            walletIv: iv,
            walletVersion: 2
        }, { merge: true });

        console.log('✅ v2 지갑 생성 완료:', userWalletAddress.substring(0, 10) + '...');
        updateWalletUI(userWalletAddress);
        showToast('✅ 보안 지갑이 생성되었습니다!');
        return userWalletAddress;

    } catch (error) {
        console.error('❌ 지갑 초기화 오류:', error);
        showToast('⚠️ 지갑 생성 중 오류 발생. 다시 시도해주세요.');
        return null;
    }
}

/**
 * 지갑 UI 업데이트
 */
function updateWalletUI(address) {
    const walletDisplay = document.getElementById('wallet-address-display');
    if (walletDisplay && address) {
        walletDisplay.textContent = address.substring(0, 6) + '...' + address.substring(address.length - 4);
        walletDisplay.style.color = '#2E7D32';
    }
}

// ========== 반감기 계산 (비트코인 방식) ==========

/**
 * 누적 채굴량 기반 현재 전환 비율 계산
 * 구간 1: totalMinted < 30M → rate = 1 (1P = 1 HBT)
 * 구간 2: totalMinted < 45M → rate = 0.5 (1P = 0.5 HBT)
 * ... 각 구간 ÷2, 최소 0.01 (100P = 1 HBT)
 * @param {number} totalMinted - 전체 누적 채굴 발행량
 * @returns {number} 현재 전환 비율 (1P당 HBT)
 */
export function getConversionRate(totalMinted = 0) {
    const { era1Threshold, initialRate, minRate } = CONVERSION_RULES.halving;
    let minted = totalMinted;
    let rate = initialRate;
    let threshold = era1Threshold;

    while (minted >= threshold && rate > minRate) {
        minted -= threshold;
        threshold = Math.floor(threshold / 2);
        rate = rate / 2;
        if (threshold < 1) break;
    }

    return Math.max(rate, minRate);
}

/**
 * 반감기를 적용한 HBT 변환량 계산
 * @param {number} pointAmount - 변환할 포인트
 * @param {number} totalMinted - 현재까지 전체 채굴된 HBT (글로벌)
 * @returns {number} 받을 HBT 수량
 */
function calculateHbtWithHalving(pointAmount, totalMinted = 0) {
    // TODO: totalMinted를 글로벌 카운터(Firestore)에서 읽어오기
    // 현재는 사용자 개인 totalHbtEarned로 근사 (Phase 1)
    const rate = getConversionRate(totalMinted);
    const hbtAmount = pointAmount * rate;

    // 일일 한도 체크
    return Math.min(hbtAmount, CONVERSION_RULES.maxConversionPerDay);
}

/**
 * 현재 구간 번호 반환
 * @param {number} totalMinted
 * @returns {number} 구간 번호 (1부터)
 */
export function getCurrentEra(totalMinted = 0) {
    const { era1Threshold } = CONVERSION_RULES.halving;
    let minted = totalMinted;
    let threshold = era1Threshold;
    let era = 1;

    while (minted >= threshold && threshold > 0) {
        minted -= threshold;
        threshold = Math.floor(threshold / 2);
        era++;
    }

    return era;
}

/**
 * 포인트를 HBT 토큰으로 변환 (Cloud Function 경유 온체인 민팅)
 * 구간 1 기준: 100P → 100 HBT (반감기에 따라 변동)
 * @param {number} [pointAmount] - 변환할 포인트 (미입력 시 기존 input에서 읽음)
 */
export async function convertPointsToHBT(pointAmount) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('❌ 로그인이 필요합니다.');
        return false;
    }

    // 인자로 받은 값 우선, 없으면 input에서 읽기
    if (typeof pointAmount !== 'number' || isNaN(pointAmount)) {
        const pointInput = document.getElementById('conversion-points');
        pointAmount = parseInt(pointInput?.value || 0);
    }

    if (pointAmount < CONVERSION_RULES.minConversion) {
        showToast(`❌ 최소 ${CONVERSION_RULES.minConversion}P 이상 필요합니다.`);
        return false;
    }

    if (pointAmount % 100 !== 0) {
        showToast('❌ 100P 단위로만 변환 가능합니다.');
        return false;
    }

    // 1차 시도: Cloud Function (온체인 민팅)
    try {
        await ensureFunctions();
        if (mintHBTFunction && userWalletAddress) {
            showToast('⏳ HBT 변환 중입니다...');

            const result = await mintHBTFunction({ pointAmount });
            const data = result.data;

            if (data.success) {
                showToast(`✅ ${data.pointsUsed}P → ${data.hbtReceived} HBT 변환 완료!`);
                if (data.txHash) {
                    console.log(`🔍 TX: ${data.explorerUrl}`);
                }
            }

            window.updateAssetDisplay && window.updateAssetDisplay();
            return true;
        }
    } catch (onchainError) {
        console.warn('⚠️ 온체인 변환 실패, 오프체인 폴백 실행:', onchainError.message);
    }

    // 2차 폴백: 오프체인 Firestore 직접 업데이트
    try {
        showToast('⏳ HBT 변환 처리 중...');

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            showToast('❌ 사용자 정보를 찾을 수 없습니다.');
            return false;
        }

        const userData = userSnap.data();
        const currentCoins = userData.coins || 0;

        if (currentCoins < pointAmount) {
            showToast(`❌ 포인트가 부족합니다. 보유: ${currentCoins}P`);
            return false;
        }

        // 반감기 적용 HBT 계산
        const totalMinted = userData.totalHbtEarned || 0;
        const rate = getConversionRate(totalMinted);
        const hbtAmount = pointAmount * rate;
        const era = getCurrentEra(totalMinted);

        // 일일 변환 한도 확인
        const today = getKstDateString();
        const dailyConverted = userData.dailyConvertedHbt?.[today] || 0;
        if (dailyConverted + hbtAmount > CONVERSION_RULES.maxConversionPerDay) {
            showToast(`❌ 일일 변환 한도 초과 (오늘: ${dailyConverted} HBT, 한도: ${CONVERSION_RULES.maxConversionPerDay} HBT)`);
            return false;
        }

        // Firestore 원자적 업데이트 (포인트 차감 + HBT 추가)
        await updateDoc(userRef, {
            coins: increment(-pointAmount),
            hbtBalance: increment(hbtAmount),
            totalHbtEarned: increment(hbtAmount),
            [`dailyConvertedHbt.${today}`]: increment(hbtAmount)
        });

        showToast(`✅ ${pointAmount}P → ${hbtAmount} HBT 변환 완료! (${eraLabel(era)}구간)`);

        window.updateAssetDisplay && window.updateAssetDisplay();
        return true;

    } catch (error) {
        console.error('❌ 변환 오류:', error);
        showToast(`❌ 변환에 실패했습니다. 잠시 후 다시 시도해주세요.`);
        return false;
    }
}

// 구간 번호 → 알파벳 라벨
function eraLabel(era) {
    return String.fromCharCode(64 + Math.min(era, 26));
}

/**
 * 범용 챌린지 시작 (3일 / 7일 / 30일)
 * 동시 진행 지원: 티어(mini/weekly/master)별 1개씩 동시 진행 가능
 * - 3일: HBT 예치 없음, 포인트만 보상
 * - 7일: 소량 HBT 예치, 포인트 보상
 * - 30일: HBT 예치, 80%+ 원금 환급, 100% +20% 보너스
 */
export async function startChallenge30D(challengeId) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        const challengeDef = CHALLENGES[challengeId];
        if (!challengeDef) {
            showToast('❌ 알 수 없는 챌린지입니다.');
            return false;
        }
        const duration = challengeDef.duration || 30;
        const minStake = challengeDef.hbtStake || 0;
        const tier = challengeDef.tier || 'master';

        // 티어별 인라인 입력에서 예치량 읽기
        let hbtAmount = 0;
        if (duration > 3) {
            const stakeInput = document.getElementById('stake-' + tier);
            hbtAmount = parseFloat(stakeInput?.value || 0);
            if (!hbtAmount || hbtAmount < minStake) {
                showToast(`❌ 최소 ${minStake} HBT 이상 예치해야 합니다.`);
                return false;
            }
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        if (hbtAmount > 0 && (userData.hbtBalance || 0) < hbtAmount) {
            showToast(`❌ HBT가 부족합니다.\n필요: ${hbtAmount} HBT, 보유: ${userData.hbtBalance || 0} HBT`);
            return false;
        }

        // 같은 티어에 진행 중인 챌린지 확인 (다른 티어는 동시 진행 가능!)
        const activeChallenges = userData.activeChallenges || {};
        // legacy 마이그레이션
        if (userData.activeChallenge && userData.activeChallenge.status === 'ongoing') {
            const legacyTier = CHALLENGES[userData.activeChallenge.challengeId]?.tier || 'master';
            if (!activeChallenges[legacyTier]) activeChallenges[legacyTier] = userData.activeChallenge;
        }
        
        if (activeChallenges[tier] && activeChallenges[tier].status === 'ongoing') {
            const tierNames = { mini: '3일 미니', weekly: '7일 위클리', master: '30일 마스터' };
            showToast(`⚠️ 이미 ${tierNames[tier]} 챌린지가 진행 중입니다.\n완료 후 새로 시작할 수 있습니다.`);
            return false;
        }

        if (hbtAmount > 0 && !userWalletAddress) {
            showToast('⚠️ 지갑을 찾을 수 없습니다. 다시 로그인해주세요.');
            return false;
        }

        showToast(`⏳ ${duration}일 챌린지 시작 중...`);

        const startDate = getKstDateString();
        const endDateObj = new Date(startDate + 'T12:00:00Z');
        endDateObj.setUTCDate(endDateObj.getUTCDate() + duration);
        const endDate = endDateObj.toISOString().split('T')[0];

        // 오늘 이미 인증한 데이터가 있으면 1일 인정
        let initialCompletedDays = 0;
        let initialCompletedDates = [];
        try {
            const todayLogId = `${currentUser.uid}_${startDate}`;
            const todayLogSnap = await getDoc(doc(db, "daily_logs", todayLogId));
            if (todayLogSnap.exists()) {
                const todayData = todayLogSnap.data();
                const ap = todayData.awardedPoints || {};
                const category = challengeDef.category;
                let todayCounted = false;
                if (category === 'diet' && ap.diet) todayCounted = true;
                else if (category === 'exercise' && ap.exercise) todayCounted = true;
                else if (category === 'mind' && ap.mind) todayCounted = true;
                else if (category === 'all' && ap.diet && ap.exercise && ap.mind) todayCounted = true;
                if (todayCounted) {
                    initialCompletedDays = 1;
                    initialCompletedDates = [startDate];
                }
            }
        } catch (e) {
            console.warn('오늘 인증 데이터 확인 실패 (무시):', e.message);
        }

        const challengeData = {
            challengeId: challengeId,
            startDate: startDate,
            endDate: endDate,
            completedDays: initialCompletedDays,
            completedDates: initialCompletedDates,
            totalDays: duration,
            hbtStaked: hbtAmount,
            status: 'ongoing',
            tier: tier
        };

        // Firebase 업데이트 (티어별 저장)
        const updateData = {};
        updateData[`activeChallenges.${tier}`] = challengeData;
        if (userData.activeChallenge) updateData.activeChallenge = null;
        if (hbtAmount > 0) {
            updateData.hbtBalance = increment(-hbtAmount);
        }
        await updateDoc(userRef, updateData);

        if (hbtAmount > 0) {
            showToast(`✅ ${duration}일 챌린지 시작!\n${hbtAmount} HBT 예치 완료.${initialCompletedDays > 0 ? '\n📌 오늘 인증분 1일 반영!' : ''}\n80%+ 달성 시 원금 환급, 100% 달성 시 +20% 보너스!`);
        } else {
            showToast(`✅ ${duration}일 챌린지 시작!${initialCompletedDays > 0 ? '\n📌 오늘 인증분 1일 반영!' : ''}\n${duration}일 동안 매일 인증하면 ${challengeDef.rewardPoints}P 보상!`);
        }

        // 6. 거래 기록 저장 (실패해도 챌린지 시작은 이미 완료)
        try {
            await addDoc(collection(db, "blockchain_transactions"), {
                userId: currentUser.uid,
                type: 'staking',
                challengeId: challengeId,
                amount: hbtAmount,
                timestamp: serverTimestamp(),
                status: 'success',
                walletAddress: userWalletAddress
            });
        } catch (logErr) {
            console.warn('⚠️ 거래 기록 저장 실패 (챌린지 시작은 완료됨):', logErr.message);
        }
        
        window.updateAssetDisplay && window.updateAssetDisplay();
        return true;

    } catch (error) {
        console.error('❌ 챌린지 시작 오류:', error);
        showToast(`❌ 오류: ${error.message}`);
        return false;
    }
}

/**
 * 일일 인증 시 챌린지 진행도 업데이트
 * 모든 활성 챌린지(티어별)를 동시에 업데이트
 * 챌린지 종료 시 보상 규칙:
 * - 3일 챌린지: 100% 달성 → 포인트 보상
 * - 7일 챌린지: 80%+ → 원금 환급 + 포인트, 100% → +보너스
 * - 30일 챌린지: 80%+ → 원금 환급, 100% → +20% HBT 보너스
 */
export async function updateChallengeProgress() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const today = getKstDateString();

        // activeChallenges 수집 (legacy 마이그레이션 포함)
        let activeChallenges = userData.activeChallenges || {};
        let hadLegacy = false;
        if (userData.activeChallenge && userData.activeChallenge.status === 'ongoing') {
            const legacyTier = CHALLENGES[userData.activeChallenge.challengeId]?.tier || 'master';
            if (!activeChallenges[legacyTier]) {
                activeChallenges[legacyTier] = userData.activeChallenge;
                hadLegacy = true;
            }
        }

        const tiers = Object.keys(activeChallenges).filter(t => activeChallenges[t]?.status === 'ongoing');
        if (tiers.length === 0) return;

        let totalRewardHbt = 0;
        let totalRewardPts = 0;
        const updateData = {};
        if (hadLegacy) updateData.activeChallenge = null;

        for (const tier of tiers) {
            const challenge = activeChallenges[tier];
            const totalDays = challenge.totalDays || 30;
            const completedDates = challenge.completedDates || [];
            const challengeDef = CHALLENGES[challenge.challengeId] || {};

            // 챌린지 종료일 확인
            if (today > challenge.endDate) {
                const successRate = challenge.completedDays / totalDays;
                const staked = challenge.hbtStaked || 0;
                const baseRewardP = challengeDef.rewardPoints || 0;
                let rewardHbt = 0;
                let rewardPoints = 0;
                let resultMsg = '';

                if (staked > 0) {
                    if (successRate >= 1.0) {
                        rewardHbt = staked * 2;
                        rewardPoints = baseRewardP * 2;
                        resultMsg = `🎉 ${totalDays}일 챌린지 완벽 달성!\n+${rewardHbt} HBT + ${rewardPoints}P 획득!`;
                    } else if (successRate >= 0.8) {
                        rewardHbt = staked * 1.5;
                        rewardPoints = baseRewardP;
                        resultMsg = `✅ ${totalDays}일 챌린지 성공! (${Math.round(successRate*100)}%)\n${rewardHbt} HBT + ${rewardPoints}P!`;
                    } else {
                        resultMsg = `😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%).\n예치금 ${staked} HBT가 소멸되었습니다.`;
                    }
                } else {
                    if (successRate >= 1.0) {
                        rewardPoints = baseRewardP;
                        resultMsg = `🎉 ${totalDays}일 챌린지 완벽 달성! +${rewardPoints}P 보상!`;
                    } else if (successRate >= 0.8) {
                        rewardPoints = Math.round(baseRewardP * 0.5);
                        resultMsg = `✅ ${totalDays}일 챌린지 성공! (${Math.round(successRate*100)}%) +${rewardPoints}P!`;
                    } else {
                        resultMsg = `😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%). 다음에 다시 도전하세요!`;
                    }
                }

                totalRewardHbt += rewardHbt;
                totalRewardPts += rewardPoints;
                updateData[`activeChallenges.${tier}`] = null;
                showToast(resultMsg);

                try {
                    await addDoc(collection(db, "blockchain_transactions"), {
                        userId: currentUser.uid,
                        type: 'challenge_settlement',
                        challengeId: challenge.challengeId,
                        amount: rewardHbt,
                        staked: staked,
                        successRate: successRate,
                        completedDays: challenge.completedDays,
                        timestamp: serverTimestamp(),
                        status: successRate >= 0.8 ? 'success' : 'failed'
                    });
                } catch (logErr) {
                    console.warn('⚠️ 정산 기록 저장 실패:', logErr.message);
                }
                continue;
            }

            // 중복 카운트 방지
            if (completedDates.includes(today)) {
                console.log(`ℹ️ ${tier} 챌린지: 오늘 이미 인증 완료`);
                continue;
            }

            // 통합(all) 챌린지: 식단+운동+마음 모두 완수했는지 확인
            if (challengeDef.category === 'all') {
                try {
                    const logDocId = `${currentUser.uid}_${today}`;
                    const logSnap = await getDoc(doc(db, "daily_logs", logDocId));
                    if (logSnap.exists()) {
                        const logData = logSnap.data();
                        const ap = logData.awardedPoints || {};
                        if (!ap.diet || !ap.exercise || !ap.mind) {
                            console.log(`ℹ️ 통합 챌린지: 아직 3개 카테고리 미완수 (diet:${!!ap.diet}, exercise:${!!ap.exercise}, mind:${!!ap.mind})`);
                            continue;
                        }
                    } else {
                        console.log(`ℹ️ 통합 챌린지: 오늘 기록 없음`);
                        continue;
                    }
                } catch (e) {
                    console.warn('⚠️ 통합 챌린지 검증 오류:', e.message);
                    continue;
                }
            }

            // 진행 중 - 오늘 날짜 기록
            completedDates.push(today);
            challenge.completedDays = completedDates.length;
            challenge.completedDates = completedDates;
            updateData[`activeChallenges.${tier}`] = challenge;

            const remain = totalDays - challenge.completedDays;
            showToast(`✅ ${challengeDef.emoji || '🏆'} ${challenge.completedDays}/${totalDays}일 (${remain}일 남음)`);
        }

        if (totalRewardHbt > 0) updateData.hbtBalance = increment(totalRewardHbt);
        if (totalRewardPts > 0) updateData.coins = increment(totalRewardPts);

        if (Object.keys(updateData).length > 0) {
            await updateDoc(userRef, updateData);
        }

        window.updateAssetDisplay && window.updateAssetDisplay();

    } catch (error) {
        console.error('⚠️ 챌린지 진행도 업데이트 오류:', error);
    }
}

/**
 * 현재 지갑 주소 반환
 */
export function getWalletAddress() {
    return userWalletAddress;
}

/**
 * 온체인 HBT 잔액 조회 (Cloud Function 경유)
 * @returns {object} { balance, balanceFormatted, walletAddress }
 */
export async function fetchOnchainBalance() {
    try {
        await ensureFunctions();
        const currentUser = auth.currentUser;
        if (!currentUser || !getOnchainBalanceFunction) return null;

        const result = await getOnchainBalanceFunction();
        return result.data;
    } catch (error) {
        console.error('⚠️ 온체인 잔액 조회 오류:', error);
        return null;
    }
}

/**
 * 토큰 전체 통계 조회 (Cloud Function 경유)
 * @returns {object} { totalSupply, totalMined, totalBurned, currentRate, currentEra, remainingInEra }
 */
export async function fetchTokenStats() {
    try {
        await ensureFunctions();
        if (!getTokenStatsFunction) return null;

        const result = await getTokenStatsFunction();
        return result.data;
    } catch (error) {
        console.error('⚠️ 토큰 통계 조회 오류:', error);
        return null;
    }
}

/**
 * 지갑 연결 해제
 */
export function disconnectWallet() {
    userWallet = null;
    userWalletAddress = null;
    console.log('✅ 지갑이 연결 해제되었습니다.');
}

console.log('✅ 블록체인 매니저 로드됨. (내장형 지갑, HBT, Staking)');
