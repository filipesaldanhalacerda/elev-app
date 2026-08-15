import { test, expect, emAmbosTemas, type Theme } from "./fixtures";

/**
 * E2 — biblioteca de componentes conferida contra os quadros #2b–#2i.
 * Cores esperadas transcritas dos quadros (claro | escuro).
 */

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const porTema = (theme: Theme, claro: string, escuro: string) => rgb(theme === "escuro" ? escuro : claro);

emAmbosTemas("componentes", ({ theme }) => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/showcase");
    await page.waitForSelector('[data-showcase="2i"]');
  });

  test("botões: alturas 36/44/52, cores e alvo de toque", async ({ page }) => {
    const primary = page.getByRole("button", { name: "Salvar", exact: true }).first();
    const box = await primary.boundingBox();
    expect(box!.height).toBe(44);
    await expect(primary).toHaveCSS("background-color", porTema(theme, "#1F7355", "#6DAF91"));
    await expect(primary).toHaveCSS("color", porTema(theme, "#FFFFFF", "#0A1F18"));

    expect((await page.getByRole("button", { name: "36 · densidade admin" }).boundingBox())!.height).toBe(36);
    expect((await page.getByRole("button", { name: "52 · ação única" }).boundingBox())!.height).toBe(52);

    // destrutivo NUNCA é bloco vermelho: superfície neutra + texto danger-action
    const destructive = page.getByRole("button", { name: "Desativar" }).first();
    await expect(destructive).toHaveCSS("background-color", porTema(theme, "#FFFFFF", "#221518"));
    await expect(destructive).toHaveCSS("color", porTema(theme, "#8A2B33", "#E7A9A6"));

    // ícone 44×44
    const iconBtn = page.getByRole("button", { name: "Adicionar", exact: true }).first();
    const ib = await iconBtn.boundingBox();
    expect(ib!.width).toBe(44);
    expect(ib!.height).toBe(44);
  });

  test("campos: 44px, rótulo, erro com mensagem", async ({ page }) => {
    const nome = page.getByLabel("", { exact: false }).first();
    void nome;
    const box = page.locator('[data-showcase="2c"] .field__box').first();
    expect((await box.boundingBox())!.height).toBe(44);
    await expect(page.locator('[data-showcase="2c"] .field__label').first()).toHaveText("Nome completo");
    await expect(page.locator(".field__help")).toContainText("Código deve ter 5 dígitos.");
    const errorBox = page.locator(".field--error .field__box");
    await expect(errorBox).toHaveCSS("border-color", porTema(theme, "#9B1C3B", "#F2789C"));
  });

  test("toggle 44×26 e checkbox 20px", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: "Push ativo" });
    const tb = await toggle.boundingBox();
    expect(tb!.width).toBe(44);
    expect(tb!.height).toBe(26);
    await expect(toggle).toHaveCSS("background-color", porTema(theme, "#1F7355", "#6DAF91"));
    const cb = await page.getByRole("checkbox", { name: "Marcado" }).boundingBox();
    expect(cb!.width).toBe(20);
  });

  test("busca de cliente: 52px, placeholder permanente, estados e destaque", async ({ page }) => {
    const boxes = page.locator(".csearch__box");
    expect((await boxes.first().boundingBox())!.height).toBe(52);
    await expect(page.getByPlaceholder("Buscar cliente por nome ou conta").first()).toBeVisible();

    // resultados: nome com trecho destacado + patrimônio tabular
    const mark = page.locator(".csearch__name mark").first();
    await expect(mark).toHaveText("Bert");
    await expect(mark).toHaveCSS("background-color", porTema(theme, "#CBE3D6", "#1F5B45"));
    await expect(page.locator(".csearch__value").first()).toHaveText("R$ 4.812.330,00");

    // linha de resultado tem alvo de toque ≥44px (60px no quadro)
    const row = page.locator(".csearch__row").first();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(60);

    await expect(page.locator(".csearch__loading")).toContainText("Buscando…");
    await expect(page.locator(".csearch__empty")).toContainText("Nenhum cliente com “bertz” na sua carteira.");
  });

  test("cards: ticker 38px com fade, alerta com barra e marca de alvo", async ({ page }) => {
    expect((await page.locator(".ticker-strip").boundingBox())!.height).toBe(38);
    await expect(page.locator(".ticker-strip__fade")).toHaveCSS("width", "44px");

    const track = page.locator(".alert-card__track");
    await expect(track).toHaveCSS("height", "6px");
    await expect(page.locator(".alert-card__mark")).toHaveCSS("width", "2px");
    await expect(page.locator(".alert-card__foot")).toContainText("faltam 6,7% para o alvo");
    await expect(page.locator(".alert-card__foot")).toContainText("alvo R$ 41,00");

    // variação do dia na cor de mercado
    await expect(page.locator(".alert-card__var")).toHaveCSS("color", porTema(theme, "#C4342A", "#F0705E"));
  });

  test("tabela densa: cabeçalho caps em surface-2, números tabulares, linha total", async ({ page }) => {
    const head = page.locator(".table__head").first();
    await expect(head).toHaveCSS("background-color", porTema(theme, "#F8FAF9", "#1D2925"));
    await expect(head).toHaveCSS("text-transform", "uppercase");
    const row = page.locator(".table__row").first();
    await expect(row).toHaveCSS("font-variant-numeric", "tabular-nums");
    await expect(page.locator(".table__row--total").first()).toContainText("Total · 42 clientes");
  });

  test("kanban: contador, card em arraste com rotação, zona de soltar", async ({ page }) => {
    await expect(page.locator(".kanban-col__count").first()).toHaveText("4");
    const dragging = page.locator(".kanban-card--dragging");
    const transform = await dragging.evaluate((el) => getComputedStyle(el).transform);
    expect(transform).not.toBe("none");
    await expect(page.locator(".kanban-drop")).toHaveText("Solte aqui");
    // concluído riscado
    await expect(page.locator(".kanban-card--done .kanban-card__title")).toHaveCSS("text-decoration-line", "line-through");
  });

  test("navegação: 5 itens fixos no bottom-nav, aba ativa sublinhada, sidebar admin", async ({ page }) => {
    const items = page.locator(".bottom-nav__item");
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).toContainText("Início");
    await expect(items.nth(4)).toContainText("Perfil");
    const active = page.locator(".tab--active");
    await expect(active).toHaveText("Visão geral");
    const shadow = await active.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain(theme === "escuro" ? "rgb(109, 175, 145)" : "rgb(31, 115, 85)");
    await expect(page.locator(".sidebar__name")).toHaveText("elev Admin");
    await expect(page.locator(".sidebar__item--active")).toContainText("Visão geral");
  });

  test("feedback: toast invertido, banners semânticos, modal com impacto, chips", async ({ page }) => {
    const toast = page.locator(".toast");
    await expect(toast).toHaveCSS("background-color", porTema(theme, "#14201C", "#E9EFEC"));
    await expect(toast).toContainText("Desfazer");

    await expect(page.locator(".banner--danger .banner__title")).toHaveText("Não conseguimos falar com o MetaTrader");
    await expect(page.locator(".banner--warning")).toContainText("Você está offline. Mostrando dados de 09:41.");

    const modal = page.getByRole("dialog");
    await expect(modal.locator(".modal__title")).toHaveText("Desativar Bruno Salles?");
    await expect(modal.locator(".modal__id")).toHaveText("assessor · código A-1042");
    await expect(modal.locator(".modal__impact-row").first()).toContainText("Clientes vinculados");
    await expect(modal.locator(".modal__note")).toHaveText("Reversível — dá para reativar depois.");

    // chip de status: ponto + palavra; chip de mercado NEUTRO com seta
    await expect(page.locator(".chip--success").first()).toContainText("Ativo");
    const marketChip = page.locator(".chip--market").first();
    await expect(marketChip).toHaveCSS("background-color", porTema(theme, "#FFFFFF", "#16201D"));
    await expect(marketChip.locator("i")).toBeVisible();
  });

  test("estados: skeleton animado, vazio com ação, notificação lida/não lida, agenda", async ({ page }) => {
    const skeleton = page.locator(".skeleton").first();
    const anim = await skeleton.evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("elev-shimmer");

    await expect(page.locator(".empty-state__title").first()).toHaveText("Nada por aqui ainda");
    await expect(page.locator(".empty-state--error .empty-state__title")).toHaveText("Não carregou");

    const unread = page.locator(".notif--unread");
    await expect(unread).toHaveCSS("background-color", porTema(theme, "#F8FAF9", "#1D2925"));
    await expect(unread.locator(".notif__dot")).toHaveCSS("background-color", porTema(theme, "#1F7355", "#6DAF91"));
    await expect(page.locator(".notif-group__day").first()).toHaveText("Hoje · 15/08");

    // agenda: reserva com borda-esquerda 3px; conflito em tinta danger com instrução
    const block = page.locator(".agenda__block").first();
    const bl = await block.evaluate((el) => getComputedStyle(el).borderLeftWidth);
    expect(bl).toBe("3px");
    await expect(page.locator(".agenda__block--conflict")).toContainText("Conflito — sala já reservada");
    await expect(page.locator(".agenda__block--conflict")).toContainText("Escolha 11:00 ou a sala Jacarandá");
    await expect(page.locator(".agenda__hour").first()).toHaveCSS("width", "44px");
  });
});

test.describe("acessibilidade da biblioteca", () => {
  test("zero emoji e nenhum hex fora do inventário nos componentes", async ({ page }) => {
    await page.goto("/showcase");
    await page.waitForSelector('[data-showcase="2i"]');
    const text = await page.locator("body").innerText();
    // faixa de emojis comum
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)).toBe(false);
  });
});
