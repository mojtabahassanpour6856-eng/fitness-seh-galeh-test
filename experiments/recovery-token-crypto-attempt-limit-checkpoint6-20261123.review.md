# Recovery token cryptography and attempt-limit review checkpoint 6
Date: 2026-11-23

## Scope
Static read-only inspection of experimental recovery RPC SQL and encrypted-delivery SQL. No execution, migrations, database mutations, real SMS, Auth updates, or deployment.

## Findings

### F-1 — Wrong-attempt threshold is caller-controlled within 1..10 (medium, requires hardening)
`recovery_private.record_recovery_wrong_attempt(p_request_id,p_submitted_digest,p_max_attempts)` accepts a threshold argument and validates only that it is between 1 and 10. The update expires the request based on that parameter. Since the public wrapper is intended to be service_role-only, the risk is principally Edge Function/configuration misuse, but a caller can choose 10 instead of the intended 5 and increase guess budget. Recommendation: enforce the recovery policy in the function (constant 5 or a controlled server-side config), remove the threshold parameter from public wrapper, and add boundary tests for 4th/5th/6th attempts and concurrency.

### F-2 — Wrong-attempt recording does not require SMS delivery outcome 'sent' (low-to-medium)
The wrong-attempt update filters approved state, non-null token hash, and unexpired token, but not `delivery_outcome='sent'`. Reset claim does require delivery_outcome='sent', so this is not a direct reset bypass; however, it permits attempts to consume/expire a token before confirmed delivery. Recommendation: add the sent-state condition or prove the Edge Function never invokes this RPC until send confirmation; prefer DB-side invariant.

### F-3 — Key identifier consistency (low, validation gap)
Encrypted coach-review validates `p_hmac_key_version` and envelope `kid` independently but the inspected SQL does not enforce equality. The Edge code may bind them; verify that it always chooses the correct encryption key and HMAC key versions and that rotation is explicit. Recommendation: document the two key namespaces or enforce intended relationship in the Edge validation layer; test old-key/new-key rotation.

## Positive controls
- Token digest and code digest inputs are required to be 64 lowercase hexadecimal characters where reset claim validates digest format.
- Reset claim checks active trainee, not archived, valid trainee auth id, matching normalized phone, approved request, matching digest, expiry, attempt threshold (<5), and confirmed SMS delivery outcome 'sent'.
- Coach approval checks coach role, coach-to-trainee assignment, active approval, and not archived; approved token expiry is capped at 20 minutes.
- Encrypted delivery payload shape is constrained to five envelope keys, A256GCM, 12-byte IV encoding, ciphertext/tag length consistent with a 4-digit code, and a key id format. The envelope shape alone does not prove encryption authenticity or key secrecy; cryptographic verification remains Edge-side and must be tested.

## Tests required before acceptance
- Policy threshold is immutable server-side and 5 attempts lock/expire.
- Correct digest never increments wrong-attempt counter; wrong digest increments exactly once under concurrency.
- Attempts are blocked when delivery is not confirmed sent.
- Expiry and terminal-state clearing.
- Coach identity forged via client input is rejected by Edge identity binding.
- AES-GCM ciphertext authentication fails for modified IV, ciphertext, tag, AAD, request id, or delivery-operation id.
- Key rotation and unknown key id fail closed.
- No code/token/plaintext enters logs or error responses.

## Status
Static cryptographic/state-machine review only. Gates 1 and 3 remain incomplete; no tests executed. No changes to database, SMS, Auth, Edge Functions, main, or PR merge.
