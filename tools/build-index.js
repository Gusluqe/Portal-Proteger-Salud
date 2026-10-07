#!/usr/bin/env node
/**
 * Convierte me_bsas.dbf en un indice binario compacto que el portal carga
 * bajo demanda para buscar medicos sin backend.
 *
 *   node tools/build-index.js [ruta/al/me_bsas.dbf]
 *
 * Salidas (en assets/data/):
 *   medicos.bin   tabla de personas + blob de nombres
 *   medicos.json  diccionarios (especialidades, localidades) + metadatos
 *
 * El .dbf trae una fila por matricula: la misma persona aparece dos veces,
 * una con matricula nacional y otra con provincial. Aca se consolidan por
 * nombre + observacion.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = process.argv[2] || path.join(__dirname, '..', 'me_bsas.dbf');
const OUT = path.join(__dirname, '..', 'assets', 'data');

// Codigos de especialidad tal como vienen en OBS. Los que no tienen una
// lectura inequivoca se dejan con el codigo crudo a proposito: es preferible
// mostrar "C.P" a inventar una especialidad que no es.
const ESPECIALIDADES = {
  CLM: 'Clínica Médica',        PED: 'Pediatría',
  GIN: 'Ginecología',           PSQ: 'Psiquiatría',
  CRD: 'Cardiología',           TRA: 'Traumatología',
  ODO: 'Odontología',           OFT: 'Oftalmología',
  DER: 'Dermatología',          CIR: 'Cirugía General',
  NEU: 'Neurología',            ORL: 'Otorrinolaringología',
  GET: 'Gastroenterología',     URO: 'Urología',
  END: 'Endocrinología',        ANE: 'Anestesiología',
  REU: 'Reumatología',          NEF: 'Nefrología',
  ONC: 'Oncología',             HEM: 'Hematología',
  INF: 'Infectología',          OBS: 'Obstetricia',
  NCI: 'Neurocirugía',          RAD: 'Radiología',
  NEO: 'Neonatología',          GER: 'Geriatría',
  PRO: 'Proctología',           HEP: 'Hepatología',
  FIS: 'Fisiatría',             PSI: 'Psicología',
  HMT: 'Hemoterapia',           MNU: 'Medicina Nuclear',
  MLA: 'Medicina Laboral',      DEP: 'Medicina del Deporte',
  ALE: 'Alergia e Inmunología', ALG: 'Alergia',
  'T.I': 'Terapia Intensiva',   'C.P': 'Cirugía Plástica',
  'C.C': 'Cirugía Cardiovascular',
  'N-T': 'Nutrición',
  OTR: 'Otras',
};

function leerDbf(file) {
  const buf = fs.readFileSync(file);
  const numRec = buf.readUInt32LE(4);
  const hdrLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);

  const nFields = Math.floor((hdrLen - 33) / 32);
  const campos = [];
  let off = 0;
  for (let i = 0; i < nFields; i++) {
    const o = 32 + i * 32;
    campos.push({
      nombre: buf.toString('latin1', o, o + 11).replace(/\0.*/, ''),
      inicio: off,
      largo: buf[o + 16],
    });
    off += buf[o + 16];
  }

  const idx = {};
  for (const c of campos) idx[c.nombre] = c;
  for (const req of ['NOMBRE', 'OBS', 'MAT_N', 'MAT_P']) {
    if (!idx[req]) throw new Error(`El .dbf no tiene el campo ${req}`);
  }

  const filas = [];
  for (let i = 0; i < numRec; i++) {
    const o = hdrLen + i * recLen;
    if (buf[o] === 0x2a) continue;               // registro borrado
    const rec = buf.toString('latin1', o + 1, o + recLen);
    const campo = (n) => rec.substr(idx[n].inicio, idx[n].largo).trim();
    filas.push({
      nombre: campo('NOMBRE'),
      obs: campo('OBS'),
      matN: campo('MAT_N'),
      matP: campo('MAT_P'),
    });
  }
  return { filas, numRec };
}

