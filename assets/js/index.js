/**
 * Portal Proteger Salud — comportamiento comun a las tres paginas.
 * El buscador de medicos vive aparte, en medicos.js.
 */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const sinMovimiento = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** localStorage puede fallar en modo incognito o con el storage lleno. */
  const almacen = {
    leer(clave, porDefecto) {
      try {
        const v = localStorage.getItem(clave);
        return v === null ? porDefecto : v;
      } catch { return porDefecto; }
    },
    escribir(clave, valor) {
      try { localStorage.setItem(clave, valor); } catch { /* sin persistencia */ }
    },
    borrar(clave) {
      try { localStorage.removeItem(clave); } catch { /* sin persistencia */ }
    },
  };

  function init() {
    tema();
    headerScroll();
    menuMovil();
    const tarjetas = entradaTarjetas();
    contadores(tarjetas);
    frecuentes(tarjetas);
    buscador(tarjetas);
    formulario();
  }

  // ─── Tema ───────────────────────────────────────────────────────────────
  // El tema ya lo aplico el script inline del <head> antes del primer paint;
  // aca solo queda el toggle.
  function tema() {
    const btn = $('#themeBtn');
    if (!btn) return;

    const sincronizarEtiqueta = () => {
      const oscuro = document.documentElement.dataset.theme === 'dark';
      btn.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      btn.setAttribute('aria-pressed', String(oscuro));
    };

    sincronizarEtiqueta();

    btn.addEventListener('click', () => {
      const siguiente = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = siguiente;
      almacen.escribir('theme', siguiente);
      sincronizarEtiqueta();
    });
  }

  // ─── Elevacion del header al scrollear ──────────────────────────────────
  function headerScroll() {
    const header = $('.header');
    if (!header) return;
    const alScrollear = () => header.classList.toggle('header--elevated', window.scrollY > 8);
    window.addEventListener('scroll', alScrollear, { passive: true });
    alScrollear();
  }

  // ─── Menu movil ─────────────────────────────────────────────────────────
  function menuMovil() {
    const btn = $('#menuBtn');
    const nav = $('#navMobile');
    const icono = $('#menuIcon');
    if (!btn || !nav) return;

    const SVG_MENU = icono ? icono.innerHTML : '';
    const SVG_CERRAR = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    const abrir = (estado) => {
      nav.classList.toggle('active', estado);
      btn.setAttribute('aria-expanded', String(estado));
      btn.setAttribute('aria-label', estado ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
      if (icono) icono.innerHTML = estado ? SVG_CERRAR : SVG_MENU;
      // El panel es fixed a pantalla completa: sin esto el fondo sigue
      // scrolleando y tabulando por detras.
      document.body.style.overflow = estado ? 'hidden' : '';
    };

    const cerrar = () => abrir(false);

    btn.addEventListener('click', () => abrir(!nav.classList.contains('active')));
    $$('a', nav).forEach((a) => a.addEventListener('click', cerrar));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('active')) {
        cerrar();
        btn.focus();
      }
    });

    const anchoGrande = window.matchMedia('(min-width: 1024px)');
    const alCambiar = (e) => { if (e.matches) cerrar(); };
    if (anchoGrande.addEventListener) anchoGrande.addEventListener('change', alCambiar);
    else if (anchoGrande.addListener) anchoGrande.addListener(alCambiar);  // Safari <= 13
  }

  // ─── Entrada escalonada, una sola vez ───────────────────────────────────
  /**
   * La animacion se aplica con una clase que se retira apenas termina. Si
   * quedara puesta, filtrar con el buscador la reiniciaria en cada tecla:
   * ocultar y volver a mostrar un elemento reinicia sus animaciones CSS, y
   * con el stagger de hasta 480ms las tarjetas parpadeaban casi un segundo.
   */
  function entradaTarjetas() {
    const tarjetas = $$('.platform-card');
    if (!tarjetas.length) return tarjetas;

    if (sinMovimiento()) return tarjetas;

    tarjetas.forEach((card, i) => {
      card.style.setProperty('--stagger', `${Math.min(i * 18, 400)}ms`);
      card.classList.add('is-entering');
      card.addEventListener('animationend', () => {
        card.classList.remove('is-entering');
        card.style.removeProperty('--stagger');
      }, { once: true });
    });

    // Red de seguridad: si la animacion nunca dispara (pestaña en segundo
    // plano, por ejemplo), no dejar las tarjetas invisibles.
    setTimeout(() => tarjetas.forEach((c) => c.classList.remove('is-entering')), 1500);

    return tarjetas;
  }

  // ─── Contadores ─────────────────────────────────────────────────────────
  function contadores(tarjetas) {
    const cuenta = $('#platformCount');
    if (cuenta && tarjetas.length) cuenta.textContent = tarjetas.length;
    // El placeholder menciona el total: que no quede desfasado al agregar una.
    const input = $('#buscador');
    if (input && tarjetas.length) {
      input.placeholder = input.placeholder.replace(/\d+/, tarjetas.length);
    }
  }

  // ─── Frecuentes ─────────────────────────────────────────────────────────
  /**
   * El personal abre las mismas 3 o 4 plataformas decenas de veces por dia,
   * pero la grilla esta en orden de carga: encontrar una exige barrer 27
   * logos o tipear. Esto cuenta los clicks en esta PC y fija arriba las mas
   * usadas. Es por navegador, no se comparte ni se manda a ningun lado.
   */
  const CLAVE_FREC = 'ps:frecuentes';
  const TOPE_FREC = 6;
  const MIN_CLICKS = 2;

  function frecuentes(tarjetas) {
    const cont = $('#frecuentes');
    const grid = $('#frecuentesGrid');
    if (!cont || !grid || !tarjetas.length) return;

    const leer = () => {
      try { return JSON.parse(almacen.leer(CLAVE_FREC, '{}')) || {}; }
      catch { return {}; }
    };

    const pintar = () => {
      const cuenta = leer();
      const top = Object.entries(cuenta)
        .filter(([, n]) => n >= MIN_CLICKS)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOPE_FREC)
        .map(([href]) => tarjetas.find((c) => c.getAttribute('href') === href))
        .filter(Boolean);

      grid.replaceChildren();
      if (!top.length) { cont.classList.remove('is-visible'); return; }

      top.forEach((orig) => {
        const copia = orig.cloneNode(true);
        copia.classList.remove('is-entering', 'is-hidden');
        copia.dataset.copia = '1';
        grid.appendChild(copia);
      });
      cont.classList.add('is-visible');
    };

    // Delegacion: cubre tambien las copias del bloque de frecuentes.
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.platform-card');
      if (!card) return;
      const href = card.getAttribute('href');
      if (!href) return;
      const cuenta = leer();
      cuenta[href] = (cuenta[href] || 0) + 1;
      almacen.escribir(CLAVE_FREC, JSON.stringify(cuenta));
    });

    $('#frecuentesReset')?.addEventListener('click', () => {
      almacen.borrar(CLAVE_FREC);
      pintar();
    });

    pintar();
  }

  // ─── Buscador de plataformas ────────────────────────────────────────────
  function buscador(tarjetas) {
    const input = $('#buscador');
    if (!input) return;

    const vacio = $('#emptyState');
    const frecCont = $('#frecuentes');
    const estado = document.createElement('p');
    estado.className = 'visually-hidden';
    estado.setAttribute('role', 'status');
    estado.setAttribute('aria-live', 'polite');
    input.closest('.search-wrapper')?.appendChild(estado);

    let anuncio;

    const filtrar = () => {
      const q = input.value.toLowerCase().trim();
      let visibles = 0;

      tarjetas.forEach((card) => {
        const nombre = ($('.platform-name', card)?.textContent || '').toLowerCase();
        const coincide = !q || nombre.includes(q);
        card.classList.toggle('is-hidden', !coincide);
        if (coincide) visibles++;
      });

      vacio?.classList.toggle('visible', visibles === 0 && q.length > 0);
      // Mientras se filtra, "tus más usadas" solo agrega ruido.
      frecCont?.classList.toggle('is-hidden', q.length > 0);

      // Se anuncia con retardo para no interrumpir al lector en cada tecla.
      clearTimeout(anuncio);
      anuncio = setTimeout(() => {
        if (!q) { estado.textContent = ''; return; }
        estado.textContent = visibles === 0
          ? 'Sin resultados'
          : `${visibles} ${visibles === 1 ? 'resultado' : 'resultados'}`;
      }, 500);
    };

    input.addEventListener('input', filtrar);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        filtrar();
      }
    });

    // Ctrl+K / Cmd+K. toLowerCase porque con Bloq Mayus e.key vale 'K' y el
    // atajo fallaba en silencio mientras el hint seguia en pantalla.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
        window.scrollTo({ top: 0, behavior: sinMovimiento() ? 'auto' : 'smooth' });
      }
    });
  }

  // ─── Formulario de contacto ─────────────────────────────────────────────
  /**
   * Sin esto el submit navegaba a formspree.io: el usuario perdia el portal
   * y volvia con el boton Atras, sin confirmacion de que el mensaje salio.
   */
  function formulario() {
    const form = $('#contactForm');
    const salida = $('#formFeedback');
    if (!form || !salida) return;

    const boton = $('.btn-submit', form);
    const textoBoton = boton?.textContent;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      salida.className = 'form-feedback';
      salida.textContent = '';
      if (boton) { boton.setAttribute('aria-busy', 'true'); boton.textContent = 'Enviando…'; }

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          form.reset();
          salida.className = 'form-feedback is-visible is-ok';
          salida.textContent = 'Listo, recibimos tu mensaje. Te respondemos a la brevedad.';
        } else {
          const data = await res.json().catch(() => null);
          const detalle = data?.errors?.map((x) => x.message).join('. ');
          salida.className = 'form-feedback is-visible is-error';
          salida.textContent = detalle || 'No se pudo enviar el mensaje. Probá de nuevo o escribinos por WhatsApp.';
        }
      } catch {
        salida.className = 'form-feedback is-visible is-error';
        salida.textContent = 'Sin conexión con el servidor. Probá de nuevo o escribinos por WhatsApp.';
      } finally {
        if (boton) { boton.removeAttribute('aria-busy'); boton.textContent = textoBoton; }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
