/**
 * gallery.js
 * 갤러리 피드 렌더링 및 무한 스크롤 모듈
 */

import { auth, db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs, getDoc, doc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getDatesInfo } from './ui-helpers.js';
import { fetchImageAsBase64 } from './data-manager.js';
import { escapeHtml, isValidStorageUrl } from './security.js';

// 캐시 및 상태 변수
export let cachedGalleryLogs = [];
export let cachedMyFriends = [];

// 무한 스크롤 관련 변수
export let galleryDisplayCount = 0;
const INITIAL_LOAD = 12;      // 초기 로드: 20 → 12 (성능 개선)
const LOAD_MORE = 12;         // 추가 로드: 15 → 12 (일관성)
const MAX_CACHE_SIZE = 50;    // 캐시 크기: 100 → 50 (메모리 절약)
let galleryIntersectionObserver = null;
let isLoadingMore = false;

// 현재 필터 상태 (전역에서 접근 가능하도록)
export let galleryFilter = 'all';

/**
 * 갤러리 필터 설정
 */
export function setGalleryFilter(filter) {
    galleryFilter = filter;
}

/**
 * 갤러리 미디어 수집 헬퍼 함수
 */
export function collectGalleryMedia(data) {
    const result = {
        dietHtml: '',
        exerciseHtml: '',
        mindHtml: '',
        mindText: ''
    };

    // 식단 미디어
    if(data.diet) {
        ['breakfastUrl','lunchUrl','dinnerUrl','snackUrl'].forEach(k => {
            if(data.diet[k]) {
                const url = data.diet[k];
                // URL 검증
                if (isValidStorageUrl(url)) {
                    const mealType = k.replace('Url', '');
                    result.dietHtml += `<img src="${escapeHtml(url)}" onclick="openLightbox('${escapeHtml(url)}')" alt="${mealType} 식사 사진" loading="lazy" decoding="async">`;
                }
            }
        });
    }

    // 운동 미디어 (중복 제거)
    if(data.exercise) {
        let addedUrls = new Set();
        const addImg = (url) => {
            if(url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                result.exerciseHtml += `<img src="${escapeHtml(url)}" onclick="openLightbox('${escapeHtml(url)}')" alt="운동 인증 사진" loading="lazy" decoding="async">`;
                addedUrls.add(url);
            }
        };
        const addVid = (url) => {
            if(url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                const safeUrl = escapeHtml(url);
                result.exerciseHtml += `<div class="video-thumb-wrapper" onclick="playGalleryVideo(this)" data-video-src="${safeUrl}"><video src="${safeUrl}#t=0.1" preload="metadata" muted playsinline aria-label="운동 영상"></video><div class="video-play-btn">&#9654;</div></div>`;
                addedUrls.add(url);
            }
        };
        
        addImg(data.exercise.cardioImageUrl);
        addVid(data.exercise.strengthVideoUrl);
        if(data.exercise.cardioList) data.exercise.cardioList.forEach(c => addImg(c.imageUrl));
        if(data.exercise.strengthList) data.exercise.strengthList.forEach(s => addVid(s.videoUrl));
    }

    // 마음 미디어
    if(data.sleepAndMind?.sleepImageUrl) {
        const url = data.sleepAndMind.sleepImageUrl;
        if (isValidStorageUrl(url)) {
            result.mindHtml = `<img src="${escapeHtml(url)}" onclick="openLightbox('${escapeHtml(url)}')" alt="수면 기록 캡처" loading="lazy" decoding="async">`;
        }
    }

    // 마음 텍스트
    if(data.sleepAndMind?.gratitude) {
        const safeGratitude = escapeHtml(data.sleepAndMind.gratitude);
        result.mindText = `<div style="font-size:13px; color:#555; background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:12px; font-style:italic;">💭 "${safeGratitude}"</div>`;
    }

    return result;
}

/**
 * 아이템이 표시되어야 하는지 판단
 */
