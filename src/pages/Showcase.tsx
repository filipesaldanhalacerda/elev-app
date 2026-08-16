/**
 * /showcase — vitrine interna da biblioteca (E2), com os MESMOS exemplos dos
 * quadros #2b–#2i para comparação lado a lado. Não é uma tela do produto.
 */
import { useState } from "react";
import { Button } from "../components/Button";
import { TextField, PasswordField, MoneyField, TextareaField, Toggle, Checkbox, Radio } from "../components/Field";
import { ClientSearch } from "../components/ClientSearch";
import { Card, MarketTickerStrip, ClientCard, AlertCard, TaskCard, QuoteCard, KpiCard } from "../components/cards";
import { LineChart, Sparkline, Donut } from "../components/charts";
import { DenseTable, CollapseList } from "../components/table";
import { KanbanColumn, KanbanCard } from "../components/kanban";
import { MobileHeader, Tabs, BottomNav, AdminSidebar } from "../components/navigation";
import { Toast, Banner, Modal, StatusChip, MarketChip } from "../components/feedback";
import { SkeletonBar, SkeletonListItem, EmptyState, NotificationList, AgendaGrid, SegmentedSmall } from "../components/states";
import { setThemePreference, getThemePreference } from "../lib/theme";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} data-showcase={id} style={{ marginBottom: 40 }}>
      <h2 className="type-section" style={{ marginBottom: 12 }}>
        {id} · {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>{children}</div>
    </section>
  );
}

