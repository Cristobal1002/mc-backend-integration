/**
 * Cola global para peticiones a Siigo: espacia llamadas y reintenta 429.
 * Evita ráfagas concurrentes que disparan rate limit.
 */

const MIN_INTERVAL_MS = Number(process.env.SIIGO_MIN_REQUEST_INTERVAL_MS) || 450;
const MAX_RETRIES_429 = Number(process.env.SIIGO_RATE_LIMIT_MAX_RETRIES) || 6;
const MAX_BACKOFF_MS = Number(process.env.SIIGO_RATE_LIMIT_MAX_BACKOFF_MS) || 30000;

let lastRequestAt = 0;
let chain = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (headers = {}) => {
    const raw = headers['retry-after'] ?? headers['Retry-After'];
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(MAX_BACKOFF_MS, seconds * 1000);
    }
    const dateMs = Date.parse(raw);
    if (Number.isFinite(dateMs)) {
        return Math.min(MAX_BACKOFF_MS, Math.max(0, dateMs - Date.now()));
    }
    return 0;
};

/**
 * Ejecuta una petición HTTP a Siigo en serie (con intervalo mínimo) y reintenta 429.
 * @param {() => Promise<any>} requestFn
 * @param {{ operation?: string }} meta
 */
export const executeSiigoRequest = (requestFn, { operation = 'siigo-api' } = {}) => {
    const run = async () => {
        const waitMs = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
        if (waitMs > 0) {
            await sleep(waitMs);
        }
        lastRequestAt = Date.now();

        let attempt = 0;
        while (true) {
            try {
                return await requestFn();
            } catch (error) {
                const status = error?.response?.status;
                if (status !== 429 || attempt >= MAX_RETRIES_429) {
                    throw error;
                }

                attempt += 1;
                const retryAfterMs = parseRetryAfterMs(error.response?.headers);
                const exponentialMs = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
                const backoffMs = Math.max(retryAfterMs, exponentialMs);

                console.warn(
                    `[Siigo] Rate limit 429 en "${operation}". ` +
                    `Reintento ${attempt}/${MAX_RETRIES_429} en ${backoffMs}ms`
                );
                await sleep(backoffMs);
                lastRequestAt = Date.now();
            }
        }
    };

    const scheduled = chain.then(run, run);
    chain = scheduled.catch(() => {});
    return scheduled;
};
