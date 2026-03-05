"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/DesignSystem";

function isDigits(str) {
  return /^[0-9]+$/.test(String(str || ""));
}

function normalizeCpfInput(v) {
  const digits = String(v || "").replace(/\D+/g, "").slice(0, 11);
  return digits;
}

function normalizePhoneInput(v) {
  // mantém dígitos, + e espaços simples (back-end canonicaliza)
  return String(v || "").replace(/[^0-9+()\s-]/g, "");
}

export default function PatientProfileModal({ patientId, onClose, onSaved, showToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState(""); // YYYY-MM-DD
  const [gender, setGender] = useState("");

  const [phoneE164, setPhoneE164] = useState("");
  const [email, setEmail] = useState("");

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");

  const [lgName, setLgName] = useState("");
  const [lgCpf, setLgCpf] = useState("");
  const [lgRelationship, setLgRelationship] = useState("");
  const [lgPhone, setLgPhone] = useState("");

  const [generalNotes, setGeneralNotes] = useState("");

  const canSave = useMemo(() => {
    if (!fullName.trim()) return false;
    // telefone é recomendado, mas não obrigatório no "completar cadastro" (back-end aceita vazio)
    return true;
  }, [fullName]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!patientId) return;
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(`/api/professional/patient/profile?patientId=${encodeURIComponent(patientId)}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.message || "Falha ao carregar paciente");

        const p = json.patient || {};
        if (cancelled) return;

        setFullName(String(p.fullName || ""));
        setPreferredName(String(p.preferredName || ""));
        setCpf(String(p.cpf || ""));
        setBirthDate(String(p.birthDate || ""));
        setGender(String(p.gender || ""));

        setPhoneE164(String(p.phoneE164 || p.mobile || ""));
        setEmail(String(p.email || ""));

        const a = p.address || {};
        setAddressLine1(String(a.line1 || ""));
        setAddressLine2(String(a.line2 || ""));
        setAddressCity(String(a.city || ""));
        setAddressState(String(a.state || ""));
        setAddressZip(String(a.zip || ""));

        const lg = p.legalGuardian || {};
        setLgName(String(lg.fullName || ""));
        setLgCpf(String(lg.cpf || ""));
        setLgRelationship(String(lg.relationship || ""));
        setLgPhone(String(lg.phoneE164 || ""));

        setGeneralNotes(String(p.generalNotes || p.notes || ""));
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Erro");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function handleSave() {
    if (!patientId) return;
    if (!canSave) {
      setErr("Preencha o nome.");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const addressFilled = [addressLine1, addressLine2, addressCity, addressState, addressZip].some((v) => String(v || "").trim());
      const lgFilled = [lgName, lgCpf, lgRelationship, lgPhone].some((v) => String(v || "").trim());

      const payload = {
        fullName: fullName.trim(),
        preferredName: preferredName.trim() || "",
        cpf: normalizeCpfInput(cpf),
        birthDate: String(birthDate || "").trim(),
        gender: String(gender || "").trim(),
        phoneE164: normalizePhoneInput(phoneE164),
        email: String(email || "").trim(),
        generalNotes: String(generalNotes || "").trim(),
      };

      if (addressFilled) {
        payload.address = {
          line1: String(addressLine1 || "").trim(),
          line2: String(addressLine2 || "").trim(),
          city: String(addressCity || "").trim(),
          state: String(addressState || "").trim(),
          zip: String(addressZip || "").trim(),
        };
      }

      if (lgFilled) {
        payload.legalGuardian = {
          fullName: String(lgName || "").trim(),
          cpf: normalizeCpfInput(lgCpf),
          relationship: String(lgRelationship || "").trim(),
          phoneE164: normalizePhoneInput(lgPhone),
        };
      }

      const res = await fetch(`/api/professional/patient/profile?patientId=${encodeURIComponent(patientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || "Falha ao salvar");

      showToast?.("Cadastro do paciente salvo.", "success");
      onSaved?.(json.patient);
      onClose?.();
    } catch (e) {
      const msg = e?.message || "Erro ao salvar";
      setErr(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/30 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-2xl max-h-[92dvh] rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-900 truncate">Cadastro do paciente</p>
            <p className="text-[11px] text-slate-500 font-bold truncate">ID: {patientId}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-auto max-h-[calc(92dvh-140px)]">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <Loader2 className="animate-spin" size={18} />
              Carregando...
            </div>
          ) : (
            <>
              {err ? (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="font-extrabold">Atenção</p>
                  <p className="mt-1">{err}</p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600">Nome completo *</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nome do paciente"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600">Nome preferido</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="Como prefere ser chamado"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600">CPF</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={cpf}
                    onChange={(e) => setCpf(normalizeCpfInput(e.target.value))}
                    placeholder="Opcional (somente números)"
                    inputMode="numeric"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600">Data de nascimento</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600">Gênero</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">(não informado)</option>
                    <option value="female">Feminino</option>
                    <option value="male">Masculino</option>
                    <option value="other">Outro</option>
                    <option value="prefer_not_say">Prefere não informar</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600">Celular/WhatsApp</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={phoneE164}
                    onChange={(e) => setPhoneE164(normalizePhoneInput(e.target.value))}
                    placeholder="+55 11 9xxxx-xxxx"
                    inputMode="tel"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600">E-mail</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    inputMode="email"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-extrabold text-slate-700">Endereço (opcional)</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-600">Logradouro</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-600">Complemento</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Cidade</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Estado</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={addressState} onChange={(e) => setAddressState(e.target.value)} placeholder="UF" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">CEP</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={addressZip} onChange={(e) => setAddressZip(e.target.value)} inputMode="numeric" />
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-extrabold text-slate-700">Responsável legal (opcional)</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-600">Nome</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={lgName} onChange={(e) => setLgName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">CPF</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={lgCpf} onChange={(e) => setLgCpf(normalizeCpfInput(e.target.value))} placeholder="Opcional (somente números)" inputMode="numeric" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Parentesco</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={lgRelationship} onChange={(e) => setLgRelationship(e.target.value)} placeholder="Ex: mãe, pai, responsável" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-600">Telefone</label>
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={lgPhone} onChange={(e) => setLgPhone(normalizePhoneInput(e.target.value))} placeholder="+55 ..." inputMode="tel" />
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <label className="text-xs font-bold text-slate-600">Observações gerais (não é prontuário)</label>
                <textarea
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[120px]"
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Ex: preferências de horário, observações administrativas..."
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Evite informações clínicas aqui. Evolução/prontuário permanece por sessão.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleSave} disabled={busy || loading || !canSave}>
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} />
                Salvando...
              </span>
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
