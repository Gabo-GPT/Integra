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
      unerroreds: null, correctables: null, modemsOffline: null,
      interfaceId: '', node: '', powerLevel: null, mac: null
    };
    var macM = combined.match(/(?:MAC\s+Address|Hardware\s+Addr|mac)[\s:]+([a-fA-F0-9\.\-:]{12,17})/i);
    if (macM) out.mac = macM[1].trim();
    if (!out.mac) { macM = combined.match(/([a-fA-F0-9]{4}\.[a-fA-F0-9]{4}\.[a-fA-F0-9]{4})/); if (macM) out.mac = macM[1]; }
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
    /* Multi-canal DS: extraer potencias por canal para desbalance (delta) - tabla Arris/CASA */
    var rxChannels = [];
    var rxChanRe = /(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+([\d.,\-]+)\s+([\d.,\-]+)\s+([\d.,\-]+)\s+([\d.,\-]+)\s+([\d.,\-]+)/g;
    var rxChanM;
    while ((rxChanM = rxChanRe.exec(combined)) !== null) {
      var dspwr = parseNum(rxChanM[6]);
      if (dspwr != null && !isNaN(dspwr) && dspwr >= -25 && dspwr <= 25) rxChannels.push(dspwr);
    }
    if (rxChannels.length < 2) {
      rxChannels = [];
      rxChanRe = /(?:logical-channel|Logical.?channel|channel)\s*\d+[\s\S]*?([\d.,\-]+)\s*dBmV/gi;
      while ((rxChanM = rxChanRe.exec(combined)) !== null) {
        var v = parseNum(rxChanM[1]);
        if (v != null && !isNaN(v)) rxChannels.push(v);
      }
    }
    if (rxChannels.length >= 2) {
      var minR = Math.min.apply(null, rxChannels);
      var maxR = Math.max.apply(null, rxChannels);
      out.rxDeltaDownstream = Math.abs(maxR - minR);
      if (out.rx == null) out.rx = rxChannels[0];
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
    /* Modems offline (opcional, si el CMTS lo reporta) */
    m = combined.match(/(?:Modems?|CMs?)\s+(?:offline|Offline)[\s:]+(\d+)/i);
    if (m) out.modemsOffline = parseIntSafe(m[1]);

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

    /* FEC upstream: Unerrored, Corrected, Uncorrectable (total codewords para error ratio) */
    m = combined.match(/([\d\s,]+)\s+Unerroreds?,\s*([\d\s,]+)\s+Correcteds?,\s*([\d\s,]+)\s+Uncorrectables?/i);
    if (m) {
      out.unerroreds = parseIntSafe(m[1]);
      out.correctables = parseIntSafe(m[2]);
      out.uncorrectablesGlobal = parseIntSafe(m[3]);
    }
    if (out.uncorrectablesGlobal == null && out.uncorrectables != null) out.uncorrectablesGlobal = out.uncorrectables;

    /* power-level configurado en upstream (ej: power-level 14) - rango esperado RX ±3 dB */
    m = combined.match(/power-level\s+([\d.,\-]+)|power\s+level\s+([\d.,\-]+)/i);
    if (m) out.powerLevel = parseNum(m[1] || m[2]);

    return out;
  }

  function evaluateTx(v) {
    if (v == null) return { estado: 'nodata', color: 'muted', valor: '—', texto: 'Sin dato' };
    if (v >= 35 && v <= 49) return { estado: 'ok', color: 'verde', valor: v, texto: 'OK' };
    if (v >= 50 && v <= 52) return { estado: 'limite', color: 'amarillo', valor: v, texto: 'Límite' };
    if (v >= 30 && v < 35) return { estado: 'limite', color: 'amarillo', valor: v, texto: 'Advertencia leve (monitorear)' };
    return { estado: 'critico', color: 'rojo', valor: v, texto: 'Crítico' };
  }

  function evaluateRx(v, powerLevel, snrDown) {
    if (v == null) return { estado: 'nodata', color: 'muted', valor: '—', texto: 'Sin dato' };
    if (powerLevel != null && !isNaN(powerLevel)) {
      var delta = Math.abs(v - powerLevel);
      if (delta <= 3) return { estado: 'ok', color: 'verde', valor: v, texto: 'OK (dentro de power-level ±3 dB)' };
      if (delta <= 5) return { estado: 'limite', color: 'amarillo', valor: v, texto: 'Límite' };
      if (snrDown != null && snrDown < 30) return { estado: 'critico', color: 'rojo', valor: v, texto: 'Crítico (RX desviado + SNR degradado)' };
      return delta > 5 ? { estado: 'limite', color: 'amarillo', valor: v, texto: 'Desviado de power-level' } : { estado: 'ok', color: 'verde', valor: v, texto: 'OK' };
    }
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

  var ROLLING_WINDOW_MS = 30 * 60 * 1000;
  var UMBRAL_RATE_PER_MODEM = 50;
  var UMBRAL_ERROR_RATIO = 1e-6;
  var HYSTERESIS_CONSECUTIVOS = 2;
  var PESO_IMPACTO = 0.5;
  var PESO_ERRORES = 0.3;
  var PESO_RF = 0.2;

  function getRollingWindow(history, now) {
    if (!history || !history.length) return [];
    var cutoff = now - ROLLING_WINDOW_MS;
    return history.filter(function (p) { return p.ts >= cutoff; });
  }

  var ESTADO_COLOR_TEXTO = {
    masivo: { color: 'azul', texto: 'Masiva activa' },
    degradacion: { color: 'naranja', texto: 'Degradación compartida' },
    individual: { color: 'verde', texto: 'Estable' },
    evento_pasado: { color: 'amarillo', texto: 'Evento pasado (sin actividad)' }
  };

  function applyHysteresis(nuevoEstado, context) {
    var key = (context && context.hysteresisKey) || 'integra_noc_estado';
    var stored = null;
    try {
      var raw = typeof localStorage !== 'undefined' && localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw);
    } catch (e) {}
    var prev = (stored && stored.estado) || 'individual';
    var lastRead = (stored && stored.lastRead) || prev;
    if (nuevoEstado === prev) {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify({ estado: prev, lastRead: nuevoEstado, ts: Date.now() })); } catch (e) {}
      return null;
    }
    if (lastRead === nuevoEstado) {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify({ estado: nuevoEstado, lastRead: nuevoEstado, ts: Date.now() })); } catch (e) {}
      return null;
    }
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify({ estado: prev, lastRead: nuevoEstado, ts: Date.now() })); } catch (e) {}
    var ct = ESTADO_COLOR_TEXTO[prev] || { color: 'verde', texto: 'Estable' };
    return { estado: prev, color: ct.color, texto: ct.texto };
  }

  function evaluateMasivoConScoring(metrics, history, now, context) {
    var u = metrics.uncorrectablesGlobal != null ? metrics.uncorrectablesGlobal : metrics.uncorrectables;
    var m = metrics.totalModems != null ? metrics.totalModems : 1;
    var snrUp = metrics.snrUp != null ? metrics.snrUp : 999;
    var util = metrics.utilization != null ? metrics.utilization : 0;
    var flaps = metrics.flaps != null ? (typeof metrics.flaps === 'number' ? metrics.flaps : parseInt(metrics.flaps, 10)) : null;
    var unerr = metrics.unerroreds != null ? metrics.unerroreds : 0;
    var corr = metrics.correctables != null ? metrics.correctables : 0;
    var unc = u != null ? u : 0;
    now = now || Date.now();

    var totalCodewords = unerr + corr + unc;
    var errorRatio = totalCodewords > 0 ? unc / totalCodewords : 0;

    var windowed = getRollingWindow(history, now);
    var ratePerMin = 0;
    var ratePerModem = 0;
    var tendencia = 'estable';
    var impactoReal = 0;
    var modemsBajaron = false;

    if (windowed.length >= 1) {
      var last = windowed[windowed.length - 1];
      var deltaUnc = Math.max(0, (u || 0) - (last.uncorr || 0));
      var mins = (now - last.ts) / 60000;
      ratePerMin = mins > 0 ? deltaUnc / mins : 0;
      ratePerModem = (m > 0 && mins > 0) ? ratePerMin / m : ratePerMin;
      if (last.modems != null && m != null && last.modems > 0 && m < last.modems) {
        modemsBajaron = true;
        impactoReal = (last.modems - m) / last.modems;
      }
      if (metrics.modemsOffline != null && m > 0) {
        impactoReal = Math.max(impactoReal, (metrics.modemsOffline || 0) / m);
      }
      if (windowed.length >= 3) {
        var rates = [];
        for (var i = 1; i < windowed.length; i++) {
          var d = Math.max(0, (windowed[i].uncorr || 0) - (windowed[i - 1].uncorr || 0));
          var m2 = (windowed[i].ts - windowed[i - 1].ts) / 60000;
          rates.push(m2 > 0 ? d / m2 : 0);
        }
        var recentAvg = rates.length >= 2 ? (rates[rates.length - 1] + rates[rates.length - 2]) / 2 : rates[rates.length - 1];
        var olderAvg = rates.length >= 4 ? (rates[0] + rates[1]) / 2 : rates[0];
        tendencia = recentAvg < olderAvg * 0.7 ? 'bajando' : (recentAvg > olderAvg * 1.3 ? 'subiendo' : 'estable');
      }
    }

    if (ratePerMin < 1 && tendencia === 'bajando' && impactoReal < 0.05) {
      var hist = applyHysteresis('evento_pasado', context);
      var evt = { estado: 'evento_pasado', color: 'amarillo', texto: 'Evento pasado (sin actividad)', uncorr: u, modems: m, score: 0, clasificacion: 'evento_pasado', errorRatio: errorRatio, ratePerModem: ratePerModem, ratePerMin: ratePerMin, impactoReal: impactoReal };
      if (hist) return { estado: hist.estado, color: hist.color, texto: hist.texto, uncorr: u, modems: m, score: 0, clasificacion: hist.estado, errorRatio: errorRatio, ratePerModem: ratePerModem, ratePerMin: ratePerMin, impactoReal: impactoReal };
      return evt;
    }

    var scoreImpacto = Math.min(100, impactoReal * 200);
    if (modemsBajaron && impactoReal > 0.1) scoreImpacto = 60 + Math.min(40, impactoReal * 100);

    var scoreErrores = 0;
    if (ratePerModem > UMBRAL_RATE_PER_MODEM) scoreErrores = Math.min(100, ratePerModem / 2);
    if (errorRatio > UMBRAL_ERROR_RATIO) scoreErrores = Math.max(scoreErrores, Math.min(100, errorRatio * 1e7));
    scoreErrores = Math.min(100, scoreErrores + (ratePerMin > 500 ? 30 : ratePerMin > 100 ? 15 : 0));

    var scoreRf = 0;
    if (snrUp < 32) scoreRf = snrUp >= 25 ? 40 : 80;
    if (util >= 70) scoreRf = Math.min(100, scoreRf + 20);

    var score = (scoreImpacto * PESO_IMPACTO) + (scoreErrores * PESO_ERRORES) + (scoreRf * PESO_RF);
    score = Math.round(Math.min(100, score));

    var cumpleImpacto = impactoReal > 0.05 || modemsBajaron;
    var cumpleErrores = ratePerModem > UMBRAL_RATE_PER_MODEM || (ratePerMin > 200 && m > 5);
    var cumpleRf = snrUp < 32 && util >= 70;
    var cumpleObligatorias = cumpleImpacto && cumpleErrores && cumpleRf && (flaps != null && flaps > 10);

    var noCriticoPorContadores = errorRatio < 0.01 && ratePerMin < 1 && snrUp > 35 && !modemsBajaron && impactoReal < 0.05;

    var nuevoEstado, color, texto;
    if (noCriticoPorContadores) {
      nuevoEstado = 'individual'; color = 'verde'; texto = 'Estable';
    } else if (score > 70 && cumpleObligatorias) {
      nuevoEstado = 'masivo'; color = 'azul'; texto = 'Masiva activa';
    } else if (score >= 40 && (cumpleImpacto || cumpleErrores)) {
      nuevoEstado = 'degradacion'; color = 'naranja'; texto = 'Degradación compartida';
    } else {
      nuevoEstado = 'individual'; color = 'verde'; texto = 'Estable';
    }

    var hist = applyHysteresis(nuevoEstado, context);
    if (hist) {
      return { estado: hist.estado, color: hist.color, texto: hist.texto, uncorr: u, modems: m, score: score, clasificacion: hist.estado, errorRatio: errorRatio, ratePerModem: ratePerModem, ratePerMin: ratePerMin, impactoReal: impactoReal };
    }
    return { estado: nuevoEstado, color: color, texto: texto, uncorr: u, modems: m, score: score, clasificacion: nuevoEstado === 'masivo' ? 'masiva_activa' : (nuevoEstado === 'degradacion' ? 'degradacion_compartida' : 'estable'), errorRatio: errorRatio, ratePerModem: ratePerModem, ratePerMin: ratePerMin, impactoReal: impactoReal };
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
    var critico = false, limite = false, masivo = false, degradacion = false, eventoPasado = false, intermitente = false;
    [diag.tx, diag.rx, diag.snrUp, diag.snrDown].forEach(function (r) {
      if (r && r.estado === 'critico') critico = true;
      if (r && r.estado === 'limite') limite = true;
    });
    if (diag.masivo) {
      if (diag.masivo.estado === 'masivo') masivo = true;
      else if (diag.masivo.estado === 'evento_pasado') eventoPasado = true;
      else if (diag.masivo.estado === 'degradacion') degradacion = true;
    }
    if (diag.intermitencia && diag.intermitencia.estado === 'intermitente') intermitente = true;
    if (critico) return { color: 'rojo', texto: 'Crítico' };
    if (masivo) return { color: 'azul', texto: 'Afectación masiva' };
    if (degradacion) return { color: 'naranja', texto: 'Degradación compartida' };
    if (eventoPasado) return { color: 'amarillo', texto: 'Evento pasado' };
    if (intermitente) return { color: 'naranja', texto: 'Intermitente' };
    if (limite) return { color: 'amarillo', texto: 'En límite' };
    return { color: 'verde', texto: 'OK' };
  }

  function buildEvidencia(diag) {
    var ev = [];
    if (diag.tx && diag.tx.valor != null) ev.push({ metrica: 'TX Up', valor: diag.tx.valor, unidad: 'dBmV', umbral: '35-49 ok, 50-52 límite', estado: diag.tx.estado });
    if (diag.rx && diag.rx.valor != null) {
      var pl = diag.raw && diag.raw.powerLevel;
      ev.push({ metrica: 'RX Down', valor: diag.rx.valor, unidad: 'dBmV', umbral: pl != null ? 'power-level ' + pl + ' ±3 dB' : '-7 a +7 ok', estado: diag.rx.estado });
    }
    if (diag.snrUp && diag.snrUp.valor != null) ev.push({ metrica: 'SNR Up', valor: diag.snrUp.valor, unidad: 'dB', umbral: '>30 ok, 25-30 límite', estado: diag.snrUp.estado });
    if (diag.snrDown && diag.snrDown.valor != null) ev.push({ metrica: 'SNR Down', valor: diag.snrDown.valor, unidad: 'dB', umbral: '<30 dB causa pixelado/lentitud', estado: diag.snrDown.estado });
    if (diag.masivo) ev.push({ metrica: 'Errores/modem/min', valor: diag.masivo.ratePerModem != null ? diag.masivo.ratePerModem.toFixed(1) : '—', unidad: '', umbral: 'Normalizado por modem (ventana 30 min)', estado: diag.masivo.estado });
    if (diag.masivo) ev.push({ metrica: 'Error ratio', valor: diag.masivo.errorRatio != null ? (diag.masivo.errorRatio * 100).toFixed(4) + '%' : '—', unidad: '', umbral: 'uncorr / total codewords', estado: diag.masivo.estado });
    if (diag.masivo) ev.push({ metrica: 'Impacto real', valor: diag.masivo.impactoReal != null ? (diag.masivo.impactoReal * 100).toFixed(2) + '%' : '—', unidad: '', umbral: 'offline/total modems', estado: diag.masivo.estado });
    if (diag.masivo) ev.push({ metrica: 'Modems canal', valor: diag.masivo.modems, unidad: '', umbral: diag.masivo.score != null ? 'Score: ' + diag.masivo.score + ' (Impacto 50%, Errores 30%, RF 20%)' : '', estado: diag.masivo.estado });
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
    var esDegradacion = diag.masivo && diag.masivo.estado === 'degradacion';
    var esEventoPasado = diag.masivo && diag.masivo.estado === 'evento_pasado';
    var evidencia = buildEvidencia(diag);
    var severidad = calcSeveridad(diag, esMasivo);
    var confianzaNivel = calcConfianzaNivel(diag, esMasivo);
    var diagnosticoTexto = esMasivo ? 'ES AFECTACIÓN MASIVA' : (esDegradacion ? 'Degradación compartida (monitorear)' : (esEventoPasado ? 'Evento pasado (sin actividad actual)' : 'NO es afectación masiva'));
    var resultado = {
      esMasivo: esMasivo,
      esDegradacion: esDegradacion,
      esEventoPasado: esEventoPasado,
      diagnosticoExplicito: diagnosticoTexto,
      severidad: severidad,
      confianza: confianzaNivel,
      hallazgos: evidencia,
      visitabloqueada: esMasivo,
      mensajeBloqueo: esMasivo ? 'Acciones individuales bloqueadas hasta descartar problema compartido.' : null,
      accionOperativa: [],
      recs: []
    };

    /* Árbol de decisión: incorporar en todos los caminos */
    var tree = diag.decisionTree;
    if (tree && tree.estado !== 'OK' && tree.causa) {
      resultado.decisionTreeCausa = tree.causa;
      resultado.decisionTreeEscalar = tree.escalar;
      resultado.decisionTreeTipo = tree.tipoEscalamiento;
    }

    /* PRIORIDAD DOMINANTE 1: ¿Es masiva activa? → Escalar NOC. Bloquear visita individual. */
    if (esMasivo) {
      var u = diag.masivo.uncorr || 0, m = diag.masivo.modems || 0;
      resultado.diagnosticoExplicito = 'ES AFECTACIÓN MASIVA - Escalar a Planta Exterior';
      if (tree && tree.escalar) resultado.accionOperativa.unshift(tree.causa);
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
        condicion: 'Impacto real + errores/modemin + error ratio + SNR<32 + Util>70% (ventana 30 min, histéresis)',
        conclusion: 'Problema en canal upstream. Origen: infraestructura compartida, NO cliente individual.'
      });
      return resultado;
    }

    if (esEventoPasado) {
      resultado.accionOperativa = ['1. Monitorear. Tasa de errores actual = 0 y tendencia bajando.', '2. No escalar a Planta.'];
      if (tree && tree.escalar) resultado.accionOperativa.unshift(tree.causa);
      resultado.recs.push({ accion: 'Evento pasado', condicion: 'Errores/min = 0, tendencia bajando', conclusion: 'Sin actividad actual. No es masiva.' });
      return resultado;
    }

    if (esDegradacion) {
      resultado.accionOperativa = ['1. Monitorear canal.', '2. Revisar health portadora si persiste.', '3. Visitas individuales permitidas.'];
      if (tree && tree.escalar) resultado.accionOperativa.unshift(tree.causa);
      resultado.recs.push({ accion: 'Degradación compartida', condicion: 'Score 40-75: RF/Util/Estabilidad con señales', conclusion: 'Monitorear. No bloquear visitas individuales.' });
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
      var txVal = diag.tx.valor;
      var txLimiteCond = txVal >= 50 ? 'TX (' + txVal + ' dBmV) en 50-52 (límite superior)' : 'TX (' + txVal + ' dBmV) en 30-35 (advertencia leve)';
      resultado.recs.push({ accion: 'TX en límite', condicion: txLimiteCond, conclusion: 'Monitorear. No escalamiento ni visita.', prioridad: 'baja', sugiereVisita: false });
      if (!pasosParaVisita) pasosParaVisita = ['1. Monitorear evolución.', '2. Revisión en sitio solo si degrada.'];
    }
    var uncorr = (diag.masivoPanel && diag.masivoPanel.uncorrectablesGlobal != null) ? diag.masivoPanel.uncorrectablesGlobal : (diag.raw && diag.raw.uncorrectables);
    if (uncorr != null && uncorr > 0) {
      resultado.recs.push({ accion: 'Alerta', condicion: 'Uncorrectables > 0 (' + uncorr + ')', conclusion: 'Indica pérdida de datos real que el CMTS no pudo reparar.', prioridad: 'alerta', sugiereVisita: false });
    }
    if (resultado.recs.length === 0) {
      resultado.recs.push({ accion: 'Parámetros en rango', condicion: 'Sin condiciones críticas', conclusion: 'Continuar monitoreo.', prioridad: 'baja', sugiereVisita: false });
    }
    resultado.accionOperativa = pasosParaVisita || [];
    if (tree && tree.escalar) resultado.accionOperativa.unshift(tree.causa);

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
    var ratePerMin = (diag.masivoPanel && diag.masivoPanel.ratePerMin != null) ? diag.masivoPanel.ratePerMin : null;
    var errValActual = uncorr != null ? (uncorr >= 1000 ? (uncorr / 1000).toFixed(0) + 'k' : uncorr) : '—';
    var errActividad = ratePerMin != null ? ratePerMin.toFixed(0) + '/min' : '—';
    matriz.push({ criterio: 'Errores en el Puerto', valorActual: errValActual, valorActividad: errActividad, umbralMasivo: 'Actividad actual', estado: uncorr == null ? '—' : (ratePerMin != null && ratePerMin > 50 ? 'Actividad alta' : 'Normal'), semaforo: uncorr == null ? 'muted' : (ratePerMin != null && ratePerMin > 50 ? 'amarillo' : 'verde') });

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
      var errRatio = (diag.masivoPanel && diag.masivoPanel.errorRatio != null) ? diag.masivoPanel.errorRatio : null;
      var ratePerMinHall = (diag.masivoPanel && diag.masivoPanel.ratePerMin != null) ? diag.masivoPanel.ratePerMin : null;
      var snrDegradado = snrUp != null && snrUp < 30;
      var esMasivo = diag.masivo && diag.masivo.estado === 'masivo';
      var puedeAfirmarDanoInterno = !esMasivo && (errRatio != null && errRatio > 0.02) && (ratePerMinHall != null && ratePerMinHall > 50) && snrDegradado;
      var uncorrFrase = uncorr === 0 ? 'Cero. Sin pérdida de datos.' : (uncorr < 100000 ? 'Acumulado elevado. Revisar actividad actual (errores/min).' : (puedeAfirmarDanoInterno ? 'Crítico. Actividad actual alta + SNR degradado + T4. Origen probable en cableado interno o conector.' : 'Acumulado alto. Sin actividad actual significativa ni T3/T4. Monitorear evolución.'));
      hallazgos.push({ metrica: 'Pérdida de datos (Uncorrectables)', valor: uncorrK + (ratePerMinHall != null ? ' · ' + ratePerMinHall.toFixed(0) + '/min' : ''), semaforo: uncorr === 0 ? 'verde' : (ratePerMinHall != null && ratePerMinHall > 50 ? 'rojo' : (uncorr < 100000 ? 'amarillo' : 'amarillo')), frase: uncorrFrase });
    }
    var flaps = diag.estabilidad && diag.estabilidad.flaps;
    if (flaps != null && flaps !== 'N/A') {
      var flapsNum = typeof flaps === 'number' ? flaps : parseInt(flaps, 10);
      var flapsFrase = (flapsNum == null || isNaN(flapsNum) || flapsNum <= 50) ? 'Estable. Conexión estable.' : 'Inestable. El equipo se ha desconectado varias veces. Es un problema de conexión física local.';
      hallazgos.push({ metrica: 'Reintentos (Flaps)', valor: flaps, semaforo: (flapsNum != null && !isNaN(flapsNum) && flapsNum > 50) ? 'rojo' : 'verde', frase: flapsFrase });
    }
    var rx = diag.rx && diag.rx.valor;
    var powerLevelRx = (diag.raw && diag.raw.powerLevel != null) ? diag.raw.powerLevel : null;
    if (rx != null) {
      var rxFrase;
      if (powerLevelRx != null) {
        var deltaRx = Math.abs(rx - powerLevelRx);
        rxFrase = deltaRx <= 3 ? 'Óptimo. RX=' + rx + ' dentro de power-level ' + powerLevelRx + ' ±3 dB.' : (deltaRx <= 5 ? 'Límite. Desviado de power-level ' + powerLevelRx + '.' : 'Fuera de rango respecto a power-level ' + powerLevelRx + '.');
      } else {
        rxFrase = (rx >= -7 && rx <= 7) ? 'Óptimo. Niveles correctos.' : ((rx >= -10 && rx < -7) || (rx > 7 && rx <= 10)) ? 'Límite. Revisar.' : 'Fuera de rango.';
      }
      hallazgos.push({ metrica: 'Señal de bajada (RX)', valor: rx + ' dBmV' + (powerLevelRx != null ? ' (power-level ' + powerLevelRx + ')' : ''), semaforo: diag.rx.estado === 'ok' ? 'verde' : (diag.rx.estado === 'limite' ? 'amarillo' : 'rojo'), frase: rxFrase });
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

  function analyze(modemOutput, upstreamOutput, context) {
    var combined = [modemOutput, upstreamOutput].filter(Boolean).join('\n');
    var cmtsType = detectCmtsType(combined);
    var metrics = extractMetrics(modemOutput, upstreamOutput);
    var history = (context && context.history) ? context.history : [];
    var now = (context && context.now) ? context.now : Date.now();

    var masivoResult = evaluateMasivoConScoring(metrics, history, now, { hysteresisKey: 'integra_noc_estado_' + (metrics.node || metrics.interfaceId || 'default').replace(/\W/g, '_') });
    var diag = {
      cmtsType: cmtsType,
      node: metrics.node || metrics.interfaceId || '—',
      totalModems: metrics.totalModems,
      tx: evaluateTx(metrics.tx),
      rx: evaluateRx(metrics.rx, metrics.powerLevel, metrics.snrDown),
      snrUp: evaluateSnrUp(metrics.snrUp),
      snrDown: evaluateSnrDown(metrics.snrDown),
      masivo: masivoResult,
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
        uncorrectablesGlobal: metrics.uncorrectablesGlobal,
        unerroreds: metrics.unerroreds,
        correctables: metrics.correctables,
        errorRatio: (masivoResult && masivoResult.errorRatio != null) ? masivoResult.errorRatio : null,
        ratePerModem: (masivoResult && masivoResult.ratePerModem != null) ? masivoResult.ratePerModem : null,
        ratePerMin: (masivoResult && masivoResult.ratePerMin != null) ? masivoResult.ratePerMin : null,
        impactoReal: (masivoResult && masivoResult.impactoReal != null) ? masivoResult.impactoReal : null
      },
      raw: metrics
    };

    diag.globalEstado = getGlobalEstado(diag);

    /* Motor árbol de decisión: prioridad T4 > PHY > SNR > TX > delta DS > carga */
    var treeCtx = { history: history, now: now, masivoResult: masivoResult };
    diag.decisionTree = (typeof DecisionTreeQoE !== 'undefined' && DecisionTreeQoE.determinarDecisionFinal)
      ? DecisionTreeQoE.determinarDecisionFinal(metrics, treeCtx) : null;

    /* Score de Confianza: clasificación de origen (MODEM/PORTADORA/PLANTA/MONITOREO) */
    var confCtx = { history: history, now: now, masivoResult: masivoResult, combinedRaw: [modemOutput, upstreamOutput].filter(Boolean).join('\n'), modemRaw: modemOutput };
    diag.confidenceClassification = (typeof ConfidenceClassifierQoE !== 'undefined' && ConfidenceClassifierQoE.classifyFromNoc)
      ? ConfidenceClassifierQoE.classifyFromNoc(metrics, confCtx) : null;

    diag.protocolo = getRecommendations(diag, cmtsType);
    return diag;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { analyze: analyze, CMTS_TYPES: CMTS_TYPES };
  } else {
    global.NocAnalyzerQoE = { analyze: analyze, CMTS_TYPES: CMTS_TYPES };
  }
})(typeof window !== 'undefined' ? window : this);
