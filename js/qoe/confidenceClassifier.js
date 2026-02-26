/**
 * confidenceClassifier.js - Score de Confianza Tier 2 para clasificar origen DOCSIS
 * Usa SOLO métricas de ventana móvil. NO usa uncorrectables acumulados.
 * Criterios operativos Tier 2: persistencia obligatoria, activityScore + impactScore
 */
(function (global) {
  'use strict';

  var ERROR_RATE_THRESHOLD = 50;
  var ERROR_RATIO_THRESHOLD = 0.01;
  var VENTANA_MINUTOS = 30;
  var ACTIVITY_THRESHOLD = 50;
  var WINDOW_INTERVAL_MIN = 5;

  function extractMac(combined) {
    if (!combined || typeof combined !== 'string') return '';
    var m = combined.match(/(?:MAC\s+Address|Hardware\s+Addr|mac)[\s:]+([a-fA-F0-9\.\-:]{12,17})/i);
    if (m) return m[1].trim();
    m = combined.match(/([a-fA-F0-9]{4}\.[a-fA-F0-9]{4}\.[a-fA-F0-9]{4})/);
    return m ? m[1] : '';
  }

  function detectAffectedModems(modems) {
    if (!modems || !modems.length) return [];
    return modems.filter(function (m) {
      return (m.errorRate != null && m.errorRate > ERROR_RATE_THRESHOLD) ||
        (m.errorRatio != null && m.errorRatio > ERROR_RATIO_THRESHOLD) ||
        (m.crc != null && m.crc > 0) ||
        (m.t4 != null && m.t4 > 0);
    });
  }

  /**
   * Calcula persistencia desde history: ventanas consecutivas activas y duración del evento
   * Cada intervalo entre mediciones = 1 ventana. Activo si rate (errores/min) > umbral
   */
  function computePersistence(history, currentRatePerMin, now) {
    var rates = [];
    for (var i = 1; i < history.length; i++) {
      var prev = history[i - 1], curr = history[i];
      var delta = Math.max(0, (curr.uncorr || 0) - (prev.uncorr || 0));
      var mins = (curr.ts - prev.ts) / 60000;
      var rate = mins > 0 ? delta / mins : 0;
      rates.push({ rate: rate, mins: mins });
    }
    if (history.length >= 1) {
      var lastTs = history[history.length - 1].ts;
      var minsToNow = (now - lastTs) / 60000;
      if (minsToNow > 0) rates.push({ rate: currentRatePerMin, mins: minsToNow });
    }
    var consecutiveWindows = 0;
    var eventDurationMinutes = 0;
    for (var j = rates.length - 1; j >= 0; j--) {
      if (rates[j].rate > ACTIVITY_THRESHOLD) {
        consecutiveWindows++;
        eventDurationMinutes += rates[j].mins;
      } else break;
    }
    return { consecutiveWindows: consecutiveWindows, eventDurationMinutes: Math.round(eventDurationMinutes) };
  }

  /**
   * activityScore (0-50): errores/min, errorRatio, CRC, T4, deltaUncorrectables
   */
  function computeActivityScore(affectedModems, deltaUncorrectablesChannel, channelSnr) {
    var s = 0;
    var maxErrRate = 0;
    var maxErrRatio = 0;
    var hasCrc = false;
    var hasT4 = false;
    affectedModems.forEach(function (m) {
      if (m.errorRate != null && m.errorRate > maxErrRate) maxErrRate = m.errorRate;
      if (m.errorRatio != null && m.errorRatio > maxErrRatio) maxErrRatio = m.errorRatio;
      if (m.crc != null && m.crc > 0) hasCrc = true;
      if (m.t4 != null && m.t4 > 0) hasT4 = true;
    });
    if (maxErrRate > 200) s += 15;
    else if (maxErrRate > 100) s += 10;
    else if (maxErrRate > ACTIVITY_THRESHOLD) s += 5;
    if (maxErrRatio > 0.05) s += 10;
    else if (maxErrRatio > ERROR_RATIO_THRESHOLD) s += 5;
    if (hasCrc) s += 5;
    if (hasT4) s += 10;
    if (deltaUncorrectablesChannel > 200) s += 10;
    else if (deltaUncorrectablesChannel > 50) s += 5;
    return Math.min(50, s);
  }

  /**
   * impactScore (0-50): percentAffected, totalModems, utilización, correlación
   */
  function computeImpactScore(percentAffected, totalModems, channelUtilization, multiModemErrores) {
    var s = 0;
    if (percentAffected >= 50) s += 20;
    else if (percentAffected >= 20) s += 15;
    else if (percentAffected >= 10) s += 10;
    else if (percentAffected > 0) s += 5;
    if (totalModems > 50 && percentAffected > 0) s += 10;
    else if (totalModems > 20 && percentAffected >= 20) s += 5;
    if (channelUtilization >= 80) s += 10;
    else if (channelUtilization >= 70) s += 5;
    if (multiModemErrores) s += 10;
    return Math.min(50, s);
  }

  /**
   * operationalLayer: MODEM→CLIENTE, PORTADORA→PORTADORA, PLANTA→NODO, MONITOREO→N/A
   */
  function getOperationalLayer(classification) {
    return classification === 'MODEM' ? 'CLIENTE' : (classification === 'PORTADORA' ? 'PORTADORA' : (classification === 'PLANTA' ? 'NODO' : 'N/A'));
  }

  function classify(input) {
    var modems = input.modems || [];
    var totalModems = Math.max(input.totalModems != null ? input.totalModems : 1, 1);
    var channelSnr = input.channelSnr != null ? input.channelSnr : 999;
    var channelUtilization = input.channelUtilization != null ? input.channelUtilization : 0;
    var deltaUncorrectablesChannel = input.deltaUncorrectablesChannel != null ? input.deltaUncorrectablesChannel : 0;
    var ventanaMinutos = input.ventanaMinutos != null ? input.ventanaMinutos : VENTANA_MINUTOS;
    var history = input.history || [];
    var now = input.now != null ? input.now : Date.now();

    var affectedModems = detectAffectedModems(modems);
    var percentAffected = totalModems > 0 ? (affectedModems.length / totalModems) * 100 : 0;

    var persistence = computePersistence(history, deltaUncorrectablesChannel, now);
    var eventDurationMinutes = persistence.eventDurationMinutes;
    var consecutiveWindows = persistence.consecutiveWindows;

    var activityScore = computeActivityScore(affectedModems, deltaUncorrectablesChannel, channelSnr);
    var impactScore = computeImpactScore(percentAffected, totalModems, channelUtilization, affectedModems.length > 1);

    var confidenceScore = Math.min(100, activityScore + impactScore);

    var persistenceAdjustment = 0;
    if (eventDurationMinutes < 5 && affectedModems.length > 0) persistenceAdjustment = -15;
    else if (eventDurationMinutes >= 10) persistenceAdjustment = 10;
    confidenceScore = Math.max(0, Math.min(100, confidenceScore + persistenceAdjustment));

    var classification = 'MONITOREO';
    var action = 'CONTINUAR MONITOREO';
    var justification = [];
    var allowAutomaticAction = consecutiveWindows >= 2;
    var validationStatus = null;

    if (affectedModems.length === 0) {
      justification.push('Sin actividad de errores en ventana de ' + ventanaMinutos + ' min');
      justification.push('SNR canal ' + (channelSnr < 999 ? channelSnr.toFixed(1) : '—') + ' dB');
      justification.push('Utilización ' + channelUtilization + '%');
      return buildResult('MONITOREO', 0, justification, [], [], 0, 0, 0, 'N/A', 'CONTINUAR MONITOREO', null, 0, percentAffected, '0', { errPerMin: 0, errorRatio: 0, t4: false });
    }

    var isIndividual = affectedModems.length === 1 && percentAffected < 10;
    var snrCritico = channelSnr < 25;

    if (isIndividual) {
      classification = 'MODEM';
      justification.push('1/' + totalModems + ' módems afectados');
      justification.push('SNR canal ' + channelSnr.toFixed(1) + ' dB');
      justification.push('Utilización ' + channelUtilization + '%');
      if (consecutiveWindows >= 2) justification.push('Ventanas consecutivas: ' + consecutiveWindows);
      if (eventDurationMinutes >= 10) justification.push('Duración evento: ' + eventDurationMinutes + ' min');
      if (!allowAutomaticAction) justification.push('Sin persistencia suficiente para acción automática');
      if (confidenceScore >= 70 && eventDurationMinutes >= 10 && consecutiveWindows >= 2) {
        action = 'AGENDAR VISITA TÉCNICA';
      } else {
        action = allowAutomaticAction ? 'MONITOREO O VUELTA A MEDIR' : 'CONTINUAR MONITOREO';
        if (!allowAutomaticAction || eventDurationMinutes < 10) {
          validationStatus = 'VALIDACIÓN EN CURSO';
          action = 'CONTINUAR MONITOREO';
        }
      }
    } else if (percentAffected >= 20 && percentAffected < 50) {
      classification = 'PORTADORA';
      justification.push(affectedModems.length + '/' + totalModems + ' módems afectados (' + percentAffected.toFixed(0) + '%)');
      justification.push('SNR canal ' + channelSnr.toFixed(1) + ' dB');
      if (allowAutomaticAction) justification.push('Ventanas consecutivas: ' + consecutiveWindows);
      if (eventDurationMinutes >= 5 && allowAutomaticAction) {
        action = 'ESCALAR A PLANTA';
      } else {
        action = 'CONTINUAR MONITOREO';
        validationStatus = 'VALIDACIÓN EN CURSO';
        justification.push('Persistencia insuficiente (requiere ≥5 min y ≥2 ventanas)');
      }
    } else if (percentAffected >= 50) {
      classification = 'PLANTA';
      justification.push(affectedModems.length + '/' + totalModems + ' módems afectados (' + percentAffected.toFixed(0) + '%)');
      justification.push('SNR canal ' + channelSnr.toFixed(1) + ' dB');
      if (allowAutomaticAction) justification.push('Ventanas consecutivas: ' + consecutiveWindows);
      if (snrCritico && consecutiveWindows >= 2) {
        action = 'DECLARAR MASIVA';
      } else {
        action = 'CONTINUAR MONITOREO';
        validationStatus = 'VALIDACIÓN EN CURSO';
        justification.push('Requiere SNR<25 y ≥2 ventanas consecutivas');
      }
    } else {
      classification = 'MONITOREO';
      action = 'CONTINUAR MONITOREO';
      justification.push(percentAffected.toFixed(0) + '% afectados, criterios no cumplidos');
    }

    var confidenceLevel = confidenceScore >= 85 ? 'MUY ALTA' : (confidenceScore >= 70 ? 'ALTA' : (confidenceScore >= 50 ? 'MEDIA' : 'BAJA'));
    var operationalLayer = getOperationalLayer(classification);

    var maxErrRate = 0, maxErrRatio = 0, hasT4 = false;
    affectedModems.forEach(function (m) {
      if (m.errorRate != null && m.errorRate > maxErrRate) maxErrRate = m.errorRate;
      if (m.errorRatio != null && m.errorRatio > maxErrRatio) maxErrRatio = m.errorRatio;
      if (m.t4 != null && m.t4 > 0) hasT4 = true;
    });
    var activityBreakdown = { errPerMin: maxErrRate, errorRatio: maxErrRatio, t4: hasT4 };

    var affectedModemsDetail = affectedModems.map(function (m) {
      var motivo = [];
      if (m.errorRate != null && m.errorRate > ERROR_RATE_THRESHOLD) motivo.push('Error/min ' + m.errorRate.toFixed(0));
      if (m.errorRatio != null && m.errorRatio > ERROR_RATIO_THRESHOLD) motivo.push('ErrorRatio ' + (m.errorRatio * 100).toFixed(2) + '%');
      if (m.crc != null && m.crc > 0) motivo.push('CRC');
      if (m.t4 != null && m.t4 > 0) motivo.push('T4');
      return {
        mac: m.mac || '—',
        errorRate: m.errorRate != null ? m.errorRate.toFixed(1) : '—',
        errorRatio: m.errorRatio != null ? (m.errorRatio * 100).toFixed(2) + '%' : '—',
        snr: m.snr != null ? m.snr.toFixed(1) : '—',
        motivo: motivo.join(' · ') || 'Afectado'
      };
    });

    var avgActivity = affectedModems.length > 0 && deltaUncorrectablesChannel != null ? deltaUncorrectablesChannel.toFixed(0) : '0';

    return buildResult(
      classification,
      confidenceScore,
      justification,
      affectedModems.map(function (m) { return m.mac || ''; }).filter(Boolean),
      affectedModemsDetail,
      activityScore,
      impactScore,
      eventDurationMinutes,
      operationalLayer,
      action,
      validationStatus,
      consecutiveWindows,
      percentAffected,
      avgActivity,
      activityBreakdown
    );
  }

  function buildResult(classification, confidenceScore, justification, affectedMacs, affectedModemsDetail, activityScore, impactScore, eventDurationMinutes, operationalLayer, action, validationStatus, consecutiveWindows, percentAffected, avgActivity, activityBreakdown) {
    var confidenceLevel = confidenceScore >= 85 ? 'MUY ALTA' : (confidenceScore >= 70 ? 'ALTA' : (confidenceScore >= 50 ? 'MEDIA' : 'BAJA'));
    var breakdown = activityBreakdown || { errPerMin: 0, errorRatio: 0, t4: false };
    return {
      classification: classification,
      confidenceScore: confidenceScore,
      confidenceLevel: confidenceLevel,
      operationalLayer: operationalLayer,
      activityScore: activityScore,
      impactScore: impactScore,
      activityBreakdown: breakdown,
      eventDurationMinutes: eventDurationMinutes,
      consecutiveWindows: consecutiveWindows,
      action: action,
      validationStatus: validationStatus,
      technicalJustification: justification,
      affectedMacs: affectedMacs,
      affectedModemsDetail: affectedModemsDetail,
      percentAffected: percentAffected,
      avgActivityPerMin: avgActivity
    };
  }

  function classifyFromNoc(metrics, context) {
    var masivo = (context && context.masivoResult) || null;
    var history = (context && context.history) || [];
    var combined = (context && context.combinedRaw) || '';
    var now = (context && context.now) != null ? context.now : Date.now();

    var ratePerMin = (masivo && masivo.ratePerMin != null) ? masivo.ratePerMin : 0;
    var errorRatio = (masivo && masivo.errorRatio != null) ? masivo.errorRatio : (metrics.unerroreds != null && metrics.correctables != null ? (function () {
      var tot = (metrics.unerroreds || 0) + (metrics.correctables || 0) + (metrics.uncorrectablesGlobal || metrics.uncorrectables || 0);
      return tot > 0 ? (metrics.uncorrectablesGlobal || metrics.uncorrectables || 0) / tot : 0;
    }()) : 0);

    var totalModems = metrics.totalModems != null ? metrics.totalModems : 1;
    var mac = extractMac(combined) || (metrics.mac || '');
    if (!mac && context && context.modemRaw) mac = extractMac(context.modemRaw);

    var crcVal = ratePerMin > 0 ? 1 : 0;
    var t4Val = (masivo && masivo.estado === 'masivo') ? 1 : 0;
    var t3Val = metrics.rangingRetries != null && metrics.rangingRetries > 0 ? metrics.rangingRetries : 0;

    var modems = [{
      mac: mac,
      errorRate: ratePerMin,
      errorRatio: errorRatio,
      crc: crcVal,
      t3: t3Val,
      t4: t4Val,
      snr: metrics.snrUp
    }];

    var input = {
      modems: modems,
      totalModems: totalModems,
      channelSnr: metrics.snrUp,
      channelUtilization: metrics.utilization != null ? metrics.utilization : 0,
      deltaUncorrectablesChannel: ratePerMin,
      ventanaMinutos: VENTANA_MINUTOS,
      history: history,
      now: now
    };

    return classify(input);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { classify: classify, classifyFromNoc: classifyFromNoc };
  } else {
    global.ConfidenceClassifierQoE = { classify: classify, classifyFromNoc: classifyFromNoc };
  }
})(typeof window !== 'undefined' ? window : this);
