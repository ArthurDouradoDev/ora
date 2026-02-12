const ReminderSystem = {
    // Dependencies
    storage: null,
    animateModal: null,
    isModalVisible: null,
    prayerSystem: null,
    
    // Data
    prayers: [],
    examData: null,

    // DOM Elements
    elements: {
        angelus: {
            modal: null,
            openBtn: null,
            checkBtn: null
        },
        mercy: {
            modal: null,
            openBtn: null,
            checkBtn: null
        },
        midday: {
            modal: null,
            startBtn: null,
            checkBtn: null
        },
        evening: {
            modal: null,
            startBtn: null,
            checkBtn: null
        },
        rosary: {
            modal: null,
            startBtn: null,
            dismissBtn: null
        }
    },

    init: function(data, deps) {
        this.prayers = data.prayers || [];
        this.examData = data.exam || {};
        
        this.storage = deps.storage;
        this.animateModal = deps.animateModal;
        this.isModalVisible = deps.isModalVisible;
        this.prayerSystem = deps.prayerSystem;

        this.cacheDOM();
        this.bindEvents();
        
        // Start monitoring
        this.startMonitoring();
        
        // Initial checks
        this.checkAngelusTime();
        this.checkMercyTime();
        this.checkMiddayExam();
        this.checkEveningExam();
        
        console.log('[Ora] Reminder System initialized');
    },

    cacheDOM: function() {
        this.elements.angelus.modal = document.getElementById('angelus-reminder');
        this.elements.angelus.openBtn = document.getElementById('open-angelus-btn');
        this.elements.angelus.checkBtn = document.getElementById('check-angelus-btn');

        this.elements.mercy.modal = document.getElementById('mercy-reminder');
        this.elements.mercy.openBtn = document.getElementById('open-mercy-btn');
        this.elements.mercy.checkBtn = document.getElementById('check-mercy-btn');

        this.elements.midday.modal = document.getElementById('midday-reminder');
        this.elements.midday.startBtn = document.getElementById('start-midday-btn');
        this.elements.midday.checkBtn = document.getElementById('check-midday-btn');

        this.elements.evening.modal = document.getElementById('evening-reminder');
        this.elements.evening.startBtn = document.getElementById('start-evening-btn');
        this.elements.evening.checkBtn = document.getElementById('check-evening-btn');

        this.elements.rosary.modal = document.getElementById('rosary-reminder');
        this.elements.rosary.startBtn = document.getElementById('start-rosary-btn');
        this.elements.rosary.dismissBtn = document.getElementById('dismiss-rosary-btn');
    },

    bindEvents: function() {
        // --- Angelus ---
        if (this.elements.angelus.openBtn) {
            this.elements.angelus.openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close reminder
                this.hideModal(this.elements.angelus.modal);
                
                // Open prayer
                const angelusPrayer = this.prayers.find(p => p.id === 'angelus');
                if (angelusPrayer && this.prayerSystem) {
                    this.prayerSystem.openReader(angelusPrayer);
                } else {
                    console.error('[Ora] Angelus prayer not found or PrayerSystem missing');
                }
            });
        }

        if (this.elements.angelus.checkBtn) {
            this.elements.angelus.checkBtn.addEventListener('click', () => {
                const now = new Date();
                const windowName = this.getAngelusWindow(now.getHours());
                if (windowName) {
                    this.markDone('angelus_done_' + windowName);
                }
                this.hideModal(this.elements.angelus.modal);
                showToast('Angelus rezado!', 'success');
            });
        }

        // --- Mercy ---
        if (this.elements.mercy.openBtn) {
            this.elements.mercy.openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideModal(this.elements.mercy.modal);
                // Open Rosary in Mercy Mode
                if (window.RosarySystem) {
                    window.RosarySystem.chapletType = 'misericordia';
                    window.RosarySystem.currentBead = 0; // Reset
                    window.RosarySystem.renderBeads(); // Update beads for disabled ones
                    window.RosarySystem.refreshDisplay();
                    window.RosarySystem.open();
                }
            });
        }

        if (this.elements.mercy.checkBtn) {
            this.elements.mercy.checkBtn.addEventListener('click', () => {
                this.markDone('mercy_done');
                this.hideModal(this.elements.mercy.modal);
                showToast('Terço da Misericórdia rezado!', 'success');
            });
        }

        // --- Midday Exam ---
        if (this.elements.midday.startBtn) {
            this.elements.midday.startBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideModal(this.elements.midday.modal);
                // Trigger exam start in script.js (we might need a callback or event)
                // Integrating tightly: we can dispatch an event or use a callback passed in deps
                // For now, let's dispatch a custom event that script.js listens to
                window.dispatchEvent(new CustomEvent('ora:start-exam', { detail: { type: 'midday' } }));
            });
        }

        if (this.elements.midday.checkBtn) {
            this.elements.midday.checkBtn.addEventListener('click', () => {
                this.markDone('ora_midday_done');
                this.hideModal(this.elements.midday.modal);
                showToast('Exame meridiano marcado como feito!', 'success');
            });
        }

        // --- Evening Exam ---
        if (this.elements.evening.startBtn) {
            this.elements.evening.startBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideModal(this.elements.evening.modal);
                window.dispatchEvent(new CustomEvent('ora:start-exam', { detail: { type: 'night' } }));
            });
        }

        if (this.elements.evening.checkBtn) {
            this.elements.evening.checkBtn.addEventListener('click', () => {
                this.markDone('ora_evening_done');
                this.hideModal(this.elements.evening.modal);
                showToast('Exame noturno registrado!', 'success');
            });
        }

        // --- Rosary Suggestion ---
        if (this.elements.rosary.startBtn) {
            this.elements.rosary.startBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Dispatch event to minimize focus timer if active
                window.dispatchEvent(new CustomEvent('ora:minimize-focus'));

                this.hideModal(this.elements.rosary.modal); // Close reminder immediately

                // Open Rosary with small delay to prevent animation conflicts
                setTimeout(() => {
                    if (window.RosarySystem && typeof window.RosarySystem.open === 'function') {
                        window.RosarySystem.open();
                    } else {
                        const btnRosary = document.getElementById('btn-rosary');
                        if (btnRosary) btnRosary.click();
                    }
                }, 50);
            });
        }

        if (this.elements.rosary.dismissBtn) {
            this.elements.rosary.dismissBtn.addEventListener('click', () => {
                this.hideModal(this.elements.rosary.modal);
            });
        }
    },

    startMonitoring: function() {
        // Check every minute
        setInterval(() => {
            this.checkAngelusTime();
            this.checkMercyTime();
            this.checkMiddayExam();
            this.checkEveningExam();
        }, 60000);
    },

    // --- Helpers ---

    showModal: function(el) {
        if (el && this.animateModal && !this.isModalVisible(el)) {
            this.animateModal(el, true);
        }
    },

    hideModal: function(el) {
        if (el && this.animateModal) {
            this.animateModal(el, false);
        }
    },

    markDone: function(prefix) {
        const todayStr = new Date().toDateString();
        const key = prefix + '_' + todayStr;
        this.storage.setItem(key, 'true');
    },

    isDone: function(prefix) {
        const todayStr = new Date().toDateString();
        const key = prefix + '_' + todayStr;
        return !!this.storage.getItem(key);
    },

    // --- Logic ---

    getAngelusWindow: function(hours) {
        if (hours >= 6 && hours < 8) return 'morning';
        if (hours >= 12 && hours < 14) return 'midday';
        if (hours >= 18 && hours < 21) return 'evening';
        return null;
    },

    checkAngelusTime: function() {
        const now = new Date();
        const hours = now.getHours();
        const windowName = this.getAngelusWindow(hours);

        if (windowName) {
            if (!this.isDone('angelus_done_' + windowName)) {
                this.showModal(this.elements.angelus.modal);
                // Notification (optional, keeping consistent with old logic)
                this.trySendNotification('Hora do Angelus', 'O Anjo do Senhor anunciou a Maria...', windowName);
            } else {
                this.hideModal(this.elements.angelus.modal);
            }
        } else {
            this.hideModal(this.elements.angelus.modal);
        }
    },

    checkMercyTime: function() {
        // If Rosary modal is already open, do not show reminder
        if (this.isModalVisible(document.getElementById('rosary-modal'))) {
            this.hideModal(this.elements.mercy.modal);
            return;
        }

        const hours = new Date().getHours();
        // 15h - 16h
        if (hours === 15) {
            if (!this.isDone('mercy_done')) {
                this.showModal(this.elements.mercy.modal);
            } else {
                this.hideModal(this.elements.mercy.modal);
            }
        } else {
            this.hideModal(this.elements.mercy.modal);
        }
    },

    checkMiddayExam: function() {
        const hours = new Date().getHours();
        // 11h - 14h
        if (hours >= 11 && hours < 14) {
            if (!this.isDone('ora_midday_done')) {
                this.showModal(this.elements.midday.modal);
            }
        } else {
            this.hideModal(this.elements.midday.modal);
        }
    },

    checkEveningExam: function() {
        const hours = new Date().getHours();
        // 18h+
        if (hours >= 18) {
            if (!this.isDone('ora_evening_done')) {
                this.showModal(this.elements.evening.modal);
            }
        } else {
            this.hideModal(this.elements.evening.modal);
        }
    },

    showRosarySuggestion: function() {
        // Only show if not already praying or doing exam
        const rosaryModal = document.getElementById('rosary-modal');
        const examModal = document.getElementById('exam-flow-modal');
        
        const isRosaryOpen = this.isModalVisible(rosaryModal);
        const isExamOpen = this.isModalVisible(examModal);

        if (!isRosaryOpen && !isExamOpen) {
            this.showModal(this.elements.rosary.modal);
            this.playTone();
        }
    },

    trySendNotification: function(title, body, windowName) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        
        const todayStr = new Date().toDateString();
        const key = 'angelus_notif_' + windowName + '_' + todayStr;
        if (this.storage.getItem(key)) return; // Already sent

        try {
            new Notification(title, { body: body, icon: 'assets/icon.png' });
            this.storage.setItem(key, 'true');
        } catch (e) {
            console.warn('[Ora] Notification failed:', e);
        }
    },

    playTone: function() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 528;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.5);
        } catch (e) { /* audio not available */ }
    }
};

window.ReminderSystem = ReminderSystem;
