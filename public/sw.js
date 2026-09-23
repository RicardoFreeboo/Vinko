/* Vinko service worker — web push (§5).
   Regla iOS: SIEMPRE showNotification dentro de waitUntil; un push sin
   notificación visible hace que Safari revoque la suscripción. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Handler de fetch mínimo (pass-through): habilita el criterio de instalabilidad
// PWA en Chrome/Android. No intercepta nada: el navegador maneja cada request.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = { title: "Vinko", body: "", url: "/", class: "sistema" };
  try { data = { ...data, ...event.data.json() }; } catch { /* payload no JSON */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url, class: data.class },
      tag: "vinko-" + data.class,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
