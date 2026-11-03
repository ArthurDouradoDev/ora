// ============================================================
// ORA — runner da suíte em Node (sem dependências)
// ============================================================
// Uso, na raiz do projeto:  node tests/run.js
// Carrega os mesmos arquivos de tests/tests.html num contexto isolado,
// com um DOM mínimo de mentira, e sai com código 1 se algo falhar.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

// Mesma ordem dos <script> de tests/tests.html
const FILES = [
    'scripts/shared/blocker-core.js',
    'scripts/shared/pomodoro-core.js',
    'scripts/shared/route-core.js',
    'scripts/modules/sync.js',
    'tests/tests.js'
];

function makeElement() {
    return {
        children: [],
        className: '',
        textContent: '',
        appendChild(child) { this.children.push(child); return child; }
    };
}

const context = {
    console: { log() {}, error() {}, warn() {} },
    document: {
        getElementById: () => makeElement(),
        createElement: () => makeElement()
    },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout
};
context.self = context;
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of FILES) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
}

const results = context.__oraTestResults || [];
const failures = results.filter(r => !r.pass);

let lastGroup = null;
for (const r of failures) {
    if (r.group !== lastGroup) {
        console.log(`\n${r.group}`);
        lastGroup = r.group;
    }
    console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}

const groups = new Set(results.map(r => r.group)).size;
const passed = results.length - failures.length;
console.log(`\n${failures.length ? '✗' : '✓'} ${passed}/${results.length} testes passaram (${groups} grupos)`);

process.exit(results.length && !failures.length ? 0 : 1);
