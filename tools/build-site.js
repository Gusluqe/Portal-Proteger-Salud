#!/usr/bin/env node
/**
 * Arma dist/ con lo que se publica.
 *
 * Existe por una razon concreta: me_bsas.dbf pesa 19 MB y es la base cruda.
 * Si el directorio publicado fuera la raiz del proyecto, ese archivo quedaria
 * descargable desde https://<dominio>/me_bsas.dbf y ademas se subiria entero
 * en cada deploy. Aca se copia solo lo que el navegador necesita.
 *
 *   node tools/build-site.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');

// Lo unico que se publica.
const INCLUIR = [
  'index.html',
  'drogueria.html',
  'descargas.html',
  'assets',
  '_headers',
  '_redirects',
  'robots.txt',
];

function copiar(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const hijo of fs.readdirSync(src)) copiar(path.join(src, hijo), path.join(dst, hijo));
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function tamano(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((t, h) => t + tamano(path.join(p, h)), 0);
}

function main() {
  const indice = path.join(RAIZ, 'assets', 'data', 'medicos.bin');
  if (!fs.existsSync(indice)) {
    console.error('Falta assets/data/medicos.bin. Corré primero: node tools/build-index.js');
    process.exit(1);
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  let copiados = 0;
  for (const item of INCLUIR) {
    const src = path.join(RAIZ, item);
    if (!fs.existsSync(src)) continue;
    copiar(src, path.join(DIST, item));
    copiados++;
  }

  const total = tamano(DIST);
  console.log(`dist/ listo · ${copiados} entradas · ${(total / 1024 / 1024).toFixed(2)} MB`);
  console.log('me_bsas.dbf NO se publica (queda solo como fuente del índice).');
}

main();
