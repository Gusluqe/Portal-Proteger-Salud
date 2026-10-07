/**
 * Buscador de medicos del Portal Proteger Salud.
 *
 * Fuente primaria: assets/data/medicos.bin, el indice generado desde
 * me_bsas.dbf por tools/build-index.js. Se descarga la primera vez que el
 * usuario usa el buscador y queda en Cache API, asi que las visitas
 * siguientes buscan sin red.
 *
 * Si la matricula no esta en la base local, se consulta REFEPS (SISA) a
 * traves de la funcion serverless /api/sisa. Esa consulta necesita
 * credenciales SISA; si no estan configuradas, la funcion responde 501 y el
 * buscador ofrece el buscador publico oficial.
 */
(() => {
  'use strict';

  const DATA_BIN = 'assets/data/medicos.bin';
  const DATA_BIN_GZ = 'assets/data/medicos.bin.gz';
  const DATA_META = 'assets/data/medicos.json';
  const CACHE_NAME = 'ps-medicos-v2';   // v2: el indice pasa a servirse pre-comprimido
  const MAX_RESULTADOS = 40;
  const REC = 12;

  const SISA_PUBLICO = 'https://sisa.msal.gov.ar/sisa/#sisa';

  // ── Estado ────────────────────────────────────────────────────────────
  let base = null;         // { n, nombres[], norm[], esp, loc, matN, matP, dicEsp, dicLoc }
  let cargando = null;     // Promise en vuelo, para no descargar dos veces
  let sisaDisponible = null; // null = sin averiguar, true/false una vez probado

  // ── Utilidades ────────────────────────────────────────────────────────

  /** Normaliza para comparar: sin acentos, sin enie, mayusculas. */
  function normalizar(s) {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Capitaliza un nombre que viene en mayusculas. */
  const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'DA', 'DI', 'VAN', 'VON']);
  function titulizar(s) {
    return s
      .split(' ')
      .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p.toLowerCase() : p.charAt(0) + p.slice(1).toLowerCase()))
      .join(' ');
  }

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ── Carga del indice ──────────────────────────────────────────────────

  async function traerConCache(url) {
    if (!('caches' in window)) return fetch(url);
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) return hit;
      const res = await fetch(url);
      if (res.ok) cache.put(url, res.clone());
      return res;
    } catch {
      return fetch(url);           // modo incognito, storage lleno, etc.
    }
  }

  function cargarBase(onProgreso) {
    if (base) return Promise.resolve(base);
    if (cargando) return cargando;

    cargando = (async () => {
      const [resBin, resMeta] = await Promise.all([
        traerIndice(),
        traerConCache(DATA_META),
      ]);
      if (!resBin.ok) throw new Error(`No se pudo cargar el indice (${resBin.status})`);
      if (!resMeta.ok) throw new Error(`No se pudo cargar el diccionario (${resMeta.status})`);

      const meta = await resMeta.json();

      let buf;
      if (resBin.comprimido) {
        try {
          buf = await descomprimir(resBin, onProgreso);
        } catch {
          // Algunos hostings sirven el .gz ya descomprimido (mandan
          // Content-Encoding). En ese caso se vuelve a pedir el .bin crudo.
          buf = await leerConProgreso(await traerConCache(DATA_BIN), onProgreso);
        }
      } else {
        buf = await leerConProgreso(resBin, onProgreso);
      }
      const dv = new DataView(buf);

      const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
      if (magic !== 'PSMD') throw new Error('El indice no tiene el formato esperado');
      if (dv.getUint8(4) !== 1) throw new Error('Version de indice desconocida');

      const n = dv.getUint32(6, true);
      const blobLen = dv.getUint32(10, true);
      const tablaIni = 16;
      const blobIni = tablaIni + n * REC;

      // Vistas tipadas sobre la tabla. El offset no es multiplo de 4 en todos
      // los campos, asi que se copian a arrays propios de una sola pasada.
      const largos = new Uint8Array(n);
      const esp = new Uint8Array(n);
      const loc = new Uint16Array(n);
      const matN = new Uint32Array(n);
      const matP = new Uint32Array(n);

      for (let i = 0; i < n; i++) {
        const o = tablaIni + i * REC;
        largos[i] = dv.getUint8(o);
        esp[i] = dv.getUint8(o + 1);
        loc[i] = dv.getUint16(o + 2, true);
        matN[i] = dv.getUint32(o + 4, true);
        matP[i] = dv.getUint32(o + 8, true);
      }

      // Los nombres van concatenados en el mismo orden que la tabla y los
      // largos estan en bytes, asi que se cortan acumulando offsets.
      const bytes = new Uint8Array(buf, blobIni, blobLen);
      const dec = new TextDecoder('utf-8');
      const nombres = new Array(n);
      let off = 0;
      for (let i = 0; i < n; i++) {
        nombres[i] = dec.decode(bytes.subarray(off, off + largos[i]));
        off += largos[i];
      }

      // Clave de busqueda: el nombre sin enie, para que "PENA" encuentre
      // "PEÑA" y viceversa.
      const norm = new Array(n);
      for (let i = 0; i < n; i++) norm[i] = normalizar(nombres[i]);

      base = {
        n, nombres, norm, esp, loc, matN, matP,
        dicEsp: meta.especialidades,
        dicLoc: meta.localidades,
        meta,
      };
      return base;
    })();

    cargando.catch(() => { cargando = null; });   // permitir reintento
    return cargando;
  }

  /**
   * Pide el indice pre-comprimido. El hosting no comprime al vuelo un
   * application/octet-stream, asi que sin esto viajarian 3,2 MB en vez de 1,3.
   * Si el navegador no tiene DecompressionStream, cae al .bin crudo.
   */
  async function traerIndice() {
    if (typeof DecompressionStream === 'function') {
      try {
        const res = await traerConCache(DATA_BIN_GZ);
        if (res.ok) { res.comprimido = true; return res; }
      } catch { /* sin .gz: se usa el crudo */ }
    }
    return traerConCache(DATA_BIN);
  }

  /** Descomprime el gzip reportando avance sobre los bytes que llegan. */
  async function descomprimir(res, onProgreso) {
    const total = Number(res.headers.get('Content-Length')) || 0;
    let entrada = res.body;

    if (entrada && total && onProgreso) {
      let recibido = 0;
      entrada = entrada.pipeThrough(new TransformStream({
        transform(trozo, control) {
          recibido += trozo.length;
          onProgreso(Math.min(99, Math.round((recibido / total) * 100)));
          control.enqueue(trozo);
        },
      }));
    }

    if (!entrada) return new Response(await res.arrayBuffer()).arrayBuffer();
    return new Response(entrada.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }

  /** Lee la respuesta reportando avance cuando el server manda Content-Length. */
  async function leerConProgreso(res, onProgreso) {
    const total = Number(res.headers.get('Content-Length')) || 0;
    if (!res.body || !total || !onProgreso) return res.arrayBuffer();

    const reader = res.body.getReader();
    const trozos = [];
    let recibido = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      trozos.push(value);
      recibido += value.length;
      onProgreso(Math.min(99, Math.round((recibido / total) * 100)));
    }
    const out = new Uint8Array(recibido);
    let p = 0;
    for (const t of trozos) { out.set(t, p); p += t.length; }
    return out.buffer;
  }

  // ── Busqueda local ────────────────────────────────────────────────────

  function detallesDe(i) {
    const [codigo, nombreEsp] = base.dicEsp[base.esp[i]] || ['', ''];
    return {
      nombre: titulizar(base.nombres[i]),
      crudo: base.nombres[i],
      especialidad: nombreEsp || codigo,
      especialidadCodigo: codigo,
      localidad: base.dicLoc[base.loc[i]] || '',   // ya viene lista del indice
      matN: base.matN[i],
      matP: base.matP[i],
      origen: 'local',
    };
  }

  /** Busca por numero de matricula, nacional o provincial. */
  function buscarPorMatricula(num) {
    const out = [];
    const { n, matN, matP } = base;
    for (let i = 0; i < n; i++) {
      if (matN[i] === num || matP[i] === num) {
        const d = detallesDe(i);
        d.coincidePor = matN[i] === num ? 'MN' : 'MP';
        out.push(d);
      }
    }
    return out;
  }

  /**
   * Busca por nombre. Todos los terminos tienen que aparecer. Ordena
   * poniendo primero los que arrancan con el primer termino, que es el
   * caso habitual: se tipea el apellido.
   */
  function buscarPorNombre(q) {
    const terminos = normalizar(q).split(' ').filter(Boolean);
    if (!terminos.length) return [];

    const { n, norm } = base;
    const hits = [];
    for (let i = 0; i < n; i++) {
      const s = norm[i];
      let ok = true;
      for (let t = 0; t < terminos.length; t++) {
        if (s.indexOf(terminos[t]) === -1) { ok = false; break; }
      }
      if (!ok) continue;
      // 0 = arranca con el termino, 1 = arranca una palabra, 2 = en el medio
      const pos = s.indexOf(terminos[0]);
      const rango = pos === 0 ? 0 : s.charAt(pos - 1) === ' ' ? 1 : 2;
      hits.push([rango, pos, i]);
      if (hits.length > 4000) break;      // corte duro: la consulta es muy amplia
    }

    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (norm[a[2]] < norm[b[2]] ? -1 : 1));
    return hits.slice(0, MAX_RESULTADOS).map(([, , i]) => detallesDe(i));
  }

  function buscar(q) {
    const limpio = q.trim();
    if (!limpio) return { tipo: 'vacio', resultados: [], total: 0 };

    // Solo digitos (admite puntos y espacios de separacion de miles)
    const soloNumero = /^[\d.\s]+$/.test(limpio);
    if (soloNumero) {
      const num = parseInt(limpio.replace(/[.\s]/g, ''), 10);
      if (Number.isFinite(num) && num > 0) {
        const res = buscarPorMatricula(num);
        return { tipo: 'matricula', consulta: num, resultados: res, total: res.length };
      }
    }
    const res = buscarPorNombre(limpio);
    return { tipo: 'nombre', consulta: limpio, resultados: res, total: res.length };
  }

  // ── Fallback SISA ─────────────────────────────────────────────────────

  async function consultarSisa(consulta, tipo) {
    const qs = new URLSearchParams(tipo === 'matricula' ? { matricula: String(consulta) } : { apellido: String(consulta) });
    const res = await fetch(`/api/sisa?${qs}`, { headers: { Accept: 'application/json' } });

    if (res.status === 501) { sisaDisponible = false; return { estado: 'sin-credenciales' }; }
    if (!res.ok) {
      let detalle = `Error ${res.status}`;
      try { detalle = (await res.json()).error || detalle; } catch { /* respuesta no JSON */ }
      return { estado: 'error', detalle };
    }

    sisaDisponible = true;
    const data = await res.json();
    return { estado: 'ok', resultados: data.resultados || [] };
  }

  // ── Interfaz ──────────────────────────────────────────────────────────

  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  function init() {
    const panel = $('#medicos');
    if (!panel) return;

    const input = $('#medicoInput', panel);
    const popover = $('#medicoPopover', panel);
    const salida = $('#medicoResultados', panel);
    const estado = $('#medicoEstado', panel);
    const limpiarBtn = $('#medicoLimpiar', panel);
    if (!input || !popover || !salida || !estado) return;

    let debounce;
    let corridaActual = 0;

    const abrirPopover = (abierto) => {
      popover.hidden = !abierto;
      input.setAttribute('aria-expanded', String(abierto));
    };

    const setEstado = (html, clase) => {
      estado.className = `medico-estado${clase ? ' is-' + clase : ''}`;
      estado.innerHTML = html;
      if (html) abrirPopover(true);
    };

    // Cerrar al clickear fuera o con Escape: es un panel flotante sobre la
    // grilla, no puede quedarse tapando las tarjetas.
    document.addEventListener('click', (e) => {
      if (!popover.hidden && !panel.contains(e.target)) abrirPopover(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !popover.hidden) {
        abrirPopover(false);
        input.focus();
      }
    });

    input.addEventListener('focus', () => {
      if (salida.children.length || estado.innerHTML) abrirPopover(true);
    });

    function pintar(resultados, nota) {
      salida.innerHTML = resultados.map(tarjeta).join('');
      if (nota) salida.insertAdjacentHTML('afterbegin', nota);
    }

    function tarjeta(m) {
      const mats = [];
      if (m.matN) mats.push(`<span class="medico-mat"><span class="medico-mat-tipo">MN</span>${escapar(String(m.matN))}</span>`);
      if (m.matP) mats.push(`<span class="medico-mat"><span class="medico-mat-tipo">MP</span>${escapar(String(m.matP))}</span>`);

      const meta = [m.especialidad, m.localidad].filter(Boolean).map(escapar).join(' · ');
      const fuente = m.origen === 'sisa'
        ? '<span class="medico-origen is-sisa" title="Consultado en vivo en el registro nacional REFEPS">SISA</span>'
        : '<span class="medico-origen" title="Base local me_bsas">Base local</span>';

      return `<article class="medico-card">
        <div class="medico-card-head">
          <h4 class="medico-nombre">${escapar(m.nombre)}</h4>
          ${fuente}
        </div>
        ${meta ? `<p class="medico-meta">${meta}</p>` : ''}
        <div class="medico-mats">${mats.join('')}</div>
      </article>`;
    }

    async function ejecutar(q) {
      const corrida = ++corridaActual;
      const limpio = q.trim();

      salida.innerHTML = '';
      if (!limpio) { setEstado('', ''); abrirPopover(false); return; }
      if (limpio.length < 2) { setEstado('Escribí al menos 2 caracteres.', 'pista'); return; }

      // Carga diferida del indice
      if (!base) {
        setEstado('Cargando base de médicos…', 'cargando');
        try {
          await cargarBase((pct) => {
            if (corrida === corridaActual) setEstado(`Cargando base de médicos… ${pct}%`, 'cargando');
          });
        } catch (e) {
          if (corrida !== corridaActual) return;
          setEstado(`No se pudo cargar la base local. ${escapar(e.message)}`, 'error');
          return;
        }
        if (corrida !== corridaActual) return;
      }

      const r = buscar(limpio);

      if (r.resultados.length) {
        const etiqueta = r.total === 1 ? '1 resultado' : `${r.total} resultados`;
        const tope = r.total >= MAX_RESULTADOS ? ` (mostrando los primeros ${MAX_RESULTADOS})` : '';
        setEstado(`${etiqueta}${tope}`, 'ok');
        pintar(r.resultados);
        return;
      }

      // Sin resultados locales: probar REFEPS si tiene sentido
      if (r.tipo === 'matricula' && sisaDisponible !== false) {
        setEstado('No está en la base local. Consultando SISA…', 'cargando');
        let sisa;
        try {
          sisa = await consultarSisa(r.consulta, 'matricula');
        } catch {
          sisa = { estado: 'error', detalle: 'No se pudo contactar el servicio' };
        }
        if (corrida !== corridaActual) return;

        if (sisa.estado === 'ok' && sisa.resultados.length) {
          setEstado(`${sisa.resultados.length} resultado(s) en SISA`, 'ok');
          pintar(sisa.resultados);
          return;
        }
        if (sisa.estado === 'ok') {
          setEstado(`Sin resultados para la matrícula <strong>${escapar(String(r.consulta))}</strong>, ni en la base local ni en SISA.`, 'vacio');
          return;
        }
        if (sisa.estado === 'sin-credenciales') {
          setEstado(
            `No está en la base local. La consulta automática a SISA no está configurada — ` +
            `<a href="${SISA_PUBLICO}" target="_blank" rel="noopener noreferrer">buscar en SISA</a>.`,
            'vacio'
          );
          return;
        }
        setEstado(
          `No está en la base local y SISA no respondió (${escapar(sisa.detalle)}) — ` +
          `<a href="${SISA_PUBLICO}" target="_blank" rel="noopener noreferrer">buscar en SISA</a>.`,
          'error'
        );
        return;
      }

      setEstado(
        r.tipo === 'matricula'
          ? `Sin resultados para la matrícula <strong>${escapar(String(r.consulta))}</strong>.`
          : `Sin resultados para <strong>${escapar(r.consulta)}</strong>.`,
        'vacio'
      );
    }

    input.addEventListener('input', () => {
      panel.classList.toggle('has-query', input.value.trim().length > 0);
      clearTimeout(debounce);
      const q = input.value;
      debounce = setTimeout(() => ejecutar(q), 180);
    });

    // Precargar el indice apenas el usuario muestra intencion de buscar:
    // para cuando termine de tipear la matricula ya suele estar listo.
    input.addEventListener('focus', () => { cargarBase().catch(() => {}); }, { once: true });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        e.stopPropagation();
        input.value = '';
        panel.classList.remove('has-query');
        clearTimeout(debounce);
        ejecutar('');
      }
    });

    limpiarBtn?.addEventListener('click', () => {
      input.value = '';
      panel.classList.remove('has-query');
      clearTimeout(debounce);
      ejecutar('');
      input.focus();
    });

    // Ctrl+M enfoca el buscador de medicos (Ctrl+K es el de plataformas)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
