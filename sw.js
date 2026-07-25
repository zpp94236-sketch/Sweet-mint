const CACHE_NAME = 'tianbo-v2';
const CORE_ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
    );
});

function isCoreAsset(url) {
    return url.pathname.endsWith('/') ||
        url.pathname.endsWith('/index.html') ||
        url.pathname.endsWith('/styles.css') ||
        url.pathname.endsWith('/app.js') ||
        url.pathname.endsWith('/manifest.json');
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.pathname.includes('/chat/completions') || url.pathname.includes('/models')) return;

    // 核心文件（HTML/CSS/JS）：network-first，确保每次更新部署后用户能拿到最新版；
    // 离线或请求失败时才回退到缓存，保证离线可用。
    if (req.mode === 'navigate' || isCoreAsset(url)) {
        event.respondWith(
            fetch(req).then(resp => {
                if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
                }
                return resp;
            }).catch(() => caches.match(req))
        );
        return;
    }

    // 其它资源（图片等）：cache-first，减少流量消耗
    event.respondWith(
        caches.match(req).then(cached => {
            if (cached) return cached;
            return fetch(req).then(resp => {
                if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
                }
                return resp;
            }).catch(() => cached);
        })
    );
});
