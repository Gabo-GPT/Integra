/**
 * config.js - Rangos operativos NOC DOCSIS
 * Estructura: OPTIMO | LIMITE | CRITICO
 * Sin lógica, solo datos. Modificar valores sin tocar código.
 */
(function (global) {
  'use strict';

  var CONFIG = {
    /* TX Upstream Power (Peak Transmit Power) - dBmV */
    TX_UPSTREAM: {
      OPTIMO: { min: 35, max: 49 },
      LIMITE: { min: 50, max: 52 },
      CRITICO: { min: 35, max: 52 }
    },
    /* SNR Upstream - dB */
    SNR_UPSTREAM: {
      OPTIMO: { min: 31 },
      LIMITE: { min: 25, max: 30 },
      CRITICO: { max: 24 }
    },
    /* RX Downstream - dBmV */
    RX_DOWNSTREAM: {
      OPTIMO: { min: -7, max: 7 },
      LIMITE: [{ min: -10, max: -8 }, { min: 8, max: 10 }],
      CRITICO: { min: -10, max: 10 }
    },
    /* SNR Downstream - dB */
    SNR_DOWNSTREAM: {
      OPTIMO: { min: 33 },
      LIMITE: { min: 30, max: 32 },
      CRITICO: { max: 29 }
    },
    /* Reglas de clasificación (referencian rangos arriba) */
    SATURACION: {
      utilizationMin: 75,
      modemsMin: 25,
      snrMinToExcludeRf: 28,
      powerMin: 35,
      powerMax: 52
    },
    INTERMITENTE: {
      correctablesMin: 50,
      uncorrectablesMin: 5,
      snrLimiteMin: 25,
      snrLimiteMax: 30
    },
    RF_CLIENTE: {
      snrCriticoMax: 25,
      powerCriticoMin: 35,
      powerCriticoMax: 52
    },
    UTILIZACION: {
      OK_MAX: 75
    },
    /* Probabilidad de Visita Técnica - Sistema de puntuación ponderado 0-100 */
    /* Salud del Cable Modem y de la Portadora - scoring 0-100 */
    HEALTH_SCORES: {
      /* Pesos para modem (suman 1) */
      modemWeights: {
        snrUpstream: 0.40,
        txUpstream: 0.35,
        fecErrors: 0.25
      },
      /* Reglas SNR Upstream - dB */
      modemSnr: {
        optimo: { min: 31, points: 100 },
        limite: { min: 25, max: 30, pointsMin: 70, pointsMax: 90 },
        critico: { max: 24, pointsMax: 50 }
      },
      /* Reglas TX Upstream - dBmV */
      modemTx: {
        optimo: { min: 35, max: 49, points: 100 },
        limite: { min: 50, max: 52, points: 80 },
        critico: { aboveMax: 52, belowMin: 35, pointsMax: 60 }
      },
      /* Reglas Errores FEC - resta puntos */
      modemFec: {
        bajo: { uncorrectablesMax: 5, correctablesMax: 100, penalizacion: 0 },
        medio: { uncorrectablesMax: 10, correctablesMax: 500, penalizacion: 15 },
        alto: { penalizacion: 30 }
      },
      /* Pesos para portadora (suman 1) */
      carrierWeights: {
        utilization: 0.50,
        totalModems: 0.25,
        contentionSlots: 0.25
      },
      /* Reglas Avg Channel Utilization - % */
      carrierUtilization: {
        optimo: { max: 65, pointsMin: 92 },
        medio: { min: 65, max: 80, pointsMin: 70, pointsMax: 85 },
        critico: { min: 80, pointsMax: 60 }
      },
      /* Reglas Total Modems (menos = mejor contexto; umbrales orientativos) */
      carrierModems: {
        optimo: { max: 20, points: 100 },
        medio: { min: 20, max: 40, pointsMin: 80, pointsMax: 95 },
        critico: { min: 40, pointsMax: 70 }
      },
      /* Reglas Percent Contention Slots - % */
      carrierContention: {
        optimo: { max: 50, points: 100 },
        medio: { min: 50, max: 80, pointsMin: 70, pointsMax: 90 },
        critico: { min: 80, pointsMax: 50 }
      },
      /* Umbrales de color para gauges */
      gaugeColors: {
        verde: { min: 80, max: 100 },
        amarillo: { min: 60, max: 79 },
        rojo: { max: 59 }
      }
    },
    VISIT_PROBABILITY: {
      /* Pesos normalizados (suman 1) */
      weights: {
        snrUpstream: 0.30,
        txUpstream: 0.25,
        fecErrors: 0.25,
        saturacion: 0.10,
        codigo: 0.05,
        memoriaRam: 0.05
      },
      /* SNR Upstream - dB */
      snrUpstream: {
        high: { max: 25, points: 100 },
        medium: { min: 25, max: 28, points: 60 },
        low: { min: 30, points: 0 }
      },
      /* TX Upstream - dBmV */
      txUpstream: {
        high: { outsideMin: 35, outsideMax: 52, points: 100 },
        medium: { min: 50, max: 52, points: 50 },
        low: { min: 35, max: 49, points: 0 }
      },
      /* Errores FEC */
      fecErrors: {
        high: { uncorrectablesMin: 10, points: 100 },
        medium: { correctablesMin: 100, points: 50 },
        low: { points: 0 }
      },
      /* Código/ firmware (si parser expone modem.codigoError) */
      codigo: {
        high: { minCode: 1, points: 80 }
      },
      /* Memoria RAM modem (si parser expone modem.memoriaRamPct) */
      memoriaRam: {
        high: { minPct: 90, points: 100 },
        medium: { minPct: 75, points: 50 }
      },
      /* Modificadores aplicados al score base (acumulativos) */
      modifiers: {
        saturacionReduction: 35,
        greyZoneHighErrors: 25,
        greyZoneLowErrors: -20
      },
      /* Umbrales para recomendación final */
      recommendation: {
        noVisita: { max: 40 },
        monitorizar: { min: 40, max: 70 },
        recomendarVisita: { min: 70 }
      }
    },
    /* Interpretación automática para agentes no técnicos */
    INTERPRETACION: {
      umbralRiesgo: 60,
      umbralCritico: 40,
      visitMonitorizar: { min: 40, max: 70 },
      visitRecomendar: 70
    }
  };

  function getConfig() {
    return CONFIG;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getConfig: getConfig, CONFIG: CONFIG };
  } else {
    global.ConfigQoE = { getConfig: getConfig, CONFIG: CONFIG };
  }
})(typeof window !== 'undefined' ? window : this);