export function shouldShowItem(data) {
    const media = collectGalleryMedia(data);
    const hasDiet = !!media.dietHtml;
    const hasExercise = !!media.exerciseHtml;
    const hasMind = !!(media.mindHtml || media.mindText);

    if (galleryFilter === 'all') {
        return hasDiet || hasExercise || hasMind;
    } else if (galleryFilter === 'diet') {
        return hasDiet;
    } else if (galleryFilter === 'exercise') {
        return hasExercise;
    } else if (galleryFilter === 'mind') {
        return hasMind;
    }
    return false;
}

/**
 * 무한 스크롤 옵저버 설정
 */
export function setupInfiniteScroll() {
    const sentinel = document.getElementById('gallery-sentinel');
    if (!sentinel) return;
    
    // 기존 옵저버가 있으면 해제
    if (galleryIntersectionObserver) {
        galleryIntersectionObserver.disconnect();
    }
    
    galleryIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoadingMore) {
                loadMoreGalleryItems();
            }
        });
    }, {
        rootMargin: '100px' // 하단 100px 전에 미리 로드
    });
    
    galleryIntersectionObserver.observe(sentinel);
}

/**
 * 추가 아이템 로드 함수
 */
export function loadMoreGalleryItems() {
    if (isLoadingMore) return;
    
    const sentinel = document.getElementById('gallery-sentinel');
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    
    // 필터링된 전체 아이템 수 계산
    let totalFilteredItems = 0;
    let sortedLogs = [...cachedGalleryLogs];
    sortedLogs.sort((a, b) => {
        const aFr = cachedMyFriends.includes(a.data.userId);
        const bFr = cachedMyFriends.includes(b.data.userId);
        return (aFr === bFr) ? 0 : aFr ? -1 : 1;
    });
    
    sortedLogs.forEach(item => {
        if (shouldShowItem(item.data)) totalFilteredItems++;
    });
    
    // 이미 모든 아이템을 표시했으면 종료
    if (galleryDisplayCount >= totalFilteredItems) {
        sentinel.style.display = 'none';
        return;
    }
    
    isLoadingMore = true;
    sentinel.style.display = 'block';
    
    // 다음 배치 로드
    setTimeout(() => {
        galleryDisplayCount += LOAD_MORE;
        renderFeedOnly();
        isLoadingMore = false;
    }, 300); // 부드러운 UX를 위한 약간의 지연
}

/**
 * 메모리 누수 방지: 모든 리소스 정리
 */
export function cleanupGalleryResources() {
    // Intersection Observer 정리
    if (galleryIntersectionObserver) {
        galleryIntersectionObserver.disconnect();
        galleryIntersectionObserver = null;
    }
    
    isLoadingMore = false;
}

/**
 * 갤러리 데이터 로드 (초기 로드)
 */
