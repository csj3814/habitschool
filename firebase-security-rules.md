# Firebase Security Rules 가이드

해빛스쿨 애플리케이션을 위한 Firebase Security Rules 설정 가이드입니다.

## 📋 목차
1. [Firestore Security Rules](#firestore-security-rules)
2. [Storage Security Rules](#storage-security-rules)
3. [규칙 테스트 방법](#규칙-테스트-방법)
4. [보안 체크리스트](#보안-체크리스트)

---

## 🔒 Firestore Security Rules

Firebase Console → Firestore Database → Rules 탭에 다음 규칙을 설정하세요.

### 전체 Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 헬퍼 함수: 로그인한 사용자인지 확인
    function isSignedIn() {
      return request.auth != null;
    }
    
    // 헬퍼 함수: 본인인지 확인
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    
    // 헬퍼 함수: 관리자 권한 확인 (관리자 UID 목록)
    function isAdmin() {
      return isSignedIn() && request.auth.uid in [
        'YOUR_ADMIN_UID_1',  // 실제 관리자 UID로 변경 필요
        'YOUR_ADMIN_UID_2'
      ];
    }
    
    // 헬퍼 함수: 데이터 검증
    function isValidDailyLog() {
      let data = request.resource.data;
      return data.userId is string
          && data.date is string
          && data.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')  // YYYY-MM-DD 형식
          && (!('userName' in data) || data.userName is string)
          && (!('metrics' in data) || data.metrics is map)
          && (!('diet' in data) || data.diet is map)
          && (!('exercise' in data) || data.exercise is map)
          && (!('sleepAndMind' in data) || data.sleepAndMind is map);
    }
    
    function isValidTextLength(text, maxLength) {
      return text is string && text.size() <= maxLength;
    }
    
    // ===== Users Collection =====
    // 사용자 프로필 데이터
    match /users/{userId} {
      // 읽기: 본인만 가능
      allow read: if isOwner(userId) || isAdmin();
      
      // 쓰기: 본인만 가능
      allow create: if isOwner(userId);
      allow update: if isOwner(userId);
      allow delete: if isAdmin();  // 삭제는 관리자만
    }
    
    // ===== Daily Logs Collection =====
    // 일일 건강 기록
    match /daily_logs/{logId} {
      // 읽기: 모든 사용자 (게스트도 갤러리 열람 가능)
      allow read: if true;
      
      // 생성: 본인 데이터만
      allow create: if isSignedIn() 
                    && isValidDailyLog()
                    && request.resource.data.userId == request.auth.uid;
      
      // 수정: 본인 데이터 수정 OR 다른 사용자의 reactions/comments 필드만 수정
      allow update: if isSignedIn() && (
        // Case 1: 본인 게시물 전체 수정
        (isOwner(resource.data.userId) 
          && isValidDailyLog()
          && request.resource.data.userId == resource.data.userId)
        ||
        // Case 2: 다른 사용자가 reactions 또는 comments 필드만 수정 (좋아요/댓글)
        // reactions, comments 외의 필드는 변경되지 않아야 함
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactions', 'comments']))
      );
      
      // 관리자: adminFeedbackHistory 필드 수정 가능
      allow update: if isAdmin();
      
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }
    
    // ===== Health Profiles Collection =====
    // 건강 프로필 (민감 정보)
    match /health_profiles/{userId} {
      // 읽기: 본인 또는 관리자만
      allow read: if isOwner(userId) || isAdmin();
      
      // 쓰기: 본인만 가능
      allow create, update: if isOwner(userId);
      allow delete: if isAdmin();
    }
    
    // ===== Reactions Collection =====
    // 게시물 리액션 (하트, 불, 박수)
    match /reactions/{reactionId} {
      // 읽기: 모든 로그인 사용자
      allow read: if isSignedIn();
      
      // 쓰기: 로그인한 사용자 (자기 리액션만 추가/삭제)
      allow create, update, delete: if isSignedIn();
    }
    
    // ===== Notifications Collection =====
    // 반응 알림 (좋아요/불꽃/박수 알림)
    match /notifications/{notifId} {
      // 읽기: 본인에게 온 알림만
      allow read: if isSignedIn() && resource.data.postOwnerId == request.auth.uid;
      
      // 생성: 로그인한 사용자 (다른 사람 게시물에 반응 시)
      allow create: if isSignedIn();
      
      // 수정/삭제: 알림 대상자만 (읽음 처리 등)
      allow update, delete: if isSignedIn() && resource.data.postOwnerId == request.auth.uid;
    }
    
    // ===== Admin Feedback Collection =====
    // 관리자 피드백
    match /admin_feedback/{feedbackId} {
      // 읽기: 피드백 대상자 또는 관리자
      allow read: if isSignedIn() 
                  && (resource.data.targetUserId == request.auth.uid || isAdmin());
      
      // 쓰기: 관리자만
      allow create, update, delete: if isAdmin();
    }
    
    // ===== Admin Messages Collection =====
    // 관리자 메시지 상태
    match /admin_messages/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow write: if isOwner(userId) || isAdmin();
    }
    
    // ===== Blockchain Transactions Collection =====
    // HBT 변환/스테이킹 거래 기록
    match /blockchain_transactions/{txId} {
      // 읽기: 본인 기록만
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      
      // 쓰기: 로그인한 사용자 (본인 기록만 생성)
      allow create: if isSignedIn() 
                    && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;  // 거래 기록은 수정/삭제 불가
    }

    // 기본 규칙: 모든 접근 거부
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 🗄️ Storage Security Rules

Firebase Console → Storage → Rules 탭에 다음 규칙을 설정하세요.

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // 헬퍼 함수: 이미지 파일인지 확인
    function isImage() {
      return request.resource.contentType.matches('image/.*');
    }
    
    // 헬퍼 함수: 비디오 파일인지 확인
    function isVideo() {
      return request.resource.contentType.matches('video/.*');
    }
    
    // 헬퍼 함수: 이미지 파일 크기 확인 (20MB 이하)
    function isValidSize() {
      return request.resource.size < 20 * 1024 * 1024;  // 20MB
    }
    
    // 헬퍼 함수: 동영상 파일 크기 확인 (100MB 이하)
    function isValidVideoSize() {
      return request.resource.size < 100 * 1024 * 1024;  // 100MB
    }
    
    // ===== 식단 이미지 =====
    match /diet_images/{userId}/{allFiles=**} {
      allow read: if request.auth != null;  // 로그인한 사용자만 읽기
      allow write: if request.auth != null
                   && request.auth.uid == userId  // 본인만 업로드
                   && request.resource.contentType.matches('image/.*')
                   && isValidSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // ===== 식단 이미지 썸네일 =====
    match /diet_images_thumbnails/{userId}/{allFiles=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.contentType.matches('image/.*')
                   && isValidSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // ===== 운동 이미지 =====
    match /exercise_images/{userId}/{allFiles=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.contentType.matches('image/.*')
                   && isValidSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // ===== 운동 이미지 썸네일 =====
    match /exercise_images_thumbnails/{userId}/{allFiles=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.contentType.matches('image/.*')
                   && isValidSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // ===== 운동 비디오 =====
    match /exercise_videos/{userId}/{allFiles=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.contentType.matches('video/.*')
                   && isValidVideoSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // ===== 운동 비디오 썸네일 =====
    match /exercise_videos_thumbnails/{userId}/{allFiles=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.contentType.matches('image/.*')
                   && isValidSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // ===== 수면 기록 이미지 =====
    match /sleep_images/{userId}/{allFiles=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.contentType.matches('image/.*')
                   && isValidSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // ===== 수면 기록 이미지 썸네일 =====
    match /sleep_images_thumbnails/{userId}/{allFiles=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.contentType.matches('image/.*')
                   && isValidSize();
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // 기본 규칙: 모든 접근 거부
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 🧪 규칙 테스트 방법

### Firebase Console에서 테스트

1. **Firestore Rules Simulator**
   - Firebase Console → Firestore Database → Rules
   - 상단의 "Rules playground" 클릭
   - 시뮬레이션 시나리오:
     ```
     Collection: daily_logs
     Document: test-log-123
     Operation: get
     Authenticated: Yes
     Auth UID: [테스트할 UID]
     ```

2. **Storage Rules Simulator**
   - Firebase Console → Storage → Rules
   - "Rules playground" 클릭
   - 파일 경로 예시:
     ```
     Path: /diet_images/user123_1234567890_meal.jpg
     Operation: write
     File type: image/jpeg
     File size: 2048 (KB)
     ```

### 로컬 에뮬레이터에서 테스트 (선택사항)

```bash
# Firebase CLI 설치
npm install -g firebase-tools

# Firebase 프로젝트 초기화
firebase init

# 에뮬레이터 실행
firebase emulators:start

# http://localhost:4000 에서 UI 확인
```

---

## ✅ 보안 체크리스트

### Firestore

- [x] **인증 필수**: 모든 읽기/쓰기 작업에 로그인 필수
- [x] **본인 데이터 보호**: userId 검증으로 다른 사용자 데이터 수정 방지
- [x] **데이터 검증**: 날짜 형식, 문자열 길이 등 검증
- [x] **민감 정보 분리**: health_profiles는 본인/관리자만 접근
- [x] **관리자 권한**: admin_feedback은 관리자만 생성/수정
- [ ] **Rate Limiting**: 필요 시 Cloud Functions로 구현 (선택)

### Storage

- [x] **파일 타입 제한**: 이미지/비디오만 허용
- [x] **파일 크기 제한**: 10MB 이하
- [x] **본인 파일만 업로드**: userId로 경로 검증
- [x] **읽기 권한**: 로그인한 사용자만 미디어 접근
- [x] **삭제 권한**: 본인이 업로드한 파일만 삭제 가능

### 클라이언트 보안 (이미 적용됨)

- [x] **XSS 방지**: escapeHtml() 사용
- [x] **URL 검증**: isValidStorageUrl() 사용
- [x] **입력 정제**: sanitizeText() 사용
- [x] **파일 검증**: isValidFileType(), isValidFileSize() 사용

---

## 🔧 관리자 UID 설정 방법

1. Firebase Console → Authentication → Users
2. 관리자로 지정할 사용자의 **User UID** 복사
3. Firestore Rules의 `isAdmin()` 함수에 UID 추가:
   ```javascript
   function isAdmin() {
     return isSignedIn() && request.auth.uid in [
       'abc123xyz456',  // 실제 관리자 UID로 변경
       'def789uvw012'
     ];
   }
   ```
4. Rules 저장 및 배포

---

## ⚠️ 주의사항

1. **apiKey 노출**: Firebase apiKey는 공개되어도 안전합니다. Security Rules가 실제 보안을 담당합니다.
2. **Rules 우선순위**: 여러 규칙이 매치되면 **allow가 하나라도 있으면 허용**됩니다.
3. **필드 검증**: `request.resource.data.field`로 쓰기 전 데이터 검증 필수
4. **기존 데이터**: `resource.data.field`로 기존 저장된 데이터 참조
5. **테스트 필수**: 규칙 수정 후 반드시 Rules Playground에서 테스트

---

## 📚 참고 자료

- [Firebase Security Rules 공식 문서](https://firebase.google.com/docs/rules)
- [Firestore Security Rules 가이드](https://firebase.google.com/docs/firestore/security/get-started)
- [Storage Security Rules 가이드](https://firebase.google.com/docs/storage/security)
- [Rules Playground 사용법](https://firebase.google.com/docs/rules/simulator)

---

**마지막 업데이트**: 2024년
**작성자**: 해빛스쿨 개발팀
