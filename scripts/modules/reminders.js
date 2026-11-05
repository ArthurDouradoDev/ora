const ReminderSystem = {
    // Um único espaço de convite em Hoje (Começar o dia, Angelus, Terço da
    // Misericórdia, exame do meio-dia, Encerrar o dia, oração ao abrir o
    // navegador), com "Agora não". A escolha do convite é de RemindersCore; esta
    // camada lê as preferências, o que já foi atendido e os rituais já feitos
    // (RitualsSystem), e avisa Hoje ('ora:invite').
    // Dependencies: AsyncStorage, RemindersCore, SettingsSystem, PrayerSystem,
    // RosarySystem, ExamSystem, RitualsSystem.

    HANDLED_KEY: 'ora_invites_handled',
    CARLO_SESSION_KEY: 'carlo_acutis_shown', // chrome.storage.session

    prayers: [],
    handled: {},
    carloPending: false,
    sessionActive: false,
    current: null,

    init: async function(data) {
        this.prayers = data.prayers || [];
        this.handled = (await AsyncStorage.get(this.HANDLED_KEY, {})) || {};

        // Oração para usar a internet: uma vez por sessão do navegador, depois do onboarding
        try {
            const onboardingDone = await AsyncStorage.get('ora_onboarding_done', false);
            const session = await chrome.storage.session.get([this.CARLO_SESSION_KEY]);
            this.carloPending = !!onboardingDone && !session[this.CARLO_SESSION_KEY];
        } catch (e) {
            this.carloPending = false;
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[this.HANDLED_KEY]) {
                this.handled = changes[this.HANDLED_KEY].newValue || {};
                this.refresh();
            }
            if (area === 'session' && changes[this.CARLO_SESSION_KEY] && changes[this.CARLO_SESSION_KEY].newValue) {
                this.carloPending = false;
                this.refresh();
            }
        });
        window.addEventListener('ora:settings-changed', () => this.refresh());

        // Os horários mudam com o relógio
        setInterval(() => this.refresh(), 60000);
        this.refresh();
        console.log('[Ora] Reminder System initialized');
    },

    enabledMap: function() {
        const s = window.SettingsSystem;
        const on = (key) => !s || s.isReminderEnabled(key);
        return { morning: on('morning'), angelus: on('angelus'), mercy: on('mercy'), midday: on('midday'), evening: on('evening'), carlo: on('carlo') };
    },

    // Hoje informa se há foco ou pausa em andamento (nenhum convite)
    setSessionActive: function(active) {
        if (this.sessionActive === active) return;
        this.sessionActive = active;
        this.refresh();
    },

    refresh: function() {
        const invite = RemindersCore.pickInvite({
            now: new Date(),
            enabled: this.enabledMap(),
            handled: this.handled,
            carloPending: this.carloPending,
            sessionActive: this.sessionActive,
            skip: window.RitualsSystem ? RitualsSystem.hiddenInvites() : []
        });
        // O texto do botão muda quando há um ritual começado ("Continuar")
        if (invite) invite.resume = !!(window.RitualsSystem && this.ritualKind(invite.id) && RitualsSystem.hasDraft(this.ritualKind(invite.id)));
        const changed = JSON.stringify(invite) !== JSON.stringify(this.current);
        this.current = invite;
        if (changed) {
            window.dispatchEvent(new CustomEvent('ora:invite', { detail: invite }));
            if (invite && invite.id === 'angelus') this.trySendNotification(invite);
        }
    },

    ritualKind: function(id) {
        return id === 'morning' ? 'manha' : (id === 'closeDay' ? 'noite' : null);
    },

    // Texto e ícone de cada convite
    describe: function(invite) {
        if (!invite) return null;
        const map = {
            morning: { icon: 'ph-sun-horizon', go: 'invites.start' },
            angelus: { icon: 'ph-bell-ringing', go: 'invites.pray' },
            mercy: { icon: 'ph-drop', go: 'invites.pray' },
            midday: { icon: 'ph-sun-horizon', go: 'invites.start' },
            closeDay: { icon: 'ph-moon-stars', go: 'invites.start' },
            carlo: { icon: 'ph-laptop', go: 'invites.pray' }
        };
        const d = map[invite.id];
        return {
            icon: d.icon,
            title: t(`invites.${invite.id}_title`),
            meta: t(`invites.${invite.id}_meta`),
            go: t(invite.resume ? 'invites.continue' : d.go)
        };
    },

    // "Agora não" (ou feito): vale até o próximo horário do convite
    dismiss: async function(invite) {
        if (!invite) return;
        if (invite.id === 'carlo') {
            this.carloPending = false;
            try { await chrome.storage.session.set({ [this.CARLO_SESSION_KEY]: true }); } catch (e) { /* sem session storage */ }
        } else {
            this.handled = RemindersCore.dismiss(this.handled, invite, new Date());
            await AsyncStorage.set(this.HANDLED_KEY, this.handled);
        }
        this.refresh();
    },

    // Marca pelo id (ex.: o exame da noite concluído por outro caminho)
    markDoneById: async function(id) {
        this.handled = RemindersCore.dismissById(this.handled, id, new Date());
        await AsyncStorage.set(this.HANDLED_KEY, this.handled);
        this.refresh();
    },

    act: async function(invite, opener) {
        if (!invite) return;
        // Rituais: o convite fica até o ritual ser concluído (sair guarda o rascunho)
        const kind = this.ritualKind(invite.id);
        if (kind && window.RitualsSystem) {
            RitualsSystem.open(kind, { opener });
            return;
        }
        await this.dismiss(invite);
        const prayer = (id) => this.prayers.find(p => p.id === id);
        switch (invite.id) {
            case 'angelus':
                if (window.PrayerSystem) PrayerSystem.openReader(prayer('angelus'));
                break;
            case 'carlo':
                if (window.PrayerSystem) PrayerSystem.openReader(prayer('sao-carlo-acutis'));
                break;
            case 'mercy':
                if (window.RosarySystem) {
                    await RosarySystem.startChaplet('misericordia');
                }
                break;
            case 'midday':
                if (window.ExamSystem) ExamSystem.startExam('midday');
                break;
        }
    },

    trySendNotification: async function(invite) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const key = 'angelus_notif_' + invite.window + '_' + new Date().toDateString();
        if (await AsyncStorage.get(key)) return; // Already sent
        try {
            new Notification(t('invites.angelus_title'), { body: t('invites.angelus_notification'), icon: 'assets/icon.png' });
            await AsyncStorage.set(key, 'true');
        } catch (e) {
            console.warn('[Ora] Notification failed:', e);
        }
    }
};

window.ReminderSystem = ReminderSystem;
