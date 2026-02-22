/**
 * gauge.js - Componente Gauge reutilizable (estilo NOC)
 * Props: { value, label, severity, animate }
 * Sin dependencias globales. Recibe contenedor y props.
 */
(function (global) {
  'use strict';

  var ARC = 157;
  var DUR = 1000;

  function colorFromValue(v) {
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
    var off = num != null ? ARC - (ARC * num) / 100 : ARC;
    var col = colorFromValue(num);
    var sev = p.severity || 'normal';

    return '<div class="qoe-gauge" data-gauge-id="' + escapeH(id) + '">' +
      (label ? '<div class="qoe-gauge-label">' + escapeH(label) + '</div>' : '') +
      '<div class="qoe-gauge-arc">' +
        '<svg viewBox="0 0 120 70" class="qoe-gauge-svg">' +
          '<path class="qoe-gauge-bg" d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke-width="8"/>' +
          '<path class="qoe-gauge-fill qoe-gauge-' + col + (sev !== 'normal' ? ' qoe-gauge-sev-' + sev : '') + '" d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke-width="8" stroke-dasharray="' + ARC + '" stroke-dashoffset="' + off + '" style="transition-duration:' + (p.animate !== false ? DUR + 'ms' : '0') + '"/>' +
          '<text x="60" y="52" class="qoe-gauge-num" text-anchor="middle">' + (num != null ? num : '—') + '</text>' +
          '<text x="60" y="64" class="qoe-gauge-pct" text-anchor="middle">%</text>' +
        '</svg>' +
      '</div>' +
    '</div>';
  }

  function update(container, id, props) {
    if (!container || !container.querySelector) return;
    var root = container.querySelector('[data-gauge-id="' + id + '"]');
    if (!root) return;
    var fill = root.querySelector('.qoe-gauge-fill');
    var numEl = root.querySelector('.qoe-gauge-num');
    if (!fill || !numEl) return;

    var p = props || {};
    var val = p.value;
    var num = (val != null && !isNaN(val)) ? Math.round(Math.min(100, Math.max(0, val))) : null;
    var off = num != null ? ARC - (ARC * num) / 100 : ARC;
    var col = colorFromValue(num);
    var sev = p.severity || 'normal';
    var animate = p.animate !== false;

    fill.style.transitionDuration = animate ? DUR + 'ms' : '0';
    fill.style.strokeDashoffset = String(off);
    numEl.textContent = num != null ? num : '—';

    fill.classList.remove('qoe-gauge-verde', 'qoe-gauge-amarillo', 'qoe-gauge-rojo', 'qoe-gauge-muted', 'qoe-gauge-sev-rf-pulse', 'qoe-gauge-sev-saturacion');
    fill.classList.add('qoe-gauge-' + col);
    if (sev !== 'normal') fill.classList.add('qoe-gauge-sev-' + sev);
  }

  var api = { render: render, update: update };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.GaugeQoE = api;
  }
})(typeof window !== 'undefined' ? window : this);
