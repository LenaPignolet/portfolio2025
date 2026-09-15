import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test-secret';
const ROUTE_PATH = './notion.js';

vi.mock('../../../utils/fetchNotionProjects.js', () => ({
    fetchNotionProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../utils/projectsCache.js', () => ({
    refreshProjectsCache: vi.fn().mockResolvedValue({ projects: [], updatedAt: Date.now() }),
}));

function sign(body) {
    return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function buildRequest(body, headers = {}) {
    return new Request('http://localhost/api/webhooks/notion', {
        method: 'POST',
        headers,
        body,
    });
}

describe('POST /api/webhooks/notion', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.stubEnv('NOTION_WEBHOOK_SECRET', SECRET);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it('accepts the one-time verification handshake without a signature', async () => {
        const { POST } = await import(ROUTE_PATH);
        const body = JSON.stringify({ verification_token: 'secret_abc' });

        const response = await POST({ request: buildRequest(body) });

        expect(response.status).toBe(200);
    });

    it('rejects events with a missing or invalid signature', async () => {
        const { POST } = await import(ROUTE_PATH);
        const body = JSON.stringify({ type: 'page.properties_updated' });

        const response = await POST({
            request: buildRequest(body, { 'X-Notion-Signature': 'sha256=invalid' }),
        });

        expect(response.status).toBe(401);
    });

    it('rejects malformed JSON bodies before checking the signature', async () => {
        const { POST } = await import(ROUTE_PATH);

        const response = await POST({ request: buildRequest('not json') });

        expect(response.status).toBe(400);
    });

    it('accepts a correctly signed event and schedules a debounced cache refresh', async () => {
        const { POST } = await import(ROUTE_PATH);
        const { refreshProjectsCache } = await import('../../../utils/projectsCache.js');
        const body = JSON.stringify({ type: 'page.properties_updated' });

        const response = await POST({
            request: buildRequest(body, { 'X-Notion-Signature': sign(body) }),
        });

        expect(response.status).toBe(200);
        expect(refreshProjectsCache).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(3000);

        expect(refreshProjectsCache).toHaveBeenCalledTimes(1);
    });

    it('collapses several signed events received within the debounce window into one refresh', async () => {
        const { POST } = await import(ROUTE_PATH);
        const { refreshProjectsCache } = await import('../../../utils/projectsCache.js');
        const body = JSON.stringify({ type: 'page.properties_updated' });
        const signedRequest = () => buildRequest(body, { 'X-Notion-Signature': sign(body) });

        await POST({ request: signedRequest() });
        await vi.advanceTimersByTimeAsync(1000);
        await POST({ request: signedRequest() });

        await vi.advanceTimersByTimeAsync(3000);

        expect(refreshProjectsCache).toHaveBeenCalledTimes(1);
    });
});
