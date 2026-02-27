// NFS-e XML Parser (SPED NFS-e namespace) — dependency-free.
// Goal: extract totals + taxes + tomador identification (CNPJ/CPF + Nome).

function normDigits(v) {
  return String(v || '').replace(/\D+/g, '');
}

function toNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;

  // Normalize currency/spacing (defensive)
  s = s.replace(/\s+/g, '').replace(/[R$\u00A0]/g, '');

  // NFS-e XML commonly uses dot decimals (e.g., 3108.00).
  // Some providers export PT-BR formatting (e.g., 3.108,00).
  // Rules:
  // - If has both ',' and '.', treat '.' as thousands and ',' as decimal.
  // - Else if has ',', treat ',' as decimal.
  // - Else (only '.' or digits), keep '.' as decimal.
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else if (s.includes(',')) {
    s = s.replace(/,/g, '.');
  }

  // Keep only digits, minus and dot.
  s = s.replace(/[^0-9.-]/g, '');

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pickFirst(str, re) {
  const m = re.exec(str);
  if (!m) return '';
  return String(m[1] ?? '').trim();
}

function extractAllNFSeBlocks(xmlText, max = 50000) {
  const xml = String(xmlText || '');
  const out = [];
  const re = /<NFSe\b[^>]*>[\s\S]*?<\/NFSe>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[0]);
    if (out.length >= max) break;
  }

  // Single NFSe file fallback (in case regex fails because of casing/whitespace)
  if (out.length === 0 && /<infNFSe\b/i.test(xml) && /<\/NFSe>/i.test(xml)) {
    out.push(xml);
  }

  return out;
}

function competenceFromAny(nfseXml) {
  const xml = String(nfseXml || '');
  const dCompet = pickFirst(xml, /<dCompet>([^<]+)<\/dCompet>/i);
  if (dCompet) {
    const m = dCompet.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { competenceDate: `${m[1]}-${m[2]}-${m[3]}`, competenceMonth: `${m[1]}-${m[2]}` };
  }

  const dh =
    pickFirst(xml, /<dhEmi>([^<]+)<\/dhEmi>/i) ||
    pickFirst(xml, /<dhProc>([^<]+)<\/dhProc>/i);

  const mm = dh.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mm) return { competenceDate: `${mm[1]}-${mm[2]}-${mm[3]}`, competenceMonth: `${mm[1]}-${mm[2]}` };

  return { competenceDate: '', competenceMonth: 'unknown' };
}

function emissionFromAny(nfseXml) {
  const xml = String(nfseXml || '');
  // Prefer DPS emission timestamp when present
  const dh =
    pickFirst(xml, /<dhEmi>([^<]+)<\/dhEmi>/i) ||
    pickFirst(xml, /<dhProc>([^<]+)<\/dhProc>/i);

  const mm = dh.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mm) {
    const ymd = `${mm[1]}-${mm[2]}-${mm[3]}`;
    return { emissionIso: dh, emissionDate: ymd, emissionMonth: `${mm[1]}-${mm[2]}` };
  }

  return { emissionIso: '', emissionDate: '', emissionMonth: 'unknown' };
}

function parseEmit(nfseXml) {
  const xml = String(nfseXml || '');
  const emitBlock = pickFirst(xml, /<emit>([\s\S]*?)<\/emit>/i);
  const name = emitBlock ? pickFirst(emitBlock, /<xNome>([^<]+)<\/xNome>/i) : '';
  const cnpj = emitBlock ? pickFirst(emitBlock, /<CNPJ>([^<]+)<\/CNPJ>/i) : '';
  return {
    emitName: name,
    emitCNPJ: normDigits(cnpj),
  };
}

function parseNFSeId(nfseXml) {
  const xml = String(nfseXml || '');
  // <infNFSe Id="..."> attribute
  return (
    pickFirst(xml, /<infNFSe\b[^>]*\bId="([^"]+)"/i) ||
    pickFirst(xml, /<infNFSe\b[^>]*\bId='([^']+)'/i)
  );
}

function parseDpsMeta(nfseXml) {
  const xml = String(nfseXml || '');
  const serie = pickFirst(xml, /<serie>([^<]+)<\/serie>/i);
  const nDPS = pickFirst(xml, /<nDPS>([^<]+)<\/nDPS>/i);
  return {
    serie: String(serie || '').trim(),
    nDPS: String(nDPS || '').trim(),
  };
}

