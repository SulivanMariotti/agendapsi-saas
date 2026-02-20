"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { patientLoginByEmail, patientLoginByPairCode } from "../../services/authService";
import { Button, Card } from "../DesignSystem";
import { Mail, CheckCircle, Bell, CalendarCheck, NotebookPen, Info, Key } from "lucide-react";

const ENABLE_EMAIL_LOGIN =
  String(process.env.NEXT_PUBLIC_ENABLE_PATIENT_EMAIL_LOGIN || "").toLowerCase() === "true";

export default function PatientLogin() {
  const [mode, setMode] = useState("code"); // code | email (email apenas se ENABLE_EMAIL_LOGIN)

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);

  const cleanEmail = useMemo(() => (email || "").trim().toLowerCase(), [email]);
  const cleanPhone = useMemo(() => (phone || "").trim(), [phone]);
  const cleanCode = useMemo(
    () =>
      (code || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[^A-Z0-9-]/g, ""),
    [code]
  );

  const handlePatientLoginEmail = async () => {
    if (!cleanEmail || !cleanEmail.includes("@")) {
      alert("Digite um e-mail válido.");
      return;
    }

    setLoading(true);
    try {
      await patientLoginByEmail(cleanEmail);
      // onAuthStateChanged no page.js redireciona
    } catch (e) {
      console.error(e);
      alert(e?.message || "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  const handlePatientLoginCode = async () => {
    if (!cleanPhone) {
      alert("Digite seu telefone (DDD + número).");
      return;
    }
    if (!cleanCode || cleanCode.length < 10) {
      alert("Digite o código de vinculação.");
      return;
    }

    setLoading(true);
    try {
      await patientLoginByPairCode(cleanPhone, cleanCode);
      // onAuthStateChanged no page.js redireciona
    } catch (e) {
      console.error(e);
      alert(e?.message || "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-3">
        {/* Cabeçalho compacto */}
        <div className="text-center px-2">
          <div className="flex items-center justify-center gap-2 text-violet-700">
            <div className="w-11 h-11 rounded-2xl bg-white ring-1 ring-slate-200 flex items-center justify-center shadow-lg shadow-slate-200">
              <Image
                src="/brand/permitta-mark-256.png"
                alt="Permittá"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </div>
            <div className="text-left">
              <div className="text-[22px] sm:text-[26px] font-extrabold text-slate-900 leading-none">
                Lembrete Psi
              </div>
              <div className="text-xs sm:text-sm text-slate-500 mt-0.5">Constância terapêutica</div>
            </div>
          </div>

          <div className="mt-2 text-sm text-slate-500">
            Seu painel para lembretes, agenda e registro rápido.
          </div>
        </div>

        <Card title="Entrar">
          <div className="space-y-3">
            {/* Seletor simples (email é legado e fica desativado por padrão) */}
            {ENABLE_EMAIL_LOGIN ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("code")}
                  className={[
                    "px-3 py-2 rounded-xl text-sm border",
                    mode === "code"
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Key size={16} />
                    Código
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("email")}
                  className={[
                    "px-3 py-2 rounded-xl text-sm border",
                    mode === "email"
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Mail size={16} />
                    E-mail
                  </div>
                </button>
              </div>
            ) : (
              <div className="text-[12px] text-slate-500">
                <b>Segurança:</b> o acesso é por <b>vinculação de aparelho</b> (telefone + código). Isso protege seu
                espaço de cuidado.
              </div>
            )}

            {mode === "code" || !ENABLE_EMAIL_LOGIN ? (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">
                  Use seu <b>telefone</b> e o <b>código de vinculação</b> entregue pela clínica.
                  <div className="text-[12px] text-slate-400 mt-0.5">
                    Esse código vincula <b>este aparelho</b> ao seu espaço de cuidado.
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone (DDD + número)</label>
                  <input
                    className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-200 text-slate-700"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Código de vinculação</label>
                  <input
                    className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-200 text-slate-700 tracking-widest"
                    placeholder="XXXX-XXXX-XXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="text"
                    autoComplete="one-time-code"
                  />
                  <div className="text-[12px] text-slate-500 leading-snug">
                    Perdeu o código? <b>Peça um novo à clínica</b>. Manter seu acesso ativo ajuda a sustentar a{" "}
                    <b>constância</b> do processo.
                  </div>
                </div>

                <Button onClick={handlePatientLoginCode} disabled={loading} className="w-full">
                  {loading ? "Vinculando..." : "Vincular e entrar"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">
                  Use seu <b>e-mail cadastrado</b>.
                  <span className="text-xs text-slate-400"> (Sem cadastro? solicite à clínica.)</span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      className="w-full pl-10 p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-200 text-slate-700"
                      placeholder="paciente@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      inputMode="email"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <Button onClick={handlePatientLoginEmail} disabled={loading} className="w-full">
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </div>
            )}

            {/* O que tem no painel (compacto) */}
            <div className="rounded-2xl bg-slate-50 p-3 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Info size={14} className="text-slate-400" />
                Você vai ver
              </div>

              <div className="mt-2 grid gap-2 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <CalendarCheck size={16} className="text-slate-400 mt-0.5" />
                  <div>
                    <b className="text-slate-700">Próximo atendimento</b> + agenda (sem reagendar/cancelar)
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Bell size={16} className="text-slate-400 mt-0.5" />
                  <div>
                    <b className="text-slate-700">Notificações</b> para reduzir esquecimento
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <NotebookPen size={16} className="text-slate-400 mt-0.5" />
                  <div>
                    <b className="text-slate-700">Anotações</b> para usar entre sessões
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[12px] text-slate-500 leading-snug">
                <b>Importante:</b> este sistema existe para fortalecer a <b>constância</b>. Faltar interrompe o ritmo
                do seu processo.
              </div>
            </div>
          </div>
        </Card>

        {/* Rodapé mínimo */}
        <div className="text-center text-xs text-slate-400">
          Painel focado em <b>lembretes e constância</b>.
          <div className="mt-1 inline-flex items-center gap-2 justify-center">
            <CheckCircle size={14} className="text-slate-300" />
            Dados usados apenas para apoio do acompanhamento.
          </div>
        </div>
      </div>
    </div>
  );
}
