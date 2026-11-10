// Confirmation is browser-owned. Keep its listener only while leaving could
// lose an edit, leave a focus session, or interrupt this tab's music.
const LeaveGuard = {
    fields: new Map(),
    editors: new Map(),
    pendingWrites: 0,
    listening: false,
    audible: false,
    tabId: null,
    sequence: 0,

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.beforeUnload = event => {
            if (!this.shouldConfirm()) return;
            event.preventDefault();
            event.returnValue = true;
        };
        const update = () => this.refresh();
        const afterEvent = () => queueMicrotask(update);
        document.addEventListener('focusin', event => this.watchField(event.target), true);
        document.addEventListener('beforeinput', event => this.watchField(event.target), true);
        for (const type of ['input', 'change', 'click']) document.addEventListener(type, afterEvent, true);
        window.addEventListener('ora:pomodoro', update);
        window.addEventListener('ora:tasks-error', update);
        // Covers saved/cancelled editors, rerenders and player start/stop.
        this.observer = new MutationObserver(update);
        this.observer.observe(document.body, { subtree: true, childList: true, attributes: true,
            attributeFilter: ['hidden', 'inert', 'aria-pressed', 'src'] });
        // The browser reports audio from cross-origin YouTube/Spotify frames too.
        // An open or minimized player alone is not evidence of playback.
        if (chrome.tabs?.getCurrent) {
            chrome.tabs.onUpdated.addListener((id, changes) => {
                if (id === this.tabId && typeof changes.audible === 'boolean') {
                    this.audible = changes.audible;
                    this.refresh();
                }
            });
            chrome.tabs.getCurrent().then(tab => {
                if (tab) { this.tabId = tab.id; this.audible = !!tab.audible; this.refresh(); }
            }).catch(() => {});
        }
        this.refresh();
    },

    watchField(element) {
        if (!element || this.fields.has(element)) return;
        const id = element.id;
        const transient = ['tasks-add-input', 'task-routine-input',
            'playlist-input', 'shortcut-name', 'shortcut-url', 'custom-profile-name', 'virtue-name'];
        let savedValue = null, currentSaved = null, trim = false;
        if (id === 'setting-longPause') {
            currentSaved = () => String(window.FocusSystem?.settings.longPause ?? element.value);
        } else if (id === 'settings-user-name') {
            trim = true;
            savedValue = (key, value) => key === 'ora_user_name' ? String(value) : undefined;
        } else if (id === 'today-intent-input') {
            trim = true;
            savedValue = (key, value) => key === 'ora_day_intention'
                ? SessionsCore.dayIntention(value, new Date()) : undefined;
        } else if (id === 'exam-answer') {
            savedValue = (key, value) => key === 'ora_exam_draft' && value?.id === window.ExamSystem?.draft?.id
                ? String(value.answers[ExamSystem.draft.step] ?? '') : undefined;
        } else if (id === 'lectio-note') {
            savedValue = (key, value) => key === 'ora_lectio_' + window.ReaderSystem?.lectioDate
                ? String(value.notes[ReaderSystem.lectio.step] ?? '') : undefined;
        } else if (!transient.includes(id)) return; // Search/filter/preferences are not drafts.
        const read = () => trim ? element.value.trim() : element.value;
        this.fields.set(element, { read, baseline: read(), savedValue, currentSaved, lastSaved: 0, failed: false });
    },

    acceptField(element) {
        const field = this.fields.get(element);
        if (!field) return;
        field.baseline = field.read();
        field.failed = false;
        this.refresh();
    },

    snapshot(root) {
        return JSON.stringify(Array.from(root.querySelectorAll('input, textarea, select, button[aria-pressed]'))
            .map(element => element.tagName === 'BUTTON' ? element.getAttribute('aria-pressed')
                : ['checkbox', 'radio'].includes(element.type) ? element.checked : element.value));
    },

    watchEditor(key, owner, read, active) {
        if (this.editors.get(key)?.owner === owner) return;
        this.editors.set(key, { owner, read, active, baseline: read() });
        // A newly rendered editor is appended by its caller in this same turn.
        queueMicrotask(() => this.refresh());
    },

    savedEditor(key, baseline) {
        const editor = this.editors.get(key);
        if (editor) editor.baseline = baseline ?? editor.read();
        this.refresh();
    },

    beginSave(key, value) {
        const token = { sequence: ++this.sequence, fields: [] };
        for (const [element, field] of this.fields) {
            if (!element.isConnected && !field.failed) continue;
            const saved = field.savedValue?.(key, value);
            if (saved !== undefined) token.fields.push({ field, saved });
        }
        this.pendingWrites++;
        this.refresh();
        return token;
    },

    endSave(token, success) {
        if (!token) return;
        this.pendingWrites--;
        for (const { field, saved } of token.fields) {
            if (token.sequence < field.lastSaved) continue;
            if (success) {
                field.baseline = saved;
                field.lastSaved = token.sequence;
                field.failed = false;
            } else field.failed = true;
        }
        // Callers may clear an add field or replace an editor after await returns.
        setTimeout(() => this.refresh(), 0);
    },

    hasEdits() {
        for (const [element, field] of this.fields) {
            const discarded = element.id === 'custom-profile-name'
                && !window.DialogSystem?.isOpen('protection-add-dialog');
            if (discarded || (!element.isConnected && !field.failed)) { this.fields.delete(element); continue; }
            if (field.read() !== (field.currentSaved ? field.currentSaved() : field.baseline)) return true;
        }
        for (const [key, editor] of this.editors) {
            if (!editor.active()) { this.editors.delete(key); continue; }
            if (editor.read() !== editor.baseline) return true;
        }
        return !!window.TaskSystem?.pendingSave || !!(window.Blocker?.isNewDraft && Blocker.draftProfile);
    },

    shouldConfirm() {
        const state = window.FocusSystem?.state;
        const focus = state?.phase === 'focus' && !!state.session
            && (!state.isRunning || !state.expectedEndTime || state.expectedEndTime > Date.now());
        const music = this.audible && !!window.SoundSystem?.active;
        return this.pendingWrites > 0 || this.hasEdits() || focus || music;
    },

    refresh() {
        const needed = this.shouldConfirm();
        if (needed === this.listening) return;
        window[needed ? 'addEventListener' : 'removeEventListener']('beforeunload', this.beforeUnload);
        this.listening = needed;
    }
};
window.LeaveGuard = LeaveGuard;
