(function (global) {
    'use strict';

    const LOCALES = ['pt', 'en', 'es'];
    const PRAYER_LANGS = [...LOCALES, 'la'];
    const FOCUS_DURATIONS = [15, 25, 50, 90];
    const SHORT_BREAKS = [5, 10];
    const READER_SIZES = [19, 23, 28];
    const READER_KEY = 'ora_reader_preferences';
    const REMINDERS = ['carlo', 'morning', 'angelus', 'mercy', 'midday', 'evening', 'screentime'];
    const DEFAULTS = {
        ora_locale: 'pt',
        ora_user_name: '',
        ora_prayer_lang: 'pt',
        ora_reduce_motion: false,
        ora_show_saint: true,
        ora_rosary_weekday: true,
        ora_rosary_text_mode: 'full',
        ora_focus_protect: true,
        ora_notification_sound: false
    };
    for (const reminder of REMINDERS) DEFAULTS['ora_reminder_' + reminder] = true;
    const KEYS = Object.keys(DEFAULTS);

    function choice(value, options, fallback) {
        return options.includes(value) ? value : fallback;
    }

    function sanitize(key, value) {
        const fallback = DEFAULTS[key];
        switch (key) {
            case 'ora_locale': return choice(value, LOCALES, fallback);
            case 'ora_prayer_lang': return choice(value, PRAYER_LANGS, fallback);
            case 'ora_user_name': return typeof value === 'string' ? value.trim().slice(0, 30) : fallback;
            case 'ora_rosary_text_mode': return choice(value, ['full', 'name'], fallback);
            default: return typeof value === 'boolean' ? value : fallback;
        }
    }

    // The editor offers fixed focus/short-break choices. The timer still accepts
    // older custom durations and session-specific lengths through its own API.
    function duration(key, value) {
        const fallback = PomodoroCore.getDefaultSettings()[key];
        const minutes = Number(value);
        if (key === 'focus') return choice(minutes, FOCUS_DURATIONS, fallback);
        if (key === 'pause') return choice(minutes, SHORT_BREAKS, fallback);
        const [min, max] = PomodoroCore.LIMITS.longPause;
        return Number.isInteger(minutes) && minutes >= min && minutes <= max ? minutes : fallback;
    }

    function exportData(snapshot, now = new Date()) {
        const keys = [
            'ora_tasks', 'ora_tasks_history', 'ora_sessions', 'ora_day_intention', 'ora_imported_active_days',
            'ora_reflections', 'ora_rituals', 'ora_ritual_draft', 'ora_exam_logs', 'ora_exam_draft',
            'ora_practice_log', 'ora_prayer_favorites', 'ora_rosary_progress', 'ora_respiro_form',
            'ora_bible_last', 'ora_virtues_list', 'ora_quick_links', 'ora_user_playlists',
            'ora_deleted_default_playlists', 'ora_focus_sound', 'ora_screentime', READER_KEY
        ];
        const data = {};
        for (const key of keys) if (snapshot[key] !== undefined) data[key] = snapshot[key];
        for (const key of ['ora_tasks', 'ora_tasks_history', 'ora_sessions', 'ora_reflections']) data[key] ??= [];
        for (const [key, value] of Object.entries(snapshot)) {
            if (/^ora_(?:lectio_\d{4}-\d{2}-\d{2}|virtues_log_.+|reader_position_.+)$/.test(key)) data[key] = value;
        }
        const config = snapshot.blocker_config || {};
        data.blocker_config = {
            enabled: config.enabled === true,
            lock: config.lock || {},
            profiles: BlockerCore.normalizeProfiles(config.profiles).map(({ tempAccess, ...profile }) => profile)
        };
        data.settings = Object.fromEntries(KEYS.map(key => [key, sanitize(key, snapshot[key])]));
        data.settings.focus = PomodoroCore.sanitizeSettings(snapshot.ora_pomodoro_state?.settings);
        return { version: 1, exportedAt: now.toISOString(), data };
    }

    function clearReflections(snapshot) {
        const rituals = {};
        for (const [date, day] of Object.entries(snapshot.ora_rituals || {})) {
            if (!day?.noite) { rituals[date] = day; continue; }
            const { gratitude, reflection, ...completion } = day.noite;
            rituals[date] = { ...day, noite: completion };
        }
        const { noite, ...drafts } = snapshot.ora_ritual_draft || {};
        const exams = MigrateCore.normalizeExamLogs(snapshot.ora_exam_logs) || [];
        return {
            ora_reflections: [],
            ora_rituals: rituals,
            ora_ritual_draft: drafts,
            ora_exam_logs: exams.map(({ answers, ...record }) => record),
            ora_exam_draft: null
        };
    }

    function offlineInfo(cache, now = new Date()) {
        const dates = LiturgyCore.days(now);
        return {
            total: dates.length,
            available: dates.filter(date => !!LiturgyCore.read(cache, date, 'pt')?.text).length,
            bytes: cache ? new TextEncoder().encode(JSON.stringify(cache)).length : 0
        };
    }

    global.SettingsCore = {
        LOCALES, PRAYER_LANGS, FOCUS_DURATIONS, SHORT_BREAKS, READER_SIZES, READER_KEY,
        REMINDERS, KEYS, sanitize, duration, exportData, clearReflections, offlineInfo
    };
})(typeof self !== 'undefined' ? self : this);
