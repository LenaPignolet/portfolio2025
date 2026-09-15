import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeNotionSignature(rawBody, secret) {
    return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyNotionSignature(rawBody, signatureHeader, secret) {
    if (!signatureHeader || !secret) return false;

    const expected = computeNotionSignature(rawBody, secret);
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signatureHeader);

    if (expectedBuffer.length !== receivedBuffer.length) return false;

    return timingSafeEqual(expectedBuffer, receivedBuffer);
}
