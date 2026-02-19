import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, X, Upload, FileText, AlertTriangle } from 'lucide-react';
import { Button, Card } from '../DesignSystem';

/**
 * Card: Importar Presença/Faltas (com validação)
 * - Upload CSV + Verificar (dryRun) + Importar + Limpar
 * - Alimenta attendance_logs via API server-side (Admin SDK)
 * - Mantém o princípio clínico: constância e responsabilização
 */
export default function AdminAttendanceImportCard({
  attendanceImportSource,
  setAttendanceImportSource,
  attendanceImportDefaultStatus,
  setAttendanceImportDefaultStatus,
  attendanceImportMode,
  setAttendanceImportMode,
  attendanceImportColumnMap,
  setAttendanceImportColumnMap,
  attendanceImportText,
  setAttendanceImportText,
  attendanceImportLoading,
  attendanceImportResult,
  attendanceImportDryRunResult,
  attendanceImportValidatedHash,
  attendanceImportCurrentHash,
  handleAttendanceImportValidate,
  handleAttendanceImportCommit,
  handleAttendanceImportClear,
}) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState(null);

  const [csvColumns, setCsvColumns] = useState([]);
  const [csvSeparator, setCsvSeparator] = useState(',');

  const normalizeKey = (h) =>
    String(h || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const guessSeparator = (line) => {
    const s = String(line || '');
    const commas = (s.match(/,/g) || []).length;
    const semis = (s.match(/;/g) || []).length;
    const tabs = (s.match(/\t/g) || []).length;
    if (tabs > commas && tabs > semis) return '\t';
    if (semis > commas) return ';';
    return ',';
  };

  const splitLine = (line, sep) =>
    String(line || '')
      .split(sep)
      .map((x) => String(x || '').trim());

  const parseHeaderColumns = (csvText) => {
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return { columns: [], sep: ',' };
    const sep = guessSeparator(lines[0]);
    const columns = splitLine(lines[0], sep).filter((c) => c !== '');
    return { columns, sep };
  };

  const autoDetectColumn = (columns, candidates) => {
    const normCols = columns.map((c) => normalizeKey(c));
    for (const cand of candidates) {
      const idx = normCols.findIndex((c) => c === normalizeKey(cand));
      if (idx >= 0) return columns[idx];
    }
    return '';
  };

  const buildAutoMap = (columns) => {
    return {
      id: autoDetectColumn(columns, ['id', 'codigo', 'código', 'patientid', 'patient_id', 'idpaciente', 'id_paciente']),
      name: autoDetectColumn(columns, ['nome', 'name', 'paciente', 'cliente', 'paciente_nome', 'nomepaciente']),
      date: autoDetectColumn(columns, ['data', 'date', 'dia', 'data da sessao', 'data sessao', 'data_sessao', 'dt']),
      time: autoDetectColumn(columns, ['hora', 'time', 'horario', 'horário', 'hora sessao', 'hora da sessao', 'horario sessao', 'horario da sessao', 'inicio', 'start']),
      datetime: autoDetectColumn(columns, ['datahora', 'data_hora', 'data/hora', 'data e hora', 'datetime', 'dt_hr', 'dt_hr_inicio', 'inicio_datahora', 'inicio_dt_hr']),
      profissional: autoDetectColumn(columns, ['profissional', 'profissional(a)', 'prof', 'terapeuta', 'psicologo', 'psicóloga', 'psicologo(a)', 'responsavel']),
      service: autoDetectColumn(columns, ['servico', 'serviço', 'servicos', 'serviços', 'service', 'tipo', 'procedimento', 'atendimento']),
      location: autoDetectColumn(columns, ['local', 'location', 'sala', 'unidade']),
      status: autoDetectColumn(columns, ['status', 'presenca', 'presença', 'presenca/falta', 'falta', 'situacao', 'situação', 'compareceu']),
    };
  };

  useEffect(() => {
    const { columns, sep } = parseHeaderColumns(attendanceImportText);
    setCsvColumns(columns);
    setCsvSeparator(sep);

    // Se o admin escolheu modo "mapeado", tenta pré-preencher o mapa ao carregar arquivo
    if (attendanceImportMode === 'mapped' && columns.length) {
      const current = attendanceImportColumnMap || {};
      const hasAny = Object.values(current).some((v) => String(v || '').trim());
      if (!hasAny) {
        setAttendanceImportColumnMap(buildAutoMap(columns));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceImportText, attendanceImportMode]);


  const safeFilePart = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

  const escapeCsv = (value) => {
    const s = String(value ?? "");
    if (s.includes('"') || s.includes("\n") || s.includes(";") || s.includes(",")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const downloadTextFile = (filename, text, mime = "text/csv;charset=utf-8;") => {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // fallback: não faz nada (evita quebrar SSR)
      console.error("downloadTextFile error:", e);
    }
  };

  const buildIssuesRows = (res) => {
    const errors = Array.isArray(res?.errors) ? res.errors : [];
    const warnings = Array.isArray(res?.warnings) ? res.warnings : [];

    const mapError = (er) => ({
      type: "error",
      line: er?.line ?? "",
      field: er?.field ?? "",
      code: er?.code ?? "",
      message: er?.error ?? "",
      value: er?.value ?? "",
      patientId: er?.patientId ?? "",
      name: er?.name ?? "",
      isoDate: er?.isoDate ?? "",
      time: er?.time ?? "",
      profissional: er?.profissional ?? "",
      service: er?.service ?? "",
      location: er?.location ?? "",
      status: er?.status ?? "",
      statusRaw: er?.statusRaw ?? "",
      rawLine: er?.rawLine ?? "",
    });

    const mapWarning = (wr) => ({
      type: "warning",
      line: wr?.line ?? "",
      field: wr?.field ?? "",
      code: wr?.code ?? "",
      message: wr?.warning ?? "",
      value: wr?.value ?? "",
      patientId: wr?.patientId ?? "",
      name: wr?.name ?? "",
      isoDate: wr?.isoDate ?? "",
      time: wr?.time ?? "",
      profissional: wr?.profissional ?? "",
      service: wr?.service ?? "",
      location: wr?.location ?? "",
      status: wr?.status ?? "",
      statusRaw: wr?.statusRaw ?? "",
      rawLine: wr?.rawLine ?? "",
    });

    return [...errors.map(mapError), ...warnings.map(mapWarning)];
  };

  const handleDownloadIssuesCsv = () => {
    const res = attendanceImportDryRunResult;
    const rows = buildIssuesRows(res);
    if (!rows.length) return;

    const cols = [
      "type",
      "line",
      "field",
      "code",
      "message",
      "value",
      "patientId",
      "name",
      "isoDate",
      "time",
      "profissional",
      "service",
      "location",
      "status",
      "statusRaw",
      "rawLine",
    ];

    const csv = [
      cols.join(";"),
      ...rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(";")),
    ].join("\n");

    const datePart = new Date().toISOString().slice(0, 10);
    const srcPart = safeFilePart(attendanceImportSource) || "import";
    downloadTextFile(`inconsistencias_${srcPart}_${datePart}.csv`, csv);
  };


  const handleDownloadNormalizedPreviewCsv = () => {
    const res = attendanceImportDryRunResult;
    const rows = Array.isArray(res?.normalizedRows) ? res.normalizedRows : [];
    if (!rows.length) return;

    const cols = [
      "line",
      "patientId",
      "name",
      "isoDate",
      "time",
      "profissional",
      "service",
      "location",
      "status",
      "phone",
    ];

    const csv = [
      cols.join(";"),
      ...rows.map((r) => cols.map((c) => escapeCsv(r?.[c] ?? "")).join(";")),
    ].join("\n");

    const datePart = new Date().toISOString().slice(0, 10);
    const srcPart = safeFilePart(attendanceImportSource) || "import";
    const truncPart = res?.normalizedRowsTruncated ? "_TRUNCADO" : "";
    downloadTextFile(`preview_normalizado_${srcPart}_${datePart}${truncPart}.csv`, csv);
  };


  const setMapField = (key, value) => {
    setAttendanceImportColumnMap((prev) => ({
      ...(prev || {}),
      [key]: value,
    }));
  };

  const colOptions = [''].concat(csvColumns || []);


  const onPickFile = (e) => {
    const file = e?.target?.files?.[0];
    setFileError(null);
    if (!file) return;

    setFileName(file.name || 'planilha.csv');

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setAttendanceImportText(text);
    };
    reader.onerror = () => setFileError('Não foi possível ler o arquivo. Tente novamente.');
    reader.readAsText(file, 'utf-8');
  };

  const openFilePicker = () => {
    setFileError(null);
    if (fileRef.current) fileRef.current.click();
  };

  const onClearAll = () => {
    handleAttendanceImportClear();
    setFileName('');
    setFileError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasCsv = Boolean(String(attendanceImportText || '').trim());
  const isValidated = Boolean(attendanceImportDryRunResult?.ok && attendanceImportValidatedHash && attendanceImportValidatedHash === attendanceImportCurrentHash);
  const canImport = isValidated && Number(attendanceImportDryRunResult?.wouldImport || 0) > 0;
  const hasIssues = (Number(attendanceImportDryRunResult?.errors?.length || 0) + Number(attendanceImportDryRunResult?.warnings?.length || 0)) > 0;

  return (
    <Card className="p-5 mt-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Importar Presença/Faltas</h3>
          <p className="text-sm text-slate-600">
            Faça upload do CSV para alimentar <b>attendance_logs</b>. Primeiro valide (Verificar) e só então importe.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Campos mínimos: <code className="px-1 py-0.5 rounded bg-slate-100">ID, DATA, HORA</code> (ou <code className="px-1 py-0.5 rounded bg-slate-100">DATA/HORA</code>). As demais colunas são opcionais.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
        <div>
          <label className="text-sm text-slate-600">Fonte</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
            value={attendanceImportSource}
            onChange={(e) => setAttendanceImportSource(e.target.value)}
            placeholder="ex.: sistema_atual / recepção / manual"
          />
        </div>

        <div>
          <label className="text-sm text-slate-600">Status padrão (se STATUS faltar/vazio)</label>
          <select
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
            value={attendanceImportDefaultStatus}
            onChange={(e) => setAttendanceImportDefaultStatus(e.target.value)}
          >
            <option value="absent">Falta</option>
            <option value="present">Presença</option>
          </select>
        </div>


        <div>
          <label className="text-sm text-slate-600">Modo</label>
          <select
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
            value={attendanceImportMode}
            onChange={(e) => setAttendanceImportMode(e.target.value)}
          >
            <option value="auto">Automático (recomendado)</option>
            <option value="mapped">Mapear colunas (relatório alternativo)</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            Use “Mapear colunas” para a 2ª planilha/relatório com cabeçalhos diferentes. Obrigatório: <b>ID</b> e <b>DATA+HORA</b> (ou <b>DATA/HORA</b>).
          </p>
        </div>

        <div>
          <label className="text-sm text-slate-600">Upload do CSV</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onPickFile}
              className="hidden"
              disabled={attendanceImportLoading}
            />

            <Button
              variant="secondary"
              onClick={openFilePicker}
              disabled={attendanceImportLoading}
              icon={Upload}
              type="button"
              className="shrink-0"
            >
              Escolher arquivo
            </Button>

            <div className="min-w-0 flex-1 text-sm text-slate-600">
              {fileName ? (
                <span className="flex items-center gap-1 truncate">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">{fileName}</span>
                </span>
              ) : (
                <span className="text-slate-400">Nenhum arquivo escolhido</span>
              )}
            </div>
          </div>

          {fileError && (
            <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {fileError}
            </div>
          )}
        </div>
      </div>


      {attendanceImportMode === 'mapped' && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Mapeamento de colunas</h4>
              <p className="text-xs text-slate-500 mt-1">
                Para a 2ª planilha/relatório (cabeçalhos diferentes). O servidor valida isso ao clicar em <b>Verificar</b>.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Separador detectado:{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100">
                  {csvSeparator === '\t' ? 'TAB' : csvSeparator}
                </code>{" "}
                • Colunas: {csvColumns.length}
              </p>
            </div>

            <Button
              variant="secondary"
              type="button"
              onClick={() => setAttendanceImportColumnMap(buildAutoMap(csvColumns))}
              disabled={!csvColumns.length || attendanceImportLoading}
              icon={FileText}
              className="shrink-0"
            >
              Auto-preencher
            </Button>
          </div>

          {!csvColumns.length ? (
            <div className="mt-3 text-sm text-slate-500">
              Envie um CSV para listar as colunas e habilitar o mapeamento.
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600">
                  ID <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.id || ''}
                  onChange={(e) => setMapField('id', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`id_${c}`} value={c}>
                      {c || '— selecione —'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">STATUS (opcional)</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.status || ''}
                  onChange={(e) => setMapField('status', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`status_${c}`} value={c}>
                      {c || '— (usar status padrão) —'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">DATA</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.date || ''}
                  onChange={(e) => setMapField('date', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`date_${c}`} value={c}>
                      {c || '— (opcional se usar DATA/HORA) —'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">HORA</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.time || ''}
                  onChange={(e) => setMapField('time', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`time_${c}`} value={c}>
                      {c || '— (opcional se usar DATA/HORA) —'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">
                  DATA/HORA <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.datetime || ''}
                  onChange={(e) => setMapField('datetime', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`datetime_${c}`} value={c}>
                      {c || '— (usar DATA + HORA) —'}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Se escolher DATA/HORA, pode deixar DATA e HORA em branco.
                </p>
              </div>

              <div>
                <label className="text-sm text-slate-600">NOME (opcional)</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.name || ''}
                  onChange={(e) => setMapField('name', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`name_${c}`} value={c}>
                      {c || '—'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">PROFISSIONAL (opcional)</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.profissional || ''}
                  onChange={(e) => setMapField('profissional', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`prof_${c}`} value={c}>
                      {c || '—'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">SERVIÇOS (opcional)</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.service || ''}
                  onChange={(e) => setMapField('service', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`service_${c}`} value={c}>
                      {c || '—'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-600">LOCAL (opcional)</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200"
                  value={attendanceImportColumnMap?.location || ''}
                  onChange={(e) => setMapField('location', e.target.value)}
                >
                  {colOptions.map((c) => (
                    <option key={`loc_${c}`} value={c}>
                      {c || '—'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
            <p className="text-xs text-slate-600">
              Obrigatório: <b>ID</b> e (<b>DATA</b>+<b>HORA</b> ou <b>DATA/HORA</b>). O objetivo aqui não é “policiar”:
              é sustentar continuidade e permitir cuidado ativo quando houver afastamento.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Button
          variant="secondary"
          onClick={handleAttendanceImportValidate}
          disabled={attendanceImportLoading || !hasCsv}
          className="w-full"
          icon={Upload}
        >
          {attendanceImportLoading ? 'Processando...' : 'Verificar (validação)'}
        </Button>

        <Button
          onClick={handleAttendanceImportCommit}
          disabled={attendanceImportLoading || !canImport}
          className="w-full"
        >
          {attendanceImportLoading ? 'Importando...' : 'Importar'}
        </Button>

        <Button
          variant="secondary"
          onClick={onClearAll}
          disabled={attendanceImportLoading || (!hasCsv && !attendanceImportDryRunResult && !attendanceImportResult)}
          className="w-full"
        >
          Limpar
        </Button>
      </div>

      {!isValidated && attendanceImportDryRunResult?.ok && attendanceImportValidatedHash && attendanceImportValidatedHash !== attendanceImportCurrentHash && (
        <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
          Você alterou o CSV após validar. Clique novamente em <b>Verificar</b> antes de importar.
        </div>
      )}

      <div className="mt-4">
        <label className="text-sm text-slate-600">CSV (editável)</label>
        <textarea
          className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 min-h-[140px]"
          value={attendanceImportText}
          onChange={(e) => setAttendanceImportText(e.target.value)}
          placeholder={'ID,NOME,DATA,HORA,PROFISSIONAL,SERVIÇOS,LOCAL,STATUS\n123,João,07/02/2026,14:00,Paulo,Psicoterapia,Online,present\n...'}
        />
      </div>

      {/* Resultado da validação (dryRun) */}
      {attendanceImportDryRunResult?.ok && attendanceImportDryRunResult?.dryRun && (
        <div className="mt-4 text-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle className="w-4 h-4" />
            <span>
              Validação: <b>{attendanceImportDryRunResult.wouldImport}</b> importáveis de <b>{attendanceImportDryRunResult.candidates}</b> linhas • Ignoradas: <b>{attendanceImportDryRunResult.skipped}</b>
              {Number(attendanceImportDryRunResult.warned || 0) > 0 ? (
                <> • Avisos: <b>{attendanceImportDryRunResult.warned}</b></>
              ) : null}
              {Number(attendanceImportDryRunResult.warnedNoPhone || 0) > 0 ? (
                <> • Sem tel.: <b>{attendanceImportDryRunResult.warnedNoPhone}</b></>
              ) : null}
              {Number(attendanceImportDryRunResult.skippedDuplicateInFile || 0) > 0 ? (
                <> • Duplicadas: <b>{attendanceImportDryRunResult.skippedDuplicateInFile}</b></>
              ) : null}
            </span>
          </div>


          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
            <Button
              variant="secondary"
              onClick={handleDownloadIssuesCsv}
              disabled={!hasIssues}
              className="w-full md:w-auto"
              icon={FileText}
            >
              Baixar inconsistências (CSV)
            </Button>

            <Button
              variant="secondary"
              onClick={handleDownloadNormalizedPreviewCsv}
              disabled={!attendanceImportDryRunResult?.normalizedRows?.length}
              className="w-full md:w-auto"
              icon={FileText}
            >
              Baixar preview normalizado (CSV)
            </Button>
          </div>

          {attendanceImportDryRunResult?.normalizedRowsTruncated && (
            <div className="mt-1 text-xs text-slate-500">
              Preview normalizado truncado (máx. 5000 linhas). Se precisar do arquivo completo, reduza o período/quantidade no CSV.
            </div>
          )}

          {attendanceImportDryRunResult.errors?.length > 0 && (
            <div className="mt-2 text-slate-600">
              <div className="font-semibold">Erros (amostra):</div>
              <ul className="list-disc ml-5">
                {attendanceImportDryRunResult.errors.slice(0, 10).map((er, idx) => (
                  <li key={idx}>
                    Linha {er.line}{er.field ? ` [${er.field}]` : ''}: {er.error}{er.value ? ` (${er.value})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {attendanceImportDryRunResult.warnings?.length > 0 && (
            <div className="mt-2 text-slate-600">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Avisos (amostra):
              </div>
              <ul className="list-disc ml-5">
                {attendanceImportDryRunResult.warnings.slice(0, 10).map((wr, idx) => (
                  <li key={idx}>
                    Linha {wr.line}{wr.field ? ` [${wr.field}]` : ''}: {wr.warning}{wr.value ? ` (${wr.value})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {attendanceImportDryRunResult.sample?.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-slate-600">Linha</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">ID</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Nome</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Data</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Hora</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Prof.</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Serviços</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Local</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Status</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Tel</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceImportDryRunResult.sample.map((row, idx) => (
                    <tr key={`${row.line}-${idx}`} className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-700">{row.line}</td>
                      <td className="px-3 py-2 text-slate-700">{row.patientId || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.name || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.isoDate || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.time || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.profissional || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.service || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.location || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.status}</td>
                      <td className="px-3 py-2 text-slate-700">{row.phone || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.result}{row.reason ? ` (${row.reason})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Dica clínica: cada falta é uma interrupção do processo. Use os “Ignorados” e “Sem tel.” para ajustar cadastros (ex.: patientExternalId/phoneCanonical) e fortalecer a constância.
          </p>
        </div>
      )}

      {/* Resultado do import (commit) */}
      {attendanceImportResult && (
        <div className="mt-4 text-sm">
          {attendanceImportResult.ok ? (
            <div className="flex items-center gap-2 text-slate-700">
              <CheckCircle className="w-4 h-4" />
              <span>
                Importado: <b>{attendanceImportResult.imported}</b> • Ignorados: <b>{attendanceImportResult.skipped}</b>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <X className="w-4 h-4" />
              <span>Erro: {attendanceImportResult.error}</span>
            </div>
          )}

          {attendanceImportResult.ok && attendanceImportResult.errors?.length > 0 && (
            <div className="mt-2 text-slate-600">
              <div className="font-semibold">Amostra de erros:</div>
              <ul className="list-disc ml-5">
                {attendanceImportResult.errors.slice(0, 10).map((er, idx) => (
                  <li key={idx}>
                    Linha {er.line}{er.field ? ` [${er.field}]` : ''}: {er.error}{er.value ? ` (${er.value})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
