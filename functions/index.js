/**
 * HaBit (HBT) Cloud Functions
 * 
 * 온체인 민팅, 잔액 조회, 챌린지 정산을 처리하는 서버리스 함수
 * 
 * 엔드포인트:
 *   - mintHBT: 포인트 → HBT 온체인 민팅
 *   - getOnchainBalance: 사용자 온체인 HBT 잔액 조회
 *   - getTokenStats: 전체 토큰 통계 조회
 * 
 * 보안:
 *   - Firebase Auth 인증 필수 (onCall)
 *   - Server Minter 키는 Secret Manager에 저장
 *   - 포인트 잔액은 Firestore에서 서버측 검증
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { ethers } = require("ethers");
const contractAbi = require("./contract-abi.json");

// Firebase 초기화
admin.initializeApp();
const db = admin.firestore();

// 비밀 키 (Firebase Secret Manager)
const SERVER_MINTER_KEY = defineSecret("SERVER_MINTER_KEY");

// 컨트랙트 주소 (Base Sepolia)
const HABIT_ADDRESS = "0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29";
const STAKING_ADDRESS = "0xa439c57806174fbAB0A78b8Cd13a51d94C2a1631";
const RPC_URL = "https://sepolia.base.org";
const CHAIN_ID = 84532;
const EXPLORER_URL = "https://sepolia.basescan.org";

// 일일 전환 한도
const MAX_DAILY_HBT = 1000;
const MIN_POINTS = 100;

/**
 * ethers Provider & Wallet 인스턴스 생성
 */
function getProviderAndWallet(privateKey) {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const wallet = new ethers.Wallet(privateKey, provider);
    return { provider, wallet };
}

/**
 * HaBit 컨트랙트 인스턴스 생성
 */
function getHabitContract(signerOrProvider) {
    return new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, signerOrProvider);
}

// ========================================
// 1. 포인트 → HBT 온체인 민팅
// ========================================
exports.mintHBT = onCall(
    { 
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",  // 서울 리전
        maxInstances: 10
    },
    async (request) => {
        // 인증 확인
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const { pointAmount } = request.data;

        // 입력 검증
        if (!pointAmount || typeof pointAmount !== "number" || pointAmount < MIN_POINTS) {
            throw new HttpsError("invalid-argument", `최소 ${MIN_POINTS}P 이상 필요합니다.`);
        }
        if (pointAmount % 100 !== 0) {
            throw new HttpsError("invalid-argument", "100P 단위로만 변환 가능합니다.");
        }

        try {
            // 1. Firestore에서 사용자 데이터 확인
            const userRef = db.collection("users").doc(uid);
            const userSnap = await userRef.get();

            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const userData = userSnap.data();
            const currentCoins = userData.coins || 0;
            const walletAddress = userData.walletAddress;

            if (!walletAddress) {
                throw new HttpsError("failed-precondition", "지갑이 생성되지 않았습니다. 앱을 다시 로드해주세요.");
            }

            if (currentCoins < pointAmount) {
                throw new HttpsError("failed-precondition", `포인트가 부족합니다. 필요: ${pointAmount}P, 보유: ${currentCoins}P`);
            }

            // 일일 변환 한도 확인
            const today = new Date().toISOString().split("T")[0];
            const dailyQuery = await db.collection("blockchain_transactions")
                .where("userId", "==", uid)
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("date", "==", today)
                .get();

            let todayMinted = 0;
            dailyQuery.forEach(doc => {
                todayMinted += doc.data().hbtReceived || 0;
            });

            // 2. 온체인 전환 비율 확인
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            const [currentRate, currentEra] = await habitContract.getConversionRate();
            const rateNumber = Number(currentRate);
            const eraNumber = Number(currentEra);

            // HBT 계산 (컨트랙트와 동일한 로직)
            const hbtAmount = (pointAmount * rateNumber) / 100;

            if (todayMinted + hbtAmount > MAX_DAILY_HBT) {
                throw new HttpsError("resource-exhausted", 
                    `일일 변환 한도 초과. 오늘 사용: ${todayMinted} HBT, 한도: ${MAX_DAILY_HBT} HBT`);
            }

            // 3. Firestore 포인트 차감 (원자적)
            await db.runTransaction(async (transaction) => {
                const freshSnap = await transaction.get(userRef);
                const freshCoins = freshSnap.data().coins || 0;
                if (freshCoins < pointAmount) {
                    throw new HttpsError("failed-precondition", "포인트가 부족합니다 (동시 요청 감지).");
                }
                transaction.update(userRef, {
                    coins: admin.firestore.FieldValue.increment(-pointAmount)
                });
            });

            // 4. 온체인 민팅 (habitMine 호출)
            let txHash = null;
            let onchainSuccess = false;

            try {
                const tx = await habitContract.habitMine(walletAddress, pointAmount);
                const receipt = await tx.wait();
                txHash = receipt.hash;
                onchainSuccess = true;
            } catch (chainError) {
                // 온체인 실패 → 포인트 복원
                console.error("온체인 민팅 실패, 포인트 복원:", chainError.message);
                await userRef.update({
                    coins: admin.firestore.FieldValue.increment(pointAmount)
                });
                throw new HttpsError("internal", `온체인 민팅 실패: ${chainError.message}`);
            }

            // 5. Firestore 업데이트 (HBT 잔액 + 기록)
            await userRef.update({
                hbtBalance: admin.firestore.FieldValue.increment(hbtAmount),
                totalHbtEarned: admin.firestore.FieldValue.increment(hbtAmount)
            });

            // 6. 거래 기록 저장
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: "conversion",
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                conversionRate: rateNumber,
                era: eraNumber,
                txHash: txHash,
                walletAddress: walletAddress,
                date: today,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: "success",
                network: "baseSepolia"
            });

            return {
                success: true,
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                txHash: txHash,
                explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
                conversionRate: rateNumber,
                era: eraNumber
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("mintHBT 오류:", error);
            throw new HttpsError("internal", "변환 처리 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 2. 온체인 HBT 잔액 조회
// ========================================
exports.getOnchainBalance = onCall(
    { 
        region: "asia-northeast3",
        maxInstances: 20
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;

        try {
            const userSnap = await db.collection("users").doc(uid).get();
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const walletAddress = userSnap.data().walletAddress;
            if (!walletAddress) {
                return { balance: "0", balanceFormatted: "0" };
            }

            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);

            const balance = await habitContract.balanceOf(walletAddress);
            const decimals = await habitContract.decimals();
            const formatted = ethers.formatUnits(balance, decimals);

            return {
                balance: balance.toString(),
                balanceFormatted: formatted,
                walletAddress: walletAddress
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("getOnchainBalance 오류:", error);
            throw new HttpsError("internal", "잔액 조회 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 3. 토큰 전체 통계 조회
// ========================================
exports.getTokenStats = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10
    },
    async (request) => {
        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);

            const stats = await habitContract.getTokenStats();
            const decimals = await habitContract.decimals();

            return {
                totalSupply: ethers.formatUnits(stats[0], decimals),
                totalMined: ethers.formatUnits(stats[1], decimals),
                totalBurned: ethers.formatUnits(stats[2], decimals),
                circulatingSupply: ethers.formatUnits(stats[3], decimals),
                currentRate: Number(stats[4]),
                currentEra: Number(stats[5]),
                remainingInEra: ethers.formatUnits(stats[6], decimals)
            };

        } catch (error) {
            console.error("getTokenStats 오류:", error);
            throw new HttpsError("internal", "통계 조회 중 오류가 발생했습니다.");
        }
    }
);