function parseTomador(nfseXml) {
  const xml = String(nfseXml || '');
  // tomador is inside <toma> ... </toma>
  const tomaBlock = pickFirst(xml, /<toma>([\s\S]*?)<\/toma>/i);
  const name = tomaBlock ? pickFirst(tomaBlock, /<xNome>([^<]+)<\/xNome>/i) : '';
  const cnpj = tomaBlock ? pickFirst(tomaBlock, /<CNPJ>([^<]+)<\/CNPJ>/i) : '';
  const cpf = tomaBlock ? pickFirst(tomaBlock, /<CPF>([^<]+)<\/CPF>/i) : '';
  const doc = normDigits(cnpj || cpf);
  return {
    tomadorName: name,
    tomadorDoc: doc,
  };
}

function parseNFSe(nfseXml, idx = 0) {
  const xml = String(nfseXml || '');

  const nfseId = parseNFSeId(xml);
  const nNFSe = pickFirst(xml, /<nNFSe>([^<]+)<\/nNFSe>/i);

  // gross: prefer DPS/valores/vServPrest/vServ; fallback to infNFSe/valores/vBC
  const vServ = pickFirst(xml, /<vServPrest>[\s\S]*?<vServ>([^<]+)<\/vServ>/i);

  // vBC appears multiple times (including vBCPisCofins). Anchor inside infNFSe/valores.
  const infValores = pickFirst(xml, /<infNFSe\b[\s\S]*?<valores>([\s\S]*?)<\/valores>/i);
  const vBC = infValores ? pickFirst(infValores, /<vBC>([^<]+)<\/vBC>/i) : '';

  const gross = toNumber(vServ || vBC);

  // Valores base (como vieram no XML)
  const vLiqStr = infValores ? pickFirst(infValores, /<vLiq>([^<]+)<\/vLiq>/i) : '';
  const totalRetRaw = infValores ? toNumber(pickFirst(infValores, /<vTotalRet>([^<]+)<\/vTotalRet>/i)) : 0;

  // Se vLiq não existir, faz fallback para gross - vTotalRet
  const netXml = vLiqStr ? toNumber(vLiqStr) : (gross ? gross - totalRetRaw : 0);

  const iss = infValores ? toNumber(pickFirst(infValores, /<vISSQN>([^<]+)<\/vISSQN>/i)) : 0;

  // net/totalRet podem ser ajustados após leitura de PIS/COFINS (regra Itaquaquecetuba)
  let net = netXml;
  let totalRet = totalRetRaw;

  // Totais de tributos (quando presentes)
  const totTribBlock = pickFirst(xml, /<totTrib>[\s\S]*?<vTotTrib>([\s\S]*?)<\/vTotTrib>/i);
  const totTribFed = totTribBlock ? toNumber(pickFirst(totTribBlock, /<vTotTribFed>([^<]+)<\/vTotTribFed>/i)) : 0;
  const totTribEst = totTribBlock ? toNumber(pickFirst(totTribBlock, /<vTotTribEst>([^<]+)<\/vTotTribEst>/i)) : 0;
  const totTribMun = totTribBlock ? toNumber(pickFirst(totTribBlock, /<vTotTribMun>([^<]+)<\/vTotTribMun>/i)) : 0;

  // Taxes inside DPS/infDPS/valores/trib
  const tribFedBlock = pickFirst(xml, /<tribFed>([\s\S]*?)<\/tribFed>/i);
  const piscofinsBlock = tribFedBlock ? pickFirst(tribFedBlock, /<piscofins>([\s\S]*?)<\/piscofins>/i) : '';

  const pis = piscofinsBlock ? toNumber(pickFirst(piscofinsBlock, /<vPis>([^<]+)<\/vPis>/i)) : 0;
  const cofins = piscofinsBlock ? toNumber(pickFirst(piscofinsBlock, /<vCofins>([^<]+)<\/vCofins>/i)) : 0;

  const irrf = tribFedBlock ? toNumber(pickFirst(tribFedBlock, /<vRetIRRF>([^<]+)<\/vRetIRRF>/i)) : 0;
  const csll = tribFedBlock ? toNumber(pickFirst(tribFedBlock, /<vRetCSLL>([^<]+)<\/vRetCSLL>/i)) : 0;

  // --- Regra (Itaquaquecetuba): considerar PIS/COFINS como retidos no fechamento ---
  // Mesmo que o XML não marque como "retido", o município orienta abater do líquido.
  // Ajustes:
  // - totalRet := vTotalRet + (vPis + vCofins)
  // - net := netXml - (vPis + vCofins) *apenas se o provedor não tiver abatido isso no vLiq*
  const pisCofins = Number(pis || 0) + Number(cofins || 0);
  if (pisCofins > 0) {
    const tol = 0.02; // tolerância de centavos para comparar gross - net
    const diff = gross ? (gross - netXml) : 0;

    totalRet = totalRetRaw + pisCofins;

    // Se gross - netXml ainda não cobre o novo totalRet, então vLiq não abateu PIS/COFINS.
    if (!gross || diff + tol < totalRet) {
      net = netXml - pisCofins;
      if (net < 0) net = 0;
    } else {
      net = netXml;
    }
  }

  const { competenceDate, competenceMonth } = competenceFromAny(xml);
  const { emissionIso, emissionDate, emissionMonth } = emissionFromAny(xml);
  const { tomadorName, tomadorDoc } = parseTomador(xml);
  const { emitName, emitCNPJ } = parseEmit(xml);
  const { serie, nDPS } = parseDpsMeta(xml);

  // deterministic id (for UI keys) — not persisted
  const id = `${competenceMonth || 'unknown'}:${nNFSe || idx}`;

  return {
    id,
    nfseId,
    nNFSe,
    serie,
    nDPS,

    emitName,
    emitCNPJ,

    emissionIso,
    emissionDate,
    emissionMonth,

    competenceDate,
    competenceMonth,
    tomadorName,
    tomadorDoc,
    gross,
    net,
    iss,
    pis,
    cofins,
    irrf,
    csll,
    totalRet,

    totTribFed,
    totTribEst,
    totTribMun,
  };
}

