/**
 * GaboTopology - Topología HFC Dinámica 2.0
 * Parser: Timing Offset : en el log. Cálculo: (offset * 0.048).toFixed(1)
 * Validación: Regla de Oro por cliente. Errores (Util>90%, Uncorrectables, CRC/HCS) → Rojo. Solo distancia inestable → Amarillo. Ambos OK → Verde.
 */
(function () {
  'use strict';

  /* Parser: busca "Timing Offset :" en el log (nocAnalyzer/noc.js ya lo extraen → diagnostico.timingOffset) */
  var calcDist = function (off) { return off != null && !isNaN(off) ? (off * 0.048).toFixed(1) : null; };

  var GABO_TIMING_PREFIX = 'gabo_timing_';
  var GABO_TIMING_MAX_KEYS = 50;
  function getTimingFromStorage(macKey) {
    try {
      if (typeof localStorage === 'undefined') return null;
      var v = localStorage.getItem(GABO_TIMING_PREFIX + macKey);
      if (v == null) v = localStorage.getItem('gabo_timing_initial_' + macKey);
      return v;
    } catch (e) { return null; }
  }
  function setTimingToStorage(macKey, value) {
    try {
      if (typeof localStorage === 'undefined') return;
      var key = GABO_TIMING_PREFIX + macKey;
      localStorage.setItem(key, value);
      var manifest = JSON.parse(localStorage.getItem(GABO_TIMING_PREFIX + 'manifest') || '[]');
      manifest = manifest.filter(function (e) { return e.k !== macKey; });
      manifest.push({ k: macKey, ts: Date.now() });
      if (manifest.length > GABO_TIMING_MAX_KEYS) {
        manifest.sort(function (a, b) { return a.ts - b.ts; });
        var toRemove = manifest.splice(0, manifest.length - GABO_TIMING_MAX_KEYS);
        toRemove.forEach(function (e) { try { localStorage.removeItem(GABO_TIMING_PREFIX + e.k); } catch (err) {} });
      }
      localStorage.setItem(GABO_TIMING_PREFIX + 'manifest', JSON.stringify(manifest));
    } catch (e) {}
  }

  function buildDiagnostico(parserData, opts) {
    opts = opts || {};
    var d = parserData || {};
    return {
      tx: d.tx, rx: d.rx, snrUp: d.snrUp, snrDown: d.snrDown, flaps: d.flaps,
      correctables: d.correctables, uncorrectables: d.uncorrectables, errorRatioFec: d.errorRatioFec,
      utilization: d.utilization, totalModems: d.totalModems, mac: d.mac, interfaceId: d.interfaceId, nodeId: d.nodeId,
      crcModem: d.crcModem, hcsModem: d.hcsModem, timingOffset: d.timingOffset,
      modemsOffline: opts.modemsOffline != null ? opts.modemsOffline : 0,
      snrPuerto: opts.snrPuerto != null ? opts.snrPuerto : d.snrUp,
      modemOffline: opts.modemOffline === true
    };
  }

  function evaluarDiagnostico(diag, opts) {
    var r = { cmts: 'normal', tramoCmtsAmp: 'normal', amplificador: 'normal', tramoAmpNodo: 'normal', nodo: 'normal', nodoX: false,
      tramoNodoTap: 'normal', tap: 'normal', tramoTapSplitter: 'normal', splitter: 'normal', tramoSplitterModem: 'normal', modem: 'normal' };
    if (!diag) return r;
    var tx = diag.tx, rx = diag.rx, snrUp = diag.snrUp, flaps = diag.flaps, correctables = diag.correctables, uncorrectables = diag.uncorrectables;
    var utilization = diag.utilization, errModem = (diag.crcModem || 0) + (diag.hcsModem || 0);
    var uncorrMasivos = uncorrectables != null && uncorrectables > 10000;
    var correctedsAltos = correctables != null && correctables > 1e6;
    var snrEstable = snrUp != null && snrUp >= 30;
    var puertoVacio = utilization != null && utilization < 10;
    var snrBajo = snrUp != null && snrUp < 30;
    var nodosSaturados = (opts && opts.nodosSaturados) || [];
    var nodoActual = (diag.nodeId || diag.interfaceId || '').toString().trim();
    var nodoEnHistorialSaturado = nodoActual && nodosSaturados.indexOf(nodoActual) >= 0;
    if (snrBajo || (uncorrMasivos && !puertoVacio && (diag.totalModems == null || diag.totalModems > 3)) || nodoEnHistorialSaturado) {
      r.tap = snrBajo ? 'masiva' : 'conector';
      r.tramoNodoTap = r.tramoTapSplitter = r.tap;
    }
    if (snrBajo && diag.snrPuerto != null && diag.snrPuerto < 25) {
      r.cmts = r.amplificador = r.nodo = 'masiva';
      r.nodoX = true;
      r.tramoCmtsAmp = r.tramoAmpNodo = r.tramoNodoTap = 'masiva';
    }
    if ((correctedsAltos || uncorrMasivos) && snrEstable && (flaps == null || flaps <= 5)) r.tramoTapSplitter = 'masiva';
    if (tx != null && tx > 52) {
      r.splitter = 'conector';
      r.tramoTapSplitter = r.tramoTapSplitter === 'masiva' ? r.tramoTapSplitter : 'conector';
      r.tramoSplitterModem = 'conector';
    }
    if (uncorrMasivos && snrEstable && (flaps == null || flaps === 0)) {
      r.tramoTapSplitter = 'masiva';
      r.splitter = 'conector';
      r.tramoSplitterModem = 'conector';
    }
    if (errModem > 100 && puertoVacio && (uncorrectables == null || uncorrectables < 1000)) r.modem = 'alerta';
    if (diag.modemOffline && (diag.modemsOffline || 0) > 1) r.modem = 'masiva';
    return r;
  }

  function getTipoFallo(diagnostico) {
    var e = evaluarDiagnostico(diagnostico);
    var masiva = e.nodo === 'masiva' || e.tap === 'masiva';
    var individual = e.splitter === 'conector' || e.splitter === 'masiva' || e.tramoTapSplitter === 'masiva' || e.modem === 'masiva' || e.modem === 'alerta';
    return { masiva: !!masiva, individual: !!individual };
  }

  function color(estado, esTramo) {
    if (estado === 'masiva') return '#ef4444';
    if (estado === 'conector') return '#f97316';
    if (estado === 'alerta') return esTramo ? '#f59e0b' : '#eab308';
    return esTramo ? '#38bdf8' : '#22c55e';
  }

  function render(container, diagnostico, opts) {
    if (!container) return;
    opts = opts || {};
    if (!diagnostico) {
      renderEmpty(container);
      return;
    }
    var e = evaluarDiagnostico(diagnostico, { nodosSaturados: opts.nodosSaturados || [] });
    var seg = function (k) { return color(e[k], true); };
    var nodo = function (k) { return color(e[k], false); };
    var offset = diagnostico.timingOffset;
    var offNum = offset != null ? parseFloat(offset) : null;
    if (isNaN(offNum)) offNum = null;
    var distanciaReal = offNum != null ? (offNum * 0.048).toFixed(1) : '---';
    var macKey = (diagnostico.mac || '').toString().replace(/[^a-fA-F0-9]/g, '');
    var initial = null;
    var stored = getTimingFromStorage(macKey);
    if (stored != null) initial = parseFloat(stored);
    if (offNum != null && initial == null) { setTimingToStorage(macKey, String(offNum)); initial = offNum; }
    var diff = (offNum != null && initial != null) ? Math.abs(offNum - initial) : 0;
    var uncorrectables = diagnostico.uncorrectables != null ? (parseInt(diagnostico.uncorrectables, 10) || 0) : 0;
    var crcModem = (diagnostico.crcModem != null ? parseInt(diagnostico.crcModem, 10) : 0) || 0;
    var hcsModem = (diagnostico.hcsModem != null ? parseInt(diagnostico.hcsModem, 10) : 0) || 0;
    var errModem = crcModem + hcsModem;
    /* TAP-Splitter: solo errores físicos (Uncorrectables, CRC/HCS). Saturación = Nodo/Frecuencia, NO cable. */
    var hayErroresCriticos = (uncorrectables > 0) || (errModem > 0);
    var inestable = diff > 15;
    var segDropColor, textoDist, colorDist;
    if (hayErroresCriticos) {
      segDropColor = '#ef4444';
      textoDist = 'Dista. Real: ' + distanciaReal + 'm · Errores Críticos';
      colorDist = '#ef4444';
    } else if (inestable) {
      segDropColor = '#f59e0b';
      textoDist = 'Dista. Real: ' + distanciaReal + 'm · Inestabilidad Mecánica';
      colorDist = '#f59e0b';
    } else {
      segDropColor = '#22c55e';
      textoDist = 'Dista. Real: ' + distanciaReal + 'm · Ruta Física OK';
      colorDist = '#22c55e';
    }

    container.innerHTML =
      '<div class="gabo-topology topology-container" role="img" aria-label="Topología HFC">' +
        '<div class="gabo-flow">' +
          '<div class="gabo-node node-cmts" style="--gabo-color:' + nodo('cmts') + '" title="Planta Externa · Cabecera">' +
            '<span class="gabo-icon" aria-hidden="true">📡</span>' +
            '<span class="gabo-label">CMTS</span>' +
            '<span class="gabo-desc">Siempre OK</span>' +
          '</div>' +
          '<div class="gabo-segment" style="--gabo-seg:' + seg('tramoCmtsAmp') + '"></div>' +
          '<div class="gabo-node node-amplificador" style="--gabo-color:' + nodo('amplificador') + '" title="Amplificación">' +
            '<span class="gabo-icon" aria-hidden="true">🔊</span>' +
            '<span class="gabo-label">AMPLIFICADOR</span>' +
            '<span class="gabo-desc">+34.3 dB</span>' +
          '</div>' +
          '<div class="gabo-segment" style="--gabo-seg:' + seg('tramoAmpNodo') + '"></div>' +
          '<div class="gabo-node node-nodo" style="--gabo-color:' + nodo('nodo') + '" title="Fibra Óptica">' +
            '<span class="gabo-icon" aria-hidden="true">💡</span>' +
            '<span class="gabo-label">NODO ÓPTICO</span>' +
            '<span class="gabo-desc">Fibra Óptica</span>' +
          '</div>' +
          '<div class="gabo-segment" style="--gabo-seg:' + seg('tramoNodoTap') + '"></div>' +
          '<div class="gabo-node node-tap" style="--gabo-color:' + nodo('tap') + '" title="Distribución · Poste">' +
            '<span class="gabo-icon" aria-hidden="true">🔀</span>' +
            '<span class="gabo-label">TAP</span>' +
            '<span class="gabo-desc">Poste -17 dB</span>' +
          '</div>' +
          '<div class="gabo-drop-wrap">' +
            '<div class="gabo-segment gabo-drop-segment connector-line" style="--gabo-seg:' + segDropColor + '"></div>' +
            '<div class="gabo-distancia" style="color:' + colorDist + '"><span class="distancia-label">' + textoDist.replace(/</g, '&lt;') + '</span></div>' +
          '</div>' +
          '<div class="gabo-node node-splitter" style="--gabo-color:' + nodo('splitter') + '" title="Interior casa">' +
            '<span class="gabo-icon" aria-hidden="true">➕</span>' +
            '<span class="gabo-label">SPLITTER</span>' +
            '<span class="gabo-desc">Interior casa</span>' +
          '</div>' +
          '<div class="gabo-segment" style="--gabo-seg:' + seg('tramoSplitterModem') + '"></div>' +
          '<div class="gabo-node node-modem" style="--gabo-color:' + nodo('modem') + '" title="MAC Status">' +
            '<span class="gabo-icon" aria-hidden="true">📟</span>' +
            '<span class="gabo-label">MÓDEM</span>' +
            '<span class="gabo-desc">Dinámico</span>' +
          '</div>' +
        '</div>' +
        '<div class="gabo-leyenda">' +
          '<span class="gabo-leyenda-item"><span class="gabo-dot" style="background:#22c55e"></span> OK</span>' +
          '<span class="gabo-leyenda-item"><span class="gabo-dot" style="background:#f59e0b"></span> Alerta</span>' +
          '<span class="gabo-leyenda-item"><span class="gabo-dot" style="background:#f97316"></span> Splitter/TAP</span>' +
          '<span class="gabo-leyenda-item"><span class="gabo-dot" style="background:#eab308"></span> Módem</span>' +
          '<span class="gabo-leyenda-item"><span class="gabo-dot" style="background:#ef4444"></span> Falla</span>' +
        '</div>' +
      '</div>';
  }

  function renderEmpty(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="gabo-topology gabo-empty topology-container">' +
        '<div class="gabo-flow">' +
          '<div class="gabo-node"><span class="gabo-icon">📡</span><span class="gabo-label">CMTS</span></div>' +
          '<div class="gabo-segment"></div>' +
          '<div class="gabo-node"><span class="gabo-icon">🔊</span><span class="gabo-label">AMPLIFICADOR</span><span class="gabo-desc">+34.3 dB</span></div>' +
          '<div class="gabo-segment"></div>' +
          '<div class="gabo-node"><span class="gabo-icon">💡</span><span class="gabo-label">NODO ÓPTICO</span><span class="gabo-desc">Fibra Óptica</span></div>' +
          '<div class="gabo-segment"></div>' +
          '<div class="gabo-node"><span class="gabo-icon">🔀</span><span class="gabo-label">TAP</span><span class="gabo-desc">Poste -17 dB</span></div>' +
          '<div class="gabo-segment"></div>' +
          '<div class="gabo-node"><span class="gabo-icon">➕</span><span class="gabo-label">SPLITTER</span><span class="gabo-desc">Interior casa</span></div>' +
          '<div class="gabo-segment"></div>' +
          '<div class="gabo-node"><span class="gabo-icon">📟</span><span class="gabo-label">MÓDEM</span></div>' +
        '</div>' +
        '<p class="gabo-empty-msg">Ejecute el parser para ver el diagnóstico. Pegue el log de show cable modem verbose.</p>' +
      '</div>';
  }

  window.GaboTopology = {
    render: render,
    renderEmpty: renderEmpty,
    buildDiagnostico: buildDiagnostico,
    evaluarDiagnostico: evaluarDiagnostico,
    getTipoFallo: getTipoFallo,
    calculateDistance: calcDist
  };
  window.HfcTopologyView = window.GaboTopology;
})();
