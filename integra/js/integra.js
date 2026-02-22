/* Integra - Dashboard ligero */
(function () {
  'use strict';

  var STORAGE = 'integra_data';
  var _nav, _sections, _dataCache, _saveTimer, _lastSavedJson;
  var MAX_EL_CACHE = 4;
  var _elCount = 0;
  var SECTION_TITLES = { dashboard: 'Inicio', gestion: 'Mi Gestión', 'tablero-mensual': 'Tablero Mensual', formacion: 'Formación', calidad: 'Matriz de Calidad', bolsa: 'Bolsa', 'bolsa-hfc': 'Bolsa HFC', agentes: 'Agentes', perfil: 'Perfil' };
  var VALID_HASH_ADMIN = ['dashboard', 'formacion', 'calidad', 'bolsa', 'bolsa-hfc', 'agentes', 'perfil', 'gestion', 'tablero-mensual'];
  var VALID_HASH_USER = ['dashboard', 'gestion', 'tablero-mensual', 'formacion'];
  var GESTION_FORM_IDS = ['gestionNombre','gestionNumero','gestionNit','gestionAliado','gestionFuncion','gestionImot','gestionTransferencia','gestionCliente','gestionPqr','gestionCausa','gestionSolucion','gestionRed','gestionNodo','gestionCpe','gestionAreaTransferir','gestionExtensiones'];
  var PRETURNOS_DEFAULT = [{ skill: 'EMP GESTION INMEDIATA', programados: 7, asistencia: 86, promedio: 100 },{ skill: 'EMP GESTION INCIDENTES CSI', programados: 19, asistencia: 93, promedio: 99 },{ skill: 'EMP GESTION INCIDENTES IRE', programados: 6, asistencia: 100, promedio: 100 }];
  var STAFF_DEFAULT = [{ skill: 'Analista de entrenamiento 2', programados: 1, asistencia: 100, promedio: 100 },{ skill: 'Supervisor', programados: 3, asistencia: 78, promedio: 100 }];
  var EXCEL_COLS = ['Nombre t\u00e9cnico','N\u00famero','Enlace','Aliado','Funci\u00f3n','IM/OT','Transferencia','\u00c1rea transferir','Extensiones','Cliente','PQR','Causa falla','Soluci\u00f3n','Red acceso','Nodo','CPE','Fecha/Hora','Duraci\u00f3n'];
  var EXCEL_KEYS = ['nombre','numero','nit','aliado','funcion','imot','transferencia','areaTransferir','extensiones','cliente','pqr','causa','solucion','redAcceso','nodo','cpe','fechaHora','duracion'];

  var _el = {};
  function $(id) {
    var c = _el[id];
    if (c !== undefined) return c;
    if (_elCount >= MAX_EL_CACHE) { _el = {}; _elCount = 0; }
    c = document.getElementById(id);
    if (c) { _el[id] = c; _elCount++; }
    return c || null;
  }
  function clearElCache() { _el = {}; _elCount = 0; }
  function qs(s, r) { return (r || document).querySelector(s); }
  function qsAll(s, r) { return (r || document).querySelectorAll(s); }

  function getData() {
    if (_dataCache) return _dataCache;
    try {
      var raw = localStorage.getItem(STORAGE);
      _dataCache = raw ? JSON.parse(raw) : {};
      _lastSavedJson = raw || '{}';
    } catch (e) { _dataCache = {}; _lastSavedJson = '{}'; }
    return _dataCache;
  }

  function saveData(key, val) {
    var d = getData();
    d[key] = val;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () { _saveTimer = 0; _persistToStorage(); }, 400);
  }

  var MAX_STORAGE_BYTES = 4 * 1024 * 1024;
  function _persistToStorage() {
    try {
      var json = JSON.stringify(getData());
      if (json !== _lastSavedJson && json.length <= MAX_STORAGE_BYTES) {
        localStorage.setItem(STORAGE, json);
        _lastSavedJson = json;
      }
    } catch (e) {}
  }
  function flushSave() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = 0; }
    _persistToStorage();
  }

  var _adminCache = null;
  function isAdmin() {
    if (_adminCache !== null) return _adminCache;
    _adminCache = (getData().currentUserAdmin === true);
    return _adminCache;
  }
  function invalidateAdminCache() { _adminCache = null; }

  function refreshUserDisplay(data) {
    if (!data) data = getData();
    var nameEl = $('userName');
    var roleEl = $('userRole');
    var name = data.currentUserName || 'Usuario';
    var admin = data.currentUserAdmin === true;
    if (nameEl) nameEl.textContent = name;
    if (roleEl) {
      roleEl.textContent = admin ? 'Administrador' : 'Usuario';
      roleEl.className = 'user-role' + (admin ? ' user-role-admin' : '');
    }
    refreshNavByRole(data);
  }

  function refreshNavByRole(data) {
    if (!data) data = getData();
    var admin = data.currentUserAdmin === true;
    var navAdmin = qsAll('.nav-item[data-admin-only]');
    var navUser = qsAll('.nav-item[data-user-only]');
    for (var i = 0; i < navAdmin.length; i++) navAdmin[i].style.display = admin ? '' : 'none';
    for (var i = 0; i < navUser.length; i++) navUser[i].style.display = admin ? 'none' : '';
    var block = $('dashboardAdminContent');
    if (block) block.style.display = admin ? '' : 'none';
    var agentBlock = $('dashboardAgentContent');
    if (agentBlock) agentBlock.style.display = admin ? 'none' : '';
    if (!admin) refreshProductividadAgente();
  }

  function findPortalUser(usuario, data) {
    if (!data) data = getData();
    var list = data.portalUsuarios;
    if (!list || !Array.isArray(list)) return null;
    var u = (usuario || '').trim().toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].usuario || '').toLowerCase() === u) return list[i];
    }
    return null;
  }

  function setActiveSection(sectionId) {
    var sections = _sections || (_sections = qsAll('.content .section'));
    var navItems = _nav || (_nav = qsAll('.sidebar-nav .nav-item'));
    sections.forEach(function (s) { s.classList.toggle('active', s.id === 'section-' + sectionId); });
    navItems.forEach(function (n) { n.classList.toggle('active', n.getAttribute('data-section') === sectionId); });
    var titleEl = $('topbarTitle');
    if (titleEl) titleEl.textContent = SECTION_TITLES[sectionId] || 'Inicio';
    if (history.replaceState) history.replaceState(null, '', '#' + sectionId);
    if (sectionId === 'dashboard') {
      if (isAdmin()) {
        var gData = getGestionDataFromStorage();
        var d = getData();
        refreshReincidencias(d, gData);
        refreshRankings(d, gData);
        refreshGestionOperacion();
      } else refreshProductividadAgente();
    }
    if (sectionId === 'calidad') refreshAuditoriasTable();
    if (sectionId === 'tablero-mensual') refreshTableroMensual();
  }

  function handleNavClick(e) {
    var link = e.target.closest('a[data-section]');
    if (!link) return;
    e.preventDefault();
    var sec = link.getAttribute('data-section');
    if ((sec === 'agentes' || sec === 'calidad' || sec === 'bolsa' || sec === 'perfil') && !isAdmin()) return;
    setActiveSection(sec);
  }

  var _adminOnly = { agentes: 1, calidad: 1, bolsa: 1, 'bolsa-hfc': 1, perfil: 1 };
  function handleHashChange() {
    var hash = (location.hash || '#dashboard').slice(1);
    var valid = isAdmin() ? VALID_HASH_ADMIN : VALID_HASH_USER;
    if (valid.indexOf(hash) < 0 || (_adminOnly[hash] && !isAdmin())) hash = 'dashboard';
    setActiveSection(hash);
  }

  /* Actualiza % de Presentó y Cobertura (Cobertura = Aprobó % desde Resultados) */
  function updateAsistencia() {
    var presento = parseInt(String(($('formPresento') || {}).textContent || '0').replace(/\D/g, ''), 10) || 0;
    var pendiente = parseInt(String(($('formPendiente') || {}).textContent || '0').replace(/\D/g, ''), 10) || 0;
    var total = presento + pendiente;
    var coberturaPct = total > 0 ? Math.round((presento / total) * 100) : 0;

    var pctPresento = $('formPresentoPct');
    if (pctPresento) pctPresento.textContent = coberturaPct + ' %';
    saveData('presentoPct', coberturaPct + ' %');
  }

  function parseNum(el) {
    if (!el || !el.textContent) return 0;
    var s = String(el.textContent).trim().replace(/\D/g, '');
    var n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  }

  /* Actualiza % de Resultados
   * Aprobó + Reprobó = quienes presentaron y tuvieron resultado (base: Presentó)
   * Novedades = incidencias / No presentó (base: Público Objetivo) */
  function updateResultados() {
    var presento = parseNum($('formPresento'));
    var publicoObjetivo = parseNum($('formPublicoObjetivo'));
    var aprobo = parseNum($('formaprobo'));
    var reprobo = parseNum($('formReprobo'));
    var novedades = parseNum($('formNovedades'));
    /* Corregir si Aprobó/Reprobó > Presentó (dato inconsistente) */
    if (presento > 0) {
      if (aprobo > presento) { aprobo = presento; var ea = $('formaprobo'); if (ea) { ea.textContent = aprobo; saveData('aprobo', aprobo); } }
      if (reprobo > presento) { reprobo = presento; var er = $('formReprobo'); if (er) { er.textContent = reprobo; saveData('reprobo', reprobo); } }
    }

    /* Aprobó y Reprobó: % sobre Presentó (Aprobó + Reprobó = Presentó) */
    var basePresento = presento > 0 ? presento : 1;
    var aPct = Math.round((aprobo / basePresento) * 100);
    var rPct = Math.round((reprobo / basePresento) * 100);

    /* Novedades: % sobre Público Objetivo (incidencias, No presentó, etc.) */
    var basePublico = publicoObjetivo > 0 ? publicoObjetivo : 1;
    var nPct = Math.round((novedades / basePublico) * 100);

    var pA = $('formaproboPct');
    var pR = $('formReproboPct');
    var pN = $('formNovedadesPct');
    if (pA) pA.textContent = aPct + ' %';
    if (pR) pR.textContent = rPct + ' %';
    if (pN) pN.textContent = nPct + ' %';

    /* Cobertura = Aprobó % (Formación e Inicio) */
    var cob = presento > 0 ? aPct : 0;
    var formCob = $('formCobertura');
    var valCob = $('coberturaValor');
    var ring = $('coberturaRing');
    var kpiCob = $('kpiCertCobertura');
    if (formCob) formCob.textContent = cob + ' %';
    if (valCob) valCob.textContent = cob + ' %';
    if (ring) ring.style.setProperty('--pct', cob);
    if (kpiCob) kpiCob.textContent = cob + ' %';
    saveData('cobertura', cob + ' %');

    updatePieChart(basePresento, aprobo, reprobo, novedades, aPct, rPct, nPct);
  }

  function updatePieChart(totalBase, aprobo, reprobo, novedades, aPct, rPct, nPct) {
    if (aprobo == null) aprobo = parseNum($('formaprobo'));
    if (reprobo == null) reprobo = parseNum($('formReprobo'));
    if (novedades == null) novedades = parseNum($('formNovedades'));

    if (totalBase == null) {
      var presento = parseNum($('formPresento'));
      totalBase = presento > 0 ? presento : 1;
    }
    if (aPct == null) aPct = Math.round((aprobo / totalBase) * 100);
    if (rPct == null) rPct = Math.round((reprobo / totalBase) * 100);
    if (nPct == null) {
      var publico = parseNum($('formPublicoObjetivo'));
      nPct = Math.round((novedades / (publico > 0 ? publico : 1)) * 100);
    }

    /* Torta: 3 segmentos (Aprobó, Reprobó, Novedades) */
    var totalPie = aprobo + reprobo + novedades || 1;
    var pieA = totalPie > 0 ? Math.round((aprobo / totalPie) * 100) : 0;
    var pieR = totalPie > 0 ? Math.round((reprobo / totalPie) * 100) : 0;
    var pieN = 100 - pieA - pieR;

    var pie = $('pieAprobacion');
    if (pie) {
      pie.style.background = 'conic-gradient(var(--integra-cyan) 0% ' + pieA + '%, var(--integra-rose) ' + pieA + '% ' + (pieA + pieR) + '%, var(--integra-orange) ' + (pieA + pieR) + '% 100%)';
    }

    var presento = parseNum($('formPresento'));
    var totalEval = presento > 0 ? presento : aprobo + reprobo + novedades;
    var tasaVal = aPct + '%';
    var tasaEl = $('aprobacionTasaNum');
    var pieValEl = $('pieAprobacionVal');
    var leyendaR = $('leyendaReprobo');
    var leyendaN = $('leyendaNovedades');
    var leyendaRF = $('leyendaReproboFooter');
    var leyendaNF = $('leyendaNovedadesFooter');
    var leyendaTE = $('leyendaTotalEval');
    var leyendaTF = $('leyendaTotalFooter');
    if (tasaEl) tasaEl.textContent = tasaVal;
    if (pieValEl) pieValEl.textContent = tasaVal;
    if (leyendaR) leyendaR.textContent = 'Reprobó ' + reprobo;
    if (leyendaN) leyendaN.textContent = 'Novedades ' + novedades;
    if (leyendaRF) leyendaRF.textContent = 'Reprobó ' + reprobo;
    if (leyendaNF) leyendaNF.textContent = 'Novedades ' + novedades;
    if (leyendaTE) leyendaTE.textContent = 'Total evaluados ' + totalEval;
    if (leyendaTF) leyendaTF.textContent = 'Total evaluados ' + totalEval;

    var kpiApr = $('kpiCertAprobados');
    var kpiRep = $('kpiCertReprobados');
    if (kpiApr) kpiApr.textContent = aprobo;
    if (kpiRep) kpiRep.textContent = reprobo;
  }

  var _inputBound;
  function bindEditable() {
    var data = getData();
    var admin = data.currentUserAdmin === true;
    qsAll('[contenteditable="true"][data-key]').forEach(function (el) {
      var key = el.getAttribute('data-key');
      if (data[key] != null && data[key] !== '') el.textContent = data[key];
      if (!admin) el.removeAttribute('contenteditable');
    });
    if (!admin) {
      qsAll('.editable[contenteditable="true"], .preturnos-cell-editable[contenteditable="true"]').forEach(function (el) { el.removeAttribute('contenteditable'); });
      return;
    }
    if (_inputBound) return;
    _inputBound = true;
    var inputTimer;
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.id) return;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(function () {
        var id = t.id;
        if (id === 'formPresento' || id === 'formPendiente') {
          updateAsistencia();
          updateResultados();
        } else if (id === 'formaprobo' || id === 'formReprobo' || id === 'formNovedades') {
          updateResultados();
        }
      }, 150);
    });

    /* Recalcular Resultados después de cargar datos de localStorage */
    updateResultados();
  }

  function drawSparkline(sel, data, targetVal) {
    var el = typeof sel === 'string' ? $(sel) : sel;
    if (!el || !data || data.length < 2) return;
    var line = el.querySelector('polyline');
    if (!line) return;
    var w = 200, h = 50, max = Math.max.apply(null, data), min = Math.min.apply(null, data);
    var range = max - min || 1;
    var pts = data.map(function (v, i) {
      var x = (i / (data.length - 1)) * w;
      var y = h - 5 - ((v - min) / range) * (h - 10);
      return x + ',' + y;
    });
    line.setAttribute('points', pts.join(' '));
    /* Línea roja de referencia (meta) */
    var refLine = el.querySelector('.sparkline-reference');
    if (refLine && targetVal != null) {
      var yRef = h - 5 - ((targetVal - min) / range) * (h - 10);
      yRef = Math.max(5, Math.min(h - 5, yRef));
      refLine.setAttribute('x1', 0);
      refLine.setAttribute('y1', yRef);
      refLine.setAttribute('x2', w);
      refLine.setAttribute('y2', yRef);
    }
  }

  function drawSparklineDual(containerSel, dataAgentes, dataStaff) {
    var el = typeof containerSel === 'string' ? $(containerSel) : containerSel;
    if (!el) return;
    var lineA = el.querySelector('.sparkline-agentes');
    var lineS = el.querySelector('.sparkline-staff');
    var w = 200, h = 50;
    var allData = (dataAgentes || []).concat(dataStaff || []);
    var max = allData.length ? Math.max.apply(null, allData) : 100;
    var min = allData.length ? Math.min.apply(null, allData) : 0;
    var range = max - min || 1;
    function pts(data) {
      if (!data || data.length < 2) return '';
      return data.map(function (v, i) {
        var x = (i / (data.length - 1)) * w;
        var y = h - 5 - ((v - min) / range) * (h - 10);
        return x + ',' + y;
      }).join(' ');
    }
    if (lineA && dataAgentes && dataAgentes.length >= 2) lineA.setAttribute('points', pts(dataAgentes));
    if (lineS && dataStaff && dataStaff.length >= 2) lineS.setAttribute('points', pts(dataStaff));
  }

  function loadData() {
    var data = getData();
    function set(id, def) {
      var e = $(id);
      if (!e) return;
      var key = e.getAttribute('data-key');
      if (key && data[key] != null && data[key] !== '') e.textContent = data[key];
      else if (def != null) e.textContent = def;
    }
    set('formPresento', '20');
    set('formPendiente', '11');
    if (data.currentUserAdmin === undefined) { data.currentUserAdmin = true; saveData('currentUserAdmin', true); }

    var sparkCert = [72, 75, 78, 76, 80, 78, 78];
    var sparkPret = [85, 88, 90, 88, 92, 91, 92];
    var sparkStaff = (data.sparkStaff && Array.isArray(data.sparkStaff)) ? data.sparkStaff : [82, 84, 85, 86, 87, 88, 89];
    if ($('sparkCert')) drawSparkline($('sparkCert'), sparkCert, 80);
    if ($('sparkPret')) drawSparklineDual($('sparkPret'), sparkPret, sparkStaff);

    updateAsistencia();
    updateResultados();

    var gData = getGestionDataFromStorage();
    refreshReincidencias(data, gData);
    refreshRankings(data, gData);
    refreshGestionOperacion();
    refreshPreturnos(data);
    refreshStaff(data);
    updatePromedioDonut(data);
    updatePromedioStaffDonut(data);
    bindReincRankEditable();
    refreshUsuariosPortal(data);
    refreshUserDisplay(data);
  }

  function genClaveTemp() {
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    var s = '';
    for (var i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function nombreToLogin(nombre) {
    return nombre.trim().toLowerCase().replace(/\s+/g, '').replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n') || 'user';
  }

  function refreshUsuariosPortal(data) {
    if (!data) data = getData();
    var items = (data.portalUsuarios && Array.isArray(data.portalUsuarios)) ? data.portalUsuarios : [];
    var tbody = $('usuariosBody');
    if (!tbody) return;
    var emptyEl = $('portalEmpty');
    if (emptyEl) emptyEl.style.display = items.length ? 'none' : 'block';
    tbody.innerHTML = items.map(function (u, i) {
      var r = (u.role || 'agente');
      if (ROLES.indexOf(r) < 0) r = 'agente';
      var sel = '<select class="portal-rol-select" data-i="' + i + '" title="Cambiar rol">' +
        '<option value="agente"' + (r === 'agente' ? ' selected' : '') + '>Agente</option>' +
        '<option value="supervisor"' + (r === 'supervisor' ? ' selected' : '') + '>Supervisor</option>' +
        '<option value="administrador"' + (r === 'administrador' ? ' selected' : '') + '>Administrador</option>' +
        '</select>';
      return '<tr><td>' + (u.nombre || '') + '</td><td>' + (u.usuario || '') + '</td><td><span class="portal-estado">' + (u.estado || 'Temporal') + '</span></td><td>' + sel + '</td><td><code>' + (u.clave || '') + '</code></td><td><button type="button" class="btn-copy" data-i="' + i + '">Copiar</button><button type="button" class="btn-remove" data-i="' + i + '">Quitar</button></td></tr>';
    }).join('');
  }

  function onPortalTableClick(e) {
    var btn = e.target.closest('.btn-copy, .btn-remove');
    if (!btn) return;
    var i = parseInt(btn.getAttribute('data-i'), 10);
    var d = getData();
    var list = d.portalUsuarios;
    if (!list || !Array.isArray(list) || i < 0 || i >= list.length) return;
    if (btn.classList.contains('btn-copy')) {
      if (list[i].clave) { try { navigator.clipboard.writeText(list[i].clave); } catch (x) {} }
    } else {
      var arr = list.slice();
      arr.splice(i, 1);
      saveData('portalUsuarios', arr);
      refreshUsuariosPortal();
    }
  }

  function onPortalTableChange(e) {
    var sel = e.target.closest('.portal-rol-select');
    if (!sel) return;
    var i = parseInt(sel.getAttribute('data-i'), 10);
    var d = getData();
    var list = d.portalUsuarios;
    if (!list || !Array.isArray(list) || i < 0 || i >= list.length) return;
    var arr = list.slice();
    var u = arr[i];
    arr[i] = { nombre: u.nombre, usuario: u.usuario, clave: u.clave, estado: u.estado, role: sel.value };
    saveData('portalUsuarios', arr);
    flushSave();
  }

  var PLANTILLA_BASE = '@GESTION INMEDIATA - {agente}\n==================================================================================================================\n==================================================================================================================\n///////////////////////////////////////////////OBSERVACIONES//////////////////////////////////////////////////////\n==================================================================================================================\n\nSe comunica PIM Santiago al Numero {numero} del Aliado {aliado}, Función {funcion}, donde la causa de la falla fue {causa}, {solucion}. Se revisa pruebas en red de acceso con potencias optimas, pruebas de Nodo correctas y se obtiene acceso al CPE.\n\n==================================================================================================================\n\n==================================================================================================================\n==================================================================================================================\n///////////////////////////////////////////////RED DE ACCESO//////////////////////////////////////////////////////\n==================================================================================================================\n\n{redAcceso}\n\n==================================================================================================================\n********************************************\tNODO    **********************************************************\n==================================================================================================================\n\n{nodo}\n\n==================================================================================================================\n==================================================================================================================\n////////////////////////////////////////////////////////CPE/////////////////////////////////////////////////////\n==================================================================================================================\n\n{cpe}\n\n==================================================================================================================\n==================================================================================================================';
  var PLANTILLA_SI = '@GESTION INMEDIATA - {agente}\n==================================================================================================================\n==================================================================================================================\n///////////////////////////////////////////////OBSERVACIONES//////////////////////////////////////////////////////\n==================================================================================================================\n\nSe comunica PIM Santiago al Numero {numero} del Aliado {aliado}, Función {funcion}, donde se evidencia servicio escalado al area de {areaTransferir}. Se transfiere satisfactoriamente.\n\n==================================================================================================================\n';

  function getGestionKey() {
    var d = getData();
    return d.currentUserUsuario || d.currentUserName || 'default';
  }

  function getCasosGestion() {
    var d = getData();
    var k = 'gestionCasos_' + (d.currentUserUsuario || d.currentUserName || 'default');
    var arr = d[k];
    return Array.isArray(arr) ? arr : [];
  }

  var META_DIA = 23;
  var MIN_PRODUCTIVO = 15;

  function getProductividadAgente() {
    var arr = getCasosGestion();
    var hoy = 0, mes = 0;
    var d = new Date();
    var hoyInicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var mesInicio = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    for (var i = 0; i < arr.length; i++) {
      var ts = arr[i].fechaHoraTs;
      if (!ts) continue;
      if (ts >= hoyInicio) hoy++;
      if (ts >= mesInicio) mes++;
    }
    return { hoy: hoy, mes: mes };
  }

  function refreshProductividadAgente() {
    var wrap = $('productividadAgenteWrap');
    if (!wrap) return;
    var d = getData();
    var nombre = d.currentUserName || 'Agente';
    var p = getProductividadAgente();
    var hoy = p.hoy, mes = p.mes;
    var meta = META_DIA, min = MIN_PRODUCTIVO;
    var pct = meta > 0 ? Math.min(100, Math.round((hoy / meta) * 100)) : 0;
    var productivo = hoy >= min;
    var alertClass = productivo ? 'prod-ok' : 'prod-alert';
    var alertMsg = productivo
      ? 'Cumpliste la productividad de hoy.'
      : 'No cumpliste la productividad de hoy. Mínimo ' + min + ' casos (llamadas y gestión). Llevas ' + hoy + '.';
    wrap.innerHTML =
      '<div class="prod-welcome">Bienvenido, ' + escapeHtml(nombre) + '</div>' +
      '<p class="prod-role">Panel de agente</p>' +
      '<div class="prod-card">' +
        '<h3 class="prod-title">Tu productividad</h3>' +
        '<p class="prod-meta-desc">Meta: ' + meta + ' casos/día (100%). Alerta si realizas menos de ' + min + ' casos.</p>' +
        '<div class="prod-kpis">' +
          '<div class="prod-kpi"><span class="prod-kpi-val">' + meta + '</span><span class="prod-kpi-label">Meta del día</span></div>' +
          '<div class="prod-kpi"><span class="prod-kpi-val">' + hoy + '</span><span class="prod-kpi-label">Hoy llevas</span></div>' +
          '<div class="prod-kpi"><span class="prod-kpi-val">' + mes + '</span><span class="prod-kpi-label">Total mes</span></div>' +
        '</div>' +
        '<div class="prod-alert-box ' + alertClass + '">' + alertMsg + '</div>' +
        '<div class="prod-progress-row">' +
          '<span>Hoy (meta ' + meta + ')</span>' +
          '<span>' + hoy + '/' + meta + ' (' + pct + '%)</span>' +
        '</div>' +
        '<div class="prod-ring-wrap"><div class="prod-ring' + (productivo ? ' prod-ring-ok' : '') + '" style="--pct:' + pct + '"></div><span class="prod-ring-val">' + pct + '%</span><span class="prod-ring-de">de 100%</span></div>' +
      '</div>';
  }

  function getGestionDataFromStorage() { return getData(); }
  var _bolsaDef = { backNegocios: 0, negociosGI: 0, proactividadVIP: 0 };
  function _parseBolsaObj(d) {
    return d && typeof d === 'object' ? { backNegocios: parseInt(d.backNegocios, 10) || 0, negociosGI: parseInt(d.negociosGI, 10) || 0, proactividadVIP: parseInt(d.proactividadVIP, 10) || 0 } : _bolsaDef;
  }
  function getBolsaData() {
    var d = getData();
    return { abiertos: _parseBolsaObj(d.bolsaCasosAbiertos), sla: _parseBolsaObj(d.bolsaSlaFaseCierre), resueltos: _parseBolsaObj(d.bolsaResueltos) };
  }
  function getBolsaCasosAbiertos() { return getBolsaData().abiertos; }
  function getBolsaSlaFaseCierre() { return getBolsaData().sla; }
  function saveBolsaCasosAbiertos(o) { saveData('bolsaCasosAbiertos', o); }
  function refreshSlaFaseCierre(sla) {
    var s = sla || getBolsaData().sla;
    var wrap = $('slaFaseCierreList');
    if (!wrap) return;
    var items = [{ label: 'EYN- Soporte Back Negocios', val: s.backNegocios }, { label: 'EYN- Soporte Negocios GI', val: s.negociosGI }, { label: 'EYN- PROACTIVIDAD VIP', val: s.proactividadVIP }];
    var total = s.backNegocios + s.negociosGI + s.proactividadVIP;
    if (total === 0) {
      wrap.innerHTML = '<div class="letra-mas-afectada-empty">Importa la bolsa en Bolsa para ver datos SLA.</div>';
      return;
    }
    wrap.innerHTML = items.map(function (it) { return '<div class="reincidencia-item"><span class="reinc-tipo">' + escapeHtml(it.label) + '</span><span class="reinc-count">' + it.val + '</span></div>'; }).join('');
  }
  function refreshGestionOperacion() {
    var bolsa = getBolsaData();
    refreshEynCajitas(bolsa);
    refreshSlaFaseCierre(bolsa.sla);
    refreshGestionOperacionHfc();
  }
  function refreshGestionOperacionHfc() {
    var d = getData();
    var totalContacto = parseInt(d.bolsaHfcCierresContacto, 10) || 0;
    var totalBuzon = parseInt(d.bolsaHfcCierresBuzon, 10) || 0;
    var elContacto = $('hfcCierresContacto');
    if (elContacto) elContacto.innerHTML = '<span class="eyn-caja-num">' + totalContacto + '</span><span class="eyn-caja-label">cierres</span>';
    var elBuzon = $('hfcCierresBuzon');
    if (elBuzon) elBuzon.innerHTML = '<span class="eyn-caja-num">' + totalBuzon + '</span><span class="eyn-caja-label">cierres</span>';
    var total = totalContacto + totalBuzon;
    var maxVal = Math.max(totalContacto, totalBuzon, 1);
    var pctContacto = total > 0 ? Math.round((totalContacto / total) * 100) : 0;
    var pctBuzon = total > 0 ? Math.round((totalBuzon / total) * 100) : 0;
    var barContacto = $('hfcBarContacto');
    var barBuzon = $('hfcBarBuzon');
    var valContacto = $('hfcValContacto');
    var valBuzon = $('hfcValBuzon');
    var pctContactoEl = $('hfcPctContacto');
    var pctBuzonEl = $('hfcPctBuzon');
    if (barContacto) barContacto.style.width = Math.round((totalContacto / maxVal) * 100) + '%';
    if (barBuzon) barBuzon.style.width = Math.round((totalBuzon / maxVal) * 100) + '%';
    if (valContacto) valContacto.textContent = totalContacto;
    if (valBuzon) valBuzon.textContent = totalBuzon;
    if (pctContactoEl) pctContactoEl.textContent = pctContacto + '%';
    if (pctBuzonEl) pctBuzonEl.textContent = pctBuzon + '%';
    var donut1 = $('hfcDonut1');
    var donut2 = $('hfcDonut2');
    var donut1Label = $('hfcDonut1Label');
    var donut2Label = $('hfcDonut2Label');
    if (donut1) donut1.style.setProperty('--pct', pctContacto);
    if (donut2) donut2.style.setProperty('--pct', pctBuzon);
    if (donut1Label) donut1Label.textContent = pctContacto + '%';
    if (donut2Label) donut2Label.textContent = pctBuzon + '%';
    var reincNum = parseInt(d.bolsaHfcReincidenciasNum, 10) || 0;
    var elReinc = $('hfcReincidencias');
    if (elReinc) elReinc.innerHTML = '<span class="eyn-caja-num">' + reincNum + '</span><span class="eyn-caja-label">reincidencias</span>';
  }
  function refreshEynCajitas(bolsa) {
    var data = bolsa || getBolsaData();
    var a = data.abiertos || _bolsaDef;
    var s = data.sla || _bolsaDef;
    var map = { eynBackNegocios: 'backNegocios', eynNegociosGI: 'negociosGI', eynProactividad: 'proactividadVIP' };
    for (var id in map) {
      var k = map[id];
      var ab = a[k] || 0;
      var sl = s[k] || 0;
      var n = ab || (sl > 0 ? 1 : 0);
      var e = $(id);
      if (e) e.innerHTML = '<span class="eyn-caja-num">' + n + '</span><span class="eyn-caja-label">casos abiertos</span>';
    }
  }

  function getTotalGestionAgentes(data) {
    if (!data) data = getGestionDataFromStorage();
    var total = 0;
    for (var key in data) {
      if (key.indexOf('gestionCasos_') !== 0) continue;
      var arr = data[key];
      if (Array.isArray(arr)) total += arr.length;
    }
    return total;
  }

  function getReincidenciasFromGestion(data) {
    if (!data) data = getGestionDataFromStorage();
    var ahora = Date.now();
    var porNit = {};
    for (var key in data) {
      if (key.indexOf('gestionCasos_') !== 0) continue;
      var arr = data[key];
      if (!Array.isArray(arr)) continue;
      for (var i = 0, len = arr.length; i < len; i++) {
        var c = arr[i];
        var nit = String(c.nit || '').trim();
        if (!nit) continue;
        var ts = c.fechaHoraTs;
        if (!ts || ahora - ts > TRES_MESES_MS) continue;
        var fecha = c.fechaHora || (ts ? new Date(ts).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '');
        if (!porNit[nit]) porNit[nit] = { count: 0, fechas: [] };
        porNit[nit].count++;
        porNit[nit].fechas.push(fecha);
      }
    }
    var out = [];
    for (var n in porNit) {
      if (porNit[n].count >= 2) out.push({ tipo: 'NIT ' + n, count: porNit[n].count, fechas: porNit[n].fechas });
    }
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  function saveCasosGestion(arr) {
    saveData('gestionCasos_' + getGestionKey(), arr);
  }

  var LETRAS = ['G', 'A1', 'N', 'A2'];
  var MATRIZ_CALIDAD = {
    G: [
      { m: 'Acompa\u00f1o al cliente evitando', d: 'Acompa\u00f1o al cliente evitando abandono, atiendo mi llamada a tiempo y gestiono correctamente los tiempos de espera' },
      { m: 'Amabilidad en la atenci\u00f3n', d: 'Amabilidad en la atenci\u00f3n' },
      { m: 'Amabilidad en la atenci\u00f3n', d: 'Claridad en seguimiento del requerimiento a cliente' }
    ],
    A1: [
      { m: 'Escucha activa', d: 'Escucha activa' },
      { m: 'Realiza preguntas y pruebas', d: 'Realiza preguntas y pruebas' }
    ],
    N: [
      { m: 'Categorizaci\u00f3n o Priorizaci\u00f3n', causales: ['FO - Tipo de Interacci\u00f3n correcto','FO - La subcategoria asignada es correcta','FO - El \u00e1rea asignada es correcta','FO - El impacto asignado es el correcto','FO - La urgencia asignada es la correcta','FO - El SD queda asignado al grupo correcto','FO - Realiza escalamiento del IM o RF al grupo correcto','FO - Escala caso en el estado correspondiente'] },
      { m: 'Consultar casos abiertos o', causales: ['Revisi\u00f3n casos abiertos','Revisi\u00f3n reincidencia'] },
      { m: 'Desplazamiento', causales: ['FO - Crea caso adecuadamente en Maximo FO','FO - Documenta el campo N\u00b0 Tk Externo','FO - Habilita check Empresas o Negocios','FO - Documenta el campo notas en M\u00e1ximo','FO - Genera la OT en Maximo','FO - Crea adecuadamente la tarea en SM','FO - Documenta el SW Acceso y puerto','FO - Direcci\u00f3n y contacto de la persona en sitio','FO - Minutograma (tareas programadas)','FO - Asigna la tarea de SM al perfil correspondiente','FO - Asigna prioridad en la tarea de SM correcta','FO - Hace uso de las plantillas establecidas para cada','FO - Registra informaci\u00f3n correcta desplazamiento (no'] },
      { m: 'Doc Cierre', causales: ['HFC- Confirma con cliente el cierre del caso','HFC- Asigna adecuadamente la marcaci\u00f3n','FO - Confirma con cliente el cierre del caso FO','FO - Asigna adecuadamente el KM o error conocido','FO - Diligencia el campo soluci\u00f3n con la plantilla de','FO - El caso queda en estado cerrado','FO - Documenta los intentos de contacto con el cliente','FO - Deja mensaje de voz notificando el contacto no'] },
      { m: 'Ejecuci\u00f3n proceso de soporte', causales: ['HFC - Reinicia CM fuera de tiempos','HFC - Realiza pruebas de acuerdo a la falla del cliente','HFC - Omite realizar el soporte completo (CASOS EN','HFC - Valida aprovisionamiento correctamente','HFC - Env\u00eda comando innecesarios','HFC - Verifica equipos de cliente (SW)','HFC - Realiza conexi\u00f3n directa de un equipo al CM','HFC - Deja el caso en seguimiento sin ser necesario','FO - Cumplimiento de OLA','FO - Revisi\u00f3n Capa 2 y 3 Equipos Core','FO - Revisi\u00f3n de Red de Acceso','FO - Revisi\u00f3n CPE','FO - Revisi\u00f3n Telefon\u00eda','Llamada de PIM','FO - Omite validar estado de las conexiones','FO - No realiza validaci\u00f3n de Switch de Acceso','FO - No genera pruebas \u00daltima Milla sobre el nodo','FO-Deja el caso en seguimiento sin ser necesario FO','Contacto con cliente y Seguimiento'] },
      { m: 'Requerimiento', causales: ['FO - Crea el SD respectivo','FO - Crea caso sobre CI correcto','FO - Crea caso sobre compa\u00f1ia cliente correcta','FO - Hace uso adecuado de la plantilla de','FO - Origen de la atenci\u00f3n','FO - Documentaci\u00f3n completa en el campo descripci\u00f3n','FO - Registra notas falsas de soporte, es decir, registra','FO - Registra informaci\u00f3n correcta (no presenta errores','FO - Uso adecuado de estados','FO - Equipo que presenta falla','FO - Adjunta pruebas realizadas y del cliente','FO - Adjunta correos enviados o recibidos por el cliente'] },
      { m: 'Navega correctamente en las', causales: ['Revisi\u00f3n OT cliente','Identifica Segmento cliente','Revisi\u00f3n Avisos','Revisi\u00f3n Vecinos'] },
      { m: 'Realiza devoluci\u00f3n de la', causales: ['Realiza devoluci\u00f3n de la llamada'] }
    ],
    A2: []
  };
  var ROLES = ['agente', 'supervisor', 'administrador'];
  var TRES_MESES_MS = 90 * 24 * 60 * 60 * 1000;

  function getAuditoriasAgentes() {
    var list = (getData().auditoriasAgentes);
    return (list && Array.isArray(list)) ? list.slice() : [];
  }

  function saveAuditoriasAgentes(arr) {
    saveData('auditoriasAgentes', arr);
  }

  var _matrizCalidadBound;
  var _selItemPlaceholder = '<option value="">Seleccione item</option>';
  var _selCausalPlaceholder = '<option value="">Seleccione item causal</option>';
  function buildOpts(arr, ph, valFn, labelFn) {
    var out = [ph];
    for (var i = 0; i < arr.length; i++) out.push('<option value="' + valFn(arr[i], i) + '">' + escapeHtml(labelFn(arr[i], i)) + '</option>');
    return out.join('');
  }
  function initMatrizLetraSelects() {
    var selLetra = $('auditoriaLetra'), selItem = $('auditoriaItem'), selCausales = $('auditoriaItemCausales');
    if (!selLetra || !selItem) return;
    selItem.innerHTML = _selItemPlaceholder;
    if (selCausales) selCausales.style.display = 'none';
    if (_matrizCalidadBound) return;
    _matrizCalidadBound = true;
    function onLetraChange() {
      var letra = selLetra.value;
      var arr = letra && MATRIZ_CALIDAD[letra] ? MATRIZ_CALIDAD[letra] : [];
      var isN = letra === 'N' && arr.length && arr[0] && arr[0].causales;
      selItem.innerHTML = _selItemPlaceholder;
      if (selCausales) { selCausales.innerHTML = _selCausalPlaceholder; selCausales.style.display = 'none'; }
      if (!letra) return;
      selItem.innerHTML = buildOpts(arr, _selItemPlaceholder, function (_, i) { return i; }, function (it) { return isN ? (it.m || '') : (it.m || it.d || ''); });
    }
    selLetra.addEventListener('change', onLetraChange);
    selItem.addEventListener('change', function () {
      var letra = selLetra.value, arr = letra && MATRIZ_CALIDAD[letra] ? MATRIZ_CALIDAD[letra] : [];
      if (!selCausales || letra !== 'N' || !arr.length || !arr[0].causales) return;
      var idx = parseInt(this.value, 10);
      if (idx < 0 || idx >= arr.length) { selCausales.style.display = 'none'; return; }
      var c = arr[idx].causales || [];
      selCausales.innerHTML = buildOpts(c, _selCausalPlaceholder, function (_, i) { return i; }, function (s) { return s; });
      selCausales.style.display = '';
    });
  }

  function getCalidadMetrics() {
    var d = getData();
    var list = (d.auditoriasAgentes && Array.isArray(d.auditoriasAgentes)) ? d.auditoriasAgentes : [];
    var byItem = {}, byMacro = {};
    var now = Date.now(), dayMs = 864e5;
    var spark = [0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var item = String(r.descripcionItem || r.macroproceso || r.itemAfectado || '').trim();
      if (item) { byItem[item] = (byItem[item] || 0) + 1; }
      var m = String(r.macroproceso || '').trim();
      if (m) { byMacro[m] = (byMacro[m] || 0) + 1; }
      var ts = r.fechaHoraTs;
      if (ts) {
        var diff = Math.floor((now - ts) / dayMs);
        if (diff >= 0 && diff < 7) spark[6 - diff]++;
      }
    }
    var letraOut = [];
    for (var k in byItem) letraOut.push({ item: k, count: byItem[k] });
    letraOut.sort(function (a, b) { return b.count - a.count; });
    var top3 = [];
    for (var k in byMacro) top3.push({ macro: k, count: byMacro[k] });
    top3.sort(function (a, b) { return b.count - a.count; });
    return { letraMasAfectada: letraOut, top3Macro: top3.slice(0, 3), spark: spark, totalAuditorias: list.length };
  }
  function getLetraMasAfectada() { return getCalidadMetrics().letraMasAfectada; }
  function getTop3MacroprocesosAfectados() { return getCalidadMetrics().top3Macro; }
  var _sparkChars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  function getCalidadSparklineData() { return getCalidadMetrics().spark; }

  var _gestionStartTime = 0;

  function getFormGestion() {
    var g = function (id) { return (($(id) || {}).value || '').trim(); };
    return {
      nombre: g('gestionNombre'),
      numero: g('gestionNumero'),
      nit: g('gestionNit'),
      aliado: g('gestionAliado'),
      funcion: g('gestionFuncion'),
      imot: g('gestionImot'),
      transferencia: g('gestionTransferencia'),
      areaTransferir: g('gestionAreaTransferir'),
      extensiones: g('gestionExtensiones'),
      cliente: g('gestionCliente'),
      pqr: g('gestionPqr'),
      causa: g('gestionCausa'),
      solucion: g('gestionSolucion'),
      redAcceso: g('gestionRed'),
      nodo: g('gestionNodo'),
      cpe: g('gestionCpe')
    };
  }

  function buildPlantilla(caso) {
    var d = getData();
    var agente = d.currentUserName || 'Agente';
    if (!caso) caso = getFormGestion();
    var tpl = (caso.transferencia === 'SI') ? PLANTILLA_SI : PLANTILLA_BASE;
    return tpl
      .replace(/{agente}/g, agente)
      .replace(/{numero}/g, caso.numero || '')
      .replace(/{aliado}/g, caso.aliado || '')
      .replace(/{funcion}/g, caso.funcion || '')
      .replace(/{causa}/g, caso.causa || '')
      .replace(/{solucion}/g, caso.solucion || '')
      .replace(/{areaTransferir}/g, caso.areaTransferir || '')
      .replace(/{redAcceso}/g, caso.redAcceso || '')
      .replace(/{nodo}/g, caso.nodo || '')
      .replace(/{cpe}/g, caso.cpe || '');
  }

  function refreshGestionPlantilla(caso) {
    var el = $('gestionPlantilla');
    if (el) el.value = buildPlantilla(caso);
  }

  function clearFormGestion() {
    for (var i = 0; i < GESTION_FORM_IDS.length; i++) { var e = $(GESTION_FORM_IDS[i]); if (e) e.value = ''; }
    var extras = $('gestionTransferenciaExtras');
    var pruebas = $('gestionPruebasSection');
    if (extras) extras.style.display = 'none';
    if (pruebas) pruebas.style.display = '';
  }

  var MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  function refreshTableroMensual() {
    var wrap = $('tableroMensualBars');
    var mesEl = $('tableroMensualMes');
    var selEl = $('tableroMensualSelector');
    var totalEl = $('tableroMensualTotal');
    var emptyEl = $('tableroMensualEmpty');
    if (!wrap) return;
    var items = getCasosGestion();
    var hoy = new Date();
    var selYear = hoy.getFullYear(), selMonth = hoy.getMonth();
    if (selEl && selEl.value) {
      var p = selEl.value.split('-');
      selYear = parseInt(p[0], 10);
      selMonth = parseInt(p[1], 10);
    }
    var mesInicio = new Date(selYear, selMonth, 1).getTime();
    var mesFin = new Date(selYear, selMonth + 1, 0).getTime();
    var dias = new Date(selYear, selMonth + 1, 0).getDate();
    var porDia = [];
    for (var d = 0; d < dias; d++) porDia[d] = 0;
    for (var i = 0; i < items.length; i++) {
      var ts = items[i].fechaHoraTs;
      if (!ts || ts < mesInicio || ts > mesFin) continue;
      var dd = new Date(ts).getDate();
      porDia[dd - 1]++;
    }
    var max = 0;
    for (var j = 0; j < porDia.length; j++) if (porDia[j] > max) max = porDia[j];
    if (mesEl) mesEl.textContent = MESES_NOM[selMonth] + ' ' + selYear;
    if (selEl && selEl.options.length === 0) {
      for (var m = 0; m < 12; m++) {
        var y = hoy.getFullYear(), mo = hoy.getMonth() - m;
        if (mo < 0) { mo += 12; y--; }
        var opt = document.createElement('option');
        opt.value = y + '-' + mo;
        opt.textContent = MESES_NOM[mo] + ' ' + y;
        if (mo === selMonth && y === selYear) opt.selected = true;
        selEl.appendChild(opt);
      }
      selEl.addEventListener('change', function () { refreshTableroMensual(); });
    }
    var total = 0;
    var html = '<div class="tablero-mensual-grid" style="grid-template-columns:repeat(' + dias + ',1fr)">';
    for (var k = 0; k < porDia.length; k++) {
      total += porDia[k];
      var h = max > 0 ? Math.max(4, (porDia[k] / max) * 100) : 0;
      var cls = porDia[k] > 0 ? '' : ' tablero-bar-empty';
      html += '<div class="tablero-bar-wrap" title="Día ' + (k + 1) + ': ' + porDia[k] + ' casos">' +
        '<div class="tablero-bar-fill-wrap" style="height:' + (max > 0 ? 120 : 0) + 'px">' +
        '<div class="tablero-bar-fill' + cls + '" style="height:' + h + '%" title="' + (k + 1) + ': ' + porDia[k] + ' casos"></div></div>' +
        '<span class="tablero-bar-label">' + (k + 1) + '</span>' +
        '<span class="tablero-bar-count">' + porDia[k] + '</span></div>';
    }
    html += '</div>';
    wrap.innerHTML = html;
    if (totalEl) totalEl.textContent = total;
    if (emptyEl) emptyEl.style.display = total > 0 ? 'none' : 'block';
  }

  function refreshGestionCasos() {
    var items = getCasosGestion();
    var tbody = $('gestionCasosBody');
    var countEl = $('gestionCasosCount');
    var emptyEl = $('gestionCasosEmpty');
    if (countEl) countEl.textContent = items.length;
    if (emptyEl) emptyEl.style.display = items.length ? 'none' : 'block';
    if (!tbody) return;
    tbody.innerHTML = items.map(function (c, i) {
      return '<tr><td>' + (c.nombre || '') + '</td><td>' + (c.numero || '') + '</td><td>' + (c.nit || '') + '</td><td>' + (c.aliado || '') + '</td><td>' + (c.funcion || '') + '</td><td>' + (c.transferencia || '') + '</td><td>' + (c.areaTransferir || '') + '</td><td>' + (c.extensiones || '') + '</td><td>' + (c.cliente || '') + '</td><td>' + (c.fechaHora || '') + '</td><td>' + (c.duracion || '') + '</td><td><button type="button" class="btn-copy gestion-ver" data-i="' + i + '">Ver</button><button type="button" class="btn-remove gestion-borrar" data-i="' + i + '">Quitar</button></td></tr>';
    }).join('');
    refreshGestionPlantilla();
  }

  function descargarExcelGestion() {
    var items = getCasosGestion();
    function esc(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }
    var csv = EXCEL_COLS.join(';') + '\n';
    for (var i = 0; i < items.length; i++) csv += EXCEL_KEYS.map(function (k) { return esc(items[i][k]); }).join(';') + '\n';
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'casos_gestion_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function descargarInforme() {
    var d = getData();
    function prom(arr) {
      if (!arr || !arr.length) return 0;
      var s = 0, w = 0;
      arr.forEach(function (r) { var p = parseInt(r.programados, 10) || 0; var pr = parseFloat(String(r.promedio || '0').replace(',', '.')) || 0; s += p * pr; w += p; });
      return w ? Math.round((s / w) * 10) / 10 : 0;
    }
    function num(v) { return parseInt(String(v || '0').replace(/\D/g, ''), 10) || 0; }
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
    var JsPDF = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
    if (!JsPDF) {
      var esc = function (v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; };
      var row = [d.currentUserName || 'Usuario', new Date().toLocaleString('es-ES'), d.formPublicoObjetivo || '', d.formPresento || '', d.formaprobo || '', d.formReprobo || '', d.cobertura || '', prom(d.preturnos), prom(d.staff), getCasosGestion().length];
      var blob = new Blob(['\ufeffUsuario;Fecha;Público Objetivo;Presentó;Aprobó;Reprobó;Cobertura;Prom Preturnos;Prom Staff;Casos Gestión\n' + row.map(esc).join(';')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'informe_integra_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href);
      return;
    }
    var cob = num(d.cobertura), pret = prom(d.preturnos), staff = prom(d.staff), hfcC = num(d.bolsaHfcCierresContacto), hfcB = num(d.bolsaHfcCierresBuzon), hfcR = num(d.bolsaHfcReincidenciasNum);
    var totalCierres = hfcC + hfcB, pctBuzon = totalCierres ? Math.round((hfcB / totalCierres) * 100) : 0;
    var doc = new JsPDF();
    var c = { bg: [15, 23, 42], card: [30, 41, 59], accent: [34, 211, 238], green: [52, 211, 153], fuchsia: [244, 114, 182], violet: [167, 139, 250], white: [255, 255, 255], gray: [148, 163, 184] };
    function card(x, y, w, h) { doc.setFillColor(12, 18, 35); doc.rect(x + 1, y + 1, w, h, 'F'); doc.setFillColor.apply(doc, c.card); doc.setDrawColor(51, 65, 85); doc.rect(x, y, w, h, 'FD'); }
    /* PÁGINA 1: PORTADA */
    doc.setFillColor.apply(doc, c.bg);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor.apply(doc, c.gray);
    doc.setFontSize(9);
    doc.text('◆ INTEGRA', 170, 18);
    doc.setDrawColor.apply(doc, c.accent);
    doc.setLineWidth(0.3);
    doc.line(165, 20, 200, 20);
    doc.setTextColor.apply(doc, c.white);
    doc.setFontSize(26);
    doc.setFont(undefined, 'bold');
    doc.text('INFORME MENSUAL', 105, 120, { align: 'center' });
    doc.text('GESTIÓN HFC', 105, 138, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor.apply(doc, c.gray);
    doc.text('Fecha: ' + new Date().toLocaleString('es-ES', { dateStyle: 'long' }), 105, 165, { align: 'center' });
    doc.text('Área: Operaciones', 105, 175, { align: 'center' });
    doc.text('Responsable: ' + (d.currentUserName || d.currentUserUsuario || 'N/A'), 105, 185, { align: 'center' });
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.2);
    doc.line(20, 285, 190, 285);
    doc.setFontSize(8);
    doc.text('Documento confidencial · Integra', 105, 292, { align: 'center' });
    /* PÁGINA 2: RESUMEN EJECUTIVO */
    doc.addPage();
    doc.setFillColor.apply(doc, c.bg);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    doc.setTextColor.apply(doc, c.white);
    doc.text('Resumen Ejecutivo', 20, 25);
    doc.setDrawColor.apply(doc, c.accent);
    doc.setLineWidth(0.5);
    doc.line(20, 28, 60, 28);
    var kx = 20, kw = 55, kh = 42, gap = 8;
    var kpis = [{ v: cob + '%', l: 'Cobertura General', rgb: c.accent }, { v: pret + '%', l: 'Preturnos', rgb: c.green }, { v: staff + '%', l: 'Staff', rgb: c.violet }];
    for (var i = 0; i < 3; i++) {
      var x = kx + i * (kw + gap);
      card(x, 38, kw, kh);
      doc.setFillColor.apply(doc, kpis[i].rgb);
      doc.circle(x + kw / 2, 55, 12, 'F');
      doc.setTextColor.apply(doc, c.white);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(kpis[i].v, x + kw / 2, 58, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor.apply(doc, c.gray);
      doc.text(kpis[i].l, x + kw / 2, 78, { align: 'center' });
    }
    card(20, 92, 170, 72);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.setTextColor.apply(doc, c.accent);
    doc.text('Gestión HFC', 28, 108);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, c.white);
    doc.text(fmt(hfcC) + ' Cierres con Contacto', 28, 128);
    doc.text(fmt(hfcB) + ' Cierres con Buzón', 28, 142);
    doc.text(fmt(hfcR) + ' Reincidencias', 28, 156);
    doc.setTextColor.apply(doc, c.gray);
    doc.setFontSize(9);
    doc.text('Total cierres: ' + fmt(totalCierres) + '  ·  Casos gestión: ' + getCasosGestion().length, 28, 158);
    /* PÁGINA 3: GESTIÓN HFC DETALLADA + ANÁLISIS */
    doc.addPage();
    doc.setFillColor.apply(doc, c.bg);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    doc.setTextColor.apply(doc, c.white);
    doc.text('Gestión HFC – Detalle', 20, 25);
    doc.line(20, 28, 75, 28);
    var hfcMax = Math.max(hfcC, hfcB, hfcR, 1);
    var hv = [hfcC, hfcB, hfcR], hl = ['Cierres con Contacto', 'Cierres con Buzón', 'Reincidencias'], hc = [c.accent, c.green, c.fuchsia];
    card(20, 38, 170, 85);
    for (var j = 0; j < 3; j++) {
      var bw = Math.max(15, 130 * (hv[j] / hfcMax)), by = 52 + j * 22;
      doc.setFillColor(51, 65, 85);
      doc.rect(28, by, 134, 14, 'F');
      doc.setFillColor.apply(doc, hc[j]);
      doc.rect(28, by, bw, 14, 'F');
      doc.setTextColor.apply(doc, c.white);
      doc.setFontSize(10);
      doc.text(hl[j], 32, by + 9);
      doc.text(fmt(hv[j]), 165, by + 9, { align: 'right' });
    }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.setTextColor.apply(doc, c.accent);
    doc.text('Análisis', 20, 145);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, c.white);
    var analisis = [];
    analisis.push('Cierres con buzón representan el ' + pctBuzon + '% del total de cierres.');
    if (staff < 80) analisis.push('Staff con oportunidad de mejora (' + staff + '%).');
    if (cob >= 90) analisis.push('Cobertura general en rango objetivo.');
    if (hfcR > 0) analisis.push(fmt(hfcR) + ' reincidencias a monitorear.');
    if (pret >= 90) analisis.push('Preturnos con buen desempeño.');
    for (var a = 0; a < Math.min(analisis.length, 4); a++) doc.text('• ' + analisis[a], 28, 162 + a * 8);
    doc.setTextColor.apply(doc, c.gray);
    doc.setFontSize(8);
    doc.text('Integra · ' + new Date().toLocaleString('es-ES', { dateStyle: 'long' }), 105, 290, { align: 'center' });
    doc.save('informe_integra_' + new Date().toISOString().slice(0, 10) + '.pdf');
  }

  function onGestionCasosClick(e) {
    var btn = e.target.closest('.gestion-ver, .gestion-borrar');
    if (!btn) return;
    var i = parseInt(btn.getAttribute('data-i'), 10);
    var items = getCasosGestion();
    if (!items.length || i < 0 || i >= items.length) return;
    if (btn.classList.contains('gestion-ver')) {
      refreshGestionPlantilla(items[i]);
    } else {
      items = items.slice();
      items.splice(i, 1);
      saveCasosGestion(items);
      flushSave();
      refreshGestionCasos();
    }
  }

  function bindGestion() {
    var btnAdd = $('btnGestionAgregar');
    var btnCopy = $('btnGestionCopiar');
    var tbl = $('tablaGestionCasos');
    if (btnAdd) btnAdd.addEventListener('click', function () {
      var f = getFormGestion();
      if (!f.nombre && !f.numero) return;
      if (!f.nit) {
        var nitEl = $('gestionNit');
        if (nitEl) { nitEl.focus(); nitEl.placeholder = 'Enlace (obligatorio)'; }
        return;
      }
      f.fechaHora = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
      f.fechaHoraTs = Date.now();
      if (_gestionStartTime > 0) {
        var seg = Math.floor((Date.now() - _gestionStartTime) / 1000);
        var min = Math.floor(seg / 60);
        f.duracion = min > 0 ? min + ' min' + (seg % 60 > 0 ? ' ' + (seg % 60) + ' s' : '') : seg + ' s';
        _gestionStartTime = 0;
      }
      var arr = getCasosGestion().slice();
      arr.push(f);
      saveCasosGestion(arr);
      flushSave();
      clearFormGestion();
      refreshGestionCasos();
    });
    var nombreTecnicoEl = $('gestionNombre');
    if (nombreTecnicoEl && !nombreTecnicoEl._gestionTimerBound) {
      nombreTecnicoEl._gestionTimerBound = true;
      nombreTecnicoEl.addEventListener('input', function () {
        if (_gestionStartTime === 0 && this.value.trim().length > 0) _gestionStartTime = Date.now();
      });
    }
    if (btnCopy) btnCopy.addEventListener('click', function () {
      var el = $('gestionPlantilla');
      if (el && el.value) { try { navigator.clipboard.writeText(el.value); } catch (x) {} }
    });
    var btnExcel = $('btnGestionDescargarExcel');
    if (btnExcel) btnExcel.addEventListener('click', descargarExcelGestion);
    if (tbl && !tbl._gestionBound) {
      tbl._gestionBound = true;
      tbl.addEventListener('click', onGestionCasosClick);
    }
    var formCard = qs('.gestion-form-card');
    if (formCard && !formCard._gestionInputBound) {
      formCard._gestionInputBound = true;
      formCard.addEventListener('input', function () { refreshGestionPlantilla(); });
    }
    var trEl = $('gestionTransferencia');
    var extrasEl = $('gestionTransferenciaExtras');
    var pruebasEl = $('gestionPruebasSection');
    var areaEl = $('gestionAreaTransferir');
    var extEl = $('gestionExtensiones');
    var redEl = $('gestionRed'), nodoEl = $('gestionNodo'), cpeEl = $('gestionCpe');
    function toggleTransferenciaExtras() {
      var v = (trEl && trEl.value) || '';
      if (extrasEl) extrasEl.style.display = v === 'SI' ? '' : 'none';
      if (pruebasEl) pruebasEl.style.display = v === 'SI' ? 'none' : '';
      if (v === 'SI') {
        if (redEl) redEl.value = '';
        if (nodoEl) nodoEl.value = '';
        if (cpeEl) cpeEl.value = '';
      } else if (v !== 'SI') {
        if (areaEl) areaEl.value = '';
        if (extEl) extEl.value = '';
      }
      refreshGestionPlantilla();
    }
    if (trEl) trEl.addEventListener('change', toggleTransferenciaExtras);
    if (areaEl) areaEl.addEventListener('change', function () {
      var opt = areaEl.options[areaEl.selectedIndex];
      if (extEl) extEl.value = opt && opt.getAttribute('data-ext') ? opt.getAttribute('data-ext') : '';
      refreshGestionPlantilla();
    });
    toggleTransferenciaExtras();
  }

  function bindPortalUsuarios() {
    var tbl = $('tablaUsuarios');
    if (tbl && !tbl._portalBound) { tbl._portalBound = true; tbl.addEventListener('click', onPortalTableClick); tbl.addEventListener('change', onPortalTableChange); }
    var btnGen = $('btnGenerarClave');
    var btnAdd = $('btnAgregarUsuario');
    var btnBulk = $('btnGenerarUsuarios');
    if (btnGen) btnGen.addEventListener('click', function () {
      var el = $('portalClave');
      if (el) el.value = genClaveTemp();
    });
    if (btnAdd) btnAdd.addEventListener('click', function () {
      var nombre = ($('portalNombre') || {}).value || '';
      var usuario = ($('portalUsuario') || {}).value || nombreToLogin(nombre);
      var clave = ($('portalClave') || {}).value || genClaveTemp();
      if (!nombre.trim()) return;
      var items = (getData().portalUsuarios || []).slice();
      items.push({ nombre: nombre.trim(), usuario: usuario.trim() || nombreToLogin(nombre), clave: clave, estado: 'Temporal', role: 'agente' });
      saveData('portalUsuarios', items);
      refreshUsuariosPortal();
      if ($('portalNombre')) $('portalNombre').value = '';
      if ($('portalUsuario')) $('portalUsuario').value = '';
      if ($('portalClave')) $('portalClave').value = '';
    });
    if (btnBulk) btnBulk.addEventListener('click', function () {
      var ta = $('portalNombres');
      var text = (ta && ta.value) ? ta.value : '';
      var lines = text.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!lines.length) return;
      var items = (getData().portalUsuarios || []).slice();
      lines.forEach(function (nombre) {
        items.push({ nombre: nombre, usuario: nombreToLogin(nombre), clave: genClaveTemp(), estado: 'Temporal', role: 'agente' });
      });
      saveData('portalUsuarios', items);
      refreshUsuariosPortal();
      if (ta) ta.value = '';
    });
  }

  var MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  function updatePromedioDonut(data) {
    if (!data) data = getData();
    var items = (data.preturnos && Array.isArray(data.preturnos)) ? data.preturnos : PRETURNOS_DEFAULT;
    var totalProg = 0;
    var totalPromSum = 0;
    items.forEach(function (r) {
      var p = parseInt(r.programados, 10) || 0;
      var pr = parseFloat(String(r.promedio || '0').replace(',', '.')) || 0;
      totalProg += p;
      totalPromSum += p * pr;
    });
    var pct = totalProg > 0 ? Math.round((totalPromSum / totalProg) * 10) / 10 : 0;
    var displayVal = totalProg > 0 ? Math.round(totalPromSum / totalProg * 10) / 10 : 0;
    var pctClamp = Math.min(100, Math.max(0, pct));
    var needle = $('promedioNeedleDash');
    var val = $('promedioValorDash');
    var mes = $('promedioMesDash');
    if (needle) needle.setAttribute('transform', 'rotate(' + (-90 + pctClamp * 1.8) + ' 100 95)');
    if (val) val.textContent = displayVal;
    if (mes) mes.textContent = MESES[new Date().getMonth()] || '';
    var barA = $('desempenoBarAgentes');
    var valA = $('desempenoValAgentes');
    if (barA) barA.style.setProperty('--pct', Math.min(100, pct));
    if (valA) valA.textContent = displayVal;
  }

  function updatePromedioStaffDonut(data) {
    if (!data) data = getData();
    var items = (data.staff && Array.isArray(data.staff)) ? data.staff : STAFF_DEFAULT;
    var totalProg = 0;
    var totalAsistSum = 0;
    var totalPromSum = 0;
    items.forEach(function (r) {
      var p = parseInt(r.programados, 10) || 0;
      var a = parseInt(String(r.asistencia || '0').replace(/\D/g, ''), 10) || 0;
      var pr = parseFloat(String(r.promedio || '0').replace(',', '.')) || 0;
      totalProg += p;
      totalAsistSum += p * a;
      totalPromSum += p * pr;
    });
    var totalAsistPct = totalProg > 0 ? Math.round(totalAsistSum / totalProg) : 0;
    var totalPromVal = totalProg > 0 ? Math.round(totalPromSum / totalProg * 10) / 10 : 0;
    var needle = $('promedioStaffNeedleDash');
    var val = $('promedioStaffValorDash');
    var mes = $('promedioStaffMesDash');
    var pctForRing = Math.min(100, Math.max(0, totalPromVal));
    if (needle) needle.setAttribute('transform', 'rotate(' + (-90 + pctForRing * 1.8) + ' 100 95)');
    if (val) val.textContent = totalPromVal;
    if (mes) mes.textContent = MESES[new Date().getMonth()] || '';
    var barS = $('desempenoBarStaff');
    var valS = $('desempenoValStaff');
    if (barS) barS.style.setProperty('--pct', pctForRing);
    if (valS) valS.textContent = totalPromVal;
    var sparkStaff = (data.sparkStaff && Array.isArray(data.sparkStaff)) ? data.sparkStaff : [82, 84, 85, 86, 87, 88, 89];
    var newStaff = sparkStaff.slice(-6).concat(Math.round(totalPromVal));
    if (newStaff.length > 7) newStaff = newStaff.slice(-7);
    saveData('sparkStaff', newStaff);
    var sparkPret = (data.sparkPret && Array.isArray(data.sparkPret)) ? data.sparkPret : [85,88,90,88,92,91,92];
    var pretItems = (data.preturnos && Array.isArray(data.preturnos)) ? data.preturnos : [];
    if (pretItems.length) {
      var pSum = 0, prSum = 0;
      pretItems.forEach(function(r) { var px = parseInt(r.programados,10)||0; pSum += px; prSum += px*(parseFloat(String(r.promedio||'0').replace(',','.'))||0); });
      var lastVal = pSum > 0 ? Math.round(prSum/pSum*10)/10 : 92;
      var newPret = sparkPret.slice(-6).concat(lastVal);
      if (newPret.length > 7) newPret = newPret.slice(-7);
      saveData('sparkPret', newPret);
      sparkPret = newPret;
    }
    var el = $('sparkPret');
    if (el) drawSparklineDual(el, sparkPret, newStaff);
  }

  function getAsistClass(pct) {
    if (pct < 90) return 'asist-low';
    if (pct < 95) return 'asist-mid';
    return 'asist-high';
  }

  function refreshPreturnos(data) {
    if (!data) data = getData();
    var items = (data.preturnos && Array.isArray(data.preturnos)) ? data.preturnos : PRETURNOS_DEFAULT;
    var tbody = $('preturnosBody');
    if (!tbody) return;
    tbody.innerHTML = items.map(function (r, i) {
      var asistCls = getAsistClass(r.asistencia || 0);
      return '<tr><td class="preturnos-cell-editable" contenteditable="true" data-pret="skill" data-i="' + i + '">' + (r.skill || '') + '</td><td class="preturnos-cell-editable" contenteditable="true" data-pret="programados" data-i="' + i + '">' + (r.programados || 0) + '</td><td class="preturnos-cell-editable ' + asistCls + '" contenteditable="true" data-pret="asistencia" data-i="' + i + '">' + (r.asistencia || 0) + '%</td><td class="preturnos-cell-editable" contenteditable="true" data-pret="promedio" data-i="' + i + '">' + (r.promedio || 0) + '</td></tr>';
    }).join('');

    var totalProg = 0;
    var totalAsistSum = 0;
    var totalPromSum = 0;
    items.forEach(function (r) {
      var p = parseInt(r.programados, 10) || 0;
      var a = parseInt(String(r.asistencia || '0').replace(/\D/g, ''), 10) || 0;
      var pr = parseFloat(String(r.promedio || '0').replace(',', '.')) || 0;
      totalProg += p;
      totalAsistSum += p * a;
      totalPromSum += p * pr;
    });
    var totalAsistPct = totalProg > 0 ? Math.round(totalAsistSum / totalProg) : 0;
    var totalPromVal = totalProg > 0 ? Math.round(totalPromSum / totalProg * 10) / 10 : 0;

    var elProg = $('preturnosTotalProg');
    var elAsist = $('preturnosTotalAsist');
    var elProm = $('preturnosTotalProm');
    if (elProg) elProg.textContent = totalProg;
    if (elAsist) {
      elAsist.textContent = totalAsistPct + ' %';
      elAsist.className = getAsistClass(totalAsistPct);
    }
    if (elProm) {
      elProm.textContent = totalPromVal;
      elProm.className = 'preturnos-total-prom';
    }
    updatePromedioDonut(data);
    updatePromedioStaffDonut(data);
  }

  function refreshStaff(data) {
    if (!data) data = getData();
    var items = (data.staff && Array.isArray(data.staff)) ? data.staff : STAFF_DEFAULT;
    var tbody = $('staffBody');
    if (!tbody) return;
    tbody.innerHTML = items.map(function (r, i) {
      var asistCls = getAsistClass(r.asistencia || 0);
      return '<tr><td class="preturnos-cell-editable" contenteditable="true" data-staff="skill" data-i="' + i + '">' + (r.skill || '') + '</td><td class="preturnos-cell-editable" contenteditable="true" data-staff="programados" data-i="' + i + '">' + (r.programados || 0) + '</td><td class="preturnos-cell-editable ' + asistCls + '" contenteditable="true" data-staff="asistencia" data-i="' + i + '">' + (r.asistencia || 0) + '%</td><td class="preturnos-cell-editable" contenteditable="true" data-staff="promedio" data-i="' + i + '">' + (r.promedio || 0) + '</td></tr>';
    }).join('');

    var totalProg = 0;
    var totalAsistSum = 0;
    var totalPromSum = 0;
    items.forEach(function (r) {
      var p = parseInt(r.programados, 10) || 0;
      var a = parseInt(String(r.asistencia || '0').replace(/\D/g, ''), 10) || 0;
      var pr = parseFloat(String(r.promedio || '0').replace(',', '.')) || 0;
      totalProg += p;
      totalAsistSum += p * a;
      totalPromSum += p * pr;
    });
    var totalAsistPct = totalProg > 0 ? Math.round(totalAsistSum / totalProg) : 0;
    var totalPromVal = totalProg > 0 ? Math.round(totalPromSum / totalProg * 10) / 10 : 0;

    var elProg = $('staffTotalProg');
    var elAsist = $('staffTotalAsist');
    var elProm = $('staffTotalProm');
    if (elProg) elProg.textContent = totalProg;
    if (elAsist) {
      elAsist.textContent = totalAsistPct + ' %';
      elAsist.className = getAsistClass(totalAsistPct);
    }
    if (elProm) {
      elProm.textContent = totalPromVal;
      elProm.className = 'preturnos-total-prom';
    }
    updatePromedioStaffDonut(data);
  }

  function parseRowItems(prefix) {
    var items = [];
    qsAll('[data-' + prefix + '="skill"]').forEach(function (el) {
      var i = parseInt(el.getAttribute('data-i'), 10);
      var progEl = qs('[data-' + prefix + '="programados"][data-i="' + i + '"]');
      var asistEl = qs('[data-' + prefix + '="asistencia"][data-i="' + i + '"]');
      var promEl = qs('[data-' + prefix + '="promedio"][data-i="' + i + '"]');
      var p = parseInt((progEl && progEl.textContent ? progEl.textContent : '0').replace(/\D/g, ''), 10) || 0;
      var a = parseInt((asistEl && asistEl.textContent ? asistEl.textContent : '0').replace(/\D/g, ''), 10) || 0;
      var pr = parseFloat(String((promEl && promEl.textContent ? promEl.textContent : '0')).replace(',', '.')) || 0;
      items.push({ skill: (el.textContent || '').trim(), programados: p, asistencia: a, promedio: pr });
    });
    return items;
  }
  function saveStaff() { saveData('staff', parseRowItems('staff')); }
  function savePreturnos() { saveData('preturnos', parseRowItems('pret')); }

  var _focusBound;
  function bindReincRankEditable() {
    if (_focusBound) return;
    _focusBound = true;
    function saveReinc() {
      var items = [];
      qsAll('[data-reinc="tipo"]').forEach(function (el) {
        var i = parseInt(el.getAttribute('data-i'), 10);
        var countEl = qs('[data-reinc="count"][data-i="' + i + '"]');
        items[i] = { tipo: el.textContent.trim(), count: parseInt((countEl || {}).textContent || '0', 10) || 0 };
      });
      saveData('reincidencias', items);
    }
    function saveRank(isLow) {
      var key = isLow ? 'menosCierran' : 'masCierran';
      var items = [];
      qsAll('[data-rank="nombre"][data-low="' + (isLow ? 1 : 0) + '"]').forEach(function (el) {
        var i = parseInt(el.getAttribute('data-i'), 10);
        var valEl = qs('[data-rank="cierres"][data-low="' + (isLow ? 1 : 0) + '"][data-i="' + i + '"]');
        items[i] = { nombre: el.textContent.trim(), cierres: parseInt((valEl || {}).textContent || '0', 10) || 0 };
      });
      saveData(key, items);
    }
    /* Event delegation: un solo focusout para todo editable */
    document.addEventListener('focusout', function (e) {
      if (!isAdmin()) return;
      var t = e.target;
      if (!t || !t.getAttribute) return;
      try {
      if (t.hasAttribute('data-key')) {
        var key = t.getAttribute('data-key');
          var raw = (t.textContent || '').trim();
          if (key === 'aprobo' || key === 'reprobo') {
            var val = parseInt(String(raw).replace(/\D/g, ''), 10);
            var presento = parseNum($('formPresento'));
            if (!isNaN(val) && presento > 0 && val > presento) {
              val = presento;
              t.textContent = val;
              raw = String(val);
            }
          }
          saveData(key, raw);
        if (key === 'presento' || key === 'pendiente') { updateAsistencia(); updateResultados(); }
        else if (key === 'publicoObjetivo') { updateResultados(); }
        else if (key === 'aprobo' || key === 'reprobo' || key === 'novedades') { updateResultados(); }
      } else if (t.hasAttribute('data-reinc')) {
        saveReinc();
          refreshReincidencias(getData(), getGestionDataFromStorage());
      } else if (t.hasAttribute('data-rank')) {
        saveRank(t.getAttribute('data-low') === '1');
          refreshRankings(getData(), getGestionDataFromStorage());
      } else if (t.hasAttribute('data-pret')) {
        savePreturnos();
        refreshPreturnos();
      } else if (t.hasAttribute('data-staff')) {
        saveStaff();
        refreshStaff();
      }
      } catch (err) { /* fallback silencioso para evitar dañar la app */ }
    });
  }

  function _barRow(display, pct, count, fillCls) {
    return '<div class="reincidencia-bar-row"><span class="reincidencia-bar-nit" title="' + display + '">' + display + '</span><div class="reincidencia-bar-track"><div class="reincidencia-bar-fill' + (fillCls ? ' ' + fillCls : '') + '" style="width:' + pct + '%"></div></div><span class="reincidencia-bar-val">' + count + '</span></div>';
  }
  function refreshReincidencias(data, gestionData) {
    if (!data) data = getData();
    var byCI = data.bolsaReincidenciasByCI;
    var reinc = [], sinEnlace = [], SK = 'Sin CI/AFECTADO';
    if (isAdmin() && byCI && byCI.length) {
      byCI.forEach(function (g) {
        var c = g.codigoCI || SK;
        if (c === SK) (g.nits || []).forEach(function (r) { sinEnlace.push({ tipo: r.tipo, count: r.count || 0 }); });
        else reinc.push({ codigoCI: c, count: (g.nits || []).reduce(function (s, r) { return s + (r.count || 0); }, 0) });
      });
      reinc.sort(function (a, b) { return b.count - a.count; });
      sinEnlace.sort(function (a, b) { return b.count - a.count; });
    }
    var max = 1, i, parts = [];
    for (i = 0; i < reinc.length; i++) if (reinc[i].count > max) max = reinc[i].count;
    var barsEl = $('reincidenciaBars');
    if (barsEl) {
      if (!reinc.length) barsEl.innerHTML = '<div class="letra-mas-afectada-empty">Sin datos. Importa reincidencias con columna CI/AFECTADO en Bolsa.</div>';
      else {
        for (i = 0; i < Math.min(10, reinc.length); i++) {
          var r = reinc[i], d = escapeHtml(r.codigoCI);
          if (d.length > 24) d = d.slice(0, 22) + '…';
          parts.push(_barRow(d, max ? Math.round((r.count / max) * 100) : 0, r.count, ''));
        }
        barsEl.innerHTML = parts.join('');
      }
    }
    max = 1;
    for (i = 0; i < sinEnlace.length; i++) if (sinEnlace[i].count > max) max = sinEnlace[i].count;
    var barsSinEl = $('reincidenciaBarsSinEnlace');
    if (barsSinEl) {
      if (!sinEnlace.length) barsSinEl.innerHTML = '<div class="letra-mas-afectada-empty">No hay NITs sin código de enlace.</div>';
      else {
        parts = [];
        for (i = 0; i < Math.min(10, sinEnlace.length); i++) {
          var s = sinEnlace[i], lbl = (s.tipo || '').replace(/^NIT\s+/i, ''), d = 'NIT ' + escapeHtml(lbl);
          if (d.length > 28) d = d.slice(0, 26) + '…';
          parts.push(_barRow(d, max ? Math.round((s.count / max) * 100) : 0, s.count, 'reincidencia-bar-fill-sin-enlace'));
        }
        barsSinEl.innerHTML = parts.join('');
      }
    }
  }

  function refreshRankings(data, gestionData) {
    if (!data) data = getData();
    var contMas = $('rankingMasCierran');
    if (contMas && isAdmin()) {
      var bolsa = getBolsaData();
      var res = bolsa.resueltos || _bolsaDef;
      var totalRes = (res.backNegocios || 0) + (res.negociosGI || 0) + (res.proactividadVIP || 0);
      contMas.innerHTML = '<div class="total-gestion-wrap"><span class="total-gestion-num">' + totalRes + '</span><span class="total-gestion-label">resueltos</span></div>';
    } else if (contMas) {
    var masCierran = (data.masCierran && Array.isArray(data.masCierran)) ? data.masCierran : [];
      var max = Math.max.apply(null, masCierran.map(function (x) { return x.cierres || 0; })) || 1;
      contMas.innerHTML = masCierran.map(function (r, i) {
        var pct = Math.round(((r.cierres || 0) / max) * 100);
        return '<div class="rank-item"><span class="rank-pos">' + (i + 1) + '</span><div class="rank-bar-wrap"><div class="rank-bar" style="--pct:' + pct + '"></div><span class="rank-name editable" contenteditable="true" data-rank="nombre" data-low="0" data-i="' + i + '">' + (r.nombre || '') + '</span></div><span class="rank-val editable" contenteditable="true" data-rank="cierres" data-low="0" data-i="' + i + '">' + (r.cierres || 0) + '</span></div>';
      }).join('');
    }
    refreshCalidadAll();
  }

  function refreshLetraMasAfectada(metrics) {
    var wrap = $('letraMasAfectadaWrap');
    if (!wrap) return;
    var m = metrics || getCalidadMetrics();
    var items = m.letraMasAfectada;
    if (!items.length) {
      wrap.innerHTML = '<div class="letra-mas-afectada-empty">Sin datos de auditorías. Registra ítems en Calidad.</div>';
      return;
    }
    var top = items[0];
    var spark = m.spark;
    var hasSpark = spark.some(function (v) { return v > 0; });
    var sparkStr = hasSpark ? spark.map(function (v) { var m = Math.max.apply(null, spark) || 1; return _sparkChars[Math.min(7, Math.floor((v / m) * 8))]; }).join('') : '';
    wrap.innerHTML = '<div class="total-gestion-wrap"><span class="total-gestion-num">' + (top.count || 0) + '</span><span class="total-gestion-label">' + escapeHtml(top.item || '—') + '</span></div>' + (sparkStr ? '<div class="calidad-spark"><span class="calidad-spark-chars">' + sparkStr + '</span><span class="calidad-spark-label">Últimos 7 días</span></div>' : '');
  }
  function refreshCalidadSemaforo(metrics) {
    var wrap = $('calidadSemaforoWrap');
    if (!wrap) return;
    var total = (metrics && metrics.totalAuditorias !== undefined) ? metrics.totalAuditorias : getAuditoriasAgentes().length;
    var cls = total <= 5 ? 'semaforo-ok' : (total <= 15 ? 'semaforo-med' : 'semaforo-alert');
    wrap.innerHTML = '<div class="semaforo-dot ' + cls + '" title="' + total + ' auditorías"></div><span class="semaforo-label">' + total + ' incidencias registradas</span>';
  }
  function refreshCalidadInsight(metrics) {
    var wrap = $('calidadInsightWrap');
    if (!wrap) return;
    var m = metrics || getCalidadMetrics();
    var items = m.letraMasAfectada;
    if (!items.length) {
      wrap.innerHTML = '<p class="insight-empty">Registra auditorías para obtener insights automáticos.</p>';
      return;
    }
    var total = m.totalAuditorias;
    var top = items[0];
    var pct = total > 0 ? Math.round(((top.count || 0) / total) * 100) : 0;
    var txt = top.item || top.macro || '—';
    if (txt.length > 45) txt = txt.slice(0, 42) + '…';
    wrap.innerHTML = '<p class="insight-p">El <strong>' + pct + '%</strong> de los errores se concentran en<br><strong>' + escapeHtml(txt) + '</strong></p><p class="insight-rec">Recomendación: refuerzo de checklist técnico.</p>';
  }
  function refreshCalidadTendencia(metrics) {
    var wrap = $('calidadTendenciaWrap');
    if (!wrap) return;
    var spark = (metrics && metrics.spark) ? metrics.spark : getCalidadSparklineData();
    var tot = spark.reduce(function (a, b) { return a + b; }, 0);
    if (tot === 0) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    var sparkStr = spark.map(function (v) { var m = Math.max.apply(null, spark) || 1; return _sparkChars[Math.min(7, Math.floor((v / m) * 8))]; }).join('');
    wrap.innerHTML = '<div class="calidad-tendencia-inner"><span class="calidad-tendencia-num">' + tot + '</span><span class="calidad-tendencia-spark">' + sparkStr + '</span><span class="calidad-tendencia-label">Últimos 7 días</span></div>';
  }
  function refreshTop3Macroprocesos(metrics) {
    var wrap = $('top3MacroWrap');
    if (!wrap) return;
    var items = (metrics && metrics.top3Macro) ? metrics.top3Macro : getTop3MacroprocesosAfectados();
    if (!items.length) {
      wrap.innerHTML = '<div class="letra-mas-afectada-empty">Sin datos. Registra auditorías en Calidad.</div>';
      return;
    }
    var max = Math.max.apply(null, items.map(function (r) { return r.count || 0; })) || 1;
    var h = 80;
    wrap.innerHTML = '<div class="top3-macro-chart">' + items.map(function (r) {
      var c = r.count || 0;
      var px = max > 0 ? Math.round((c / max) * h) : 0;
      if (px < 6 && c > 0) px = 6;
      var cls = (c >= max && c > 0) ? ' top3-macro-fill-max' : '';
      return '<div class="top3-macro-bar"><span class="top3-macro-val">' + c + '</span><div class="top3-macro-fill-wrap"><div class="top3-macro-fill' + cls + '" style="height:' + px + 'px"></div></div><span class="top3-macro-label">' + escapeHtml(r.macro || '—') + '</span></div>';
    }).join('') + '</div>';
  }

  function refreshAuditoriasTable() {
    var items = getAuditoriasAgentes();
    var tbody = $('auditoriasBody');
    var emptyEl = $('auditoriasEmpty');
    if (emptyEl) emptyEl.style.display = items.length ? 'none' : 'block';
    if (!tbody) return;
    tbody.innerHTML = items.map(function (r, i) {
      var letra = r.letra || '';
      var macro = r.macroproceso || '';
      var desc = r.descripcionItem || r.itemAfectado || '';
      return '<tr><td>' + escapeHtml(r.agente || '') + '</td><td>' + escapeHtml(r.nota || '') + '</td><td>' + escapeHtml(letra) + '</td><td>' + escapeHtml(macro) + '</td><td>' + escapeHtml(desc) + '</td><td><button type="button" class="btn-remove auditoria-borrar" data-i="' + i + '">Quitar</button></td></tr>';
    }).join('');
  }

  var _escMap = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' };
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"]/g, function (c) { return _escMap[c] || c; });
  }

  function onAuditoriasTableClick(e) {
    var btn = e.target.closest('.auditoria-borrar');
    if (!btn) return;
    var i = parseInt(btn.getAttribute('data-i'), 10);
    var items = getAuditoriasAgentes();
    if (i < 0 || i >= items.length) return;
    items = items.slice();
    items.splice(i, 1);
    saveAuditoriasAgentes(items);
    flushSave();
    refreshAuditoriasTable();
    refreshCalidadAll();
  }

  function refreshCalidadAll() {
    var m = getCalidadMetrics();
    refreshLetraMasAfectada(m);
    refreshTop3Macroprocesos(m);
    refreshCalidadSemaforo(m);
    refreshCalidadInsight(m);
    refreshCalidadTendencia(m);
  }

  function resetAuditoriaForm() {
    var a = $('auditoriaAgente'), n = $('auditoriaNota'), l = $('auditoriaLetra'), i = $('auditoriaItem'), c = $('auditoriaItemCausales');
    if (a) a.value = ''; if (n) n.value = ''; if (l) l.value = '';
    if (i) i.innerHTML = _selItemPlaceholder;
    if (c) { c.innerHTML = _selCausalPlaceholder; c.style.display = 'none'; }
  }
  var _imPattern = /^(IM|INC)\d+$/i;
  function parseAsignarIms(text) {
    if (!text || !text.trim()) return [];
    var lines = text.trim().split(/\r?\n/);
    var ims = [];
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(/[\t;,]/);
      for (var j = 0; j < parts.length; j++) {
        var v = parts[j].trim();
        if (v && _imPattern.test(v)) ims.push(v);
      }
    }
    return ims;
  }
  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function assignImsToAgentes(ims, agentes) {
    if (!agentes || !agentes.length) return [];
    var shuffled = shuffleArray(ims.slice());
    var out = agentes.map(function (a) { return { agente: a.nombre || '', usuario: a.usuario || '', ims: [] }; });
    for (var i = 0; i < shuffled.length; i++) out[i % out.length].ims.push(shuffled[i]);
    return out;
  }
  function getPortalAgentes() {
    var d = getData();
    var list = (d.portalUsuarios && Array.isArray(d.portalUsuarios)) ? d.portalUsuarios : [];
    return list.filter(function (u) { return (u.nombre || u.usuario); }).map(function (u) { return { nombre: u.nombre || u.usuario, usuario: u.usuario || u.nombre }; });
  }
  function refreshAsignarCasosTable(asignacion) {
    var tbody = $('asignarCasosBody');
    var emptyEl = $('asignarCasosEmpty');
    if (!tbody) return;
    if (emptyEl) emptyEl.style.display = (asignacion && asignacion.length) ? 'none' : 'block';
    if (!asignacion || !asignacion.length) {
      tbody.innerHTML = '';
      return;
    }
    tbody.innerHTML = asignacion.map(function (r) {
      var imsStr = (r.ims && r.ims.length) ? r.ims.join(', ') : '—';
      return '<tr><td>' + escapeHtml(r.agente) + '</td><td>' + escapeHtml(r.usuario) + '</td><td><span class="asignar-ims-list">' + escapeHtml(imsStr) + '</span></td></tr>';
    }).join('');
  }
  function parseReincidenciaExcel(text) {
    var ahora = Date.now();
    var porNit = {};
    var porCI = {};
    if (!text || !text.trim()) return { flat: [], byCI: [] };
    var lines = text.trim().split(/\r?\n/);
    var nitCol = -1, fechaCol = -1, ciCol = -1;
    function parseFecha(s) {
      if (!s || !String(s).trim()) return null;
      s = String(s).trim();
      var n = parseFloat(s);
      if (!isNaN(n) && n > 1000) {
        var d = new Date((n - 25569) * 86400 * 1000);
        return isNaN(d.getTime()) ? null : d.getTime();
      }
      var m = s.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
      if (m) {
        var y = parseInt(m[3], 10);
        var mo = parseInt(m[2], 10) - 1;
        var day = parseInt(m[1], 10);
        if (y < 100) y += 2000;
        if (m[1].length > 2) { day = parseInt(m[3], 10); mo = parseInt(m[2], 10) - 1; y = parseInt(m[1], 10); }
        var d = new Date(y, mo, day);
        return isNaN(d.getTime()) ? null : d.getTime();
      }
      var d = new Date(s);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    for (var i = 0; i < lines.length; i++) {
      var cells = lines[i].split(/[\t;]/).map(function (c) { return c.trim(); });
      if (!cells.length) continue;
      if (i === 0) {
        var isHeader = false;
        for (var j = 0; j < cells.length; j++) {
          var c = cells[j].toLowerCase();
          if (/nit|identificador|^cliente$|n[uú]mero|id cliente/i.test(c)) { nitCol = j; isHeader = true; }
          if (/fecha|date|creado|creaci[oó]n/i.test(c)) { fechaCol = j; isHeader = true; }
          if (/ci\/afectado|ci afectado|c[oó]digo\s*enlace|ci\s*afec/i.test(c)) { ciCol = j; isHeader = true; }
        }
        if (nitCol < 0) nitCol = 0;
        if (fechaCol < 0) fechaCol = cells.length > 1 ? 1 : 0;
        if (isHeader) continue;
      }
      var nit = String(cells[nitCol] || cells[0] || '').trim();
      var ts = parseFecha(cells[fechaCol] || cells[1] || '');
      var ci = ciCol >= 0 ? String(cells[ciCol] || '').trim() : '';
      if (!nit || /^(nit|fecha|id|open|estado)$/i.test(nit)) continue;
      if (!/\d{6,}/.test(nit)) continue;
      if (!ts || ahora - ts > TRES_MESES_MS) continue;
      var fecha = new Date(ts).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
      if (!porNit[nit]) porNit[nit] = { count: 0, fechas: [] };
      porNit[nit].count++;
      porNit[nit].fechas.push(fecha);
      if (ciCol >= 0) {
        var cod = ci || 'Sin CI/AFECTADO';
        if (!porCI[cod]) porCI[cod] = {};
        if (!porCI[cod][nit]) porCI[cod][nit] = { count: 0, fechas: [] };
        porCI[cod][nit].count++;
        porCI[cod][nit].fechas.push(fecha);
      }
    }
    var out = [];
    for (var n in porNit) {
      if (porNit[n].count >= 2) out.push({ tipo: 'NIT ' + n, count: porNit[n].count, fechas: porNit[n].fechas });
    }
    out.sort(function (a, b) { return b.count - a.count; });
    var byCI = [];
    for (var cod in porCI) {
      var nits = [];
      for (var n in porCI[cod]) {
        if (porCI[cod][n].count >= 2) nits.push({ tipo: 'NIT ' + n, count: porCI[cod][n].count, fechas: porCI[cod][n].fechas });
      }
      if (nits.length) {
        nits.sort(function (a, b) { return b.count - a.count; });
        byCI.push({ codigoCI: cod, nits: nits });
      }
    }
    byCI.sort(function (a, b) {
      var ta = a.nits.reduce(function (s, x) { return s + x.count; }, 0);
      var tb = b.nits.reduce(function (s, x) { return s + x.count; }, 0);
      return tb - ta;
    });
    return { flat: out, byCI: byCI };
  }
  function refreshReincidenciaBolsa(data) {
    var totalEl = $('reincidenciaTotalVal');
    var tbody = $('reincidenciaBodyBolsa');
    var emptyEl = $('reincidenciaEmptyBolsa');
    if (!totalEl && !tbody) return;
    var flat = Array.isArray(data) ? data : (data && data.flat) ? data.flat : [];
    var byCI = (data && data.byCI && data.byCI.length) ? data.byCI : null;
    var total = flat.reduce(function (a, r) { return a + (r.count || 0); }, 0);
    if (totalEl) totalEl.textContent = total;
    if (emptyEl) emptyEl.style.display = (flat.length || (byCI && byCI.length)) ? 'none' : 'block';
    if (tbody) {
      if (byCI && byCI.length) {
        var rows = [];
        byCI.forEach(function (g) {
          g.nits.forEach(function (r) {
            var nit = (r.tipo || '').replace(/^NIT\s+/i, '') || '—';
            rows.push('<tr><td>' + escapeHtml(g.codigoCI) + '</td><td>NIT ' + escapeHtml(nit) + '</td><td class="reinc-count-cell">' + (r.count || 0) + '</td></tr>');
          });
        });
        tbody.innerHTML = rows.join('');
      } else if (flat.length) {
        tbody.innerHTML = flat.map(function (r) {
          var nit = (r.tipo || '').replace(/^NIT\s+/i, '') || '—';
          return '<tr><td>—</td><td>NIT ' + escapeHtml(nit) + '</td><td class="reinc-count-cell">' + (r.count || 0) + '</td></tr>';
        }).join('');
      } else {
        tbody.innerHTML = '';
      }
    }
  }
  function _catFromText(t) {
    if (!t) return '';
    var s = (t + '').toLowerCase();
    if (s.indexOf('back negocios') >= 0 || s.indexOf('soporte back') >= 0) return 'backNegocios';
    if (s.indexOf('negocios gi') >= 0) return 'negociosGI';
    if (s.indexOf('proactividad') >= 0 && s.indexOf('vip') >= 0) return 'proactividadVIP';
    return '';
  }
  function parseBolsaExcel(text) {
    var abiertos = { backNegocios: 0, negociosGI: 0, proactividadVIP: 0 };
    var sla = { backNegocios: 0, negociosGI: 0, proactividadVIP: 0 };
    var resueltos = { backNegocios: 0, negociosGI: 0, proactividadVIP: 0 };
    if (!text || !text.trim()) return { abiertos: abiertos, sla: sla, resueltos: resueltos };
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { abiertos: abiertos, sla: sla, resueltos: resueltos };
    var sep = lines[0].indexOf('\t') >= 0 ? '\t' : ';';
    var headers = lines[0].split(sep);
    var idxId = -1, idxPrioridad = -1, idxEstadoAlerta = -1, idxEstado = -1, idxGrupo = -1;
    for (var h = 0; h < headers.length; h++) {
      var x = headers[h].toLowerCase().trim();
      if (x.indexOf('id') >= 0 && x.indexOf('incidente') >= 0) idxId = h;
      else if (x === 'prioridad') idxPrioridad = h;
      else if (x.indexOf('estado') >= 0 && x.indexOf('alerta') >= 0) idxEstadoAlerta = h;
      else if (x === 'estado' && idxEstado < 0) idxEstado = h;
      else if (x.indexOf('grupo') >= 0 && x.indexOf('asignaci') >= 0) idxGrupo = h;
    }
    if (idxEstadoAlerta < 0) idxEstadoAlerta = idxEstado >= 0 ? idxEstado : 2;
    if (idxGrupo < 0) idxGrupo = idxEstado >= 0 ? idxEstado : 3;
    if (idxEstado < 0) idxEstado = 4;
    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split(sep);
      var estadoAlerta = (cells[idxEstadoAlerta] || '').trim().toLowerCase();
      var estado = (cells[idxEstado] || '').trim();
      var grupo = (cells[idxGrupo] || '').trim();
      var cat = _catFromText(grupo) || _catFromText(estado);
      if (!cat) continue;
      if (estadoAlerta === 'open' || estadoAlerta === '') {
        abiertos[cat]++;
      } else if (estadoAlerta.indexOf('50%') >= 0 || estadoAlerta === '50') {
        sla[cat]++;
      } else if (estadoAlerta.indexOf('75%') >= 0 || estadoAlerta === '75') {
        sla[cat]++;
      } else if (estadoAlerta.indexOf('100%') >= 0 || estadoAlerta === '100' || estado.toLowerCase().indexOf('resuel') >= 0) {
        resueltos[cat]++;
      }
    }
    return { abiertos: abiertos, sla: sla, resueltos: resueltos };
  }
  function bindBolsa() {
    var b = getBolsaCasosAbiertos();
    var s = getBolsaSlaFaseCierre();
    var e1 = $('bolsaBackNegocios'), e2 = $('bolsaNegociosGI'), e3 = $('bolsaProactividad');
    var se1 = $('bolsaSlaBackNegocios'), se2 = $('bolsaSlaNegociosGI'), se3 = $('bolsaSlaProactividad');
    if (e1) e1.value = b.backNegocios;
    if (e2) e2.value = b.negociosGI;
    if (e3) e3.value = b.proactividadVIP;
    if (se1) se1.value = s.backNegocios || 0;
    if (se2) se2.value = s.negociosGI || 0;
    if (se3) se3.value = s.proactividadVIP || 0;
    var btnImp = $('btnBolsaImportar');
    if (btnImp) btnImp.addEventListener('click', function () {
      var ta = $('bolsaPegar');
      var txt = (ta && ta.value) || '';
      var res = parseBolsaExcel(txt);
      if (e1) e1.value = res.abiertos.backNegocios;
      if (e2) e2.value = res.abiertos.negociosGI;
      if (e3) e3.value = res.abiertos.proactividadVIP;
      if (se1) se1.value = res.sla.backNegocios || 0;
      if (se2) se2.value = res.sla.negociosGI || 0;
      if (se3) se3.value = res.sla.proactividadVIP || 0;
      saveBolsaCasosAbiertos(res.abiertos);
      saveData('bolsaSlaFaseCierre', res.sla);
      saveData('bolsaResueltos', res.resueltos);
      flushSave();
      refreshGestionOperacion();
    });
    var btn = $('btnBolsaGuardar');
    if (btn) btn.addEventListener('click', function () {
      var n1 = parseInt((e1 && e1.value) || '0', 10) || 0;
      var n2 = parseInt((e2 && e2.value) || '0', 10) || 0;
      var n3 = parseInt((e3 && e3.value) || '0', 10) || 0;
      var sn1 = parseInt((se1 && se1.value) || '0', 10) || 0;
      var sn2 = parseInt((se2 && se2.value) || '0', 10) || 0;
      var sn3 = parseInt((se3 && se3.value) || '0', 10) || 0;
      saveBolsaCasosAbiertos({ backNegocios: n1, negociosGI: n2, proactividadVIP: n3 });
      saveData('bolsaSlaFaseCierre', { backNegocios: sn1, negociosGI: sn2, proactividadVIP: sn3 });
      flushSave();
      refreshGestionOperacion();
    });
    var btnReinc = $('btnReincidenciaImportar');
    var taReinc = $('reincidenciaPegar');
    if (btnReinc && taReinc) btnReinc.addEventListener('click', function () {
      var res = parseReincidenciaExcel(taReinc.value || '');
      saveData('bolsaReincidencias', res.flat);
      saveData('bolsaReincidenciasByCI', res.byCI);
      flushSave();
      refreshReincidenciaBolsa(res);
      refreshReincidencias(getData(), getGestionDataFromStorage());
    });
    var bolsaReinc = getData().bolsaReincidencias;
    var bolsaByCI = getData().bolsaReincidenciasByCI;
    if (bolsaReinc || bolsaByCI) refreshReincidenciaBolsa(bolsaByCI && bolsaByCI.length ? { flat: bolsaReinc || [], byCI: bolsaByCI } : (bolsaReinc || []));

    var hfcContactoEl = $('bolsaHfcCierresContacto');
    var hfcBuzonEl = $('bolsaHfcCierresBuzon');
    var hfcReincNumEl = $('bolsaHfcReincidenciasNum');
    var dHfc = getData();
    if (hfcContactoEl) hfcContactoEl.value = dHfc.bolsaHfcCierresContacto || 0;
    if (hfcBuzonEl) hfcBuzonEl.value = dHfc.bolsaHfcCierresBuzon || 0;
    if (hfcReincNumEl) hfcReincNumEl.value = dHfc.bolsaHfcReincidenciasNum || 0;
    var btnHfcReinc = $('btnHfcReincidenciaImportar');
    var taHfcReinc = $('hfcReincidenciaPegar');
    if (btnHfcReinc && taHfcReinc) btnHfcReinc.addEventListener('click', function () {
      var res = parseReincidenciaExcel(taHfcReinc.value || '');
      saveData('bolsaHfcReincidencias', res.flat);
      var tot = res.flat.reduce(function (s, r) { return s + (r.count || 0); }, 0);
      if (hfcReincNumEl) hfcReincNumEl.value = tot;
      saveHfcFormData();
    });
    function saveHfcFormData() {
      var nc = parseInt((hfcContactoEl && hfcContactoEl.value) || '0', 10) || 0;
      var nb = parseInt((hfcBuzonEl && hfcBuzonEl.value) || '0', 10) || 0;
      var rn = parseInt((hfcReincNumEl && hfcReincNumEl.value) || '0', 10) || 0;
      saveData('bolsaHfcCierresContacto', nc);
      saveData('bolsaHfcCierresBuzon', nb);
      saveData('bolsaHfcReincidenciasNum', rn);
      flushSave();
      refreshGestionOperacionHfc();
    }
    if (hfcContactoEl) hfcContactoEl.addEventListener('change', saveHfcFormData);
    if (hfcBuzonEl) hfcBuzonEl.addEventListener('change', saveHfcFormData);
    if (hfcReincNumEl) hfcReincNumEl.addEventListener('change', saveHfcFormData);

    var sectionBolsa = document.getElementById('section-bolsa');
    if (sectionBolsa) sectionBolsa.addEventListener('click', function (e) {
      if (e.target.id !== 'btnAsignarCasosImportar') return;
      var ta = document.getElementById('asignarCasosPegar');
      var ims = parseAsignarIms(ta ? ta.value : '');
      var agentes = getPortalAgentes();
      var emptyEl = document.getElementById('asignarCasosEmpty');
      if (!agentes.length) {
        if (emptyEl) { emptyEl.style.display = ''; emptyEl.textContent = 'No hay agentes. Agrega usuarios en la sección Agentes antes de asignar.'; }
        refreshAsignarCasosTable([]);
        return;
      }
      if (!ims.length) {
        var sinIms = agentes.map(function (a) { return { agente: a.nombre, usuario: a.usuario, ims: [] }; });
        refreshAsignarCasosTable(sinIms);
        alert('No se encontraron IMs (formato IM o INC + dígitos). Revisa los datos pegados.');
        return;
      }
      var asignacion = assignImsToAgentes(ims, agentes);
      saveData('asignarCasosAsignacion', asignacion);
      flushSave();
      refreshAsignarCasosTable(asignacion);
    });
    var asignacionGuardada = getData().asignarCasosAsignacion;
    if (asignacionGuardada && Array.isArray(asignacionGuardada) && asignacionGuardada.length) {
      refreshAsignarCasosTable(asignacionGuardada);
    } else {
      var agentes = getPortalAgentes();
      if (agentes.length) refreshAsignarCasosTable(agentes.map(function (a) { return { agente: a.nombre, usuario: a.usuario, ims: [] }; }));
    }
  }

  function bindCalidad() {
    initMatrizLetraSelects();
    var btnAdd = $('btnAuditoriaAgregar'), tbl = $('tablaAuditorias');
    if (btnAdd) btnAdd.addEventListener('click', function () {
      var a = $('auditoriaAgente'), n = $('auditoriaNota'), l = $('auditoriaLetra'), sel = $('auditoriaItem'), selC = $('auditoriaItemCausales');
      var letra = (l && l.value) || '', idxStr = (sel && sel.value) || '';
      if (!letra || idxStr === '') return;
      var arr = MATRIZ_CALIDAD[letra];
      if (!arr || !arr.length) return;
      var idx = parseInt(idxStr, 10);
      if (idx < 0 || idx >= arr.length) return;
      var it = arr[idx], macro = it.m || '', desc = it.d || '';
      if (it.causales) {
        var cIdx = selC ? parseInt(selC.value || '', 10) : -1;
        if (cIdx < 0 || cIdx >= (it.causales.length || 0)) return;
        desc = it.causales[cIdx] || '';
      }
      var items = getAuditoriasAgentes();
      items.push({ agente: (a && a.value || '').trim(), nota: (n && n.value || '').trim(), letra: letra, macroproceso: macro, descripcionItem: desc, itemAfectado: desc, fechaHoraTs: Date.now() });
      saveAuditoriasAgentes(items);
      flushSave();
      refreshAuditoriasTable();
      refreshCalidadAll();
      resetAuditoriaForm();
    });
    if (tbl && !tbl._auditoriasBound) {
      tbl._auditoriasBound = true;
      tbl.addEventListener('click', onAuditoriasTableClick);
    }
  }

  var SESSION_KEY = 'integra_logged_in';

  function showLogin() {
    var el = $('loginOverlay');
    if (el) el.classList.remove('hidden');
  }

  function hideLogin() {
    var el = $('loginOverlay');
    if (el) el.classList.add('hidden');
  }

  function init() {
    var loggedIn = localStorage.getItem(SESSION_KEY) === '1';
    if (!loggedIn) {
      showLogin();
    } else {
      hideLogin();
    }
    handleHashChange();
    window.addEventListener('beforeunload', flushSave);
    var _visibilityTimer;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        _visibilityTimer = setTimeout(function () {
          flushSave();
          _dataCache = _lastSavedJson = _sections = _nav = null;
          _adminCache = null;
          clearElCache();
        }, 15000);
      } else {
        clearTimeout(_visibilityTimer);
        _visibilityTimer = 0;
      }
    });
    var nav = qs('.sidebar-nav');
    if (nav) nav.addEventListener('click', handleNavClick);
    window.addEventListener('hashchange', handleHashChange);
    var btn = $('sidebarToggle');
    var menu = $('topbarMenu');
    if (btn) btn.addEventListener('click', function () { document.body.classList.toggle('sidebar-open'); });
    if (menu) menu.addEventListener('click', function () { document.body.classList.toggle('sidebar-open'); });
    function bindToggle(btnId, contentId, storageKey) {
      var btn = $(btnId), content = $(contentId);
      if (!btn || !content) return;
      if (localStorage.getItem(storageKey) === '1') {
        content.classList.add('collapsed');
        btn.classList.add('collapsed');
      }
      btn.addEventListener('click', function () {
        content.classList.toggle('collapsed');
        btn.classList.toggle('collapsed');
        localStorage.setItem(storageKey, content.classList.contains('collapsed') ? '1' : '0');
      });
    }
    bindToggle('toggleGestionOperacionHfc', 'gestionOperacionHfcContent', 'integra_gestion_operacion_hfc_collapsed');
    bindToggle('toggleGestionOperacion', 'gestionOperacionContent', 'integra_gestion_operacion_collapsed');
    bindToggle('toggleCalidad', 'calidadDashboardContent', 'integra_calidad_collapsed');
    bindToggle('toggleFormacion', 'formacionDashboardContent', 'integra_formacion_collapsed');
    var btnInforme = $('btnDescargarInforme');
    if (btnInforme) btnInforme.addEventListener('click', descargarInforme);
    var btnLogout = $('btnCerrarSesion');
    if (btnLogout) btnLogout.addEventListener('click', function () {
      flushSave();
      _dataCache = null;
      _lastSavedJson = null;
      invalidateAdminCache();
      clearElCache();
      localStorage.setItem(SESSION_KEY, '0');
      showLogin();
    });
    var loginForm = $('loginForm');
    if (loginForm) loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var user = String(($('loginUsuario') || {}).value || '').trim();
      var pass = ($('loginPassword') || {}).value || '';
      if (!user) return;
      var portal = findPortalUser(user, getData());
      if (portal) {
        if (portal.clave !== pass) return;
        saveData('currentUserName', portal.nombre || portal.usuario || user);
        saveData('currentUserUsuario', portal.usuario || user);
        saveData('currentUserAdmin', portal.role === 'administrador');
        invalidateAdminCache();
      } else {
        saveData('currentUserName', user);
        saveData('currentUserUsuario', user);
        saveData('currentUserAdmin', true);
        invalidateAdminCache();
      }
      localStorage.setItem(SESSION_KEY, '1');
      refreshUserDisplay();
      hideLogin();
      handleHashChange();
    });
    var perfilForm = $('perfilFormCambiarClave');
    if (perfilForm) perfilForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var actual = ($('perfilClaveActual') || {}).value || '';
      var nueva = ($('perfilClaveNueva') || {}).value || '';
      var confirmar = ($('perfilClaveConfirmar') || {}).value || '';
      var msgEl = $('perfilMsg');
      var guardada = localStorage.getItem('integra_user_password') || '';
      if (guardada && actual !== guardada) {
        if (msgEl) { msgEl.textContent = 'Contraseña actual incorrecta.'; msgEl.style.color = 'var(--integra-rose)'; }
        return;
      }
      if (nueva.length < 6) {
        if (msgEl) { msgEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; msgEl.style.color = 'var(--integra-rose)'; }
        return;
      }
      if (nueva !== confirmar) {
        if (msgEl) { msgEl.textContent = 'Las contraseñas nuevas no coinciden.'; msgEl.style.color = 'var(--integra-rose)'; }
        return;
      }
      try { localStorage.setItem('integra_user_password', nueva); } catch (x) {}
      if (msgEl) { msgEl.textContent = 'Contraseña actualizada correctamente.'; msgEl.style.color = 'var(--integra-success)'; }
      perfilForm.reset();
    });
    var btnBackup = $('btnBackupDescargar');
    var btnBackupCopiar = $('btnBackupCopiar');
    var btnBackupPegar = $('btnBackupPegar');
    var inputBackup = $('perfilBackupFile');
    var msgBackup = $('perfilBackupMsg');
    var BACKUP_KEYS = ['integra_data', 'integra_user_password', 'integra_logged_in', 'integra_gestion_operacion_collapsed', 'integra_calidad_collapsed', 'integra_formacion_collapsed', 'integra_gestion_operacion_hfc_collapsed'];
    function buildBackupData() {
      var backup = { app: 'Integra', version: '1.0', timestamp: new Date().toISOString(), data: {} };
      for (var i = 0; i < BACKUP_KEYS.length; i++) {
        var v = localStorage.getItem(BACKUP_KEYS[i]);
        if (v != null) backup.data[BACKUP_KEYS[i]] = v;
      }
      for (var k in localStorage) {
        if (k.indexOf('integra') === 0 && BACKUP_KEYS.indexOf(k) < 0) backup.data[k] = localStorage.getItem(k);
      }
      return backup;
    }
    if (btnBackupCopiar) btnBackupCopiar.addEventListener('click', function () {
      try {
        var backup = buildBackupData();
        var json = JSON.stringify(backup);
        navigator.clipboard.writeText(json).then(function () {
          if (msgBackup) { msgBackup.textContent = 'Backup copiado al portapapeles. Pégalo donde quieras guardarlo.'; msgBackup.style.color = 'var(--integra-success)'; }
        }).catch(function () {
          if (msgBackup) { msgBackup.textContent = 'No se pudo copiar (permiso denegado).'; msgBackup.style.color = 'var(--integra-rose)'; }
        });
      } catch (e) {
        if (msgBackup) { msgBackup.textContent = 'Error: ' + (e.message || 'desconocido'); msgBackup.style.color = 'var(--integra-rose)'; }
      }
    });
    if (btnBackupPegar) btnBackupPegar.addEventListener('click', function () {
      navigator.clipboard.readText().then(function (text) {
        try {
          var backup = JSON.parse(text);
          if (!backup || !backup.data || backup.app !== 'Integra') {
            if (msgBackup) { msgBackup.textContent = 'El portapapeles no contiene un backup válido de Integra.'; msgBackup.style.color = 'var(--integra-rose)'; }
            return;
          }
          var d = backup.data;
          for (var k in d) { if (BACKUP_KEYS.indexOf(k) >= 0 || k.indexOf('integra') === 0) localStorage.setItem(k, d[k]); }
          _dataCache = null;
          invalidateAdminCache();
          if (msgBackup) { msgBackup.textContent = 'Restauración exitosa. Recargando...'; msgBackup.style.color = 'var(--integra-success)'; }
          setTimeout(function () { location.reload(); }, 800);
        } catch (e) {
          if (msgBackup) { msgBackup.textContent = 'Error al restaurar: texto no válido.'; msgBackup.style.color = 'var(--integra-rose)'; }
        }
      }).catch(function () {
        if (msgBackup) { msgBackup.textContent = 'No se pudo leer el portapapeles (permiso denegado).'; msgBackup.style.color = 'var(--integra-rose)'; }
      });
    });
    if (btnBackup) btnBackup.addEventListener('click', function () {
      var backup = buildBackupData();
      try {
        var json = JSON.stringify(backup);
        var base64 = btoa(unescape(encodeURIComponent(json)));
        var ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '-');
        var restoreScript = '<script>(function(){try{var b=JSON.parse(decodeURIComponent(escape(atob("' + base64 + '"))));if(b&&b.data&&b.app==="Integra"){for(var k in b.data)try{localStorage.setItem(k,b.data[k]);}catch(e){}}}catch(e){}})();</script>';
        Promise.all([
          fetch('index.html').then(function(r){return r.text();}),
          fetch('css/integra.css').then(function(r){return r.text();}),
          fetch('js/integra.js').then(function(r){return r.text();})
        ]).then(function(results){
          var html = results[0];
          var css = results[1];
          var js = results[2];
          html = html.replace(/<link[^>]+href="css\/integra\.css"[^>]*>/, '<style>' + css + '</style>');
          html = html.replace(/<script[^>]+src="js\/integra\.js"[^>]*><\/script>/, restoreScript + '<script>' + js + '</script>');
          var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'integra-backup-' + ts + '.html';
          a.click();
          URL.revokeObjectURL(a.href);
          if (msgBackup) { msgBackup.textContent = 'Backup HTML descargado. Ábrelo en el navegador y verás todo.'; msgBackup.style.color = 'var(--integra-success)'; }
        }).catch(function(err){
          if (msgBackup) { msgBackup.textContent = 'Error (¿Ejecutando desde servidor?): ' + (err.message || 'desconocido'); msgBackup.style.color = 'var(--integra-rose)'; }
        });
      } catch (e) {
        if (msgBackup) { msgBackup.textContent = 'Error al crear backup: ' + (e.message || 'desconocido'); msgBackup.style.color = 'var(--integra-rose)'; }
      }
    });
    if (inputBackup) inputBackup.addEventListener('change', function () {
      var f = inputBackup.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var text = r.result;
          var backup = null;
          if (/\.html$/i.test(f.name)) {
            var m = text.match(/atob\("([A-Za-z0-9+/=]+)"\)/);
            if (m && m[1]) {
              backup = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
            }
          } else {
            backup = JSON.parse(text);
          }
          if (!backup || !backup.data || backup.app !== 'Integra') {
            if (msgBackup) { msgBackup.textContent = 'Archivo de backup no válido.'; msgBackup.style.color = 'var(--integra-rose)'; }
            return;
          }
          var d = backup.data;
          for (var k in d) { if (BACKUP_KEYS.indexOf(k) >= 0 || k.indexOf('integra') === 0) localStorage.setItem(k, d[k]); }
          _dataCache = null;
          invalidateAdminCache();
          if (msgBackup) { msgBackup.textContent = 'Restauración exitosa. Recargando...'; msgBackup.style.color = 'var(--integra-success)'; }
          setTimeout(function () { location.reload(); }, 800);
        } catch (e) {
          if (msgBackup) { msgBackup.textContent = 'Error al restaurar: ' + (e.message || 'archivo inválido'); msgBackup.style.color = 'var(--integra-rose)'; }
        }
      };
      r.readAsText(f, 'UTF-8');
      inputBackup.value = '';
    });
    loadData();
    bindEditable();
    bindPortalUsuarios();
    bindGestion();
    bindCalidad();
    bindBolsa();
    refreshGestionCasos();
    refreshAuditoriasTable();
    refreshCalidadAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
