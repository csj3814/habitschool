/**
 * Service Worker - 해빛스쿨 PWA
 * 오프라인 캐싱 및 백그라운드 동기화
 */

const CACHE_NAME = 'habitschool-v9';
const STATIC_ASSETS = [
    './',
    './',
    './styles.css',
    './js/main.js',
    './js/app.js',
    './js/auth.js',
    './js/firebase-config.js',
    './js/data-manager.js',
    './js/ui-helpers.js',
    './js/security.js',
    './js/blockchain-config.js',
    './js/blockchain-manager.js',
    './manifest.json',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];

const INDEX_URL = new URL('./', self.location).href;

// 설치: 정적 자산 캐싱
self.addEventListener('install', (event) => {
    console.log('[SW] 설치 시작');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] 정적 자산 캐싱');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 활성화: 구 캐시 정리
self.addEventListener('activate', (event) => {
    console.log('[SW] 활성화');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] 구 캐시 삭제:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// 네트워크 요청 처리 (Network First, Cache Fallback)
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Firebase API 및 외부 CDN은 캐싱하지 않음
    if (
        request.url.includes('firebasestorage.googleapis.com') ||
        request.url.includes('firebaseio.com') ||
        request.url.includes('googleapis.com/identitytoolkit') ||
        request.url.includes('gstatic.com/firebasejs') ||
        request.url.includes('cdn.jsdelivr.net') ||
        request.method !== 'GET'
    ) {
        return; // 기본 네트워크 동작 사용
    }

    // 정적 자산: Cache First
    const reqUrl = new URL(request.url);
    if (STATIC_ASSETS.some(asset => {
        const assetUrl = new URL(asset, self.location);
        return reqUrl.origin === assetUrl.origin && reqUrl.pathname === assetUrl.pathname;
    })) {
        event.respondWith(
            caches.match(request)
                .then(cached => cached || fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                }))
                .catch(() => caches.match(INDEX_URL))
        );
        return;
    }

    // 기타 요청: Network First, Cache Fallback
    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok && request.url.startsWith(self.location.origin)) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});

// 푸시 알림 수신
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const options = {
            body: data.body || '새로운 알림이 있습니다.',
            icon: data.icon || './icons/icon-192.svg',
            badge: './icons/icon-192.svg',
            tag: data.tag || 'habitschool-notification',
            data: { url: data.url || '/' },
            vibrate: [100, 50, 100],
            actions: [
                { action: 'open', title: '열기' },
                { action: 'close', title: '닫기' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title || '해빛스쿨', options)
        );
    } catch (e) {
        console.error('[SW] 푸시 처리 오류:', e);
    }
});

// 푸시 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // 이미 열린 탭이 있으면 포커스
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // 새 탭 열기
                return self.clients.openWindow(url);
            })
    );
});