// En el .dbf la N con virgulilla esta guardada como '#' (ANASCO -> A#ASCO).
const restaurarEnie = (s) => s.replace(/#/g, 'Ñ');

/**
 * El .dbf no tiene acentos. Para las localidades se pueden reponer con
 * seguridad porque son una lista cerrada de 168 nombres conocidos; para los
 * nombres de personas NO se hace, porque ahi adivinar acentos produciria
 * errores en un dato que tiene que coincidir con el registro oficial.
 */
const ACENTOS = {
  ADROGUE: 'ADROGUÉ',       ALVAREZ: 'ÁLVAREZ',       AUTONOMA: 'AUTÓNOMA',
  CATAN: 'CATÁN',           GONZALEZ: 'GONZÁLEZ',     GUILLON: 'GUILLÓN',
  ITUZAINGO: 'ITUZAINGÓ',   JAGUEL: 'JAGÜEL',         JARDIN: 'JARDÍN',
  JOSE: 'JOSÉ',             LAFERRERE: 'LAFERRÈRE',   LANUS: 'LANÚS',
  LEON: 'LEÓN',             LOPEZ: 'LÓPEZ',           MAIPU: 'MAIPÚ',
  MARMOL: 'MÁRMOL',         MARTIN: 'MARTÍN',         MEJIA: 'MEJÍA',
  MORON: 'MORÓN',           NOGUES: 'NOGUÉS',         PODESTA: 'PODESTÁ',
  RINCON: 'RINCÓN',         SAENZ: 'SÁENZ',           SARANDI: 'SARANDÍ',
  SUAREZ: 'SUÁREZ',         TRISTAN: 'TRISTÁN',       VALENTIN: 'VALENTÍN',
};

// Las tres variantes de la Ciudad de Buenos Aires que trae el .dbf.
const CABA = /^CIUDAD (AUTONOMA (DE )?)?BUENOS AIRES?$/;

function normalizarLocalidad(loc) {
  if (CABA.test(loc)) return 'CABA';
  return loc.split(' ').map((p) => ACENTOS[p] || p).join(' ');
}

// Capitaliza respetando las particulas que en castellano van en minuscula.
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'DA', 'DI', 'VAN', 'VON']);
function titulizar(s) {
  if (s === 'CABA') return s;
  return s
    .split(' ')
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p.toLowerCase() : p.charAt(0) + p.slice(1).toLowerCase()))
    .join(' ');
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`No encuentro el .dbf en ${SRC}`);
    process.exit(1);
  }

  console.log(`Leyendo ${path.basename(SRC)} ...`);
  const { filas, numRec } = leerDbf(SRC);
  console.log(`  ${filas.length} filas activas de ${numRec}`);

  // --- Consolidar: una persona = nombre + obs ---------------------------
  const personas = new Map();
  let descartadas = 0;

  for (const f of filas) {
    if (!f.nombre || (!f.matN && !f.matP)) { descartadas++; continue; }

    const m = f.obs.match(/^\(([^)]*)\)\s*(.*)$/);
    const esp = m ? m[1].trim() : '';
    const loc = m ? m[2].trim() : f.obs;

    const clave = `${f.nombre}|${f.obs}`;
    let p = personas.get(clave);
    if (!p) {
      p = { nombre: restaurarEnie(f.nombre), esp, loc: titulizar(normalizarLocalidad(restaurarEnie(loc))), matN: 0, matP: 0 };
      personas.set(clave, p);
    }
    // Si una persona tuviera mas de una matricula del mismo tipo se conserva
    // la menor, que es la de registro mas antiguo.
    const n = parseInt(f.matN, 10);
    const q = parseInt(f.matP, 10);
    if (Number.isFinite(n) && n > 0 && (p.matN === 0 || n < p.matN)) p.matN = n;
    if (Number.isFinite(q) && q > 0 && (p.matP === 0 || q < p.matP)) p.matP = q;
  }

  const lista = [...personas.values()];
  lista.sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  console.log(`  ${lista.length} personas consolidadas (${descartadas} filas descartadas)`);

  // --- Diccionarios ------------------------------------------------------
  const espCodes = [...new Set(lista.map((p) => p.esp))].sort();
  const locNames = [...new Set(lista.map((p) => p.loc))].sort();
  const espIdx = new Map(espCodes.map((c, i) => [c, i]));
  const locIdx = new Map(locNames.map((c, i) => [c, i]));

  if (locNames.length > 65535) throw new Error('Mas de 65535 localidades: no entra en uint16');
  if (espCodes.length > 255) throw new Error('Mas de 255 especialidades: no entra en uint8');

  // --- Serializar --------------------------------------------------------
  // Registro de 12 bytes: nameLen u8 | esp u8 | loc u16 | matN u32 | matP u32
  // Los nombres van concatenados en el mismo orden que la tabla, asi no hace
  // falta guardar el offset: se reconstruye acumulando los largos al cargar.
  const REC = 12;
  const nombresBuf = [];
  const tabla = Buffer.alloc(lista.length * REC);

  lista.forEach((p, i) => {
    const nb = Buffer.from(p.nombre, 'utf8');
    if (nb.length > 255) throw new Error(`Nombre demasiado largo: ${p.nombre}`);
    nombresBuf.push(nb);
    const o = i * REC;
    tabla.writeUInt8(nb.length, o);
    tabla.writeUInt8(espIdx.get(p.esp), o + 1);
    tabla.writeUInt16LE(locIdx.get(p.loc), o + 2);
    tabla.writeUInt32LE(p.matN, o + 4);
    tabla.writeUInt32LE(p.matP, o + 8);
  });

  const blob = Buffer.concat(nombresBuf);
  const header = Buffer.alloc(16);
  header.write('PSMD', 0, 'latin1');        // magic
  header.writeUInt8(1, 4);                  // version de formato
  header.writeUInt8(REC, 5);
  header.writeUInt32LE(lista.length, 6);
  header.writeUInt32LE(blob.length, 10);

  const bin = Buffer.concat([header, tabla, blob]);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'medicos.bin'), bin);

  // Netlify comprime al vuelo el texto, pero no un application/octet-stream:
  // el indice viajaria entero, 3,2 MB en vez de 1,3. Se pre-comprime aca y el
  // cliente lo descomprime con DecompressionStream. El .bin sin comprimir
  // queda como respaldo para navegadores que no la soporten.
  fs.writeFileSync(path.join(OUT, 'medicos.bin.gz'), zlib.gzipSync(bin, { level: 9 }));

  const meta = {
    generado: new Date().toISOString().slice(0, 10),
    fuente: path.basename(SRC),
    personas: lista.length,
    filasOrigen: filas.length,
    conMatriculaNacional: lista.filter((p) => p.matN).length,
    conMatriculaProvincial: lista.filter((p) => p.matP).length,
    especialidades: espCodes.map((c) => [c, ESPECIALIDADES[c] || c]),
    localidades: locNames,
  };
  fs.writeFileSync(path.join(OUT, 'medicos.json'), JSON.stringify(meta));

  const gz = zlib.gzipSync(bin, { level: 9 }).length;
  const br = zlib.brotliCompressSync(bin).length;
  const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';

  console.log('');
  console.log(`  medicos.bin    ${kb(bin.length)}`);
  console.log(`  medicos.bin.gz ${kb(gz)}   (brotli habria sido ${kb(br)})`);
  console.log(`  medicos.json  ${kb(fs.statSync(path.join(OUT, 'medicos.json')).size)}`);
  console.log('');
  console.log(`  ${meta.personas} personas · ${espCodes.length} especialidades · ${locNames.length} localidades`);
  console.log(`  ${meta.conMatriculaNacional} con MN · ${meta.conMatriculaProvincial} con MP`);
  const sinNombre = espCodes.filter((c) => !ESPECIALIDADES[c]);
  if (sinNombre.length) {
    console.log('');
    console.log(`  Codigos sin nombre largo (se muestran tal cual): ${sinNombre.join(', ')}`);
    console.log('  Completalos en ESPECIALIDADES dentro de este script.');
  }
}

main();
