/**
 * blockchain-config.js
 * 클레이튼 블록체인 & HBT 토큰 설정
 * Web 2.5 M2E (Move-to-Earn) 시스템
 */

// ⛓️ 클레이튼 네트워크 설정
export const KLAYTN_CONFIG = {
    // 메인넷
    mainnet: {
        rpcUrl: 'https://public-rpc.kairos.klaytn.net:8551',
        chainId: 1001,
        explorer: 'https://scope.klaytn.com'
    },
    
    // 테스트넷 (Kairos - 이전 Baobab)
    testnet: {
        rpcUrl: 'https://public-rpc.kairos.klaytn.net:8551',
        chainId: 1001,
        explorer: 'https://kairos.scope.klaytn.com'
    }
};

// 🪙 HBT 토큰 설정
export const HBT_TOKEN = {
    name: '해빛 코인',
    symbol: 'HBT',
    decimals: 18,
    
    // 테스트넷 컨트랙트 주소 (배포 후 업데이트)
    testnetAddress: '0x0000...',  // TODO: 배포 후 주소 입력
    
    // 메인넷 컨트랙트 주소 (향후 배포)
    mainnetAddress: '0x0000...'   // TODO: 메인넷 배포 후
};

// 📋 Staking 계약 설정
export const STAKING_CONTRACT = {
    // 테스트넷
    testnetAddress: '0x0000...',   // TODO: 배포 후 주소 입력
    
    // 메인넷
    mainnetAddress: '0x0000...',   // TODO: 메인넷 배포 후
    
    // 스테이킹 파라미터
    lockupPeriod: 30 * 24 * 60 * 60, // 30일 (초 단위)
    apy: 5, // 5% 연이자
    minStakeAmount: 1, // 최소 1 HBT
    maxStakeAmount: 1000 // 최대 1000 HBT (향후 조정)
};

// 🎯 30일 챌린지 설정
export const CHALLENGES_30D = {
    diet: {
        id: 'challenge-diet-30d',
        name: '30일 식단 챌린지',
        description: '30일 연속 식단 인증하기',
        category: 'diet',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 1,
        rewardHbt: 1.05, // 5% 추가 (이자 형태)
        rewardPoints: 50,
        emoji: '🥗'
    },
    exercise: {
        id: 'challenge-exercise-30d',
        name: '30일 운동 챌린지',
        description: '30일 연속 운동 인증하기',
        category: 'exercise',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 1,
        rewardHbt: 1.05,
        rewardPoints: 50,
        emoji: '🏃'
    },
    mind: {
        id: 'challenge-mind-30d',
        name: '30일 마음 챌린지',
        description: '30일 연속 마음 기록 (명상/일기)',
        category: 'mind',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 1,
        rewardHbt: 1.05,
        rewardPoints: 50,
        emoji: '🧘'
    }
};

// 📊 포인트 → 토큰 변환 규칙
export const CONVERSION_RULES = {
    pointsPerConversion: 1000, // 1000P = 1 HBT
    minConversion: 1000,
    maxConversionPerDay: 1, // 1일 최대 1회 변환
    gasFeeEstimate: 0.5, // 약 500원 (사용자 부담 또는 회사 부담)
    estimatedTime: '2-5분'
};

// 🔒 Klip 지갑 연동 설정
export const KLIP_CONFIG = {
    // Klip API 설정 (향후 추가)
    appName: '해빛스쿨',
    appScheme: 'habitschool://',
    
    // Klip Universal Link
    // 사용자가 Klip 앱이 없으면 설치 유도
    klipDownloadUrl: 'https://klipwallet.com'
};

// 💾 Firebase 컬렉션 구조 (참고용)
export const FIREBASE_STRUCTURE = {
    users: {
        // 기존 필드
        uid: 'string',
        displayName: 'string',
        email: 'string',
        coins: 'number', // 해빛 포인트 (Off-chain)
        friends: 'array',
        
        // M2E 신규 필드
        walletAddress: 'string', // Klip 지갑 주소 (0x로 시작)
        hbtBalance: 'number', // 현재 HBT 보유량 (On-chain)
        totalHbtEarned: 'number', // 총 획득 HBT
        
        // 변환 기록
        conversions: 'array', // [{ date, pointsUsed, hbtReceived, txHash, status }]
        
        // 진행 중인 챌린지
        activeChallenge: 'object || null', // { challengeId, startDate, completedDays, hbtStaked, status }
        
        // 완료된 챌린지 기록
        completedChallenges: 'array' // [{ challengeId, completedDate, rewardHbt, rewardPoints }]
    },
    
    // 블록체인 거래 기록 (감시용)
    blockchain_transactions: {
        userId: 'string',
        txHash: 'string',
        type: 'string', // 'conversion', 'staking', 'withdrawal'
        amount: 'number', // HBT 수량
        timestamp: 'timestamp',
        blockNumber: 'number',
        status: 'string' // 'pending', 'success', 'failed'
    }
};

console.log('✅ 블록체인 설정 로드됨. (HBT 토큰 & Staking)');
