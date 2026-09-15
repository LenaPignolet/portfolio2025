import { describe, expect, it } from 'vitest';
import { computeNotionSignature, verifyNotionSignature } from './notionWebhookSignature.js';

const SECRET = 'test-secret-not-a-real-notion-token';
const BODY = '{"verification_token":"test-secret-not-a-real-notion-token"}';

describe('computeNotionSignature', () => {
    it('produces a sha256= prefixed hex digest', () => {
        const signature = computeNotionSignature(BODY, SECRET);

        expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('is deterministic for the same body and secret', () => {
        expect(computeNotionSignature(BODY, SECRET)).toBe(computeNotionSignature(BODY, SECRET));
    });
});

describe('verifyNotionSignature', () => {
    it('accepts a correctly signed payload', () => {
        const signature = computeNotionSignature(BODY, SECRET);

        expect(verifyNotionSignature(BODY, signature, SECRET)).toBe(true);
    });

    it('rejects a payload signed with the wrong secret', () => {
        const signature = computeNotionSignature(BODY, 'wrong-secret');

        expect(verifyNotionSignature(BODY, signature, SECRET)).toBe(false);
    });

    it('rejects a tampered body', () => {
        const signature = computeNotionSignature(BODY, SECRET);
        const tamperedBody = BODY.replace('secret_t', 'secret_x');

        expect(verifyNotionSignature(tamperedBody, signature, SECRET)).toBe(false);
    });

    it('rejects when the signature header is missing', () => {
        expect(verifyNotionSignature(BODY, null, SECRET)).toBe(false);
        expect(verifyNotionSignature(BODY, undefined, SECRET)).toBe(false);
    });

    it('rejects when the secret is missing', () => {
        const signature = computeNotionSignature(BODY, SECRET);

        expect(verifyNotionSignature(BODY, signature, undefined)).toBe(false);
    });

    it('rejects a malformed signature without throwing', () => {
        expect(verifyNotionSignature(BODY, 'not-a-valid-signature', SECRET)).toBe(false);
    });
});
