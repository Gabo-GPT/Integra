/**
 * interpretacion.js - Traduce scores técnicos a lenguaje claro para agentes
 * Sin dBmV ni porcentajes. Comprensible para primer nivel.
 */
(function (global) {
  'use strict';

  function cfg() {
    return (typeof ConfigQoE !== 'undefined' && ConfigQoE.getConfig) ? ConfigQoE.getConfig() : {};
  }

  function generateInterpretacion(scores, diag) {
    var ic = (cfg().INTERPRETACION || {});
    var umbral = ic.umbralRiesgo != null ? ic.umbralRiesgo : 60;
    var umbralCrit = ic.umbralCritico != null ? ic.umbralCritico : 40;
    var visitRec = ic.visitRecomendar != null ? ic.visitRecomendar : 70;
    var visitMon = ic.visitMonitorizar || { min: 40, max: 70 };

    var modemH = scores && scores.modemHealth != null ? scores.modemHealth : null;
    var carrierH = scores && scores.carrierHealth != null ? scores.carrierHealth : null;
    var visitP = diag && diag.visitProbability != null ? diag.visitProbability : null;
    var cls = diag && diag.classification ? diag.classification : '';
    var confianza = diag && diag.confidence != null ? Math.round(diag.confidence * 100) : null;
    var esMasivo = diag && diag.esMasivo === true;
    var visitabloqueada = diag && diag.visitabloqueada === true;

    var estado, severidad, impacto, causa, accion, resumenRapido, problemaIndividual;

    if (modemH == null && carrierH == null && !cls && !esMasivo) {
      return {
        estado: '—',
        severidad: 'neutral',
        impactoCliente: 'Analiza para obtener interpretación.',
        origenProbable: '—',
        accionAgente: '—',
        resumenRapido: '—',
        confianza: null,
        problemaIndividual: false
      };
    }

    if (esMasivo || visitabloqueada) {
      return {
        estado: 'Afectación masiva',
        severidad: 'rojo',
        impactoCliente: 'Problema en canal upstream compartido. Varios clientes afectados.',
        origenProbable: 'Infraestructura compartida, NO cliente individual. Problema en canal upstream.',
        accionAgente: 'Escalar a Planta Exterior - Problema de Nodo. Acciones individuales bloqueadas. Revisar health de portadora upstream en CMTS, migrar modems si hay redundancia.',
        resumenRapido: 'Afectación masiva. Escalar a Planta Exterior. No programar visitas hasta descartar problema compartido.',
        confianza: confianza,
        problemaIndividual: false
      };
    }

    var modemBajo = modemH != null && modemH < umbral;
    var modemCritico = modemH != null && modemH < umbralCrit;
    var carrierBajo = carrierH != null && carrierH < umbral;
    var carrierCritico = carrierH != null && carrierH < umbralCrit;
    var carrierBueno = carrierH != null && carrierH > 75;
    var visitAlta = visitP != null && visitP > visitRec;
    var visitMedia = visitP != null && visitP >= (visitMon.min || 40) && visitP <= (visitMon.max || 70);
    var visitBaja = visitP != null && visitP < (visitMon.min || 40);

    problemaIndividual = carrierBueno && modemBajo;

    if (modemCritico || carrierCritico || visitAlta) {
      estado = 'Riesgo alto';
      severidad = 'rojo';
    } else if (modemBajo || carrierBajo || visitMedia) {
      estado = 'Riesgo moderado';
      severidad = 'amarillo';
    } else if (modemH != null && modemH >= umbral && carrierH != null && carrierH >= umbral && visitBaja) {
      estado = 'Excelente';
      severidad = 'verde';
    } else {
      estado = 'Estable';
      severidad = 'verde';
    }

    if (cls === 'SATURACION') {
      impacto = 'La red está cargada. El cliente puede experimentar lentitud.';
      causa = 'Saturación del canal de subida.';
      resumenRapido = 'La red va cargada. No es culpa del cliente.';
    } else if (cls === 'RF_CLIENTE') {
      impacto = 'Puede experimentar lentitud o cortes en la subida.';
      causa = 'Problema en la instalación: potencia de subida elevada o señal débil.';
      resumenRapido = 'La instalación del cliente tiene un problema.';
    } else if (cls === 'INTERMITENTE') {
      impacto = 'Puede notar cortes o inestabilidad intermitente.';
      causa = 'Ruido intermitente o interferencia en la línea.';
      resumenRapido = 'Puede haber ruido o interferencia.';
    } else if (carrierBajo) {
      impacto = 'Puede experimentar lentitud por carga elevada de la red.';
      causa = 'Carga elevada del canal.';
      resumenRapido = 'La red va cargada. Varios clientes pueden verse afectados.';
    } else if (modemBajo) {
      impacto = 'Puede experimentar lentitud o cortes en la subida.';
      causa = 'Posible exceso de atenuación, conectores en mal estado o splitter excesivo.';
      resumenRapido = problemaIndividual ? 'El problema es solo de este cliente. La red está bien.' : 'Revisar la instalación del cliente.';
    } else if (estado === 'Excelente' || estado === 'Estable') {
      impacto = 'Servicio normal.';
      causa = 'Instalación y red en buen estado.';
      resumenRapido = 'Todo en orden.';
    } else {
      impacto = 'Situación a vigilar.';
      causa = 'Revisar si hay quejas del cliente.';
      resumenRapido = 'Vigilar. Sin acciones por ahora.';
    }

    if (visitAlta) {
      accion = 'Programar visita técnica. Escalar si el cliente reporta cortes o lentitud persistente.';
    } else if (visitMedia) {
      accion = 'Monitorizar. Escalar a soporte técnico solo si el cliente reporta quejas (lentitud, cortes). No programar visita sin queja.';
    } else if (modemBajo && visitP != null && visitP > 50) {
      accion = 'Escalar a soporte técnico si hay queja. Programar visita si los problemas persisten más de 24 horas.';
    } else if (visitBaja && !modemBajo && !carrierBajo) {
      accion = 'No acción. No escalar.';
    } else if (modemBajo || carrierBajo) {
      accion = 'Monitorizar. Escalar únicamente si el cliente reporta problemas.';
    } else {
      accion = 'No acción. No escalar.';
    }

    if (problemaIndividual) {
      causa = 'Problema individual del cliente. La red está bien. Posible exceso de atenuación, conectores en mal estado o splitter excesivo.';
    }

    return {
      estado: estado,
      severidad: severidad,
      impactoCliente: impacto,
      origenProbable: causa,
      accionAgente: accion,
      resumenRapido: resumenRapido,
      confianza: confianza,
      problemaIndividual: problemaIndividual
    };
  }

  var api = { generateInterpretacion: generateInterpretacion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.InterpretacionQoE = api;
})(typeof window !== 'undefined' ? window : this);