function sumFields(items) {
  const out = {
    count: 0,
    gross: 0,
    net: 0,
    iss: 0,
    pis: 0,
    cofins: 0,
    irrf: 0,
    csll: 0,
    totalRet: 0,
    totTribFed: 0,
    totTribEst: 0,
    totTribMun: 0,
  };

  (items || []).forEach((n) => {
    out.count += 1;
    out.gross += Number(n?.gross || 0);
    out.net += Number(n?.net || 0);
    out.iss += Number(n?.iss || 0);
    out.pis += Number(n?.pis || 0);
    out.cofins += Number(n?.cofins || 0);
    out.irrf += Number(n?.irrf || 0);
    out.csll += Number(n?.csll || 0);
    out.totalRet += Number(n?.totalRet || 0);

    out.totTribFed += Number(n?.totTribFed || 0);
    out.totTribEst += Number(n?.totTribEst || 0);
    out.totTribMun += Number(n?.totTribMun || 0);
  });

  return out;
}

function groupByTomador(notes) {
  const map = new Map();
  (notes || []).forEach((n) => {
    const doc = String(n?.tomadorDoc || '').trim() || 'unknown';
    const name = String(n?.tomadorName || '').trim() || '—';
    const key = `${doc}::${name}`;
    if (!map.has(key)) {
      map.set(key, { doc: doc === 'unknown' ? '' : doc, name, gross: 0, net: 0 });
    }
    const cur = map.get(key);
    cur.gross += Number(n?.gross || 0);
    cur.net += Number(n?.net || 0);
  });

  const out = Array.from(map.values());
  out.sort((a, b) => (b.gross || 0) - (a.gross || 0));
  return out;
}

export function parseNFSeXMLBatch(xmlTexts) {
  const notes = [];

  let idx = 0;
  (xmlTexts || []).forEach((txt) => {
    const blocks = extractAllNFSeBlocks(txt);
    blocks.forEach((b) => {
      notes.push(parseNFSe(b, idx));
      idx += 1;
    });
  });

  // Sort by competenceDate then nNFSe
  notes.sort((a, b) => {
    const ad = String(a?.competenceDate || '');
    const bd = String(b?.competenceDate || '');
    if (ad < bd) return -1;
    if (ad > bd) return 1;
    const an = String(a?.nNFSe || '');
    const bn = String(b?.nNFSe || '');
    return an.localeCompare(bn);
  });

  const byMonthMap = {};
  notes.forEach((n) => {
    const m = String(n?.competenceMonth || 'unknown');
    if (!byMonthMap[m]) byMonthMap[m] = [];
    byMonthMap[m].push(n);
  });

  const months = Object.keys(byMonthMap).sort();

  const summaryByMonth = {};
  const byTomador = { all: groupByTomador(notes) };

  months.forEach((m) => {
    summaryByMonth[m] = sumFields(byMonthMap[m]);
    byTomador[m] = groupByTomador(byMonthMap[m]);
  });

  const totals = sumFields(notes);

  return {
    notes,
    months,
    summaryByMonth,
    byTomador,
    totals,
    meta: {
      countNotes: notes.length,
    },
  };
}
