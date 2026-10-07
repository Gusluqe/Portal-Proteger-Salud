#!/usr/bin/env node
/**
 * Servidor de desarrollo. Sirve el portal desde la raiz del proyecto y
 * responde /api/sisa con la misma logica que en produccion, asi el fallback
 * a REFEPS se puede probar localmente.
 *
 *   node tools/serve.js [puerto]
 *
 * Para probar la consulta a SISA de verdad hacen falta las credenciales:
 *   SISA_USUARIO=... SISA_CLAVE=... node tools/serve.js
 * Sin ellas devuelve 501, que es exactamente lo que ve el portal desplegado
 * mientras no esten configuradas.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const RAIZ = path.join(__dirname, '..');
const PUERTO = Number(process.argv[2]) || 5173;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.gz': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/sisa') {
    const { consultar, aRespuesta } = require('../lib/sisa');
    const p = Object.fromEntries(url.searchParams);
    const { status, body } = aRespuesta(await consultar(p));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(body));
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';

  const destino = path.join(RAIZ, rel);
  // No servir nada fuera de la raiz del proyecto ni la base cruda.
  if (!destino.startsWith(RAIZ) || path.basename(destino) === 'me_bsas.dbf') {
    res.writeHead(403);
    return res.end('Prohibido');
  }

  fs.readFile(destino, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado: ' + rel);
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream',
      'Content-Length': datos.length,
      'Cache-Control': 'no-cache',
    });
    res.end(datos);
  });
});

servidor.listen(PUERTO, () => {
  const { hayCredenciales } = require('../lib/sisa');
  console.log(`Portal en http://localhost:${PUERTO}`);
  console.log(hayCredenciales()
    ? 'SISA: credenciales detectadas, el fallback va a consultar REFEPS.'
    : 'SISA: sin credenciales (SISA_USUARIO / SISA_CLAVE) — /api/sisa responde 501.');
});
