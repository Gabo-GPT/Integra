/**
 * Integra NOC · Dashboard Nivel 3
 * Ingesta, Parser, Selector CMTS, Gauges, Motor de Decisión, Export
 */
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.INTEGRA_API_BASE) || '';

  let inventario = [];
  let cmtsSeleccionado = null;
  let datosParseados = null;
  let chartSaturacion = null;

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  /* ----- Data Fetching ----- */
  function normalizarLista(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (c) { return c && (c.nombre || c.ip); }).map(function (c) {
      return {
        nombre: (c.nombre || c.name || '').trim(),
        ip: (c.ip || '').trim(),
        marca: ((c.marca || c.vendor || c.brand || '')).toLowerCase(),
        segmento: (c.segmento || c.segment || '').trim()
      };
    });
  }

  async function fetchInventario() {
    try {
      const url = (API_BASE || '') + '/api/v1/cmts';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('API ' + res.status);
      inventario = await res.json();
      if (Array.isArray(inventario) && inventario.length > 0) return inventario;
    } catch (e) {
      console.warn('NOC: API falló, intentando fallback local:', e.message);
    }
    try {
      const [r1, r2] = await Promise.all([
        fetch('config/cmts_inventory.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
        fetch('config/inventario_cmts.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
      ]);
      const list1 = normalizarLista(Array.isArray(r1) ? r1 : (r1 && (r1.cmts || r1.items)) || []);
      const list2 = normalizarLista(Array.isArray(r2) ? r2 : (r2 && (r2.cmts || r2.items)) || []);
      const seen = {};
      inventario = [];
      list2.concat(list1).forEach(function (c) {
        const k = (c.nombre || '').toLowerCase();
        if (k && !seen[k]) { seen[k] = true; inventario.push(c); }
      });
    } catch (e2) {
      console.warn('NOC: Fallback falló:', e2.message);
      inventario = [];
    }
    return inventario;
  }

  /* ----- CMTS Selector con Auto-Completado ----- */
  function renderDropdown(filter) {
    const listbox = $('#cmtsDropdown');
    const input = $('#cmtsSearch');
    if (!listbox || !input) return;

    const q = (filter || input.value || '').trim().toLowerCase();
    if (!q) {
      listbox.hidden = true;
      listbox.innerHTML = '';
      return;
    }

    const filtered = inventario.filter(function (c) {
      const nombre = (c.nombre || '').toLowerCase();
      const ip = (c.ip || '').toLowerCase();
      return nombre.indexOf(q) >= 0 || ip.indexOf(q) >= 0;
    }).slice(0, 15);

    listbox.innerHTML = filtered.map(function (c) {
      return '<div class="noc-dropdown-item" role="option" data-nombre="' + escapeAttr(c.nombre) + '" data-ip="' + escapeAttr(c.ip) + '" data-marca="' + escapeAttr(c.marca || '') + '" data-segmento="' + escapeAttr(c.segmento || '') + '">' +
        escapeHtml(c.nombre) + ' · ' + escapeHtml(c.ip) + (c.marca ? ' · ' + escapeHtml(c.marca) : '') +
        '</div>';
    }).join('');

    listbox.hidden = filtered.length === 0;
  }

  function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function actualizarIpConexion(ip) {
    const ipBox = $('#nocIpConexion');
    if (ipBox) ipBox.textContent = (ip && ip.trim()) ? ip.trim() : '—';
  }

  function syncIpDesdeInput() {
    const input = $('#cmtsSearch');
    if (!input) return;
    const val = (input.value || '').trim();
    if (!val) {
      if (!cmtsSeleccionado) actualizarIpConexion('');
      return;
    }
    if (val.indexOf(' · ') >= 0) {
      const parts = val.split(' · ');
      const ip = (parts[1] || '').trim();
      if (ip) actualizarIpConexion(ip);
    } else {
      const v = val.toLowerCase();
      const match = inventario.find(function (c) {
        return (c.nombre || '').toLowerCase() === v;
      });
      if (match && (match.ip || '').trim()) actualizarIpConexion((match.ip || '').trim());
    }
  }

  function seleccionarCmts(item) {
    if (!item) return;
    var getVal = function (key) {
      var v = (item.dataset && item.dataset[key]) || item.getAttribute('data-' + key) || '';
      return String(v).trim();
    };
    var nombre = getVal('nombre');
    var ip = getVal('ip');
    cmtsSeleccionado = { nombre: nombre, ip: ip, marca: getVal('marca'), segmento: getVal('segmento') };
    var input = $('#cmtsSearch');
    if (input) input.value = nombre + (ip ? ' · ' + ip : '');
    var listbox = $('#cmtsDropdown');
    if (listbox) listbox.hidden = true;

    var ctx = $('#cmtsContext');
    if (ctx) {
      ctx.hidden = false;
      setText('cmtsNombreSel', cmtsSeleccionado.nombre);
      setText('cmtsIpSel', cmtsSeleccionado.ip);
      setText('cmtsSegmentoSel', cmtsSeleccionado.segmento || '—');
      setText('cmtsMarcaSel', cmtsSeleccionado.marca || '—');
    }
    actualizarIpConexion(ip);
  }

  function setText(id, val) {
    const el = $('#' + id);
    if (el) el.textContent = val == null || val === '' ? '—' : val;
  }

  /* ----- Parser (usa NocAnalyzerQoE si existe, si no regex simple) ----- */
  function parseOutput(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'Sin contenido para parsear' };
    }
    const combined = raw.trim();

    if (typeof NocAnalyzerQoE !== 'undefined' && NocAnalyzerQoE.analyze) {
      try {
        const diag = NocAnalyzerQoE.analyze(combined, null, {});
        const m = diag.raw || {};
        const ipM = combined.match(/(?:IP\s+Address|IPv4|inet)[\s:]+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i);
        var peakTx = m.peakTx || (diag.raw && diag.raw.peakTx);
        var totalModems = m.totalModems;
        var crcModem = m.crcModem != null ? m.crcModem : (diag.raw && diag.raw.crcModem);
        var hcsModem = m.hcsModem != null ? m.hcsModem : (diag.raw && diag.raw.hcsModem);
        if (peakTx == null) { var pm = combined.match(/Peak\s+Transmit\s+Power\s*\(dBmV\)[\s:]+([\d.,\-]+)/i); if (pm) peakTx = parseFloat(String(pm[1]).replace(',', '.')); }
        if (totalModems == null) { var tm = combined.match(/Total\s+Modems?\s+(?:On\s+This\s+Upstream\s+Channel|on\s+channel)[\s:]+(\d+)/i); if (tm) totalModems = parseInt(tm[1], 10); }
        if (crcModem == null && hcsModem == null && combined.toLowerCase().includes('errors')) {
          var macForErr = (m.mac || '').replace(/[.:-]/g, '[.:\\-]');
          if (macForErr) {
            var rowM = combined.match(new RegExp(macForErr + '[^\\n]+', 'm'));
            if (rowM) {
              var nums = rowM[0].match(/\d+/g);
              if (nums && nums.length >= 2) { crcModem = parseInt(nums[nums.length - 2], 10); hcsModem = parseInt(nums[nums.length - 1], 10); }
            }
          }
        }
        return {
          ok: true,
          mac: m.mac || null,
          ip: ipM ? ipM[1] : null,
          tx: diag.tx && diag.tx.valor != null ? diag.tx.valor : m.tx,
          rx: diag.rx && diag.rx.valor != null ? diag.rx.valor : m.rx,
          snrUp: diag.snrUp && diag.snrUp.valor != null ? diag.snrUp.valor : m.snrUp,
          snrDown: diag.snrDown && diag.snrDown.valor != null ? diag.snrDown.valor : m.snrDown,
          flaps: diag.intermitencia && diag.intermitencia.valor !== 'N/A' ? diag.intermitencia.valor : m.flaps,
          correctables: m.correctables,
          uncorrectables: m.uncorrectables != null ? m.uncorrectables : (diag.raw && diag.raw.uncorrectables),
          utilization: m.utilization,
          totalModems: totalModems,
          interfaceId: m.interfaceId || (diag.raw && diag.raw.interfaceId) || null,
          rangingRetries: m.rangingRetries || (diag.raw && diag.raw.rangingRetries) || null,
          peakTx: peakTx,
          crcModem: crcModem,
          hcsModem: hcsModem,
          diag: diag
        };
      } catch (e) {
        console.warn('NocAnalyzer error:', e);
      }
    }

    /* Fallback: regex simple */
    const macM = combined.match(/(?:MAC\s+Address|Hardware\s+Addr|mac)[\s:]+([a-fA-F0-9\.\-:]{12,17})/i) ||
      combined.match(/([a-fA-F0-9]{4}\.[a-fA-F0-9]{4}\.[a-fA-F0-9]{4})/);
    const mac = macM ? macM[1].trim() : null;

    let ip = null;
    m = combined.match(/(?:IP\s+Address|IPv4|inet)[\s:]+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i);
    if (m) ip = m[1];

    const num = function (s) {
      if (s == null) return null;
      const t = String(s).trim().replace(/[^\d.,\-]/g, '').replace(',', '.');
      const n = parseFloat(t);
      return isNaN(n) ? null : n;
    };

    let tx = null;
    let m = combined.match(/(?:Peak\s+)?(?:Transmit|Tx)\s*Power\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|Rec\s+Power\s*=\s*([\d.,\-]+)\s*dBmV/i);
    if (m) tx = num(m[1] || m[2]);

    let rx = null;
    m = combined.match(/(?:Receive|Rx|Downstream)\s*(?:Power|Signal)\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|DSPwr[\s:]+([\d.,\-]+)/i);
    if (m) rx = num(m[1] || m[2]);

    let snrUp = null;
    m = combined.match(/(?:Upstream\s+)?SNR[\s:]+([\d.,\-]+)|Signal[\s\/]Noise[\s:]+([\d.,\-]+)/i);
    if (m) snrUp = num(m[1] || m[2]);

    /* SNR Down: solo si hay indicador explícito (Down/DSSNR). "SNR" a secas es upstream */
    let snrDown = null;
    m = combined.match(/SNR\s*(?:Down|Downstream)\s*:?\s*([\d.,\-]+)|(?:DS\s*SNR|DSSNR|Downstream\s+SNR)[\s:]+([\d.,\-]+)/i);
    if (m) snrDown = num(m[1] || m[2]);

    let flaps = null;
    m = combined.match(/Flaps?[\s:]+([\d\s,]+)/i);
    if (m) flaps = parseInt(String(m[1]).replace(/\D/g, ''), 10) || null;

    let correctables = null;
    m = combined.match(/([\d\s,]+)\s+(?:Correctables?|Correcteds?)/i);
    if (m) correctables = parseInt(String(m[1]).replace(/\D/g, ''), 10) || null;

    let uncorrectables = null;
    m = combined.match(/([\d\s,]+)\s+(?:Uncorrectables?|Uncorrectable)/i);
    if (m) uncorrectables = parseInt(String(m[1]).replace(/\D/g, ''), 10) || null;

    let utilization = null;
    m = combined.match(/(?:Avg\.?\s*)?(?:channel\s+)?utilization[\s:]+([\d.,]+)/i);
    if (m) utilization = num(m[1]);

    var interfaceId = null;
    m = combined.match(/(?:US\s*Intf|Upstream|Cable\s*upstream|cable-upstream)[\s:]*(\d+\/\d+(?:\.\d+)?|[\w\-\.]+)/i);
    if (m) interfaceId = m[1].trim();

    var rangingRetries = null;
    m = combined.match(/(?:RngRetry|Ranging\s*Retries?)[\s:]+(\d+)/i);
    if (m) rangingRetries = parseInt(m[1], 10);

    var peakTx = null;
    m = combined.match(/Peak\s+Transmit\s+Power\s*\(dBmV\)[\s:]+([\d.,\-]+)/i);
    if (m) peakTx = num(m[1]);

    var totalModems = null;
    m = combined.match(/Total\s+Modems?\s+(?:On\s+This\s+Upstream\s+Channel|on\s+channel)[\s:]+(\d+)/i);
    if (m) totalModems = parseInt(m[1], 10);

    var crcModem = null;
    var hcsModem = null;
    if (combined.toLowerCase().includes('errors')) {
      var errM = combined.match(/Errors[\s:]+(\d+)\s+CRCs?,?\s*(\d+)\s+HCS/i);
      if (errM) {
        crcModem = parseInt(errM[1], 10);
        hcsModem = parseInt(errM[2], 10);
      } else if (mac) {
        var macNorm = mac.replace(/[.:-]/g, '[.:\\-]');
        var rowRe = new RegExp(macNorm + '[^\\n]+', 'm');
        var row = combined.match(rowRe);
        if (row) {
          var nums = row[0].match(/\d+/g);
          if (nums && nums.length >= 2) {
            crcModem = parseInt(nums[nums.length - 2], 10);
            hcsModem = parseInt(nums[nums.length - 1], 10);
          }
        }
      }
    }

    return {
      ok: true,
      mac: mac,
      ip: ip,
      tx: tx,
      rx: rx,
      snrUp: snrUp,
      snrDown: snrDown,
      flaps: flaps,
      correctables: correctables,
      uncorrectables: uncorrectables,
      utilization: utilization,
      totalModems: totalModems,
      interfaceId: interfaceId,
      rangingRetries: rangingRetries,
      peakTx: peakTx,
      crcModem: crcModem,
      hcsModem: hcsModem,
      diag: null
    };
  }

  /* ----- Umbrales y colores ----- */
  function estadoTx(v) {
    if (v == null) return { estado: '—', color: 'muted' };
    if (v >= 35 && v <= 49) return { estado: 'Óptimo', color: 'verde' };
    if (v >= 50 && v <= 52) return { estado: 'Aceptable', color: 'amarillo' };
    if (v > 52) return { estado: 'Crítico', color: 'rojo' };
    if (v >= 30 && v < 35) return { estado: 'Advertencia', color: 'amarillo' };
    return { estado: 'Crítico', color: 'rojo' };
  }

  /* RX: soporta downstream (-7 a +7) y upstream (hasta ~55 dBmV en interfaz) */
  function estadoRx(v) {
    if (v == null) return { estado: '—', color: 'muted' };
    if (v >= -7 && v <= 7) return { estado: 'Óptimo', color: 'verde' };   /* downstream */
    if (v > 7 && v <= 55) return { estado: 'Óptimo', color: 'verde' };    /* upstream interfaz */
    if ((v >= -10 && v < -7) || (v > 55 && v <= 58)) return { estado: 'Aceptable', color: 'amarillo' };
    return { estado: 'Crítico', color: 'rojo' };
  }

  function estadoSnr(v) {
    if (v == null) return { estado: '—', color: 'muted' };
    if (v <= 0 || isNaN(v)) return { estado: '—', color: 'muted' };  /* valor inválido = sin dato */
    if (v > 32) return { estado: 'Óptimo', color: 'verde' };
    if (v >= 30 && v <= 32) return { estado: 'Aceptable', color: 'amarillo' };
    if (v >= 25 && v < 30) return { estado: 'Advertencia', color: 'amarillo' };
    return { estado: 'Crítico', color: 'rojo' };
  }

  function estadoFlaps(v) {
    if (v == null) return { estado: '—', color: 'muted' };
    if (v <= 50) return { estado: 'Estable', color: 'verde' };
    return { estado: 'Intermitente', color: 'rojo' };
  }

  function pctParaGauge(metric, val) {
    if (val == null) return 0;
    if (metric === 'tx') return Math.max(0, Math.min(100, ((val - 20) / 60) * 100));
    if (metric === 'rx') return Math.max(0, Math.min(100, ((val + 15) / 30) * 100));
    if (metric === 'snrUp' || metric === 'snrDown') return Math.max(0, Math.min(100, (val / 50) * 100));
    if (metric === 'flaps') return Math.min(100, val);
    return Math.min(100, val);
  }

  /* ----- Actualizar UI ----- */
  function actualizarGauges(data) {
    const metrics = [
      { key: 'tx', elVal: 'valTx', elEstado: 'estadoTx', elGauge: 'gaugeTx', fn: estadoTx, pct: pctParaGauge.bind(null, 'tx') },
      { key: 'rx', elVal: 'valRx', elEstado: 'estadoRx', elGauge: 'gaugeRx', fn: estadoRx, pct: pctParaGauge.bind(null, 'rx') },
      { key: 'snrUp', elVal: 'valSnrUp', elEstado: 'estadoSnrUp', elGauge: 'gaugeSnrUp', fn: estadoSnr, pct: pctParaGauge.bind(null, 'snrUp') },
      { key: 'snrDown', elVal: 'valSnrDown', elEstado: 'estadoSnrDown', elGauge: 'gaugeSnrDown', fn: estadoSnr, pct: pctParaGauge.bind(null, 'snrDown') },
      { key: 'flaps', elVal: 'valFlaps', elEstado: 'estadoFlaps', elGauge: 'gaugeFlaps', fn: estadoFlaps, pct: pctParaGauge.bind(null, 'flaps') }
    ];

    metrics.forEach(function (m) {
      const val = data[m.key];
      const e = m.fn(val);
      const pct = m.pct(val);
      const card = $('[data-metric="' + m.key + '"]');
      if (card) {
        card.setAttribute('data-glow', e.color);
      }
      setText(m.elVal, val != null ? (typeof val === 'number' && m.key !== 'flaps' ? val.toFixed(1) : val) : '—');
      const estEl = $('#' + m.elEstado);
      if (estEl) {
        estEl.textContent = e.estado;
        estEl.className = 'noc-gauge-estado ' + e.color;
      }
      const gaugeEl = $('#' + m.elGauge);
      if (gaugeEl) {
        gaugeEl.style.setProperty('--gauge-pct', pct);
        gaugeEl.setAttribute('data-pct', val != null ? Math.round(pct) : '');
      }
    });

    setText('widgetMacVal', data.mac || '—');
    setText('widgetIpVal', data.ip || '—');
    const errStr = [data.correctables, data.uncorrectables].filter(Boolean).length
      ? (data.correctables || 0) + ' / ' + (data.uncorrectables || 0)
      : '—';
    setText('widgetErrorsVal', errStr);

    $$('.noc-widget').forEach(function (w) {
      w.removeAttribute('data-glow');
    });
  }

  function actualizarChart(utilization) {
    const canvas = $('#chartSaturacion');
    const desc = $('#chartDesc');
    if (!canvas) return;

    if (chartSaturacion) {
      chartSaturacion.destroy();
      chartSaturacion = null;
    }

    const util = utilization != null && !isNaN(utilization) ? utilization : 0;
    if (desc) {
      desc.textContent = util > 0
        ? 'Utilización de canal: ' + util.toFixed(1) + '%. ' + (util > 80 ? 'Saturación crítica.' : (util > 60 ? 'Monitorear.' : 'Normal.'))
        : 'Sin datos de utilización. Pegue output de show interface upstream.';
    }

    const ctx = canvas.getContext('2d');
    chartSaturacion = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Utilización'],
        datasets: [{
          label: 'Saturación %',
          data: [Math.min(100, util)],
          backgroundColor: util > 80 ? 'rgba(239,68,68,0.7)' : (util > 60 ? 'rgba(245,158,11,0.7)' : 'rgba(56,189,248,0.5)'),
          borderColor: util > 80 ? '#ef4444' : (util > 60 ? '#f59e0b' : '#38bdf8'),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { max: 100, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(71,85,105,0.3)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { display: false } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  /* ----- Motor de Decisión Senior (Segmentación Red vs TAP/Acometida) ----- */
  function generarHallazgos(data) {
    var d = data || {};
    var rx = d.rx;
    var tx = d.tx;
    var peakTx = d.peakTx != null ? d.peakTx : tx;
    var snrUp = d.snrUp;
    var flaps = d.flaps;
    var correctables = d.correctables;
    var utilization = d.utilization;
    var interfaceId = d.interfaceId || '—';
    var rangingRetries = d.rangingRetries;
    var mac = d.mac || '—';
    var totalModems = d.totalModems;
    var crcModem = d.crcModem;
    var hcsModem = d.hcsModem;
    var errModem = ((crcModem || 0) + (hcsModem || 0));

    var hallazgos = [];
    var puertoRef = interfaceId !== '—' ? 'puerto ' + interfaceId : 'el puerto';

    /* Proxy: sin datos de vecinos, uso utilization. Alto = posible masiva, Bajo = individual */
    var indicioRed = (utilization != null && utilization >= 80) || (rx != null && rx > 20);
    var indicioIndividual = (utilization == null || utilization < 70);

    /* RX 8–25 dBmV = típico de interfaz upstream (config). No usar como falla de drop/red. */
    var rxEsInterfazUpstream = (utilization != null && rx != null && rx >= 8 && rx <= 25);

    /* FALLA DE RED (Nodo/Planta): RX alto en downstream. No aplicar si RX es de interfaz upstream */
    if (rx != null && rx > 10 && indicioRed && !rxEsInterfazUpstream) {
      hallazgos.push({
        tipo: 'red',
        riesgo: 'Riesgo: Falla de Red (Nodo/Planta).',
        evidencia: 'El RX de ' + rx.toFixed(1) + ' dBmV está elevado y el puerto presenta alta utilización (' + (utilization != null ? utilization.toFixed(1) + '%' : '—') + '). Indicativo de desajuste de Nodo o amplificador.',
        accion: 'Reportar a mantenimiento de red. No enviar técnico a domicilio.'
      });
    }

    /* ALERTA MASIVA: RX > 20 dBmV downstream (no aplicar si es RX de interfaz upstream) */
    if (rx != null && rx > 20 && !rxEsInterfazUpstream && !hallazgos.some(function (h) { return h.tipo === 'red'; })) {
      hallazgos.push({
        tipo: 'red',
        riesgo: 'Riesgo: Desajuste de Nodo (RX downstream elevado).',
        evidencia: 'RX = ' + rx.toFixed(1) + ' dBmV. Saturación en downstream que afecta al nodo.',
        accion: 'Revisión de planta externa (Nodo/Amplificador).'
      });
    }

    /* FALLA TAP/ACOMETIDA (Individual): SNR bajo o Flaps altos, correcteds altos */
    var snrInestable = snrUp != null && snrUp >= 25 && snrUp < 31;
    var flapsAltos = flaps != null && flaps > 100;
    var flapsModerados = flaps != null && flaps > 50 && flaps <= 100;
    var correctedsAltos = correctables != null && correctables > 1e6;

    if (indicioIndividual && (snrInestable || flapsAltos || (flapsModerados && correctedsAltos))) {
      var parteEvidencia = [];
      if (snrInestable) parteEvidencia.push('SNR Up de ' + snrUp.toFixed(1) + ' dB');
      if (flapsAltos || flapsModerados) parteEvidencia.push(flaps + ' Flaps');
      if (correctedsAltos) {
        var corrStr = correctables >= 1e9 ? (correctables / 1e9).toFixed(1) + ' mil millones' : (correctables >= 1e6 ? (correctables / 1e6).toFixed(0) + ' millones' : correctables);
        parteEvidencia.push(corrStr + ' Correcteds');
      }
      var evidencia = 'El equipo presenta ' + parteEvidencia.join(' y ') + '.';
      if (interfaceId !== '—') evidencia += ' Puerto ' + interfaceId + ' con niveles estables en otros equipos.';
      evidencia += ' Los Correcteds indican que el ruido ingresa por este punto físico.';
      hallazgos.push({
        tipo: 'individual',
        riesgo: 'Riesgo: Inestabilidad Crítica en el TAP/Acometida.',
        evidencia: evidencia,
        accion: 'Revisar conector en poste (TAP) y estado del cable coaxial (Drop). Enviar técnico a domicilio.'
      });
    }

    /* SNR Up crítico (< 25 dB) – puede ser red o individual según contexto */
    if (snrUp != null && snrUp < 25) {
      if (indicioRed) {
        hallazgos.push({
          tipo: 'red',
          riesgo: 'Riesgo: SNR Up crítico en múltiples equipos del puerto.',
          evidencia: 'SNR Up = ' + snrUp.toFixed(1) + ' dB (< 25). Ruido de zona.',
          accion: 'Reportar a mantenimiento de red. Revisar upstream del nodo.'
        });
      } else {
        hallazgos.push({
          tipo: 'individual',
          riesgo: 'Riesgo: SNR Up crítico (ruido en upstream).',
          evidencia: 'SNR Up = ' + snrUp.toFixed(1) + ' dB. El ruido ingresa por este punto.',
          accion: 'Revisar acometida y conectores. Verificar splitter interno.'
        });
      }
    }

    /* TX alto (> 52) – exceso de atenuación */
    if (tx != null && tx > 52) {
      hallazgos.push({
        tipo: 'individual',
        riesgo: 'Riesgo: TX alto – exceso de atenuación.',
        evidencia: 'TX = ' + tx.toFixed(1) + ' dBmV (> 52). Demasiados splitters o drop largo.',
        accion: 'Agregar pad o ajustar tap. Revisar acometida.'
      });
    }

    /* TX bajo (< 35) */
    if (tx != null && tx < 35) {
      hallazgos.push({
        tipo: 'individual',
        riesgo: 'Riesgo: TX bajo – posible drop o mala conexión.',
        evidencia: 'TX = ' + tx.toFixed(1) + ' dBmV (< 35).',
        accion: 'Revisar acometida y conexión física.'
      });
    }

    /* Flaps > 50 sin contexto TAP ya cubierto */
    if (flaps != null && flaps > 50 && !hallazgos.some(function (h) { return h.evidencia && h.evidencia.indexOf('Flaps') >= 0; })) {
      var rngNote = rangingRetries != null && rangingRetries > 5 ? ' RngRetry alto (' + rangingRetries + ').' : '';
      hallazgos.push({
        tipo: 'individual',
        riesgo: 'Riesgo: Intermitencia detectada (falla física en contacto).',
        evidencia: 'Flaps = ' + flaps + '.' + rngNote,
        accion: 'Revisar conector en poste (TAP) y cable coaxial (Drop).'
      });
    }

    /* Migración de portadora: cliente con fallas aisladas respecto al puerto */
    var puertoSaturado = utilization != null && utilization >= 90;
    var clienteDegradado = (peakTx != null && peakTx > 52) || (tx != null && tx > 52) ||
      (flaps != null && flaps > 100) || errModem > 500;
    var puertoEstable = utilization != null && utilization < 70;
    var clienteConErroresPropios = errModem > 100 || (flaps != null && flaps > 100);

    if (puertoSaturado && clienteDegradado) {
      var parteM = [];
      if (peakTx != null && peakTx > 52) parteM.push('Peak TX ' + peakTx.toFixed(1) + ' dBmV');
      if (tx != null && tx > 52 && peakTx == null) parteM.push('TX ' + tx.toFixed(1) + ' dBmV');
      if (flaps != null && flaps > 100) parteM.push(flaps + ' Flaps');
      if (errModem > 500) parteM.push('CRC+HCS ' + errModem);
      var evM = 'Portadora con ' + (utilization != null ? utilization.toFixed(0) + '%' : '—') + ' de utilización';
      if (totalModems != null) evM += ', ' + totalModems + ' modems';
      evM += '. Cliente con ' + (parteM.length ? parteM.join(', ') : 'métricas degradadas') + '.';
      hallazgos.push({
        tipo: 'migracion',
        riesgo: 'Riesgo: Cliente con fallas en portadora saturada.',
        evidencia: evM,
        accion: 'Evaluar migración de portadora. Migrar a canal con menor utilización para aliviar carga y mejorar servicio al cliente.'
      });
    } else if (puertoEstable && clienteConErroresPropios && (totalModems == null || totalModems > 5)) {
      var parteE = [];
      if (errModem > 100) parteE.push('CRC+HCS ' + errModem);
      if (flaps != null && flaps > 100) parteE.push(flaps + ' Flaps');
      hallazgos.push({
        tipo: 'migracion',
        riesgo: 'Riesgo: Cliente con fallas aisladas en puerto estable.',
        evidencia: 'Puerto con ' + (utilization != null ? utilization.toFixed(0) + '%' : '—') + ' utilización. Cliente con ' + parteE.join(', ') + '.',
        accion: 'Evaluar migración de portadora para aislar cliente problemático y evitar impacto en otros.'
      });
    }

    return hallazgos;
  }

  function actualizarReporte(data) {
    const empty = $('#reporteEmpty');
    const content = $('#reporteContent');
    const riesgosEl = $('#reporteRiesgos');
    const resumenEl = $('#reporteResumen');

    if (!data || !data.ok) {
      if (empty) empty.hidden = false;
      if (content) content.hidden = true;
      actualizarOrdenTrabajo(null);
      return;
    }

    if (empty) empty.hidden = true;
    if (content) content.hidden = false;

    var hallazgos = generarHallazgos(data);
    if (riesgosEl) {
      if (hallazgos.length === 0) {
        riesgosEl.innerHTML = '';
      } else {
        riesgosEl.innerHTML = hallazgos.map(function (h) {
          var clase = h.tipo === 'red' ? ' noc-reporte-red' : (h.tipo === 'migracion' ? ' noc-reporte-migracion' : ' noc-reporte-individual');
          return '<div class="noc-reporte-hallazgo' + clase + '">' +
            '<div class="noc-reporte-riesgo-item">' + escapeHtml(h.riesgo) + '</div>' +
            '<div class="noc-reporte-evidencia"><strong>Evidencia:</strong> ' + escapeHtml(h.evidencia) + '</div>' +
            '<div class="noc-reporte-accion"><strong>Acción:</strong> ' + escapeHtml(h.accion) + '</div>' +
            '</div>';
        }).join('');
      }
    }

    let resumen = 'MAC: ' + (data.mac || '—') + ' | ';
    resumen += 'TX: ' + (data.tx != null ? data.tx + ' dBmV' : '—') + ' | ';
    if (data.peakTx != null) resumen += 'Peak TX: ' + data.peakTx + ' dBmV | ';
    resumen += 'RX: ' + (data.rx != null ? data.rx + ' dBmV' : '—') + ' | ';
    resumen += 'SNR Up: ' + (data.snrUp != null ? data.snrUp + ' dB' : '—') + ' | ';
    resumen += 'Flaps: ' + (data.flaps != null ? data.flaps : '—');
    if ((data.crcModem != null || data.hcsModem != null) && (data.crcModem || 0) + (data.hcsModem || 0) > 0) {
      resumen += ' | CRC: ' + (data.crcModem || 0) + ', HCS: ' + (data.hcsModem || 0);
    }
    if (resumenEl) resumenEl.innerHTML = '<strong>Resumen:</strong> ' + escapeHtml(resumen);

    if (typeof HfcTopologyView !== 'undefined') {
      var diag = HfcTopologyView.buildDiagnostico(data, { snrPuerto: data.snrUp, modemsOffline: 0 });
      actualizarOrdenTrabajo(diag);
    }
  }

  function actualizarOrdenTrabajo(diagnostico) {
    var wrap = $('#ordenTrabajoWrap');
    var masivaEl = $('#ordenTrabajoMasiva');
    var individualEl = $('#ordenTrabajoIndividual');
    if (!wrap) return;

    if (!diagnostico || typeof HfcTopologyView === 'undefined') {
      wrap.hidden = true;
      if (masivaEl) masivaEl.hidden = true;
      if (individualEl) individualEl.hidden = true;
      return;
    }

    var tipo = HfcTopologyView.getTipoFallo(diagnostico);
    if (tipo.masiva) {
      wrap.hidden = false;
      if (masivaEl) masivaEl.hidden = false;
      if (individualEl) individualEl.hidden = true;
    } else if (tipo.individual) {
      wrap.hidden = false;
      if (masivaEl) masivaEl.hidden = true;
      if (individualEl) individualEl.hidden = false;
    } else {
      wrap.hidden = true;
      if (masivaEl) masivaEl.hidden = true;
      if (individualEl) individualEl.hidden = true;
    }
  }

  /* ----- Export Reporte ----- */
  function exportarReporte() {
    const cmts = cmtsSeleccionado ? (cmtsSeleccionado.nombre + ' | ' + cmtsSeleccionado.ip + ' | ' + (cmtsSeleccionado.marca || '')) : 'No seleccionado';
    let text = '=== REPORTE PARA TÉCNICO - INTEGRA NOC ===\n\n';
    text += 'Fecha: ' + new Date().toLocaleString('es-CO') + '\n';
    text += 'CMTS/Nodo: ' + cmts + '\n\n';

    if (!datosParseados || !datosParseados.ok) {
      text += 'Sin datos parseados. Ejecute el parser primero.\n';
    } else {
      const d = datosParseados;
      text += '--- Métricas ---\n';
      text += 'MAC: ' + (d.mac || '—') + '\n';
      text += 'TX (dBmV): ' + (d.tx != null ? d.tx : '—') + '\n';
      text += 'RX (dBmV): ' + (d.rx != null ? d.rx : '—') + '\n';
      text += 'SNR Up (dB): ' + (d.snrUp != null ? d.snrUp : '—') + '\n';
      text += 'SNR Down (dB): ' + (d.snrDown != null ? d.snrDown : '—') + '\n';
      text += 'Flaps: ' + (d.flaps != null ? d.flaps : '—') + '\n';
      text += 'Corrected: ' + (d.correctables != null ? d.correctables : '—') + '\n';
      text += 'Uncorrectable: ' + (d.uncorrectables != null ? d.uncorrectables : '—') + '\n\n';

      var hallazgos = generarHallazgos(d);
      if (hallazgos.length) {
        text += '--- Hallazgos Automáticos ---\n';
        hallazgos.forEach(function (h) {
          text += '• ' + h.riesgo + '\n';
          text += '  Evidencia: ' + h.evidencia + '\n';
          text += '  Acción: ' + h.accion + '\n\n';
        });
      }
    }
    text += '=== FIN REPORTE ===';

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reporte_tecnico_' + new Date().toISOString().slice(0, 10) + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function generarOrdenTrabajo() {
    var cmts = cmtsSeleccionado ? (cmtsSeleccionado.nombre + ' | ' + cmtsSeleccionado.ip) : 'No seleccionado';
    var text = '=== ORDEN DE TRABAJO - FALLA MASIVA ===\n\n';
    text += 'Fecha: ' + new Date().toLocaleString('es-CO') + '\n';
    text += 'Tipo: Reportar a Mantenimiento de Red\n';
    text += 'CMTS/Nodo: ' + cmts + '\n\n';
    if (datosParseados && datosParseados.ok) {
      var d = datosParseados;
      text += '--- Datos del diagnóstico ---\n';
      text += 'MAC: ' + (d.mac || '—') + '\n';
      text += 'SNR Up: ' + (d.snrUp != null ? d.snrUp + ' dB' : '—') + '\n';
      text += 'Utilización: ' + (d.utilization != null ? d.utilization + '%' : '—') + '\n\n';
      var hallazgos = generarHallazgos(d);
      if (hallazgos.length) {
        text += '--- Hallazgos ---\n';
        hallazgos.forEach(function (h) {
          text += '• ' + h.riesgo + '\n  Evidencia: ' + h.evidencia + '\n  Acción: ' + h.accion + '\n\n';
        });
      }
    }
    text += 'Acción requerida: Revisión de infraestructura (NODO/TAP). No enviar técnicos a domicilio.\n';
    text += '=== FIN ORDEN DE TRABAJO ===';

    function copiarAlPortapapeles(t) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(t);
      }
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
      finally { document.body.removeChild(ta); }
    }
    copiarAlPortapapeles(text).then(function () {
      var status = document.getElementById('integraSaveStatus');
      if (status) {
        status.textContent = 'Orden de trabajo copiada al portapapeles';
        status.className = 'integra-save-status ok';
        status.style.display = '';
        setTimeout(function () { status.style.display = 'none'; }, 2500);
      }
    }).catch(function () {
      alert('No se pudo copiar. Intentando descarga...');
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'orden_trabajo_masiva_' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  /* ----- Eventos ----- */
  function onParsear() {
    const ta = $('#ingestaTextarea');
    const status = $('#parseStatus');
    if (!ta || !status) return;

    const raw = ta.value.trim();
    const result = parseOutput(raw);

    if (!result.ok) {
      status.textContent = result.error || 'Error al parsear';
      status.style.color = '#ef4444';
      datosParseados = null;
      if (typeof HfcTopologyView !== 'undefined') HfcTopologyView.renderEmpty($('#hfcTopologyContainer'));
      return;
    }

    datosParseados = result;
    status.textContent = 'Parseado correctamente. MAC: ' + (result.mac || '—');
    status.style.color = '#22c55e';

    actualizarGauges(result);
    actualizarChart(result.utilization);
    if (typeof HfcTopologyView !== 'undefined') {
      var diag = HfcTopologyView.buildDiagnostico(result, { snrPuerto: result.snrUp, modemsOffline: 0 });
      HfcTopologyView.render($('#hfcTopologyContainer'), diag);
    }
    actualizarReporte(result);
  }

  function init() {
    fetchInventario().then(function () {
      syncIpDesdeInput();
    });
    if (typeof HfcTopologyView !== 'undefined' && $('#hfcTopologyContainer')) {
      HfcTopologyView.renderEmpty($('#hfcTopologyContainer'));
    }

    const input = $('#cmtsSearch');
    const listbox = $('#cmtsDropdown');
    if (input) {
      input.addEventListener('input', function () {
        if (!input.value.trim()) {
          cmtsSeleccionado = null;
          const ctx = $('#cmtsContext');
          if (ctx) ctx.hidden = true;
          actualizarIpConexion('');
        } else {
          syncIpDesdeInput();
        }
        renderDropdown(input.value);
      });
      input.addEventListener('blur', function () { syncIpDesdeInput(); });
      input.addEventListener('focus', function () { renderDropdown(input.value); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') listbox.hidden = true;
        if (e.key === 'Enter') {
          const first = listbox && !listbox.hidden ? listbox.querySelector('.noc-dropdown-item') : null;
          if (first) { e.preventDefault(); seleccionarCmts(first); }
        }
      });
    }
    document.addEventListener('click', function (e) {
      if (listbox && !listbox.contains(e.target) && e.target !== $('#cmtsSearch')) {
        listbox.hidden = true;
      }
    });
    if (listbox) {
      listbox.addEventListener('click', function (e) {
        const item = e.target.closest('.noc-dropdown-item');
        if (item) seleccionarCmts(item);
      });
    }

    const btnParse = $('#btnParsear');
    if (btnParse) btnParse.addEventListener('click', onParsear);

    var btnReporte = $('#btnGenerarReporte');
    if (btnReporte) btnReporte.addEventListener('click', exportarReporte);

    var btnOrdenTrabajo = $('#btnOrdenTrabajo');
    if (btnOrdenTrabajo) btnOrdenTrabajo.addEventListener('click', generarOrdenTrabajo);

    /* Toggle minimizar/maximizar dashboard NOC (Registro, CMTS, Topología, etc.) */
    var toggleHeader = $('#nocRegistroToggleHeader');
    var toggleIcon = $('#nocRegistroToggleIcon');
    var collapsible = $('#nocDashboardCollapsible');
    if (toggleHeader && collapsible && toggleIcon) {
      toggleHeader.addEventListener('click', function () {
        var collapsed = collapsible.classList.toggle('collapsed');
        toggleIcon.textContent = collapsed ? '+' : '−';
        toggleHeader.setAttribute('aria-expanded', !collapsed);
      });
      toggleHeader.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHeader.click(); }
      });
    }

    /* Toggle campo LLS/OT cuando Hubo solución = NO */
    var huboSolucionRadios = $$('input[name="huboSolucion"]');
    var llsOtWrap = $('#nocRegistroLlsOtWrap');
    function toggleLlsOt() {
      var no = $('input[name="huboSolucion"][value="no"]');
      if (llsOtWrap && no && no.checked) {
        llsOtWrap.hidden = false;
      } else if (llsOtWrap) {
        llsOtWrap.hidden = true;
      }
    }
    huboSolucionRadios.forEach(function (r) {
      if (r) r.addEventListener('change', toggleLlsOt);
    });
    toggleLlsOt();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
