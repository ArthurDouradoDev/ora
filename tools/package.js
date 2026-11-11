#!/usr/bin/env node
// Gera o zip para a Chrome Web Store: só os arquivos da extensão, sem
// protótipos, testes, documentação ou arquivos de debug.
// Uso: node tools/package.js  →  dist/ora-<versão>.zip
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// O que entra no pacote (tudo o mais fica de fora).
const INCLUDE = ['manifest.json', 'ora.html', 'blocked.html', 'sw.js', 'scripts', 'styles', 'data', 'assets'];
// Exceções dentro das pastas incluídas (caminhos relativos à raiz, com /).
const EXCLUDE = [/^assets\/screen\.png$/, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /\.map$/];

function walk(rel, out) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) throw new Error('Arquivo esperado não existe: ' + rel);
    if (fs.statSync(abs).isDirectory()) {
        for (const name of fs.readdirSync(abs)) walk(rel + '/' + name, out);
    } else if (!EXCLUDE.some(re => re.test(rel))) {
        out.push(rel);
    }
    return out;
}

const files = INCLUDE.flatMap(rel => walk(rel, []));

// Confere que tudo o que o manifesto referencia vai no pacote.
const referenced = [
    manifest.background && manifest.background.service_worker,
    ...Object.values(manifest.chrome_url_overrides || {}),
    ...Object.values(manifest.icons || {}),
    ...(manifest.content_scripts || []).flatMap(c => [...(c.js || []), ...(c.css || [])]),
    ...(manifest.web_accessible_resources || []).flatMap(w => w.resources),
].filter(Boolean);
const missing = referenced.filter(f => !files.includes(f));
if (missing.length) {
    console.error('Arquivos do manifesto fora do pacote:', missing.join(', '));
    process.exit(1);
}

// Monta uma cópia limpa e compacta com o tar do sistema (bsdtar gera zip
// no Windows 10+, macOS e na maioria dos Linux).
const dist = path.join(root, 'dist');
const stage = path.join(dist, 'stage');
fs.rmSync(stage, { recursive: true, force: true });
for (const rel of files) {
    const target = path.join(stage, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, rel), target);
}
const zip = path.join(dist, `ora-${manifest.version}.zip`);
fs.rmSync(zip, { force: true });
// No Windows, o tar do Git Bash é GNU (não gera zip): usar o do sistema.
const tar = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
execFileSync(tar, ['-a', '-c', '-f', zip, '-C', stage, ...fs.readdirSync(stage)], { stdio: 'inherit' });
fs.rmSync(stage, { recursive: true, force: true });

const size = fs.statSync(zip).size;
console.log(`✓ ${path.relative(root, zip)} — ${files.length} arquivos, ${(size / 1048576).toFixed(1)} MB`);
