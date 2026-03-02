/**
 * vendorCommands.js - Diccionario de comandos por marca CMTS
 * Biblia de lógica: Arista, Harmonic, Cisco, Arris, CASA Systems
 * Variaciones de comandos para modem, flaps, uptime, upstream, errores
 */
(function (global) {
  'use strict';

  var VENDOR_COMMANDS = {
    ARISTA: {
      id: 'ARISTA',
      name: 'Arista',
      modem: {
        verbose: ['show cable modem <mac> verbose', 'show cable modem <mac> detail'],
        flap: ['show cable modem <mac> flap', 'show cable flap-list <mac>'],
        uptime: ['show cable modem <mac> uptime', 'show cable modem <mac> verbose'],
        errors: ['show cable modem <mac> verbose', 'show cable modem <mac> errors']
      },
      upstream: ['show interface cable-upstream <int>', 'show interface upstream <int> stat', 'show interface cable <int>']
    },
    HARMONIC: {
      id: 'HARMONIC',
      name: 'Harmonic',
      modem: {
        verbose: ['show cable modem <mac> verbose', 'show cable modem <mac> detail'],
        flap: ['show cable modem <mac> flap', 'show cable flap-list <mac>'],
        uptime: ['show cable modem <mac> verbose'],
        errors: ['show cable modem <mac> verbose']
      },
      upstream: ['show interface cable <int>', 'show upstream <int>', 'show interface cable-upstream <int>']
    },
    CISCO: {
      id: 'CISCO',
      name: 'Cisco',
      modem: {
        verbose: ['show cable modem <mac> verbose', 'show cable modem <mac> detailed'],
        flap: ['show cable modem <mac> flap', 'show cable flap-list <mac>'],
        uptime: ['show cable modem <mac> uptime', 'show cable modem <mac> verbose'],
        errors: ['show cable modem <mac> verbose', 'show cable modem <mac> errors']
      },
      upstream: ['show interface cable <slot>/<port> upstream <us>', 'show interface Cable <slot>/<port>/<us>', 'show interface upstream <int> stat']
    },
    ARRIS: {
      id: 'ARRIS',
      name: 'Arris',
      modem: {
        verbose: ['show cable modem <mac> ver', 'show cable modem <mac> verbose'],
        flap: ['show cable modem <mac> flap', 'show cable flap-list <mac>'],
        uptime: ['show cable modem <mac> ver', 'show cable modem <mac> uptime'],
        errors: ['show cable modem <mac> errors', 'show cable modem <mac> ver']
      },
      upstream: ['show interface cable-upstream <int>', 'show interface upstream <int> stat', 'show interface cable-upstream <int> counts']
    },
    CASA: {
      id: 'CASA',
      name: 'CASA Systems',
      modem: {
        verbose: ['show cable modem <mac> verbose'],
        flap: ['show cable flap-list <mac>'],
        uptime: ['show cable modem <mac> verbose'],
        errors: ['show cable modem <mac> verbose', 'show cable modem <mac> errors']
      },
      upstream: ['show interface cable <slot>/<port> upstream <us>', 'show interface upstream <int>', 'show interface cable <int>']
    }
  };

  function detectVendor(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var t = raw.toUpperCase();
    if (/ARISTA|ARISTA\s*EOS|CCAP\s*ARISTA/i.test(t)) return VENDOR_COMMANDS.ARISTA;
    if (/HARMONIC|CABLEOS|NEXUS/i.test(t)) return VENDOR_COMMANDS.HARMONIC;
    if (/CISCO|CBR|UBR|IOS\s*XE|show\s+cable\s+modem\s+detailed/i.test(t)) return VENDOR_COMMANDS.CISCO;
    if (/ARRIS|ARRIE6|E6000|CBR-8|CHORUS|BOGO-[A-Z]+-H-\d+-ARRIE6|CS100G/i.test(t)) return VENDOR_COMMANDS.ARRIS;
    if (/CASA|C4|C10|SYSTEM\s*3200|CMTS\s*CASA|show\s+cable\s+flap-list/i.test(t)) return VENDOR_COMMANDS.CASA;
    return null;
  }

  function getCommandsForVendor(vendor) {
    if (!vendor || !VENDOR_COMMANDS[vendor.id]) return null;
    return VENDOR_COMMANDS[vendor.id];
  }

  function getRecommendedCommands(vendor, mac) {
    var cmds = getCommandsForVendor(vendor);
    if (!cmds) return [];
    var macStr = mac || '<mac>';
    var out = [];
    if (cmds.modem) {
      if (cmds.modem.verbose && cmds.modem.verbose[0])
        out.push({ label: 'Modem verbose', cmd: cmds.modem.verbose[0].replace(/<mac>/g, macStr) });
      if (cmds.modem.flap && cmds.modem.flap[0])
        out.push({ label: 'Flaps', cmd: cmds.modem.flap[0].replace(/<mac>/g, macStr) });
      if (cmds.modem.uptime && cmds.modem.uptime[0])
        out.push({ label: 'Uptime', cmd: cmds.modem.uptime[0].replace(/<mac>/g, macStr) });
      if (cmds.modem.errors && cmds.modem.errors[0])
        out.push({ label: 'Errores (CRC/FEC)', cmd: cmds.modem.errors[0].replace(/<mac>/g, macStr) });
    }
    if (cmds.upstream && cmds.upstream[0])
      out.push({ label: 'Upstream', cmd: cmds.upstream[0].replace(/<int>/g, '<x>').replace(/<slot>\/<port>/g, '<slot>/<port>') });
    return out;
  }

  var api = {
    VENDOR_COMMANDS: VENDOR_COMMANDS,
    detectVendor: detectVendor,
    getCommandsForVendor: getCommandsForVendor,
    getRecommendedCommands: getRecommendedCommands
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VendorCommandsQoE = api;
})(typeof window !== 'undefined' ? window : this);
