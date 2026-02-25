import React, { useMemo, useState } from 'react';
import { Bell, Send, ExternalLink } from 'lucide-react';
import { Button, Card } from '../DesignSystem';
import { adminFetch } from '../../services/adminApi';

/**
 * Card: Disparos por Constância (Presença/Falta)
 * - Dispara follow-ups server-side com base em attendance_logs
 * - Prévia (dryRun) -> habilita Disparar
 * - Não cria qualquer funcionalidade de cancelar/reagendar pelo paciente.
 */
export default function AdminAttendanceFollowupsCard({ showToast, onGoToHistoryBatch }) {
  const [followupDays, setFollowupDays] = useState(30);
  const [followupLimit, setFollowupLimit] = useState(200);

  const [followupPreviewLoading, setFollowupPreviewLoading] = useState(false);
  const [followupSendLoading, setFollowupSendLoading] = useState(false);

  const [previewResult, setPreviewResult] = useState(null);
  const [sendResult, setSendResult] = useState(null);

  const [lastPreviewKey, setLastPreviewKey] = useState(null);
  const [lastPreviewAt, setLastPreviewAt] = useState(null);
  const [lastSendAt, setLastSendAt] = useState(null);

  const followupKey = useMemo(
    () => `${Number(followupDays) || 30}:${Number(followupLimit) || 200}`,
    [followupDays, followupLimit]
  );

  const openHistoryForBatch = (batchId) => {
    const bid = String(batchId || '').trim();
    if (!bid) return;
    onGoToHistoryBatch?.(bid);
  };

  const followupBusy = followupPreviewLoading || followupSendLoading;

  const previewStale = Boolean(previewResult?.ok) && lastPreviewKey !== followupKey;
  const isPreviewValid = Boolean(previewResult?.ok) && lastPreviewKey === followupKey;

  const reasonLabel = (r) => {
    const k = String(r || '').trim();
    if (!k) return '';
    const map = {
      already_sent: 'já enviado (idempotência)',
      no_phone: 'sem telefone',
      no_token: 'sem pushToken',
      inactive_patient: 'paciente inativo',
      inactive_subscriber: 'subscriber inativo',
      unlinked_patient: 'não vinculado (ID não encontrado no cadastro)',
      ambiguous_phone: 'telefone ambíguo (aparece em +1 cadastro)',
      phone_mismatch: 'conflito entre telefone do log e do cadastro',
    };
    return map[k] || k;
  };

  const callFollowups = async ({ dryRun }) => {
    if (followupBusy) return; // evita duplo clique / concorrência
    if (!dryRun) {
      const ok = window.confirm('Você está prestes a DISPARAR follow-ups (Presença/Falta).\n\nConfirme que a PRÉVIA está OK e que este lote deve ser enviado agora.');
      if (!ok) return;
    }
    if (dryRun) setFollowupPreviewLoading(true);
    else setFollowupSendLoading(true);

    try {
      const days = Math.max(1, Number(followupDays) || 30);
      const limit = Math.max(1, Number(followupLimit) || 200);

      const res = await adminFetch('/api/admin/attendance/send-followups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dryRun ? { days, limit, dryRun } : { days, limit, dryRun, confirm: 'SEND_FOLLOWUPS' }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao executar follow-ups de constância');
      }

      if (dryRun) {
        setPreviewResult(data);
        setLastPreviewKey(followupKey);
        setLastPreviewAt(Date.now());
        setSendResult(null);
        showToast?.('Prévia gerada. Se estiver tudo ok, clique em Disparar.', 'success');
      } else {
        setSendResult(data);
        setLastSendAt(Date.now());
        showToast?.('Disparos enviados e registrados em histórico.', 'success');
      }
    } catch (e) {
      const errObj = { ok: false, error: e?.message || 'Erro ao executar follow-ups' };
      if (dryRun) setPreviewResult(errObj);
      else setSendResult(errObj);
      showToast?.(e?.message || 'Erro ao executar follow-ups', 'error');
    } finally {
      if (dryRun) setFollowupPreviewLoading(false);
      else setFollowupSendLoading(false);
    }
  };

  const renderSummary = (data, { isPreview }) => {
    if (!data) return null;

    return (
      <div className="px-4 py-3 text-sm text-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-slate-500">totalLogs</div>
            <div className="font-semibold">{data.totalLogs ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">candidates</div>
            <div className="font-semibold">
              {data.candidates ?? '-'}
              {typeof data.candidatesTotal === 'number' && (
                <span className="ml-1 text-xs font-normal text-slate-500">/ {data.candidatesTotal}</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">blocked</div>
            <div className="font-semibold">{data.blocked ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">sent</div>
            <div className="font-semibold">{isPreview ? 0 : data.sent ?? '-'}</div>
          </div>

          <div>
            <div className="text-xs text-slate-500">presentes</div>
            <div className="font-semibold">{data.byStatus?.present ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">faltas</div>
            <div className="font-semibold">{data.byStatus?.absent ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">já enviado</div>
            <div className="font-semibold">{data.blockedAlreadySent ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">sem token</div>
            <div className="font-semibold">{data.blockedNoToken ?? 0}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-500">sem telefone</div>
            <div className="font-semibold">{data.blockedNoPhone ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">inativos</div>
            <div className="font-semibold">{data.blockedInactive ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">erros</div>
            <div className="font-semibold">{data.blockedErrors ?? 0}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-500">não vinculado</div>
            <div className="font-semibold">{data.blockedUnlinkedPatient ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">telefone ambíguo</div>
            <div className="font-semibold">{data.blockedAmbiguousPhone ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">conflito telefone</div>
            <div className="font-semibold">{data.blockedPhoneMismatch ?? 0}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderSample = (data) => {
    if (!data?.dryRun) return null;

    return (
      <div className="px-4 pb-4">
        <div className="text-xs font-semibold text-slate-600 mb-2">Amostra</div>
        {Array.isArray(data.sample) && data.sample.length > 0 ? (
          <div className="space-y-2">
            {data.sample.slice(0, 8).map((s, idx) => {
              const canSend = !!s.canSend;
              const reason = reasonLabel(s.blockedReason);

              return (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-700">
                      {String(s.status || '').toUpperCase()} • {s.phone || s.phoneCanonical || '-'}
                    </div>
                    <div className="text-[11px] text-slate-500">{s.name ? String(s.name) : ''}</div>
                  </div>

                  <div className={`mt-2 text-[11px] ${canSend ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {canSend ? 'Pode enviar' : `Bloqueado: ${reason || '—'}`}
                  </div>

                  {s.title && <div className="mt-2 text-sm font-semibold text-slate-800">{String(s.title)}</div>}
                  {s.body && <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{String(s.body)}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Nenhuma amostra retornada.</div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Disparos por Constância (Presença/Falta)</h3>
          <p className="text-sm text-slate-600">
            Envia mensagens de reforço quando houve presença e psicoeducação quando houve falta. O objetivo é sustentar o vínculo e a
            consistência do processo terapêutico.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Regras do produto: o paciente não cancela/reagenda por aqui. O foco é cuidado ativo + responsabilização.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-violet-600" />
          <span className="text-xs text-slate-500">Follow-up server-side</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="text-xs font-semibold text-slate-700">Orientação de uso (clínica + segurança)</div>
        <ul className="mt-2 text-xs text-slate-600 space-y-1 list-disc pl-4">
          <li>
            <b>Bloqueios não são “punição”</b>: são barreiras de segurança para evitar mensagem no paciente errado.
          </li>
          <li>
            <b>unlinked_patient</b>: revise o cadastro (ID do relatório ↔ paciente) antes de disparar.
          </li>
          <li>
            <b>ambiguous_phone / phone_mismatch</b>: corrija duplicidade/telefone. O sistema prefere vínculo por ID.
          </li>
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm text-slate-600">Dias (padrão 30)</label>
          <input
            type="number"
            min={1}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
            value={followupDays}
            onChange={(e) => {
              setFollowupDays(e.target.value);
              setPreviewResult(null);
              setSendResult(null);
            }}
          />
        </div>

        <div>
          <label className="text-sm text-slate-600">Limite (padrão 200)</label>
          <input
            type="number"
            min={1}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
            value={followupLimit}
            onChange={(e) => {
              setFollowupLimit(e.target.value);
              setPreviewResult(null);
              setSendResult(null);
            }}
          />
        </div>

        <div className="flex items-end gap-2">
          <Button onClick={() => callFollowups({ dryRun: true })} disabled={followupBusy} className="w-full">
            {followupPreviewLoading ? 'Gerando...' : 'Prévia (dryRun)'}
          </Button>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Ao mudar <span className="font-medium">Dias</span> ou <span className="font-medium">Limite</span>, a prévia expira e precisa ser gerada novamente.
      </div>

      <div className="mt-3">
        <Button onClick={() => callFollowups({ dryRun: false })} disabled={followupBusy || !isPreviewValid} className="w-full">
          <span className="inline-flex items-center gap-2">
            <Send className="w-4 h-4" />
            {followupSendLoading ? 'Disparando...' : 'Disparar'}
          </span>
        </Button>

        {previewStale && (
          <div className="mt-2 text-xs text-amber-700">Você alterou dias/limite após a prévia. Gere uma nova prévia para habilitar o disparo.</div>
        )}
      </div>

      {/* Resumos: Prévia e Disparo */}
      {(previewResult || sendResult) && (
        <div className="mt-4 space-y-3">
          {/* Prévia */}
          {previewResult && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">
                  Prévia (dryRun)
                  {lastPreviewAt && (
                    <span className="ml-2 text-xs font-normal text-slate-500">• última prévia em {new Date(lastPreviewAt).toLocaleString()}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {previewResult?.batchId ? (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => openHistoryForBatch(previewResult.batchId)}
                      icon={ExternalLink}
                      className="px-3 py-1.5 text-xs"
                    >
                      Abrir no Histórico
                    </Button>
                  ) : null}
                  <div className="text-xs text-slate-500">
                  {previewResult?.fromIsoDate && previewResult?.toIsoDate
                    ? `${previewResult.fromIsoDate} → ${previewResult.toIsoDate}`
                    : `últimos ${Number(followupDays) || 30} dias`}
                </div>
                </div>
              </div>

              {renderSummary(previewResult, { isPreview: true })}
              {renderSample(previewResult)}

              {!previewResult.ok && <div className="px-4 pb-3 text-sm text-red-600">Erro: {previewResult.error}</div>}
            </div>
          )}

          {/* Disparo */}
          {sendResult && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">
                  Último disparo
                  {lastSendAt && (
                    <span className="ml-2 text-xs font-normal text-slate-500">• enviado em {new Date(lastSendAt).toLocaleString()}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sendResult?.batchId ? (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => openHistoryForBatch(sendResult.batchId)}
                      icon={ExternalLink}
                      className="px-3 py-1.5 text-xs"
                    >
                      Abrir no Histórico
                    </Button>
                  ) : null}
                  <div className="text-xs text-slate-500">
                  {sendResult?.fromIsoDate && sendResult?.toIsoDate
                    ? `${sendResult.fromIsoDate} → ${sendResult.toIsoDate}`
                    : `últimos ${Number(followupDays) || 30} dias`}
                </div>
                </div>
              </div>

              {renderSummary(sendResult, { isPreview: false })}

              {!sendResult.ok && <div className="px-4 pb-3 text-sm text-red-600">Erro: {sendResult.error}</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
