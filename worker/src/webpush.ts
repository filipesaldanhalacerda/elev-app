/**
 * Web Push (RFC 8291/8292) com WebCrypto — sem dependências.
 * VAPID ES256 + cifra aes128gcm. Chaves vêm de VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY
 * (base64url, P-256). Em dev, sem chaves configuradas, o envio é registrado e pulado.
 */

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const b64uToBytes = (s: string): Uint8Array => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const bytesToB64u = (b: ArrayBuffer | Uint8Array): string => {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

async function vapidJwt(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const url = new URL(endpoint);
  const header = bytesToB64u(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64u(
    new TextEncoder().encode(
      JSON.stringify({ aud: `${url.protocol}//${url.host}`, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })
    )
  );
  const pub = b64uToBytes(publicKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    d: privateKey,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${bytesToB64u(sig)}`;
}

async function encryptPayload(sub: PushSubscriptionRecord, payload: string): Promise<{ body: Uint8Array }> {
  const clientPub = b64uToBytes(sub.keys.p256dh);
  const authSecret = b64uToBytes(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const clientKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, local.privateKey, 256));

  const keyInfo = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...clientPub, ...localPubRaw]);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const record = new Uint8Array([...new TextEncoder().encode(payload), 2]); // delimitador 0x02
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  // cabeçalho aes128gcm: salt(16) | rs(4) | idlen(1) | keyid(65)
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  header.set(localPubRaw, 21);
  return { body: new Uint8Array([...header, ...cipher]) };
}

export interface PushEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

/** Envia um push. Sem chaves VAPID (dev), retorna "skipped". */
export async function sendWebPush(env: PushEnv, sub: PushSubscriptionRecord, payload: Record<string, unknown>): Promise<"sent" | "skipped" | "gone" | "failed"> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return "skipped";
  try {
    const jwt = await vapidJwt(sub.endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT ?? "mailto:admin@elev.app");
    const { body } = await encryptPayload(sub, JSON.stringify(payload));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
