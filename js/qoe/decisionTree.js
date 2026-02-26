/**
 * decisionTree.js - Motor de diagnóstico basado en árbol de decisión NOC
 * Módulos independientes: TX, Downstream, Upstream, PHY, Eventos
 * Prioridad: T4 > PHY > SNR bajo > TX alto > delta DS > carga
 */
(function (global) {
  'use strict';

  function resOK() {
    return { estado: 'OK', causa: null, escalar: false, tipoEscalamiento: null };
  }

  function resAdvertencia(causa, tipoEscalamiento, escalar) {
    return { estado: 'ADVERTENCIA', causa: causa, escalar: escalar === true, tipoEscalamiento: tipoEscalamiento || null };
  }

  function resCritico(causa, tipoEscalamiento, escalar) {
    return { estado: 'CRITICO', causa: causa, escalar: escalar !== false, tipoEscalamiento: tipoEscalamiento || null };
  }

  /**
   * Evalúa TX Upstream (Peak Transmit Power)
   * 35-49 OK | 50-52 ADVERTENCIA (límite) | 30-35 ADVERTENCIA leve (no escalar) | <30 o >52 CRITICO
   */
  function evaluarTX(metrics) {
    var tx = metrics.tx != null ? metrics.tx : null;
    if (tx == null) return resOK();
    if (tx >= 35 && tx <= 49) return resOK();
    if (tx >= 50 && tx <= 52) {
      return resAdvertencia('TX en límite superior (' + tx + ' dBmV). Revisar atenuación.', 'CLIENTE', false);
    }
    if (tx >= 30 && tx < 35) {
      return resAdvertencia('TX bajo (' + tx + ' dBmV). Monitorear, no requiere escalamiento.', 'CLIENTE', false);
    }
    if (tx < 30) {
      return resCritico('TX bajo crítico (' + tx + ' dBmV). Posible drop, pérdida o mala conexión.', 'CLIENTE', true);
    }
    return resCritico('TX alto (' + tx + ' dBmV). Sobrenivel que afecta nodo.', 'BALANCEO', true);
  }

  /**
   * Evalúa Downstream: RX, SNR Down, desbalance entre canales DS
   */
  function evaluarDownstream(metrics) {
    var rx = metrics.rx;
    var snrDown = metrics.snrDown;
    var powerLevel = metrics.powerLevel;
    var rxDeltaDownstream = metrics.rxDeltaDownstream;

    if (rx == null && snrDown == null && rxDeltaDownstream == null) return resOK();

    if (rxDeltaDownstream != null && rxDeltaDownstream > 3) {
      var deltaStr = rxDeltaDownstream.toFixed(1);
      return resCritico(
        'Se detecta desbalance forward: diferencia de ' + deltaStr + ' dB entre canales downstream. Se recomienda escalar balanceo en TAP o amplificador de forward.',
        'BALANCEO',
        true
      );
    }

    if (snrDown != null) {
      if (snrDown < 30) return resCritico('SNR Downstream crítico (' + snrDown + ' dB). Causa pixelado/lentitud.', 'PLANTA', true);
      if (snrDown >= 30 && snrDown < 32) return resAdvertencia('SNR Downstream en límite (' + snrDown + ' dB).', 'CLIENTE', false);
    }

    if (rx != null) {
      if (powerLevel != null) {
        var delta = Math.abs(rx - powerLevel);
        if (delta > 5) return resCritico('RX desviado de power-level (' + powerLevel + ' dBmV). Valor: ' + rx + ' dBmV.', 'BALANCEO', true);
        if (delta > 3) return resAdvertencia('RX fuera de rango esperado (power-level ±3 dB).', 'CLIENTE', false);
      } else {
        if (rx < -10 || rx > 10) return resCritico('RX fuera de rango (' + rx + ' dBmV). Niveles anómalos.', 'PLANTA', true);
        if ((rx < -7 || rx > 7) && (rx >= -10 && rx <= 10)) return resAdvertencia('RX en límite (' + rx + ' dBmV).', 'CLIENTE', false);
      }
    }

    return resOK();
  }

  /**
   * Evalúa Upstream: SNR Up, utilización, uncorrectables
   * No marcar CRITICO por uncorrectables si: error ratio <1%, err/min=0, SNR>35, sin T4, sin impacto real
   */
  function evaluarUpstream(metrics, context) {
    var snrUp = metrics.snrUp;
    var util = metrics.utilization;
    var uncorr = metrics.uncorrectablesGlobal != null ? metrics.uncorrectablesGlobal : metrics.uncorrectables;
    var masivo = (context && context.masivoResult) || null;
    var errRatio = (masivo && masivo.errorRatio != null) ? masivo.errorRatio : null;
    var ratePerModem = (masivo && masivo.ratePerModem != null) ? masivo.ratePerModem : null;
    var ratePerMin = (masivo && masivo.ratePerMin != null) ? masivo.ratePerMin : null;
    var impactoReal = (masivo && masivo.impactoReal != null) ? masivo.impactoReal : 0;
    var noCriticoPorContadores = (errRatio == null || errRatio < 0.01) && (ratePerMin == null || ratePerMin < 1) && (snrUp != null && snrUp > 35) && (!masivo || masivo.estado !== 'masivo') && impactoReal < 0.05;

    if (snrUp != null) {
      if (snrUp < 25) return resCritico('SNR Upstream crítico (' + snrUp + ' dB). Ruido en upstream.', 'PLANTA', true);
      if (snrUp >= 25 && snrUp < 30) return resAdvertencia('SNR Upstream en límite (' + snrUp + ' dB). Monitorear.', 'PLANTA', false);
    }

    if (util != null && util >= 85) return resCritico('Utilización upstream crítica (' + util + '%). Canal saturado.', 'CARGA', true);
    if (util != null && util >= 70) return resAdvertencia('Utilización upstream alta (' + util + '%).', 'CARGA', false);

    if (uncorr != null && uncorr > 1000000) {
      if (noCriticoPorContadores) return resAdvertencia('Uncorrectables acumulados elevados. Sin actividad actual (err/min=0, SNR OK). Monitorear.', 'CLIENTE', false);
      return resCritico('Uncorrectables masivos (' + (uncorr >= 1000000 ? (uncorr / 1000000).toFixed(1) + 'M' : uncorr) + '). Pérdida de datos.', 'PLANTA', true);
    }
    if (uncorr != null && uncorr > 100000) {
      if (noCriticoPorContadores) return resOK();
      return resAdvertencia('Uncorrectables elevados (' + (uncorr >= 1000 ? (uncorr / 1000).toFixed(0) + 'k' : uncorr) + ').', 'CLIENTE', false);
    }

    return resOK();
  }

  /**
   * Evalúa capa física: flaps, ranging retries, uptime
   */
  function evaluarPhy(metrics) {
    var flaps = metrics.flaps != null ? (typeof metrics.flaps === 'number' ? metrics.flaps : parseInt(metrics.flaps, 10)) : null;
    var rangingRetries = metrics.rangingRetries;

    if (flaps != null && !isNaN(flaps)) {
      if (flaps > 100) return resCritico('Flaps críticos (' + flaps + '). Lock inestable, múltiples desconexiones.', 'PLANTA', true);
      if (flaps > 50) return resCritico('Flaps elevados (' + flaps + '). Intermitencia detectada.', 'CLIENTE', true);
      if (flaps > 20) return resAdvertencia('Flaps moderados (' + flaps + '). Monitorear estabilidad.', 'CLIENTE', false);
    }

    if (rangingRetries != null && rangingRetries > 50) return resCritico('Ranging retries elevados (' + rangingRetries + '). Problema de sincronización.', 'PLANTA', true);
    if (rangingRetries != null && rangingRetries > 20) return resAdvertencia('Ranging retries (' + rangingRetries + '). Revisar niveles.', 'CLIENTE', false);

    return resOK();
  }

  /**
   * Evalúa eventos: impacto masivo, modems offline, tendencia de errores
   */
  function evaluarEventos(metrics, context) {
    var history = (context && context.history) || [];
    var totalModems = metrics.totalModems != null ? metrics.totalModems : 1;
    var modemsOffline = metrics.modemsOffline;
    var uncorr = metrics.uncorrectablesGlobal != null ? metrics.uncorrectablesGlobal : metrics.uncorrectables;
    var now = (context && context.now) || Date.now();

    if (modemsOffline != null && totalModems > 0) {
      var pctOffline = (modemsOffline / totalModems) * 100;
      if (pctOffline > 20) return resCritico('Alto porcentaje de modems offline (' + modemsOffline + '/' + totalModems + ').', 'PLANTA', true);
      if (pctOffline > 10) return resAdvertencia('Modems offline: ' + modemsOffline + ' de ' + totalModems + '.', 'PLANTA', false);
    }

    if (history.length >= 1) {
      var last = history[history.length - 1];
      var modemsBajaron = last.modems != null && totalModems != null && totalModems < last.modems;
      if (modemsBajaron) {
        var perdidos = last.modems - totalModems;
        return resCritico('Pérdida de modems en canal (' + perdidos + ' offline desde última medición).', 'PLANTA', true);
      }
    }

    var masivoEvt = (context && context.masivoResult) || null;
    var errRatioEvt = (masivoEvt && masivoEvt.errorRatio != null) ? masivoEvt.errorRatio : null;
    var ratePerMinEvt = (masivoEvt && masivoEvt.ratePerMin != null) ? masivoEvt.ratePerMin : null;
    var impactoRealEvt = (masivoEvt && masivoEvt.impactoReal != null) ? masivoEvt.impactoReal : 0;
    var noCriticoPorContadores = masivoEvt && (errRatioEvt == null || errRatioEvt < 0.01) && (ratePerMinEvt == null || ratePerMinEvt < 1) && (metrics.snrUp != null && metrics.snrUp > 35) && masivoEvt.estado !== 'masivo' && impactoRealEvt < 0.05;

    if (uncorr != null && uncorr > 100000 && totalModems > 5 && !noCriticoPorContadores) {
      var ratePerModemEvt = totalModems > 0 ? uncorr / totalModems : 0;
      if (ratePerModemEvt > 50000) return resAdvertencia('Errores por modem elevados. Posible afectación compartida.', 'PLANTA', false);
    }

    return resOK();
  }

  /**
   * T4: Afectación de nivel red/planta (masiva, múltiples nodos)
   * Se detecta por: masivo activo, degradación compartida con impacto
   */
  function evaluarT4(metrics, context) {
    var masivo = (context && context.masivoResult) || null;
    if (!masivo) return null;
    if (masivo.estado === 'masivo') {
      return resCritico('Afectación masiva en canal. Escalar a Planta Exterior.', 'PLANTA', true);
    }
    if (masivo.estado === 'degradacion' && masivo.impactoReal != null && masivo.impactoReal > 0.1) {
      return resAdvertencia('Degradación compartida con impacto real. Monitorear canal.', 'PLANTA', false);
    }
    return null;
  }

  /**
   * Prioridad: T4 > PHY > SNR bajo > TX alto > delta DS > carga
   * Determina la decisión final combinando todos los módulos
   */
  function determinarDecisionFinal(metrics, context) {
    var txRes = evaluarTX(metrics);
    var dsRes = evaluarDownstream(metrics);
    var usRes = evaluarUpstream(metrics, context);
    var phyRes = evaluarPhy(metrics);
    var evtRes = evaluarEventos(metrics, context);
    var t4Res = evaluarT4(metrics, context);

    var todos = [
      { key: 'T4', res: t4Res, orden: 0 },
      { key: 'PHY', res: phyRes, orden: 1 },
      { key: 'SNR', res: usRes, orden: 2 },
      { key: 'TX', res: txRes, orden: 3 },
      { key: 'deltaDS', res: dsRes, orden: 4 },
      { key: 'carga', res: usRes, orden: 5 }
    ];

    var ordenPrioridad = ['T4', 'PHY', 'SNR', 'TX', 'deltaDS', 'carga'];
    var criticos = [];
    var advertencias = [];

    if (t4Res && t4Res.estado !== 'OK') {
      if (t4Res.estado === 'CRITICO') criticos.push({ mod: 'T4', res: t4Res });
      else advertencias.push({ mod: 'T4', res: t4Res });
    }
    if (phyRes.estado === 'CRITICO') criticos.push({ mod: 'PHY', res: phyRes });
    else if (phyRes.estado === 'ADVERTENCIA') advertencias.push({ mod: 'PHY', res: phyRes });

    if (usRes.estado === 'CRITICO') criticos.push({ mod: 'SNR', res: usRes });
    else if (usRes.estado === 'ADVERTENCIA') advertencias.push({ mod: 'SNR', res: usRes });

    if (txRes.estado === 'CRITICO') criticos.push({ mod: 'TX', res: txRes });
    else if (txRes.estado === 'ADVERTENCIA') advertencias.push({ mod: 'TX', res: txRes });

    if (dsRes.estado === 'CRITICO') criticos.push({ mod: 'deltaDS', res: dsRes });
    else if (dsRes.estado === 'ADVERTENCIA') advertencias.push({ mod: 'deltaDS', res: dsRes });

    if (usRes.estado === 'CRITICO' && !criticos.some(function (c) { return c.mod === 'SNR'; })) criticos.push({ mod: 'carga', res: usRes });
    else if (usRes.estado === 'ADVERTENCIA') advertencias.push({ mod: 'carga', res: usRes });

    if (evtRes.estado === 'CRITICO') criticos.push({ mod: 'EVT', res: evtRes });
    else if (evtRes.estado === 'ADVERTENCIA') advertencias.push({ mod: 'EVT', res: evtRes });

    var ordenMod = { T4: 0, PHY: 1, SNR: 2, TX: 3, deltaDS: 4, carga: 5, EVT: 6 };
    criticos.sort(function (a, b) { return (ordenMod[a.mod] || 99) - (ordenMod[b.mod] || 99); });
    advertencias.sort(function (a, b) { return (ordenMod[a.mod] || 99) - (ordenMod[b.mod] || 99); });

    var resultado = criticos.length > 0 ? criticos[0].res : (advertencias.length > 0 ? advertencias[0].res : resOK());
    resultado.modulos = { TX: txRes, Downstream: dsRes, Upstream: usRes, Phy: phyRes, Eventos: evtRes, T4: t4Res };
    resultado.detalle = criticos.concat(advertencias);
    return resultado;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      evaluarTX: evaluarTX,
      evaluarDownstream: evaluarDownstream,
      evaluarUpstream: evaluarUpstream,
      evaluarPhy: evaluarPhy,
      evaluarEventos: evaluarEventos,
      determinarDecisionFinal: determinarDecisionFinal
    };
  } else {
    global.DecisionTreeQoE = {
      evaluarTX: evaluarTX,
      evaluarDownstream: evaluarDownstream,
      evaluarUpstream: evaluarUpstream,
      evaluarPhy: evaluarPhy,
      evaluarEventos: evaluarEventos,
      determinarDecisionFinal: determinarDecisionFinal
    };
  }
})(typeof window !== 'undefined' ? window : this);
