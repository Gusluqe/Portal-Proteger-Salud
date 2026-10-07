/**
 * Cliente de REFEPS (Registro Federal de Profesionales de la Salud) sobre la
 * API REST oficial de SISA.
 *
 * Por que una funcion serverless y no un fetch desde el navegador:
 * SISA no manda ningun header Access-Control-Allow-*, asi que el navegador
 * bloquea la llamada. Ademas usuario y clave viajan en la query string y no
 * pueden quedar expuestos en el cliente.
 *
 * Requiere credenciales SISA con permiso de servicios web (Formulario A1,
 * soporte@sisa.msal.gov.ar). Se configuran como variables de entorno:
 *
 *   SISA_USUARIO=...
 *   SISA_CLAVE=...
 *
 * Sin ellas el endpoint responde 501 y el portal ofrece el buscador publico.
 */
'use strict';

const BASE = 'https://sisa.msal.gov.ar/sisa/services/rest/profesional';
const TIMEOUT_MS = 15000;

/** Normaliza los campos que JAXB serializa como objeto cuando hay uno solo. */
const comoArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'DA', 'DI', 'VAN', 'VON']);
function titulizar(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .map((p, i) => (i > 0 && PARTICULAS.has(p.toUpperCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ');
}

function hayCredenciales() {
  return Boolean(process.env.SISA_USUARIO && process.env.SISA_CLAVE);
}

/**
 * Consulta REFEPS. Devuelve { ok, resultados } o { ok:false, codigo, error }.
 * Nunca lanza por un error de SISA: los traduce a codigos propios.
 */
async function consultar({ matricula, apellido, nombre, provincia, profesion }) {
  if (!hayCredenciales()) {
    return { ok: false, codigo: 'SIN_CREDENCIALES', error: 'Credenciales SISA no configuradas' };
  }
  if (!matricula && !apellido) {
    return { ok: false, codigo: 'PARAMETROS', error: 'Indicá una matrícula o un apellido' };
  }

  const qs = new URLSearchParams({
    usuario: process.env.SISA_USUARIO,
    clave: process.env.SISA_CLAVE,
  });
  // WS021 (/buscar) acepta apellido completo y matricula; no documenta nombre.
  if (matricula) qs.set('matricula', String(matricula));
  if (apellido) qs.set('apellido', String(apellido).toUpperCase());
  if (provincia) qs.set('provinciaMatriculacion', String(provincia));
  if (profesion) qs.set('profesion', String(profesion));

  let payload;
  try {
    const res = await fetch(`${BASE}/buscar?${qs}`, {
      // Sin este Accept, SISA responde XML.
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // SISA devuelve HTTP 200 incluso en error: el estado real va en el body.
    if (!res.ok) {
      return { ok: false, codigo: 'HTTP', error: `SISA respondió HTTP ${res.status}` };
    }
    payload = await res.json();
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return {
      ok: false,
      codigo: timeout ? 'TIMEOUT' : 'RED',
      error: timeout ? 'SISA no respondió a tiempo' : 'No se pudo contactar a SISA',
    };
  }

  const r = payload.ProfesionalSearchResponse || payload;

  switch (r.resultado) {
    case 'OK':
      break;
    case 'REGISTRO NO ENCONTRADO':
      return { ok: true, resultados: [] };
    case 'LIMITE EXCEDIDO':
      return { ok: false, codigo: 'DEMASIADOS', error: 'Más de 20 coincidencias en SISA: afiná la búsqueda' };
    case 'NO_TIENE_QUOTA_DISPONIBLE':
      return { ok: false, codigo: 'CUOTA', error: 'Se agotó la cuota diaria de consultas a SISA' };
    case 'ERROR_AUTENTICACION':
      return { ok: false, codigo: 'AUTENTICACION', error: 'Credenciales SISA inválidas' };
    default:
      return { ok: false, codigo: 'SISA', error: `SISA devolvió "${r.resultado || 'respuesta desconocida'}"` };
  }

  const resultados = comoArray(r.Profesionales && r.Profesionales.Profesional).map((p) => {
    const mats = comoArray(p.matriculas && p.matriculas.matricula);

    // REFEPS no tiene un campo "tipo de matricula": nacional vs provincial se
    // deduce de la jurisdiccion.
    const esNacional = (m) => /naci[oó]n/i.test(`${m.jurisdiccion || ''} ${m.provincia || ''}`);
    const nacional = mats.find((m) => esNacional(m));
    const provincial = mats.find((m) => !esNacional(m));

    const especialidades = [...new Set(
      mats.flatMap((m) => comoArray(m.especialidades && m.especialidades.especialidad))
        .map((e) => (e && e.especialidad) || '')
        .filter(Boolean)
    )];

    const apellidoNombre = `${p.apellido || ''} ${p.nombre || ''}`.trim();

    return {
      nombre: titulizar(apellidoNombre),
      apellido: titulizar(p.apellido || ''),
      nombrePila: titulizar(p.nombre || ''),
      matN: nacional ? Number(String(nacional.matricula).replace(/\D/g, '')) || 0 : 0,
      matP: provincial ? Number(String(provincial.matricula).replace(/\D/g, '')) || 0 : 0,
      especialidad: especialidades[0] || titulizar((mats[0] && mats[0].profesion) || ''),
      localidad: titulizar((provincial || nacional || {}).provincia || ''),
      vigente: mats.some((m) => String(m.vigente).toUpperCase() === 'SI' || /habilitad/i.test(m.estado || '')),
      matriculas: mats.map((m) => ({
        numero: m.matricula,
        profesion: m.profesion,
        jurisdiccion: m.jurisdiccion || m.provincia,
        estado: m.estado,
        vigente: m.vigente,
      })),
      origen: 'sisa',
    };
  });

  return { ok: true, resultados };
}

/** Traduce el resultado a status HTTP + cuerpo JSON, igual para los dos hosts. */
function aRespuesta(r) {
  if (r.ok) {
    return { status: 200, body: { resultados: r.resultados, origen: 'sisa' } };
  }
  const status = {
    SIN_CREDENCIALES: 501,
    PARAMETROS: 400,
    AUTENTICACION: 502,
    CUOTA: 429,
    DEMASIADOS: 413,
    TIMEOUT: 504,
    RED: 502,
    HTTP: 502,
  }[r.codigo] || 502;
  return { status, body: { error: r.error, codigo: r.codigo } };
}

module.exports = { consultar, aRespuesta, hayCredenciales };
