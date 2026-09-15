import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce.js';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls the function once after the delay when called once', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('collapses multiple rapid calls into a single invocation', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced();
        vi.advanceTimersByTime(500);
        debounced();
        vi.advanceTimersByTime(500);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes the arguments of the last call through', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced('first');
        debounced('second');

        vi.advanceTimersByTime(1000);
        expect(fn).toHaveBeenCalledWith('second');
    });

    it('cancel() prevents a pending call from firing', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced();
        debounced.cancel();

        vi.advanceTimersByTime(1000);
        expect(fn).not.toHaveBeenCalled();
    });
});
