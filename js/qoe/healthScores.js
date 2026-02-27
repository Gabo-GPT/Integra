/**
 * healthScores.js - Cálculo de salud del Cable Modem y de la Portadora (0-100)
 * Usa config.js para umbrales. Sin valores hardcodeados.
 */
(function (global) {
  'use strict';

  function getConfig() {
    if (typeof ConfigQoE !== 'undefined' && ConfigQoE.getConfig) {
      return ConfigQoE.getConfig();
    }
    return {};
  }

  function clamp(val, lo, hi) {
    if (val == null || isNaN(val)) return null;
    return Math.max(lo || 0, Math.min(hi || 100, val));
  }

  /**
   * Calcula la salud del modem (0-100) y portadora (0-100) con score ponderado.
   * @param {Object} parsedData - ParserOutput con modem y upstream
   * @param {Object} diagnosisResult - Resultado de RulesEngine (opcional)
   * @returns {{ modemHealth, carrierHealth, modemHealthBreakdown, carrierHealthBreakdown }}
   */
  function calculateHealthScores(parsedData, diagnosisResult) {
    var cfg = getConfig();
    var hc = cfg.HEALTH_SCORES || {};
    var modem = parsedData && parsedData.modem;
    var upstream = parsedData && parsedData.upstream;

    var modemResult = calcModemHealth(modem, hc);
    var carrierResult = calcCarrierHealth(upstream, hc, modem);

    var modemHealth = modemResult && modemResult.score != null ? Math.round(clamp(modemResult.score, 0, 100)) : null;
    var carrierHealth = carrierResult && carrierResult.score != null ? Math.round(clamp(carrierResult.score, 0, 100)) : null;
    var carrierHealthMeta = carrierResult && carrierResult.meta ? carrierResult.meta : {};

    return {
      modemHealth: modemHealth,
      carrierHealth: carrierHealth,
      carrierHealthMeta: carrierHealthMeta,
      modemHealthBreakdown: modemResult && modemResult.breakdown ? modemResult.breakdown : [],
      carrierHealthBreakdown: carrierResult && carrierResult.breakdown ? carrierResult.breakdown : []
    };
  }

  function calcModemHealth(modem, hc) {
    if (!modem || !hc.modemWeights) return null;
    var w = hc.modemWeights;
    var snrCfg = hc.modemSnr || {};
    var txCfg = hc.modemTx || {};
    var fecCfg = hc.modemFec || {};
    var breakdown = [];

    var snrPts = null, txPts = null, fecPen = 0;
    var sumW = 0, sumP = 0;

    if (modem.snr != null && snrCfg.optimo) {
      var snr = modem.snr;
      if (snrCfg.optimo.min != null && snr >= snrCfg.optimo.min) {
        snrPts = snrCfg.optimo.points || 100;
      } else if (snrCfg.limite && snr >= snrCfg.limite.min && snr <= snrCfg.limite.max) {
        var t = (snr - snrCfg.limite.min) / (snrCfg.limite.max - snrCfg.limite.min);
        snrPts = (snrCfg.limite.pointsMin || 70) + t * ((snrCfg.limite.pointsMax || 90) - (snrCfg.limite.pointsMin || 70));
      } else if (snrCfg.critico && snrCfg.critico.max != null && snr <= snrCfg.critico.max) {
        snrPts = Math.min(snrCfg.critico.pointsMax || 50, snr * 2);
      } else {
        snrPts = 50;
      }
      var wSnr = w.snrUpstream || 0.4;
      sumW += wSnr;
      sumP += snrPts * wSnr;
    }

    if (modem.peakTransmitPower != null && txCfg.optimo) {
      var pwr = modem.peakTransmitPower;
      if (pwr >= txCfg.optimo.min && pwr <= txCfg.optimo.max) {
        txPts = txCfg.optimo.points || 100;
      } else if (txCfg.limite && pwr >= txCfg.limite.min && pwr <= txCfg.limite.max) {
        txPts = txCfg.limite.points || 80;
      } else {
        txPts = Math.min(txCfg.critico && txCfg.critico.pointsMax != null ? txCfg.critico.pointsMax : 60, 60);
      }
      var wTx = w.txUpstream || 0.35;
      sumW += wTx;
      sumP += txPts * wTx;
    }

    if (fecCfg.bajo) {
      var unc = modem.uncorrectables;
      var cor = modem.correctables;
      if (unc != null || cor != null) {
        var uncMax = fecCfg.bajo.uncorrectablesMax != null ? fecCfg.bajo.uncorrectablesMax : 5;
        var corMax = fecCfg.bajo.correctablesMax != null ? fecCfg.bajo.correctablesMax : 100;
        if ((unc == null || unc <= uncMax) && (cor == null || cor <= corMax)) {
          fecPen = fecCfg.bajo.penalizacion || 0;
        } else if (fecCfg.medio && (unc == null || unc <= (fecCfg.medio.uncorrectablesMax || 10)) && (cor == null || cor <= (fecCfg.medio.correctablesMax || 500))) {
          fecPen = fecCfg.medio.penalizacion || 15;
        } else {
          fecPen = fecCfg.alto && fecCfg.alto.penalizacion != null ? fecCfg.alto.penalizacion : 30;
        }
      }
    }

    if (sumW > 0) {
      if (snrPts != null) {
        var aporteSnr = (snrPts * (w.snrUpstream || 0.4)) / sumW;
        breakdown.push({
          metric: 'SNR Upstream',
          value: modem.snr,
          unit: 'dB',
          points: Math.round(snrPts),
          weight: w.snrUpstream || 0.4,
          aporte: Math.round(aporteSnr * 100) / 100,
          descripcion: 'SNR ' + modem.snr + ' dB → ' + Math.round(snrPts) + ' pts (peso ' + ((w.snrUpstream || 0.4) * 100) + '%)'
        });
      }
      if (txPts != null) {
        var aporteTx = (txPts * (w.txUpstream || 0.35)) / sumW;
        breakdown.push({
          metric: 'TX Upstream',
          value: modem.peakTransmitPower,
          unit: 'dBmV',
          points: Math.round(txPts),
          weight: w.txUpstream || 0.35,
          aporte: Math.round(aporteTx * 100) / 100,
          descripcion: 'TX ' + modem.peakTransmitPower + ' dBmV → ' + Math.round(txPts) + ' pts (peso ' + ((w.txUpstream || 0.35) * 100) + '%)'
        });
      }
      if (fecPen > 0) {
        breakdown.push({
          metric: 'Errores FEC',
          uncorrectables: modem.uncorrectables,
          correctables: modem.correctables,
          penalizacion: fecPen,
          aporte: -fecPen,
          descripcion: 'Errores altos → penalización -' + fecPen + ' pts'
        });
      }
    }

    if (sumW <= 0) return null;
    var base = sumP / sumW;
    var score = Math.max(0, base - fecPen);
    return { score: score, breakdown: breakdown };
  }

  /**
   * Salud Portadora: refleja disponibilidad real del canal.
   * - Si utilización > 80%: mostrar valor de utilización (cuello de botella).
   * - Si utilización <= 80%: basado en SNR (100% si > 30 dB).
   * - Severidad: Rojo >90%, Naranja 80-90%, Verde <80% y SNR>30.
   */
  function calcCarrierHealth(upstream, hc, modem) {
    var snrUp = (modem && modem.snr != null) ? modem.snr : (upstream && upstream.snrUp != null) ? upstream.snrUp : null;
    var util = (upstream && upstream.avgChannelUtilization != null) ? upstream.avgChannelUtilization : null;
    var utilNum = (util != null && !isNaN(util)) ? Math.min(100, Math.max(0, util)) : null;

    var displayValue, subtitle, severity, score;

    if (utilNum != null && utilNum > 80) {
      displayValue = Math.round(utilNum);
      subtitle = 'Portadora Saturada';
      severity = utilNum > 90 ? 'rojo' : 'naranja';
      score = displayValue;
    } else {
      var scoreBySnr = null;
      if (snrUp != null && !isNaN(snrUp)) {
        scoreBySnr = snrUp >= 32 ? 100 : Math.max(0, (snrUp / 32) * 100);
      }
      score = scoreBySnr;
      subtitle = 'Portadora Estable';
      severity = (snrUp != null && snrUp > 30) ? 'verde' : (scoreBySnr != null && scoreBySnr >= 60 ? 'amarillo' : 'amarillo');
    }

    if (score != null) {
      var breakdown = [];
      if (snrUp != null) {
        breakdown.push({
          metric: 'SNR Upstream',
          value: snrUp,
          unit: 'dB',
          descripcion: 'SNR ' + snrUp + ' dB'
        });
      }
      if (utilNum != null) {
        breakdown.push({
          metric: 'Utilización',
          value: utilNum,
          unit: '%',
          descripcion: 'Utilización ' + utilNum + '%' + (utilNum > 80 ? ' (saturada)' : '')
        });
      }
      return {
        score: score,
        breakdown: breakdown,
        meta: { utilization: utilNum, subtitle: subtitle, severity: severity }
      };
    }

    if (!upstream || !hc.carrierWeights) return null;
    var w = hc.carrierWeights;
    var utilCfg = hc.carrierUtilization || {};
    var modCfg = hc.carrierModems || {};
    var contCfg = hc.carrierContention || {};
    var breakdown = [];

    var utilPts = null, modPts = null, contPts = null;
    var sumW = 0, sumP = 0;

    if (upstream.avgChannelUtilization != null && utilCfg.optimo) {
      var util2 = upstream.avgChannelUtilization;
      if (util2 < (utilCfg.optimo.max || 65)) {
        utilPts = utilCfg.optimo.pointsMin != null ? utilCfg.optimo.pointsMin : 92;
      } else if (utilCfg.medio && util2 >= utilCfg.medio.min && util2 <= utilCfg.medio.max) {
        var t2 = (util2 - utilCfg.medio.min) / (utilCfg.medio.max - utilCfg.medio.min);
        utilPts = (utilCfg.medio.pointsMax || 85) - t2 * ((utilCfg.medio.pointsMax || 85) - (utilCfg.medio.pointsMin || 70));
      } else if (utilCfg.critico && util2 >= (utilCfg.critico.min || 80)) {
        utilPts = Math.min(utilCfg.critico.pointsMax || 60, 60);
      } else {
        utilPts = 70;
      }
      var wUtil = w.utilization || 0.5;
      sumW += wUtil;
      sumP += utilPts * wUtil;
    }

    if (upstream.totalModemsOnChannel != null && modCfg.optimo) {
      var mods = upstream.totalModemsOnChannel;
      if (mods <= (modCfg.optimo.max || 20)) {
        modPts = modCfg.optimo.points || 100;
      } else if (modCfg.medio && mods >= modCfg.medio.min && mods <= modCfg.medio.max) {
        var t3 = (mods - modCfg.medio.min) / (modCfg.medio.max - modCfg.medio.min);
        modPts = (modCfg.medio.pointsMax || 95) - t3 * ((modCfg.medio.pointsMax || 95) - (modCfg.medio.pointsMin || 80));
      } else if (modCfg.critico) {
        modPts = Math.min(modCfg.critico.pointsMax || 70, 70);
      } else {
        modPts = 85;
      }
      var wMod = w.totalModems || 0.25;
      sumW += wMod;
      sumP += modPts * wMod;
    }

    if (upstream.avgPercentContentionSlots != null && contCfg.optimo) {
      var cont = upstream.avgPercentContentionSlots;
      if (cont <= (contCfg.optimo.max || 50)) {
        contPts = contCfg.optimo.points || 100;
      } else if (contCfg.medio && cont >= contCfg.medio.min && cont <= contCfg.medio.max) {
        var t4 = (cont - contCfg.medio.min) / (contCfg.medio.max - contCfg.medio.min);
        contPts = (contCfg.medio.pointsMax || 90) - t4 * ((contCfg.medio.pointsMax || 90) - (contCfg.medio.pointsMin || 70));
      } else if (contCfg.critico) {
        contPts = Math.min(contCfg.critico.pointsMax || 50, 50);
      } else {
        contPts = 70;
      }
      var wCont = w.contentionSlots || 0.25;
      sumW += wCont;
      sumP += contPts * wCont;
    }

    if (sumW > 0) {
      if (utilPts != null) {
        var aporteUtil = (utilPts * (w.utilization || 0.5)) / sumW;
        breakdown.push({
          metric: 'Avg Channel Utilization',
          value: upstream.avgChannelUtilization,
          unit: '%',
          points: Math.round(utilPts),
          weight: w.utilization || 0.5,
          aporte: Math.round(aporteUtil * 100) / 100,
          descripcion: 'Utilización ' + upstream.avgChannelUtilization + '% → ' + Math.round(utilPts) + ' pts (peso ' + ((w.utilization || 0.5) * 100) + '%)'
        });
      }
      if (modPts != null) {
        var aporteMod = (modPts * (w.totalModems || 0.25)) / sumW;
        breakdown.push({
          metric: 'Total Modems',
          value: upstream.totalModemsOnChannel,
          unit: '',
          points: Math.round(modPts),
          weight: w.totalModems || 0.25,
          aporte: Math.round(aporteMod * 100) / 100,
          descripcion: 'Modems ' + upstream.totalModemsOnChannel + ' → ' + Math.round(modPts) + ' pts (peso ' + ((w.totalModems || 0.25) * 100) + '%)'
        });
      }
      if (contPts != null) {
        var aporteCont = (contPts * (w.contentionSlots || 0.25)) / sumW;
        breakdown.push({
          metric: 'Percent Contention Slots',
          value: upstream.avgPercentContentionSlots,
          unit: '%',
          points: Math.round(contPts),
          weight: w.contentionSlots || 0.25,
          aporte: Math.round(aporteCont * 100) / 100,
          descripcion: 'Contention ' + upstream.avgPercentContentionSlots + '% → ' + Math.round(contPts) + ' pts (peso ' + ((w.contentionSlots || 0.25) * 100) + '%)'
        });
      }
    }

    if (sumW <= 0) return null;
    var score2 = sumP / sumW;
    var util2 = upstream.avgChannelUtilization;
    var utilNum2 = (util2 != null && !isNaN(util2)) ? Math.min(100, Math.max(0, util2)) : null;
    var meta2 = {};
    if (utilNum2 != null && utilNum2 > 80) {
      score2 = Math.round(utilNum2);
      meta2 = { utilization: utilNum2, subtitle: 'Portadora Saturada', severity: utilNum2 > 90 ? 'rojo' : 'naranja' };
    } else {
      var snr2 = (modem && modem.snr != null) ? modem.snr : null;
      meta2 = { utilization: utilNum2, subtitle: 'Portadora Estable', severity: (snr2 != null && snr2 > 30) ? 'verde' : 'amarillo' };
      if (utilNum2 != null && utilNum2 > 85) {
        score2 = Math.max(0, score2 - Math.min(25, 10 + (utilNum2 - 85)));
      }
    }
    return { score: score2, breakdown: breakdown, meta: meta2 };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculateHealthScores: calculateHealthScores };
  } else {
    global.HealthScoresQoE = { calculateHealthScores: calculateHealthScores };
  }
})(typeof window !== 'undefined' ? window : this);
