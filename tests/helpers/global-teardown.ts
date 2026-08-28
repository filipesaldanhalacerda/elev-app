/**
 * Rede de segurança contra lixo na base: a bateria não pode deixar rastro na base que o
 * PO usa para testar com os clientes REAIS da XP — nem, jamais, levar dado real embora.
 *
 * Mesmo com retries (que reexecutam o beforeAll num processo novo, com outro RUN,
 * driblando o afterAll de cada spec), nada de teste sobrevive ao fim da corrida.
 *
 * Como se reconhece o que é de teste, sem chutar:
 *  - cliente real aparece em relatório importado (last_seen_import preenchido em toda
 *    importação, inclusive reimportação); cliente de teste é inserido direto e nunca tem;
 *  - usuário de teste usa @elev.test — menos a dupla do seed (Rafael e Bruno), que é
 *    demonstração permanente;
 *  - sala de teste termina no carimbo numérico do RUN ("Sala 1"/"Sala 2" nunca casam);
 *  - importação real é um dos 4 relatórios essenciais da XP, pelo nome do arquivo.
 *
 * TRAVA: se a regra apontar uma fatia grande da base de clientes, o teardown NÃO apaga —
 * avisa e sai. Perder cliente real é muito pior do que sobrar cliente de teste.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient, supabaseEnv } from "./seed";

const SEED_EMAILS = ["rafael.moura@elev.test", "bruno.salles@elev.test"];
const RELATORIOS_REAIS = [
  "Positivador - 50191 - Ref.17.03.26.xlsx",
  "Relatório Positivador - Semana 03 Março.xlsx",
  "Diversificacao - 50191 - Ref.17.03.26.xlsx",
  "Captacao - 50191 - Ref.17.03.26.xlsx",
  "Codigo_CAIO.A73908_RelatorioSaldoConsolidado_202603.xlsx",
];
const LIMITE_SEGURO = 0.25; // acima disso a regra é suspeita, não é lixo

// tabelas que apontam para clients.account_code SEM cascade (as com cascade não entram)
const DEPENDENTES_CONTA = [
  "alert_events", "alerts", "balances", "cards", "google_events",
  "movements", "positions", "positivador_snapshots", "reservations",
];

async function apagarClientes(svc: SupabaseClient, contas: string[]) {
  for (const tabela of DEPENDENTES_CONTA) {
    const { error } = await svc.from(tabela).delete().in("account_code", contas);
    if (error) console.log(`[teardown] aviso ao limpar ${tabela}: ${error.message}`);
  }
  const { error } = await svc.from("clients").delete().in("account_code", contas);
  if (error) console.log(`[teardown] aviso ao limpar clients: ${error.message}`);
}

/** Solta o que aponta para o usuário sem cascade — senão auth.deleteUser é recusado. */
async function soltarVinculosDoUsuario(svc: SupabaseClient, ids: string[]) {
  const alvos: [string, string[]][] = [
    ["cards", ["creator", "assignee"]],
    ["reservations", ["owner"]],
    ["timeline_notes", ["author"]],
    ["access_codes", ["created_by"]],
    ["client_extras", ["updated_by"]],
    ["auto_alert_settings", ["updated_by"]],
  ];
  for (const [tabela, colunas] of alvos) {
    for (const coluna of colunas) {
      const { error } = await svc.from(tabela).delete().in(coluna, ids);
      if (error) console.log(`[teardown] aviso ao limpar ${tabela}.${coluna}: ${error.message}`);
    }
  }
  // importações dos relatórios REAIS ficam na base, mesmo tendo sido refeitas por um
  // usuário de teste (o spec e5 reimporta os arquivos de verdade): apagá-las derrubaria
  // o vínculo dos 800+ clientes reais com a importação. Só o dono é transferido.
  const { data: dono } = await svc.from("profiles").select("id").eq("role", "admin").not("email", "like", "%@elev.test").limit(1);
  const { data: importsDeTeste } = await svc.from("imports").select("id, file_name").in("created_by", ids);
  for (const imp of importsDeTeste ?? []) {
    if (RELATORIOS_REAIS.includes(imp.file_name as string) && dono?.[0]) {
      await svc.from("imports").update({ created_by: dono[0].id }).eq("id", imp.id);
    } else {
      const { error } = await svc.from("imports").delete().eq("id", imp.id);
      if (error) console.log(`[teardown] aviso ao limpar imports: ${error.message}`);
    }
  }

  // o painel do MetaTrader é linha única: guarda quem mexeu, então só desfaz o vínculo
  const { data: mt } = await svc.from("mt_connection").select("updated_by").eq("id", 1).single();
  if (mt?.updated_by && ids.includes(mt.updated_by as string)) {
    await svc.from("mt_connection").update({ updated_by: null }).eq("id", 1);
  }
}

