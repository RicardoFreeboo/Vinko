"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";

// Web push (§5). La clave pública VAPID es pública por diseño (va en el
// cliente); la privada vive SOLO en los secretos de la Edge Function.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BB1K-nDyk0AAka5FfVTxqi3TP1ALOMYZPpThstvfSXM3inp1-4vfyAOALeER32r8ydOhUXYTMi96MlZB-kSjn2w";

function b64ToUint8(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch { return null; }
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const sb = supabaseBrowser();
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const j = sub.toJSON();
  await sb.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh: j.keys?.p256dh ?? "",
    auth: j.keys?.auth ?? "",
    ua: navigator.userAgent.slice(0, 200),
    last_seen: new Date().toISOString(),
    revoked_at: null,
  }, { onConflict: "endpoint" });
}

// Revalidar en CADA apertura (iOS cancela suscripciones en silencio, §5.1.2):
// si el permiso está concedido y no hay suscripción viva, re-suscribe.
export async function ensurePushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  if (Notification.permission !== "granted") return;
  const reg = await registerSW();
  if (!reg) return;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    } catch { return; }
  }
  await saveSubscription(sub);
}

// Prompt nativo — SOLO tras el pre-prompt propio aceptado (§5.2).
export async function requestPushPermission(): Promise<boolean> {
  if (!pushSupported()) return false;
  capture("push_prompt_shown", { is_seed: false });
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    capture("push_permission_granted", { is_seed: false });
    await ensurePushSubscription();
    return true;
  }
  capture("push_permission_denied", { is_seed: false });
  return false;
}
