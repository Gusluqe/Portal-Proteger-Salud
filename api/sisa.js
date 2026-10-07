/**
 * Endpoint /api/sisa para Vercel.
 * La logica esta en lib/sisa.js, compartida con la funcion de Netlify.
 */
'use strict';

const { consultar, aRespuesta } = require('../lib/sisa');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { matricula, apellido, nombre, provincia, profesion } = req.query || {};
  const r = await consultar({ matricula, apellido, nombre, provincia, profesion });
  const { status, body } = aRespuesta(r);

  // Las matriculas cambian poco: cachear alivia la cuota diaria de SISA.
  if (status === 200) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  return res.status(status).json(body);
};
