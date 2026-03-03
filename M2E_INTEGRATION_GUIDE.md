# ⛓️ 해빛스쿨 M2E 시스템 통합 가이드 & 테스트

**최종 업데이트**: 2026년 2월 28일

---

## 📦 **Phase 1 완료: M2E 기본 구조 통합**

### ✅ 구현된 내용

#### **1. 블록체인 설정 파일 (`blockchain-config.js`)**
- Klaytn 메인넷/테스트넷 설정
- HBT 토큰 설정 (이름, 심볼, 소수점)
- Staking 컨트랙트 설정 (30일 잠금, 5% APY)
- 30일 챌린지 설정 (식단/운동/마음)
- 포인트 변환 규칙 (1000P = 1 HBT)

#### **2. 블록체인 매니저 모듈 (`blockchain-manager.js`)**
- `connectKlipWallet()` - Klip 지갑 연동
- `convertPointsToHBT()` - 포인트 → HBT 변환
- `startChallenge30D()` - 30일 챌린지 시작
- `updateChallengeProgress()` - 일일 진행도 업데이트
- Firebase와 Blockchain 동기화

#### **3. 메인 모듈 통합 (`main.js`)**
- 블록체인 모듈을 모든 함수와 함께 전역으로 노출
- HTML에서 직접 함수 호출 가능

#### **4. UI 탭 추가 (`index.html`)**
- 새로운 "🪙 자산" 탭 추가
- 포인트 & HBT 요약 카드
- Klip 지갑 연동 섹션
- 포인트 → HBT 변환 인터페이스
- 30일 챌린지 선택 및 진행 상황 표시
- 거래 기록 조회

---

## 🧪 **로컬 테스트 방법**

### **Step 1: 로컬 서버 시작**
```bash
cd "d:/251226홈페이지/habitschool"
python -m http.server 8000
```

### **Step 2: 브라우저에서 접속**
```
http://localhost:8000
```

