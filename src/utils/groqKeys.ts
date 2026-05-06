const DEFAULT_GROQ_KEY_COOLDOWN_MS = 60_000;
const MIN_RETRY_AFTER_COOLDOWN_MS = 1_000;

interface GroqKeyEntry {
  key: string;
  index: number;
}

interface GroqFallbackContext extends GroqKeyEntry {
  attempt: number;
}

type RetryableOperation<T> = (apiKey: string, context: GroqFallbackContext) => Promise<T>;

const keyCooldownUntil = new Map<string, number>();

const parseKeyList = (value?: string) =>
  (value || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

const getConfiguredStartIndex = (keyCount: number) => {
  const selectedIndex = Number.parseInt(import.meta.env.VITE_GROQ_API_KEY_INDEX || '0', 10);
  if (Number.isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= keyCount) {
    return 0;
  }

  return selectedIndex;
};

export const getGroqApiKeys = () => {
  const keys = [
    ...parseKeyList(import.meta.env.VITE_GROQ_API_KEYS),
    ...parseKeyList(import.meta.env.VITE_GROQ_API_KEY)
  ];

  return Array.from(new Set(keys));
};

const getGroqApiKeyEntries = (): GroqKeyEntry[] =>
  getGroqApiKeys().map((key, index) => ({
    key,
    index
  }));

const getGroqApiKeyEntriesByPriority = () => {
  const entries = getGroqApiKeyEntries();
  if (!entries.length) return entries;

  const startIndex = getConfiguredStartIndex(entries.length);
  return [...entries.slice(startIndex), ...entries.slice(0, startIndex)];
};

const getErrorStatus = (error: unknown) => {
  if (error instanceof Response) return error.status;

  const possibleError = error as {
    status?: number;
    code?: number | string;
    response?: { status?: number };
  };

  if (typeof possibleError.status === 'number') return possibleError.status;
  if (typeof possibleError.response?.status === 'number') return possibleError.response.status;
  if (possibleError.code === 429 || possibleError.code === '429') return 429;

  return undefined;
};

const getHeaderValue = (error: unknown, headerName: string) => {
  const normalizedHeaderName = headerName.toLowerCase();

  if (error instanceof Response) {
    return error.headers.get(normalizedHeaderName);
  }

  const possibleError = error as {
    headers?: Headers | Record<string, string | string[] | undefined>;
    response?: { headers?: Headers | Record<string, string | string[] | undefined> };
  };

  const headerContainers = [possibleError.headers, possibleError.response?.headers].filter(Boolean);

  return headerContainers.reduce<string | undefined>((foundValue, headers) => {
    if (foundValue) return foundValue;

    if (headers instanceof Headers) {
      const value = headers.get(normalizedHeaderName);
      if (value) return value;
    } else if (headers && typeof headers === 'object') {
      const record = headers as Record<string, string | string[] | undefined>;
      const matchingKey = Object.keys(record).find((key) => key.toLowerCase() === normalizedHeaderName);
      const value = matchingKey ? record[matchingKey] : undefined;

      if (Array.isArray(value)) return value[0];
      if (value) return value;
    }

    return undefined;
  }, undefined);
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message.toLowerCase();

  try {
    return JSON.stringify(error).toLowerCase();
  } catch {
    return '';
  }
};

const getRetryAfterMs = (error: unknown) => {
  const retryAfterMs = getHeaderValue(error, 'retry-after-ms');
  if (retryAfterMs) {
    const retryAfterMsNumber = Number.parseFloat(retryAfterMs);
    if (!Number.isNaN(retryAfterMsNumber)) {
      return Math.max(retryAfterMsNumber, MIN_RETRY_AFTER_COOLDOWN_MS);
    }
  }

  const retryAfter = getHeaderValue(error, 'retry-after');
  if (!retryAfter) return DEFAULT_GROQ_KEY_COOLDOWN_MS;

  const retryAfterSeconds = Number.parseFloat(retryAfter);
  if (!Number.isNaN(retryAfterSeconds)) {
    return Math.max(retryAfterSeconds * 1000, MIN_RETRY_AFTER_COOLDOWN_MS);
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (!Number.isNaN(retryAfterDate)) {
    return Math.max(retryAfterDate - Date.now(), MIN_RETRY_AFTER_COOLDOWN_MS);
  }

  return DEFAULT_GROQ_KEY_COOLDOWN_MS;
};

const isGroqKeyCoolingDown = (key: string) => {
  const cooldownUntil = keyCooldownUntil.get(key);
  if (!cooldownUntil) return false;

  if (cooldownUntil <= Date.now()) {
    keyCooldownUntil.delete(key);
    return false;
  }

  return true;
};

const markGroqKeyRateLimited = (key: string, error: unknown) => {
  const cooldownMs = getRetryAfterMs(error);
  keyCooldownUntil.set(key, Date.now() + cooldownMs);
};

export const getSelectedGroqApiKey = () => {
  const entries = getGroqApiKeyEntriesByPriority();
  const healthyEntry = entries.find((entry) => !isGroqKeyCoolingDown(entry.key));
  return healthyEntry?.key || entries[0]?.key || '';
};

export const isGroqRateLimitError = (error: unknown) => {
  if (getErrorStatus(error) === 429) return true;

  const message = getErrorMessage(error);
  return (
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('ratelimit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded') ||
    message.includes('quota_exceeded') ||
    message.includes('exceeded your quota')
  );
};

export const withGroqFallback = async <T>(operation: RetryableOperation<T>): Promise<T> => {
  const entries = getGroqApiKeyEntriesByPriority();
  if (!entries.length) {
    throw new Error('No Groq API keys configured.');
  }

  let lastRateLimitError: unknown = null;
  const tryNextKey = async (remainingEntries: GroqKeyEntry[], attemptedKeys: number): Promise<T> => {
    const [entry, ...restEntries] = remainingEntries;

    if (!entry) {
      if (lastRateLimitError || attemptedKeys === 0) {
        throw new Error('All Groq API keys are currently rate limited.');
      }

      throw new Error('No healthy Groq API key is currently available.');
    }

    if (isGroqKeyCoolingDown(entry.key)) {
      return tryNextKey(restEntries, attemptedKeys);
    }

    const nextAttempt = attemptedKeys + 1;

    if (nextAttempt > 1) {
      console.warn('Retrying with fallback Groq key...');
    }

    try {
      return await operation(entry.key, {
        ...entry,
        attempt: nextAttempt
      });
    } catch (error) {
      if (!isGroqRateLimitError(error)) {
        throw error;
      }

      lastRateLimitError = error;
      markGroqKeyRateLimited(entry.key, error);
      console.warn('Groq key rate limited, switching to next key...');
      return tryNextKey(restEntries, nextAttempt);
    }
  };

  return tryNextKey(entries, 0);
};