export async function loadGalleryData() {
    if(cachedGalleryLogs.length === 0) {
        const container = document.getElementById('gallery-container');
        container.innerHTML = '<p style="text-align:center; font-size:13px;">데이터를 불러오는 중입니다...</p>';
        
        const { todayStr, yesterdayStr } = getDatesInfo();
        const user = auth.currentUser;
        const myId = user ? user.uid : "";
        
        if(user) {
            const userSnap = await getDoc(doc(db, "users", myId));
            if(userSnap.exists()) cachedMyFriends = userSnap.data().friends || [];
        }
        
        // 메모리 관리: MAX_CACHE_SIZE까지만 가져오기
        const q = query(collection(db, "daily_logs"), orderBy("date", "desc"), limit(MAX_CACHE_SIZE));
        const snapshot = await getDocs(q);
        
        let logsArray = [];
        snapshot.forEach(d => { logsArray.push({id: d.id, data: d.data()}); });
        
        // 캠시 크기 제한 (메모리 누수 방지)
        cachedGalleryLogs = logsArray.slice(0, MAX_CACHE_SIZE);

        // 공유 카드는 처음 한 번만 그림 (속도 개선)
        let myRecentLogs = []; 
        cachedGalleryLogs.forEach(item => { 
            if(item.data.userId === myId && (item.data.date === todayStr || item.data.date === yesterdayStr)) 
                myRecentLogs.push(item.data); 
        });
        
        if(user && myRecentLogs.length > 0) {
            document.getElementById('my-share-container').style.display = 'flex';
            const latest = myRecentLogs[0]; 
            document.getElementById('share-name').innerText = user.displayName;
            document.getElementById('share-date').innerText = latest.date.replace(/-/g, '. ');
            let points = 0;
            if(latest.awardedPoints?.diet) points += 10; 
            if(latest.awardedPoints?.exercise) points += 15; 
            if(latest.awardedPoints?.mind) points += 5;
            document.getElementById('share-point').innerText = points;

            // collectGalleryMedia 헬퍼 함수로 미디어 URL 수집
            let imgs = [];
            if(latest.diet) {
                ['breakfastUrl','lunchUrl','dinnerUrl','snackUrl'].forEach(k => { 
                    if(latest.diet[k]) imgs.push(latest.diet[k]); 
                });
            }
            if(latest.exercise) {
                if(latest.exercise.cardioList && latest.exercise.cardioList.length > 0) {
                    latest.exercise.cardioList.forEach(c => { if(c.imageUrl) imgs.push(c.imageUrl); });
                } else if(latest.exercise.cardioImageUrl) {
                    imgs.push(latest.exercise.cardioImageUrl);
                }
                if(latest.exercise.strengthList && latest.exercise.strengthList.length > 0) {
                    latest.exercise.strengthList.forEach(s => { if(s.videoUrl) imgs.push(s.videoUrl); });
                } else if(latest.exercise.strengthVideoUrl) {
                    imgs.push(latest.exercise.strengthVideoUrl);
                }
            }
            if(latest.sleepAndMind?.sleepImageUrl) imgs.push(latest.sleepAndMind.sleepImageUrl);
            
            // 중복 제거 및 null/undefined 필터링
            imgs = [...new Set(imgs)].filter(url => url && url.trim() !== '');
            
            const imgGrid = document.getElementById('share-imgs');
            imgGrid.innerHTML = '';
            
            // 모든 이미지를 한 번에 로드 후 한 번에 추가 (중복 방지)
            let htmlString = '';
            for (let i = 0; i < Math.min(imgs.length, 4); i++) {
                const b64 = await fetchImageAsBase64(imgs[i]);
                htmlString += `<img src="${b64}" alt="해빛 인증 사진 ${i+1}">`;
            }
            imgGrid.innerHTML = htmlString;
            
            if(imgs.length === 0) imgGrid.innerHTML = `<div style="font-size:12px; color:#888; padding:15px; background:rgba(255,255,255,0.8); border-radius:8px; grid-column: span 2;">텍스트 인증 완료!</div>`;
        } else {
            document.getElementById('my-share-container').style.display = 'none';
        }
    }
    
    // 무한 스크롤 초기화
    galleryDisplayCount = INITIAL_LOAD;
    renderFeedOnly();
    setupInfiniteScroll();
}

/**
 * 피드 렌더링 (필터링 + 무한 스크롤 적용)
 */
