
const ExamSystem = {
    data: null,
    config: {},
    state: {
        currentExamType: null,
        currentExamStep: 0,
        examAnswers: []
    },

    data: null,
    // config: removed, dependencies are global

    init(data) {
        this.data = data;
        // Global dependencies: SafeStorage, animateModal, isModalVisible, showToast
        
        console.log('[Ora] ExamSystem initializing...');

        this.cacheDOM();
        this.bindEvents();
        this.updateExamButtonTheme();
        
        // Start theme update interval
        setInterval(() => this.updateExamButtonTheme(), 60000);
        
        // Listen for external start exam events
        window.addEventListener('ora:start-exam', (e) => {
            if (e.detail && e.detail.type) {
                this.startExam(e.detail.type);
            }
        });

        console.log('[Ora] ExamSystem initialized');
    },

    cacheDOM() {
        this.dom = {
            btnExam: document.getElementById('btn-exam'),
            examTypeModal: document.getElementById('exam-type-modal'),
            closeExamTypeBtn: document.getElementById('close-exam-type-btn'),
            examTypeGrid: document.getElementById('exam-type-grid'),
            examSuggestion: document.querySelector('.exam-suggestion'),
            examStreakText: document.getElementById('exam-streak-text'),
            openVirtuesBtn: document.getElementById('open-virtues-btn'),

            examFlowModal: document.getElementById('exam-flow-modal'),
            examFlowTitle: document.getElementById('exam-flow-title'),
            closeExamFlowBtn: document.getElementById('close-exam-flow-btn'),
            examFlowBackBtn: document.getElementById('exam-flow-back-btn'),
            examProgressFill: document.querySelector('.exam-progress-fill'),
            examQuestionText: document.querySelector('.exam-question-text'),
            examInputArea: document.querySelector('.exam-input-area'),
            examPrevBtn: document.getElementById('exam-prev-btn'),
            examNextBtn: document.getElementById('exam-next-btn'),
            examStepCounter: document.querySelector('.exam-step-counter'),

            pomodoroCheckin: document.getElementById('pomodoro-checkin'),
            closeCheckinBtn: document.getElementById('close-checkin-btn'),
            checkinOptions: document.querySelector('.checkin-options'),

            microPrayerModal: document.getElementById('micro-prayer-modal'),
            closeMicroPrayerBtn: document.getElementById('close-micro-prayer-btn'),
            microPrayerBackBtn: document.getElementById('micro-prayer-back-btn'),
            microPrayerOptionsEl: document.getElementById('micro-prayer-options'),
            microPrayerTextEl: document.getElementById('micro-prayer-text'),

            virtuesModal: document.getElementById('virtues-modal'),
            closeVirtuesBtn: document.getElementById('close-virtues-btn'),
            virtuesBackBtn: document.getElementById('virtues-back-btn'),
            virtuesList: document.getElementById('virtues-list'),
            virtuesSummaryText: document.getElementById('virtues-summary-text'),
            editVirtuesBtn: document.getElementById('edit-virtues-btn'),

            virtuesEditor: document.getElementById('virtues-editor'),
            closeVirtuesEditorBtn: document.getElementById('close-virtues-editor-btn'),
            virtuesEditorBackBtn: document.getElementById('virtues-editor-back-btn'),
            virtuesEditorList: document.getElementById('virtues-editor-list'),
            newVirtueInput: document.getElementById('new-virtue-input'),
            addVirtueBtn: document.getElementById('add-virtue-btn')
        };
    },

    bindEvents() {
        const d = this.dom;

        if (d.btnExam) {
            d.btnExam.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(d.examTypeModal)) {
                    this.openExamTypeModal();
                } else {
                    this.closeExamTypeModal();
                }
            });
        }

        if (d.closeExamTypeBtn) d.closeExamTypeBtn.addEventListener('click', () => this.closeExamTypeModal());
        if (d.closeExamFlowBtn) d.closeExamFlowBtn.addEventListener('click', () => this.closeExamFlow());
        
        if (d.examFlowBackBtn) {
            d.examFlowBackBtn.addEventListener('click', () => {
                this.closeExamFlow();
                this.openExamTypeModal();
            });
        }

        if (d.examNextBtn) d.examNextBtn.addEventListener('click', () => this.nextExamStep());
        if (d.examPrevBtn) d.examPrevBtn.addEventListener('click', () => this.prevExamStep());

        // Close on click outside
        // Close on click outside
        document.addEventListener('click', (e) => {
            if (isModalVisible(d.examTypeModal) &&
                !d.examTypeModal.contains(e.target) &&
                !d.btnExam.contains(e.target)) {
                this.closeExamTypeModal();
            }
        });

        // Pomodoro Checkin
        if (d.closeCheckinBtn) d.closeCheckinBtn.addEventListener('click', () => animateModal(d.pomodoroCheckin, false));
        if (d.closeMicroPrayerBtn) d.closeMicroPrayerBtn.addEventListener('click', () => animateModal(d.microPrayerModal, false));
        if (d.microPrayerBackBtn) d.microPrayerBackBtn.addEventListener('click', () => {
            d.microPrayerTextEl.style.display = 'none';
            d.microPrayerOptionsEl.style.display = 'grid';
        });

        // Virtues
        if (d.openVirtuesBtn) d.openVirtuesBtn.addEventListener('click', () => this.openVirtuesModal());
        if (d.closeVirtuesBtn) d.closeVirtuesBtn.addEventListener('click', () => this.closeVirtuesModal());
        if (d.virtuesBackBtn) {
            d.virtuesBackBtn.addEventListener('click', () => {
                this.closeVirtuesModal();
                this.openExamTypeModal();
            });
        }

        if (d.editVirtuesBtn) d.editVirtuesBtn.addEventListener('click', () => this.openVirtuesEditor());
        if (d.closeVirtuesEditorBtn) d.closeVirtuesEditorBtn.addEventListener('click', () => this.closeVirtuesEditor());
        if (d.virtuesEditorBackBtn) {
            d.virtuesEditorBackBtn.addEventListener('click', () => {
                this.closeVirtuesEditor();
                this.openVirtuesModal();
            });
        }
        if (d.addVirtueBtn) d.addVirtueBtn.addEventListener('click', () => this.addNewVirtue());
        if (d.newVirtueInput) {
            d.newVirtueInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.addNewVirtue();
            });
        }
    },

    // --- Logic ---

    getExamType() {
        const h = new Date().getHours();
        if (h >= 6 && h < 11) return 'morning';
        if (h >= 11 && h < 14) return 'midday';
        if (h >= 14 && h < 18) return 'quick';
        return 'night';
    },

    updateExamButtonTheme() {
        if (!this.dom.btnExam) return;
        const type = this.getExamType();
        this.dom.btnExam.classList.remove('exam-morning', 'exam-midday', 'exam-evening');
        if (type === 'morning') this.dom.btnExam.classList.add('exam-morning');
        else if (type === 'midday') this.dom.btnExam.classList.add('exam-midday');
        else this.dom.btnExam.classList.add('exam-evening');
    },

    getWeeklyExamCount() {
        let count = 0;
        const now = new Date();
        const dayOfWeek = now.getDay();
        for (let i = 0; i <= dayOfWeek; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            d.setDate(d.getDate() - i);
            const key = 'ora_exam_done_' + d.toDateString();
            if (SafeStorage.getItem(key)) count++;
        }
        return count;
    },

    openExamTypeModal() {
        const { examTypeGrid, examSuggestion, examStreakText, examTypeModal } = this.dom;
        const { exam } = this.data;
        
        examTypeGrid.innerHTML = '';
        const suggested = this.getExamType();

        if (examSuggestion) examSuggestion.textContent = `Sugestão: ${exam.types[suggested].icon} ${exam.types[suggested].label}`;

        Object.keys(exam.types).forEach(key => {
            const type = exam.types[key];
            const card = document.createElement('div');
            card.className = 'exam-type-card' + (key === suggested ? ' suggested' : '');
            card.innerHTML = `
                <span class="exam-type-icon">${type.icon}</span>
                <span class="exam-type-label">${type.label}</span>
                <span class="exam-type-count">${type.questions.length} ${type.questions.length === 1 ? 'pergunta' : 'perguntas'}</span>
            `;
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startExam(key);
            });
            examTypeGrid.appendChild(card);
        });

        const weekCount = this.getWeeklyExamCount();
        if (examStreakText) examStreakText.textContent = `${weekCount} exame${weekCount !== 1 ? 's' : ''} esta semana`;

        animateModal(examTypeModal, true);
    },

    closeExamTypeModal() {
        animateModal(this.dom.examTypeModal, false);
    },

    startExam(type) {
        this.state.currentExamType = type;
        this.state.currentExamStep = 0;
        this.state.examAnswers = new Array(this.data.exam.types[type].questions.length).fill('');
        this.closeExamTypeModal();

        const weekCount = this.getWeeklyExamCount();
        if (this.dom.examStreakText) this.dom.examStreakText.textContent = `${weekCount} exame${weekCount !== 1 ? 's' : ''} esta semana`;

        animateModal(this.dom.examFlowModal, true); // Should open flow modal, not typemodal again? Or wait, startExam opens the questions.
        // The original code in 231 said animateModal(examTypeModal, true). That seems wrong if we just closed it.
        // It likely meant opening examFlowModal.
        this.renderExamStep();
    },

    renderExamStep() {
        const { currentExamType, currentExamStep, examAnswers } = this.state;
        const questions = this.data.exam.types[currentExamType].questions;
        const q = questions[currentExamStep];
        const total = questions.length;

        // Progress bar
        this.dom.examProgressFill.style.width = `${((currentExamStep + 1) / total) * 100}%`;

        // Counter
        this.dom.examStepCounter.textContent = `${currentExamStep + 1} / ${total}`;

        // Question
        this.dom.examQuestionText.textContent = q.text;

        // Input area
        this.dom.examInputArea.innerHTML = '';

        if (q.type === 'text') {
            const textarea = document.createElement('textarea');
            textarea.className = 'exam-textarea';
            textarea.placeholder = 'Escreva aqui...';
            textarea.value = examAnswers[currentExamStep] || '';
            textarea.addEventListener('input', (e) => {
                examAnswers[currentExamStep] = e.target.value;
            });
            this.dom.examInputArea.appendChild(textarea);
            setTimeout(() => textarea.focus(), 100);
        } else if (q.type === 'thumbs') {
            const container = document.createElement('div');
            container.className = 'exam-thumbs';
            ['👍', '👎'].forEach(emoji => {
                const btn = document.createElement('button');
                btn.className = 'exam-emoji-btn' + (examAnswers[currentExamStep] === emoji ? ' active' : '');
                btn.textContent = emoji;
                btn.addEventListener('click', () => {
                    examAnswers[currentExamStep] = emoji;
                    this.renderExamStep();
                });
                container.appendChild(btn);
            });
            this.dom.examInputArea.appendChild(container);
        } else if (q.type === 'emoji') {
            const container = document.createElement('div');
            container.className = 'exam-emoji-row';
            (q.options || []).forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'exam-emoji-btn' + (examAnswers[currentExamStep] === opt ? ' active' : '');
                btn.textContent = opt;
                btn.addEventListener('click', () => {
                    examAnswers[currentExamStep] = opt;
                    this.renderExamStep();
                });
                container.appendChild(btn);
            });
            this.dom.examInputArea.appendChild(container);
        }

        // Nav button states
        this.dom.examPrevBtn.style.visibility = currentExamStep > 0 ? 'visible' : 'hidden';
        // Last step: show check icon instead of arrow
        if (currentExamStep === total - 1) {
            this.dom.examNextBtn.innerHTML = '<i class="ph ph-check"></i>';
            this.dom.examNextBtn.title = 'Concluir';
        } else {
            this.dom.examNextBtn.innerHTML = '<i class="ph ph-caret-right"></i>';
            this.dom.examNextBtn.title = 'Próximo';
        }
    },

    nextExamStep() {
        const questions = this.data.exam.types[this.state.currentExamType].questions;
        if (this.state.currentExamStep < questions.length - 1) {
            this.state.currentExamStep++;
            this.renderExamStep();
        } else {
            this.finishExam();
        }
    },

    prevExamStep() {
        if (this.state.currentExamStep > 0) {
            this.state.currentExamStep--;
            this.renderExamStep();
        }
    },

    finishExam() {
        const { currentExamType, examAnswers } = this.state;
        
        // Save as done today
        const todayStr = new Date().toDateString();
        SafeStorage.setItem('ora_exam_done_' + todayStr, 'true');

        // Also mark the corresponding reminder as done
        if (currentExamType === 'night') {
            SafeStorage.setItem('ora_evening_done_' + todayStr, 'true');
            if (window.ReminderSystem) window.ReminderSystem.hideModal(document.getElementById('evening-reminder'));
        } else if (currentExamType === 'midday') {
            SafeStorage.setItem('ora_midday_done_' + todayStr, 'true');
            if (window.ReminderSystem) window.ReminderSystem.hideModal(document.getElementById('midday-reminder'));
        }

        // Save exam log
        const log = {
            type: currentExamType,
            date: new Date().toISOString(),
            answers: examAnswers
        };
        try {
            let logs = JSON.parse(SafeStorage.getItem('ora_exam_logs') || '[]');
            logs.push(log);
            // Keep last 30 entries
            if (logs.length > 30) logs = logs.slice(-30);
            SafeStorage.setItem('ora_exam_logs', JSON.stringify(logs));
        } catch (e) { /* ignore */ }

        animateModal(this.dom.examFlowModal, false);
        showToast('Exame concluído! Deus te abençoe. 🙏', 'success');
        this.state.currentExamType = null;
    },

    closeExamFlow() {
        animateModal(this.dom.examFlowModal, false);
        this.state.currentExamType = null;
    },

    // --- Pomodoro Check-in ---

    showPomodoroCheckin() {
        const { checkinOptions, pomodoroCheckin } = this.dom;
        
        checkinOptions.innerHTML = '';
        const options = this.data.exam.pomodoroCheckin.options;

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'checkin-emoji-btn';
            btn.innerHTML = `<span class="checkin-emoji">${opt.emoji}</span><span class="checkin-label">${opt.label}</span>`;
            btn.addEventListener('click', () => {
                animateModal(pomodoroCheckin, false);
                if (opt.id === 'heavy') {
                    this.showMicroPrayerOptions();
                } else {
                    showToast(`${opt.emoji} ${opt.label} — que bom!`, 'success');
                }
            });
            checkinOptions.appendChild(btn);
        });

        animateModal(pomodoroCheckin, true);
    },

    showMicroPrayerOptions() {
        const { microPrayerOptionsEl, microPrayerTextEl, microPrayerModal } = this.dom;
        
        microPrayerOptionsEl.innerHTML = '';
        microPrayerTextEl.style.display = 'none';
        microPrayerOptionsEl.style.display = 'grid';

        this.data.exam.pomodoroCheckin.microPrayers.forEach(mp => {
            const card = document.createElement('div');
            card.className = 'micro-prayer-card';
            card.innerHTML = `
                <i class="ph ${mp.icon}"></i>
                <span>${mp.label}</span>
            `;
            card.addEventListener('click', () => {
                let text = mp.text;
                // Resolve prayer reference
                if (text.startsWith('prayer:')) {
                    const prayerId = text.split(':')[1];
                    const prayer = this.data.prayers.find(p => p.id === prayerId);
                    text = prayer ? prayer.text.pt : '';
                }
                microPrayerOptionsEl.style.display = 'none';
                microPrayerTextEl.textContent = text;
                microPrayerTextEl.style.display = 'block';
            });
            microPrayerOptionsEl.appendChild(card);
        });

        animateModal(microPrayerModal, true);
    },

    // --- Virtues Checklist ---

    loadVirtues() {
        try {
            const saved = SafeStorage.getItem('ora_virtues_list');
            if (saved) return JSON.parse(saved);
        } catch (e) { /* use defaults */ }
        return this.data.exam.defaultVirtues.map(v => ({ ...v }));
    },

    saveVirtues(virtues) {
        SafeStorage.setItem('ora_virtues_list', JSON.stringify(virtues));
    },

    getVirtueLog() {
        const todayStr = new Date().toDateString();
        try {
            const saved = SafeStorage.getItem('ora_virtues_log_' + todayStr);
            if (saved) return JSON.parse(saved);
        } catch (e) { /* ignore */ }
        return {};
    },

    saveVirtueLog(log) {
        const todayStr = new Date().toDateString();
        SafeStorage.setItem('ora_virtues_log_' + todayStr, JSON.stringify(log));
    },

    openVirtuesModal() {
        this.closeExamTypeModal();
        this.renderVirtuesList();
        animateModal(this.dom.virtuesModal, true);
    },

    closeVirtuesModal() {
        animateModal(this.dom.virtuesModal, false);
    },

    renderVirtuesList() {
        const virtues = this.loadVirtues();
        const log = this.getVirtueLog();
        const { virtuesList, virtuesSummaryText } = this.dom;
        
        virtuesList.innerHTML = '';

        let practiced = 0;
        let total = virtues.length;

        virtues.forEach(v => {
            const status = log[v.id]; // 'success', 'fail', or undefined
            const card = document.createElement('div');
            card.className = 'virtue-card' + (status ? ` virtue-${status}` : '');
            card.innerHTML = `
                <div class="virtue-info">
                    <i class="ph ${v.icon}"></i>
                    <span>${v.name}</span>
                </div>
                <div class="virtue-actions">
                    <button class="virtue-btn virtue-success-btn ${status === 'success' ? 'active' : ''}" title="Pratiquei"><i class="ph ph-check"></i></button>
                    <button class="virtue-btn virtue-fail-btn ${status === 'fail' ? 'active' : ''}" title="Falhei"><i class="ph ph-x"></i></button>
                </div>
            `;

            const successBtn = card.querySelector('.virtue-success-btn');
            const failBtn = card.querySelector('.virtue-fail-btn');

            successBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentLog = this.getVirtueLog();
                currentLog[v.id] = currentLog[v.id] === 'success' ? undefined : 'success';
                if (currentLog[v.id] === undefined) delete currentLog[v.id];
                this.saveVirtueLog(currentLog);
                this.renderVirtuesList();
            });

            failBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentLog = this.getVirtueLog();
                currentLog[v.id] = currentLog[v.id] === 'fail' ? undefined : 'fail';
                if (currentLog[v.id] === undefined) delete currentLog[v.id];
                this.saveVirtueLog(currentLog);
                this.renderVirtuesList();
            });

            if (status === 'success') practiced++;
            virtuesList.appendChild(card);
        });

        if (virtuesSummaryText) virtuesSummaryText.textContent = `${practiced}/${total} virtudes praticadas hoje`;
    },

    // --- Virtues Editor ---

    openVirtuesEditor() {
        animateModal(this.dom.virtuesModal, false);
        this.renderVirtuesEditor();
        animateModal(this.dom.virtuesEditor, true);
    },

    closeVirtuesEditor() {
        animateModal(this.dom.virtuesEditor, false);
    },

    renderVirtuesEditor() {
        const virtues = this.loadVirtues();
        const { virtuesEditorList } = this.dom;
        virtuesEditorList.innerHTML = '';

        virtues.forEach(v => {
            const item = document.createElement('div');
            item.className = 'virtues-editor-item';
            item.innerHTML = `
                <i class="ph ${v.icon}"></i>
                <span>${v.name}</span>
                <button class="icon-btn-sm virtue-remove-btn" title="Remover"><i class="ph ph-trash"></i></button>
            `;
            item.querySelector('.virtue-remove-btn').addEventListener('click', () => {
                const updated = this.loadVirtues().filter(vv => vv.id !== v.id);
                this.saveVirtues(updated);
                this.renderVirtuesEditor();
            });
            virtuesEditorList.appendChild(item);
        });
    },

    addNewVirtue() {
        const { newVirtueInput } = this.dom;
        const name = newVirtueInput.value.trim();
        if (!name) return;

        const virtues = this.loadVirtues();
        virtues.push({
            id: 'custom-' + Date.now(),
            name: name,
            icon: 'ph-star'
        });
        this.saveVirtues(virtues);
        newVirtueInput.value = '';
        this.renderVirtuesEditor();
        showToast(`"${name}" adicionada!`, 'success');
    }
};

window.ExamSystem = ExamSystem;
