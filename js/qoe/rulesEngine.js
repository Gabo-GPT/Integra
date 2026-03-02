/**
 * rulesEngine.js - Motor de reglas DOCSIS
 * Usa niveles internos: OPTIMO | LIMITE | CRITICO
 * Clasificación: SATURACION | INTERMITENTE | RF_CLIENTE | MONITORIZAR | OK
 */
(function (global) {
  'use strict';

  var LEVELS = { OPTIMO: 1, LIMITE: 2, CRITICO: 3 };

  function getConfig() {
    if (typeof ConfigQoE !== 'undefined' && ConfigQoE.getConfig) {
      return ConfigQoE.getConfig();
    }
    return {};
  }

  function getLevelTxPower(val, cfg) {
    if (val == null || !cfg || !cfg.TX_UPSTREAM) return null;
    var tx = cfg.TX_UPSTREAM;
    var opt = tx.OPTIMO, lim = tx.LIMITE, crit = tx.CRITICO;
    if (val < crit.min || val > crit.max) return 'CRITICO';
    if (opt && val >= opt.min && val <= opt.max) return 'OPTIMO';
    if (lim && val >= lim.min && val <= lim.max) return 'LIMITE';
    return 'OPTIMO';
  }

  function getLevelSnrUp(val, cfg) {
    if (val == null || !cfg || !cfg.SNR_UPSTREAM) return null;
    var snr = cfg.SNR_UPSTREAM;
    var opt = snr.OPTIMO, lim = snr.LIMITE, crit = snr.CRITICO;
    if (crit.max != null && val <= crit.max) return 'CRITICO';
    if (opt && opt.min != null && val >= opt.min) return 'OPTIMO';
    if (lim && val >= lim.min && val <= lim.max) return 'LIMITE';
    return 'CRITICO';
  }

  function addMetric(used, name, value, threshold, role, level) {
    used.push({ name: name, value: value, threshold: threshold, role: role, level: level || null });
  }

  function emptyResult(classification, confidence, reasons, warnings) {
    return {
      classification: classification,
      confidence: confidence,
      reasons: reasons || [],
      suggestedAction: '',
      usedMetrics: [],
      warnings: warnings || []
    };
  }

  /**
   * Calcula Probabilidad de Visita Técnica (0-100) con scoring ponderado.
   * Fórmula: baseScore = Σ(points(criterio) * weight) / Σ(weight) ; final = clamp(baseScore + modifiers, 0, 100)
   */
  function calculateVisitProbability(parsed, classification, cfg) {
    var vc = (cfg && cfg.VISIT_PROBABILITY) || {};
    var w = vc.weights || {};
    var modem = parsed && parsed.modem;

    function clamp(val, lo, hi) {
      if (val == null || isNaN(val)) return 0;
      return Math.max(lo, Math.min(hi, val));
    }

    function pointsSnr(snr) {
      if (snr == null) return null;
      var s = vc.snrUpstream || {};
      if (s.high && s.high.max != null && snr < s.high.max) return s.high.points || 100;
      if (s.medium && snr >= s.medium.min && snr <= s.medium.max) return s.medium.points || 60;
      if (s.low && s.low.min != null && snr >= s.low.min) return s.low.points || 0;
      if (snr > 28 && snr < 30) return 30;
      return 60;
    }

    function pointsTx(pwr) {
      if (pwr == null) return null;
      var t = vc.txUpstream || {};
      var critMin = t.high && t.high.outsideMin != null ? t.high.outsideMin : 35;
      var critMax = t.high && t.high.outsideMax != null ? t.high.outsideMax : 52;
      if (pwr < critMin || pwr > critMax) return (t.high && t.high.points) || 100;
      if (t.medium && pwr >= t.medium.min && pwr <= t.medium.max) return t.medium.points || 50;
      if (t.low && pwr >= t.low.min && pwr <= t.low.max) return t.low.points || 0;
      return 0;
    }

    function pointsFec(corr, uncorr) {
      var f = vc.fecErrors || {};
      if (f.high && f.high.uncorrectablesMin != null && uncorr != null && uncorr >= f.high.uncorrectablesMin)
        return f.high.points || 100;
      if (f.medium && f.medium.correctablesMin != null && corr != null && corr >= f.medium.correctablesMin)
        return f.medium.points || 50;
      return f.low && f.low.points != null ? f.low.points : 0;
    }

    var snr = modem && modem.snr;
    var pwr = modem && modem.peakTransmitPower;
    var corr = modem && modem.correctables;
    var uncorr = modem && modem.uncorrectables;

    var snrPts = pointsSnr(snr);
    var txPts = pointsTx(pwr);
    var fecPts = pointsFec(corr, uncorr);

    var sumWeight = 0;
    var sumProd = 0;
    if (snrPts != null) {
      sumWeight += w.snrUpstream || 0.30;
      sumProd += snrPts * (w.snrUpstream || 0.30);
    }
    if (txPts != null) {
      sumWeight += w.txUpstream || 0.25;
      sumProd += txPts * (w.txUpstream || 0.25);
    }
    if (fecPts != null) {
      sumWeight += w.fecErrors || 0.25;
      sumProd += fecPts * (w.fecErrors || 0.25);
    }
    var codigoPts = null, memPts = null;
    if (modem && modem.codigoError != null) {
      var codCfg = vc.codigo || {};
      codigoPts = codCfg.high && modem.codigoError >= (codCfg.high.minCode || 1) ? (codCfg.high.points || 80) : 0;
      if (codigoPts != null) {
        sumWeight += w.codigo || 0.05;
        sumProd += codigoPts * (w.codigo || 0.05);
      }
    }
    if (modem && modem.memoriaRamPct != null) {
      var memCfg = vc.memoriaRam || {};
      var mPct = modem.memoriaRamPct;
      memPts = (memCfg.high && memCfg.high.minPct != null && mPct >= memCfg.high.minPct) ? (memCfg.high.points || 100)
        : (memCfg.medium && memCfg.medium.minPct != null && mPct >= memCfg.medium.minPct) ? (memCfg.medium.points || 50) : 0;
      sumWeight += w.memoriaRam || 0.05;
      sumProd += memPts * (w.memoriaRam || 0.05);
    }

    var baseScore = sumWeight > 0 ? (sumProd / sumWeight) : 0;

    var mod = vc.modifiers || {};
    var modifier = 0;
    if (classification === 'SATURACION') {
      modifier -= mod.saturacionReduction != null ? mod.saturacionReduction : 35;
    }
    var greyZone = snr != null && snr >= 25 && snr <= 28;
    var highErrors = (uncorr != null && uncorr >= 10) || (corr != null && corr >= 100);
    var lowErrors = (uncorr == null || uncorr < 5) && (corr == null || corr < 50);
    if (greyZone && highErrors) modifier += mod.greyZoneHighErrors != null ? mod.greyZoneHighErrors : 25;
    if (greyZone && lowErrors) modifier -= Math.abs(mod.greyZoneLowErrors != null ? mod.greyZoneLowErrors : 20);

    var score = clamp(Math.round(baseScore + modifier), 0, 100);

    var rec = vc.recommendation || {};
    var noMax = rec.noVisita && rec.noVisita.max != null ? rec.noVisita.max : 40;
    var monMin = rec.monitorizar && rec.monitorizar.min != null ? rec.monitorizar.min : 40;
    var monMax = rec.monitorizar && rec.monitorizar.max != null ? rec.monitorizar.max : 70;
    var visMin = rec.recomendarVisita && rec.recomendarVisita.min != null ? rec.recomendarVisita.min : 70;

    var visitRecommendation;
    if (score < noMax) visitRecommendation = 'No visita';
    else if (score >= monMin && score <= monMax) visitRecommendation = 'Monitorizar';
    else if (score >= visMin) visitRecommendation = 'Recomendar visita';
    else visitRecommendation = 'Monitorizar';

    return {
      visitProbability: score,
      visitRecommendation: visitRecommendation
    };
  }

  function checkSaturacion(parsed, cfg) {
    var modem = parsed.modem;
    var upstream = parsed.upstream;
    var s = cfg.SATURACION || {};
    var utilMin = s.utilizationMin;
    var modemsMin = s.modemsMin;
    var snrMin = s.snrMinToExcludeRf;
    var pMin = s.powerMin;
    var pMax = s.powerMax;

    if (utilMin == null || snrMin == null) return null;

    var util = upstream && upstream.avgChannelUtilization;
    var modems = upstream && upstream.totalModemsOnChannel;
    var snr = modem && modem.snr;
    var power = modem && modem.peakTransmitPower;
    var snrLevel = snr != null ? getLevelSnrUp(snr, cfg) : null;
    var powerLevel = power != null ? getLevelTxPower(power, cfg) : null;

    if (util == null || util < utilMin) return null;
    if (modemsMin != null && modems != null && modems < modemsMin) return null;
    if (snrLevel === 'CRITICO') return null;
    if (powerLevel === 'CRITICO') return null;
    if (snr != null && snr < snrMin) return null;
    if (power != null && (power < pMin || power > pMax)) return null;

    var used = [];
    addMetric(used, 'avgChannelUtilization', util, '>=' + utilMin + '%', 'indicó saturación', null);
    if (modems != null) addMetric(used, 'totalModemsOnChannel', modems, '>=' + (modemsMin || 0), 'carga canal', null);
    if (snr != null) addMetric(used, 'snr', snr, '>=' + snrMin + ' dB', 'RF OK', snrLevel);
    if (power != null) addMetric(used, 'peakTransmitPower', power, pMin + '-' + pMax + ' dBmV', 'rango ok', powerLevel);

    var conf = 0.85;
    if (modems == null && modemsMin != null) conf = 0.7;

    return {
      classification: 'SATURACION',
      confidence: conf,
      reasons: ['Utilización alta (' + util + '%). SNR y potencia en rango. Capacidad del canal.'],
      suggestedAction: 'Revisar carga upstream. Balanceo o ampliación de capacidad.',
      usedMetrics: used,
      warnings: modems == null ? ['Sin totalModemsOnChannel.'] : []
    };
  }

  function checkRfCliente(parsed, cfg) {
    var modem = parsed.modem;
    if (!modem) return null;

    var snr = modem.snr;
    var power = modem.peakTransmitPower;
    var corr = modem.correctables;
    var uncorr = modem.uncorrectables;

    var snrLevel = snr != null ? getLevelSnrUp(snr, cfg) : null;
    var powerLevel = power != null ? getLevelTxPower(power, cfg) : null;

    var r = cfg.RF_CLIENTE || {};
    var i = cfg.INTERMITENTE || {};
    var corrMin = i.correctablesMin != null ? i.correctablesMin : 50;
    var uncorrMin = i.uncorrectablesMin != null ? i.uncorrectablesMin : 5;
    var hasHighErrors = (corr != null && corr > corrMin) || (uncorr != null && uncorr > uncorrMin);

    var hitSnrCritico = snrLevel === 'CRITICO';
    var hitPowerCritico = powerLevel === 'CRITICO';

    if (snrLevel === 'LIMITE' && !hitPowerCritico && !hasHighErrors) return null;

    if (!hitSnrCritico && !hitPowerCritico) return null;

    var used = [];
    var reasons = [];

    if (hitSnrCritico) {
      addMetric(used, 'snr', snr, 'CRITICO (<25 dB)', 'subida inestable, pérdida paquetes', 'CRITICO');
      reasons.push('SNR crítico (' + snr + ' dB). Problema RF en tramo cliente.');
    }
    if (hitPowerCritico) {
      addMetric(used, 'peakTransmitPower', power, 'CRITICO (<35 o >52 dBmV)', 'cortes, lentitud subida', 'CRITICO');
      reasons.push('Potencia TX crítica (' + power + ' dBmV). Revisar atenuación.');
    }

    return {
      classification: 'RF_CLIENTE',
      confidence: hitSnrCritico && hitPowerCritico ? 0.9 : 0.75,
      reasons: reasons,
      suggestedAction: 'Revisar instalación RF: atenuación, conectores, splitter.',
      usedMetrics: used,
      warnings: []
    };
  }

  function checkIntermittente(parsed, cfg) {
    var modem = parsed.modem;
    var i = cfg.INTERMITENTE || {};
    var corrMin = i.correctablesMin != null ? i.correctablesMin : 50;
    var uncorrMin = i.uncorrectablesMin != null ? i.uncorrectablesMin : 5;
    var snrLimMin = i.snrLimiteMin != null ? i.snrLimiteMin : 25;
    var snrLimMax = i.snrLimiteMax != null ? i.snrLimiteMax : 30;

    if (!modem) return null;

    var corr = modem.correctables;
    var uncorr = modem.uncorrectables;
    var snr = modem.snr;
    var snrLevel = snr != null ? getLevelSnrUp(snr, cfg) : null;

    var hasErrors = (corr != null && corr > corrMin) || (uncorr != null && uncorr > uncorrMin);
    if (!hasErrors) return null;

    if (snrLevel !== 'LIMITE' && snrLevel !== 'OPTIMO') return null;
    if (snr != null && (snr < snrLimMin || snr > snrLimMax + 2)) return null;

    var used = [];
    if (corr != null) addMetric(used, 'correctables', corr, '>' + corrMin, 'episodios corrección', null);
    if (uncorr != null) addMetric(used, 'uncorrectables', uncorr, '>' + uncorrMin, 'errores no corregibles', null);
    if (snr != null) addMetric(used, 'snr', snr, 'zona límite', 'ruido intermitente', snrLevel);

    return {
      classification: 'INTERMITENTE',
      confidence: 0.7,
      reasons: ['Errores FEC significativos. SNR en zona límite. Ruido intermitente o interferencia.'],
      suggestedAction: 'Monitorizar. Posible ruido vecindad. Si persiste, revisar RF.',
      usedMetrics: used,
      warnings: ['Sin histórico no se confirma tendencia.']
    };
  }

  function checkMonitorizar(parsed, cfg) {
    var modem = parsed.modem;
    var upstream = parsed.upstream;
    var utilCfg = cfg.UTILIZACION || {};

    var snr = modem && modem.snr;
    var power = modem && modem.peakTransmitPower;
    var util = upstream && upstream.avgChannelUtilization;

    var snrLevel = snr != null ? getLevelSnrUp(snr, cfg) : null;
    var powerLevel = power != null ? getLevelTxPower(power, cfg) : null;

    var anyLimite = snrLevel === 'LIMITE' || powerLevel === 'LIMITE';
    var anyCritico = snrLevel === 'CRITICO' || powerLevel === 'CRITICO';
    var utilAlta = util != null && utilCfg.OK_MAX != null && util >= utilCfg.OK_MAX;

    if (anyCritico) return null;
    if (!anyLimite && !utilAlta) return null;

    var used = [];
    var reasons = [];
    if (snrLevel === 'LIMITE') {
      addMetric(used, 'snr', snr, 'LIMITE 25-30 dB', 'zona gris', 'LIMITE');
      reasons.push('SNR en zona límite (' + snr + ' dB).');
    }
    if (powerLevel === 'LIMITE') {
      addMetric(used, 'peakTransmitPower', power, 'LIMITE 50-52 dBmV', 'zona gris', 'LIMITE');
      reasons.push('Potencia TX en límite (' + power + ' dBmV).');
    }
    if (utilAlta) {
      addMetric(used, 'avgChannelUtilization', util, '>=' + (utilCfg.OK_MAX || 75) + '%', 'utilización alta', null);
      reasons.push('Utilización del canal alta.');
    }

    return {
      classification: 'MONITORIZAR',
      confidence: 0.75,
      reasons: reasons,
      suggestedAction: 'Monitorizar. Métricas en zona límite. Sin errores altos aún.',
      usedMetrics: used,
      warnings: []
    };
  }

  function checkOk(parsed, cfg) {
    var modem = parsed.modem;
    var upstream = parsed.upstream;
    var utilCfg = cfg.UTILIZACION || {};

    var snr = modem && modem.snr;
    var power = modem && modem.peakTransmitPower;
    var uncorr = modem && modem.uncorrectables;
    var corr = modem && modem.correctables;
    var util = upstream && upstream.avgChannelUtilization;

    var snrLevel = snr != null ? getLevelSnrUp(snr, cfg) : null;
    var powerLevel = power != null ? getLevelTxPower(power, cfg) : null;

    var allOptimo = (snrLevel == null || snrLevel === 'OPTIMO') &&
      (powerLevel == null || powerLevel === 'OPTIMO');
    var utilOk = util == null || (utilCfg.OK_MAX != null && util < utilCfg.OK_MAX);
    var noErrors = (uncorr == null || uncorr <= 0) && (corr == null || corr <= 100);

    if (!allOptimo || !utilOk || !noErrors) return null;

    var used = [];
    var reasons = [];
    if (snr != null) addMetric(used, 'snr', snr, 'OPTIMO', 'SNR correcto', snrLevel);
    if (power != null) addMetric(used, 'peakTransmitPower', power, 'OPTIMO', 'potencia correcta', powerLevel);
    if (util != null) addMetric(used, 'avgChannelUtilization', util, '<' + (utilCfg.OK_MAX || 75) + '%', 'util ok', null);
    reasons.push('Métricas en rango óptimo.');

    return {
      classification: 'OK',
      confidence: 0.9,
      reasons: reasons,
      suggestedAction: 'Estado normal. Continuar monitoreo.',
      usedMetrics: used,
      warnings: []
    };
  }

  function evaluate(parsed, config) {
    var cfg = config || getConfig();
    var warnings = [];

    if (!parsed) {
      var r0 = emptyResult('OK', 0, ['Datos no proporcionados.'], ['ParserOutput vacío.']);
      r0.visitProbability = 0;
      r0.visitRecommendation = 'No visita';
      return r0;
    }
    if (parsed.modem == null && parsed.upstream == null) {
      var r1 = emptyResult('OK', 0, ['Sin datos modem ni upstream.'], ['Datos insuficientes.']);
      r1.visitProbability = 0;
      r1.visitRecommendation = 'No visita';
      return r1;
    }
    if (parsed.parseErrors && parsed.parseErrors.length) {
      for (var i = 0; i < parsed.parseErrors.length; i++) {
        if (!parsed.parseErrors[i].recoverable) {
          warnings.push('Error: ' + parsed.parseErrors[i].message);
        }
      }
    }

    var result = checkSaturacion(parsed, cfg);
    if (result) { result.warnings = result.warnings.concat(warnings); return mergeVisitProbability(result, parsed, cfg); }

    result = checkRfCliente(parsed, cfg);
    if (result) { result.warnings = result.warnings.concat(warnings); return mergeVisitProbability(result, parsed, cfg); }

    result = checkIntermittente(parsed, cfg);
    if (result) { result.warnings = result.warnings.concat(warnings); return mergeVisitProbability(result, parsed, cfg); }

    result = checkMonitorizar(parsed, cfg);
    if (result) { result.warnings = result.warnings.concat(warnings); return mergeVisitProbability(result, parsed, cfg); }

    result = checkOk(parsed, cfg);
    if (result) { result.warnings = warnings.slice(); return mergeVisitProbability(result, parsed, cfg); }

    return mergeVisitProbability({
      classification: 'OK',
      confidence: 0.5,
      reasons: ['Datos insuficientes o ambiguos.'],
      suggestedAction: 'Revisar datos. Monitorizar.',
      usedMetrics: [],
      warnings: warnings.length ? warnings : ['No se aplicó ninguna regla.']
    }, parsed, cfg);
  }

  function mergeVisitProbability(result, parsed, cfg) {
    var vp = calculateVisitProbability(parsed, result.classification, cfg);
    result.visitProbability = vp.visitProbability;
    result.visitRecommendation = vp.visitRecommendation;
    return result;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { evaluate: evaluate };
  } else {
    global.RulesEngineQoE = { evaluate: evaluate };
  }
})(typeof window !== 'undefined' ? window : this);
