"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../DesignSystem";
import { adminFetch } from "@/services/adminApi";
import { billingStatusLabel } from "@/lib/shared/billingText";
import { Building2, RefreshCw, Search, Copy, PlusCircle, Ban, CheckCircle2 } from "lucide-react";

function norm(v) {
  return String(v ?? "").trim();
}

function formatDate(iso) {
  const s = norm(iso);
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch (_) {
    return "—";
  }
}

function StatusBadge({ status }) {
  const s = String(status || "active");
  const isSuspended = s === "suspended";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border ${
        isSuspended
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
      title={isSuspended ? "Tenant suspenso" : "Tenant ativo"}
    >
      {isSuspended ? <Ban size={12} /> : <CheckCircle2 size={12} />}
      {isSuspended ? "Suspenso" : "Ativo"}
    </span>
  );
}

export default function AdminSaasTenantsTab({ showToast }) {
  const [q, setQ] = useState("");
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [linkTenantId, setLinkTenantId] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [linkingOwner, setLinkingOwner] = useState(false);
  const [lastInvite, setLastInvite] = useState(null);

  const hasQuery = useMemo(() => norm(q).length > 0, [q]);

  async function loadTenants(explicitQ = null) {
    const query = explicitQ === null ? q : explicitQ;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (norm(query)) qs.set("q", norm(query));

      const res = await adminFetch(`/api/admin/saas/tenants?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar tenants");
      }

      setTenants(Array.isArray(json?.tenants) ? json.tenants : []);
    } catch (e) {
      setError(String(e?.message || "Erro ao carregar"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTenants("").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(e) {
    e?.preventDefault?.();
    await loadTenants(q);
  }

  async function handleClear() {
    setQ("");
    await loadTenants("");
  }

  function parseOwnerInput(raw) {
    const v = norm(raw);
    if (!v) return { kind: null, value: "" };
    if (v.includes("@")) return { kind: "email", value: v.toLowerCase() };
    return { kind: "uid", value: v };
  }

  async function handleLinkOwner() {
    const tenantId = norm(linkTenantId);
    if (!tenantId) {
      showToast?.("Informe o tenantId.", "error");
      return;
    }

    const parsed = parseOwnerInput(ownerInput);
    if (!parsed.kind) {
      showToast?.("Informe o email ou UID do owner.", "error");
      return;
    }

    setLinkingOwner(true);
    setError("");
    try {
      const payload = { tenantId };
      if (parsed.kind === "email") payload.email = parsed.value;
      else payload.uid = parsed.value;

      const res = await adminFetch(`/api/admin/saas/tenants/owner`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao vincular owner");
      }

      if (json?.mode === "invite") {
        const link = String(json?.invite?.link || "");
        const exp = String(json?.invite?.expiresAtIso || "");
        setLastInvite({ tenantId, link, expiresAtIso: exp, emailMasked: json?.invite?.emailMasked || null });
        try {
          if (link) await navigator.clipboard.writeText(link);
          showToast?.("Convite criado. Link copiado.", "success");
        } catch (_) {
          showToast?.("Convite criado. Copie o link abaixo.", "success");
        }
      } else {
        showToast?.(`Owner vinculado: ${json?.owner?.uid || ""}`, "success");
        setLastInvite(null);
      }

      setOwnerInput("");
      // refresh list (keeps current query)
      await loadTenants(hasQuery ? q : "");
    } catch (e) {
      const msg = String(e?.message || "Erro ao vincular owner");
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setLinkingOwner(false);
    }
  }



  async function handleCreate() {
    const name = norm(newName);
    if (name.length < 3) {
      showToast?.("Digite um nome (mínimo 3 caracteres).", "error");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/saas/tenants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao criar tenant");
      }

      setNewName("");
      showToast?.(`Tenant criado: ${json?.tenant?.tenantId || ""}`, "success");

      // Refresh list (keep query if user is searching)
      await loadTenants(hasQuery ? q : "");
    } catch (e) {
      const msg = String(e?.message || "Erro ao criar");
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(t) {
    const tenantId = norm(t?.tenantId);
    if (!tenantId) return;

    const nextStatus = t?.status === "suspended" ? "active" : "suspended";

    try {
      const res = await adminFetch(`/api/admin/saas/tenants`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, status: nextStatus }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao atualizar status");
      }

      showToast?.(
        nextStatus === "suspended" ? "Tenant suspenso." : "Tenant reativado.",
        "success"
      );

      // Update list in place
      const updated = json?.tenant;
      if (updated?.tenantId) {
        setTenants((prev) =>
          (prev || []).map((x) => (x.tenantId === updated.tenantId ? { ...x, ...updated } : x))
        );
      } else {
        await loadTenants(hasQuery ? q : "");
      }
    } catch (e) {
      const msg = String(e?.message || "Erro ao atualizar status");
      showToast?.(msg, "error");
    }
  }

  async function copyTenantId(id) {
    const tid = norm(id);
    if (!tid) return;
    try {
      await navigator.clipboard.writeText(tid);
      showToast?.("tenantId copiado.", "success");
    } catch (_) {
      showToast?.("Não foi possível copiar.", "error");
    }
  }

  return (
    <Card title="SaaS — Tenants (Super Admin)" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-6">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <form onSubmit={handleSearch} className="flex-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">Buscar (tenantId ou nome)</label>
              <div className="flex gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ex.: tn_xxxxx ou Clínica..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
                />
                <Button type="submit" disabled={loading}>
                  <span className="inline-flex items-center gap-2"><Search size={16} /> Buscar</span>
                </Button>
                <Button type="button" variant="secondary" onClick={handleClear} disabled={loading}>
                  Limpar
                </Button>
              </div>
            </form>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => loadTenants(hasQuery ? q : "")} disabled={loading}>
                <span className="inline-flex items-center gap-2"><RefreshCw size={16} /> Atualizar</span>
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 text-sm text-rose-600 font-semibold">{error}</div>
          ) : null}
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">Criar novo tenant</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome do tenant (clínica/cliente)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Isso cria <code className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200">tenants/tn_...</code> com status <b>active</b>.
              </div>
            </div>

            <Button onClick={handleCreate} disabled={creating}>
              <span className="inline-flex items-center gap-2"><PlusCircle size={16} /> Criar</span>
            </Button>
          </div>
        </div>

<div className="p-4 rounded-2xl border border-slate-200 bg-white">
  <div className="flex flex-col lg:flex-row lg:items-end gap-3">
    <div className="flex-1">
      <label className="block text-xs font-bold text-slate-700 mb-1">Vincular Owner (Admin do tenant)</label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          value={linkTenantId}
          onChange={(e) => setLinkTenantId(e.target.value)}
          placeholder="tenantId (ex.: tn_xxxxx)"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
        />
        <input
          value={ownerInput}
          onChange={(e) => setOwnerInput(e.target.value)}
          placeholder="Email (cria convite se não existir) ou UID (já existente)"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
        />
      </div>
      <div className="text-[11px] text-slate-500 mt-1">
        MVP+: se o e-mail não existir no Firebase Auth, será criado um convite. Isso cria/atualiza{" "}
        <code className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200">tenants/&lt;tenantId&gt;/users/&lt;uid&gt;</code>{" "}
        e <code className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200">userTenantIndex/&lt;uid&gt;</code>.
      </div>
    </div>

    <Button onClick={handleLinkOwner} disabled={linkingOwner}>
      {linkingOwner ? "Vinculando..." : "Vincular owner"}
    </Button>
  </div>

{lastInvite?.link ? (
  <div className="mt-3 p-3 rounded-xl border border-violet-200 bg-violet-50">
    <div className="text-xs font-extrabold text-violet-900">Último convite criado</div>
    <div className="mt-1 text-[12px] text-violet-900/80">
      Tenant: <span className="font-mono">{lastInvite.tenantId}</span>
      {lastInvite.emailMasked ? <> • Email: <span className="font-mono">{lastInvite.emailMasked}</span></> : null}
      {lastInvite.expiresAtIso ? <> • Expira: {formatDate(lastInvite.expiresAtIso)}</> : null}
    </div>
    <div className="mt-2 flex items-center gap-2">
      <input
        value={lastInvite.link}
        readOnly
        className="flex-1 px-3 py-2 rounded-xl border border-violet-200 bg-white text-xs font-mono"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => navigator.clipboard.writeText(lastInvite.link).then(() => showToast?.("Link copiado.", "success")).catch(() => showToast?.("Não foi possível copiar.", "error"))}
      >
        <span className="inline-flex items-center gap-2"><Copy size={14} /> Copiar</span>
      </Button>
    </div>
  </div>
) : null}

</div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-900 inline-flex items-center gap-2">
              <Building2 size={18} /> Tenants
            </div>
            <div className="text-xs text-slate-500">
              {loading ? "Carregando..." : `${(tenants || []).length} encontrado(s)`}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-600">
                  <th className="px-4 py-3 font-bold">tenantId</th>
                  <th className="px-4 py-3 font-bold">Nome</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Plano</th>
                  <th className="px-4 py-3 font-bold">Cobrança</th>
                  <th className="px-4 py-3 font-bold">Criado em</th>
                  <th className="px-4 py-3 font-bold">Ações</th>
                </tr>
              </thead>

              <tbody>
                {(tenants || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Nenhum tenant encontrado.
                    </td>
                  </tr>
                ) : (
                  (tenants || []).map((t) => (
                    <tr key={t.tenantId} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        <div className="flex items-center gap-2">
                          <span>{t.tenantId}</span>
                          <button
                            type="button"
                            onClick={() => copyTenantId(t.tenantId)}
                            className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                            title="Copiar tenantId"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{t.name || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            className="text-xs border rounded px-2 py-1 bg-white"
                            value={t._planDraft ?? t.planId ?? "pro"}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTenants((prev) =>
                                (prev || []).map((x) => (x.tenantId === t.tenantId ? { ...x, _planDraft: v } : x))
                              );
                            }}
                          >
                            <option value="free">Free</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                          </select>

                          <button
                            type="button"
                            className="text-xs font-bold px-2 py-1 rounded border hover:bg-slate-50"
                            onClick={async () => {
                              try {
                                setError("");
                                const planId = t._planDraft ?? t.planId ?? "pro";
                                const res = await adminFetch("/api/admin/saas/tenants", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ tenantId: t.tenantId, planId }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao atualizar plano.");
                                setTenants((prev) =>
                                  (prev || []).map((x) => (x.tenantId === t.tenantId ? { ...data.tenant } : x))
                                );
                                showToast?.(`Plano atualizado: ${String(planId).toUpperCase()}`, "success");
                              } catch (e) {
                                showToast?.(String(e?.message || "Erro ao atualizar plano."), "error");
                              }
                            }}
                            title="Aplicar plano"
                          >
                            Aplicar
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <select
                              className="text-xs border rounded px-2 py-1 bg-white"
                              value={t._billingDraft ?? t.billingStatus ?? "active"}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTenants((prev) =>
                                  (prev || []).map((x) => (x.tenantId === t.tenantId ? { ...x, _billingDraft: v } : x))
                                );
                              }}
                              title="billingStatus"
                            >
                              <option value="active">Ativo</option>
                              <option value="trial">Trial</option>
                              <option value="past_due">Pagamento pendente</option>
                              <option value="canceled">Cancelado</option>
                              
                            </select>

                            <button
                              type="button"
                              className="text-xs font-bold px-2 py-1 rounded border hover:bg-slate-50"
                              onClick={async () => {
                                try {
                                  setError("");
                                  const billingStatus = t._billingDraft ?? t.billingStatus ?? "active";
                                  const res = await adminFetch("/api/admin/saas/tenants", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ tenantId: t.tenantId, billingStatus }),
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao atualizar cobrança.");
                                  setTenants((prev) =>
                                    (prev || []).map((x) => (x.tenantId === t.tenantId ? { ...data.tenant } : x))
                                  );
                                  showToast?.(`Cobrança atualizada: ${billingStatusLabel(billingStatus)}`, "success");
                                } catch (e) {
                                  showToast?.(String(e?.message || "Erro ao atualizar cobrança."), "error");
                                }
                              }}
                              title="Aplicar cobrança"
                            >
                              Aplicar
                            </button>
                            {String(t._billingDraft ?? t.billingStatus ?? "active") === "past_due" && t.billingGraceEndsAtIso ? (
                              <div className="mt-1 text-[10px] text-slate-500">
                                Carência até {new Date(t.billingGraceEndsAtIso).toLocaleDateString("pt-BR")}
                              </div>
                            ) : null}

                          </div>

                          <div className="text-[11px] text-slate-500">
                            Trial até: <span className="font-mono">{t.trialEndsAtIso ? formatDate(t.trialEndsAtIso) : "—"}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-600">{formatDate(t.createdAtIso)}</td>
                      <td className="px-4 py-3">
                        <Button
                          variant={t.status === "suspended" ? "primary" : "danger"}
                          onClick={() => handleToggleStatus(t)}
                        >
                          {t.status === "suspended" ? "Reativar" : "Suspender"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-slate-100 text-[12px] text-slate-500">
            MVP: busca por prefixo usa <b>nameLower</b>. Tenants antigos sem esse campo podem não aparecer na busca por nome (mas aparecem na listagem padrão).
          </div>
        </div>
      </div>
    </Card>
  );
}