/**
 * Provedor de cotações do Worker.
 * - modo "fake" (dev/testes): simulador determinístico — sem METAAPI_TOKEN configurado.
 * - modo "metaapi" (produção): conecta na conta MT5 do admin via metaapi.cloud usando
 *   exatamente os 3 campos da tela 18 (login, senha, servidor).
 * O app nunca fala com o provedor: só com estes endpoints, sob JWT.
 */
export interface Quote {
    symbol: string;
    name: string;
    price: number;
    open: number;
    high: number;
    low: number;
    prevClose: number;
    changePct: number;
    /** DI futuro varia em pontos-percentuais */
    unit: "preco" | "pp";
    at: string;
}
/** Preço simulado: caminhada suave determinística por símbolo e minuto. */
export declare function fakeQuote(symbolRaw: string, now?: Date): Quote;
/** Série intradiária simulada para gráficos. */
export declare function fakeSeries(symbolRaw: string, points?: number, now?: Date): number[];
export interface MtTestResult {
    ok: boolean;
    code?: "AUTH_FAILED" | "SERVER_NOT_FOUND";
    responseSeconds?: number;
}
export declare function fakeMtTest(login: string, password: string, server: string): MtTestResult;
