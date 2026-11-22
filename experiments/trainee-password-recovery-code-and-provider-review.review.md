# Recovery code generation and provider-response review

Date: 2026-11-22
Scope: static review of TEST Edge Function v10; no deployment or provider call.

## 1. Four-digit code generation

Current TEST v10 code uses modulo reduction twice. This does not produce a perfectly uniform distribution over 10,000 values. The bias is small, but there is no reason to keep it in a security-sensitive recovery code.

Recommended replacement (review snippet only):

```ts
function randomCode() {
  const range = 0x1_0000_0000; // 2^32
  const limit = Math.floor(range / 10_000) * 10_000;
  const word = new Uint32Array(1);

  let value: number;
  do {
    crypto.getRandomValues(word);
    value = word[0];
  } while (value >= limit);

  return String(value % 10_000).padStart(4, "0");
}
```

Reason: reject the small tail of the 32-bit range that is not divisible by 10,000, then reduce the remaining evenly divisible range. The output remains a string with leading zeroes.

Deterministic unit tests should verify:
- Output is exactly four ASCII digits.
- Values 0000 and 9999 are representable.
- Rejection boundary is 4,294,960,000; values at or above it are rejected.
- Do not assert statistical uniformity from a small sample; inject a fake word source to test rejection logic.

## 2. Provider response must not be guessed

The current Edge Function accepts ambiguous response shapes: HTTP 2xx with empty/unrecognized JSON may pass; meta.code is checked only if present; data.succeed is checked only if explicitly false.

This is not a reliable contract. The official Mediana pattern-send documentation reviewed so far shows an example with no response body/headers and does not establish a stable message identifier for this endpoint.

Until Mediana confirms the exact live response contract:
- classify a valid but empty/ambiguous response as uncertain, not sent;
- do not retry the same code;
- do not reset the request to pending;
- require a new code and attempt UUID for any approved retry policy;
- never claim handset delivery from an HTTP response alone.

A definitive sent state should mean only that the provider accepted the request according to its documented success response, not that the handset received or read the SMS.

## 3. No real delivery tests yet

The future test suite must inject a fake transport and cover documented acceptance, definitive rejection, empty 2xx, malformed JSON, provider 5xx, connection reset, timeout after simulated provider acceptance, and late response from an old attempt UUID.

No test in this review made an HTTP request, read a secret, sent SMS, changed an Auth password, or deployed code.