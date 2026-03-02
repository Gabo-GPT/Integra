/**
 * gauge.js - Componente Gauge reutilizable (estilo NOC)
 * Props: { value, label, severity, animate }
 * Sin dependencias globales. Recibe contenedor y props.
 */
(function (global) {
  'use strict';

  var CIRCLE = 2 * Math.PI * 45;
  var DUR = 1000;

  function colorFromValue(v, forceSeverity) {
    if (forceSeverity) return forceSeverity;
    if (v == null || v < 0) return 'muted';
    var gc, vMin = 80, aMin = 60;
    if (typeof ConfigQoE !== 'undefined' && ConfigQoE.getConfig) {
      gc = (ConfigQoE.getConfig().HEALTH_SCORES || {}).gaugeColors || {};
      if (gc.verde && gc.verde.min != null) vMin = gc.verde.min;
      if (gc.amarillo && gc.amarillo.min != null) aMin = gc.amarillo.min;
    }
    if (v >= vMin) return 'verde';
    if (v >= aMin) return 'amarillo';
    return 'rojo';
  }

  function estadoText(col) {
    if (col === 'verde') return 'ESTADO: ÓPTIMO';
    if (col === 'amarillo') return 'ESTADO: ADVERTENCIA';
    if (col === 'rojo') return 'ESTADO: CRÍTICO';
    return 'ESTADO: —';
  }

  function escapeH(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render(props) {
    var p = props || {};
    var id = p.id || 'g' + Date.now();
    var val = p.value;
    var label = p.label || '';
    var num = (val != null && !isNaN(val)) ? Math.round(Math.min(100, Math.max(0, val))) : null;
    var col = colorFromValue(num, p.forceSeverity);
    var sev = p.severity || 'normal';
    var dashLen = num != null ? (CIRCLE * num) / 100 : 0;
    var dashOff = CIRCLE - dashLen;

    return '<div class="qoe-gauge qoe-gauge-donut" data-gauge-id="' + escapeH(id) + '">' +
      (label ? '<div class="qoe-gauge-label">' + escapeH(label) + '</div>' : '') +
      '<div class="qoe-gauge-ring">' +
        '<svg viewBox="0 0 100 100" class="qoe-gauge-svg">' +
          '<circle class="qoe-gauge-bg" cx="50" cy="50" r="45" fill="none" stroke-width="2"/>' +
          '<circle class="qoe-gauge-fill qoe-gauge-' + col + (sev !== 'normal' ? ' qoe-gauge-sev-' + sev : '') + '" cx="50" cy="50" r="45" fill="none" stroke-width="2" stroke-dasharray="' + dashLen + ' ' + CIRCLE + '" stroke-dashoffset="0" transform="rotate(-90 50 50)" style="transition-duration:' + (p.animate !== false ? DUR + 'ms' : '0') + '"/>' +
        '</svg>' +
        '<div class="qoe-gauge-center">' +
          '<span class="qoe-gauge-num qoe-gauge-num-' + col + '">' + (num != null ? num : '—') + '</span>' +
          '<span class="qoe-gauge-pct">%</span>' +
        '</div>' +
      '</div>' +
      '<div class="qoe-gauge-estado qoe-gauge-estado-' + col + '">' + escapeH(estadoText(col)) + '</div>' +
    '</div>';
  }

  function update(container, id, props) {
    if (!container || !container.querySelector) return;
    var root = container.querySelector('[data-gauge-id="' + id + '"]');
    if (!root) return;
    var fill = root.querySelector('.qoe-gauge-fill');
    var numEl = root.querySelector('.qoe-gauge-num');
    var estadoEl = root.querySelector('.qoe-gauge-estado');
    if (!fill || !numEl) return;

    var p = props || {};
    var val = p.value;
    var num = (val != null && !isNaN(val)) ? Math.round(Math.min(100, Math.max(0, val))) : null;
    var dashLen = num != null ? (CIRCLE * num) / 100 : 0;
    var col = colorFromValue(num, p.forceSeverity);
    var sev = p.severity || 'normal';
    var animate = p.animate !== false;

    fill.style.transitionDuration = animate ? DUR + 'ms' : '0';
    fill.style.strokeDasharray = dashLen + ' ' + CIRCLE;
    numEl.textContent = num != null ? num : '—';

    numEl.classList.remove('qoe-gauge-num-verde', 'qoe-gauge-num-amarillo', 'qoe-gauge-num-rojo', 'qoe-gauge-num-muted');
    numEl.classList.add('qoe-gauge-num-' + col);
    fill.classList.remove('qoe-gauge-verde', 'qoe-gauge-amarillo', 'qoe-gauge-rojo', 'qoe-gauge-naranja', 'qoe-gauge-muted', 'qoe-gauge-sev-rf-pulse', 'qoe-gauge-sev-saturacion');
    fill.classList.add('qoe-gauge-' + col);
    if (sev !== 'normal') fill.classList.add('qoe-gauge-sev-' + sev);

    if (estadoEl) {
      estadoEl.textContent = estadoText(col);
      estadoEl.classList.remove('qoe-gauge-estado-verde', 'qoe-gauge-estado-amarillo', 'qoe-gauge-estado-rojo', 'qoe-gauge-estado-muted');
      estadoEl.classList.add('qoe-gauge-estado-' + col);
    }
  }

  var api = { render: render, update: update };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.GaugeQoE = api;
  }
})(typeof window !== 'undefined' ? window : this);
