/**
 * Tela 19 · Gestão de usuários — quadro "19 Usuarios claro codigo" (#4d).
 * Gerar código invalida a senha atual na hora; modal exibido UMA única vez.
 */
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "./AdminShell";
import { workerFetch } from "../../lib/auth";
import { StatusChip, Banner, Modal } from "../../components/feedback";
import { Button } from "../../components/Button";
import { SkeletonTableRows } from "../../components/states";
import { TextField } from "../../components/Field";
import { displayAdvisorCode, formatDateAtTime } from "../../lib/format";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  advisor_code: string | null;
  role: "admin" | "advisor";
  is_active: boolean;
  pending_code_expires_at: string | null;
}

interface GeneratedCode {
  user: AdminUser;
  code: string;
  expires_at: string;
}

/** Form de usuário — composto SÓ de componentes desenhados (modal #2h + campos #2c). Decisão do PO em 15/08/2026. */
interface AdvisorCode {
  code: string;
  clients: number;
  taken: boolean;
}

function UserFormModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null; // null = novo
  onClose: () => void;
  onSaved: (created?: AdminUser) => Promise<void>;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [advisorCode, setAdvisorCode] = useState(user?.advisor_code ? displayAdvisorCode(user.advisor_code) : "");
  const [role, setRole] = useState<"admin" | "advisor">(user?.role ?? "advisor");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // F2-02: novo acesso nasce vinculado a um assessor QUE EXISTE na base importada.
  const [codes, setCodes] = useState<AdvisorCode[] | null>(user ? [] : null);
  useEffect(() => {
    if (user) return;
    workerFetch("/api/admin/advisor-codes")
      .then((b) => setCodes((b as { codes: AdvisorCode[] }).codes))
      .catch(() => setCodes([]));
  }, [user]);
  const noBase = !user && codes !== null && codes.length === 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (user) {
        await workerFetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, advisor_code: advisorCode || null, role }),
        });
        await onSaved();
      } else {
        const body = (await workerFetch("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ name, email, advisor_code: advisorCode || null, role }),
        })) as { id: string; user: AdminUser };
        await onSaved(body.user);
      }
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={user ? `Editar ${user.name}` : "Novo usuário"}
      id={user ? `${user.role === "admin" ? "admin" : "assessor"}${user.advisor_code ? ` · código ${displayAdvisorCode(user.advisor_code)}` : ""}` : "pré-cadastro · o acesso nasce com o código"}
      onClose={onClose}
      note={user ? "Alterações registradas na auditoria." : "Ao criar, o código de uso único é gerado e exibido uma vez."}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={!name || (!user && !email) || (role === "advisor" && !advisorCode) || noBase} onClick={save}>
            {user ? "Salvar" : "Criar e gerar código"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <Banner kind="danger">{error}</Banner>}
        {noBase && (
          <Banner kind="danger" title="Nenhuma base importada">
            Importe uma base (Positivador) na tela de Importações antes de criar acessos — todo acesso nasce vinculado a um assessor da base.
          </Banner>
        )}
        <TextField label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="E-mail" type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {user ? (
            <TextField label="Código de assessor" mono placeholder="A-31342" value={advisorCode} onChange={(e) => setAdvisorCode(e.target.value)} />
          ) : (
            <div className="field">
              <label className="field__label" htmlFor="codigo-select" style={{ display: "block" }}>
                Código de assessor
              </label>
              <div className="field__box">
                <select
                  id="codigo-select"
                  className="field__input field__input--mono"
                  value={advisorCode}
                  onChange={(e) => setAdvisorCode(e.target.value)}
                  disabled={noBase || codes === null}
                  style={{ appearance: "none", width: "100%" }}
                >
                  {/* um campo de seleção não vira skeleton: diz em texto que está buscando */}
                  <option value="">{codes === null ? "Carregando códigos…" : "Escolher da base…"}</option>
                  {(codes ?? []).map((c) => (
                    <option key={c.code} value={c.code} disabled={c.taken}>
                      {displayAdvisorCode(c.code)} · {c.clients} cliente{c.clients !== 1 ? "s" : ""}{c.taken ? " · já tem acesso" : ""}
                    </option>
                  ))}
                </select>
                <i className="icon-chevron-down field__caret" aria-hidden />
              </div>
            </div>
          )}
          <div className="field">
            <label className="field__label" htmlFor="perfil-select" style={{ display: "block" }}>
              Perfil
            </label>
            <div className="field__box">
              {user ? (
                <>
                  <select
                    id="perfil-select"
                    className="field__input"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "admin" | "advisor")}
                    style={{ appearance: "none", width: "100%" }}
                  >
                    <option value="advisor">Assessor</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <i className="icon-chevron-down field__caret" aria-hidden />
                </>
              ) : (
                <input id="perfil-select" className="field__input" value="Assessor" disabled readOnly />
              )}
            </div>
          </div>
        </div>
        {!user && (
          <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)" }}>
            O acesso nasce vinculado ao assessor escolhido e enxerga SOMENTE a carteira dele — regra garantida no banco (RLS).
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Users() {
  // null = ainda carregando; [] = a base não tem usuário (estados diferentes na tela)
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [generated, setGenerated] = useState<GeneratedCode | null>(null);
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });

  async function load() {
    const body = (await workerFetch("/api/admin/users")) as { users: AdminUser[] };
    setUsers(body.users);
  }
  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  async function generateCode(user: AdminUser) {
    setBusy(user.id);
    try {
      const body = (await workerFetch(`/api/admin/users/${user.id}/code`, { method: "POST" })) as { code: string; expires_at: string };
      setGenerated({ user, code: body.code, expires_at: body.expires_at });
      setCopied(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function setActive(user: AdminUser, active: boolean) {
    setBusy(user.id);
    try {
      await workerFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_active: active }) });
      setDeactivating(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const statusChip = (u: AdminUser) => {
    if (!u.is_active) return <StatusChip kind="neutral">Inativo</StatusChip>;
    if (u.pending_code_expires_at) return <StatusChip kind="warning" dot={false}>Aguardando 1º acesso</StatusChip>;
    return <StatusChip kind="success">Ativo</StatusChip>;
  };

  return (
    <AdminShell
      title="Usuários"
      actions={
        <>
          <span className="admin-search">
            <i className="icon-search" aria-hidden />
            <input placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar por nome ou e-mail" />
          </span>
          <Button size={36} icon="icon-plus" onClick={() => setForm({ open: true, user: null })}>
            Novo usuário
          </Button>
        </>
      }
    >
      <div className="users-table">
        <div className="users-table__head">
          <span>Nome</span>
          <span>E-mail</span>
          <span>Código</span>
          <span>Perfil</span>
          <span>Status</span>
          <span style={{ textAlign: "right" }}>Ações</span>
        </div>
        {users === null && (
          <SkeletonTableRows
            template="minmax(0,1.2fr) minmax(0,1.45fr) minmax(0,0.6fr) minmax(0,0.55fr) minmax(0,0.95fr) minmax(0,1.35fr)"
            cells={[
              { width: "68%" },
              { width: "84%" },
              { width: 62 },
              { width: 52 },
              { width: 78, height: 24, radius: 999 },
              { width: 36, height: 36, radius: 9, align: "right", repeat: 3 },
            ]}
            rows={6}
            label="Carregando usuários"
          />
        )}
        {filtered.map((u) => (
          <div
            key={u.id}
            className={`users-table__row${!u.is_active ? " users-table__row--inactive" : ""}${u.is_active && u.pending_code_expires_at ? " users-table__row--pending" : ""}`}
          >
            <span className="users-table__name">{u.name}</span>
            <span className="users-table__email">{u.email}</span>
            <span className="users-table__code">{u.advisor_code ? displayAdvisorCode(u.advisor_code) : "—"}</span>
            <span className="users-table__role">{u.role === "admin" ? "admin" : "assessor"}</span>
            <span>{statusChip(u)}</span>
            <span className="users-table__actions">
              {u.is_active ? (
                <>
                  <button
                    type="button"
                    className={`row-btn${u.pending_code_expires_at ? " row-btn--brand" : ""}`}
                    disabled={busy === u.id}
                    onClick={() => generateCode(u)}
                  >
                    <i className="icon-key-round" aria-hidden />
                    {u.pending_code_expires_at ? "Ver código ativo" : "Gerar código"}
                  </button>
                  <button type="button" className="row-btn row-btn--icon" aria-label={`Editar ${u.name}`} onClick={() => setForm({ open: true, user: u })}>
                    <i className="icon-pencil" aria-hidden />
                  </button>
                  <button type="button" className="row-btn row-btn--icon row-btn--danger" aria-label={`Desativar ${u.name}`} onClick={() => setDeactivating(u)}>
                    <i className="icon-ban" aria-hidden />
                  </button>
                </>
              ) : (
                <button type="button" className="row-btn" disabled={busy === u.id} onClick={() => setActive(u, true)}>
                  Reativar
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="users-legend">
        Gerar código invalida a senha atual do usuário na hora — a linha muda para “Aguardando 1º acesso”. Reset de senha e criação passam pelo
        mesmo fluxo de código. Ícones por linha: lápis edita, proibido desativa.
      </p>

      {form.open && (
        <UserFormModal
          user={form.user}
          onClose={() => setForm({ open: false, user: null })}
          onSaved={async (created) => {
            setForm({ open: false, user: null });
            if (created) {
              // criação emenda no fluxo do código (fluxo a): gera e exibe uma vez —
              // sem esperar a listagem completa (pesada) no caminho crítico
              const body = (await workerFetch(`/api/admin/users/${created.id}/code`, { method: "POST" })) as { code: string; expires_at: string };
              setGenerated({ user: { ...created, pending_code_expires_at: body.expires_at }, code: body.code, expires_at: body.expires_at });
              setCopied(false);
            }
            void load();
          }}
        />
      )}

      {generated && (
        <Modal
          title="Código de acesso gerado"
          id={`${generated.user.name} · ${generated.user.role === "admin" ? "admin" : "assessor"}${generated.user.advisor_code ? ` ${displayAdvisorCode(generated.user.advisor_code)}` : ""}`}
          onClose={() => setGenerated(null)}
          note={`expira ${formatDateAtTime(generated.expires_at)} · registrado na auditoria`}
          actions={
            <Button variant="secondary" onClick={() => setGenerated(null)}>
              Concluir
            </Button>
          }
        >
          <div className="code-modal__box" style={{ margin: "0 0 0" }}>
            <span className="code-modal__code">{generated.code}</span>
            <Button
              icon="icon-copy"
              onClick={async () => {
                await navigator.clipboard.writeText(generated.code);
                setCopied(true);
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <div className="code-modal__body" style={{ padding: "14px 0 0" }}>
            Mostrado <strong>só esta vez</strong>. Envie por um canal seguro — a pessoa entra com o código e cria a própria senha. Vale 24 horas,
            uma única vez, e a senha antiga já deixou de funcionar.
          </div>
        </Modal>
      )}

      {deactivating && (
        <Modal
          title={`Desativar ${deactivating.name}?`}
          id={`${deactivating.role === "admin" ? "admin" : "assessor"}${deactivating.advisor_code ? ` · código ${displayAdvisorCode(deactivating.advisor_code)}` : ""}`}
          onClose={() => setDeactivating(null)}
          note="Reversível — dá para reativar depois."
          actions={
            <>
              <Button variant="secondary" onClick={() => setDeactivating(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" icon="icon-ban" loading={busy === deactivating.id} onClick={() => setActive(deactivating, false)}>
                Desativar
              </Button>
            </>
          }
        >
          Ele perde o acesso na hora. O que estava no nome dele continua no sistema e precisa de novo responsável.
        </Modal>
      )}
    </AdminShell>
  );
}
