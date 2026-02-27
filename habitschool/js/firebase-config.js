// Firebase 설정 및 초기화
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyDICPw7HTmu5znaRCYC93-zTux4dYYN9eI",
    authDomain: "habitschool-8497b.firebaseapp.com",
    projectId: "habitschool-8497b",
    storageBucket: "habitschool-8497b.firebasestorage.app"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// 상수
export const MAX_IMG_SIZE = 20 * 1024 * 1024;  // 20MB
export const MAX_VID_SIZE = 100 * 1024 * 1024; // 100MB

// 마일스톤 뱃지 정의
export const BADGES = {
    starter: { id: 'starter', emoji: '🌟', name: '시작', desc: '첫 기록' },
    streak7: { id: 'streak7', emoji: '🔥', name: '연속7일', desc: '7일 연속 기록' },
    diet7: { id: 'diet7', emoji: '🥗', name: '식단 지킴이', desc: '식단 7일 연속' },
    exercise7: { id: 'exercise7', emoji: '💪', name: '운동 마스터', desc: '운동 7일 연속' },
    mind7: { id: 'mind7', emoji: '🧘', name: '마음 챙김', desc: '마음 7일 연속' },
    streak30: { id: 'streak30', emoji: '🏆', name: '30일 연속', desc: '30일 연속 기록' },
    points100: { id: 'points100', emoji: '💯', name: '백포인트', desc: '100P 달성' },
    points300: { id: 'points300', emoji: '💎', name: '다이아몬드', desc: '300P 달성' },
    level3: { id: 'level3', emoji: '🚀', name: 'Lv.3 도전', desc: '레벨 3 달성' },
    friends5: { id: 'friends5', emoji: '⭐', name: '네트워크', desc: '친구 5명' }
};

// 미션 정의
export const MISSIONS = {
    1: [
        { id: 'm1_diet', text: '🥗 하루 한 끼 채소 채우기', target: 3, type: 'diet' },
        { id: 'm1_exer', text: '🏃 주 3회 이상 운동', target: 3, type: 'exercise' },
        { id: 'm1_mind', text: '🧘 주 2회 명상', target: 2, type: 'mind' }
    ],
    2: [
        { id: 'm2_diet', text: '🥗 채소 위주 식단', target: 5, type: 'diet' },
        { id: 'm2_exer', text: '🏃 주 4회 운동', target: 4, type: 'exercise' },
        { id: 'm2_mind', text: '🧘 주 3회 명상', target: 3, type: 'mind' }
    ],
    3: [
        { id: 'm3_diet', text: '🥗 주 5일 클린 식단', target: 5, type: 'diet' },
        { id: 'm3_exer', text: '🏃 매일 운동 습관', target: 5, type: 'exercise' },
        { id: 'm3_mind', text: '🧘 주 4회 마음 챙김', target: 4, type: 'mind' }
    ],
    4: [
        { id: 'm4_diet', text: '🥗 하루 3끼 채소 중심', target: 6, type: 'diet' },
        { id: 'm4_exer', text: '🏃 매일 운동 (주 6회)', target: 6, type: 'exercise' },
        { id: 'm4_mind', text: '🧘 주 5회 명상', target: 5, type: 'mind' }
    ],
    5: [
        { id: 'm5_diet', text: '🥗 클린 식단 달성', target: 7, type: 'diet' },
        { id: 'm5_exer', text: '🏃 매일 운동 달성', target: 7, type: 'exercise' },
        { id: 'm5_med', text: '💊 약 감량 시도', target: 1, type: 'mind' }
    ]
};

export { app, auth, db, storage };
