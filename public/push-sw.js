/* Push no SO (tela 25): título com o FATO, corpo com o próximo passo, ícone "e". */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Elev", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Elev", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: payload,
      tag: payload.kind ?? "elev",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const kind = event.notification.data?.kind;
  const url = kind === "alerta_atingido" ? "/alertas" : kind === "card_delegado" || kind === "lembrete_diario" ? "/cards" : "/notificacoes";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return clients.openWindow(url);
    })
  );
});
