/* Isolated Rezar v2 harness: pushState + focus/context hooks. */
/* ==========================================================================
   Harness dos protótipos do Ora
   - Estados: [data-show="a b"] / [data-hide="a b"] / [data-goto="estado"]
   - Notas de design: [data-note="texto"] [data-ref="§10"]
   - Barra: estados, notas, texto 100/150/200%, movimento reduzido, foto, janela
   - Validação: perguntas por tela, salvas no navegador e exportáveis em Markdown
   Atalhos: Alt+P recolhe a barra · Alt+N notas · Alt+V validação · Alt+←/→ estados
   ========================================================================== */
(function () {
  const STORE_KEY = 'ora-proto-v1';
  const FRAMES = {
    extension: [
      { id: 'livre', label: 'Janela livre' },
      { id: '1440', label: 'Desktop 1440×900', w: 1440, h: 900 },
      { id: '1366', label: 'Notebook 1366×768', w: 1366, h: 768 },
      { id: '1024', label: 'Janela pequena 1024×640', w: 1024, h: 640 },
      { id: '800', label: 'Janela estreita 800×600', w: 800, h: 600 },
    ],
    mobile: [
      { id: '390', label: 'Celular 390×844', w: 390, h: 844, phone: true },
      { id: '360', label: 'Celular estreito 360×740', w: 360, h: 740, phone: true },
      { id: '430', label: 'Celular grande 430×932', w: 430, h: 932, phone: true },
    ],
  };

  const store = {
    read() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { pages: {}, prefs: {} }; }
      catch (e) { return { pages: {}, prefs: {} }; }
    },
    write(data) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); return true; }
      catch (e) { return false; }
    },
    page(id) {
      const d = store.read();
      return d.pages[id] || { answers: {}, stateNotes: {} };
    },
    updatePage(id, fn) {
      const d = store.read();
      d.pages[id] = d.pages[id] || { answers: {}, stateNotes: {} };
      fn(d.pages[id]);
      store.write(d);
    },
    pref(key, value) {
      const d = store.read();
      d.prefs = d.prefs || {};
      if (value === undefined) return d.prefs[key];
      d.prefs[key] = value;
      store.write(d);
    },
  };

  const el = (tag, attrs = {}, html = '') => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    if (html) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Proto = {
    cfg: null,
    state: null,
    store,
    notesOn: false,

    init(cfg) {
      this.cfg = Object.assign({ kind: 'extension', states: [], questions: [], actions: [], photo: false }, cfg);
      const c = this.cfg;
      this.stage = document.querySelector('.proto-stage');
      this.frame = document.querySelector('.proto-frame');

      // Registra metadados da página para o índice exportar tudo
      store.updatePage(c.id, (p) => {
        p.title = c.title; p.refs = c.refs || ''; p.questions = c.questions;
        p.states = Object.fromEntries(c.states.map((s) => [s.id, s.label]));
        p.file = location.pathname.split('/').pop();
      });

      this.buildBar();
      this.applyPrefs();
      this.bindGlobal();

      const fromHash = decodeURIComponent((location.hash || '').replace('#', ''));
      const initial = c.states.find((s) => s.id === fromHash) ? fromHash : (c.initial || c.states[0]?.id);
      this.setState(initial, { first: true });
      window.addEventListener('popstate', () => {
        if (history.state?.oraRezarV2) this.setState(history.state.route, { history: false, restore: true });
      });
      window.addEventListener('hashchange', () => {
        const h = decodeURIComponent(location.hash.replace('#', ''));
        if (h && h !== this.state && c.states.find((s) => s.id === h)) this.setState(h, { history: false, restore: true });
      });
    },

    /* ---------------- Estados ---------------- */
    setState(id, opts = {}) {
      if (!id || !this.cfg.states.some(s => s.id === id)) return;
      this.cfg.onBeforeState?.(id, this.state, opts);
      const prev = this.state;
      this.state = id;
      document.documentElement.dataset.state = id;
      document.querySelectorAll('[data-show],[data-hide]').forEach((n) => {
        let visible = true;
        if (n.dataset.show) visible = n.dataset.show.split(/\s+/).includes(id);
        if (n.dataset.hide && n.dataset.hide.split(/\s+/).includes(id)) visible = false;
        const wasHidden = n.hidden;
        n.hidden = !visible;
        if (visible && wasHidden && !opts.first) {
          n.classList.remove('enter'); void n.offsetWidth; n.classList.add('enter');
        }
      });
      if (this.cfg.onState) this.cfg.onState(id, prev, opts);
      this.bar?.querySelectorAll('[data-state-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stateBtn === id)));
      const s = this.cfg.states.find((x) => x.id === id);
      const hint = this.bar?.querySelector('.pb-hint');
      if (hint) hint.innerHTML = s?.hint ? esc(s.hint) : '';
      if (opts.history !== false) {
        const depth = opts.first ? (history.state?.depth || 0) : (history.state?.depth || 0) + 1;
        const payload = { oraRezarV2: true, route: id, depth, context: this.cfg.getContext?.() };
        history[opts.first ? 'replaceState' : 'pushState'](payload, '', '#' + encodeURIComponent(id));
      }
      if (this.drawer) this.renderDrawer();
      requestAnimationFrame(() => this.renderNotes());
    },
    step(dir) {
      const ids = this.cfg.states.map((s) => s.id);
      const i = ids.indexOf(this.state);
      this.setState(ids[(i + dir + ids.length) % ids.length]);
    },

    /* ---------------- Barra ---------------- */
    buildBar() {
      const c = this.cfg;
      const bar = el('aside', { class: 'proto-bar', 'aria-label': 'Controles do protótipo' });
      const groups = [];
      c.states.forEach((s) => {
        const g = s.group || '';
        let grp = groups.find((x) => x.name === g);
        if (!grp) groups.push((grp = { name: g, items: [] }));
        grp.items.push(s);
      });
      const frames = c.frames || FRAMES[c.kind] || FRAMES.extension;
      this.frames = frames;
      bar.innerHTML = `
        <header>
          <b title="${esc(c.title)}">${esc(c.title)} <small>${esc(c.refs || '')}</small></b>
          <button class="pb-icon" data-act="dock" title="Mover barra para o outro lado" aria-label="Mover barra">⇆</button>
          <button class="pb-icon" data-act="collapse" title="Recolher (Alt+P)" aria-label="Recolher barra">–</button>
        </header>
        <section>
          <h6>Estado da tela</h6>
          <div class="pb-states">
            ${groups.map((g) => `${g.name ? `<div class="pb-group">${esc(g.name)}</div>` : ''}${g.items.map((s) => `<button data-state-btn="${s.id}" aria-pressed="false">${esc(s.label)}</button>`).join('')}`).join('')}
          </div>
          <div class="pb-hint"></div>
        </section>
        <section>
          <h6>Condições de teste</h6>
          <div class="pb-row">
            <button data-act="notes" aria-pressed="false" title="Alt+N">Notas de design</button>
            <button data-act="motion" aria-pressed="false">Movimento reduzido</button>
            ${c.photo ? '<button data-act="photo" aria-pressed="false">Foto indisponível</button>' : ''}
          </div>
          <div class="pb-row" style="margin-top:6px">
            <span style="color:#a99f8f">Texto</span>
            <button data-zoom="1" aria-pressed="true">100%</button>
            <button data-zoom="1.5" aria-pressed="false">150%</button>
            <button data-zoom="2" aria-pressed="false">200%</button>
          </div>
          <div class="pb-row" style="margin-top:6px">
            <select data-act="frame" aria-label="Tamanho da janela">
              ${frames.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}
            </select>
          </div>
        </section>
        ${c.variants?.length ? `<section><h6>Cópias para comparar</h6><div class="pb-row">
          <select data-act="variant" aria-label="Cópia desta tela">
            ${c.variants.map((v) => `<option value="${esc(v.file)}"${location.pathname.endsWith('/' + v.file) ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select></div></section>` : ''}
        ${c.options?.length ? `<section><h6>Variações</h6>${c.options.map((o) => `<div class="pb-row" style="margin-top:6px">
          <span style="color:#a99f8f">${esc(o.label)}</span>
          <select data-opt="${esc(o.id)}" aria-label="${esc(o.label)}">${o.values.map((x) => `<option value="${esc(x.v)}">${esc(x.label)}</option>`).join('')}</select>
        </div>`).join('')}</section>` : ''}
        ${c.actions.length ? `<section><h6>Simular</h6><div class="pb-row">${c.actions.map((a, i) => `<button data-action="${i}">${esc(a.label)}</button>`).join('')}</div></section>` : ''}
        <section>
          <div class="pb-row">
            <button data-act="validate" title="Alt+V">✎ Validar esta tela</button>
            <a href="index.html" style="margin-left:auto">← Índice</a>
          </div>
        </section>`;
      document.body.appendChild(bar);
      this.bar = bar;

      bar.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.stateBtn) return this.setState(b.dataset.stateBtn);
        if (b.dataset.zoom) return this.setZoom(parseFloat(b.dataset.zoom));
        if (b.dataset.action) return c.actions[+b.dataset.action].run();
        const act = b.dataset.act;
        if (act === 'collapse') this.toggleCollapse();
        if (act === 'dock') { bar.classList.toggle('right'); store.pref('dock', bar.classList.contains('right') ? 'right' : 'left'); }
        if (act === 'notes') this.toggleNotes();
        if (act === 'motion') this.setMotion(document.documentElement.dataset.motion !== 'reduce');
        if (act === 'photo') this.setPhoto(document.documentElement.dataset.photo !== 'reserva');
        if (act === 'validate') this.openDrawer();
      });
      bar.querySelector('[data-act="frame"]').addEventListener('change', (e) => this.setFrame(e.target.value));
      // Troca de cópia preserva o estado da tela; variações valem para todas as cópias
      bar.querySelector('[data-act="variant"]')?.addEventListener('change', (e) => { location.href = e.target.value + location.hash; });
      bar.querySelectorAll('[data-opt]').forEach((s) => s.addEventListener('change', (e) => this.setOption(s.dataset.opt, e.target.value)));
    },

    applyPrefs() {
      if (store.pref('collapsed')) this.bar.classList.add('collapsed');
      if (store.pref('dock') === 'right') this.bar.classList.add('right');
      this.setZoom(store.pref('zoom') || 1);
      this.setMotion(!!store.pref('motion'));
      const fr = store.pref('frame-' + this.cfg.kind);
      this.setFrame(fr && this.frames.find((f) => f.id === fr) ? fr : this.frames[0].id);
      (this.cfg.options || []).forEach((o) => {
        const v = store.pref('opt-' + o.id);
        this.setOption(o.id, o.values.some((x) => x.v === v) ? v : o.values[0].v);
      });
    },
    setOption(id, v) {
      document.documentElement.dataset[id] = v;
      const sel = this.bar.querySelector(`[data-opt="${id}"]`);
      if (sel) sel.value = v;
      store.pref('opt-' + id, v);
      this.cfg.options.find((o) => o.id === id)?.apply?.(v);
    },

    toggleCollapse() {
      this.bar.classList.toggle('collapsed');
      store.pref('collapsed', this.bar.classList.contains('collapsed'));
    },
    setZoom(z) {
      document.documentElement.style.fontSize = 16 * z + 'px';
      this.bar.querySelectorAll('[data-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(parseFloat(b.dataset.zoom) === z)));
      store.pref('zoom', z);
      requestAnimationFrame(() => this.renderNotes());
    },
    setMotion(reduce) {
      if (reduce) document.documentElement.dataset.motion = 'reduce';
      else delete document.documentElement.dataset.motion;
      this.bar.querySelector('[data-act="motion"]').setAttribute('aria-pressed', String(reduce));
      store.pref('motion', reduce);
    },
    setPhoto(fallback) {
      if (fallback) document.documentElement.dataset.photo = 'reserva';
      else delete document.documentElement.dataset.photo;
      this.bar.querySelector('[data-act="photo"]')?.setAttribute('aria-pressed', String(fallback));
    },
    setFrame(id) {
      const f = this.frames.find((x) => x.id === id) || this.frames[0];
      this.currentFrame = f;
      this.bar.querySelector('[data-act="frame"]').value = f.id;
      store.pref('frame-' + this.cfg.kind, f.id);
      const framed = !!f.w;
      this.stage.classList.toggle('framed', framed);
      this.stage.classList.toggle('phone', !!f.phone);
      this.frame.style.width = framed ? f.w + 'px' : '';
      this.frame.style.height = framed ? f.h + 'px' : '';
      this.fitFrame();
    },
    fitFrame() {
      const f = this.currentFrame;
      if (!f || !f.w) { this.frame.style.transform = ''; return; }
      const pad = f.phone ? 56 : 32;
      const s = Math.min(1, (innerWidth - pad) / f.w, (innerHeight - pad) / f.h);
      this.frame.style.transform = s < 1 ? `scale(${s})` : '';
    },

    /* ---------------- Notas de design ---------------- */
    toggleNotes(force) {
      this.notesOn = force ?? !this.notesOn;
      this.bar.querySelector('[data-act="notes"]').setAttribute('aria-pressed', String(this.notesOn));
      this.renderNotes();
    },
    visibleNotes() {
      return [...document.querySelectorAll('[data-note]')].filter((n) => {
        if (n.closest('[hidden]')) return false;
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    },
    renderNotes() {
      if (!this.layer) {
        this.layer = el('div', { class: 'proto-notes-layer', 'aria-hidden': 'true' });
        document.body.appendChild(this.layer);
      }
      this.layer.innerHTML = '';
      if (!this.notesOn) return;
      const fr = this.frame.getBoundingClientRect();
      this.visibleNotes().forEach((n, i) => {
        const r = n.getBoundingClientRect();
        if (r.bottom < fr.top || r.top > fr.bottom || r.right < fr.left || r.left > fr.right) return;
        const o = el('div', { class: 'proto-outline' });
        Object.assign(o.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
        const b = el('button', { class: 'proto-badge', type: 'button', tabindex: '-1' }, String(i + 1));
        const x = Math.max(fr.left + 2, Math.min(r.left - 10, fr.right - 24));
        const y = Math.max(fr.top + 2, Math.min(r.top - 10, fr.bottom - 24));
        Object.assign(b.style, { left: x + 'px', top: y + 'px' });
        b.addEventListener('mouseenter', () => this.showPop(b, n));
        b.addEventListener('mouseleave', () => this.hidePop());
        b.addEventListener('click', () => { this.openDrawer('notas'); });
        this.layer.append(o, b);
      });
    },
    showPop(anchor, n) {
      this.hidePop();
      const p = el('div', { class: 'proto-pop' }, `${esc(n.dataset.note)}${n.dataset.ref ? `<em>${esc(n.dataset.ref)}</em>` : ''}`);
      document.body.appendChild(p);
      const r = anchor.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      let left = r.right + 8, top = r.top;
      if (left + pr.width > innerWidth - 8) left = r.left - pr.width - 8;
      if (top + pr.height > innerHeight - 8) top = innerHeight - pr.height - 8;
      Object.assign(p.style, { left: Math.max(8, left) + 'px', top: Math.max(8, top) + 'px' });
      this.pop = p;
    },
    hidePop() { this.pop?.remove(); this.pop = null; },

    /* ---------------- Validação ---------------- */
    openDrawer(tab) {
      this.drawerTab = tab || this.drawerTab || 'perguntas';
      if (!this.drawer) {
        this.drawer = el('aside', { class: 'proto-drawer', role: 'dialog', 'aria-label': 'Validação desta tela' });
        document.body.appendChild(this.drawer);
        this.drawer.addEventListener('click', (e) => this.onDrawerClick(e));
        this.drawer.addEventListener('input', (e) => this.onDrawerInput(e));
      }
      this.drawer.hidden = false;
      this.renderDrawer();
      this.drawer.querySelector('header button')?.focus();
    },
    closeDrawer() { if (this.drawer) this.drawer.hidden = true; this.bar.querySelector('[data-act="validate"]').focus(); },
    renderDrawer() {
      if (!this.drawer || this.drawer.hidden) return;
      const c = this.cfg;
      const page = store.page(c.id);
      const st = c.states.find((s) => s.id === this.state);
      const tab = this.drawerTab;
      const qs = c.questions.map((q, i) => {
        const a = page.answers[i] || {};
        const text = typeof q === 'string' ? q : q.q;
        const ref = typeof q === 'string' ? '' : q.ref;
        return `<div class="pd-q">
          <p>${esc(text)} ${ref ? `<span class="pd-ref">${esc(ref)}</span>` : ''}</p>
          <div class="pd-votes" data-q="${i}">
            <button data-v="sim" aria-pressed="${a.v === 'sim'}">Funciona</button>
            <button data-v="duvida" aria-pressed="${a.v === 'duvida'}">Em dúvida</button>
            <button data-v="nao" aria-pressed="${a.v === 'nao'}">Não funciona</button>
          </div>
          <textarea data-qc="${i}" placeholder="Comentário (opcional)">${esc(a.c || '')}</textarea>
        </div>`;
      }).join('');
      const notes = this.visibleNotes().map((n, i) => `<div class="pd-note"><span>${i + 1}</span><div>${esc(n.dataset.note)}${n.dataset.ref ? `<div style="color:#a99f8f;font-size:11px;margin-top:2px">${esc(n.dataset.ref)}</div>` : ''}</div></div>`).join('') || '<p style="color:#a99f8f">Nenhuma nota visível neste estado.</p>';
      this.drawer.innerHTML = `
        <header><b>Validar · ${esc(c.title)}</b><button data-d="close" aria-label="Fechar">Fechar</button></header>
        <div class="pd-tabs">
          <button data-d="tab" data-tab="perguntas" aria-pressed="${tab === 'perguntas'}">Perguntas</button>
          <button data-d="tab" data-tab="estado" aria-pressed="${tab === 'estado'}">Este estado</button>
          <button data-d="tab" data-tab="notas" aria-pressed="${tab === 'notas'}">Notas (${this.visibleNotes().length})</button>
        </div>
        <div class="pd-body">
          ${tab === 'perguntas' ? `<p style="color:#b8ae9e;margin:4px 0 4px">Responda depois de percorrer os estados e fluxos. Fica salvo neste navegador.</p>${qs}` : ''}
          ${tab === 'estado' ? `<p style="margin:8px 0 6px">Observações sobre <b>${esc(st?.label || this.state)}</b></p>${st?.hint ? `<p style="color:#b8ae9e;margin-bottom:8px">${esc(st.hint)}</p>` : ''}<textarea data-sn="${esc(this.state)}" style="min-height:160px" placeholder="O que funcionou, o que confundiu, o que falta…">${esc(page.stateNotes[this.state] || '')}</textarea>` : ''}
          ${tab === 'notas' ? notes : ''}
        </div>
        <footer>
          <button data-d="export">Baixar notas (.md)</button>
          <button data-d="copy">Copiar Markdown</button>
        </footer>`;
    },
    onDrawerClick(e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.d === 'close') return this.closeDrawer();
      if (b.dataset.d === 'tab') { this.drawerTab = b.dataset.tab; return this.renderDrawer(); }
      if (b.dataset.d === 'export') return Proto.download();
      if (b.dataset.d === 'copy') return Proto.copy();
      if (b.dataset.v) {
        const i = b.parentElement.dataset.q;
        store.updatePage(this.cfg.id, (p) => {
          p.answers[i] = p.answers[i] || {};
          p.answers[i].v = p.answers[i].v === b.dataset.v ? null : b.dataset.v;
        });
        this.renderDrawer();
      }
    },
    onDrawerInput(e) {
      const t = e.target;
      if (t.dataset.qc != null) store.updatePage(this.cfg.id, (p) => { p.answers[t.dataset.qc] = p.answers[t.dataset.qc] || {}; p.answers[t.dataset.qc].c = t.value; });
      if (t.dataset.sn != null) store.updatePage(this.cfg.id, (p) => { p.stateNotes[t.dataset.sn] = t.value; });
    },

    markdown() {
      const d = store.read();
      const label = { sim: '✅ Funciona', duvida: '🤔 Em dúvida', nao: '❌ Não funciona' };
      const date = new Date().toLocaleDateString('pt-BR');
      let md = `# Ora — validação dos protótipos\n\nExportado em ${date}.\n`;
      Object.entries(d.pages).forEach(([id, p]) => {
        if (!p.title) return;
        md += `\n## ${p.title} ${p.refs ? `(${p.refs})` : ''}\n\n`;
        (p.questions || []).forEach((q, i) => {
          const a = p.answers?.[i] || {};
          const text = typeof q === 'string' ? q : q.q;
          md += `- **${text}** — ${a.v ? label[a.v] : '_sem resposta_'}${a.c ? `\n  - ${a.c.replace(/\n/g, '\n    ')}` : ''}\n`;
        });
        const sn = Object.entries(p.stateNotes || {}).filter(([, v]) => v && v.trim());
        if (sn.length) {
          md += `\n**Observações por estado**\n\n`;
          sn.forEach(([k, v]) => { md += `- _${p.states?.[k] || k}_: ${v.replace(/\n/g, '\n  ')}\n`; });
        }
      });
      return md;
    },
    download() {
      const blob = new Blob([Proto.markdown()], { type: 'text/markdown' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `ora-validacao-${new Date().toISOString().slice(0, 10)}.md` });
      document.body.appendChild(a); a.click(); a.remove();
    },
    async copy() {
      try { await navigator.clipboard.writeText(Proto.markdown()); Proto.toast('Markdown copiado'); }
      catch (e) { Proto.toast('Não foi possível copiar — use "Baixar notas"'); }
    },
    toast(msg, ms = 2200) {
      const t = el('div', { class: 'proto-toast', role: 'status' }, esc(msg));
      document.body.appendChild(t);
      setTimeout(() => t.remove(), ms);
    },

    /* ---------------- Global ---------------- */
    bindGlobal() {
      document.addEventListener('click', (e) => {
        const g = e.target.closest('[data-goto]');
        if (g && !g.closest('.proto-bar')) { e.preventDefault(); this.setState(g.dataset.goto); }
      });
      document.addEventListener('keydown', (e) => {
        if (!e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'p') { e.preventDefault(); this.toggleCollapse(); }
        if (k === 'n') { e.preventDefault(); this.toggleNotes(); }
        if (k === 'v') { e.preventDefault(); this.drawer && !this.drawer.hidden ? this.closeDrawer() : this.openDrawer(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      });
      let raf = 0;
      const rerender = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.renderNotes()); };
      addEventListener('resize', () => { this.fitFrame(); rerender(); });
      document.addEventListener('scroll', rerender, true);
      document.addEventListener('transitionend', rerender, true);
      document.addEventListener('animationend', rerender, true);
    },
  };

  window.Proto = Proto;
})();
