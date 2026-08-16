/**
 * Web Push (RFC 8291/8292) com WebCrypto — sem dependências.
 * VAPID ES256 + cifra aes128gcm. Chaves vêm de VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY
 * (base64url, P-256). Em dev, sem chaves configuradas, o envio é registrado e pulado.
 */
export interface PushSubscriptionRecord {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}
export interface PushEnv {
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
}
/** Envia um push. Sem chaves VAPID (dev), retorna "skipped". */
export declare function sendWebPush(env: PushEnv, sub: PushSubscriptionRecord, payload: Record<string, unknown>): Promise<"sent" | "skipped" | "gone" | "failed">;
