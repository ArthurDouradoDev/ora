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
    'scripts/shared/tasks-core.js',
    'scripts/shared/sessions-core.js',
    'scripts/shared/counter-core.js',
    'scripts/shared/migrate-core.js',
    'scripts/shared/today-core.js',
    'scripts/shared/reminders-core.js',
    'scripts/shared/search-core.js',
    'scripts/shared/reader-core.js',
    'scripts/shared/rosary-core.js',
    'scripts/shared/liturgy-core.js',
    'scripts/shared/saints-core.js',
    'scripts/shared/bible-core.js',
    'scripts/modules/sync.js',
    'tests/tests.js'
];

// Fixtures em JSON (o tests.html as busca por fetch quando servido por http)
const FIXTURES = ['storage-1.1.5'];

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
context.__oraFixtures = {};
for (const name of FIXTURES) {
    context.__oraFixtures[name] = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', name + '.json'), 'utf8'));
}
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
for (const r of results.filter(r => r.skipped)) console.log(`  - ${r.group}: ${r.name}`);
console.log(`\n${failures.length ? '✗' : '✓'} ${passed}/${results.length} testes passaram (${groups} grupos)`);

process.exit(results.length && !failures.length ? 0 : 1);
