/**
 * parser.js - Extracción de datos desde output CMTS Arris
 * Comandos soportados:
 *   - show cable modem <mac> verbose
 *   - show interface upstream <x> stat
 * Contrato: ParserOutput (modem, upstream, rawSources, parseErrors)
 */
(function (global) {
  'use strict';

  function addError(errors, source, field, message, recoverable) {
    errors.push({ source: source, field: field, message: message, recoverable: recoverable !== false });
  }

  function parseNumber(s) {
    if (s == null || typeof s !== 'string') return null;
    var t = s.trim().replace(/[^\d.,\-]/g, '').replace(',', '.');
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }

  function parseInteger(s) {
    if (s == null || typeof s !== 'string') return null;
    var t = s.replace(/\D/g, '');
    var n = parseInt(t, 10);
    return isNaN(n) ? null : n;
  }

  function parseModemOutput(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return { modem: null, errors: [] };
    }
    var errors = [];
    var mac = null;
    var macM = raw.match(/(?:MAC\s+Address|Hardware\s+Addr|mac)[\s:]+([a-fA-F0-9\.\-:]{12,17})/i);
    if (macM) mac = macM[1].trim();
    if (!mac) {
      macM = raw.match(/([a-fA-F0-9]{4}\.[a-fA-F0-9]{4}\.[a-fA-F0-9]{4})/);
      if (macM) mac = macM[1];
    }
    if (!mac) mac = '';

    var snr = null;
    var snrM = raw.match(/(?:Upstream\s+)?SNR[\s:]+([\d.,\-]+)|Signal[\s\/]Noise[\s:]+([\d.,\-]+)|SNR\s*\(dB\)[\s:]+([\d.,\-]+)/i);
    if (snrM) snr = parseNumber(snrM[1] || snrM[2] || snrM[3]);
    if (snr === null) {
      snrM = raw.match(/([\d.,\-]+)\s*dB\s*(?:SNR|upstream)/i);
      if (snrM) snr = parseNumber(snrM[1]);
    }
    if (snr === null) {
      snrM = raw.match(/USSNR\s*\(dB\)[\s\S]*?(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+[\d.,\-]+\s+([\d.,\-]+)/i);
      if (snrM) snr = parseNumber(snrM[2]);
    }
    if (snr === null) addError(errors, 'modem', 'snr', 'Campo SNR no encontrado o no numérico', true);

    var peakTransmitPower = null;
    var pwrM = raw.match(/Peak\s+Transmit\s+Power\s*\(dBmV\)\s*:\s*([\d.,\-]+)/i);
    if (!pwrM) pwrM = raw.match(/(?:Peak\s+)?(?:Transmit|Tx)\s*Power\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)|Peak\s+Power\s*(?:\(dBmV\))?\s*:?\s*([\d.,\-]+)/i);
    if (pwrM) peakTransmitPower = parseNumber(pwrM[1] || pwrM[2]);
    if (peakTransmitPower === null) {
      pwrM = raw.match(/Rec\s+Power\s*=\s*([\d.,\-]+)\s*dBmV/i);
      if (pwrM) peakTransmitPower = parseNumber(pwrM[1]);
    }
    if (peakTransmitPower === null) {
      pwrM = raw.match(/----- CMTS Measurements -----[\s\S]*?(\d+[\/\-]\d+[\/\-]\d+[\/\-]?\d*)[\s\-]+([\d.,\-]+)\s+[\d.,\-]+/i);
      if (pwrM) peakTransmitPower = parseNumber(pwrM[2]);
    }
    if (peakTransmitPower === null) addError(errors, 'modem', 'peakTransmitPower', 'Campo Peak Transmit Power no encontrado o no numérico', true);

    var unerroreds = null;
    var unerM = raw.match(/([\d\s,]+)\s+(?:Unerroreds?|Unerrored\s+codewords)\b/i);
    if (unerM) unerroreds = parseInteger(unerM[1]);
    if (unerroreds === null) {
      unerM = raw.match(/(?:Unerroreds?|Unerrored\s+codewords)[\s:]+([\d\s,]+)/i);
      if (unerM) unerroreds = parseInteger(unerM[1]);
    }
    if (unerroreds === null) addError(errors, 'modem', 'unerroreds', 'Campo Unerroreds no encontrado o no numérico', true);

    var correctables = null;
    var corrM = raw.match(/([\d\s,]+)\s+(?:Correctables?|Correcteds?|Correctable\s+codewords)\b/i);
    if (corrM) correctables = parseInteger(corrM[1]);
    if (correctables === null) {
      corrM = raw.match(/(?:Correctables?|Correcteds?|Correctable\s+codewords)[\s:]+([\d\s,]+)/i);
      if (corrM) correctables = parseInteger(corrM[1]);
    }
    if (correctables === null) addError(errors, 'modem', 'correctables', 'Campo Correctables no encontrado o no numérico', true);

    var uncorrectables = null;
    var uncorrM = raw.match(/([\d\s,]+)\s+(?:Uncorrectables?|Uncorrectable\s+codewords)\b/i);
    if (uncorrM) uncorrectables = parseInteger(uncorrM[1]);
    if (uncorrectables === null) {
      uncorrM = raw.match(/(?:Uncorrectables?|Uncorrectable\s+codewords)[\s:]+([\d\s,]+)/i);
      if (uncorrM) uncorrectables = parseInteger(uncorrM[1]);
    }
    if (uncorrectables === null) {
      uncorrM = raw.match(/CRC\s+HCS[\s\S]*?(\d+)\s+(\d+)\s+[a-fA-F0-9\.\-]+/i);
      if (uncorrM) { var crc = parseInteger(uncorrM[1]), hcs = parseInteger(uncorrM[2]); uncorrectables = (crc || 0) + (hcs || 0); }
    }
    if (uncorrectables === null) addError(errors, 'modem', 'uncorrectables', 'Campo Uncorrectables no encontrado o no numérico', true);

    var status = null;
    var statM = raw.match(/Status[\s:]+(\w+)/i);
    if (statM) status = statM[1].trim();
    if (!status) {
      statM = raw.match(/\bState\s*=\s*(\w+)/i);
      if (statM) status = statM[1].trim();
    }

    var modem = {
      mac: mac,
      snr: snr,
      peakTransmitPower: peakTransmitPower,
      unerroreds: unerroreds,
      correctables: correctables,
      uncorrectables: uncorrectables,
      status: status
    };

    return { modem: modem, errors: errors };
  }

  function parseUpstreamOutput(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return { upstream: null, errors: [] };
    }
    var errors = [];
    var interfaceId = '';
    var ifM = raw.match(/(?:Interface|Upstream)\s+([\w\s\/\-\.]+?)(?:\s|$|:)/i);
    if (ifM) interfaceId = ifM[1].trim();
    if (!interfaceId) {
      ifM = raw.match(/(Upstream\s+\d+\/\d+)/i);
      if (ifM) interfaceId = ifM[1];
    }
    if (!interfaceId) {
      ifM = raw.match(/cable-upstream\s+(\d+\/\d+\/\d+)/i);
      if (ifM) interfaceId = 'cable-upstream ' + ifM[1];
    }
    if (!interfaceId) {
      ifM = raw.match(/US\s+(\d+\/\d+\/\d+)/i);
      if (ifM) interfaceId = 'Upstream ' + ifM[1];
    }
    if (!interfaceId) interfaceId = '';

    var avgChannelUtilization = null;
    var utilM = raw.match(/(?:Avg\.?\s*)?(?:upstream\s+)?(?:channel\s+)?utilization[\s:]+([\d.,]+)\s*%?/i);
    if (utilM) avgChannelUtilization = parseNumber(utilM[1]);
    if (avgChannelUtilization === null) {
      utilM = raw.match(/(?:Channel\s+Utilization|Utilization)[\s:]+([\d.,]+)/i);
      if (utilM) avgChannelUtilization = parseNumber(utilM[1]);
    }
    if (avgChannelUtilization === null) addError(errors, 'upstream', 'avgChannelUtilization', 'Campo Avg upstream channel utilization no encontrado o no numérico', true);

    var totalModemsOnChannel = null;
    var modM = raw.match(/Total\s+Modems?\s+On\s+This\s+(?:Upstream\s+)?Channel\s*:\s*(\d+)/i);
    if (modM) totalModemsOnChannel = parseInt(modM[1], 10);
    if (totalModemsOnChannel === null) {
      modM = raw.match(/(?:Total\s+)?(?:modems?|CMs?)\s+(?:on\s+this\s+(?:upstream\s+)?channel|online|on\s+channel)[\s:]+([\d\s,]+)/i);
      if (modM) totalModemsOnChannel = parseInteger(modM[1]);
    }
    if (totalModemsOnChannel === null) {
      modM = raw.match(/(?:Number\s+of\s+)?(?:modems?|CMs?|CPE)[\s:]+([\d\s,]+)/i);
      if (modM) totalModemsOnChannel = parseInteger(modM[1]);
    }
    if (totalModemsOnChannel === null) addError(errors, 'upstream', 'totalModemsOnChannel', 'Campo Total Modems On This Upstream Channel no encontrado o no numérico', true);

    var channelId = null;
    var chM = raw.match(/(?:Channel\s+ID|Channel\s+Id)[\s:]+([\w\-\.]+)/i);
    if (chM) channelId = chM[1].trim();

    var avgPercentContentionSlots = null;
    var contM = raw.match(/(?:Avg\.?\s*)?(?:percent\s+)?contention\s+slots[\s:]+([\d.,]+)\s*%?/i);
    if (contM) avgPercentContentionSlots = parseNumber(contM[1]);

    /* FEC del canal (Logical-channel 0): "94689937553 Unerroreds, 5090310830 Correcteds, 31651007 Uncorrectables" */
    var unerroreds = null, correctables = null, uncorrectables = null;
    var fecLine = raw.match(/([\d\s,]+)\s+Unerroreds?,\s*([\d\s,]+)\s+Correcteds?,\s*([\d\s,]+)\s+Uncorrectables?/i);
    if (fecLine) {
      unerroreds = parseInteger(fecLine[1]);
      correctables = parseInteger(fecLine[2]);
      uncorrectables = parseInteger(fecLine[3]);
    }

    var upstream = {
      interfaceId: interfaceId,
      avgChannelUtilization: avgChannelUtilization,
      totalModemsOnChannel: totalModemsOnChannel,
      avgPercentContentionSlots: avgPercentContentionSlots,
      channelId: channelId,
      unerroreds: unerroreds,
      correctables: correctables,
      uncorrectables: uncorrectables
    };

    return { upstream: upstream, errors: errors };
  }

  /**
   * Parsea el output del CMTS y devuelve ParserOutput.
   * @param {Object} options
   * @param {string} [options.modemOutput] - Output de "show cable modem <mac> verbose"
   * @param {string} [options.upstreamOutput] - Output de "show interface upstream <x> stat"
   * @param {string} [options.modemCommand] - Comando ejecutado (opcional)
   * @param {string} [options.upstreamCommand] - Comando ejecutado (opcional)
   * @returns {ParserOutput}
   */
  function parseCmtsOutput(options) {
    var opts = options || {};
    var modemOutput = opts.modemOutput;
    var upstreamOutput = opts.upstreamOutput;
    var modemCommand = opts.modemCommand || null;
    var upstreamCommand = opts.upstreamCommand || null;

    var rawSources = {
      modemCommand: modemCommand,
      modemOutput: typeof modemOutput === 'string' ? modemOutput : null,
      upstreamCommand: upstreamCommand,
      upstreamOutput: typeof upstreamOutput === 'string' ? upstreamOutput : null
    };

    var parseErrors = [];
    var modem = null;
    var upstream = null;

    if (modemOutput) {
      var modRes = parseModemOutput(modemOutput);
      modem = modRes.modem;
      parseErrors = parseErrors.concat(modRes.errors);
    }

    if (upstreamOutput) {
      var upRes = parseUpstreamOutput(upstreamOutput);
      upstream = upRes.upstream;
      parseErrors = parseErrors.concat(upRes.errors);
      /* Usar FEC del canal upstream como fallback cuando modem no tiene (show cable modem verbose no incluye FEC en Arris) */
      if (modem && upstream) {
        if (modem.unerroreds == null && upstream.unerroreds != null) modem.unerroreds = upstream.unerroreds;
        if (modem.correctables == null && upstream.correctables != null) modem.correctables = upstream.correctables;
        if (modem.uncorrectables == null && upstream.uncorrectables != null) modem.uncorrectables = upstream.uncorrectables;
        /* Quitar advertencias de FEC si las obtuvimos del upstream */
        if (upstream.unerroreds != null || upstream.correctables != null || upstream.uncorrectables != null) {
          parseErrors = parseErrors.filter(function (e) {
            return e.field !== 'unerroreds' && e.field !== 'correctables' && e.field !== 'uncorrectables';
          });
        }
      }
    }

    if (!modemOutput && !upstreamOutput) {
      addError(parseErrors, 'modem', 'input', 'No se proporcionó output de modem ni upstream', false);
    }

    return {
      modem: modem,
      upstream: upstream,
      rawSources: rawSources,
      parseErrors: parseErrors
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseCmtsOutput: parseCmtsOutput };
  } else {
    global.ParserQoE = { parseCmtsOutput: parseCmtsOutput };
  }
})(typeof window !== 'undefined' ? window : this);
