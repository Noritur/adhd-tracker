/* Service worker for web push notifications.
 *
 * Scope: '/' (registered from layout).
 * No offline caching — minimal SW just to receive push and forward
 * notificationclick to the right URL.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "ритм",
    body: "є щось нове",
    url: "/today",
    tag: "default",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    tag: payload.tag,
    icon: "/apple-icon",
    badge: "/apple-icon",
    data: { url: payload.url },
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/today";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        // If app already open — focus the first window and navigate it.
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(target).catch(() => {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
        return null;
      }),
  );
});
