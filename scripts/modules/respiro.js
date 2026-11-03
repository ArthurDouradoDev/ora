const RespiroSystem = {
    state: { form:'brief', index:0, practicing:false }, origin: { view:'rezar', path:[] },
    async init(data) {
        this.prayers = data.prayers;
        const params = new URLSearchParams(location.search);
        if (params.get('from') === 'blocked' && RouterSystem.current().path[0] === 'respiro') {
            history.replaceState({ ...history.state, respiroOrigin:{ blockedDomain:params.get('domain') || '' } },'',location.pathname);
        }
        const form = await AsyncStorage.get('ora_respiro_form','brief');
        this.state.form = ['brief','three','decade','rest'].includes(form) ? form : 'brief';
        this.cacheDOM(); this.bindEvents();
    },
    cacheDOM() {}, bindEvents() {},
    open(origin) {
        this.origin = origin || RouterSystem.current() || { view:'rezar',path:[] };
        this.state.index = 0; this.state.practicing = false;
        RouterSystem.navigate('rezar/respiro');
        history.replaceState({ ...history.state, respiroOrigin:this.origin },'',location.href);
    },
    sequence() {
        const prayer = id => {
            const p = this.prayers.find(p => p.id === id), lang = window.SettingsSystem ? SettingsSystem.getPrayerLang() : window._i18nLocale;
            return { title:PrayUI.title(p), text:p?.text[lang] || t('pray.translation_missing'), lang };
        };
        switch (this.state.form) {
            case 'three': return Array.from({length:3},() => prayer('ave-maria'));
            case 'decade': return [prayer('pai-nosso'),...Array.from({length:10},() => prayer('ave-maria')),prayer('gloria')];
            default: return [{ title:t('pray.' + this.state.form), text:t('pray.' + (this.state.form === 'rest' ? 'rest_text' : 'brief_text')), lang:window._i18nLocale }];
        }
    },
    render() {
        const u = PrayUI, choices = ['brief','three','decade','rest'], sequence = this.sequence(), current = sequence[this.state.index];
        u.mount(`<div class="respiro-screen"><section class="respiro-panel surface-solid"><div class="section-head"><p class="label">${u.text('breath')}</p>${u.button('respiro-exit','close')}</div>${this.state.practicing ? `<div class="respiro-practice" aria-live="polite"><h1 tabindex="-1" data-route-focus>${u.e(current.title)}</h1><p class="prayer-prose" lang="${u.e(current.lang)}">${u.e(current.text)}</p></div>${sequence.length > 1 ? `<p class="meta">${u.text('stage',{n:this.state.index + 1,total:sequence.length})}</p>` : ''}${u.button('respiro-next',this.state.index === sequence.length - 1 ? 'return' : 'next','btn-primary btn-lg')}${u.button('respiro-choose','choose_again')}` : `<h1 class="reflect" tabindex="-1" data-route-focus>${u.text('breath_title')}</h1><p class="meta">${u.text('breath_intro')}</p><fieldset class="respiro-choices"><legend class="sr-only">${u.text('breath')}</legend>${choices.map(form => `<label><input type="radio" name="respiro-form" value="${form}" ${form === this.state.form ? 'checked' : ''}><span>${u.text(form)}</span></label>`).join('')}</fieldset>${u.button('respiro-begin','begin','btn-primary btn-lg')}`}<p class="meta" role="status" id="respiro-status"></p></section></div>`,'resting');
        u.on('respiro-exit','click', () => this.exit());
        u.on('respiro-begin','click', async () => {
            const form = document.querySelector('input[name="respiro-form"]:checked').value;
            if (await u.save('ora_respiro_form',form,document.getElementById('respiro-status'))) { this.state = { form,index:0,practicing:true }; this.render(); document.querySelector('[data-route-focus]').focus(); }
        });
        u.on('respiro-next','click', () => { if (this.state.index === sequence.length - 1) this.exit(); else { this.state.index++; this.render(); document.getElementById('respiro-next').focus(); } });
        u.on('respiro-choose','click', () => { this.state.practicing = false; this.state.index = 0; this.render(); });
    },
    exit() {
        const origin = history.state?.respiroOrigin || this.origin;
        this.state.index = 0; this.state.practicing = false;
        // A blocked page passes its extension-local URL. It is never treated as an arbitrary redirect.
        if (origin && typeof origin.blockedDomain === 'string') {
            location.assign(chrome.runtime.getURL('blocked.html') + '?domain=' + encodeURIComponent(origin.blockedDomain)); return;
        }
        RouterSystem.navigate(RouteCore.sanitizeRoute(origin));
    }
};
window.RespiroSystem = RespiroSystem;
