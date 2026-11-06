(function (global) {
    'use strict';

    const DONE_KEY = 'ora_onboarding_v1_done';
    const UPDATE_KEY = 'ora_onboarding_from_115';

    function isLegacy(snapshot) {
        if (snapshot[UPDATE_KEY] === true) return true;
        if (Number(snapshot.ora_schema_version) >= 2) return false;
        const config = snapshot.blocker_config;
        return snapshot.ora_focus_settings !== undefined ||
            snapshot.blocker_sites !== undefined || Array.isArray(config?.sites) ||
            typeof config === 'string' ||
            Object.keys(snapshot).some(key => /^ora_(?:exam|midday|evening)_done_/.test(key));
    }

    function mode(snapshot = {}) {
        if (snapshot[DONE_KEY] === true) return null;
        if (isLegacy(snapshot)) return 'update';
        return snapshot.ora_onboarding_done === true ? null : 'full';
    }

    global.OnboardingCore = { DONE_KEY, UPDATE_KEY, isLegacy, mode };
})(typeof self !== 'undefined' ? self : this);
