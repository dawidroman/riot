'use strict';

const VERSION = '1.5.0';
const SHELL_CACHE = `riot-shell-${VERSION}`;
const SCHEDULE_CACHE = 'riot-schedule-data';
const SCHEDULE_PATH = '/sample-schedule.csv';
const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon.svg',
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-128x128.png',
    '/icons/icon-144x144.png',
    '/icons/icon-152x152.png',
    '/icons/icon-192x192.png',
    '/icons/icon-384x384.png',
    '/icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const shellCache = await caches.open(SHELL_CACHE);
        await shellCache.addAll(APP_SHELL);

        try {
            const scheduleResponse = await fetch(SCHEDULE_PATH, { cache: 'no-store' });
            if (scheduleResponse.ok) {
                const scheduleCache = await caches.open(SCHEDULE_CACHE);
                await scheduleCache.put(SCHEDULE_PATH, scheduleResponse);
            }
        } catch (error) {
            // A schedule saved by an older release remains available in the stable data cache.
            console.warn('Schedule could not be refreshed during install:', error);
        }

        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
            .filter((cacheName) => cacheName.startsWith('riot-')
                && cacheName !== SHELL_CACHE
                && cacheName !== SCHEDULE_CACHE)
            .map((cacheName) => caches.delete(cacheName)));
        await self.clients.claim();
    })());
});

async function addSourceHeader(response, source) {
    const headers = new Headers(response.headers);
    headers.set('X-Riot-Schedule-Source', source);
    return new Response(await response.arrayBuffer(), {
        headers,
        status: response.status,
        statusText: response.statusText
    });
}

async function networkFirstSchedule(request) {
    const cache = await caches.open(SCHEDULE_CACHE);
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Schedule request returned ${response.status}.`);
        await cache.put(SCHEDULE_PATH, response.clone());
        return addSourceHeader(response, 'network');
    } catch (error) {
        const cached = await cache.match(SCHEDULE_PATH);
        if (cached) return addSourceHeader(cached, 'cache');
        throw error;
    }
}

async function cacheFirstShell(request) {
    const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;

    try {
        return await fetch(request);
    } catch (error) {
        if (request.mode === 'navigate') {
            const fallback = await caches.match('/index.html');
            if (fallback) return fallback;
        }
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname === SCHEDULE_PATH) {
        event.respondWith(networkFirstSchedule(request));
        return;
    }

    event.respondWith(cacheFirstShell(request));
});
