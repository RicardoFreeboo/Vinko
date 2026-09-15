import * as Sentry from "@sentry/nextjs";

// Sentry — runtime Edge (middleware, edge routes). DSN EU. Sin PII por defecto.
const DSN =
  process.env.SENTRY_DSN ??
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  "https://abf66c80e1a11752b0e158549af773ab@o4512090299760640.ingest.de.sentry.io/4512090301923408";

Sentry.init({
  dsn: DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
