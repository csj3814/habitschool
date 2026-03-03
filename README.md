# 해빛스쿨 (HabitSchool)

건강 습관을 기록하고 포인트를 모으는 **Move-to-Earn(M2E)** PWA 앱입니다.

## 주요 기능

- 🍽️ **식단 기록** — 아침/점심/저녁/간식 사진 인증
- 🏃 **운동 기록** — 유산소/근력 운동 사진·영상 인증
- 🧘 **마음 기록** — 수면, 감사 일기
- 📊 **건강 지표** — 혈당, 혈압, 체중 추적
- 🪙 **포인트 & HBT 토큰** — 일일 최대 80P, 비트코인식 반감기 적용
- 🏆 **챌린지** — 3일/7일/30일 챌린지 참여 및 HBT 스테이킹
- 📸 **갤러리 피드** — 무한 스크롤, 리액션, 친구 시스템
- 🔔 **PWA** — 오프라인 지원, 모바일 설치 가능

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | HTML5, CSS3, JavaScript (ES6 Modules) |
| 백엔드 | Firebase (Auth, Firestore, Storage) |
| 블록체인 | Base Chain (L2), Solidity, Hardhat |
| 라이브러리 | EXIF.js, html2canvas, ethers.js, Chart.js |

## 프로젝트 구조

```
habitschool/
├── index.html          # 메인 앱 (PWA)
├── admin.html          # 관리자 대시보드
├── tokenomics.html     # 토크노믹스 페이지
├── styles.css          # 통합 스타일시트
├── manifest.json       # PWA 매니페스트
├── sw.js               # 서비스 워커
├── js/
│   ├── main.js               # 진입점
│   ├── app.js                # 핵심 앱 로직
│   ├── auth.js               # Google 인증
│   ├── firebase-config.js    # Firebase 설정 & 상수
│   ├── blockchain-config.js  # 블록체인 & HBT 설정
│   ├── blockchain-manager.js # 지갑, 변환, 챌린지
│   ├── data-manager.js       # 파일 업로드, 이미지 압축
│   ├── ui-helpers.js         # UI 유틸리티
│   ├── gallery.js            # 갤러리 피드, 무한 스크롤
│   └── security.js           # XSS 방지, 입력 검증
├── contracts/
│   ├── HaBit.sol             # ERC-20 토큰 (8 decimals, 1억 개)
│   └── HaBitStaking.sol      # 챌린지 스테이킹
└── icons/                    # SVG 아이콘
```

## 로컬 실행

```bash
# 정적 서버로 실행
python -m http.server 8000

# 브라우저에서 열기
open http://localhost:8000
```

## 스마트 컨트랙트

```bash
cd contracts
npm install
npm run compile
npm run test
npm run deploy:sepolia  # Base Sepolia 테스트넷 배포
```

## 라이선스

비공개 (Private)
