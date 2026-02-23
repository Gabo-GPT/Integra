/**
 * nocAnalyzer.js - Analizador Inteligente DOCSIS Multiplataforma NOC ISP Tier 1
 * Detecta: ARRIS E600, vCMTS, CASA
 * Motor de reglas NOC con semáforos (verde/amarillo/naranja/rojo/azul masivo)
 */
(function (global) {
  'use strict';

  var CMTS_TYPES = { ARRIS: 'ARRIS E600', vCMTS: 'vCMTS', CASA: 'CASA', DESCONOCIDO: 'Desconocido' };

  function detectCmtsType(raw) {
    if (!raw || typeof raw !== 'string') return CMTS_TYPES.DESCONOCIDO;
    var t = raw.toUpperCase();
    if (/ARRIS|CISCO\s*E600|E6000|CBR-8|CHORUS/i.test(t)) return CMTS_TYPES.ARRIS;
    if (/vCMTS|VCMTS|CISCO\s*RPHY|R-PHY|CCAP/i.test(t)) return CMTS_TYPES.vCMTS;
    if (/CASA|C4|C10|SYSTEM\s*3200|CMTS\s*CASA/i.test(t)) return CMTS_TYPES.CASA;
    return CMTS_TYPES.DESCONOCIDO;
  }

  function parseNum(s) {
    if (s == null || typeof s !== 'string') return null;
    var t = String(s).trim().replace(/[^\d.,\-]/g, '').replace(',', '.');
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }

  function parseIntSafe(s) {
    if (s == null || typeof s !== 'string') return null;
    var t = String(s).replace(/\D/g, '');
    var n = parseInt(t, 10);
    return isNaN(n) ? null : n;
  }

  function extractMetrics(modemRaw, upstreamRaw) {
    var combined = [modemRaw, upstreamRaw].filter(Boolean).join('\n');
    var out = {
      tx: null, rx: null, snrUp: null, snrDown: null,
      flaps: null, crc: null, uncorrectables: null, rangingRetries: null, uptime: null,
      utilization: null, totalModems: null, uncorrectablesGlobal: null,
      interfaceId: '', node: ''
    };
    if (!combined.trim()) return out;

    /* TX Upstream (Peak Transmit Power) */
    var m = combined.match(/(?:Peak\s+)?(?:Transmit|Tx)\s*Power\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|Peak\s+Power\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)/i);
    if (m) out.tx = parseNum(m[1] || m[2]);

    /* RX Downstream */
    m = combined.match(/(?:Receive|Rx|Downstream)\s*(?:Power|Signal)\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|Power\s+Level\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|(?:Downstream\s+)?(?:Receive|Rx)\s*Power\s*:?\s*([\d.,\-]+)/i);
    if (!m) m = combined.match(/(?:RX|Down)\s*(?:Power)?\s*:?\s*([\d.,\-]+)/i);
    if (m) out.rx = parseNum(m[1] || m[2] || m[3]);

    /* SNR Upstream */
    m = combined.match(/(?:Upstream\s+)?SNR[\s:]+([\d.,\-]+)|Signal[\s\/]Noise[\s:]+([\d.,\-]+)|SNR\s*\(dB\)[\s:]+([\d.,\-]+)/i);
    if (m) out.snrUp = parseNum(m[1] || m[2] || m[3]);

    /* SNR Downstream */
    m = combined.match(/SNR\s*(?:Down|Downstream)?[\s:]+([\d.,\-]+)|Downstream\s+SNR[\s:]+([\d.,\-]+)/i);
    if (!m) m = combined.match(/(?:Rx|Down)\s*SNR[\s:]+([\d.,\-]+)/i);
    if (m) out.snrDown = parseNum(m[1] || m[2]);

    /* Flaps */
    m = combined.match(/Flaps?[\s:]+([\d\s,]+)|(?:US|DS)\s*Flaps?[\s:]+([\d\s,]+)/i);
    if (m) out.flaps = parseIntSafe(m[1] || m[2]);

    /* CRC / Uncorrectables */
    m = combined.match(/([\d\s,]+)\s+Uncorrectables?|Uncorrectables?[\s:]+([\d\s,]+)/i);
    if (m) out.uncorrectables = parseIntSafe(m[1] || m[2]);
    if (out.uncorrectables == null) {
      m = combined.match(/([\d\s,]+)\s+Uncorrectable\s+codewords/i);
      if (m) out.uncorrectables = parseIntSafe(m[1]);
    }

    /* Ranging retries */
    m = combined.match(/Ranging\s+Retries?[\s:]+([\d\s,]+)|Retries?[\s:]+([\d\s,]+)/i);
    if (m) out.rangingRetries = parseIntSafe(m[1] || m[2]);

    /* Uptime */
    m = combined.match(/Uptime[\s:]+([\d\w\s:\.\-]+?)(?:\n|$)/i);
    if (m) out.uptime = m[1].trim();
    if (!out.uptime) {
      m = combined.match(/Total\s+Time\s+Online[\s:]+([\d\w\s:\.\-]+?)(?:\n|$)/i);
      if (m) out.uptime = m[1].trim();
    }

    /* Utilización upstream */
    m = combined.match(/(?:Avg\.?\s*)?(?:upstream\s+)?(?:channel\s+)?utilization[\s:]+([\d.,]+)|Utilization[\s:]+([\d.,]+)\s*%?/i);
    if (m) out.utilization = parseNum(m[1] || m[2]);

    /* Total modems en canal */
    m = combined.match(/Total\s+Modems?\s+On\s+This\s+(?:Upstream\s+)?Channel\s*:\s*(\d+)|(?:Total\s+)?(?:modems?|CMs?)\s+(?:on\s+channel|online)[\s:]+([\d\s,]+)/i);
    if (m) out.totalModems = parseIntSafe(m[1] || m[2]);

    /* Interface / Nodo */
    m = combined.match(/(?:Interface|Upstream)\s+([\w\s\/\-\.]+?)(?:\s|$|:)|(Upstream\s+\d+\/\d+)/i);
    if (m) out.interfaceId = (m[1] || m[2] || '').trim();
    m = combined.match(/Nodo[\s:]+([\w\-\.]+)|Node[\s:]+([\w\-\.]+)/i);
    if (m) out.node = (m[1] || m[2] || '').trim();

    /* Uncorrectables globales (del upstream FEC) */
    m = combined.match(/([\d\s,]+)\s+Unerroreds?,\s*([\d\s,]+)\s+Correcteds?,\s*([\d\s,]+)\s+Uncorrectables?/i);
    if (m) out.uncorrectablesGlobal = parseIntSafe(m[3]);
    if (out.uncorrectablesGlobal == null && out.uncorrectables != null) out.uncorrectablesGlobal = out.uncorrectables;

    return out;
  }

  function evaluateTx(v) {
    if (v == null) return { estado: 'nodata', color: 'muted', valor: '—', texto: 'Sin dato' };
    if (v >= 35 && v <= 49) return { estado: 'ok', color: 'verde', valor: v, texto: 'OK' };
    if (v >= 50 && v <= 52) return { estado: 'limite', color: 'amarillo', valor: v, texto: 'Límite' };
    return { estado: 'critico', color: 'rojo', valor: v, texto: 'Crítico' };
  }

  function evaluateRx(v) {
    if (v == null) return { estado: 'nodata', color: 'muted', valor: '—', texto: 'Sin dato' };
    if (v >= -7 && v <= 7) return { estado: 'ok', color: 'verde', valor: v, texto: 'OK' };
    if ((v >= -10 && v < -7) || (v > 7 && v <= 10)) return { estado: 'limite', color: 'amarillo', valor: v, texto: 'Límite' };
    return { estado: 'critico', color: 'rojo', valor: v, texto: 'Crítico' };
  }

  function evaluateSnrUp(v) {
    if (v == null) return { estado: 'nodata', color: 'muted', valor: '—', texto: 'Sin dato' };
    if (v > 30) return { estado: 'ok', color: 'verde', valor: v, texto: 'OK' };
    if (v >= 25 && v <= 30) return { estado: 'limite', color: 'amarillo', valor: v, texto: 'Límite' };
    return { estado: 'critico', color: 'rojo', valor: v, texto: 'Crítico' };
  }

  function evaluateSnrDown(v) {
    if (v == null) return { estado: 'nodata', color: 'muted', valor: '—', texto: 'Sin dato' };
    if (v > 32) return { estado: 'ok', color: 'verde', valor: v, texto: 'OK' };
    if (v >= 30 && v <= 32) return { estado: 'limite', color: 'amarillo', valor: v, texto: 'Límite' };
    return { estado: 'critico', color: 'rojo', valor: v, texto: 'Crítico' };
  }

  function evaluateMasivo(uncorr, modems) {
    var u = uncorr != null ? uncorr : 0;
    var m = modems != null ? modems : 0;
    if (u > 100000 && m > 50) return { estado: 'masivo', color: 'azul', texto: 'Afectación masiva', uncorr: u, modems: m };
    return { estado: 'individual', color: 'verde', texto: 'Individual', uncorr: u, modems: m };
  }

  function evaluateIntermitencia(flaps) {
    if (flaps == null) return { estado: 'nodata', color: 'muted', valor: '—', texto: 'Sin dato' };
    if (flaps > 50) return { estado: 'intermitente', color: 'naranja', valor: flaps, texto: 'Intermitencia detectada' };
    return { estado: 'ok', color: 'verde', valor: flaps, texto: 'Estable' };
  }

  function getGlobalEstado(diag) {
    var critico = false, limite = false, masivo = false, intermitente = false;
    [diag.tx, diag.rx, diag.snrUp, diag.snrDown].forEach(function (r) {
      if (r && r.estado === 'critico') critico = true;
      if (r && r.estado === 'limite') limite = true;
    });
    if (diag.masivo && diag.masivo.estado === 'masivo') masivo = true;
    if (diag.intermitencia && diag.intermitencia.estado === 'intermitente') intermitente = true;
    if (critico) return { color: 'rojo', texto: 'Crítico' };
    if (masivo) return { color: 'azul', texto: 'Masivo' };
    if (intermitente) return { color: 'naranja', texto: 'Intermitente' };
    if (limite) return { color: 'amarillo', texto: 'En límite' };
    return { color: 'verde', texto: 'OK' };
  }

  function buildEvidencia(diag) {
    var ev = [];
    if (diag.tx && diag.tx.valor != null) ev.push({ metrica: 'TX Up', valor: diag.tx.valor, unidad: 'dBmV', umbral: '35-49 ok, 50-52 límite', estado: diag.tx.estado });
    if (diag.rx && diag.rx.valor != null) ev.push({ metrica: 'RX Down', valor: diag.rx.valor, unidad: 'dBmV', umbral: '-7 a +7 ok', estado: diag.rx.estado });
    if (diag.snrUp && diag.snrUp.valor != null) ev.push({ metrica: 'SNR Up', valor: diag.snrUp.valor, unidad: 'dB', umbral: '>30 ok, 25-30 límite', estado: diag.snrUp.estado });
    if (diag.snrDown && diag.snrDown.valor != null) ev.push({ metrica: 'SNR Down', valor: diag.snrDown.valor, unidad: 'dB', umbral: '>32 ok, 30-32 límite', estado: diag.snrDown.estado });
    if (diag.masivo) ev.push({ metrica: 'Uncorrectables', valor: diag.masivo.uncorr, unidad: '', umbral: '>100k + >50 modems = masivo', estado: diag.masivo.estado });
    if (diag.masivo) ev.push({ metrica: 'Modems canal', valor: diag.masivo.modems, unidad: '', umbral: '>50 con uncorr altos = masivo', estado: diag.masivo.estado });
    if (diag.intermitencia && diag.intermitencia.valor != null) ev.push({ metrica: 'Flaps', valor: diag.intermitencia.valor, unidad: '', umbral: '>50 intermitente', estado: diag.intermitencia.estado });
    return ev;
  }

  var SEVERIDAD = { MASS_IMPAIRMENT: 5, CRITICAL_FISICO: 4, DEGRADED: 3, WARNING: 2, HEALTHY: 1 };

  function calcSeveridad(diag, esMasivo) {
    if (esMasivo) return 'MASS_IMPAIRMENT';
    var critico = [diag.tx, diag.rx, diag.snrUp, diag.snrDown].some(function (m) { return m && m.estado === 'critico'; });
    if (critico) return 'CRITICAL_FISICO';
    var limite = [diag.tx, diag.rx, diag.snrUp, diag.snrDown].some(function (m) { return m && m.estado === 'limite'; });
    if (limite || (diag.intermitencia && diag.intermitencia.estado === 'intermitente')) return 'DEGRADED';
    var warning = [diag.tx, diag.rx, diag.snrUp, diag.snrDown].some(function (m) { return m && m.estado !== 'ok' && m.estado !== 'nodata'; });
    if (warning) return 'WARNING';
    return 'HEALTHY';
  }

  function calcConfianzaNivel(diag, esMasivo) {
    var metricsConDato = 0;
    [diag.tx, diag.rx, diag.snrUp, diag.snrDown].forEach(function (m) {
      if (m && m.estado !== 'nodata') metricsConDato++;
    });
    var tieneMasivo = diag.masivo && (diag.masivo.uncorr != null) && (diag.masivo.modems != null);
    var coincideMasivo = esMasivo && tieneMasivo && diag.masivo.uncorr > 100000 && diag.masivo.modems > 50;
    if (esMasivo && coincideMasivo) return 'Alta';
    if (metricsConDato >= 3 && tieneMasivo) return 'Alta';
    if (metricsConDato >= 2 || tieneMasivo) return 'Media';
    return 'Baja';
  }

  function getRecommendations(diag, cmtsType) {
    var esMasivo = diag.masivo && diag.masivo.estado === 'masivo';
    var evidencia = buildEvidencia(diag);
    var severidad = calcSeveridad(diag, esMasivo);
    var confianzaNivel = calcConfianzaNivel(diag, esMasivo);
    var resultado = {
      esMasivo: esMasivo,
      diagnosticoExplicito: esMasivo ? 'ES AFECTACIÓN MASIVA' : 'NO es afectación masiva',
      severidad: severidad,
      confianza: confianzaNivel,
      hallazgos: evidencia,
      visitabloqueada: esMasivo,
      mensajeBloqueo: esMasivo ? 'Acciones individuales bloqueadas hasta descartar problema compartido.' : null,
      accionOperativa: [],
      recs: []
    };

    /* PRIORIDAD DOMINANTE 1: ¿Es masivo? → Solo acciones infraestructura. Cero individuales. */
    if (esMasivo) {
      var u = diag.masivo.uncorr || 0, m = diag.masivo.modems || 0;
      resultado.accionOperativa = [
        '1. Revisar health de la portadora upstream en CMTS.',
        '2. Migrar modems a otra portadora del nodo si hay redundancia.',
        '3. Cambiar/redistribuir portadora si está saturada.',
        '4. Revisar niveles RF del nodo (forward/reverse).',
        '5. Si persiste: fibra (OTDR) y transceiver CMTS.'
      ];
      resultado.recs.push({
        accion: 'Afectación masiva confirmada',
        condicion: 'Uncorrectables (' + u + ') > 100.000 Y Modems en canal (' + m + ') > 50.',
        conclusion: 'Problema en canal upstream. Origen: infraestructura compartida, NO cliente individual.'
      });
      return resultado;
    }

    /* PRIORIDAD 2: NO es masivo. Evaluar físico individual. Permitir visita. */
    var pasosParaVisita = null;
    if (diag.tx && diag.tx.estado === 'critico') {
      if (diag.tx.valor < 35) {
        resultado.recs.push({ accion: 'TX bajo', condicion: 'TX (' + diag.tx.valor + ' dBmV) < 35', conclusion: 'Origen probable: drop o CPE.', prioridad: 'alta', sugiereVisita: true });
        if (!pasosParaVisita) pasosParaVisita = ['1. Medir acometida.', '2. Si OK: cambiar modem.', '3. Si persiste: cambiar acometida.'];
      } else {
        resultado.recs.push({ accion: 'TX alto', condicion: 'TX (' + diag.tx.valor + ' dBmV) > 52', conclusion: 'Sobrenivel individual.', prioridad: 'alta', sugiereVisita: true });
        if (!pasosParaVisita) pasosParaVisita = ['1. Agregar pad.', '2. Ajustar tap.', '3. Cambiar acometida si aplica.'];
      }
    }
    if (diag.rx && diag.rx.estado === 'critico') {
      resultado.recs.push({ accion: 'RX fuera de rango', condicion: 'RX (' + diag.rx.valor + ' dBmV) fuera de -7 a +7', conclusion: 'Niveles anómalos.', prioridad: 'alta', sugiereVisita: true });
      if (!pasosParaVisita) pasosParaVisita = ['1. Ajustar tap.', '2. Si nodo desbalanceado: reportar planta.', '3. Cambiar acometida si localizado.'];
    }
    if (diag.snrUp && diag.snrUp.estado === 'critico') {
      resultado.recs.push({ accion: 'SNR Up crítico', condicion: 'SNR Up (' + diag.snrUp.valor + ' dB) < 25', conclusion: 'Ruido en upstream.', prioridad: 'alta', sugiereVisita: true });
      if (!pasosParaVisita) pasosParaVisita = ['1. Individual: acometida o modem.', '2. Si varios en canal: revisar portadora CMTS.', '3. Migrar a otra US si aplica.'];
    }
    if (diag.snrDown && diag.snrDown.estado === 'critico') {
      resultado.recs.push({ accion: 'SNR Down crítico', condicion: 'SNR Down (' + diag.snrDown.valor + ' dB) < 30', conclusion: 'Downstream degradado.', prioridad: 'alta', sugiereVisita: true });
      if (!pasosParaVisita) pasosParaVisita = ['1. Revisar MER nodo.', '2. Cambiar acometida si localizado.', '3. Reportar planta si feeder.'];
    }
    if (diag.intermitencia && diag.intermitencia.estado === 'intermitente') {
      resultado.recs.push({ accion: 'Intermitencia', condicion: 'Flaps (' + diag.intermitencia.valor + ') > 50', conclusion: 'Lock inestable.', prioridad: 'media', sugiereVisita: true });
      if (!pasosParaVisita) pasosParaVisita = ['1. Cambiar modem.', '2. Si persiste: cambiar acometida.', '3. Revisar canal si varios con flaps.'];
    }
    if (diag.tx && diag.tx.estado === 'limite') {
      resultado.recs.push({ accion: 'TX en límite', condicion: 'TX (' + diag.tx.valor + ' dBmV) en 50-52', conclusion: 'Monitorear. No sugerir visita aún.', prioridad: 'baja', sugiereVisita: false });
      if (!pasosParaVisita) pasosParaVisita = ['1. Monitorear evolución.', '2. Revisión en sitio si degrada.'];
    }
    if (resultado.recs.length === 0) {
      resultado.recs.push({ accion: 'Parámetros en rango', condicion: 'Sin condiciones críticas', conclusion: 'Continuar monitoreo.', prioridad: 'baja', sugiereVisita: false });
    }
    resultado.accionOperativa = pasosParaVisita || [];

    resultado.sugerirVisita = resultado.recs.some(function (r) { return r.sugiereVisita === true; });
    return resultado;
  }

  function analyze(modemOutput, upstreamOutput) {
    var combined = [modemOutput, upstreamOutput].filter(Boolean).join('\n');
    var cmtsType = detectCmtsType(combined);
    var metrics = extractMetrics(modemOutput, upstreamOutput);

    var diag = {
      cmtsType: cmtsType,
      node: metrics.node || metrics.interfaceId || '—',
      totalModems: metrics.totalModems,
      tx: evaluateTx(metrics.tx),
      rx: evaluateRx(metrics.rx),
      snrUp: evaluateSnrUp(metrics.snrUp),
      snrDown: evaluateSnrDown(metrics.snrDown),
      masivo: evaluateMasivo(metrics.uncorrectablesGlobal, metrics.totalModems),
      intermitencia: evaluateIntermitencia(metrics.flaps),
      estabilidad: {
        flaps: metrics.flaps,
        crc: metrics.crc,
        uncorrectables: metrics.uncorrectables,
        rangingRetries: metrics.rangingRetries,
        uptime: metrics.uptime
      },
      masivoPanel: {
        utilization: metrics.utilization,
        totalModems: metrics.totalModems,
        uncorrectablesGlobal: metrics.uncorrectablesGlobal
      },
      raw: metrics
    };

    diag.globalEstado = getGlobalEstado(diag);
    diag.protocolo = getRecommendations(diag, cmtsType);
    return diag;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { analyze: analyze, CMTS_TYPES: CMTS_TYPES };
  } else {
    global.NocAnalyzerQoE = { analyze: analyze, CMTS_TYPES: CMTS_TYPES };
  }
})(typeof window !== 'undefined' ? window : this);