export async function renderFeedOnly() {
    const container = document.getElementById('gallery-container');
    container.innerHTML = '';
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const sentinel = document.getElementById('gallery-sentinel');

    let sortedLogs = [...cachedGalleryLogs];
    sortedLogs.sort((a, b) => {
        const aFr = cachedMyFriends.includes(a.data.userId); 
        const bFr = cachedMyFriends.includes(b.data.userId);
        return (aFr === bFr) ? 0 : aFr ? -1 : 1;
    });

    let visibleCount = 0;
    let renderedCount = 0;

    for (let i = 0; i < sortedLogs.length; i++) {
        const item = sortedLogs[i];
        const data = item.data;
        const isFriend = cachedMyFriends.includes(data.userId);
        
        // 헬퍼 함수 사용으로 중복 제거
        const media = collectGalleryMedia(data);
        const dietMediaHtml = media.dietHtml;
        const exerMediaHtml = media.exerciseHtml;
        const mindMediaHtml = media.mindHtml;
        const mindTextHtml = media.mindText;

        let contentHtml = ''; 
        let shouldShow = false;

        if (galleryFilter === 'all') {
            const allMedia = dietMediaHtml + exerMediaHtml + mindMediaHtml;
            if(allMedia) contentHtml += `<div class="gallery-photos">${allMedia}</div>`;
            if(mindTextHtml) contentHtml += mindTextHtml;
            if(allMedia || mindTextHtml) shouldShow = true;
        } else if (galleryFilter === 'diet') {
            if(dietMediaHtml) { contentHtml += `<div class="gallery-photos">${dietMediaHtml}</div>`; shouldShow = true; }
        } else if (galleryFilter === 'exercise') {
            if(exerMediaHtml) { contentHtml += `<div class="gallery-photos">${exerMediaHtml}</div>`; shouldShow = true; }
        } else if (galleryFilter === 'mind') {
            if(mindMediaHtml) contentHtml += `<div class="gallery-photos">${mindMediaHtml}</div>`;
            if(mindTextHtml) contentHtml += mindTextHtml;
            if(mindMediaHtml || mindTextHtml) shouldShow = true;
        }

        if(!shouldShow) continue; 
        visibleCount++;
        
        // 무한 스크롤: 표시 개수 제한
        if (renderedCount >= galleryDisplayCount) {
            continue;
        }
        renderedCount++;

        const rx = data.reactions || { heart: [], fire: [], clap: [] };
        const cHeart = rx.heart ? rx.heart.length : 0;
        const cFire = rx.fire ? rx.fire.length : 0;
        const cClap = rx.clap ? rx.clap.length : 0;
        // XSS 방지: 사용자 입력 이스케이프
        const safeName = escapeHtml(data.userName || '익명');
        const safeUserId = escapeHtml(data.userId || '');
        const safeDocId = escapeHtml(item.id || '');

        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.innerHTML = `
            <div class="gallery-header">
                <div class="gallery-header-info">
                    <span class="gallery-name">${isFriend ? '⭐️ ' : ''}${safeName}</span>
                    <span class="gallery-date">${data.date.replace(/-/g, '. ')}</span>
                </div>
                ${data.userId !== myId ? `<button class="friend-btn ${isFriend ? 'is-friend' : ''}" onclick="toggleFriend('${safeUserId}')">${isFriend ? 'X 친구취소' : '⭐️ 친구맺기'}</button>` : ''}
            </div>
            ${contentHtml}
            <div class="gallery-actions">
                <button class="action-btn ${aHeart}" onclick="toggleReaction('${safeDocId}', 'heart', this)">❤️ <span>${cHeart}</span></button>
                <button class="action-btn ${aFire}" onclick="toggleReaction('${safeDocId}', 'fire', this)">🔥 <span>${cFire}</span></button>
                <button class="action-btn ${aClap}" onclick="toggleReaction('${safeDocId}', 'clap', this)">👏 <span>${cClap}</span></button>
            </div>
        `;
        container.appendChild(card);
    }

    // 무한 스크롤 센티널 표시 여부 결정
    if (renderedCount >= visibleCount || visibleCount === 0) {
        sentinel.style.display = 'none';
        if (galleryIntersectionObserver) {
            galleryIntersectionObserver.disconnect();
        }
    } else {
        sentinel.style.display = 'block';
        // 옵저버가 설정되지 않았으면 설정
        if (!galleryIntersectionObserver) {
            setupInfiniteScroll();
        }
    }

    if(visibleCount === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:20px; background:#f9f9f9; border-radius:8px;">해당하는 기록이 없습니다.</p>';
    }
}

/**
 * 갤러리 비디오 재생
 * data-video-src에 저장된 원본 URL(#t 없음)로 교체 후 처음부터 재생
 */
window.playGalleryVideo = function(wrapper) {
    const video = wrapper.querySelector('video');
    const originalSrc = wrapper.getAttribute('data-video-src');
    wrapper.classList.add('playing');
    video.muted = false;
    video.controls = true;
    // #t=0.1 프래그먼트가 없는 원본 URL로 교체하여 처음부터 재생
    if (originalSrc) {
        video.src = originalSrc;
    }
    video.currentTime = 0;
    video.play();
    wrapper.onclick = null;
};
