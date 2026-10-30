/**
 * Calculador de cupones de IOMA: a partir de la fecha de la receta indica que
 * provision corresponde hoy. Reemplaza al programa de escritorio que habia que
 * instalar en cada PC. Las reglas de cupon() son las mismas de ese programa.
 */
(() => {
  'use strict';

  const MS_DIA = 86400000;

  /** Dias en UTC: asi un cambio de hora nunca corre la cuenta un dia. */
  function hoyUTC() {
    const h = new Date();
    return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
  }

  /** Acepta 1/9/26 y 01/09/2026. Devuelve null si la fecha no existe. */
  function leerFecha(texto) {
    const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!m) return null;
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const ms = Date.UTC(anio, mes - 1, dia);
    // Date no rechaza el 31/02: lo corre al 03/03 sin avisar.
    const f = new Date(ms);
    return f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia ? ms : null;
  }

  /** El orden importa: las ventanas de dos cupones pisan a las de uno. */
  function cupon(dias) {
    if (dias === 0) return { texto: 'CUPON 1', cupones: [1] };
    if (dias >= 20 && dias <= 30) return { texto: 'CUPON 1 Y 2', cupones: [1, 2] };
    if (dias >= 50 && dias <= 60) return { texto: 'CUPON 2 Y 3', cupones: [2, 3] };
    if (dias >= 80 && dias <= 90) return { texto: 'CUPON 3 Y 4', cupones: [3, 4] };
    if (dias >= 1 && dias <= 30) return { texto: 'CUPON 1', cupones: [1] };
    if (dias >= 31 && dias <= 60) return { texto: 'CUPON 2', cupones: [2] };
    if (dias >= 61 && dias <= 90) return { texto: 'CUPON 3', cupones: [3] };
    if (dias > 120) return { texto: 'RECETA VENCIDA', cupones: [], vencida: true };
    return { texto: 'CUPON 4', cupones: [4] };
  }

  /**
   * Agrega las barras mientras se tipea, sin estorbar a quien las escribe a
   * mano (1/9/26). Con "12/03/2" contar caracteres pondria una barra de mas.
   */
  function enmascarar(texto, agregarBarra) {
    const limpio = texto.replace(/[-.\s]/g, '/').replace(/[^\d/]/g, '');
    let salida = '';
    let tramo = 0;
    let digitos = 0;

    for (const c of limpio) {
      if (c === '/') {
        if (digitos > 0 && tramo < 2) { salida += '/'; tramo++; digitos = 0; }
        continue;
      }
      if (tramo < 2 && digitos === 2) { salida += '/'; tramo++; digitos = 0; }
      if (tramo === 2 && digitos === 4) break;
      salida += c;
      digitos++;
    }

    if (agregarBarra && tramo < 2 && digitos === 2) salida += '/';
    return salida;
  }

  function init() {
    const dialogo = document.getElementById('iomaDialogo');
    const abrir = document.getElementById('iomaAbrir');
    if (!dialogo || !abrir) return;

    const form = document.getElementById('iomaForm');
    const entrada = document.getElementById('iomaFecha');
    const hoy = document.getElementById('iomaHoy');
    const resultado = document.getElementById('iomaResultado');
    const titulo = document.getElementById('iomaCupon');
    const detalle = document.getElementById('iomaDias');
    const fichas = [...dialogo.querySelectorAll('.ioma-cupones li')];

    const pintar = (estado, textoTitulo, textoDetalle, cupones = []) => {
      resultado.dataset.estado = estado;
      titulo.textContent = textoTitulo;
      detalle.textContent = textoDetalle;
      entrada.setAttribute('aria-invalid', String(estado === 'error'));
      fichas.forEach((f, i) => f.classList.toggle('is-activo', cupones.includes(i + 1)));
    };

    const limpiar = () => pintar('vacio', 'Ingresá la fecha de la receta', 'Enter para calcular');

    const reiniciar = () => {
      entrada.value = '';
      limpiar();
      entrada.focus();
    };

    const calcular = () => {
      const inicio = leerFecha(entrada.value);
      if (inicio === null) {
        pintar('error', 'Formato de fecha inválido', 'Usa DD/MM/YYYY');
        return;
      }

      const dias = Math.round((hoyUTC() - inicio) / MS_DIA);
      if (dias < 0) {
        pintar('error', 'REVISE EL CAMPO FECHA', 'La fecha es posterior a hoy');
        return;
      }

      const r = cupon(dias);
      pintar(r.vencida ? 'vencida' : 'ok', r.texto, `${dias} DIAS`, r.cupones);
    };

    entrada.addEventListener('input', (e) => {
      const alFinal = entrada.selectionStart === entrada.value.length;
      if (alFinal) {
        const borrando = e.inputType?.startsWith('delete');
        entrada.value = enmascarar(entrada.value, !borrando);
      }
      // Un cupon viejo al lado de una fecha nueva es una provision mal dada.
      limpiar();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      calcular();
      // Seleccionada: la proxima receta se tipea encima, sin borrar ni usar el mouse.
      entrada.select();
    });

    document.getElementById('iomaReset').addEventListener('click', reiniciar);
    document.getElementById('iomaCerrar').addEventListener('click', () => dialogo.close());

    // El form ocupa todo el dialogo: lo unico que llega con target=dialogo
    // es el click sobre el fondo. Se mira tambien donde empezo: seleccionar la
    // fecha arrastrando hasta afuera dispara un click y cerraba el calculador.
    let empezoEnFondo = false;
    dialogo.addEventListener('pointerdown', (e) => {
      empezoEnFondo = e.target === dialogo;
    });
    dialogo.addEventListener('click', (e) => {
      if (e.target === dialogo && empezoEnFondo) dialogo.close();
    });

    abrir.addEventListener('click', () => {
      // Se recalcula al abrir: el portal queda abierto de un dia para otro.
      hoy.textContent = `Hoy ${new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })}`;
      dialogo.showModal();
      reiniciar();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
