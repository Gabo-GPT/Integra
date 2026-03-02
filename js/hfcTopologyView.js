/**
 * HfcTopologyView - Topología de Red Granular HFC
 * CMTS → NODO → TAP (Poste) → DROP (Acometida) → SPLITTER → CONECTOR → MÓDEM
 * Detección de fallos por umbrales; líneas verde=ok, rojo/naranja=fallo
 */
(function () {
  'use strict';

  var ESTADO = { normal: 'normal', alerta: 'alerta', masiva: 'masiva', conector: 'conector' };
  var COLOR = {
    normal: '#22c55e',
    alerta: '#f59e0b',
    masiva: '#ef4444',
    conector: '#f97316',
    segmento: '#38bdf8',
    segmentoAlerta: '#f59e0b',
    segmentoMasiva: '#ef4444'
  };

  /**
   * Construye diagnóstico desde datos del parser NOC
   * @param {Object} parserData - mac, tx, rx, snrUp, snrDown, flaps, correctables, uncorrectables, utilization
   * @param {Object} opts - { modemsOffline, snrPuerto, modemOffline }
   */
  function buildDiagnostico(parserData, opts) {
    opts = opts || {};
    var d = parserData || {};
    return {
      tx: d.tx,
      rx: d.rx,
      snrUp: d.snrUp,
      snrDown: d.snrDown,
      flaps: d.flaps,
      correctables: d.correctables,
      uncorrectables: d.uncorrectables,
      utilization: d.utilization,
      mac: d.mac,
      modemsOffline: opts.modemsOffline != null ? opts.modemsOffline : 0,
      snrPuerto: opts.snrPuerto != null ? opts.snrPuerto : d.snrUp,
      modemOffline: opts.modemOffline === true
    };
  }

  /**
   * Lógica de detección de fallos (relación entre niveles)
   * Splitter = obstáculo (TX alto + RX bajo). Conector = inestabilidad (Correcteds/Flaps). Acometida = balanceo (RX extremo).
   */
  function evaluarDiagnostico(diag) {
    var r = {
      cmts: ESTADO.normal,
      tramoCmtsNodo: ESTADO.normal,
      nodo: ESTADO.normal,
      nodoX: false,
      tramoNodoTap: ESTADO.normal,
      tap: ESTADO.normal,
      tramoTapDrop: ESTADO.normal,
      drop: ESTADO.normal,
      tramoDropSplitter: ESTADO.normal,
      splitter: ESTADO.normal,
      tramoSplitterConector: ESTADO.normal,
      conector: ESTADO.normal,
      tramoConectorModem: ESTADO.normal,
      modem: ESTADO.normal
    };

    if (!diag) return r;

    var tx = diag.tx;
    var rx = diag.rx;
    var snrUp = diag.snrUp;
    var flaps = diag.flaps;
    var correctables = diag.correctables;
    var uncorrectables = diag.uncorrectables;
    var modemsOffline = diag.modemsOffline || 0;
    var snrPuerto = diag.snrPuerto != null ? diag.snrPuerto : snrUp;
    var utilization = diag.utilization;

    /* FALLA MASIVA: SNR Upstream puerto < 25 O > 5 módems offline → NODO rojo neón */
    var snrBajo = snrPuerto != null && snrPuerto < 25;
    var muchosOffline = modemsOffline > 5;
    if (snrBajo || muchosOffline) {
      r.tramoCmtsNodo = ESTADO.masiva;
      r.cmts = ESTADO.masiva;
      r.nodo = ESTADO.masiva;
      r.nodoX = true;
    }

    /* TAP: Varios vecinos fallan (saturación alta o distribución) */
    if (utilization != null && utilization >= 90) {
      r.tap = ESTADO.masiva;
      r.tramoNodoTap = ESTADO.masiva;
      r.tramoTapDrop = ESTADO.masiva;
    }

    /* RX 8–25 dBmV = interfaz upstream (config). No marcar DROP por rxAlto en ese caso. */
    var rxEsInterfazUpstream = (utilization != null && rx != null && rx >= 8 && rx <= 25);

    /* FALLA EN ACOMETIDA (DROP): TX < 35 Y RX > 12 downstream, O RX < -12. RX 14 = interfaz OK */
    var txBajo = tx != null && tx < 35;
    var rxAlto = rx != null && rx > 12 && !rxEsInterfazUpstream;
    var rxMuyBajo = rx != null && rx < -12;
    if ((txBajo && rxAlto) || rxAlto || rxMuyBajo) {
      r.drop = ESTADO.masiva;
      r.tramoTapDrop = ESTADO.masiva;
      r.tramoDropSplitter = ESTADO.masiva;
    }

    /* FALLA EN SPLITTER: TX > 52 Y RX < -10 (módem "gritando", recibe poco) */
    var txAlto = tx != null && tx > 52;
    var rxMuyBajoSplitter = rx != null && rx < -10;
    if (txAlto && rxMuyBajoSplitter) {
      r.splitter = ESTADO.masiva;
      r.tramoDropSplitter = ESTADO.masiva;
      r.tramoSplitterConector = ESTADO.masiva;
    } else if (txAlto) {
      r.splitter = ESTADO.masiva;
    }

    /* FALLA EN CONECTOR/RUIDO: TX normal, Correcteds/Uncorrectables altos o Flaps (sulfatación, mal ajuste) */
    var txNormal = tx == null || (tx >= 35 && tx <= 52);
    var muchosErrores = (correctables != null && correctables > 1e6) || (uncorrectables != null && uncorrectables > 100);
    var hayFlaps = flaps != null && flaps > 20;
    if (txNormal && (muchosErrores || hayFlaps)) {
      r.conector = ESTADO.conector;
      r.tramoSplitterConector = ESTADO.alerta;
      r.tramoConectorModem = ESTADO.alerta;
    }

    /* MÓDEM: Offline (equipo no responde) */
    if (diag.modemOffline || (modemsOffline > 0 && !diag.mac)) {
      r.modem = ESTADO.masiva;
      r.tramoConectorModem = ESTADO.masiva;
    }

    return r;
  }

  /**
   * Determina si el fallo es masiva (NODO/TAP) o individual (SPLITTER, CONECTOR, DROP, MÓDEM)
   * @returns {{ masiva: boolean, individual: boolean }}
   */
  function getTipoFallo(diagnostico) {
    var e = evaluarDiagnostico(diagnostico);
    var masiva = e.nodo === ESTADO.masiva || e.tap === ESTADO.masiva;
    var individual = e.splitter === ESTADO.masiva || e.conector === ESTADO.conector ||
      e.drop === ESTADO.masiva || e.modem === ESTADO.masiva;
    return { masiva: !!masiva, individual: !!individual };
  }

  function colorParaEstado(estado, esTramo) {
    if (estado === ESTADO.masiva) return COLOR.segmentoMasiva;
    if (estado === ESTADO.conector) return COLOR.conector;
    if (estado === ESTADO.alerta) return COLOR.segmentoAlerta;
    return esTramo ? COLOR.segmento : COLOR.normal;
  }

  function render(container, diagnostico) {
    if (!container) return;
    var e = evaluarDiagnostico(diagnostico);

    var seg = function (key) { return colorParaEstado(e[key], true); };
    var nodo = function (key) { return colorParaEstado(e[key], false); };

    var nodoX = e.nodoX ? '<div class="hfc-topology-nodo-x" aria-hidden="true">✕</div>' : '';
    var parpadeo = (e.nodo === ESTADO.masiva || e.tap === ESTADO.masiva) ? ' hfc-topology-parpadeante' : '';
    var conectorParp = e.conector === ESTADO.conector ? ' hfc-topology-conector-parpadeante' : '';
    var dst = ' hfc-node-destacado';
    var cmtsDst = (e.cmts === ESTADO.masiva) ? dst : '';
    var nodoDst = (e.nodo === ESTADO.masiva) ? dst : '';
    var tapDst = (e.tap === ESTADO.masiva) ? dst : '';
    var dropDst = (e.drop === ESTADO.masiva) ? dst : '';
    var splitterDst = (e.splitter === ESTADO.masiva) ? dst : '';
    var conectorDst = (e.conector === ESTADO.conector) ? dst : '';
    var modemDst = (e.modem === ESTADO.masiva) ? dst : '';

    container.innerHTML =
      '<div class="hfc-topology-view hfc-topology-granular' + parpadeo + conectorParp + '" role="img" aria-label="Topología HFC granular">' +
        '<div class="hfc-topology-flow">' +
          '<div class="hfc-topology-node hfc-cmts' + cmtsDst + '" style="--hfc-color:' + nodo('cmts') + '" title="Planta Externa · Cabecera">' +
            '<span class="hfc-node-icon" aria-hidden="true">📡</span>' +
            '<span class="hfc-node-label">CMTS</span>' +
          '</div>' +
          '<div class="hfc-topology-segment" style="--hfc-seg-color:' + seg('tramoCmtsNodo') + '"></div>' +
          '<div class="hfc-topology-node hfc-nodo' + (e.nodoX ? ' hfc-nodo-masiva' : '') + nodoDst + '" style="--hfc-color:' + nodo('nodo') + '" title="Planta Externa · Conversión óptica">' +
            '<span class="hfc-node-icon" aria-hidden="true">💡</span>' +
            '<span class="hfc-node-label">NODO</span>' + nodoX +
          '</div>' +
          '<div class="hfc-topology-segment" style="--hfc-seg-color:' + seg('tramoNodoTap') + '"></div>' +
          '<div class="hfc-topology-node hfc-tap' + tapDst + '" style="--hfc-color:' + nodo('tap') + '" title="Distribución · Poste">' +
            '<span class="hfc-node-icon" aria-hidden="true">🔀</span>' +
            '<span class="hfc-node-label">TAP</span>' +
            '<span class="hfc-node-desc">Poste</span>' +
          '</div>' +
          '<div class="hfc-topology-segment" style="--hfc-seg-color:' + seg('tramoTapDrop') + '"></div>' +
          '<div class="hfc-topology-node hfc-drop' + dropDst + '" style="--hfc-color:' + nodo('drop') + '" title="Acometida · Cable Drop">' +
            '<span class="hfc-node-icon" aria-hidden="true">📉</span>' +
            '<span class="hfc-node-label">DROP</span>' +
            '<span class="hfc-node-desc">Acometida</span>' +
          '</div>' +
          '<div class="hfc-topology-segment" style="--hfc-seg-color:' + seg('tramoDropSplitter') + '"></div>' +
          '<div class="hfc-topology-node hfc-splitter' + splitterDst + '" style="--hfc-color:' + nodo('splitter') + '" title="Interna · División de señal">' +
            '<span class="hfc-node-icon" aria-hidden="true">➕</span>' +
            '<span class="hfc-node-label">SPLITTER</span>' +
          '</div>' +
          '<div class="hfc-topology-segment" style="--hfc-seg-color:' + seg('tramoSplitterConector') + '"></div>' +
          '<div class="hfc-topology-node hfc-conector' + (e.conector === ESTADO.conector ? ' hfc-conector-falla' : '') + conectorDst + '" style="--hfc-color:' + nodo('conector') + '" title="Conector · Posible sulfatación">' +
            '<span class="hfc-node-icon" aria-hidden="true">🔌</span>' +
            '<span class="hfc-node-label">CONECTOR</span>' +
          '</div>' +
          '<div class="hfc-topology-segment" style="--hfc-seg-color:' + seg('tramoConectorModem') + '"></div>' +
          '<div class="hfc-topology-node hfc-modem' + modemDst + '" style="--hfc-color:' + nodo('modem') + '" title="Terminal · Equipo CPE">' +
            '<span class="hfc-node-icon" aria-hidden="true">📟</span>' +
            '<span class="hfc-node-label">MÓDEM</span>' +
          '</div>' +
        '</div>' +
        '<div class="hfc-topology-leyenda">' +
          '<span class="hfc-leyenda-item"><span class="hfc-leyenda-dot" style="background:' + COLOR.normal + '"></span> OK</span>' +
          '<span class="hfc-leyenda-item"><span class="hfc-leyenda-dot" style="background:' + COLOR.alerta + '"></span> Alerta</span>' +
          '<span class="hfc-leyenda-item"><span class="hfc-leyenda-dot" style="background:' + COLOR.conector + '"></span> Conector/Ruido</span>' +
          '<span class="hfc-leyenda-item"><span class="hfc-leyenda-dot hfc-leyenda-parpadeo" style="background:' + COLOR.masiva + '"></span> Falla</span>' +
        '</div>' +
      '</div>';
  }

  function renderEmpty(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="hfc-topology-view hfc-topology-empty hfc-topology-granular">' +
        '<div class="hfc-topology-flow">' +
          '<div class="hfc-topology-node hfc-cmts"><span class="hfc-node-icon">📡</span><span class="hfc-node-label">CMTS</span></div>' +
          '<div class="hfc-topology-segment"></div>' +
          '<div class="hfc-topology-node hfc-nodo"><span class="hfc-node-icon">💡</span><span class="hfc-node-label">NODO</span></div>' +
          '<div class="hfc-topology-segment"></div>' +
          '<div class="hfc-topology-node hfc-tap"><span class="hfc-node-icon">🔀</span><span class="hfc-node-label">TAP</span></div>' +
          '<div class="hfc-topology-segment"></div>' +
          '<div class="hfc-topology-node hfc-drop"><span class="hfc-node-icon">📉</span><span class="hfc-node-label">DROP</span></div>' +
          '<div class="hfc-topology-segment"></div>' +
          '<div class="hfc-topology-node hfc-splitter"><span class="hfc-node-icon">➕</span><span class="hfc-node-label">SPLITTER</span></div>' +
          '<div class="hfc-topology-segment"></div>' +
          '<div class="hfc-topology-node hfc-conector"><span class="hfc-node-icon">🔌</span><span class="hfc-node-label">CONECTOR</span></div>' +
          '<div class="hfc-topology-segment"></div>' +
          '<div class="hfc-topology-node hfc-modem"><span class="hfc-node-icon">📟</span><span class="hfc-node-label">MÓDEM</span></div>' +
        '</div>' +
        '<p class="hfc-topology-empty-msg">Ejecute el parser para ver el diagnóstico en la topología.</p>' +
      '</div>';
  }

  window.HfcTopologyView = {
    render: render,
    renderEmpty: renderEmpty,
    buildDiagnostico: buildDiagnostico,
    evaluarDiagnostico: evaluarDiagnostico,
    getTipoFallo: getTipoFallo,
    ESTADO: ESTADO,
    COLOR: COLOR
  };
})();