export default async function globalTeardown() {
  // TRAVA MAIOR: limpeza só na base LOCAL de desenvolvimento. Apontado para uma base
  // publicada (carga de dados reais, demonstração), o teardown não encosta em nada.
  const alvo = supabaseEnv().url;
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\d+\.\d+\.\d+\.\d+)(:|\/|$)/.test(alvo)) {
    console.log(`[teardown] base remota (${alvo}) — nada foi apagado, por segurança.`);
    return;
  }
  const svc = serviceClient();
  const limpo: string[] = [];

  // 1) salas de teste (reservas caem por cascade)
  const { data: rooms } = await svc.from("rooms").select("id, name");
  const salasLixo = (rooms ?? []).filter((r) => /\d{4,}$/.test(r.name as string));
  if (salasLixo.length > 0) {
    const { error } = await svc.from("rooms").delete().in("id", salasLixo.map((r) => r.id));
    if (error) console.log(`[teardown] aviso ao limpar salas: ${error.message}`);
    else limpo.push(`${salasLixo.length} sala(s)`);
  }

  // 2) usuários de teste — o cascade leva tarefas, alertas, notificações e reservas deles
  const { data: profiles } = await svc.from("profiles").select("id, email");
  const usuariosLixo = (profiles ?? []).filter(
    (p) => (p.email as string).endsWith("@elev.test") && !SEED_EMAILS.includes(p.email as string)
  );
  if (usuariosLixo.length > 0) {
    const ids = usuariosLixo.map((u) => u.id as string);
    await soltarVinculosDoUsuario(svc, ids);
    let removidos = 0;
    for (const id of ids) {
      const { error } = await svc.auth.admin.deleteUser(id);
      if (error) console.log(`[teardown] aviso ao remover usuário: ${error.message}`);
      else removidos++;
    }
    if (removidos > 0) limpo.push(`${removidos} usuário(s)`);
  }

  // 3) clientes que nunca estiveram num relatório importado — com trava de segurança
  const { data: todos } = await svc.from("clients").select("account_code, last_seen_import");
  const total = (todos ?? []).length;
  const candidatos = (todos ?? []).filter((c) => c.last_seen_import === null).map((c) => c.account_code as string);
  if (candidatos.length > 0 && total > 0) {
    if (candidatos.length / total > LIMITE_SEGURO && candidatos.length > 20) {
      console.log(
        `[teardown] ABORTADO na limpeza de clientes: ${candidatos.length} de ${total} contas sem vínculo de importação ` +
          `(mais de ${Math.round(LIMITE_SEGURO * 100)}% da base). Isso não parece lixo de teste — nada foi apagado. ` +
          `Se a base perdeu o vínculo, reimporte os relatórios com "npm run dados:reais".`
      );
    } else {
      await apagarClientes(svc, candidatos);
      limpo.push(`${candidatos.length} cliente(s)`);
    }
  }

  // 4) importações de teste: real é só um dos relatórios essenciais da XP
  const { data: imports } = await svc.from("imports").select("id, file_name");
  const importsLixo = (imports ?? []).filter((i) => !RELATORIOS_REAIS.includes(i.file_name as string));
  if (importsLixo.length > 0) {
    const { error } = await svc.from("imports").delete().in("id", importsLixo.map((i) => i.id));
    if (error) console.log(`[teardown] aviso ao limpar importações: ${error.message}`);
    else limpo.push(`${importsLixo.length} importação(ões)`);
  }

  if (limpo.length > 0) console.log(`[teardown] base devolvida limpa — removido: ${limpo.join(" · ")}.`);
}
