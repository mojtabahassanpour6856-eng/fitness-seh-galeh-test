# Rate-limit storage and Mediana provider contract audit — REVIEW ONLY

Date: 2026-11-22  
Scope: TEST Supabase project `udptdznbvewkublvzmtm`, active Edge Function version 10, and Mediana public API documentation.  
No SMS request was sent; no secret was read; no database row was selected.

## 1. Private rate-limit storage

Catalog-only findings for `private.registration_rate_limits`:

- Owner: `postgres`.
- RLS enabled; FORCE RLS disabled.
- Explicit ACL: `postgres` only.
- Policy `deny_public_access_registration_rate_limits`: anon/authenticated, all commands, USING false, WITH CHECK false.
- Columns: `key_hash text`, `request_count integer`, `window_started_at timestamptz`, `updated_at timestamptz`.
- Primary key / unique index: `key_hash`.

This matches the intended architecture: the SECURITY DEFINER rate-limit function writes to the private table, while browser roles have no direct access. Preserve this policy and ACL. Do not query rate-limit rows or expose hashed phone-derived keys.

## 2. Official Mediana documentation findings

Official API documentation: https://apidoc.mediana.ir/

The documented Pattern SMS endpoint is:
`POST https://api.mediana.ir/sms/v1/send/pattern`

The documented request shape uses:
- `type`
- `recipients` (one recipient for pattern SMS)
- `patternCode`
- `parameters`

The current Edge Function's request body matches this documented shape and uses pattern code `815767` with `parameters.Code`.

Important documentation limitation: the official Pattern SMS example explicitly shows **no response body and no response headers**. The docs also describe status lookup endpoints:
- request-level status: `GET /sms/v1/send-requests/status/:requestId`
- SMS-item status: `GET /sms/v1/send-requests/status/sms-item/:smsId`
- list status: `GET /sms/v1/send-requests/status/sms-list?messageCodes=...`

The docs show a request ID / SMS item ID in examples for other send methods, but do not establish that the Pattern SMS endpoint returns those identifiers. Therefore the documented status endpoints cannot yet be relied on for the current pattern call unless Mediana confirms how to obtain a stable ID for pattern sends.

No documented idempotency-key contract was found in the reviewed API page. Do not claim exactly-once delivery.

## 3. Confirmed mismatch in active Edge Function v10

The active TEST function:
- sends Pattern SMS and then attempts `response.json()`;
- turns an empty/non-JSON body into `{}`;
- treats an empty 2xx response as success because `meta.code` is empty and `data.succeed` is not false;
- on network exception/timeout, resets the row from approved to pending and clears the token;
- on non-success response, also resets to pending and clears token.

This is unsafe for ambiguous outcomes. A timeout can happen after provider acceptance, and the official docs' empty-body example means empty response is not itself proof of failure or success. Current code may falsely claim delivery on empty 2xx and may create a duplicate request after an ambiguous timeout.

## 4. Required decision before code changes

Ask Mediana support to confirm, in writing:
1. Does Pattern SMS return a request ID or SMS item ID in production, despite the no-body example?
2. If not, is there an alternate endpoint/header/correlation mechanism to retrieve the created request?
3. Is an idempotency key or client reference accepted for Pattern SMS?
4. Which HTTP status + provider error codes guarantee the request was not accepted?
5. Can a request be looked up by a client-supplied reference?
6. Does the status endpoint report queued/sent/delivered/failed states for pattern messages?

Until confirmed:
- classify timeout, connection reset, malformed response, and empty 2xx as `uncertain`;
- do not revert to pending automatically;
- do not retry the same code blindly;
- require coach-triggered retry to rotate to a fresh code and invalidate the prior hash;
- do not display code to coach;
- only allow password reset when delivery state is positively confirmed as sent (or a documented equivalent acceptance state is explicitly approved).

## 5. No test call was made

No Mediana API call, test SMS, API-key read, or secret inspection was performed. Public documentation only was reviewed.

## 6. Safety boundary

No database mutation, migration, Edge Function source change/deployment, password change, SMS, PR merge, or production operation. This is a review note only.
