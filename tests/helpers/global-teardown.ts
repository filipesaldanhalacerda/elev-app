/**
 * Rede de segurança contra lixo na base: mesmo com retries (que reexecutam o
 * beforeAll num processo novo, com outro RUN, driblando o afterAll do spec),
 * nenhuma sala de teste sobrevive ao fim da bateria.
 *
 * Regra de reconhecimento: sala de teste sempre termina no carimbo numérico do
 * RUN (4+ dígitos). Salas do escritório — "Sala 1", "Sala 2" — nunca casam.
 */
import { serviceClient } from "./seed";

export default async function globalTeardown() {
  const svc = serviceClient();
  const { data: rooms } = await svc.from("rooms").select("id, name");
  const garbage = (rooms ?? []).filter((r) => /\d{4,}$/.test(r.name as string));
  if (garbage.length === 0) return;
  // reservas caem por cascade (reservations.room_id on delete cascade)
  await svc.from("rooms").delete().in("id", garbage.map((r) => r.id));
  console.log(`[teardown] ${garbage.length} sala(s) de teste removida(s) — a base fica só com as salas do escritório.`);
}
