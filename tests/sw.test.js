'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeHeaders {
    constructor(initial = {}) {
        this.values = new Map();
        if (initial instanceof FakeHeaders) {
            initial.values.forEach((value, key) => this.values.set(key, value));
        } else {
            Object.entries(initial).forEach(([key, value]) => this.set(key, value));
        }
    }

    set(key, value) {
        this.values.set(String(key).toLowerCase(), String(value));
    }

    get(key) {
        return this.values.get(String(key).toLowerCase()) || null;
    }
}

class FakeResponse {
    constructor(body, options = {}) {
        this.bodyText = Buffer.isBuffer(body) ? body.toString() : String(body);
        this.headers = options.headers instanceof FakeHeaders ? new FakeHeaders(options.headers) : new FakeHeaders(options.headers);
        this.status = options.status ?? 200;
        this.statusText = options.statusText || 'OK';
        this.ok = this.status >= 200 && this.status < 300;
    }

    clone() {
        return new FakeResponse(this.bodyText, {
            headers: this.headers,
            status: this.status,
            statusText: this.statusText
        });
    }

    async arrayBuffer() {
        return Buffer.from(this.bodyText);
    }
}

function createWorkerContext() {
    const stored = new Map();
    let networkResponse = new FakeResponse('fresh schedule');
    const cache = {
        async put(key, response) {
            stored.set(typeof key === 'string' ? key : key.url, response.clone());
        },
        async match(key) {
            const response = stored.get(typeof key === 'string' ? key : key.url);
            return response ? response.clone() : undefined;
        },
        async addAll() {}
    };
    const listeners = new Map();
    const context = vm.createContext({
        Buffer,
        console,
        Headers: FakeHeaders,
        Response: FakeResponse,
        URL,
        caches: {
            async open() { return cache; },
            async keys() { return []; },
            async match(key) { return cache.match(key); },
            async delete() { return true; }
        },
        fetch: async () => {
            if (networkResponse instanceof Error) throw networkResponse;
            return networkResponse.clone();
        },
        self: {
            location: { origin: 'https://example.test' },
            clients: { async claim() {} },
            async skipWaiting() {},
            addEventListener(type, handler) { listeners.set(type, handler); }
        }
    });
    vm.runInContext(fs.readFileSync('sw.js', 'utf8'), context);
    return {
        context,
        failNetwork() { networkResponse = new Error('offline'); }
    };
}

test('schedule requests are network-first and mark confirmed network responses', async () => {
    const worker = createWorkerContext();
    const response = await vm.runInContext(
        'networkFirstSchedule({ url: "https://example.test/sample-schedule.csv" })',
        worker.context
    );
    assert.equal(response.bodyText, 'fresh schedule');
    assert.equal(response.headers.get('X-Riot-Schedule-Source'), 'network');
});

test('schedule requests fall back to the saved CSV and identify it as cached', async () => {
    const worker = createWorkerContext();
    await vm.runInContext(
        'networkFirstSchedule({ url: "https://example.test/sample-schedule.csv" })',
        worker.context
    );
    worker.failNetwork();
    const response = await vm.runInContext(
        'networkFirstSchedule({ url: "https://example.test/sample-schedule.csv" })',
        worker.context
    );
    assert.equal(response.bodyText, 'fresh schedule');
    assert.equal(response.headers.get('X-Riot-Schedule-Source'), 'cache');
});