### **Step 3: 구글 로그인 테스트**
1. **로그인 버튼** 클릭
   - ⚠️ 주의: Firebase에서 `http://localhost:8000`을 **승인된 리다이렉션 URI**로 추가해야 함
   - [Firebase Console 설정 방법](#firebase-설정)

2. **로그인 성공 후**
   - 포인트 잔액 표시 (초기: 0P)
   - 탭 메뉴에서 "🪙 자산" 탭 확인

### **Step 4: 자산 탭에서 기능 테스트**

#### **A. 지갑 연동 테스트**
```javascript
// 브라우저 콘솔에서 실행
connectKlipWallet()
```
- 현재는 로컬 테스트이므로 **Klip 앱이 없어도 에러만 표시** (실제 작동 안 함)
- 메시지: "⚠️ Klip 지갑이 필요합니다. 카카오톡에서 Klip을 찾아주세요."

#### **B. 포인트 확인**
```javascript
// 테스트용 포인트 추가 (Firebase 콘솔에서 직접 수정하거나)
window.auth.currentUser // 현재 사용자 확인
db.collection('users').doc(window.auth.currentUser.uid)
   .update({ coins: 1500 }) // 1500P로 설정
```

#### **C. 포인트 → HBT 변환 테스트**
```javascript
// 1. 포인트가 1000P 이상 있을 때
convertPointsToHBT(1000)

// 2. Firebase Console에서 confirm
// users/{userId} 문서 확인
// - coins: 500P (1000P 차감)
// - hbtBalance: 1 HBT (추가됨)
```

#### **D. 30일 챌린지 시작 테스트**
```javascript
// HBT가 1개 이상 있을 때 도전
startChallenge30D('challenge-exercise-30d')

// Firebase에서 확인
// users/{userId}
// - activeChallenge: { ...챌린지 정보... }
// - hbtBalance: 0 HBT (예치됨)
```

---

## 🔧 **Firebase 설정**

### **A. OAuth 리다이렉션 URI 추가 (로컬 테스트용)**

1. **Firebase Console** 접속
   - https://console.firebase.google.com
   - "habitschool-8497b" 프로젝트 선택

2. **좌측 메뉴** → "Authentication" (인증)

3. **Sign-in method** (로그인 방법) → "Google" 클릭

4. **Web SDK configuration** 섹션 찾기

5. **Authorized JavaScript origins** (승인된 자바스크립트 원본)
   ```
   http://localhost:8000
   http://localhost:3000  (다른 포트 사용할 경우)
   ```

6. **Authorized redirect URIs** (승인된 리다이렉션 URI)
   ```
   http://localhost:8000/
   http://localhost:3000/  (다른 포트 사용할 경우)
   ```

7. **저장** 클릭

### **B. Firestore 테스트 모드 확인**

현재 Firebase Security Rules 상태 확인:
```bash
firebase rules:list
```

테스트 중에 Security Rules가 너무 엄격하면 임시로 완화:
```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // 🚨 테스트 전용! 프로덕션에서는 금지!
    }
  }
}
```

배포:
```bash
firebase deploy --only firestore:rules
```

---

## 📚 **다음 단계 (Phase 2)**

### **1. Solidity 스마트 컨트랙트 작성 (1주)**

클레이튼 네트워크를 위한 스마트 컨트랙트:

```solidity
// HBT.sol - ERC-20 토큰
pragma solidity ^0.8.0;

contract HBT is ERC20 {
    address public owner;
    
    constructor() ERC20("HaeBit", "HBT") {
        owner = msg.sender;
    }
    
    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "Only owner can mint");
        _mint(to, amount);
    }
}

// Staking.sol - 30일 스테이킹 컨트랙트
pragma solidity ^0.8.0;

contract StakingReward {
    HBT public hbtToken;
    
    struct Stake {
        uint256 amount;
        uint256 startTime;
        bool completed;
    }
    
    mapping(address => Stake) public stakes;
    
    function stake(uint256 amount) external {
        require(hbtToken.transferFrom(msg.sender, address(this), amount));
        stakes[msg.sender] = Stake(amount, block.timestamp, false);
    }
    
    function completeStake() external {
        Stake storage s = stakes[msg.sender];
        require(block.timestamp >= s.startTime + 30 days);
        
        uint256 reward = s.amount * 105 / 100;  // 5% 이자
        hbtToken.transfer(msg.sender, reward);
        s.completed = true;
    }
}
```

> 💡 공식 리소스:
> - [Klaytn 개발 문서](https://docs.klaytn.com/smart-contract/solidity)
> - [OpenZeppelin 컨트랙트](https://docs.openzeppelin.com/contracts/)

### **2. Klip 지갑 연동 테스트**

실제 Klip 앱에서 테스트:
- Klip 앱 설치 (카카오톡)
- 지갑 생성
- `blockchain-manager.js`의 `connectKlipWallet()` 호출
- 거래 서명 테스트

### **3. 클레이튼 테스트넷 배포**

```bash
# Truffle을 사용한 배포
truffle migrate --network klaytn_testnet

# Contract 주소를 blockchain-config.js에 입력
export const HBT_TOKEN = {
    testnetAddress: '0x...' // 실제 배포된 주소
};
```

### **4. 실제 거래 플로우 구현**

현재 코드는 Firebase만 업데이트하지만, 실제 Klaytn 거래 추가:
```javascript
// blockchain-manager.js에서
async function convertPointsToHBT() {
    // 1. Firebase에서 포인트 확인
    // 2. Klip으로 거래 서명 (스마트 컨트랙트 호출)
    // 3. 거래 해시 저장
    // 4. 확인 후 HBT 발급
}
```

---

## 🚀 **명령어 및 배포**

### **로컬에서 테스트**
```bash
python -m http.server 8000
# http://localhost:8000에서 확인
```

### **파이어베이스에 배포**
```bash
firebase deploy --only hosting
```

### **Klaytn 테스트넷에서 테스트**
```bash
# 1. 테스트넷 faucet에서 KLAY 받기
# https://baobab.wallet.klaytn.com/faucet

# 2. 스마트 컨트랙트 배포
truffle migrate --network klaytn_testnet

# 3. Klip에서 테스트넷 선택해서 거래 확인
```

---

## 📊 **구조 요약**

```
┌─────────────────────────────────────┐
│   해빛스쿨 (Frontend - index.html)  │
│   - 로그인, 인증, 탭 네비게이션      │
└────────────┬────────────────────────┘
             │
             ├─ auth.js (구글 로그인)
             ├─ blockchain-manager.js (NEW)
             │  ├─ connectKlipWallet()
             │  ├─ convertPointsToHBT()
             │  └─ startChallenge30D()
             └─ firebase-config.js
                  │
                  └─ Firestore (users 컬렉션)
                     ├─ coins: 1000P (Off-chain)
                     ├─ hbtBalance: 1 HBT
                     ├─ walletAddress: 0x...
                     └─ activeChallenge: {...}
                          │
                          └─ Klaytn Blockchain
                             ├─ HBT Token Contract
                             └─ Staking Contract
```

---

## ⚠️ **이슈 및 주의사항**

### **1. Klip 앱이 없을 때**
- 현재 코드는 `window.klaytn`을 확인하고 없으면 설치 유도
- 로컬에서는 Klip이 작동하지 않으므로 에러 메시지만 표시

### **2. 가스비 처리**
- 현재는 Firebase만 업데이트 (가스비 발생 안 함)
- 실제 배포 시 Klip에서 가스비 결제
- 초기 단계: 회사가 가스비 부담 (사용자 인센티브)

### **3. 보안 ( 매우 중요!)**
- Private Key는 절대 백엔드에 저장하지 말 것
- Klip이 사용자의 지갑을 안전하게 관리
- 스마트 컨트랙트는 반드시 감시(Audit) 필요

### **4. 법적 고려사항**
- HBT는 "게임 내 화폐"로 명시 (금융상품 아님)
- 스테이킹 "이자"는 실제 이자가 아닌 "챌린지 보상"
- 사용자 약관에 명시 필요

---

## 📞 **지원 & 문축**

문제가 발생하면:
1. **브라우저 콘솔** 확인 (F12 → Console)
2. **Firebase Console** 에서 데이터 확인
3. **Klip 공식 문서** 참고: https://docs.klipwallet.com/

---

이제 모든 기초 구조가 준비되었습니다! 🎉

**다음 단계**: 스마트 컨트랙트 개발 & Klaytn 테스트넷 배포
