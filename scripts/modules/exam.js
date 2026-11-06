const ExamSystem = {
    EXAM_LOGS_MAX:1000, draft:null, busy:false,
    async init(data) {
        this.data = data;
        this.draft = await AsyncStorage.get('ora_exam_draft');
        this.cacheDOM(); this.bindEvents();
    },
    cacheDOM() {},
    bindEvents() {
        document.getElementById('btn-exam')?.addEventListener('click', () => this.openExamTypeModal());
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || changes.ora_exam_draft?.newValue !== null || this.busy) return;
            this.draft = null;
            const route = RouterSystem.current();
            if (route.view === 'rezar' && route.path[0] === 'exame' && route.path[1]) RouterSystem.navigate('rezar/exame');
        });
        window.addEventListener('ora:start-exam',e => { if (e.detail?.type) this.startExam(e.detail.type); });
    },
    openExamTypeModal() { RouterSystem.navigate('rezar/exame'); },
    getExamType() { const h = new Date().getHours(); return h >= 6 && h < 11 ? 'morning' : h < 14 && h >= 11 ? 'midday' : h >= 14 && h < 18 ? 'quick' : 'night'; },
    async startExam(type) {
        if (!this.data.exam.types[type]) return;
        const begin = async () => {
            await this.draftQueue;
            const draft = { id:'exam-' + Date.now(),type,step:0,answers:[] };
            if (!await PrayUI.save('ora_exam_draft',draft)) return false;
            this.draft = draft; RouterSystem.navigate('rezar/exame/' + type); return true;
        };
        if (this.draft?.answers?.some(Boolean)) PrayUI.confirm('exam_restart_title','exam_restart_body',begin);
        else await begin();
    },
    async render(path = [], token = RezarSystem.renderId) {
        if (path[0] === 'virtudes') return this.renderVirtues(path[1] === 'editar',token);
        if (this.data.exam.types[path[0]]) {
            if (!this.draft || this.draft.type !== path[0]) {
                this.draft = { id:'exam-' + Date.now(),type:path[0],step:0,answers:[] };
            }
            return this.renderStep();
        }
        const u = PrayUI;
        u.mount(`<div class="pray-wrap pray-narrow">${u.heading(u.text('exam'))}<div class="exam-types">${Object.entries(this.data.exam.types).map(([id,type]) => `<button class="exam-type" data-exam-type="${id}"><span aria-hidden="true">${u.e(type.icon)}</span><b>${u.e(l(type.label))}</b><small>${u.text('stage',{n:1,total:type.questions.length})}</small></button>`).join('')}</div>${this.draft && this.data.exam.types[this.draft.type] ? `<div class="banner info"><p>${u.e(l(this.data.exam.types[this.draft.type].label))}</p>${u.button('exam-resume','resume','btn-aux')}</div>` : ''}<button class="btn btn-aux" data-pray-route="rezar/exame/virtudes">${u.text('virtues')}</button></div>`);
        u.back();
        u.root.querySelectorAll('[data-exam-type]').forEach(button => button.addEventListener('click', () => this.startExam(button.dataset.examType)));
        u.on('exam-resume','click', () => RouterSystem.navigate('rezar/exame/' + this.draft.type));
    },
    renderStep() {
        const u = PrayUI, draft = this.draft, questions = this.data.exam.types[draft.type].questions;
        draft.step = Math.max(0,Math.min(questions.length - 1,Number(draft.step) || 0));
        const q = questions[draft.step], value = draft.answers[draft.step], final = draft.step === questions.length - 1;
        const options = q.type === 'thumbs' ? [{value:'👍',text:t('pray.positive')},{value:'👎',text:t('pray.negative')}] : (q.options || []).map((opt,i) => ({value:i,text:l(opt)}));
        u.mount(`<div class="pray-wrap pray-narrow exam-flow">${u.heading(u.e(l(this.data.exam.types[draft.type].label)),'rezar/exame')}<p class="label">${u.text('stage',{n:draft.step + 1,total:questions.length})}</p><div class="reading-progress" aria-hidden="true"><span style="width:${(draft.step + 1) / questions.length * 100}%"></span></div><h2 id="exam-question" class="reflect">${u.e(l(q.text))}</h2>${q.type === 'text' ? `<label class="field"><span class="sr-only">${u.text('exam_answer')}</span><textarea class="textarea" id="exam-answer" maxlength="5000" aria-describedby="exam-question" placeholder="${u.text('note')}">${u.e(value || '')}</textarea></label>` : `<div class="seg" role="group" aria-labelledby="exam-question">${options.map((opt,i) => `<button data-exam-choice="${i}" aria-pressed="${value === opt.value}">${u.e(opt.text)}</button>`).join('')}</div>`}<p role="status" class="meta" id="exam-status"></p><div class="row">${u.button('exam-previous','previous','btn-quiet',draft.step === 0 ? 'disabled' : '')}${u.button('exam-next',final ? 'finish' : 'next_stage','btn-primary')}</div></div>`);
        u.back('rezar/exame');
        u.on('exam-answer','input',e => { this.draft.answers[draft.step] = e.target.value; return this.saveDraft(); });
        u.root.querySelectorAll('[data-exam-choice]').forEach(button => button.addEventListener('click',async () => {
            this.draft.answers[draft.step] = options[Number(button.dataset.examChoice)].value;
            if (await this.saveDraft()) {
                u.root.querySelectorAll('[data-exam-choice]').forEach(b => b.setAttribute('aria-pressed',b === button));
            }
        }));
        u.on('exam-previous','click',async () => { if (await this.saveDraft(draft.step - 1)) { this.renderStep(); document.getElementById('exam-question').tabIndex = -1; document.getElementById('exam-question').focus(); } });
        u.on('exam-next','click',async () => {
            if (final) await this.finishExam();
            else if (await this.saveDraft(draft.step + 1)) { this.renderStep(); document.getElementById('exam-question').tabIndex = -1; document.getElementById('exam-question').focus(); }
        });
    },
    saveDraft(step = this.draft.step) {
        const snapshot = { ...this.draft,step,answers:[...this.draft.answers] };
        this.draftQueue = (this.draftQueue || Promise.resolve()).then(async () => {
            const ok = await PrayUI.save('ora_exam_draft',snapshot,document.getElementById('exam-status'));
            if (ok && this.draft?.id === snapshot.id) this.draft.step = step;
            return ok;
        });
        return this.draftQueue;
    },
    async finishExam() {
        if (this.busy) return;
        this.busy = true;
        try {
            if (!await this.saveDraft()) return;
            const now = new Date(), stored = await AsyncStorage.get('ora_exam_logs',[]);
            let logs = typeof stored === 'string' ? JSON.parse(stored) : stored;
            if (!Array.isArray(logs)) logs = [];
            const log = {id:this.draft.id,type:this.draft.type,date:now.toISOString(),answers:[...this.draft.answers]};
            if (!logs.some(x => x.id === log.id)) logs.push(log);
            // One confirmed transaction: no completion flag unless the log is also saved.
            await chrome.storage.local.set({ora_exam_logs:logs.slice(-this.EXAM_LOGS_MAX),['ora_exam_done_' + now.toDateString()]:'true',ora_exam_draft:null});
            const type = this.draft.type; this.draft = null;
            if (window.PracticeLog) PracticeLog.record('exam', { ref: log.id });
            // Aberto pelo ritual da noite: volta para o Encerramento, que conclui o dia
            if (window.RitualsSystem && RitualsSystem.resumeAfterExam(type)) { showToast(t('pray.exam_done')); return; }
            if (window.ReminderSystem && ['night','midday'].includes(type)) await ReminderSystem.markDoneById(type === 'night' ? 'closeDay' : 'midday');
            RouterSystem.navigate('rezar'); showToast(t('pray.exam_done'));
        } catch (err) { console.error(err); PrayUI.error(); }
        finally { this.busy = false; }
    },
    async loadVirtues() {
        const saved = await AsyncStorage.get('ora_virtues_list');
        try { return saved ? (typeof saved === 'string' ? JSON.parse(saved) : saved) : this.data.exam.defaultVirtues.map(v => ({...v})); }
        catch (_) { return this.data.exam.defaultVirtues.map(v => ({...v})); }
    },
    async renderVirtues(editing,token = RezarSystem.renderId) {
        const u = PrayUI, virtues = await this.loadVirtues(), logKey = 'ora_virtues_log_' + new Date().toDateString();
        let log = await AsyncStorage.get(logKey,{});
        try { if (typeof log === 'string') log = JSON.parse(log); } catch (_) { log = {}; }
        if (token !== RezarSystem.renderId) return;
        u.mount(`<div class="pray-wrap pray-narrow">${u.heading(u.text(editing ? 'edit_virtues' : 'virtues'))}<ul class="virtue-list">${virtues.map((v,index) => `<li><span>${u.e(l(v.name))}</span>${editing ? `<button class="btn btn-quiet" data-remove-virtue="${index}" aria-label="${u.text('remove',{name:l(v.name)})}">×</button>` : `<div class="seg" role="group" aria-label="${u.e(l(v.name))}">${['success','fail'].map(status => `<button data-virtue="${index}" data-status="${status}" aria-pressed="${log[v.id] === status}">${u.text(status === 'success' ? 'practiced' : 'struggled')}</button>`).join('')}</div>`}</li>`).join('')}</ul>${editing ? `<form id="virtue-add" class="row"><label class="field"><span>${u.text('new_virtue')}</span><input class="input" required id="virtue-name" maxlength="80"></label><button class="btn btn-primary" type="submit">${u.text('add')}</button></form>` : `<button class="btn btn-aux" data-pray-route="rezar/exame/virtudes/editar">${u.text('edit_virtues')}</button>`}<p id="virtue-status" class="meta" role="status"></p></div>`);
        u.back(editing ? 'rezar/exame/virtudes' : 'rezar/exame');
        u.root.querySelectorAll('[data-virtue]').forEach(button => button.addEventListener('click',async () => {
            if (this.busy) return; this.busy = true;
            try {
                const v = virtues[Number(button.dataset.virtue)], status = button.dataset.status;
                const next = { ...log }; if (next[v.id] === status) delete next[v.id]; else next[v.id] = status;
                if (await u.save(logKey,JSON.stringify(next),document.getElementById('virtue-status'))) {
                    log = next;
                    u.root.querySelectorAll(`[data-virtue="${button.dataset.virtue}"]`).forEach(b => b.setAttribute('aria-pressed',log[v.id] === b.dataset.status));
                }
            } finally { this.busy = false; }
        }));
        u.root.querySelectorAll('[data-remove-virtue]').forEach(button => button.addEventListener('click', () => {
            const index = Number(button.dataset.removeVirtue);
            u.confirm('remove_title','remove_body',async () => {
                if (!await u.save('ora_virtues_list',JSON.stringify(virtues.filter((_,i) => i !== index)))) return false;
                await this.renderVirtues(true); return true;
            });
        }));
        u.on('virtue-add','submit',async e => {
            e.preventDefault();
            const name = document.getElementById('virtue-name').value.trim(); if (!name) return;
            const next = [...virtues,{id:'custom-' + Date.now(),name,icon:'ph-star'}];
            if (await u.save('ora_virtues_list',JSON.stringify(next),document.getElementById('virtue-status'))) { await this.renderVirtues(true); document.getElementById('virtue-name').focus(); }
        });
    }
};
window.ExamSystem = ExamSystem;
