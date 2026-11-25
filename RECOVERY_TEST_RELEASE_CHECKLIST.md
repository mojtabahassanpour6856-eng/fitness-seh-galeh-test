# No-SMS password recovery — TEST mirror release checklist

Target repository: `mojtabahassanpour6856-eng/fitness-seh-galeh-test`
Target Supabase project: `udptdznbvewkublvzmtm` (`fitness-seh-galeh-test`)
GitHub Pages origin: `https://mojtabahassanpour6856-eng.github.io`

## Product contract
- A trainee can request recovery before signing in.
- The request is associated with the normalized registered phone and the browser-held 256-bit claim.
- The coach reviews the request while signed in; coach ownership is enforced server-side.
- The coach never receives or sees the recovery code.
- After approval, the four-digit code is retrievable only by the same browser claim and remains valid for exactly 24 hours from coach approval.
- No SMS or email is sent or received.
- Five wrong code attempts expire the code and erase its verifier/envelope.
- Password reset uses a single-use server-side lease; an ambiguous Auth result is quarantined and is not automatically retried.
- The approved login design and its image assets are frozen and must not be edited as part of this release.

## Ordered database migrations
Apply to TEST Supabase only, in this order:
1. `202611230001_no_sms_recovery_atomic_candidates.sql`
2. `202611240001_recovery_auth_ambiguity_fail_closed.sql`
3. `202611240002_pre_auth_recovery_claims.sql`

These migrations are additive to the recovery-request table and install the atomic RPCs used by the Edge Functions. Do not apply them to the Production project.

## Required TEST-only Edge Function secrets
Set these in Supabase Dashboard → Project `fitness-seh-galeh-test` → Edge Functions → Secrets:
- `RECOVERY_NO_SMS_ENABLED` = `true`
- `RECOVERY_ALLOWED_ORIGIN` = `https://mojtabahassanpour6856-eng.github.io`
- `RECOVERY_HMAC_PEPPER_B64URL` = a newly generated, unique 32-byte random secret encoded as unpadded base64url
- `RECOVERY_ENVELOPE_KEY_B64URL` = a separate, newly generated 32-byte random secret encoded as unpadded base64url

Generate the two random values separately on a trusted machine, for example:
```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```
Run the command twice; never reuse one value for both secrets. Do not commit the values, put them in client code, or send them in chat. The standard Supabase Edge Function environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are provided by the platform and must never be copied into the browser.

## Edge Function deployment modes
- `trainee-password-recovery`: deploy the mirror version with JWT verification enabled. It validates coach JWT and coach ownership in the handler too.
- `trainee-password-recovery-preauth`: deploy with gateway JWT verification disabled because the request starts before trainee sign-in. Its browser claim, rate limits, origin checks, and server-side authorization checks are mandatory.

The coach function imports `reset-attempt.ts`; deploy that dependency with the function. Never deploy the old SMS implementation or enable SMS delivery.

## Release verification
- Static security contract and Deno type-check pass.
- Disposable local Supabase + GoTrue E2E passes, including actual password change, old-password rejection, new-password login, replay rejection, coach isolation, browser claim isolation, five-attempt lockout, and the 24-hour approval window.
- TEST migrations are present in migration history; schema columns and privileged RPC grants are verified.
- Both Edge Functions are ACTIVE on the TEST project with the expected JWT modes.
- A no-JWT request with the TEST Pages Origin returns the generic 202 response; no account-existence detail is leaked.
- A synthetic TEST trainee can request recovery, the owning synthetic TEST coach can approve it, the same browser can retrieve the code, and the password can be changed.
- A different browser/claim and another coach cannot retrieve or act on the request.
- No SMS provider is called.
- Verify the published TEST Pages URL and manually check the complete flow on Android. Automated static checks and Pages HTTP 200 do not replace this device test.
- Do not merge the full mirror into TEST `main` or Production without the owner's separate release approval.
