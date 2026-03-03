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
const INITIAL_LOAD = 8;       // 초기 로드: 8개 (최소한 빠르게)
const LOAD_MORE = 6;          // 추가 로드: 6개씩
const MAX_CACHE_SIZE = 50;    // 캐시 크기
let galleryIntersectionObserver = null;
let isLoadingMore = false;
// 정렬 캐시 (매번 재정렬 방지)
let sortedFilteredCache = [];
let sortedFilteredDirty = true;

// 현재 필터 상태 (전역에서 접근 가능하도록)
export let galleryFilter = 'all';

/**
 * 갤러리 필터 설정
 */
export function setGalleryFilter(filter) {
    galleryFilter = filter;
    sortedFilteredDirty = true;
}

/**
 * 스켈레톤 카드 HTML 생성
 */
function createSkeletonHtml(count = 3) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="gallery-card skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton-avatar"></div>
                <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                    <div class="skeleton-text w60"></div>
                    <div class="skeleton-text w40"></div>
                </div>
            </div>
            <div class="gallery-skeleton">
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
            </div>
        </div>`;
    }
    return html;
}

/**
 * 아이템에 미디어가 있는지 빠르게 판단 (HTML 생성 없이)
 */
function hasMediaForFilter(data, filter) {
    if (filter === 'diet' || filter === 'all') {
        if (data.diet) {
            for (const meal of ['breakfast','lunch','dinner','snack']) {
                if (data.diet[`${meal}Url`]) return filter === 'diet' ? true : 'has';
            }
        }
        if (filter === 'diet') return false;
    }
    if (filter === 'exercise' || filter === 'all') {
        if (data.exercise) {
            if (data.exercise.cardioImageUrl) return filter === 'exercise' ? true : 'has';
            if (data.exercise.strengthVideoUrl) return filter === 'exercise' ? true : 'has';
            if (data.exercise.cardioList?.length) return filter === 'exercise' ? true : 'has';
            if (data.exercise.strengthList?.length) return filter === 'exercise' ? true : 'has';
        }
        if (filter === 'exercise') return false;
    }
    if (filter === 'mind' || filter === 'all') {
        if (data.sleepAndMind?.sleepImageUrl || data.sleepAndMind?.gratitude) return filter === 'mind' ? true : 'has';
        if (filter === 'mind') return false;
    }
    return filter === 'all' ? false : false;
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

    // 식단 미디어 (썸네일 우선, 원본 폴백)
    if(data.diet) {
        ['breakfast','lunch','dinner','snack'].forEach(meal => {
            const origUrl = data.diet[`${meal}Url`];
            const thumbUrl = data.diet[`${meal}ThumbUrl`];
            if(origUrl && isValidStorageUrl(origUrl)) {
                const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(origUrl);
                const full = escapeHtml(origUrl);
                result.dietHtml += `<img src="${src}" onclick="openLightbox('${full}')" alt="${meal} 식사 사진" loading="lazy" decoding="async">`;
            }
        });
    }

    // 운동 미디어 (중복 제거, 썸네일 우선)
    if(data.exercise) {
        let addedUrls = new Set();
        const addImg = (url, thumbUrl) => {
            if(url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(url);
                const full = escapeHtml(url);
                result.exerciseHtml += `<img src="${src}" onclick="openLightbox('${full}')" alt="운동 인증 사진" loading="lazy" decoding="async">`;
                addedUrls.add(url);
            }
        };
        const addVid = (url, thumbUrl) => {
            if(url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                const safeUrl = escapeHtml(url);
                if (thumbUrl && isValidStorageUrl(thumbUrl)) {
                    // 썸네일 이미지로 표시, 클릭 시 영상 재생
                    const safeThumb = escapeHtml(thumbUrl);
                    result.exerciseHtml += `<div class="video-thumb-wrapper" onclick="playGalleryVideo(this)" data-video-src="${safeUrl}"><img src="${safeThumb}" alt="운동 영상 썸네일" loading="lazy" decoding="async"><div class="video-play-btn">&#9654;</div></div>`;
                } else {
                    // 썸네일 없으면 기존 방식 (video 태그로 프레임 추출)
                    result.exerciseHtml += `<div class="video-thumb-wrapper" onclick="playGalleryVideo(this)" data-video-src="${safeUrl}"><video src="${safeUrl}#t=0.1" preload="metadata" muted playsinline aria-label="운동 영상"></video><div class="video-play-btn">&#9654;</div></div>`;
                }
                addedUrls.add(url);
            }
        };
        
        addImg(data.exercise.cardioImageUrl, data.exercise.cardioImageThumbUrl);
        addVid(data.exercise.strengthVideoUrl, data.exercise.strengthVideoThumbUrl);
        if(data.exercise.cardioList) data.exercise.cardioList.forEach(c => addImg(c.imageUrl, c.imageThumbUrl));
        if(data.exercise.strengthList) data.exercise.strengthList.forEach(s => addVid(s.videoUrl, s.videoThumbUrl));
    }

    // 마음 미디어 (썸네일 우선)
    if(data.sleepAndMind?.sleepImageUrl) {
        const url = data.sleepAndMind.sleepImageUrl;
        const thumbUrl = data.sleepAndMind.sleepImageThumbUrl;
        if (isValidStorageUrl(url)) {
            const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(url);
            const full = escapeHtml(url);
            result.mindHtml = `<img src="${src}" onclick="openLightbox('${full}')" alt="수면 기록 캡처" loading="lazy" decoding="async">`;
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
 * 아이템이 표시되어야 하는지 판단 (HTML 생성 없이 빠르게)
 */
export function shouldShowItem(data) {
    return !!hasMediaForFilter(data, galleryFilter);
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
 * 정렬+필터 캐시 갱신
 */
function refreshSortedFiltered() {
    if (!sortedFilteredDirty) return;
    let sorted = [...cachedGalleryLogs];
    sorted.sort((a, b) => {
        const aFr = cachedMyFriends.includes(a.data.userId);
        const bFr = cachedMyFriends.includes(b.data.userId);
        return (aFr === bFr) ? 0 : aFr ? -1 : 1;
    });
    sortedFilteredCache = sorted.filter(item => shouldShowItem(item.data));
    sortedFilteredDirty = false;
}

/**
 * 추가 아이템 로드 함수
 */
export function loadMoreGalleryItems() {
    if (isLoadingMore) return;
    
    refreshSortedFiltered();
    const sentinel = document.getElementById('gallery-sentinel');
    
    if (galleryDisplayCount >= sortedFilteredCache.length) {
        sentinel.style.display = 'none';
        return;
    }
    
    isLoadingMore = true;
    
    // 추가분만 append (전체 재렌더 X)
    const container = document.getElementById('gallery-container');
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const start = galleryDisplayCount;
    const end = Math.min(start + LOAD_MORE, sortedFilteredCache.length);
    
    for (let i = start; i < end; i++) {
        const card = buildGalleryCard(sortedFilteredCache[i], myId);
        if (card) container.appendChild(card);
    }
    
    galleryDisplayCount = end;
    isLoadingMore = false;
    
    if (galleryDisplayCount >= sortedFilteredCache.length) {
        sentinel.style.display = 'none';
        if (galleryIntersectionObserver) galleryIntersectionObserver.disconnect();
    } else {
        sentinel.style.display = 'block';
    }
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
 * 갤러리 데이터 로드 (초기 로드 - 스켈레톤 즉시 표시)
 */
export async function loadGalleryData() {
    const container = document.getElementById('gallery-container');
    
    if(cachedGalleryLogs.length === 0) {
        // 즉시 스켈레톤 표시 (체감 로딩 0ms)
        container.innerHTML = createSkeletonHtml(4);
        
        const { todayStr, yesterdayStr } = getDatesInfo();
        const user = auth.currentUser;
        const myId = user ? user.uid : "";
        
        if(user) {
            const userSnap = await getDoc(doc(db, "users", myId));
            if(userSnap.exists()) cachedMyFriends = userSnap.data().friends || [];
        }
        
        const q = query(collection(db, "daily_logs"), orderBy("date", "desc"), limit(MAX_CACHE_SIZE));
        const snapshot = await getDocs(q);
        
        let logsArray = [];
        snapshot.forEach(d => { logsArray.push({id: d.id, data: d.data()}); });
        cachedGalleryLogs = logsArray.slice(0, MAX_CACHE_SIZE);
        sortedFilteredDirty = true;

        // 공유 카드는 비동기로 뒤에서 로드 (갤러리 피드 먼저)
        buildShareCardAsync(myId, todayStr, yesterdayStr, user);
    }
    
    // 피드 즉시 렌더링
    galleryDisplayCount = 0;
    container.innerHTML = '';
    
    refreshSortedFiltered();
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const end = Math.min(INITIAL_LOAD, sortedFilteredCache.length);
    
    for (let i = 0; i < end; i++) {
        const card = buildGalleryCard(sortedFilteredCache[i], myId);
        if (card) container.appendChild(card);
    }
    
    galleryDisplayCount = end;
    
    const sentinel = document.getElementById('gallery-sentinel');
    if (galleryDisplayCount >= sortedFilteredCache.length) {
        sentinel.style.display = 'none';
    } else {
        sentinel.style.display = 'block';
    }
    
    if (sortedFilteredCache.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:20px; background:#f9f9f9; border-radius:8px;">해당하는 기록이 없습니다.</p>';
    }
    
    setupInfiniteScroll();
}

/**
 * 갤러리 카드 DOM 생성
 */
function buildGalleryCard(item, myId) {
    const data = item.data;
    const isFriend = cachedMyFriends.includes(data.userId);
    
    const media = collectGalleryMedia(data);
    let contentHtml = '';
    let shouldShow = false;

    if (galleryFilter === 'all') {
        const allMedia = media.dietHtml + media.exerciseHtml + media.mindHtml;
        if(allMedia) contentHtml += `<div class="gallery-photos">${allMedia}</div>`;
        if(media.mindText) contentHtml += media.mindText;
        if(allMedia || media.mindText) shouldShow = true;
    } else if (galleryFilter === 'diet') {
        if(media.dietHtml) { contentHtml += `<div class="gallery-photos">${media.dietHtml}</div>`; shouldShow = true; }
    } else if (galleryFilter === 'exercise') {
        if(media.exerciseHtml) { contentHtml += `<div class="gallery-photos">${media.exerciseHtml}</div>`; shouldShow = true; }
    } else if (galleryFilter === 'mind') {
        if(media.mindHtml) contentHtml += `<div class="gallery-photos">${media.mindHtml}</div>`;
        if(media.mindText) contentHtml += media.mindText;
        if(media.mindHtml || media.mindText) shouldShow = true;
    }
    
    if(!shouldShow) return null;

    const rx = data.reactions || { heart: [], fire: [], clap: [] };
    const cHeart = rx.heart ? rx.heart.length : 0;
    const cFire = rx.fire ? rx.fire.length : 0;
    const cClap = rx.clap ? rx.clap.length : 0;
    const aHeart = (rx.heart && rx.heart.includes(myId)) ? 'reacted' : '';
    const aFire = (rx.fire && rx.fire.includes(myId)) ? 'reacted' : '';
    const aClap = (rx.clap && rx.clap.includes(myId)) ? 'reacted' : '';
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
    return card;
}

/**
 * 공유 카드 비동기 로드 (갤러리 피드 렌더링 차단하지 않음)
 */
async function buildShareCardAsync(myId, todayStr, yesterdayStr, user) {
    try {
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

            // 공유 카드용 이미지 - 썸네일 우선
            let imgs = [];
            if(latest.diet) {
                ['breakfast','lunch','dinner','snack'].forEach(meal => { 
                    const thumb = latest.diet[`${meal}ThumbUrl`];
                    const orig = latest.diet[`${meal}Url`];
                    if(thumb) imgs.push(thumb);
                    else if(orig) imgs.push(orig);
                });
            }
            if(latest.exercise) {
                if(latest.exercise.cardioList && latest.exercise.cardioList.length > 0) {
                    latest.exercise.cardioList.forEach(c => { 
                        if(c.imageThumbUrl) imgs.push(c.imageThumbUrl);
                        else if(c.imageUrl) imgs.push(c.imageUrl); 
                    });
                } else if(latest.exercise.cardioImageUrl) {
                    imgs.push(latest.exercise.cardioImageThumbUrl || latest.exercise.cardioImageUrl);
                }
                if(latest.exercise.strengthList && latest.exercise.strengthList.length > 0) {
                    latest.exercise.strengthList.forEach(s => { 
                        if(s.videoThumbUrl) imgs.push(s.videoThumbUrl);
                        else if(s.videoUrl) imgs.push(s.videoUrl); 
                    });
                } else if(latest.exercise.strengthVideoUrl) {
                    imgs.push(latest.exercise.strengthVideoThumbUrl || latest.exercise.strengthVideoUrl);
                }
            }
            if(latest.sleepAndMind?.sleepImageUrl) imgs.push(latest.sleepAndMind.sleepImageThumbUrl || latest.sleepAndMind.sleepImageUrl);
            
            imgs = [...new Set(imgs)].filter(url => url && url.trim() !== '');
            
            const imgGrid = document.getElementById('share-imgs');
            imgGrid.innerHTML = '';
            
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
    } catch(e) {
        console.warn('공유 카드 로드 실패:', e.message);
        document.getElementById('my-share-container').style.display = 'none';
    }
}

/**
 * 피드 렌더링 (필터 변경 시 전체 재빌드)
 */
export async function renderFeedOnly() {
    const container = document.getElementById('gallery-container');
    container.innerHTML = '';
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const sentinel = document.getElementById('gallery-sentinel');

    refreshSortedFiltered();
    
    const end = Math.min(INITIAL_LOAD, sortedFilteredCache.length);
    
    for (let i = 0; i < end; i++) {
        const card = buildGalleryCard(sortedFilteredCache[i], myId);
        if (card) container.appendChild(card);
    }
    
    galleryDisplayCount = end;

    if (galleryDisplayCount >= sortedFilteredCache.length || sortedFilteredCache.length === 0) {
        sentinel.style.display = 'none';
        if (galleryIntersectionObserver) {
            galleryIntersectionObserver.disconnect();
        }
    } else {
        sentinel.style.display = 'block';
        if (!galleryIntersectionObserver) {
            setupInfiniteScroll();
        }
    }

    if(sortedFilteredCache.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:20px; background:#f9f9f9; border-radius:8px;">해당하는 기록이 없습니다.</p>';
    }
}

/**
 * 갤러리 비디오 재생
 * 썸네일 이미지가 있으면 video 태그로 교체 후 재생
 */
window.playGalleryVideo = function(wrapper) {
    let video = wrapper.querySelector('video');
    const originalSrc = wrapper.getAttribute('data-video-src');
    
    // 썸네일 img만 있는 경우 → video 태그로 교체
    if (!video && originalSrc) {
        const thumbImg = wrapper.querySelector('img');
        if (thumbImg) thumbImg.style.display = 'none';
        video = document.createElement('video');
        video.playsInline = true;
        wrapper.insertBefore(video, wrapper.querySelector('.video-play-btn'));
    }
    
    wrapper.classList.add('playing');
    video.muted = false;
    video.controls = true;
    if (originalSrc) {
        video.src = originalSrc;
    }
    video.currentTime = 0;
    video.play();
    wrapper.onclick = null;
};
