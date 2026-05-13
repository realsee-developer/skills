const REDACTED = '[REDACTED]';
const REDACTED_QUERY = '[REDACTED_QUERY]';

const BEARER_PATTERN = /\b(Authorization\s*:\s*Bearer\s+)[^\s,;]+/gi;
const TOKEN_PAIR_PATTERN = /\b([A-Za-z0-9_-]*(?:token|secret)[A-Za-z0-9_-]*\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi;

export function redactText(value) {
  return String(value)
    .replace(BEARER_PATTERN, `$1${REDACTED}`)
    .replace(TOKEN_PAIR_PATTERN, `$1${REDACTED}`);
}

export function redactUrlForLog(value) {
  const input = String(value);

  try {
    const url = new URL(input);
    if (url.search) {
      url.search = `?${REDACTED_QUERY}`;
    }
    return url.toString();
  } catch {
    return redactText(input);
  }
}
