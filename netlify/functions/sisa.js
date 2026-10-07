/**
 * Endpoint /api/sisa para Netlify (el redirect esta en netlify.toml).
 * La logica esta en lib/sisa.js, compartida con la funcion de Vercel.
 */
'use strict';

const { consultar, aRespuesta } = require('../../lib/sisa');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
      body: JSON.stringify({ error: 'Método no permitido' }),
    };
  }

  const q = event.queryStringParameters || {};
  const r = await consultar({
    matricula: q.matricula,
    apellido: q.apellido,
    nombre: q.nombre,
    provincia: q.provincia,
    profesion: q.profesion,
  });
  const { status, body } = aRespuesta(r);

  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Las matriculas cambian poco: cachear alivia la cuota diaria de SISA.
      'Cache-Control': status === 200
        ? 'public, s-maxage=86400, stale-while-revalidate=604800'
        : 'no-store',
    },
    body: JSON.stringify(body),
  };
};
