import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Card, Button, Badge } from '../DesignSystem';

/**
 * Manual de Uso (Admin)
 * Objetivo: reduzir erro humano e sustentar a constância do cuidado.
 * - Passo a passo: Agenda + Presença/Faltas
 * - Diagnóstico rápido: por que algo ficou bloqueado
 * - Boas práticas: firmeza com cuidado (sem CTA de cancelar/remarcar)
 */

const SECTIONS = [
  {
    id: 'visao-geral',
    title: 'Finalidade do Manual',
    keywords:
      'constância vínculo cuidado ativo psicoeducação operação manual checklist dias corridos',
    body: (
      <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
        <p className="font-semibold text-slate-900">
          O Lembrete Psi não é “disparo de mensagem”. É uma ferramenta clínica para sustentar vínculo e
          constância.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <b>Constância é cuidado:</b> a eficácia do processo aparece na continuidade, não em uma única
            sessão.
          </li>
          <li>
            <b>Operação simples e repetível:</b> o sistema reduz esquecimento/ruído operacional, mas
            precisa de um ritual diário bem definido.
          </li>
          <li>
            <b>Sem atalhos de cancelamento/remarcação:</b> o painel do paciente reforça compromisso; qualquer
            ajuste de agenda exige contato ativo com a clínica.
          </li>
        </ul>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-2">
            <Info size={18} className="mt-0.5 text-slate-500" />
            <div>
              <div className="font-semibold text-slate-900">Regra de ouro</div>
              <div className="text-slate-700 mt-1">
                Se houver <b>CHECK</b> (push não confirmado), faça <b>Preview</b> antes de enviar. Preview é a
                “última verificação” para você não depender de memória em dia corrido.
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },

  {
    id: 'agenda',
    title: 'Agenda (Importar → Verificar → Sincronizar → Preview → Enviar)',
    keywords:
      'agenda carregar planilha verificar sincronizar preview enviar lembretes CRON_SECRET modo manual',
    body: (
      <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
        <div className="space-y-2">
          <div className="font-semibold text-slate-900">Finalidade</div>
          <p>
            Garantir que o paciente <b>se lembre</b> e chegue com mais estabilidade ao encontro. O sistema assume a
            carga mental do lembrete para proteger o espaço terapêutico.
          </p>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-slate-900">Pré-requisitos (uma vez só)</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Service Account do Firebase Admin configurado (rotas server-side).</li>
            <li>Push habilitado (VAPID) + assinaturas válidas dos pacientes (quando aplicável).</li>
            <li>Templates (MSG1/MSG2/MSG3) revisados com placeholders.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-slate-900">Passo a passo diário (modo manual)</div>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <b>Carregar Planilha</b>: cole ou envie o CSV do dia/semana (conforme sua rotina).
              <div className="text-xs text-slate-500 mt-1">
                Dica: use sempre a mesma janela de datas (ex.: 30 dias à frente) para reduzir inconsistência.
              </div>
            </li>
            <li>
              <b>Verificar</b>: valida formato, datas, duplicidades e consistência.
              <div className="text-xs text-slate-500 mt-1">
                Se aparecer alerta, corrija na origem (planilha) quando possível — menos “gambiarras” no sistema.
              </div>
            </li>
            <li>
              <b>Sincronizar</b>: grava a agenda no banco (fonte única da verdade).
            </li>
            <li>
              <b>Gerar Preview do Disparo</b>: calcula quem receberá cada lembrete e identifica bloqueios.
              <div className="text-xs text-slate-500 mt-1">
                Preview é o “check de segurança”: evita enviar para seleção errada ou com push não consultado.
              </div>
            </li>
            <li>
              <b>Enviar Lembretes</b>: após o preview (e sem CHECK), execute o envio.
              <div className="text-xs text-slate-500 mt-1">
                O sistema evita reenviar indevidamente quando já existe marcação de “sentAt/lastSent”.
              </div>
            </li>
          </ol>
        </div>

        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
          <div className="font-semibold text-violet-800">Nota clínica</div>
          <div className="text-violet-800/90 mt-1">
            Mensagem boa não é “bonita”: é <b>firme e cuidadosa</b>. Ela lembra que o horário existe e que
            a continuidade sustenta o processo — sem moralismo.
          </div>
        </div>
      </div>
    ),
  },

  {
    id: 'presenca',
    title: 'Presença/Faltas (Constância + Follow-ups)',
    keywords:
      'presença faltas import csv followups idempotência attendance_logs parabenizar falta orientar',
    body: (
      <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
        <div className="space-y-2">
          <div className="font-semibold text-slate-900">Finalidade</div>
          <p>
            Transformar presença em <b>fator de evolução</b>: visibilidade da constância e follow-ups
            psicoeducativos (parabenizar presença / orientar após falta).
          </p>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-slate-900">Importação (CSV)</div>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <b>Colar CSV</b> (ou carregar) no campo de importação.
            </li>
            <li>
              <b>Validar (Dry-run)</b>: você vê o que será criado/atualizado sem gravar.
              <div className="text-xs text-slate-500 mt-1">
                Se você editar o CSV depois do dry-run, valide de novo (preview fica inválido).
              </div>
            </li>
            <li>
              <b>Confirmar (Commit)</b>: grava em <code>attendance_logs</code>.
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-slate-900">Follow-ups (mensagens)</div>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              O envio de follow-up é <b>idempotente</b>: se <code>followup.sentAt</code> já existir, não
              envia de novo.
            </li>
            <li>
              <b>Presença</b>: reforça autonomia e continuidade (“parabéns por comparecer”).
            </li>
            <li>
              <b>Falta</b>: firmeza com cuidado (“senti sua falta; faltar interrompe o processo”).
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="font-semibold text-slate-900">Boas práticas clínicas</div>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Evite tom punitivo. Use linguagem de vínculo e responsabilidade.</li>
            <li>Não crie CTA de cancelamento/remarcação no painel do paciente.</li>
            <li>Se houver WhatsApp, use apenas para <b>confirmação</b>, nunca como “atalho de desistência”.</li>
          </ul>
        </div>
      </div>
    ),
  },

  {
    id: 'diagnostico',
    title: 'Diagnóstico rápido (bloqueios e sinais)',
    keywords:
      'SEM_PUSH INATIVO SEM_TELEFONE CHECK JÁ_ENVIADO already_sent no_token inactive troubleshooting',
    body: (
      <div className="space-y-5 text-sm text-slate-700 leading-relaxed">
        <p>
          Abaixo estão os bloqueios mais comuns e o que fazer. O objetivo é você resolver com ação objetiva
          em 1–2 minutos.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle size={16} className="text-amber-600" />
              SEM_PUSH
            </div>
            <div className="mt-2 text-slate-700">
              O paciente não tem assinatura válida de push.
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Peça para abrir o painel do paciente e permitir notificações.</li>
                <li>Verifique VAPID/env e se o navegador não bloqueou permissões.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle size={16} className="text-amber-600" />
              INATIVO
            </div>
            <div className="mt-2 text-slate-700">
              Cadastro desativado (não enviar lembretes).
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Reative somente quando houver retorno confirmado e alinhamento clínico.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle size={16} className="text-amber-600" />
              SEM_TELEFONE
            </div>
            <div className="mt-2 text-slate-700">
              Sem telefone/telefone inválido para vincular assinatura e agenda.
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Corrija o cadastro (telefone canônico).</li>
                <li>Evite espaços, símbolos e números incompletos.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle size={16} className="text-amber-600" />
              CHECK (push não confirmado)
            </div>
            <div className="mt-2 text-slate-700">
              Você ainda não rodou preview/status para essa seleção.
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Gere o Preview antes de enviar.</li>
                <li>Se você mudar filtros/busca depois do preview, gere novamente.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <CheckCircle size={16} className="text-emerald-600" />
              JÁ_ENVIADO / already_sent
            </div>
            <div className="mt-2 text-slate-700">
              O sistema detectou envio prévio (proteção contra duplicidade).
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Em geral, não faça nada. Isso é esperado.</li>
                <li>Se foi envio errado, revise filtro/seleção e o horário do lote anterior.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle size={16} className="text-amber-600" />
              permission-denied
            </div>
            <div className="mt-2 text-slate-700">
              Regra/rota tentando ler algo no client que é admin-only.
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Agenda do paciente deve ser server-side (API Admin SDK).</li>
                <li>Se for Admin, use rotas server-side para leituras sensíveis.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="font-semibold text-slate-900">Dica operacional</div>
          <div className="text-slate-700 mt-1">
            Se você estiver em dúvida, baixe o <b>CSV de diagnóstico</b> na Agenda e resolva os bloqueios por linha.
          </div>
        </div>
      </div>
    ),
  },
];

function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

export default function AdminManualTab({ manualJump }) {
  const [q, setQ] = useState('');

  const query = normalizeText(q);

  const filtered = useMemo(() => {
    if (!query) return SECTIONS;
    return SECTIONS.filter((s) => normalizeText(`${s.title} ${s.keywords}`).includes(query));
  }, [query]);

  const scrollTo = (id) => {
    try {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      // ignore
    }
  };

  // Jump contextual (ex.: Agenda → abrir manual já na seção certa)
  useEffect(() => {
    if (!manualJump?.ts) return;

    if (typeof manualJump?.query === 'string' && manualJump.query.trim()) {
      setQ(manualJump.query);
    }

    const id = String(manualJump?.id || '').trim();
    if (!id) return;

    // Aguarda o render das seções/cards antes de rolar
    const t = setTimeout(() => scrollTo(id), 60);
    return () => clearTimeout(t);
  }, [manualJump?.ts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-violet-700" />
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Manual de Uso</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
              Admin
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Passo a passo + finalidade (Agenda e Presença/Faltas), com foco em reduzir falhas operacionais e sustentar
            constância.
          </p>
        </div>

        <div className="w-full lg:w-[420px]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar no manual (ex.: preview, CHECK, sem push, idempotência)"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
            />
          </div>
          {!!query && (
            <div className="text-[11px] text-slate-500 mt-2">
              Mostrando {filtered.length} de {SECTIONS.length} seções para “{q.trim()}”
            </div>
          )}
        </div>
      </div>

      <Card title="Atalhos">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => scrollTo('agenda')} className="px-4 py-2">
            Agenda
          </Button>
          <Button variant="secondary" onClick={() => scrollTo('presenca')} className="px-4 py-2">
            Presença/Faltas
          </Button>
          <Button variant="secondary" onClick={() => scrollTo('diagnostico')} className="px-4 py-2">
            Diagnóstico
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge status="confirmed" text="Constância" />
          <Badge status="pending" text="Modo manual (ritual diário)" />
          <Badge status="missing" text="Sem CTA de cancelar/remarcar" />
        </div>
      </Card>

      <div className="space-y-6">
        {filtered.map((section) => (
          <Card key={section.id} title={section.title}>
            <div id={section.id} className="scroll-mt-24" />
            {section.body}
          </Card>
        ))}
      </div>

      {!filtered.length && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          Nenhuma seção encontrada para “{q.trim()}”. Tente buscar por: <b>preview</b>, <b>CHECK</b>, <b>SEM_PUSH</b>,{' '}
          <b>idempotência</b>, <b>importação</b>.
        </div>
      )}
    </div>
  );
}
