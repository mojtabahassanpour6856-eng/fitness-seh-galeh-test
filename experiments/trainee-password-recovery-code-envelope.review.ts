// Review-only encrypted recovery-code envelope. No delivery or persistence implementation.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}
function fromB64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
  if (b64url(bytes) !== value) throw new Error("non-canonical base64url");
  return bytes;
}
function parseExpiry(expiresAt) {
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid expiry");
  return date.toISOString();
}
function associatedData(requestId, traineeId, expiresAt) {
  if (!requestId || !traineeId) throw new Error("missing binding identifiers");
  return encoder.encode([requestId, traineeId, parseExpiry(expiresAt)].join("|"));
}
function decodeKey(encoded) {
  const bytes = fromB64url(encoded);
  if (bytes.length !== 32) throw new Error("AES key must be 32 bytes");
  return bytes;
}
export async function encryptCode(code, keyB64, requestId, traineeId, expiresAt) {
  if (typeof code !== "string" || !/^\\d{4}$/.test(code)) throw new Error("code must be four digits");
  const key = await crypto.subtle.importKey("raw", decodeKey(keyB64), "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: associatedData(requestId, traineeId, expiresAt), tagLength: 128 }, key, encoder.encode(code));
  return { nonce: b64url(nonce), ciphertext: b64url(new Uint8Array(encrypted)) };
}
export async function decryptCode(envelope, keyB64, requestId, traineeId, expiresAt) {
  if (!envelope || typeof envelope !== "object") throw new Error("invalid envelope");
  const nonce = fromB64url(envelope.nonce);
  const ciphertext = fromB64url(envelope.ciphertext);
  if (nonce.length !== 12 || ciphertext.length !== 20) throw new Error("invalid envelope size");
  const key = await crypto.subtle.importKey("raw", decodeKey(keyB64), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: associatedData(requestId, traineeId, expiresAt), tagLength: 128 }, key, ciphertext);
  const code = decoder.decode(plaintext);
  if (!/^\\d{4}$/.test(code)) throw new Error("invalid decrypted payload");
  return code;
}
