/* Integra - Dashboard ligero (optimizado RAM/código) */
(function () {
  'use strict';

  var API_URL = (typeof window !== 'undefined' && window.INTEGRA_API_URL) || '';
  if (!API_URL && typeof window !== 'undefined' && window.location) {
    API_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://integra-e23d.onrender.com';
  }
  function showSaveStatus(msg, isError) {
    var el = document.getElementById('integraSaveStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'integra-save-status ' + (isError ? 'error' : 'ok');
    el.style.display = '';
    clearTimeout(showSaveStatus._t);
    showSaveStatus._t = setTimeout(function () { el.style.display = 'none'; }, 3500);
  }
  function getApiBase() {
    if (!API_URL) return '';
    if (typeof window !== 'undefined' && window.location && window.location.origin === API_URL.replace(/\/$/, '')) {
      return '';
    }
    return API_URL;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  var STORAGE = 'integra_data';
  var _nav, _sections, _dataCache, _saveTimer, _lastSavedJson;
  var MAX_EL_CACHE = 24;
  var MAX_GESTION_CASOS = 500;
  var MAX_PORTAL_USUARIOS = 200;
  var MAX_AUDITORIAS = 500;
  var MAX_INTERMITENCIA = 500;
  function trimArrayNewestFirst(arr, limit) { if (!arr || !Array.isArray(arr) || arr.length <= limit) return arr; return arr.slice(0, limit); }
  function trimArrayNewestLast(arr, limit) { if (!arr || !Array.isArray(arr) || arr.length <= limit) return arr; return arr.slice(-limit); }
  function safeMax(arr) { if (!arr || !arr.length) return 0; var m = arr[0]; for (var i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i]; return m; }
  function safeMin(arr) { if (!arr || !arr.length) return 0; var m = arr[0]; for (var i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i]; return m; }
  var _elCount = 0;
  var SECTION_TITLES = { dashboard: 'Inicio', gestion: 'Mi Gestión', 'tablero-mensual': 'Tablero Mensual', formacion: 'Formación', calidad: 'Matriz de Calidad', bolsa: 'Bolsa', 'bolsa-hfc': 'Bolsa HFC', agentes: 'Agentes', perfil: 'Perfil', intermitencia: 'Intermitencia' };
  var VALID_HASH_ADMIN = ['dashboard', 'formacion', 'calidad', 'bolsa', 'bolsa-hfc', 'agentes', 'perfil', 'gestion', 'tablero-mensual', 'intermitencia'];
  var VALID_HASH_USER = ['dashboard', 'gestion', 'tablero-mensual', 'formacion', 'intermitencia'];
  var GESTION_FORM_IDS = ['gestionNombre','gestionNumero','gestionNit','gestionAliado','gestionFuncion','gestionImot','gestionTransferencia','gestionCliente','gestionPqr','gestionCausa','gestionSolucion','gestionRed','gestionNodo','gestionCpe','gestionHuboSolucion','gestionAreaTransferir','gestionExtensiones'];
  var PRETURNOS_DEFAULT = [{ skill: 'EMP GESTION INMEDIATA', programados: 7, asistencia: 86, promedio: 100 },{ skill: 'EMP GESTION INCIDENTES CSI', programados: 19, asistencia: 93, promedio: 99 },{ skill: 'EMP GESTION INCIDENTES IRE', programados: 6, asistencia: 100, promedio: 100 }];
  var STAFF_DEFAULT = [{ skill: 'Analista de entrenamiento 2', programados: 1, asistencia: 100, promedio: 100 },{ skill: 'Supervisor', programados: 3, asistencia: 78, promedio: 100 }];
  var EXCEL_COLS = ['Nombre t\u00e9cnico','N\u00famero','Enlace','Aliado','Funci\u00f3n','IM/OT','Transferencia','\u00c1rea transferir','Extensiones','Cliente','PQR','Causa falla','Soluci\u00f3n','Red acceso','Nodo','CPE','\u00bfHubo soluci\u00f3n?','Fecha/Hora','Duraci\u00f3n'];
  var EXCEL_KEYS = ['nombre','numero','nit','aliado','funcion','imot','transferencia','areaTransferir','extensiones','cliente','pqr','causa','solucion','redAcceso','nodo','cpe','huboSolucion','fechaHora','duracion'];

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
  function setDataFromApi(data) {
    _dataCache = data && typeof data === 'object' ? data : {};
    _lastSavedJson = JSON.stringify(_dataCache);
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
        if (API_URL) {
          var url = getApiBase() + '/api/data';
          fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true })
            .then(function (r) {
              if (r.ok) {
                _lastSavedJson = json;
              } else {
                localStorage.setItem(STORAGE, json);
                showSaveStatus('Error al guardar en servidor. Datos guardados localmente.', true);
              }
            })
            .catch(function () {
              localStorage.setItem(STORAGE, json);
              showSaveStatus('Sin conexión. Datos guardados localmente.');
            });
        } else {
          localStorage.setItem(STORAGE, json);
          _lastSavedJson = json;
        }
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

  var ROLE_LABELS = { administrador: 'Administrador', 'fibra-optica': 'Fibra Óptica', qoe: 'QoE', supervisor: 'Supervisor' };
  function refreshUserDisplay(data) {
    if (!data) data = getData();
    var nameEl = $('userName');
    var roleEl = $('userRole');
    var name = data.currentUserName || 'Usuario';
    var admin = data.currentUserAdmin === true;
    var role = data.currentUserRole || 'fibra-optica';
    var roleLabel = ROLE_LABELS[role] || (admin ? 'Administrador' : 'Fibra Óptica');
    if (nameEl) nameEl.textContent = name;
    if (roleEl) {
      roleEl.textContent = admin ? 'Administrador' : roleLabel;
      roleEl.className = 'user-role' + (admin ? ' user-role-admin' : '');
    }
    refreshNavByRole(data);
  }

  function refreshNavByRole(data) {
    if (!data) data = getData();
    var admin = data.currentUserAdmin === true;
    var role = data.currentUserRole || 'fibra-optica';
    var navAdmin = qsAll('.nav-item[data-admin-only]');
    var navUser = qsAll('.nav-item[data-user-only]');
    var navQoe = qsAll('.nav-item[data-qoe-only]');
    for (var i = 0; i < navAdmin.length; i++) navAdmin[i].style.display = admin ? '' : 'none';
    for (var i = 0; i < navUser.length; i++) {
      var el = navUser[i];
      var hideForQoe = el.hasAttribute('data-hide-for-qoe');
      var visible = admin ? false : !(hideForQoe && role === 'qoe');
      el.style.display = visible ? '' : 'none';
    }
    for (var i = 0; i < navQoe.length; i++) navQoe[i].style.display = role === 'qoe' ? '' : 'none';
    var adminBlocks = $('dashboardAdminBlocks');
    if (adminBlocks) adminBlocks.style.display = admin ? '' : 'none';
    var agentBlock = $('dashboardAgentContent');
    if (agentBlock) agentBlock.style.display = admin ? 'none' : '';
    var formacionHeader = $('formacionHeaderBar');
    var formacionContent = $('formacionDashboardContent');
    var formacionHr = $('formacionDashboardHr');
    if (formacionHeader) formacionHeader.style.display = admin ? '' : 'none';
    if (formacionContent) formacionContent.style.display = admin ? '' : 'none';
    if (formacionHr) formacionHr.style.display = admin ? '' : 'none';
    refreshEditableByRole();
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
    clearElCache();
    var sections = _sections || (_sections = qsAll('.content .section'));
    var navItems = _nav || (_nav = qsAll('.sidebar-nav .nav-item'));
    sections.forEach(function (s) { s.classList.toggle('active', s.id === 'section-' + sectionId); });
    navItems.forEach(function (n) { n.classList.toggle('active', n.getAttribute('data-section') === sectionId); });
    var titleEl = $('topbarTitle');
    if (titleEl) {
      var role = (getData().currentUserRole || 'fibra-optica');
      var t = SECTION_TITLES[sectionId] || 'Inicio';
      if (role === 'qoe' && (sectionId === 'dashboard' || sectionId === 'intermitencia')) t = 'NOC HFC';
      titleEl.textContent = t;
    }
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
    if (sectionId === 'gestion') refreshGestionCasos();
    if (sectionId === 'calidad') { refreshAuditoriasTable(); refreshAuditoriaAgenteSelect(); }
    if (sectionId === 'tablero-mensual') refreshTableroMensual();
    if (sectionId === 'formacion') { updateAsistencia(); updateResultados(); }
    if (sectionId === 'intermitencia') refreshIntermitenciaList();
    if (sectionId === 'bolsa') refreshBolsaCasosSolucionados();
    if (sectionId === 'agentes') refreshUsuariosPortal(getData());
    if (sectionId === 'bolsa-hfc') {
      var hfcContactoSpan = $('bolsaHfcCierresContacto');
      if (hfcContactoSpan) hfcContactoSpan.textContent = getCasosConSolucionCount();
      var hfcBuzonSpan = $('bolsaHfcCierresBuzon');
      if (hfcBuzonSpan) hfcBuzonSpan.textContent = getDeclaracionesMasivasCount();
    }
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
    var role = (getData().currentUserRole || 'fibra-optica');
    var bloqueadoParaQoe = (hash === 'gestion' && role === 'qoe');
    if (valid.indexOf(hash) < 0 || (_adminOnly[hash] && !isAdmin()) || bloqueadoParaQoe) hash = 'dashboard';
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
  function refreshEditableByRole() {
    var admin = (getData().currentUserAdmin === true);
    qsAll('.editable[data-key]').forEach(function (el) {
      if (admin) el.setAttribute('contenteditable', 'true');
      else el.removeAttribute('contenteditable');
    });
    qsAll('.preturnos-cell-editable, [data-pret], [data-staff]').forEach(function (el) {
      if (admin) el.setAttribute('contenteditable', 'true');
      else el.removeAttribute('contenteditable');
    });
  }

  function bindEditable() {
    var data = getData();
    var admin = data.currentUserAdmin === true;
    qsAll('.editable[data-key]').forEach(function (el) {
      var key = el.getAttribute('data-key');
      if (data[key] != null && data[key] !== '') el.textContent = data[key];
      if (admin) el.setAttribute('contenteditable', 'true');
      else el.removeAttribute('contenteditable');
    });
    if (!admin) {
      qsAll('.preturnos-cell-editable, [data-pret], [data-staff]').forEach(function (el) { el.removeAttribute('contenteditable'); });
      return;
    }
    if (_inputBound) return;
    _inputBound = true;
    var inputTimer;
    var formacionRoot = document.getElementById('formacionDashboardContent') || document;
    formacionRoot.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.id) return;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(function () {
        var id = t.id;
        if (id === 'formPresento' || id === 'formPendiente') {
          updateAsistencia();
          updateResultados();
        } else if (id === 'formPublicoObjetivo' || id === 'formPlantaTotal' || id === 'formaprobo' || id === 'formReprobo' || id === 'formNovedades') {
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
    var w = 200, h = 50, max = safeMax(data), min = safeMin(data);
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
    var max = allData.length ? safeMax(allData) : 100;
    var min = allData.length ? safeMin(allData) : 0;
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
    set('formPlantaTotal', '35');
    set('formPublicoObjetivo', '31');
    set('formPresento', '20');
    set('formPendiente', '11');
    set('formaprobo', '18');
    set('formReprobo', '2');
    set('formNovedades', '4');
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
      var r = (u.role || 'fibra-optica');
      if (ROLES.indexOf(r) < 0) r = 'fibra-optica';
      var sel = '<select class="portal-rol-select" data-i="' + i + '" title="Cambiar rol">' +
        '<option value="supervisor"' + (r === 'supervisor' ? ' selected' : '') + '>Supervisor</option>' +
        '<option value="fibra-optica"' + (r === 'fibra-optica' ? ' selected' : '') + '>Fibra Óptica</option>' +
        '<option value="qoe"' + (r === 'qoe' ? ' selected' : '') + '>QoE</option>' +
        '<option value="administrador"' + (r === 'administrador' ? ' selected' : '') + '>Administrador</option>' +
        '</select>';
      var notaCalidad = getNotaCalidadParaAgente(u.nombre, u.usuario);
      return '<tr><td>' + (u.nombre || '') + '</td><td>' + (u.usuario || '') + '</td><td><span class="portal-estado">' + (u.estado || 'Temporal') + '</span></td><td>' + sel + '</td><td><span class="portal-nota-calidad" title="Desde Matriz de Calidad">' + escapeHtml(notaCalidad) + '</span></td><td><code>' + (u.clave || '') + '</code></td><td><button type="button" class="btn-copy" data-i="' + i + '">Copiar</button><button type="button" class="btn-remove" data-i="' + i + '">Quitar</button></td></tr>';
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
      saveData('portalUsuarios', trimArrayNewestLast(arr, MAX_PORTAL_USUARIOS));
      flushSave();
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
    saveData('portalUsuarios', trimArrayNewestLast(arr, MAX_PORTAL_USUARIOS));
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
  function getAllCasosGestionConUsuario() {
    var d = getData();
    var out = [];
    for (var key in d) {
      if (key.indexOf('gestionCasos_') !== 0) continue;
      var usuario = key.replace('gestionCasos_', '');
      var arr = d[key];
      if (!Array.isArray(arr)) continue;
      for (var i = 0; i < arr.length; i++) {
        out.push({ caso: arr[i], usuario: usuario });
      }
    }
    return out;
  }
  function getCasosNoSolucionadosRastreo() {
    var todos = getAllCasosGestionConUsuario();
    var sdConSolucion = {};
    var porSd = {};
    for (var i = 0; i < todos.length; i++) {
      var c = todos[i].caso;
      var sd = String(c.pqr || c.numero || '').trim();
      if (!sd) continue;
      var sdKey = sd.toUpperCase();
      var h = String(c.huboSolucion || '').trim();
      if (h === 'Sí' || h === 'SI') {
        sdConSolucion[sdKey] = true;
        continue;
      }
      if (!porSd[sdKey]) porSd[sdKey] = { sd: sd, agentes: [], validaciones: 0, fechas: [] };
      var ag = (c.nombre || todos[i].usuario || '—').trim();
      if (porSd[sdKey].agentes.indexOf(ag) < 0) porSd[sdKey].agentes.push(ag);
      porSd[sdKey].validaciones++;
      porSd[sdKey].fechas.push(c.fechaHora || '');
    }
    var out = [];
    for (var k in porSd) {
      if (sdConSolucion[k]) continue;
      if (porSd[k].validaciones >= 2) {
        porSd[k].fechas.sort();
        out.push(porSd[k]);
      }
    }
    out.sort(function (a, b) { return b.validaciones - a.validaciones; });
    return out;
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

  function getCierresAgenteHoy() {
    return getProductividadAgente().hoy;
  }

  function getTransferenciasAgenteHoy() {
    var arr = getCasosGestion();
    var d = new Date();
    var hoyInicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var count = 0;
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c.transferencia === 'SI' && c.fechaHoraTs && c.fechaHoraTs >= hoyInicio) count++;
    }
    return count;
  }

  function getNotasYLetrasAgente() {
    var list = getAuditoriasAgentes();
    var d = getData();
    var nombreAgente = (d.currentUserName || '').trim();
    var usuarioAgente = (d.currentUserUsuario || '').trim().toLowerCase();
    if (!nombreAgente && !usuarioAgente) return { notas: [], descripciones: [] };
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var ag = String(r.agente || '').trim();
      var agUsr = ag.toLowerCase();
      var match = (nombreAgente && ag === nombreAgente) || (usuarioAgente && agUsr === usuarioAgente);
      if (!match) continue;
      var nota = String(r.nota || '').trim();
      var desc = String(r.descripcionItem || r.itemAfectado || r.macroproceso || r.letra || '').trim();
      if (nota || desc) items.push({ nota: nota, descripcion: desc, ts: r.fechaHoraTs || 0 });
    }
    items.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var notas = [], descripciones = [], seenDesc = {};
    for (var j = 0; j < items.length && (notas.length < 5 || descripciones.length < 5); j++) {
      var it = items[j];
      if (it.nota && notas.length < 5) notas.push(it.nota);
      if (it.descripcion && !seenDesc[it.descripcion]) { seenDesc[it.descripcion] = true; descripciones.push(it.descripcion); }
    }
    return { notas: notas, descripciones: descripciones };
  }

  function refreshProductividadAgente() {
    var wrap = $('productividadAgenteWrap');
    if (!wrap) return;
    var d = getData();
    var nombre = d.currentUserName || 'Agente';
    var p = getProductividadAgente();
    var hoy = p.hoy, mes = p.mes;
    var cierres = getCierresAgenteHoy();
    var transferencias = getTransferenciasAgenteHoy();
    var datosCalidad = getNotasYLetrasAgente();
    var notasStr = datosCalidad.notas.length ? datosCalidad.notas.join(' · ') : '';
    var descStr = datosCalidad.descripciones.length ? datosCalidad.descripciones.join(' · ') : '';
    var notasHtml = '';
    if (!notasStr && !descStr) {
      notasHtml = '<span class="agente-caja-num agente-caja-muted">Sin auditorías</span>';
    } else {
      notasHtml = '<span class="agente-caja-num">' + (notasStr ? escapeHtml(notasStr) : '—') + '</span>';
      if (descStr) notasHtml += '<span class="agente-caja-label">' + escapeHtml(descStr) + '</span>';
    }
    var meta = META_DIA, min = MIN_PRODUCTIVO;
    var pct = meta > 0 ? Math.min(100, Math.round((hoy / meta) * 100)) : 0;
    var productivo = hoy >= min;
    var alertClass = productivo ? 'prod-ok' : 'prod-alert';
    var alertMsg = productivo
      ? 'Cumpliste la productividad de hoy.'
      : 'No cumpliste la productividad de hoy. Mínimo ' + min + ' casos (llamadas y gestión). Llevas ' + hoy + '.';
    var role = (getData().currentUserRole || 'fibra-optica');
    var panelLabel = role === 'fibra-optica' ? 'Panel Fibra Óptica' : (role === 'qoe' ? 'NOC · Diagnóstico HFC' : (role === 'supervisor' ? 'Panel Supervisor' : 'Panel'));
    if (role === 'qoe') {
      if (typeof NocAnalyzerQoE === 'undefined' && !window._qoeLoading) {
        window._qoeLoading = true;
        wrap.innerHTML = '<div class="qoe-seccion-intermitencia" style="padding:2rem;text-align:center;color:rgba(255,255,255,0.8)">Cargando módulo NOC…</div>';
        var qoeOrder = ['js/qoe/config.js?v=4','js/qoe/parser.js?v=4','js/qoe/rulesEngine.js?v=4','js/qoe/healthScores.js?v=4','js/qoe/gauge.js?v=5','js/qoe/interpretacion.js?v=1','js/qoe/nocAnalyzer.js?v=1'];
        (function loadNext(i) {
          if (i >= qoeOrder.length) { window._qoeLoading = false; refreshProductividadAgente(); return; }
          loadScript(qoeOrder[i]).then(function () { loadNext(i + 1); }).catch(function () { loadNext(i + 1); });
        })(0);
        return;
      }
      var ts = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
      wrap.innerHTML =
        '<div class="qoe-seccion-intermitencia">' +
        '<div class="qoe-noc-header-bar">' +
          '<div class="qoe-noc-header-left"><span class="qoe-noc-sys">NOC HFC</span><span class="qoe-noc-module">Monitor de Intermitencia DOCSIS</span></div>' +
          '<div class="qoe-noc-header-right"><span class="qoe-noc-op">Op: ' + escapeHtml(nombre) + '</span><span class="qoe-noc-ts">' + escapeHtml(ts) + '</span></div>' +
        '</div>' +
        '<div class="qoe-dashboard">' +
        '<div class="qoe-intermitencia-header" id="qoeIntermitenciaHeader" role="button" tabindex="0">' +
          '<span class="qoe-intermitencia-label">Módulo Intermitencia</span>' +
          '<span class="qoe-intermitencia-icon" id="qoeIntermitenciaIcon">−</span>' +
        '</div>' +
        '<div class="qoe-intermitencia-content" id="qoeIntermitenciaContent">' +
        '<section class="qoe-zona-principal">' +
          '<div class="qoe-diagnostico-card">' +
            '<h2 class="qoe-diagnostico-titulo">Ingesta CMTS <span class="qoe-casos-badge" id="qoeCasosValidadosBadge">' + getIntermitenciaRegistros().length + ' Casos validados</span></h2>' +
            '<div class="qoe-intermitencia-form">' +
              '<div class="qoe-form-row">' +
                '<label for="qoeNumeroCuenta">Cuenta</label>' +
                '<input type="text" id="qoeNumeroCuenta" placeholder="ID cuenta">' +
              '</div>' +
              '<div class="qoe-form-row">' +
                '<label for="qoeNumeroPqr">PQR</label>' +
                '<input type="text" id="qoeNumeroPqr" placeholder="ID PQR">' +
              '</div>' +
              '<div class="qoe-form-row">' +
                '<label for="qoeMarcacion">Marcaci\u00f3n</label>' +
                '<input type="text" id="qoeMarcacion" placeholder="Marcaci\u00f3n">' +
              '</div>' +
              '<div class="qoe-form-row">' +
                '<label for="qoeHuboSolucion">¿Hubo solución?</label>' +
                '<select id="qoeHuboSolucion">' +
                  '<option value="">—</option>' +
                  '<option value="si">S\u00ed</option>' +
                  '<option value="no">No</option>' +
                '</select>' +
              '</div>' +
              '<div class="qoe-form-row">' +
                '<label for="qoeMaiva">¿Maiva?</label>' +
                '<select id="qoeMaiva">' +
                  '<option value="">—</option>' +
                  '<option value="si">S\u00ed</option>' +
                  '<option value="no">No</option>' +
                '</select>' +
              '</div>' +
              '<div class="qoe-form-row qoe-inc-wrap" id="qoeIncWrap" style="display:none">' +
                '<label for="qoeInc">Inserte el INC</label>' +
                '<input type="text" id="qoeInc" placeholder="INC">' +
              '</div>' +
              '<div class="qoe-form-row">' +
                '<label for="qoeAgendoVisita">Visita agenda</label>' +
                '<select id="qoeAgendoVisita">' +
                  '<option value="">—</option>' +
                  '<option value="si">S\u00ed</option>' +
                  '<option value="no">No</option>' +
                '</select>' +
              '</div>' +
              '<div class="qoe-form-row qoe-llamada-wrap" id="qoeLlamadaWrap" style="display:none">' +
                '<label for="qoeLlamadaServicio">Ref. llamada servicio</label>' +
                '<input type="text" id="qoeLlamadaServicio" placeholder="Pega la llamada de servicio">' +
              '</div>' +
              '<button type="button" class="portal-btn portal-btn-secondary" id="qoeBtnGuardarIntermitencia">Guardar</button>' +
            '</div>' +
            '<p class="qoe-desc">Output CMTS: show cable modem &lt;mac&gt; verbose | show interface upstream &lt;x&gt; stat</p>' +
            '<div class="qoe-inputs">' +
              '<div class="qoe-field">' +
                '<label for="qoeModemOutput">show cable modem &lt;mac&gt; verbose</label>' +
                '<textarea id="qoeModemOutput" rows="6" placeholder="Pegar output..."></textarea>' +
              '</div>' +
              '<div class="qoe-field">' +
                '<label for="qoeUpstreamOutput">show interface upstream &lt;x&gt; stat</label>' +
                '<textarea id="qoeUpstreamOutput" rows="6" placeholder="Pegar output..."></textarea>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="portal-btn portal-btn-primary" id="qoeBtnAnalizar">Ejecutar análisis</button>' +
            '<div class="qoe-analisis-msg" id="qoeAnalisisMsg" style="display:none"></div>' +
          '</div>' +
        '</section>' +
        '<section class="qoe-noc-seccion">' +
          '<div class="qoe-noc-card">' +
            '<h3 class="qoe-noc-titulo">Monitor RF · CMTS</h3>' +
            '<p class="qoe-noc-desc">Ingestar output en área superior. Auto-detección ARRIS / vCMTS / CASA.</p>' +
            '<div class="qoe-noc-header" id="qoeNocHeader">' +
              '<div class="qoe-noc-header-item"><span class="qoe-noc-label">CMTS</span><span class="qoe-noc-val" id="qoeNocCmts">—</span></div>' +
              '<div class="qoe-noc-header-item"><span class="qoe-noc-label">Nodo / Upstream</span><span class="qoe-noc-val" id="qoeNocNodo">—</span></div>' +
              '<div class="qoe-noc-header-item"><span class="qoe-noc-label">Modems</span><span class="qoe-noc-val" id="qoeNocModems">—</span></div>' +
              '<div class="qoe-noc-header-item qoe-noc-badge-wrap"><span class="qoe-noc-badge qoe-noc-badge-muted" id="qoeNocEstado">NO DATA</span></div>' +
            '</div>' +
            '<div class="qoe-noc-paneles">' +
              '<div class="qoe-noc-panel">' +
                '<h4>RF Levels</h4>' +
                '<div class="qoe-noc-grid">' +
                  '<div class="qoe-noc-metric" id="qoeNocTx"><span class="qoe-noc-metric-label">TX Up (dBmV)</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocRx"><span class="qoe-noc-metric-label">RX Down (dBmV)</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocSnrUp"><span class="qoe-noc-metric-label">SNR Up (dB)</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocSnrDown"><span class="qoe-noc-metric-label">SNR Down (dB)</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                '</div>' +
              '</div>' +
              '<div class="qoe-noc-panel">' +
                '<h4>Estabilidad RF</h4>' +
                '<div class="qoe-noc-grid">' +
                  '<div class="qoe-noc-metric" id="qoeNocFlaps"><span class="qoe-noc-metric-label">Flaps</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocCrc"><span class="qoe-noc-metric-label">CRC / Uncorrectables</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocRanging"><span class="qoe-noc-metric-label">Ranging retries</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocUptime"><span class="qoe-noc-metric-label">Uptime</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                '</div>' +
              '</div>' +
              '<div class="qoe-noc-panel">' +
                '<h4>US Channel</h4>' +
                '<div class="qoe-noc-grid">' +
                  '<div class="qoe-noc-metric" id="qoeNocUtil"><span class="qoe-noc-metric-label">Util. Upstream %</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocModemsChan"><span class="qoe-noc-metric-label">Modems en canal</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocUncorrGlob"><span class="qoe-noc-metric-label">Uncorrectables globales</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                  '<div class="qoe-noc-metric" id="qoeNocMasivo"><span class="qoe-noc-metric-label">Estado</span><span class="qoe-noc-metric-val qoe-semaforo-muted">—</span></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="qoe-noc-recomendaciones" id="qoeNocRecomendaciones">' +
              '<h4>Protocolo NOC</h4>' +
              '<div class="qoe-noc-rec-list" id="qoeNocRecList"><p class="qoe-noc-rec-empty">—</p></div>' +
            '</div>' +
            '<div class="qoe-noc-grafica-afectacion" id="qoeNocGraficaAfectacion">' +
              '<h4>Afectación · Actividad e impacto</h4>' +
              '<div class="qoe-noc-impacto-indicator" id="qoeNocImpactoIndicator" style="display:none">' +
                '<div class="qoe-noc-impacto-status" id="qoeNocImpactoStatus"></div>' +
                '<div class="qoe-noc-impacto-detail" id="qoeNocImpactoDetail"></div>' +
              '</div>' +
              '<p class="qoe-noc-chart-hint">Delta entre mediciones (no acumulado). Errores/min, SNR, Flaps/intervalo. Ventana: 30 min. Recomendado: análisis cada 5 min.</p>' +
              '<div class="qoe-noc-chart-wrap" id="qoeNocChartWrap">' +
                '<p class="qoe-noc-chart-empty" id="qoeNocChartEmpty">Ejecuta análisis para ver evolución de afectación (Uncorrectables)</p>' +
                '<svg class="qoe-noc-chart" id="qoeNocChart" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>' +
              '</div>' +
              '<div class="qoe-noc-intermitencia-monitor" id="qoeNocIntermitenciaMonitor" style="display:none">' +
                '<div class="qoe-noc-intermitencia-status" id="qoeNocIntermitenciaStatus"></div>' +
                '<div class="qoe-noc-intermitencia-charts" id="qoeNocIntermitenciaCharts"></div>' +
                '<p class="qoe-noc-intermitencia-desc" id="qoeNocIntermitenciaDesc"></p>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '</div>' +
        '</div></div>';
      bindQoEDiagnostico();
      bindQoEIntermitenciaToggle();
      bindQoEIntermitenciaForm();
      return;
    }
    wrap.innerHTML =
      '<div class="prod-welcome">Bienvenido, ' + escapeHtml(nombre) + '</div>' +
      '<p class="prod-role">' + escapeHtml(panelLabel) + '</p>' +
      '<div class="agente-cajitas">' +
        '<article class="card agente-caja">' +
          '<h3>Mis Casos</h3>' +
          '<div class="agente-caja-body">' +
            '<span class="agente-caja-num">' + hoy + '</span>' +
            '<span class="agente-caja-label">Casos del día</span>' +
          '</div>' +
        '</article>' +
        '<article class="card agente-caja">' +
          '<h3>Nota de Calidad</h3>' +
          '<div class="agente-caja-body">' + notasHtml + '</div>' +
        '</article>' +
        '<article class="card agente-caja">' +
          '<h3>Cierres al día</h3>' +
          '<div class="agente-caja-body">' +
            '<span class="agente-caja-num">' + cierres + '</span>' +
            '<span class="agente-caja-label">Casos cerrados hoy</span>' +
          '</div>' +
        '</article>' +
        '<article class="card agente-caja">' +
          '<h3>Transferencias</h3>' +
          '<div class="agente-caja-body">' +
            '<span class="agente-caja-num">' + transferencias + '</span>' +
            '<span class="agente-caja-label">Del día</span>' +
          '</div>' +
        '</article>' +
      '</div>' +
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
    var solucionados = getCasosSolucionadosCountFO();
    var items = [{ label: 'Casos Solucionados', val: solucionados }, { label: 'Casos no solucionados', val: s.negociosGI }, { label: 'EYN- PROACTIVIDAD VIP', val: s.proactividadVIP }];
    var total = solucionados + s.negociosGI + s.proactividadVIP;
    if (total === 0) {
      wrap.innerHTML = '<div class="letra-mas-afectada-empty">Importa la bolsa en Bolsa para ver datos SLA.</div>';
      return;
    }
    wrap.innerHTML = items.map(function (it) { return '<div class="reincidencia-item"><span class="reinc-tipo">' + escapeHtml(it.label) + '</span><span class="reinc-count">' + it.val + '</span></div>'; }).join('');
  }
  function refreshRastreoSd() {
    var tbody = $('rastreoSdBody');
    var emptyEl = $('rastreoSdEmpty');
    var tabla = $('tablaRastreoSd');
    if (!tbody) return;
    var items = getCasosNoSolucionadosRastreo();
    if (emptyEl) emptyEl.style.display = items.length ? 'none' : 'block';
    if (tabla) tabla.style.display = items.length ? 'table' : 'none';
    tbody.innerHTML = items.map(function (r) {
      var agentesStr = (r.agentes || []).join(', ');
      var ultima = (r.fechas && r.fechas.length) ? r.fechas[r.fechas.length - 1] : '—';
      return '<tr><td>' + escapeHtml(r.sd) + '</td><td>' + escapeHtml(agentesStr) + '</td><td>' + r.validaciones + '</td><td>' + escapeHtml(ultima) + '</td></tr>';
    }).join('');
  }
  function refreshGestionOperacion() {
    var bolsa = getBolsaData();
    refreshEynCajitas(bolsa);
    refreshSlaFaseCierre(bolsa.sla);
    refreshGestionOperacionHfc();
    refreshBolsaCasosSolucionados();
    refreshRastreoSd();
    if (isAdmin()) refreshRankings(getData(), getGestionDataFromStorage());
  }
  function refreshGestionOperacionHfc() {
    var d = getData();
    var totalContacto = getCasosConSolucionCount();
    var totalBuzon = getDeclaracionesMasivasCount();
    var totalReinc = getVisitasTecnicasCount();
    var elContacto = $('hfcCierresContacto');
    if (elContacto) elContacto.innerHTML = '<span class="eyn-caja-num">' + totalContacto + '</span><span class="eyn-caja-label">con solución</span>';
    var elBuzon = $('hfcCierresBuzon');
    if (elBuzon) elBuzon.innerHTML = '<span class="eyn-caja-num">' + totalBuzon + '</span><span class="eyn-caja-label">declaraciones</span>';
    var total = totalContacto + totalBuzon + totalReinc;
    var maxVal = Math.max(totalContacto, totalBuzon, totalReinc, 1);
    var pctContacto = total > 0 ? Math.round((totalContacto / total) * 100) : 0;
    var pctBuzon = total > 0 ? Math.round((totalBuzon / total) * 100) : 0;
    var pctReinc = total > 0 ? Math.round((totalReinc / total) * 100) : 0;
    var barContacto = $('hfcBarContacto');
    var barBuzon = $('hfcBarBuzon');
    var barReinc = $('hfcBarReinc');
    var valContacto = $('hfcValContacto');
    var valBuzon = $('hfcValBuzon');
    var valReinc = $('hfcValReinc');
    var pctContactoEl = $('hfcPctContacto');
    var pctBuzonEl = $('hfcPctBuzon');
    var pctReincEl = $('hfcPctReinc');
    if (barContacto) barContacto.style.width = Math.round((totalContacto / maxVal) * 100) + '%';
    if (barBuzon) barBuzon.style.width = Math.round((totalBuzon / maxVal) * 100) + '%';
    if (barReinc) barReinc.style.width = Math.round((totalReinc / maxVal) * 100) + '%';
    if (valContacto) valContacto.textContent = totalContacto;
    if (valBuzon) valBuzon.textContent = totalBuzon;
    if (valReinc) valReinc.textContent = totalReinc;
    if (pctContactoEl) pctContactoEl.textContent = pctContacto + '%';
    if (pctBuzonEl) pctBuzonEl.textContent = pctBuzon + '%';
    if (pctReincEl) pctReincEl.textContent = pctReinc + '%';
    var donut1 = $('hfcDonut1');
    var donut2 = $('hfcDonut2');
    var donut3 = $('hfcDonut3');
    var donut1Label = $('hfcDonut1Label');
    var donut2Label = $('hfcDonut2Label');
    var donut3Label = $('hfcDonut3Label');
    if (donut1) donut1.style.setProperty('--pct', pctContacto);
    if (donut2) donut2.style.setProperty('--pct', pctBuzon);
    if (donut3) donut3.style.setProperty('--pct', pctReinc);
    if (donut1Label) donut1Label.textContent = pctContacto + '%';
    if (donut2Label) donut2Label.textContent = pctBuzon + '%';
    if (donut3Label) donut3Label.textContent = pctReinc + '%';
    var reincNum = totalReinc;
    var elReinc = $('hfcReincidencias');
    if (elReinc) elReinc.innerHTML = '<span class="eyn-caja-num">' + reincNum + '</span><span class="eyn-caja-label">visitas técnicas</span>';
  }
  function refreshEynCajitas(bolsa) {
    var data = bolsa || getBolsaData();
    var a = data.abiertos || _bolsaDef;
    var s = data.sla || _bolsaDef;
    var e1 = $('eynBackNegocios');
    if (e1) e1.innerHTML = '<span class="eyn-caja-num">' + getCasosSolucionadosCountFO() + '</span><span class="eyn-caja-label">Cerrados</span>';
    var map = { eynNegociosGI: 'negociosGI', eynProactividad: 'proactividadVIP' };
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
    saveData('gestionCasos_' + getGestionKey(), trimArrayNewestLast(arr, MAX_GESTION_CASOS));
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
  var ROLES = ['supervisor', 'fibra-optica', 'qoe', 'administrador'];
  var TRES_MESES_MS = 90 * 24 * 60 * 60 * 1000;

  function getAuditoriasAgentes() {
    var list = (getData().auditoriasAgentes);
    return (list && Array.isArray(list)) ? list.slice() : [];
  }

  function getNotaCalidadParaAgente(nombre, usuario) {
    var list = getAuditoriasAgentes();
    var nombreTrim = (nombre || '').trim();
    var usuarioTrim = (usuario || '').trim().toLowerCase();
    if (!nombreTrim && !usuarioTrim) return '';
    var notas = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var ag = String(r.agente || '').trim();
      var agUsr = ag.toLowerCase();
      var match = (nombreTrim && ag === nombreTrim) || (usuarioTrim && agUsr === usuarioTrim) || (usuarioTrim && nombreToLogin(ag) === usuarioTrim);
      if (!match) continue;
      var notaNum = parseFloat(String(r.nota || '').replace(',', '.')) || 0;
      if (notaNum > 0) notas.push({ nota: r.nota, ts: r.fechaHoraTs || 0 });
    }
    notas.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (notas.length === 0) return '—';
    if (notas.length <= 3) return notas.map(function (n) { return n.nota; }).join(' · ');
    return notas.slice(0, 3).map(function (n) { return n.nota; }).join(' · ');
  }

  function saveAuditoriasAgentes(arr) {
    saveData('auditoriasAgentes', trimArrayNewestLast(arr, MAX_AUDITORIAS));
    invalidateCalidadCache();
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

  var _calidadMetricsCache = null;
  function getCalidadMetrics() {
    if (_calidadMetricsCache) return _calidadMetricsCache;
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
    _calidadMetricsCache = { letraMasAfectada: letraOut, top3Macro: top3.slice(0, 3), spark: spark, totalAuditorias: list.length };
    return _calidadMetricsCache;
  }
  function invalidateCalidadCache() { _calidadMetricsCache = null; }
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
      cpe: g('gestionCpe'),
      huboSolucion: g('gestionHuboSolucion')
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
    var intermitenciaList = getIntermitenciaRegistros();
    for (var ii = 0; ii < intermitenciaList.length; ii++) {
      var ts2 = intermitenciaList[ii].fechaHoraTs;
      if (!ts2 || ts2 < mesInicio || ts2 > mesFin) continue;
      var dd2 = new Date(ts2).getDate();
      porDia[dd2 - 1]++;
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
    var btnExcel = $('btnTableroDescargarExcel');
    if (btnExcel && !btnExcel._tableroExcelBound) {
      btnExcel._tableroExcelBound = true;
      btnExcel.addEventListener('click', descargarExcelTableroMensual);
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
    var intermitenciaTotal = getIntermitenciaCountForMonth(selYear, selMonth);
    if (totalEl) totalEl.textContent = total;
    var downloadCardCount = $('tableroDownloadCardCount');
    if (downloadCardCount) downloadCardCount.textContent = total;
    var intermitenciaEl = $('tableroMensualIntermitencia');
    if (intermitenciaEl) intermitenciaEl.textContent = intermitenciaTotal;
    if (emptyEl) emptyEl.style.display = (total > 0 || intermitenciaTotal > 0) ? 'none' : 'block';
  }

  function descargarExcelTableroMensual() {
    var selEl = $('tableroMensualSelector');
    var hoy = new Date();
    var selYear = hoy.getFullYear(), selMonth = hoy.getMonth();
    if (selEl && selEl.value) {
      var p = selEl.value.split('-');
      selYear = parseInt(p[0], 10);
      selMonth = parseInt(p[1], 10);
    }
    var mesInicio = new Date(selYear, selMonth, 1).getTime();
    var mesFin = new Date(selYear, selMonth + 1, 0, 23, 59, 59).getTime();
    var items = getCasosGestion().filter(function (c) {
      var ts = c.fechaHoraTs;
      return ts && ts >= mesInicio && ts <= mesFin;
    });
    function esc(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }
    var csv = EXCEL_COLS.join(';') + '\n';
    for (var i = 0; i < items.length; i++) {
      var row = items[i];
      var huboSol = row.huboSolucion || '';
      if (huboSol === 'Sí') huboSol = 'SI';
      var r = [];
      for (var k = 0; k < EXCEL_KEYS.length; k++) {
        var key = EXCEL_KEYS[k];
        r.push(esc(key === 'huboSolucion' ? huboSol : row[key]));
      }
      csv += r.join(';') + '\n';
    }
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'casos_gestion_' + selYear + '-' + String(selMonth + 1).padStart(2, '0') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
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
      var huboSol = c.huboSolucion || '';
      if (huboSol === 'Sí') huboSol = 'SI';
      return '<tr><td>' + escapeHtml(c.nombre || '') + '</td><td>' + escapeHtml(c.numero || '') + '</td><td>' + escapeHtml(c.pqr || '') + '</td><td>' + escapeHtml(c.nit || '') + '</td><td>' + escapeHtml(c.aliado || '') + '</td><td>' + escapeHtml(c.funcion || '') + '</td><td>' + escapeHtml(c.transferencia || '') + '</td><td>' + escapeHtml(c.areaTransferir || '') + '</td><td>' + escapeHtml(c.extensiones || '') + '</td><td>' + escapeHtml(c.cliente || '') + '</td><td>' + escapeHtml(c.fechaHora || '') + '</td><td>' + escapeHtml(c.duracion || '') + '</td><td>' + escapeHtml(huboSol) + '</td><td><button type="button" class="btn-copy gestion-ver" data-i="' + i + '">Ver</button><button type="button" class="btn-remove gestion-borrar" data-i="' + i + '">Quitar</button></td></tr>';
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
    var JsPDF = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
    if (!JsPDF && !window._jspdfLoading) {
      window._jspdfLoading = true;
      var btn = document.getElementById('btnDescargarInforme');
      if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
      loadScript('https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js').then(function () {
        window._jspdfLoading = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Descargar'; }
        descargarInforme();
      }).catch(function () {
        window._jspdfLoading = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Descargar'; }
        alert('No se pudo cargar el generador PDF.');
      });
      return;
    }
    var d = getData();
    function prom(arr) {
      if (!arr || !arr.length) return 0;
      var s = 0, w = 0;
      arr.forEach(function (r) { var p = parseInt(r.programados, 10) || 0; var pr = parseFloat(String(r.promedio || '0').replace(',', '.')) || 0; s += p * pr; w += p; });
      return w ? Math.round((s / w) * 10) / 10 : 0;
    }
    function num(v) { return parseInt(String(v || '0').replace(/\D/g, ''), 10) || 0; }
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
    if (!JsPDF) {
      var esc = function (v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; };
      var row = [d.currentUserName || 'Usuario', new Date().toLocaleString('es-ES'), d.formPublicoObjetivo || '', d.formPresento || '', d.formaprobo || '', d.formReprobo || '', d.cobertura || '', prom(d.preturnos), prom(d.staff), getCasosGestion().length];
      var blob = new Blob(['\ufeffUsuario;Fecha;Público Objetivo;Presentó;Aprobó;Reprobó;Cobertura;Prom Preturnos;Prom Staff;Casos Gestión\n' + row.map(esc).join(';')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'informe_integra_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href);
      return;
    }
    var cob = num(d.cobertura), pret = prom(d.preturnos), staff = prom(d.staff), hfcC = getCasosConSolucionCount(), hfcB = getDeclaracionesMasivasCount(), hfcR = getVisitasTecnicasCount();
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
    doc.text(fmt(hfcC) + ' Casos Solucionados', 28, 128);
    doc.text(fmt(hfcB) + ' Afectaciones masivas', 28, 142);
    doc.text(fmt(hfcR) + ' Visitas técnicas', 28, 156);
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
    var hv = [hfcC, hfcB, hfcR], hl = ['Casos Solucionados', 'Afectaciones masivas', 'Visitas técnicas'], hc = [c.accent, c.green, c.fuchsia];
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
    if (hfcR > 0) analisis.push(fmt(hfcR) + ' visitas técnicas a monitorear.');
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
      refreshTableroMensual();
      if (isAdmin()) refreshGestionOperacion();
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
      refreshTableroMensual();
      if (isAdmin()) refreshGestionOperacion();
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
      formCard.addEventListener('input', debounce(refreshGestionPlantilla, 180));
    }
    var trEl = $('gestionTransferencia');
    var extrasEl = $('gestionTransferenciaExtras');
    var pruebasEl = $('gestionPruebasSection');
    var huboSolWrap = $('gestionHuboSolucionWrap');
    var areaEl = $('gestionAreaTransferir');
    var extEl = $('gestionExtensiones');
    var redEl = $('gestionRed'), nodoEl = $('gestionNodo'), cpeEl = $('gestionCpe');
    function toggleTransferenciaExtras() {
      var v = (trEl && trEl.value) || '';
      if (extrasEl) extrasEl.style.display = v === 'SI' ? '' : 'none';
      if (pruebasEl) pruebasEl.style.display = v === 'SI' ? 'none' : '';
      if (huboSolWrap) {
        huboSolWrap.style.display = (v !== 'SI') ? '' : 'none';
      }
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
    window.addEventListener('integra:userChange', toggleTransferenciaExtras);
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
      items.push({ nombre: nombre.trim(), usuario: usuario.trim() || nombreToLogin(nombre), clave: clave, estado: 'Temporal', role: 'fibra-optica' });
      saveData('portalUsuarios', trimArrayNewestLast(items, MAX_PORTAL_USUARIOS));
      flushSave();
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
        items.push({ nombre: nombre, usuario: nombreToLogin(nombre), clave: genClaveTemp(), estado: 'Temporal', role: 'fibra-optica' });
      });
      saveData('portalUsuarios', trimArrayNewestLast(items, MAX_PORTAL_USUARIOS));
      flushSave();
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
    refreshEditableByRole();
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
    refreshEditableByRole();
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
      var max = safeMax(masCierran.map(function (x) { return x.cierres || 0; })) || 1;
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
    var sparkStr = hasSpark ? spark.map(function (v) { var m = safeMax(spark) || 1; return _sparkChars[Math.min(7, Math.floor((v / m) * 8))]; }).join('') : '';
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
    var sparkStr = spark.map(function (v) { var m = safeMax(spark) || 1; return _sparkChars[Math.min(7, Math.floor((v / m) * 8))]; }).join('');
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
    var max = safeMax(items.map(function (r) { return r.count || 0; })) || 1;
    var h = 80;
    wrap.innerHTML = '<div class="top3-macro-chart">' + items.map(function (r) {
      var c = r.count || 0;
      var px = max > 0 ? Math.round((c / max) * h) : 0;
      if (px < 6 && c > 0) px = 6;
      var cls = (c >= max && c > 0) ? ' top3-macro-fill-max' : '';
      return '<div class="top3-macro-bar"><span class="top3-macro-val">' + c + '</span><div class="top3-macro-fill-wrap"><div class="top3-macro-fill' + cls + '" style="height:' + px + 'px"></div></div><span class="top3-macro-label">' + escapeHtml(r.macro || '—') + '</span></div>';
    }).join('') + '</div>';
  }

  function refreshAuditoriaAgenteSelect() { /* Autocomplete se actualiza al escribir */ }

  var _auditoriaDropdownDebounce;
  function debounceAuditoriaDropdown() {
    if (_auditoriaDropdownDebounce) clearTimeout(_auditoriaDropdownDebounce);
    _auditoriaDropdownDebounce = setTimeout(function () { _auditoriaDropdownDebounce = 0; showAuditoriaAgenteDropdown(); }, 180);
  }

  function showAuditoriaAgenteDropdown(query) {
    var inp = $('auditoriaAgente'), dd = $('auditoriaAgenteDropdown');
    if (!inp || !dd) return;
    var agentes = getPortalAgentes();
    var q = (query || inp.value || '').trim().toLowerCase();
    var filtered = [];
    for (var i = 0; i < agentes.length; i++) {
      var n = (agentes[i].nombre || agentes[i].usuario || '').trim();
      if (n && (!q || n.toLowerCase().indexOf(q) >= 0)) filtered.push(n);
    }
    if (filtered.length === 0) {
      dd.innerHTML = '<div class="auditoria-agente-dropdown-empty">Sin coincidencias</div>';
    } else {
      dd.innerHTML = filtered.slice(0, 15).map(function (n) { return '<div class="auditoria-agente-dropdown-item" data-value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</div>'; }).join('');
    }
    dd.classList.add('show');
  }

  function hideAuditoriaAgenteDropdown() {
    var dd = $('auditoriaAgenteDropdown');
    if (dd) dd.classList.remove('show');
  }

  function updateAuditoriaNotaActual() {
    var inp = $('auditoriaAgente'), notaActual = $('auditoriaNotaActual');
    if (!inp || !notaActual) return;
    var val = (inp.value || '').trim();
    if (!val) { notaActual.textContent = 'Nota actual: —'; return; }
    var agentes = getPortalAgentes();
    var usuario = '';
    for (var i = 0; i < agentes.length; i++) {
      if ((agentes[i].nombre || '') === val || (agentes[i].usuario || '') === val) {
        usuario = agentes[i].usuario || agentes[i].nombre || '';
        break;
      }
    }
    var nota = getNotaCalidadParaAgente(val, usuario);
    notaActual.textContent = 'Nota actual: ' + (nota || '—');
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
    refreshUsuariosPortal();
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
    var a = $('auditoriaAgente'), n = $('auditoriaNota'), l = $('auditoriaLetra'), i = $('auditoriaItem'), c = $('auditoriaItemCausales'), notaActual = $('auditoriaNotaActual');
    if (a) a.value = ''; if (n) n.value = ''; if (l) l.value = '';
    if (notaActual) notaActual.textContent = 'Nota actual: —';
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
    if (lines.length > 15000) lines = lines.slice(0, 15000);
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
    if (lines.length > 20000) lines = lines.slice(0, 20000);
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
  function refreshBolsaCasosSolucionados() {
    var el = $('bolsaBackNegocios');
    if (el) el.textContent = getCasosSolucionadosCountFO();
  }
  function bindBolsa() {
    var b = getBolsaCasosAbiertos();
    var s = getBolsaSlaFaseCierre();
    var e1 = $('bolsaBackNegocios'), e2 = $('bolsaNegociosGI'), e3 = $('bolsaProactividad');
    var se1 = $('bolsaSlaBackNegocios'), se2 = $('bolsaSlaNegociosGI'), se3 = $('bolsaSlaProactividad');
    refreshBolsaCasosSolucionados();
    if (e2) e2.value = b.negociosGI;
    if (e3) e3.value = b.proactividadVIP;
    if (se1) se1.value = s.backNegocios || 0;
    if (se2) se2.value = s.negociosGI || 0;
    if (se3) se3.value = s.proactividadVIP || 0;
    var btnImp = $('btnBolsaImportar');
    if (btnImp) btnImp.addEventListener('click', function () {
      var ta = $('bolsaPegar');
      var txt = (ta && ta.value) || '';
      if (txt.length > 50000) { btnImp.disabled = true; btnImp.textContent = 'Procesando…'; }
      setTimeout(function () {
        var res = parseBolsaExcel(txt);
        refreshBolsaCasosSolucionados();
      if (e2) e2.value = res.abiertos.negociosGI;
      if (e3) e3.value = res.abiertos.proactividadVIP;
      if (se1) se1.value = res.sla.backNegocios || 0;
      if (se2) se2.value = res.sla.negociosGI || 0;
      if (se3) se3.value = res.sla.proactividadVIP || 0;
      saveBolsaCasosAbiertos({ backNegocios: getCasosSolucionadosCountFO(), negociosGI: res.abiertos.negociosGI, proactividadVIP: res.abiertos.proactividadVIP });
      saveData('bolsaSlaFaseCierre', res.sla);
      saveData('bolsaResueltos', res.resueltos);
      flushSave();
      refreshGestionOperacion();
      if (txt.length > 50000) { btnImp.disabled = false; btnImp.textContent = 'Importar y contar'; }
      }, 0);
    });
    var btn = $('btnBolsaGuardar');
    if (btn) btn.addEventListener('click', function () {
      var n2 = parseInt((e2 && e2.value) || '0', 10) || 0;
      var n3 = parseInt((e3 && e3.value) || '0', 10) || 0;
      var sn1 = parseInt((se1 && se1.value) || '0', 10) || 0;
      var sn2 = parseInt((se2 && se2.value) || '0', 10) || 0;
      var sn3 = parseInt((se3 && se3.value) || '0', 10) || 0;
      saveBolsaCasosAbiertos({ backNegocios: getCasosSolucionadosCountFO(), negociosGI: n2, proactividadVIP: n3 });
      saveData('bolsaSlaFaseCierre', { backNegocios: sn1, negociosGI: sn2, proactividadVIP: sn3 });
      flushSave();
      refreshGestionOperacion();
    });
    var btnReinc = $('btnReincidenciaImportar');
    var taReinc = $('reincidenciaPegar');
    if (btnReinc && taReinc) btnReinc.addEventListener('click', function () {
      var txt = taReinc.value || '';
      if (txt.length > 100000) { btnReinc.disabled = true; btnReinc.textContent = 'Procesando…'; }
      setTimeout(function () {
        var res = parseReincidenciaExcel(txt);
        saveData('bolsaReincidencias', res.flat);
        saveData('bolsaReincidenciasByCI', res.byCI);
        flushSave();
        refreshReincidenciaBolsa(res);
        refreshReincidencias(getData(), getGestionDataFromStorage());
        if (txt.length > 100000) { btnReinc.disabled = false; btnReinc.textContent = 'Importar y contar'; }
      }, 0);
    });
    var bolsaReinc = getData().bolsaReincidencias;
    var bolsaByCI = getData().bolsaReincidenciasByCI;
    if (bolsaReinc || bolsaByCI) refreshReincidenciaBolsa(bolsaByCI && bolsaByCI.length ? { flat: bolsaReinc || [], byCI: bolsaByCI } : (bolsaReinc || []));

    var hfcContactoEl = $('bolsaHfcCierresContacto');
    var hfcBuzonEl = $('bolsaHfcCierresBuzon');
    var hfcReincNumEl = $('bolsaHfcReincidenciasNum');
    var dHfc = getData();
    if (hfcContactoEl) hfcContactoEl.textContent = getCasosConSolucionCount();
    if (hfcBuzonEl) hfcBuzonEl.textContent = getDeclaracionesMasivasCount();
    if (hfcReincNumEl) hfcReincNumEl.textContent = getVisitasTecnicasCount();
    var btnHfcReinc = $('btnHfcReincidenciaImportar');
    var taHfcReinc = $('hfcReincidenciaPegar');
    if (btnHfcReinc && taHfcReinc) btnHfcReinc.addEventListener('click', function () {
      var res = parseReincidenciaExcel(taHfcReinc.value || '');
      saveData('bolsaReincidencias', res.flat);
      saveData('bolsaReincidenciasByCI', res.byCI);
      flushSave();
      refreshReincidenciaBolsa(res);
      refreshReincidencias(getData(), getGestionDataFromStorage());
    });
    function saveHfcFormData() {
      flushSave();
      refreshGestionOperacionHfc();
    }

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

  function getIntermitenciaRegistros() {
    var d = getData();
    var list = d.intermitenciaRegistros;
    if (!Array.isArray(list)) return [];
    return list.map(function (r) {
      var hubo = r.huboSolucion, ago = r.agendoVisita, llam = r.llamadaServicio, fec = r.fecha;
      if (hubo && /^\d+$/.test(String(hubo).trim())) {
        llam = hubo;
        hubo = '—';
      }
      if (ago && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(String(ago))) {
        fec = fec || ago;
        ago = '—';
      }
      if (llam && /^(s[ií]|no)$/i.test(String(llam).trim()) && (!hubo || hubo === '—')) {
        hubo = llam;
        llam = '—';
      }
      return {
        numeroCuenta: r.numeroCuenta || '—',
        numeroPqr: r.numeroPqr || '—',
        marcacion: r.marcacion || '—',
        huboSolucion: hubo || '—',
        agendoVisita: ago || '—',
        llamadaServicio: (llam !== undefined && llam !== '') ? llam : (r.llamadaServicio || '—'),
        maiva: r.maiva || '—',
        inc: (r.inc !== undefined && String(r.inc).trim() !== '') ? r.inc : '—',
        fecha: fec || r.fecha || '',
        fechaHoraTs: r.fechaHoraTs
      };
    });
  }
  function addIntermitenciaRegistro(numeroCuenta, numeroPqr, marcacion, huboSolucion, agendoVisita, llamadaServicio, maiva, inc) {
    var list = getIntermitenciaRegistros();
    var now = Date.now();
    list.unshift({
      numeroCuenta: String(numeroCuenta || '').trim(),
      numeroPqr: String(numeroPqr || '').trim(),
      marcacion: String(marcacion || '').trim(),
      huboSolucion: huboSolucion === 'si' ? 'Sí' : (huboSolucion === 'no' ? 'No' : ''),
      agendoVisita: agendoVisita === 'si' ? 'Sí' : (agendoVisita === 'no' ? 'No' : ''),
      llamadaServicio: String(llamadaServicio || '').trim(),
      maiva: maiva === 'si' ? 'Sí' : (maiva === 'no' ? 'No' : ''),
      inc: String(inc || '').trim(),
      fecha: new Date(now).toLocaleString('es'),
      fechaHoraTs: now
    });
    saveData('intermitenciaRegistros', trimArrayNewestFirst(list, MAX_INTERMITENCIA));
  }
  function getIntermitenciaCountForMonth(year, month) {
    var list = getIntermitenciaRegistros();
    var mesInicio = new Date(year, month, 1).getTime();
    var mesFin = new Date(year, month + 1, 0, 23, 59, 59).getTime();
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var ts = list[i].fechaHoraTs;
      if (ts && ts >= mesInicio && ts <= mesFin) n++;
    }
    return n;
  }
  function refreshIntermitenciaList() {
    var tbody = $('intermitenciaTbody');
    var tabla = $('intermitenciaTabla');
    var emptyEl = $('intermitenciaEmpty');
    var countEl = $('intermitenciaCountVal');
    if (!tbody) return;
    var list = getIntermitenciaRegistros();
    if (countEl) countEl.textContent = list.length;
    if (list.length === 0) {
      if (tabla) tabla.style.display = 'none';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (tabla) tabla.style.display = 'table';
    if (emptyEl) emptyEl.style.display = 'none';
    tbody.innerHTML = list.map(function (r) {
      return '<tr><td>' + escapeHtml(r.numeroCuenta) + '</td><td>' + escapeHtml(r.numeroPqr || '—') + '</td><td>' + escapeHtml(r.marcacion || '—') + '</td><td>' + escapeHtml(r.huboSolucion || '—') + '</td><td>' + escapeHtml(r.agendoVisita || '—') + '</td><td>' + escapeHtml(r.llamadaServicio || '—') + '</td><td>' + escapeHtml(r.maiva || '—') + '</td><td>' + escapeHtml(r.inc || '—') + '</td><td>' + escapeHtml(r.fecha || '') + '</td></tr>';
    }).join('');
  }
  function bindQoEIntermitenciaForm() {
    var btn = $('qoeBtnGuardarIntermitencia');
    var inpCuenta = $('qoeNumeroCuenta');
    var selSolucion = $('qoeHuboSolucion');
    var selAgendo = $('qoeAgendoVisita');
    var llamadaWrap = $('qoeLlamadaWrap');
    var inpLlamada = $('qoeLlamadaServicio');
    var selMaiva = $('qoeMaiva');
    var incWrap = $('qoeIncWrap');
    var inpInc = $('qoeInc');
    if (!btn || !inpCuenta || !selSolucion) return;
    if (selAgendo && llamadaWrap) {
      selAgendo.addEventListener('change', function () {
        llamadaWrap.style.display = selAgendo.value === 'si' ? 'flex' : 'none';
        if (selAgendo.value !== 'si') inpLlamada.value = '';
      });
    }
    if (selMaiva && incWrap) {
      selMaiva.addEventListener('change', function () {
        incWrap.style.display = selMaiva.value === 'si' ? 'flex' : 'none';
        if (selMaiva.value !== 'si' && inpInc) inpInc.value = '';
      });
    }
    var inpPqr = $('qoeNumeroPqr');
    var inpMarcacion = $('qoeMarcacion');
    btn.addEventListener('click', function () {
      var cuenta = (inpCuenta.value || '').trim();
      var pqr = inpPqr ? (inpPqr.value || '').trim() : '';
      var marcacion = inpMarcacion ? (inpMarcacion.value || '').trim() : '';
      var solucion = selSolucion.value || '';
      var agendo = selAgendo ? selAgendo.value : '';
      var llamada = inpLlamada ? (inpLlamada.value || '').trim() : '';
      var maiva = selMaiva ? selMaiva.value : '';
      var inc = inpInc ? (inpInc.value || '').trim() : '';
      if (!cuenta) return;
      addIntermitenciaRegistro(cuenta, pqr, marcacion, solucion, agendo, llamada, maiva, inc);
      flushSave();
      refreshIntermitenciaList();
      refreshTableroMensual();
      refreshGestionOperacionHfc();
      var badge = $('qoeCasosValidadosBadge');
      if (badge) badge.textContent = getIntermitenciaRegistros().length + ' Casos validados';
      inpCuenta.value = '';
      if (inpPqr) inpPqr.value = '';
      if (inpMarcacion) inpMarcacion.value = '';
      selSolucion.value = '';
      if (selAgendo) selAgendo.value = '';
      if (inpLlamada) inpLlamada.value = '';
      if (llamadaWrap) llamadaWrap.style.display = 'none';
      if (selMaiva) selMaiva.value = '';
      if (inpInc) inpInc.value = '';
      if (incWrap) incWrap.style.display = 'none';
    });
  }
  function bindQoEIntermitenciaToggle() {
    var header = $('qoeIntermitenciaHeader');
    var content = $('qoeIntermitenciaContent');
    var icon = $('qoeIntermitenciaIcon');
    if (!header || !content || !icon) return;
    header.addEventListener('click', function () {
      var collapsed = content.classList.toggle('qoe-intermitencia-collapsed');
      header.classList.toggle('qoe-intermitencia-header-collapsed', collapsed);
      icon.textContent = collapsed ? '+' : '−';
    });
    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
  }

  function bindQoEDiagnostico() {
    var btn = $('qoeBtnAnalizar'), msgEl = $('qoeAnalisisMsg');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var modemTa = $('qoeModemOutput'), upstreamTa = $('qoeUpstreamOutput');
      var modemOutput = (modemTa && modemTa.value) ? modemTa.value.trim() : '';
      var upstreamOutput = (upstreamTa && upstreamTa.value) ? upstreamTa.value.trim() : '';
      if (modemOutput && !upstreamOutput && /show\s+interface\s+upstream|Interface\s+upstream\s+[\d\/]/i.test(modemOutput)) {
        var splitIdx = modemOutput.search(/show\s+interface\s+upstream|Interface\s+upstream\s+[\d\/]/i);
        if (splitIdx > 10) {
          upstreamOutput = modemOutput.substring(splitIdx);
          modemOutput = modemOutput.substring(0, splitIdx).trim();
        }
      }
      if (!modemOutput && !upstreamOutput) {
        if (msgEl) { msgEl.style.display = ''; msgEl.innerHTML = '<span class="qoe-error">Pega al menos uno de los dos outputs.</span>'; }
        return;
      }
      var parsed = (typeof ParserQoE !== 'undefined' && ParserQoE.parseCmtsOutput)
        ? ParserQoE.parseCmtsOutput({ modemOutput: modemOutput || undefined, upstreamOutput: upstreamOutput || undefined })
        : null;
      if (!parsed) {
        if (msgEl) { msgEl.style.display = ''; msgEl.innerHTML = '<span class="qoe-error">Error: parser no disponible.</span>'; }
        return;
      }
      if (!parsed.modem && !parsed.upstream) {
        if (msgEl) { msgEl.style.display = ''; msgEl.innerHTML = '<span class="qoe-error">No se pudo extraer información. Revisa el formato.</span>'; }
        return;
      }
      if (msgEl) msgEl.style.display = 'none';
      updateQoeNocAnalyzer(modemOutput, upstreamOutput);
    });
    updateQoeNocGraficaAfectacion();
  }

  function updateQoeNocAnalyzer(modemOutput, upstreamOutput) {
    if (typeof NocAnalyzerQoE === 'undefined' || !NocAnalyzerQoE.analyze) return;
    var diag = NocAnalyzerQoE.analyze(modemOutput || '', upstreamOutput || '');
    function semaforoClass(c) { return 'qoe-semaforo-' + (c || 'muted'); }
    function setVal(parentId, val, color) {
      var parent = document.getElementById(parentId);
      if (!parent) return;
      var span = parent.querySelector('.qoe-noc-metric-val');
      if (!span) return;
      span.textContent = val != null && val !== '' ? val : '—';
      span.className = 'qoe-noc-metric-val ' + semaforoClass(color);
    }
    $('qoeNocCmts').textContent = diag.cmtsType || '—';
    $('qoeNocNodo').textContent = diag.node || '—';
    $('qoeNocModems').textContent = diag.totalModems != null ? diag.totalModems : '—';
    var badge = $('qoeNocEstado');
    if (badge) {
      badge.textContent = diag.globalEstado ? diag.globalEstado.texto : 'Sin análisis';
      badge.className = 'qoe-noc-badge qoe-noc-badge-' + (diag.globalEstado ? diag.globalEstado.color : 'muted');
    }
    setVal('qoeNocTx', diag.tx && diag.tx.valor, diag.tx && diag.tx.color);
    setVal('qoeNocRx', diag.rx && diag.rx.valor, diag.rx && diag.rx.color);
    setVal('qoeNocSnrUp', diag.snrUp && diag.snrUp.valor, diag.snrUp && diag.snrUp.color);
    setVal('qoeNocSnrDown', diag.snrDown && diag.snrDown.valor, diag.snrDown && diag.snrDown.color);
    setVal('qoeNocFlaps', diag.estabilidad && diag.estabilidad.flaps, diag.intermitencia && diag.intermitencia.color);
    var uncStr = (diag.estabilidad && diag.estabilidad.uncorrectables != null) ? diag.estabilidad.uncorrectables : (diag.raw && diag.raw.uncorrectables);
    setVal('qoeNocCrc', uncStr, null);
    setVal('qoeNocRanging', diag.estabilidad && diag.estabilidad.rangingRetries, null);
    setVal('qoeNocUptime', diag.estabilidad && diag.estabilidad.uptime, null);
    setVal('qoeNocUtil', diag.masivoPanel && diag.masivoPanel.utilization != null ? diag.masivoPanel.utilization + '%' : null, null);
    setVal('qoeNocModemsChan', diag.masivoPanel && diag.masivoPanel.totalModems, null);
    setVal('qoeNocUncorrGlob', diag.masivoPanel && diag.masivoPanel.uncorrectablesGlobal, null);
    setVal('qoeNocMasivo', diag.masivo && diag.masivo.texto, diag.masivo && diag.masivo.color);
    var recList = $('qoeNocRecList');
    if (recList && diag.protocolo) {
      var p = diag.protocolo;
      var html = '';
      /* Motor de decisión jerárquico: Diagnóstico explícito */
      var nivelTexto = p.esMasivo ? 'Afectación compartida' : 'Individual';
      html += '<div class="qoe-noc-protocolo-header">';
      html += '<span class="qoe-noc-nivel">Nivel: ' + nivelTexto + '</span>';
      if (p.severidad) html += '<span class="qoe-noc-severidad">Severidad: ' + escapeHtml(p.severidad) + '</span>';
      html += '<span class="qoe-noc-confianza">Confianza: ' + (p.confianza || 'Baja') + '</span>';
      if (p.visitabloqueada) {
        html += '<span class="qoe-noc-visita-bloq">Visita técnica bloqueada (origen canal/nodo)</span>';
      } else if (p.sugerirVisita) {
        html += '<span class="qoe-noc-visita-sug">Se sugiere visita técnica</span>';
      }
      html += '</div>';
      if (p.diagnosticoExplicito) {
        html += '<div class="qoe-noc-diagnostico">' + escapeHtml(p.diagnosticoExplicito) + '</div>';
      }
      if (p.mensajeBloqueo) {
        html += '<div class="qoe-noc-mensaje-bloqueo">' + escapeHtml(p.mensajeBloqueo) + '</div>';
      }
      /* Hallazgos técnicos */
      if (p.hallazgos && p.hallazgos.length) {
        html += '<div class="qoe-noc-evidencia"><strong>Hallazgos técnicos:</strong> ';
        html += p.hallazgos.map(function (e) {
          var v = e.valor != null ? e.valor : '—';
          return escapeHtml(e.metrica) + '=' + v + (e.unidad ? ' ' + e.unidad : '') + ' (' + escapeHtml(e.umbral) + ')';
        }).join(' · ');
        html += '</div>';
      }
      /* Condición / Conclusión del motor */
      if (p.recs && p.recs.length) {
        p.recs.forEach(function (r) {
          var pClass = r.prioridad === 'crítica' ? 'qoe-noc-rec-prioridad-critica' : (r.prioridad === 'alta' ? 'qoe-noc-rec-prioridad-alta' : '');
          html += '<div class="qoe-noc-rec-item ' + pClass + '">' +
            '<strong>' + escapeHtml(r.accion) + '</strong>' +
            '<p class="qoe-noc-rec-condicion"><em>Condición:</em> ' + escapeHtml(r.condicion) + (r.conclusion ? ' → ' + escapeHtml(r.conclusion) : '') + '</p>' +
            '</div>';
        });
      }
      /* Acción operativa ejecutable */
      if (p.accionOperativa && p.accionOperativa.length) {
        html += '<div class="qoe-noc-accion-operativa"><strong>Acción operativa ejecutable:</strong>';
        html += '<ol class="qoe-noc-rec-pasos">' + p.accionOperativa.map(function (x) { return '<li>' + escapeHtml(x) + '</li>'; }).join('') + '</ol>';
        html += '</div>';
      }
      recList.innerHTML = html || '<p class="qoe-noc-rec-empty">—</p>';
    } else if (recList) {
      recList.innerHTML = '<p class="qoe-noc-rec-empty">—</p>';
    }
    /* Guardar en historial y actualizar gráfica de afectación / intermitencia */
    var uncorr = (diag.masivoPanel && diag.masivoPanel.uncorrectablesGlobal != null) ? diag.masivoPanel.uncorrectablesGlobal : (diag.raw && diag.raw.uncorrectablesGlobal);
    if (uncorr != null || (diag.raw && diag.raw.uncorrectables != null)) {
      var util = (diag.masivoPanel && diag.masivoPanel.utilization != null) ? diag.masivoPanel.utilization : null;
      var snrUp = (diag.snrUp && diag.snrUp.valor != null) ? diag.snrUp.valor : (diag.raw && diag.raw.snrUp);
      var flaps = (diag.estabilidad && diag.estabilidad.flaps != null) ? diag.estabilidad.flaps : (diag.raw && diag.raw.flaps);
      var esMasivo = diag.protocolo && diag.protocolo.esMasivo;
      pushNocAfectacionHistory({ ts: Date.now(), uncorr: uncorr || diag.raw.uncorrectables, modems: diag.totalModems, esMasivo: esMasivo, util: util, snrUp: snrUp, flaps: flaps });
      if (esMasivo) refreshGestionOperacionHfc();
      updateQoeNocGraficaAfectacion();
    }
  }

  var NOC_AFECTACION_HISTORY_KEY = 'integra_noc_afectacion';
  var NOC_AFECTACION_MAX = 24;
  function getCasosConSolucionCount() {
    var d = getData();
    var list = d.intermitenciaRegistros;
    if (!Array.isArray(list)) return 0;
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var h = String(list[i].huboSolucion || '').trim().toLowerCase();
      if (h === 'sí' || h === 'si') n++;
    }
    return n;
  }
  function getVisitasTecnicasCount() {
    var d = getData();
    var list = d.intermitenciaRegistros;
    if (!Array.isArray(list)) return 0;
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var a = String(list[i].agendoVisita || '').trim().toLowerCase();
      if (a === 'sí' || a === 'si') n++;
    }
    return n;
  }
  function getCasosSolucionadosCountFO() {
    var d = getData();
    var count = 0;
    for (var key in d) {
      if (key.indexOf('gestionCasos_') !== 0) continue;
      var arr = d[key];
      if (!Array.isArray(arr)) continue;
      for (var i = 0; i < arr.length; i++) {
        var h = String(arr[i].huboSolucion || '').trim();
        if (h === 'Sí' || h === 'SI') count++;
      }
    }
    return count;
  }
  function getDeclaracionesMasivasCount() {
    var d = getData();
    var list = d.intermitenciaRegistros;
    if (!Array.isArray(list)) return 0;
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var m = String(list[i].maiva || '').trim().toLowerCase();
      if (m === 'sí' || m === 'si') n++;
    }
    return n;
  }
  function getNocAfectacionHistory() {
    try {
      var raw = localStorage.getItem(NOC_AFECTACION_HISTORY_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function pushNocAfectacionHistory(point) {
    var arr = getNocAfectacionHistory();
    arr.push(point);
    if (arr.length > NOC_AFECTACION_MAX) arr = arr.slice(-NOC_AFECTACION_MAX);
    try { localStorage.setItem(NOC_AFECTACION_HISTORY_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  /* Umbrales NOC: errores/min (delta entre mediciones, no acumulado) */
  var RATE_NORMAL = 500;
  var RATE_LEVE = 3000;
  var RATE_SEVERO = 8000;
  function getRateCategory(ratePerMin) {
    if (ratePerMin < RATE_NORMAL) return { label: 'Normal', color: '#22c55e' };
    if (ratePerMin < RATE_LEVE) return { label: 'Ruido leve', color: '#fbbf24' };
    if (ratePerMin < RATE_SEVERO) return { label: 'Ruido activo', color: '#f97316' };
    return { label: 'Ruido severo', color: '#ef4444' };
  }
  function updateQoeNocGraficaAfectacion() {
    var chartEl = document.getElementById('qoeNocChart');
    var emptyEl = document.getElementById('qoeNocChartEmpty');
    var indEl = document.getElementById('qoeNocImpactoIndicator');
    var statusEl = document.getElementById('qoeNocImpactoStatus');
    var detailEl = document.getElementById('qoeNocImpactoDetail');
    if (!chartEl || !emptyEl) return;
    var history = getNocAfectacionHistory();
    if (!history.length) {
      if (indEl) indEl.style.display = 'none';
      var mon = document.getElementById('qoeNocIntermitenciaMonitor');
      if (mon) mon.style.display = 'none';
      emptyEl.innerHTML = 'Ejecuta análisis cada 5 min para ver tasa de errores (errores/min). Mín. 2 mediciones.';
      emptyEl.style.display = 'block';
      chartEl.style.display = 'none';
      chartEl.innerHTML = '';
      return;
    }
    var last = history[history.length - 1];
    var modems = last.modems != null ? last.modems : 0;
    var util = last.util != null ? last.util : null;
    var esMasivo = last.esMasivo === true;
    /* Calcular tasas: delta / minutos (errores por minuto) */
    var rates = [];
    for (var i = 1; i < history.length; i++) {
      var prev = history[i - 1], curr = history[i];
      var delta = Math.max(0, (curr.uncorr || 0) - (prev.uncorr || 0));
      var mins = (curr.ts - prev.ts) / 60000;
      var rate = mins > 0 ? Math.round(delta / mins) : 0;
      rates.push({ ts: curr.ts, rate: rate, xIdx: i - 1 });
    }
    if (!rates.length) {
      if (indEl && statusEl && detailEl) {
        indEl.style.display = 'block';
        indEl.className = 'qoe-noc-impacto-indicator qoe-noc-impacto-' + (esMasivo ? 'masivo-activo' : 'individual');
        statusEl.innerHTML = (esMasivo ? '🔵 MASIVO' : '🟢 INDIVIDUAL') + ' · 1 medición';
        detailEl.innerHTML = 'Impacto: ' + modems + ' modems en canal' + (util != null ? ' · Utilización: ' + util + '%' : '') + '<br>Actividad: — (se necesita otra medición para tasa)';
      }
      emptyEl.innerHTML = 'Se necesitan al menos 2 análisis para calcular tasa (errores/min). Recomendado: cada 5 min.';
      emptyEl.style.display = 'block';
      chartEl.style.display = 'none';
      chartEl.innerHTML = '';
      updateQoeNocIntermitenciaMonitor();
      return;
    }
    var lastRate = rates[rates.length - 1].rate;
    var prevRate = rates.length > 1 ? rates[rates.length - 2].rate : lastRate;
    var trend = lastRate > prevRate * 1.1 ? '↗ creciendo' : (lastRate < prevRate * 0.9 ? '↘ bajando' : '→ estable');
    var status = '';
    var statusClass = 'individual';
    if (lastRate >= RATE_NORMAL && modems > 50) {
      status = '🔵 MASIVO ACTIVO';
      statusClass = 'masivo-activo';
    } else if (lastRate < RATE_NORMAL && (esMasivo || modems > 50)) {
      status = '🟡 EVENTO PASADO';
      statusClass = 'evento-pasado';
    } else {
      status = '🟢 INDIVIDUAL';
      statusClass = 'individual';
    }
    if (indEl && statusEl && detailEl) {
      indEl.style.display = 'block';
      indEl.className = 'qoe-noc-impacto-indicator qoe-noc-impacto-' + statusClass;
      statusEl.innerHTML = status;
      detailEl.innerHTML = 'Actividad: ' + lastRate.toLocaleString('es-ES') + '/min (' + trend + ')' +
        '<br>Impacto: ' + modems + ' modems en canal' + (modems > 50 ? ' (Masivo)' : '') +
        (util != null ? ' · Utilización: ' + util + '%' : '') +
        (statusClass === 'evento-pasado' ? '<br>Estado actual: Estable' : '');
    }
    emptyEl.style.display = 'none';
    chartEl.style.display = 'block';
    var w = 400, h = 140, pad = { t: 10, r: 8, b: 28, l: 44 };
    var gw = w - pad.l - pad.r, gh = h - pad.t - pad.b;
    var maxRate = Math.max(RATE_SEVERO, 1000);
    for (var i = 0; i < rates.length; i++) {
      if (rates[i].rate > maxRate) maxRate = Math.ceil(rates[i].rate * 1.15 / 1000) * 1000;
    }
    if (maxRate < RATE_NORMAL) maxRate = RATE_NORMAL;
    var pts = [], areaPts = [];
    for (var i = 0; i < rates.length; i++) {
      var x = pad.l + (rates.length > 1 ? (i / (rates.length - 1)) * gw : 0);
      var y = pad.t + gh - (rates[i].rate / maxRate) * gh;
      pts.push({ x: x, y: y, rate: rates[i].rate });
    }
    areaPts = pts.map(function (p) { return p.x + ',' + p.y; });
    areaPts.push(pad.l + (rates.length > 1 ? gw : 0) + ',' + (pad.t + gh));
    areaPts.unshift(pad.l + ',' + (pad.t + gh));
    var lastCat = getRateCategory(pts.length ? pts[pts.length - 1].rate : 0);
    var fillRgba = lastCat.color === '#22c55e' ? 'rgba(34,197,94,0.25)' : lastCat.color === '#fbbf24' ? 'rgba(251,191,36,0.25)' : lastCat.color === '#f97316' ? 'rgba(249,115,22,0.25)' : 'rgba(239,68,68,0.25)';
    var svg = '<polygon fill="' + fillRgba + '" stroke="none" points="' + areaPts.join(' ') + '"/>';
    for (var i = 0; i < pts.length - 1; i++) {
      var c = getRateCategory(pts[i].rate);
      svg += '<line x1="' + pts[i].x + '" y1="' + pts[i].y + '" x2="' + pts[i + 1].x + '" y2="' + pts[i + 1].y + '" stroke="' + c.color + '" stroke-width="2" stroke-linecap="round"/>';
    }
    if (pts.length) svg += '<line x1="' + pts[pts.length - 1].x + '" y1="' + pts[pts.length - 1].y + '" x2="' + pts[pts.length - 1].x + '" y2="' + (pad.t + gh) + '" stroke="' + lastCat.color + '" stroke-width="2"/>';
    /* Ejes */
    svg += '<line x1="' + pad.l + '" y1="' + (pad.t + gh) + '" x2="' + (w - pad.r) + '" y2="' + (pad.t + gh) + '" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>';
    svg += '<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + (pad.t + gh) + '" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>';
    var lblMax = maxRate >= 1000 ? (maxRate / 1000) + 'k' : maxRate;
    svg += '<text x="' + (pad.l - 4) + '" y="' + (pad.t + 12) + '" fill="rgba(255,255,255,0.6)" font-size="9" text-anchor="end">' + lblMax + '</text>';
    svg += '<text x="' + (pad.l - 4) + '" y="' + (pad.t + gh + 4) + '" fill="rgba(255,255,255,0.6)" font-size="9" text-anchor="end">0</text>';
    var lastRate = pts.length ? pts[pts.length - 1].rate : 0;
    var cat = getRateCategory(lastRate);
    svg += '<text x="' + (w / 2) + '" y="' + (h - 6) + '" fill="rgba(255,255,255,0.6)" font-size="8" text-anchor="middle">Errores/min · ' + rates.length + ' intervalos · Actual: ' + lastRate + '/min (' + cat.label + ')</text>';
    chartEl.innerHTML = svg;
    chartEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    updateQoeNocIntermitenciaMonitor();
  }

  /* Monitor de intermitencia NOC: 3 métricas + detección de picos */
  var INTERMITENCIA_WINDOW_MS = 30 * 60 * 1000;
  var PICO_RATE_MIN = 3000;
  var PICO_SNR_MAX = 28;
  var PICO_FLAPS_MIN = 5;
  function updateQoeNocIntermitenciaMonitor() {
    var wrap = document.getElementById('qoeNocIntermitenciaMonitor');
    var statusEl = document.getElementById('qoeNocIntermitenciaStatus');
    var chartsEl = document.getElementById('qoeNocIntermitenciaCharts');
    if (!wrap || !statusEl || !chartsEl) return;
    var history = getNocAfectacionHistory();
    var now = Date.now();
    var windowed = history.filter(function (p) { return now - p.ts <= INTERMITENCIA_WINDOW_MS; });
    if (windowed.length < 2) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    var rates = [], snrs = [], flapsDeltas = [], peaks = [];
    for (var i = 1; i < windowed.length; i++) {
      var prev = windowed[i - 1], curr = windowed[i];
      var mins = (curr.ts - prev.ts) / 60000;
      var rate = mins > 0 ? Math.round(Math.max(0, (curr.uncorr || 0) - (prev.uncorr || 0)) / mins) : 0;
      var flapsDelta = Math.max(0, (curr.flaps || 0) - (prev.flaps || 0));
      rates.push({ ts: curr.ts, v: rate });
      snrs.push({ ts: curr.ts, v: curr.snrUp != null ? curr.snrUp : null });
      flapsDeltas.push({ ts: curr.ts, v: flapsDelta });
      var isPeak = (rate >= PICO_RATE_MIN) || (curr.snrUp != null && curr.snrUp <= PICO_SNR_MAX) || (flapsDelta >= PICO_FLAPS_MIN);
      if (isPeak) peaks.push(curr.ts);
    }
    var sectorIntermitente = peaks.length >= 3;
    statusEl.className = 'qoe-noc-intermitencia-status qoe-noc-' + (sectorIntermitente ? 'intermitente' : 'estable');
    statusEl.innerHTML = sectorIntermitente
      ? '⚠ SECTOR INTERMITENTE · ' + peaks.length + ' picos en últimos 30 min'
      : 'Sector estable · ' + peaks.length + ' picos en 30 min';
    var w = 480, h = 200, pad = { t: 18, r: 42, b: 32, l: 44 };
    var gw = w - pad.l - pad.r, gh = h - pad.t - pad.b;
    var maxRate = Math.max(PICO_RATE_MIN, 1000);
    var maxFlaps = 0;
    for (var ri = 0; ri < rates.length; ri++) {
      if (rates[ri].v > maxRate) maxRate = Math.ceil(rates[ri].v * 1.1 / 500) * 500;
      if (flapsDeltas[ri] && flapsDeltas[ri].v > maxFlaps) maxFlaps = flapsDeltas[ri].v;
    }
    if (maxFlaps < 100) maxFlaps = 100;
    if (maxRate < 2000) maxRate = 2000;
    var snrMin = 10, snrMax = 40;
    function fmtTime(ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="qoe-noc-combined-chart" preserveAspectRatio="xMidYMid meet">';
    for (var g = 0; g <= 4; g++) {
      var y = pad.t + (gh * (1 - g / 4));
      svg += '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (w - pad.r) + '" y2="' + y + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
    }
    for (var gx = 0; gx <= 4; gx++) {
      var xx = pad.l + (gw * gx / 4);
      svg += '<line x1="' + xx + '" y1="' + pad.t + '" x2="' + xx + '" y2="' + (pad.t + gh) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    }
    var ySnr30 = pad.t + gh - ((30 - snrMin) / (snrMax - snrMin)) * gh;
    svg += '<line x1="' + pad.l + '" y1="' + ySnr30 + '" x2="' + (w - pad.r) + '" y2="' + ySnr30 + '" stroke="rgba(249,115,22,0.6)" stroke-dasharray="6 4" stroke-width="1.5"/>';
    svg += '<text x="' + (w - pad.r + 4) + '" y="' + (ySnr30 + 4) + '" fill="rgba(249,115,22,0.9)" font-size="10">30 dB</text>';
    var ptsRate = [], ptsSnr = [], ptsFlaps = [], peakAreas = [];
    for (var j = 0; j < rates.length; j++) {
      var x = pad.l + (rates.length > 1 ? (j / (rates.length - 1)) * gw : 0);
      var r = rates[j].v, s = snrs[j].v, f = flapsDeltas[j].v;
      var yR = pad.t + gh - (r / maxRate) * gh;
      var yS = s != null ? pad.t + gh - ((s - snrMin) / (snrMax - snrMin)) * gh : null;
      var yF = pad.t + gh - ((f || 0) / maxFlaps) * gh;
      ptsRate.push(x + ',' + yR);
      if (yS != null) ptsSnr.push(x + ',' + yS);
      ptsFlaps.push(x + ',' + yF);
      if (r >= PICO_RATE_MIN) {
        var step = rates.length > 1 ? gw / (rates.length - 1) : gw;
        var prevX = Math.max(pad.l, x - step * 0.5);
        var nextX = Math.min(w - pad.r, x + step * 0.5);
        peakAreas.push(prevX + ',' + (pad.t + gh) + ' ' + x + ',' + yR + ' ' + nextX + ',' + (pad.t + gh));
      }
    }
    for (var pa = 0; pa < peakAreas.length; pa++) {
      var pts = peakAreas[pa].split(' ');
      var poly = pts.map(function (p) { var m = p.split(','); return m[0] + ',' + m[1]; }).join(' ');
      svg += '<polygon fill="rgba(239,68,68,0.2)" stroke="none" points="' + poly + '"/>';
    }
    if (ptsRate.length >= 2) svg += '<polyline fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + ptsRate.join(' ') + '"/>';
    for (var ci = 0; ci < ptsRate.length; ci++) {
      var crd = ptsRate[ci].split(',');
      svg += '<circle cx="' + crd[0] + '" cy="' + crd[1] + '" r="4" fill="#ef4444" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>';
    }
    if (ptsSnr.length >= 2) svg += '<polyline fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + ptsSnr.join(' ') + '"/>';
    for (var si = 0; si < ptsSnr.length; si++) {
      var sc = ptsSnr[si].split(',');
      svg += '<circle cx="' + sc[0] + '" cy="' + sc[1] + '" r="3" fill="#f97316" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>';
    }
    if (ptsFlaps.length >= 2) svg += '<polyline fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="' + ptsFlaps.join(' ') + '"/>';
    for (var fi = 0; fi < ptsFlaps.length; fi++) {
      var fc = ptsFlaps[fi].split(',');
      svg += '<circle cx="' + fc[0] + '" cy="' + fc[1] + '" r="2.5" fill="#38bdf8" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>';
    }
    svg += '<line x1="' + pad.l + '" y1="' + (pad.t + gh) + '" x2="' + (w - pad.r) + '" y2="' + (pad.t + gh) + '" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>';
    svg += '<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + (pad.t + gh) + '" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>';
    svg += '<line x1="' + (w - pad.r) + '" y1="' + pad.t + '" x2="' + (w - pad.r) + '" y2="' + (pad.t + gh) + '" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>';
    for (var li = 0; li <= 4; li++) {
      var ly = pad.t + gh - (gh * li / 4);
      var leftVal = Math.round(maxRate * li / 4);
      svg += '<text x="' + (pad.l - 6) + '" y="' + (ly + 4) + '" fill="rgba(255,255,255,0.6)" font-size="10" text-anchor="end">' + (leftVal >= 1000 ? (leftVal / 1000) + 'k' : leftVal) + '</text>';
      var rightVal = snrMax - Math.round((snrMax - snrMin) * li / 4);
      svg += '<text x="' + (w - pad.r + 6) + '" y="' + (ly + 4) + '" fill="rgba(255,255,255,0.5)" font-size="10" text-anchor="start">' + rightVal + '</text>';
    }
    for (var ti = 0; ti < rates.length; ti += Math.max(1, Math.floor(rates.length / 5))) {
      var tx = pad.l + (rates.length > 1 ? (ti / (rates.length - 1)) * gw : 0);
      var lbl = fmtTime(rates[ti].ts);
      svg += '<text x="' + tx + '" y="' + (h - 8) + '" fill="rgba(255,255,255,0.6)" font-size="10" text-anchor="middle">' + lbl + '</text>';
    }
    if (rates.length) {
      var lastLbl = fmtTime(rates[rates.length - 1].ts);
      svg += '<text x="' + (w - pad.r) + '" y="' + (h - 8) + '" fill="rgba(255,255,255,0.6)" font-size="10" text-anchor="middle">' + lastLbl + '</text>';
    }
    svg += '<text x="' + (pad.l - 6) + '" y="' + (pad.t - 4) + '" fill="rgba(239,68,68,0.9)" font-size="9" text-anchor="end">Errores/min</text>';
    svg += '<text x="' + (w - pad.r + 6) + '" y="' + (pad.t - 4) + '" fill="rgba(249,115,22,0.9)" font-size="9" text-anchor="start">SNR dB</text>';
    svg += '<rect x="' + (w - 95) + '" y="' + (pad.t - 2) + '" width="90" height="42" fill="rgba(0,0,0,0.4)" rx="4"/>';
    svg += '<line x1="' + (w - 88) + '" y1="' + (pad.t + 8) + '" x2="' + (w - 78) + '" y2="' + (pad.t + 8) + '" stroke="#ef4444" stroke-width="2"/>';
    svg += '<text x="' + (w - 72) + '" y="' + (pad.t + 11) + '" fill="rgba(255,255,255,0.9)" font-size="9">Errores/min</text>';
    svg += '<line x1="' + (w - 88) + '" y1="' + (pad.t + 22) + '" x2="' + (w - 78) + '" y2="' + (pad.t + 22) + '" stroke="#f97316" stroke-width="2"/>';
    svg += '<text x="' + (w - 72) + '" y="' + (pad.t + 25) + '" fill="rgba(255,255,255,0.9)" font-size="9">SNR</text>';
    svg += '<line x1="' + (w - 88) + '" y1="' + (pad.t + 36) + '" x2="' + (w - 78) + '" y2="' + (pad.t + 36) + '" stroke="#38bdf8" stroke-width="2"/>';
    svg += '<text x="' + (w - 72) + '" y="' + (pad.t + 39) + '" fill="rgba(255,255,255,0.9)" font-size="9">Flaps</text>';
    svg += '</svg>';
    chartsEl.innerHTML = svg;
    var descEl = document.getElementById('qoeNocIntermitenciaDesc');
    if (descEl && rates.length) {
      var lastRate = rates[rates.length - 1].v;
      var prevRate = rates.length >= 2 ? rates[rates.length - 2].v : lastRate;
      var lastSnr = snrs.length ? snrs[snrs.length - 1].v : null;
      var lastFlaps = flapsDeltas.length ? flapsDeltas[flapsDeltas.length - 1].v : 0;
      var maxRateInWindow = 0;
      for (var mi = 0; mi < rates.length; mi++) { if (rates[mi].v > maxRateInWindow) maxRateInWindow = rates[mi].v; }
      var huboPicoReciente = maxRateInWindow >= PICO_RATE_MIN;
      var trend = lastRate > prevRate * 1.15 ? 'subiendo' : (lastRate < prevRate * 0.85 && prevRate > 50 ? 'bajando' : 'estable');
      var isAlto = lastRate >= 3000, isMedio = lastRate >= 500 && lastRate < 3000, isBajo = lastRate < 500;
      var msg = '';
      if (isBajo && trend !== 'subiendo') {
        msg = huboPicoReciente ? '<strong>Evento pasado.</strong> Intervalo de falla resuelto. Servicio recuperado.' : 'Servicio estable. Sin afectación en el intervalo actual.';
      } else if (trend === 'subiendo' && isAlto) {
        msg = '<strong>Afectación masiva creciendo.</strong> Intervalo de falla en ascenso.';
      } else if (trend === 'subiendo' && isMedio) {
        msg = '<strong>Afectación moderada creciendo.</strong> Monitorear evolución.';
      } else if (trend === 'bajando' && (isAlto || isMedio)) {
        msg = '<strong>Afectación masiva moderando/bajando.</strong> Intervalo de falla en descenso.';
      } else if (trend === 'estable' && isAlto) {
        msg = '<strong>Afectación masiva activa.</strong> Intervalo de falla en curso.';
      } else if (trend === 'estable' && isMedio) {
        msg = 'Afectación moderada. Monitorear evolución.';
      } else if (trend === 'bajando' && isBajo) {
        msg = 'Afectación en descenso. Servicio recuperándose.';
      } else {
        msg = 'Estado: ' + lastRate + '/min. ' + (trend === 'subiendo' ? 'Tendencia al alza.' : trend === 'bajando' ? 'Tendencia a la baja.' : 'Estable.');
      }
      if (lastSnr != null && lastSnr <= 28) msg += ' SNR bajo (' + lastSnr + ' dB) sugiere ruido o microreflexiones.';
      if (lastFlaps >= 5) msg += ' Flaps elevados sugieren inestabilidad de ranging.';
      if ((isAlto || isMedio) && !msg.match(/SNR|Flaps/)) msg += ' Posible origen: SNR, TX/RX, upstream, FEC o ranging.';
      descEl.innerHTML = msg;
    } else if (descEl) {
      descEl.innerHTML = 'La intermitencia suele originarse por degradación de <strong>SNR</strong>, desbalance de <strong>TX/RX</strong>, saturación del upstream, FEC elevado o inestabilidad de ranging.';
    }
  }

  function bindCalidad() {
    initMatrizLetraSelects();
    var inpAgente = $('auditoriaAgente'), dd = $('auditoriaAgenteDropdown');
    if (inpAgente) {
      inpAgente.addEventListener('focus', function () { showAuditoriaAgenteDropdown(); });
      inpAgente.addEventListener('input', function () { debounceAuditoriaDropdown(); updateAuditoriaNotaActual(); });
      inpAgente.addEventListener('blur', function () { setTimeout(hideAuditoriaAgenteDropdown, 150); });
    }
    if (dd) {
      dd.addEventListener('mousedown', function (e) {
        var item = e.target.closest('.auditoria-agente-dropdown-item');
        if (item && item.dataset.value) {
          if (inpAgente) inpAgente.value = item.dataset.value;
          updateAuditoriaNotaActual();
          hideAuditoriaAgenteDropdown();
        }
      });
    }
    var btnAdd = $('btnAuditoriaAgregar'), tbl = $('tablaAuditorias');
    if (btnAdd) btnAdd.addEventListener('click', function () {
      var a = $('auditoriaAgente'), n = $('auditoriaNota'), l = $('auditoriaLetra'), sel = $('auditoriaItem'), selC = $('auditoriaItemCausales');
      var agenteVal = (a && a.value || '').trim(), notaVal = (n && n.value || '').trim();
      var letra = (l && l.value) || '', idxStr = (sel && sel.value) || '';
      if (!agenteVal) return;
      if (!notaVal) return;
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
      items.push({ agente: agenteVal, nota: notaVal, letra: letra, macroproceso: macro, descripcionItem: desc, itemAfectado: desc, fechaHoraTs: Date.now() });
      saveAuditoriasAgentes(items);
      flushSave();
      refreshAuditoriasTable();
      refreshCalidadAll();
      refreshUsuariosPortal();
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
    loadData();
    handleHashChange();
    window.addEventListener('beforeunload', flushSave);
    var _visibilityTimer;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        _visibilityTimer = setTimeout(function () {
          flushSave();
          _dataCache = _lastSavedJson = _sections = _nav = null;
          _adminCache = null;
          _calidadMetricsCache = null;
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
        saveData('currentUserRole', portal.role || 'fibra-optica');
        invalidateAdminCache();
      } else {
        saveData('currentUserName', user);
        saveData('currentUserUsuario', user);
        saveData('currentUserAdmin', true);
        saveData('currentUserRole', 'administrador');
        invalidateAdminCache();
      }
      localStorage.setItem(SESSION_KEY, '1');
      refreshUserDisplay();
      hideLogin();
      window.dispatchEvent(new CustomEvent('integra:userChange'));
      loadData();
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
    bindEditable();
    bindPortalUsuarios();
    bindGestion();
    bindCalidad();
    bindBolsa();
    refreshGestionCasos();
    refreshAuditoriasTable();
    refreshCalidadAll();
  }

  function refreshFromServerData() {
    refreshGestionCasos();
    refreshTableroMensual();
    if (isAdmin()) {
      refreshGestionOperacion();
      refreshReincidencias(getData(), getGestionDataFromStorage());
      refreshUsuariosPortal(getData());
    } else {
      refreshProductividadAgente();
    }
  }

  function setupRealtimeSync() {
    if (!API_URL) return;
    var POLL_MS = 10000;
    function poll() {
      if (document.visibilityState === 'hidden' || _saveTimer) return;
      fetch(getApiBase() + '/api/data').then(function (r) { return r.json(); }).then(function (d) {
        var incoming = JSON.stringify(d && typeof d === 'object' ? d : {});
        if (incoming !== _lastSavedJson) {
          setDataFromApi(d);
          refreshFromServerData();
        }
      }).catch(function () {});
    }
    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') poll();
    });
  }

  function start() {
    if (API_URL) {
      var url = getApiBase() + '/api/data';
      fetch(url).then(function (r) { return r.json(); }).then(function (d) {
        setDataFromApi(d && typeof d === 'object' ? d : {});
        init();
        setupRealtimeSync();
      }).catch(function () {
        try {
          var raw = localStorage.getItem(STORAGE);
          if (raw) {
            var parsed = JSON.parse(raw);
            setDataFromApi(parsed && typeof parsed === 'object' ? parsed : {});
          } else {
            setDataFromApi({});
          }
        } catch (e) { setDataFromApi({}); }
        init();
      });
    } else {
      init();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
