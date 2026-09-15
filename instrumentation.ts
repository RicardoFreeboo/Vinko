import * as Sentry from "@sentry/nextjs";

// Registro de Sentry en servidor (Node) y edge según el runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captura automática de errores de request en servidor (Next >= 8.28).
export const onRequestError = Sentry.captureRequestError;
