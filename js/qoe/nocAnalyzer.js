/**
 * nocAnalyzer.js - Analizador Inteligente DOCSIS Multiplataforma NOC ISP Tier 1
 * Detecta: ARRIS E600, vCMTS, CASA
 * Motor de reglas NOC con semáforos (verde/amarillo/naranja/rojo/azul masivo)
 */
(function (global) {
  'use strict';

  var CMTS_TYPES = { ARISTA: 'Arista', HARMONIC: 'Harmonic', CISCO: 'Cisco', ARRIS: 'Arris', CASA: 'CASA Systems', vCMTS: 'vCMTS', DESCONOCIDO: 'Desconocido' };

  function detectCmtsType(raw) {
    if (!raw || typeof raw !== 'string') return CMTS_TYPES.DESCONOCIDO;
    var t = raw.toUpperCase();
    if (/ARISTA|ARISTA\s*EOS|CCAP\s*ARISTA/i.test(t)) return CMTS_TYPES.ARISTA;
    if (/HARMONIC|CABLEOS|NEXUS/i.test(t)) return CMTS_TYPES.HARMONIC;
    if (/CISCO|CBR|UBR|IOS\s*XE|show\s+cable\s+modem\s+detailed/i.test(t)) return CMTS_TYPES.CISCO;
    if (/ARRIS|ARRIE6|CISCO\s*E600|E6000|CBR-8|CHORUS|BOGO-[A-Z]+-H-\d+-ARRIE6|CS100G/i.test(t)) return CMTS_TYPES.ARRIS;
    if (/vCMTS|VCMTS|CISCO\s*RPHY|R-PHY|CCAP/i.test(t)) return CMTS_TYPES.vCMTS;
    if (/CASA|C4|C10|SYSTEM\s*3200|CMTS\s*CASA|show\s+cable\s+flap-list/i.test(t)) return CMTS_TYPES.CASA;
    if (/BOGO-[A-Z]+-H-\d+-CS100G|show\s+interface\s+upstream/i.test(t)) return CMTS_TYPES.ARRIS;
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

    /* TX Upstream (Peak Transmit Power, Rec Power, USPwr) */
    var m = combined.match(/(?:Peak\s+)?(?:Transmit|Tx)\s*Power\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|Peak\s+Power\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)/i);
    if (m) out.tx = parseNum(m[1] || m[2]);
    if (out.tx == null) {
      m = combined.match(/Rec\s+Power\s*=\s*([\d.,\-]+)\s*dBmV/i);
      if (m) out.tx = parseNum(m[1]);
    }
    if (out.tx == null) {
      m = combined.match(/USPwr\s*\(dBmV\)[\s\S]*?(\d+\/\d+\/\d+[-]\d+\/\d+\/\d+)[\s\-]+([\d.,\-]+)\s+([\d.,\-]+)/i);
      if (m) out.tx = parseNum(m[2]);
    }
    if (out.tx == null) {
      m = combined.match(/----- CMTS Measurements -----[\s\S]*?(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+([\d.,\-]+)\s+([\d.,\-]+)/i);
      if (m) out.tx = parseNum(m[2]);
    }

    /* RX Downstream (DSPwr) - potencia recibida por el modem */
    m = combined.match(/(?:Receive|Rx|Downstream)\s*(?:Power|Signal)\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|Power\s+Level\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|(?:Downstream\s+)?(?:Receive|Rx)\s*Power\s*:?\s*([\d.,\-]+)/i);
    if (!m) m = combined.match(/(?:RX|Down)\s*(?:Power)?\s*:?\s*([\d.,\-]+)/i);
    if (!m) m = combined.match(/(?:DS\s*Power|DSPwr|Downstream\s*Receive)[\s:]+([\d.,\-]+)/i);
    if (!m) m = combined.match(/(?:Receive\s+)?Power\s*:?\s*([\d.,\-]+)\s*dBmV/i);
    if (m) out.rx = parseNum(m[1] || m[2] || m[3]);
    if (out.rx == null) {
      m = combined.match(/DSPwr\s*\(dBmV\)[\s\S]*?(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+([\d.,\-]+)/i);
      if (m) { var dspwr = parseNum(m[2]); if (dspwr != null && !isNaN(dspwr) && String(m[2]) !== '-') out.rx = dspwr; }
    }
    if (out.rx == null) {
      m = combined.match(/(\d+\/\d+\/\d+-\d+\/\d+\/\d+)\s+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+([\d.,\-]+)/);
      if (m) { var dspwr = parseNum(m[2]); if (dspwr != null && !isNaN(dspwr) && String(m[2]) !== '-') out.rx = dspwr; }
    }

    m = combined.match(/(?:Upstream\s+)?SNR[\s:]+([\d.,\-]+)|Signal[\s\/]Noise[\s:]+([\d.,\-]+)|SNR\s*\(dB\)[\s:]+([\d.,\-]+)/i);
    if (m) out.snrUp = parseNum(m[1] || m[2] || m[3]);
    if (out.snrUp == null) {
      m = combined.match(/USSNR\s*\(dB\)[\s\S]*?(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+([\d.,\-]+)\s+([\d.,\-]+)/i);
      if (m) out.snrUp = parseNum(m[2]);
    }
    if (out.snrUp == null) {
      m = combined.match(/----- CMTS Measurements -----[\s\S]*?(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+[\d.,\-]+\s+([\d.,\-]+)/i);
      if (m) out.snrUp = parseNum(m[2]);
    }

    /* SNR Downstream (DSSNR) - relación señal/ruido en bajada */
    m = combined.match(/SNR\s*(?:Down|Downstream)?[\s:]+([\d.,\-]+)|Downstream\s+SNR[\s:]+([\d.,\-]+)/i);
    if (!m) m = combined.match(/(?:Rx|Down)\s*SNR[\s:]+([\d.,\-]+)/i);
    if (!m) m = combined.match(/(?:DS\s*SNR|DSSNR|Downstream\s*SNR|RxMER)[\s:]+([\d.,\-]+)/i);
    if (m) out.snrDown = parseNum(m[1] || m[2]);
    if (out.snrDown == null) {
      m = combined.match(/DSSNR\s*\(dB\)[\s\S]*?(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+([\d.,\-]+)/i);
      if (m) { var dssnr = parseNum(m[2]); if (dssnr != null && !isNaN(dssnr) && String(m[2]) !== '-') out.snrDown = dssnr; }
    }
    if (out.snrDown == null) {
      m = combined.match(/(\d+[\/\-]\d+[\/\-]\d+[\/\-]\d+[\/\-]\d+[\/\-]\d+)\s+[\d.,\-]+\s+[\d.,\-]+[\s\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+[\d.,\-]+\s+([\d.,\-]+)/);
      if (m) { var dssnr = parseNum(m[2]); if (dssnr != null && !isNaN(dssnr) && String(m[2]) !== '-') out.snrDown = dssnr; }
    }

    /* Flaps */
    m = combined.match(/Flaps?[\s:]+([\d\s,]+)|(?:US|DS)\s*Flaps?[\s:]+([\d\s,]+)/i);
    if (m) out.flaps = parseIntSafe(m[1] || m[2]);
    /* CASA: show cable flap-list - columna Flap (antes de Time YYYY-MM-DD,HH:MM:SS) */
    if (out.flaps == null) {
      m = combined.match(/(?:show\s+cable\s+flap|flap-list)[\s\S]*?[a-fA-F0-9\.\-:]{12,17}[^\n]*\s+(\d+)\s+\d{4}-\d{2}-\d{2},\d{2}:\d{2}:\d{2}/im);
      if (m) out.flaps = parseIntSafe(m[1]);
    }
    /* Cisco: show cable modem [MAC] flap o flap-list (columna Flap antes de HH:MM:SS) */
    if (out.flaps == null) {
      m = combined.match(/(?:show\s+cable\s+modem.*flap|flap-list)[\s\S]*?[a-fA-F0-9]{4}\.[a-fA-F0-9]{4}\.[a-fA-F0-9]{4}[^\n]*\s+(\d+)\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/im);
      if (!m) m = combined.match(/(?:show\s+cable\s+modem.*flap|flap-list)[\s\S]*?[a-fA-F0-9:]{12,17}[^\n]*\s+(\d+)\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/im);
      if (m) out.flaps = parseIntSafe(m[1]);
    }

    /* CRC / Uncorrectables */
    m = combined.match(/([\d\s,]+)\s+Uncorrectables?|Uncorrectables?[\s:]+([\d\s,]+)/i);
    if (m) out.uncorrectables = parseIntSafe(m[1] || m[2]);
    if (out.uncorrectables == null) {
      m = combined.match(/([\d\s,]+)\s+Uncorrectable\s+codewords/i);
      if (m) out.uncorrectables = parseIntSafe(m[1]);
    }
    if (out.uncorrectables == null) {
      m = combined.match(/CRC\s+HCS[\s\S]*?(\d+)\s+(\d+)\s+[a-fA-F0-9\.\-]+/i);
      if (m) { var crc = parseIntSafe(m[1]), hcs = parseIntSafe(m[2]); out.uncorrectables = (crc != null ? crc : 0) + (hcs != null ? hcs : 0); }
    }

    /* Ranging retries */
    m = combined.match(/Ranging\s+Retries?[\s:]+([\d\s,]+)|RangingRetries?[\s:]+([\d\s,]+)|Rng\.?\s*Retries?[\s:]+([\d\s,]+)/i);
    if (m) out.rangingRetries = parseIntSafe(m[1] || m[2] || m[3]);
    /* CASA: show cable flap-list - columna RngRetry (número antes de Flap, antes de YYYY-MM-DD,HH:MM:SS) */
    if (out.rangingRetries == null) {
      m = combined.match(/(?:show\s+cable\s+flap|flap-list)[\s\S]*?[a-fA-F0-9\.\-:]{12,17}[^\n]*\s+(\d+)\s+\d+\s+\d{4}-\d{2}-\d{2},\d{2}:\d{2}:\d{2}/im);
      if (m) out.rangingRetries = parseIntSafe(m[1]);
    }
    /* Cisco: flap-list - columna Ins como fallback */
    if (out.rangingRetries == null) {
      m = combined.match(/(?:show\s+cable\s+flap|flap-list)[\s\S]*?[a-fA-F0-9]{4}\.[a-fA-F0-9]{4}\.[a-fA-F0-9]{4}\s+\S+\s+(\d+)\s+/i);
      if (!m) m = combined.match(/(?:show\s+cable\s+flap|flap-list)[\s\S]*?[a-fA-F0-9:]{12,17}\s+\S+\s+(\d+)\s+/i);
      if (m) out.rangingRetries = parseIntSafe(m[1]);
    }

    /* Uptime */
    m = combined.match(/Uptime[\s:]+([\d\w\s:\.\-]+?)(?:\n|IPv4|$)/i);
    if (m) out.uptime = m[1].trim();
    if (!out.uptime) {
      m = combined.match(/Uptime\s*=\s*([\d\w\s:\.\-]+?)(?:\s+IPv4|\n|$)/i);
      if (m) out.uptime = m[1].trim();
    }
    /* CASA: Total Time Online (show cable modem verbose) */
    if (!out.uptime) {
      m = combined.match(/Total\s+Time\s+Online\s*:?\s*([\d\s:\.dhm\-]+?)(?=\s*\n|$)/i);
      if (m) out.uptime = m[1].trim();
    }
    if (!out.uptime) {
      m = combined.match(/Total\s+Time\s+Online[\s:]+([\d\w\s:\.\-]+?)(?:\n|$)/i);
      if (m) out.uptime = m[1].trim();
    }
    if (!out.uptime) {
      m = combined.match(/(?:Time\s+Online|Online\s+Time|Up\s*Time)\s*:?\s*([\d\s:\.dhm\-]+?)(?=\s*\n|$)/i);
      if (m) out.uptime = m[1].trim();
    }
    /* Cisco: show cable modem [MAC] uptime */
    if (!out.uptime) {
      m = combined.match(/(?:show\s+cable\s+modem.*uptime|Uptime)[\s\S]*?([\d]+\s+days?\s+[\d:]+|[\d]+\s+[\d:]+)/i);
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
    if (!out.interfaceId) {
      m = combined.match(/cable-upstream\s+([\d\/\-]+)/i);
      if (m) out.interfaceId = (m[1] || '').trim();
    }
    if (!out.interfaceId) {
      m = combined.match(/(\d+\/\d+\/\d+-\d+\/\d+\/\d+)/);
      if (m) out.interfaceId = m[1];
    }
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

  function evaluateMasivo(uncorr, modems, snrUp) {
    var u = uncorr != null ? uncorr : 0;
    var m = modems != null ? modems : 0;
    var snr = snrUp != null ? snrUp : 999;
    if (m > 5 && u > 1000000) return { estado: 'masivo', color: 'azul', texto: 'Afectación masiva', uncorr: u, modems: m };
    if (m > 5 && snr < 30 && u > 100000) return { estado: 'masivo', color: 'azul', texto: 'Afectación masiva', uncorr: u, modems: m };
    if (u > 100000 && m > 50) return { estado: 'masivo', color: 'azul', texto: 'Afectación masiva', uncorr: u, modems: m };
    return { estado: 'individual', color: 'verde', texto: 'Individual', uncorr: u, modems: m };
  }

  function evaluateIntermitencia(flaps) {
    if (flaps == null) return { estado: 'nodata', color: 'muted', valor: 'N/A', texto: 'N/A' };
    if (flaps > 50) return { estado: 'intermitente', color: 'naranja', valor: flaps, texto: 'Intermitencia detectada' };
    return { estado: 'ok', color: 'verde', valor: flaps, texto: 'Estable' };
  }

  function evaluateUptime(uptime) {
    if (uptime == null || (typeof uptime === 'string' && !uptime.trim())) return { valor: 'N/A', texto: 'N/A' };
    return { valor: uptime, texto: uptime };
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
    if (masivo) return { color: 'azul', texto: 'Afectación masiva' };
    if (intermitente) return { color: 'naranja', texto: 'Intermitente' };
    if (limite) return { color: 'amarillo', texto: 'En límite' };
    return { color: 'verde', texto: 'OK' };
  }

  function buildEvidencia(diag) {
    var ev = [];
    if (diag.tx && diag.tx.valor != null) ev.push({ metrica: 'TX Up', valor: diag.tx.valor, unidad: 'dBmV', umbral: '35-49 ok, 50-52 límite', estado: diag.tx.estado });
    if (diag.rx && diag.rx.valor != null) ev.push({ metrica: 'RX Down', valor: diag.rx.valor, unidad: 'dBmV', umbral: '-7 a +7 ok', estado: diag.rx.estado });
    if (diag.snrUp && diag.snrUp.valor != null) ev.push({ metrica: 'SNR Up', valor: diag.snrUp.valor, unidad: 'dB', umbral: '>30 ok, 25-30 límite', estado: diag.snrUp.estado });
    if (diag.snrDown && diag.snrDown.valor != null) ev.push({ metrica: 'SNR Down', valor: diag.snrDown.valor, unidad: 'dB', umbral: '<30 dB causa pixelado/lentitud', estado: diag.snrDown.estado });
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

    /* PRIORIDAD DOMINANTE 1: ¿Es masivo? → Escalar NOC. Bloquear visita individual. */
    if (esMasivo) {
      var u = diag.masivo.uncorr || 0, m = diag.masivo.modems || 0;
      resultado.diagnosticoExplicito = 'ES AFECTACIÓN MASIVA - Escalar a Planta Exterior';
      resultado.mensajeBloqueo = 'Escalar a Planta Exterior - Problema de Nodo. Acciones individuales bloqueadas.';
      resultado.accionOperativa = [
        '1. Escalar a Planta Exterior - Problema de Nodo.',
        '2. Revisar health de la portadora upstream en CMTS.',
        '3. Migrar modems a otra portadora del nodo si hay redundancia.',
        '4. Revisar niveles RF del nodo (forward/reverse).',
        '5. Si persiste: fibra (OTDR) y transceiver CMTS.'
      ];
      resultado.recs.push({
        accion: 'Afectación masiva confirmada',
        condicion: '>5 modems en canal Y (Uncorrectables > 1M o SNR<30 con Uncorrectables >100k)',
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
      var uncorr = (diag.masivoPanel && diag.masivoPanel.uncorrectablesGlobal != null) ? diag.masivoPanel.uncorrectablesGlobal : (diag.raw && diag.raw.uncorrectables);
      var uncorrNum = uncorr != null ? uncorr : 0;
      var sugiereVisitaSnr = uncorrNum > 100000;
      if (sugiereVisitaSnr) {
        resultado.recs.push({ accion: 'SNR Up crítico', condicion: 'SNR Up (' + diag.snrUp.valor + ' dB) < 25 Y Uncorrectables (' + uncorrNum + ') > 100k', conclusion: 'Ruido en upstream. Enviar visita.', prioridad: 'alta', sugiereVisita: true });
        if (!pasosParaVisita) pasosParaVisita = ['1. Individual: acometida o modem.', '2. Si varios en canal: revisar portadora CMTS.', '3. Migrar a otra US si aplica.'];
      } else {
        resultado.recs.push({ accion: 'SNR Up crítico', condicion: 'SNR Up (' + diag.snrUp.valor + ' dB) < 25 pero errores actuales bajos (' + uncorrNum + ')', conclusion: 'Monitoreo - No enviar visita aún.', prioridad: 'media', sugiereVisita: false });
        if (!pasosParaVisita) pasosParaVisita = ['1. Monitorear evolución.', '2. Enviar visita solo si Uncorrectables superan 100k.'];
      }
    }
    if (diag.snrDown && diag.snrDown.estado === 'critico') {
      resultado.recs.push({ accion: 'SNR Down crítico', condicion: 'SNR Down (' + diag.snrDown.valor + ' dB) < 30', conclusion: 'Downstream degradado.', prioridad: 'alta', sugiereVisita: true });
      if (!pasosParaVisita) pasosParaVisita = ['1. Revisar MER nodo.', '2. Cambiar acometida si localizado.', '3. Reportar planta si feeder.'];
    }
    if (diag.intermitencia && diag.intermitencia.estado === 'intermitente' && diag.intermitencia.valor !== 'N/A') {
      resultado.recs.push({ accion: 'Intermitencia', condicion: 'Flaps (' + diag.intermitencia.valor + ') > 50', conclusion: 'Lock inestable.', prioridad: 'media', sugiereVisita: true });
      if (!pasosParaVisita) pasosParaVisita = ['1. Cambiar modem.', '2. Si persiste: cambiar acometida.', '3. Revisar canal si varios con flaps.'];
    }
    if (diag.tx && diag.tx.estado === 'limite') {
      resultado.recs.push({ accion: 'TX en límite', condicion: 'TX (' + diag.tx.valor + ' dBmV) en 50-52', conclusion: 'Monitorear. No sugerir visita aún.', prioridad: 'baja', sugiereVisita: false });
      if (!pasosParaVisita) pasosParaVisita = ['1. Monitorear evolución.', '2. Revisión en sitio si degrada.'];
    }
    var uncorr = (diag.masivoPanel && diag.masivoPanel.uncorrectablesGlobal != null) ? diag.masivoPanel.uncorrectablesGlobal : (diag.raw && diag.raw.uncorrectables);
    if (uncorr != null && uncorr > 0) {
      resultado.recs.push({ accion: 'Alerta', condicion: 'Uncorrectables > 0 (' + uncorr + ')', conclusion: 'Indica pérdida de datos real que el CMTS no pudo reparar.', prioridad: 'alerta', sugiereVisita: false });
    }
    if (resultado.recs.length === 0) {
      resultado.recs.push({ accion: 'Parámetros en rango', condicion: 'Sin condiciones críticas', conclusion: 'Continuar monitoreo.', prioridad: 'baja', sugiereVisita: false });
    }
    resultado.accionOperativa = pasosParaVisita || [];

    resultado.sugerirVisita = resultado.recs.some(function (r) { return r.sugiereVisita === true; });

    /* Verificación Individual: matriz, hallazgos ciudadano, recomendación */
    resultado.validacionIndividual = buildIndividualValidation(diag, resultado);
    return resultado;
  }

  function buildIndividualValidation(diag, protocolo) {
    var modems = diag.totalModems != null ? diag.totalModems : (diag.masivo && diag.masivo.modems);
    var util = (diag.masivoPanel && diag.masivoPanel.utilization != null) ? diag.masivoPanel.utilization : null;
    var snrUp = diag.snrUp && diag.snrUp.valor != null ? diag.snrUp.valor : null;
    var uncorr = (diag.masivoPanel && diag.masivoPanel.uncorrectablesGlobal != null) ? diag.masivoPanel.uncorrectablesGlobal : (diag.raw && diag.raw.uncorrectables);
    var modemsAffected = 1;

    var matriz = [];
    matriz.push({ criterio: 'Módems Afectados', valorActual: modemsAffected + (modems != null ? ' (solo este de ' + modems + ')' : ''), umbralMasivo: '> 5 módems', estado: modemsAffected <= 5 ? 'Normal' : 'Masivo', semaforo: modemsAffected <= 5 ? 'verde' : 'rojo' });
    matriz.push({ criterio: 'Saturación de Canal', valorActual: util != null ? util + '%' : '—', umbralMasivo: '> 80%', estado: (util == null || util <= 80) ? 'Normal' : 'Saturado', semaforo: (util == null || util <= 80) ? 'verde' : 'rojo' });
    matriz.push({ criterio: 'SNR del Nodo', valorActual: snrUp != null ? snrUp + ' dB' : '—', umbralMasivo: '< 25 dB crítico', estado: snrUp == null ? '—' : (snrUp >= 30 ? 'Óptimo' : (snrUp >= 25 ? 'Estable' : 'Crítico')), semaforo: snrUp == null ? 'muted' : (snrUp >= 30 ? 'verde' : (snrUp >= 25 ? 'amarillo' : 'rojo')) });
    var errLabel = uncorr == null ? '—' : (uncorr > 1000000 ? 'Masivos' : (uncorr > 100000 ? 'Elevados' : (uncorr > 0 ? 'Bajos' : 'Cero')));
    matriz.push({ criterio: 'Errores en el Puerto', valorActual: uncorr != null ? (uncorr >= 1000 ? (uncorr / 1000).toFixed(0) + 'k' : uncorr) : '—', umbralMasivo: 'Masivos (>1M)', estado: uncorr == null ? '—' : (uncorr > 1000000 ? 'Masivo' : 'Normal'), semaforo: uncorr == null ? 'muted' : (uncorr > 1000000 ? 'rojo' : (uncorr > 100000 ? 'amarillo' : 'verde')) });

    var hallazgos = [];
    var tx = diag.tx && diag.tx.valor;
    if (tx != null) {
      var txFrase = tx >= 35 && tx <= 49 ? 'Excelente. El equipo se comunica con la central sin esfuerzo.' : (tx >= 50 && tx <= 52 ? 'Aceptable. En el límite superior.' : (tx < 35 ? 'Bajo. Posible drop o mala conexión.' : 'Alto. Sobrenivel, revisar atenuación.'));
      hallazgos.push({ metrica: 'Potencia de Subida (TX)', valor: tx + ' dBmV', semaforo: diag.tx.estado === 'ok' ? 'verde' : (diag.tx.estado === 'limite' ? 'amarillo' : 'rojo'), frase: txFrase });
    }
    if (snrUp != null) {
      var snrFrase = snrUp > 30 ? 'Excelente. Señal limpia.' : (snrUp >= 25 ? 'Aceptable. Hay un poco de ruido de fondo, pero no lo suficiente para afectar a los vecinos.' : 'Crítico. Ruido alto que degrada la subida.');
      hallazgos.push({ metrica: 'Ruido en la zona (SNR)', valor: snrUp + ' dB', semaforo: diag.snrUp.estado === 'ok' ? 'verde' : (diag.snrUp.estado === 'limite' ? 'amarillo' : 'rojo'), frase: snrFrase });
    }
    if (uncorr != null) {
      var uncorrK = uncorr >= 1000 ? (uncorr / 1000).toFixed(0) + 'k' : uncorr;
      var uncorrFrase = uncorr === 0 ? 'Cero. Sin pérdida de datos.' : (uncorr < 100000 ? 'Elevados. Pérdida de datos. Revisar cableado.' : 'Crítico. Este módem está perdiendo mucha información. Al ser el único en el canal con este nivel, el daño está en su cableado interno o conector, no en la calle.');
      hallazgos.push({ metrica: 'Pérdida de datos (Uncorrectables)', valor: uncorrK, semaforo: uncorr === 0 ? 'verde' : (uncorr < 100000 ? 'amarillo' : 'rojo'), frase: uncorrFrase });
    }
    var flaps = diag.estabilidad && diag.estabilidad.flaps;
    if (flaps != null && flaps !== 'N/A') {
      var flapsNum = typeof flaps === 'number' ? flaps : parseInt(flaps, 10);
      var flapsFrase = (flapsNum == null || isNaN(flapsNum) || flapsNum <= 50) ? 'Estable. Conexión estable.' : 'Inestable. El equipo se ha desconectado varias veces. Es un problema de conexión física local.';
      hallazgos.push({ metrica: 'Reintentos (Flaps)', valor: flaps, semaforo: (flapsNum != null && !isNaN(flapsNum) && flapsNum > 50) ? 'rojo' : 'verde', frase: flapsFrase });
    }
    var rx = diag.rx && diag.rx.valor;
    if (rx != null) {
      var rxFrase = (rx >= -7 && rx <= 7) ? 'Óptimo. Niveles correctos.' : ((rx >= -10 && rx < -7) || (rx > 7 && rx <= 10)) ? 'Límite. Revisar.' : 'Fuera de rango.';
      hallazgos.push({ metrica: 'Señal de bajada (RX)', valor: rx + ' dBmV', semaforo: diag.rx.estado === 'ok' ? 'verde' : (diag.rx.estado === 'limite' ? 'amarillo' : 'rojo'), frase: rxFrase });
    }

    var resumen = 'Validación superada: ';
    if (modems != null) {
      resumen += 'Solo 1 de los ' + modems + ' módems en este canal presenta ';
    } else {
      resumen += 'Este módem presenta ';
    }
    var hayCriticos = (diag.tx && diag.tx.estado === 'critico') || (diag.rx && diag.rx.estado === 'critico') || (diag.snrUp && diag.snrUp.estado === 'critico') || (diag.intermitencia && diag.intermitencia.estado === 'intermitente');
    resumen += hayCriticos ? 'errores críticos. Esto confirma un problema de hardware o cableado dentro del domicilio.' : 'métricas en rango. Continuar monitoreo.';

    var recomendacion = '';
    if (protocolo.sugerirVisita) {
      recomendacion = 'Dado que los niveles de la calle (Nodo) están bien, pero este equipo específico tiene muchos errores de datos, el problema es LOCAL. Procede a agendar visita técnica para revisión de acometida, splitters o cambio de equipo.';
    } else if (hallazgos.length > 0 && (diag.tx && diag.tx.estado === 'limite') || (diag.snrUp && diag.snrUp.estado === 'limite')) {
      recomendacion = 'Métricas en zona límite. Monitorear evolución. Programar visita solo si el cliente reporta quejas persistentes.';
    } else {
      recomendacion = 'Estado normal. Los niveles del nodo y del módem están en rango. Continuar monitoreo.';
    }

    return {
      matriz: matriz,
      hallazgos: hallazgos,
      conclusion: 'El problema se limita exclusivamente a este cable módem. El resto del nodo y los vecinos operan con normalidad. No se cumplen los criterios para declarar una falla de red.',
      resumen: resumen,
      recomendacion: recomendacion
    };
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
      masivo: evaluateMasivo(metrics.uncorrectablesGlobal, metrics.totalModems, metrics.snrUp),
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