export default function Showcase() {
  const [busca, setBusca] = useState("bert");
  const [toggles, setToggles] = useState({ push: true, off: false });
  const [checked, setChecked] = useState(true);
  const [tab, setTab] = useState("Visão geral");

  const resultados = [
    { account: "12.884-7", name: "Ana Bertoldi", patrimony: 4812330, monthPct: 1.4 },
    { account: "30.117-2", name: "Carlos Bertrand", patrimony: 918740.55, monthPct: -0.6 },
  ];

  return (
    <div style={{ padding: "24px var(--gutter) 80px", maxWidth: 1180, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 className="type-title">Biblioteca de componentes</h1>
        <span style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" size={36} onClick={() => setThemePreference("claro")} aria-pressed={getThemePreference() === "claro"}>
            Claro
          </Button>
          <Button variant="secondary" size={36} onClick={() => setThemePreference("escuro")}>
            Escuro
          </Button>
        </span>
      </header>

      <Section id="2b" title="Botões">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button>Salvar</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Ver todos</Button>
          <Button variant="destructive" icon="icon-ban">Desativar</Button>
          <Button variant="icon" icon="icon-plus" aria-label="Adicionar" />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button disabled>Salvar</Button>
          <Button variant="secondary" disabled>Cancelar</Button>
          <Button loading>Salvando</Button>
          <Button variant="secondary" loading>Testando</Button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button size={36}>36 · densidade admin</Button>
          <Button size={44}>44 · padrão mobile</Button>
          <Button size={52}>52 · ação única</Button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button icon="icon-plus">Novo alerta</Button>
          <Button variant="secondary" trailingIcon="icon-chevron-down">Período</Button>
          <Button variant="secondary" icon="icon-message-circle" style={{ color: "var(--ghost-text)" }}>WhatsApp</Button>
        </div>
        <Button block data-testid="btn-block">Entrar</Button>
      </Section>

      <Section id="2c" title="Campos e controles">
        <TextField label="Nome completo" defaultValue="Ana Bertoldi" />
        <PasswordField label="Senha" defaultValue="12345678" />
        <TextField label="Código de assessor · erro" mono defaultValue="A-0" error="Código deve ter 5 dígitos." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <TextField label="Data" tabular defaultValue="15/08/2026" trailingIcon="icon-calendar" />
          <TextField label="Hora" tabular defaultValue="14:30" trailingIcon="icon-clock" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <TextField label="Seleção" defaultValue="Assessor" trailingIcon="icon-chevron-down" readOnly />
          <MoneyField label="Valor monetário" defaultValue="250.000,00" />
        </div>
        <TextareaField label="Observações · desabilitado" disabled defaultValue="Somente leitura para o perfil assessor." />
        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Toggle checked={toggles.push} onChange={(v) => setToggles((t) => ({ ...t, push: v }))} label="Push ativo" />
            <span className="type-label" style={{ fontWeight: 400, fontSize: 12.5 }}>Push ativo</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Toggle checked={toggles.off} onChange={(v) => setToggles((t) => ({ ...t, off: v }))} label="Inativo" />
            <span className="type-label" style={{ fontWeight: 400, fontSize: 12.5, color: "var(--text-2)" }}>Inativo</span>
          </span>
          <Checkbox checked={checked} onChange={setChecked} label="Marcado" />
          <Checkbox checked={false} label="Vazio" />
          <Radio checked label="Alta" />
        </div>
      </Section>

      <Section id="2d" title="Busca de cliente">
        <ClientSearch value="" onChange={() => {}} results={[]} />
        <ClientSearch value={busca} onChange={setBusca} onClear={() => setBusca("")} results={resultados} />
        <ClientSearch value="carregando" loading />
        <ClientSearch value="bertz" emptyTerm="bertz" />
      </Section>

      <Section id="2e" title="Cards de dado, ticker e KPI">
        <MarketTickerStrip
          items={[
            { code: "IBOV", price: "134.287", changePct: 0.81 },
            { code: "WDOU26", price: "5.412,50", changePct: 0.42 },
            { code: "PETR4", price: "38,42", changePct: -1.12 },
            { code: "VALE3", price: "61,08", changePct: 0.35 },
          ]}
        />
        <ClientCard name="Ana Bertoldi" account="12.884-7" suitability="arrojado" patrimony={4812330} monthPct={1.4} />
        <AlertCard ticker="PETR4" direction="alta" currentPrice={38.42} dayChangePct={-1.12} targetPrice={41} progress={0.62} remainingPct={6.7} />
        <TaskCard title="Rebalancear carteira — renda variável" meta="Ana Bertoldi · venceu 14/08 · prioridade alta" assignee="Rafael Moura" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <QuoteCard ticker="WDOU26" price="5.412,50" changePct={0.42} high="5.431,00" low="5.388,50" />
          <KpiCard label="Captação líquida · agosto" value="R$ 1,84 mi" context={<><span className="market-up">+12,4%</span>vs julho</>} />
        </div>
      </Section>

      <Section id="2f" title="Tabela, colapso e gráficos">
        <DenseTable
          columns={[
            { key: "cliente", label: "Cliente", width: "1.5fr", sorted: true },
            { key: "conta", label: "Conta", align: "right" },
            { key: "patrimonio", label: "Patrimônio", align: "right" },
            { key: "mes", label: "Mês", align: "right", width: ".8fr" },
          ]}
          rows={[
            { cliente: { value: "Ana Bertoldi", name: true }, conta: { value: "12.884-7", muted: true }, patrimonio: { value: "R$ 4.812.330,00", strong: true }, mes: { value: "+1,4%", market: "up" } },
            { cliente: { value: "Ricardo Nakamura", name: true }, conta: { value: "08.442-1", muted: true }, patrimonio: { value: "R$ 12.480.905,10", strong: true }, mes: { value: "+0,9%", market: "up" } },
            { cliente: { value: "Carlos Bertrand", name: true }, conta: { value: "30.117-2", muted: true }, patrimonio: { value: "R$ 918.740,55", strong: true }, mes: { value: "-0,6%", market: "down" } },
          ]}
          totalRow={{ cliente: { value: "Total · 42 clientes", strong: true }, patrimonio: { value: "R$ 184.220.117,00", strong: true }, mes: { value: "+1,1%", market: "up" } }}
        />
        <div style={{ maxWidth: 330 }}>
          <CollapseList
            rows={[
              { title: "Ana Bertoldi", sub: "12.884-7", value: "R$ 4.812.330,00", pct: { text: "+1,4%", up: true } },
              { title: "Carlos Bertrand", sub: "30.117-2", value: "R$ 918.740,55", pct: { text: "-0,6%", up: false } },
            ]}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 12 }}>
          <Card style={{ borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span className="kpi-card__label" style={{ fontSize: 11.5 }}>Evolução patrimonial · 12 meses</span>
              <span className="market-up" style={{ font: "500 11px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>+18,2%</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <LineChart points={[18, 22, 20, 32, 34, 44, 42, 54, 62, 60, 72, 78]} axis={["08/25", "02/26", "08/26"]} />
            </div>
          </Card>
          <Card style={{ borderRadius: 12, padding: 14 }}>
            <div className="kpi-card__label" style={{ fontSize: 11.5, marginBottom: 12 }}>Alocação</div>
            <Donut slices={[{ label: "Renda fixa", pct: 42 }, { label: "Ações", pct: 26 }, { label: "Fundos", pct: 18 }, { label: "Caixa", pct: 14 }]} />
          </Card>
        </div>
        <Card style={{ borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <span style={{ font: "600 12.5px/1 var(--font-mono)", color: "var(--text-1)" }}>PETR4</span>
          <Sparkline points={[10, 14, 11, 18, 15, 20, 16, 22, 19, 24, 21]} up={false} width={120} height={28} />
          <span style={{ font: "600 13px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>38,42</span>
          <span className="market-down" style={{ font: "500 11.5px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>-1,12%</span>
        </Card>
      </Section>

      <Section id="2g" title="Kanban e navegação">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <KanbanColumn title="Pendente" count={4}>
            <KanbanCard title="Rebalancear carteira" meta="Ana Bertoldi · 14/08" />
            <KanbanCard title="Ligar sobre COE" meta="arrastando…" dragging />
          </KanbanColumn>
          <KanbanColumn title="Em andamento" count={2} dropHint />
          <KanbanColumn title="Concluído" count={7}>
            <KanbanCard title="Enviar IR 2025" meta="Helena Prado · 12/08" done />
          </KanbanColumn>
        </div>
        <div className="table" style={{ borderRadius: 12 }}>
          <MobileHeader
            title="Ana Bertoldi"
            onBack={() => {}}
            actions={[{ icon: "icon-plus", label: "Adicionar" }, { icon: "icon-ellipsis-vertical", label: "Mais opções" }]}
          />
          <Tabs items={["Visão geral", "Carteira", "Movimentações", "Cadastro"]} active={tab} onChange={setTab} />
          <BottomNav active="inicio" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <AdminSidebar active="visao-geral" width={190} />
        </div>
      </Section>

      <Section id="2h" title="Feedback">
        <Toast action="Desfazer">
          Alerta criado para <code>PETR4</code> em R$ 41,00.
        </Toast>
        <Banner kind="danger" title="Não conseguimos falar com o MetaTrader" action="Testar">
          As cotações estão paradas desde 09:12. Verifique as credenciais.
        </Banner>
        <Banner kind="warning">Você está offline. Mostrando dados de 09:41.</Banner>
        <Banner kind="info">Importação do Positivador concluída às 07:15 — 1.284 registros.</Banner>
        <div style={{ background: "var(--scrim)", borderRadius: 16, padding: "22px 20px" }}>
          <Modal
            inline
            title="Desativar Bruno Salles?"
            id="assessor · código A-1042"
            impact={[
              { label: "Clientes vinculados", value: "18" },
              { label: "Cards em aberto", value: "5" },
            ]}
            note="Reversível — dá para reativar depois."
            actions={
              <>
                <Button variant="secondary">Cancelar</Button>
                <Button variant="destructive" icon="icon-ban">Desativar</Button>
              </>
            }
          >
            Ele perde o acesso na hora. O que estava no nome dele continua no sistema e precisa de novo responsável.
          </Modal>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <StatusChip kind="success">Ativo</StatusChip>
          <StatusChip kind="neutral">Inativo</StatusChip>
          <StatusChip kind="warning" dot={false}>Pendente</StatusChip>
          <StatusChip kind="info" dot={false}>Em andamento</StatusChip>
          <StatusChip kind="success" dot={false}>Concluído</StatusChip>
          <MarketChip up>+1,4%</MarketChip>
          <MarketChip up={false}>-0,6%</MarketChip>
          <StatusChip kind="success" icon="icon-plug-zap">Conectado</StatusChip>
          <StatusChip kind="danger" icon="icon-unplug">Desconectado</StatusChip>
        </div>
      </Section>

      <Section id="2i" title="Estados de sistema, notificações e agenda">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card style={{ borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SkeletonListItem />
              <SkeletonListItem />
            </div>
          </Card>
          <Card style={{ borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <SkeletonBar />
              <SkeletonBar width="88%" />
              <SkeletonBar width="94%" />
              <SkeletonBar height={52} radius={8} style={{ marginTop: 6 }} />
            </div>
          </Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <EmptyState title="Nada por aqui ainda" description="Crie o primeiro registro para começar." action="Criar" />
          <EmptyState error title="Não carregou" description="A conexão caiu no meio do caminho." action="Tentar de novo" />
        </div>
        <NotificationList
          groups={[
            {
              day: "Hoje · 15/08",
              items: [
                { id: "1", title: <>Alerta atingido — <code>PETR4</code> em R$ 41,00</>, time: "08:12", unread: true },
                { id: "2", title: "Bruno Salles delegou o card “Ligar sobre COE” para você", time: "07:02" },
              ],
            },
            {
              day: "Ontem · 14/08",
              items: [{ id: "3", title: "Importação do Positivador concluída — 1.284 registros", time: "07:15" }],
            },
          ]}
        />
        <Card style={{ borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Sala Ipê · 15/08</span>
            <SegmentedSmall items={["Manhã", "Tarde", "Dia"]} active="Manhã" />
          </div>
          <AgendaGrid
            slots={[
              { kind: "free", hour: "08:00" },
              { kind: "busy", hour: "09:00", title: "Revisão de carteira — Ana Bertoldi", meta: "09:00–10:00 · Rafael Moura" },
              { kind: "conflict", hour: "10:00", title: "Conflito — sala já reservada", meta: "Escolha 11:00 ou a sala Jacarandá" },
              { kind: "free", hour: "11:00", label: "Reservar" },
            ]}
          />
        </Card>
      </Section>
    </div>
  );
}
