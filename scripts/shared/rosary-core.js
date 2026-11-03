(function (g) {
    'use strict';
    const MYSTERIES = ['gozosos', 'dolorosos', 'gloriosos', 'luminosos'];
    function mysteryForDay(date) { return ['gloriosos', 'gozosos', 'dolorosos', 'gloriosos', 'luminosos', 'dolorosos', 'gozosos'][date.getDay()]; }
    function indices(structure, type = 'terco') {
        return structure.map((b, i) => i).filter(i => type !== 'misericordia' ||
            !([4, 5, 6].includes(i) || (structure[i].decade > 0 && ['gloria', 'fatima'].includes(structure[i].type))));
    }
    function restore(saved, structure, date = new Date()) {
        try { if (typeof saved === 'string') saved = JSON.parse(saved); } catch (_) { saved = null; }
        saved = saved || {};
        const chapletType = saved.chapletType === 'misericordia' ? 'misericordia' : 'terco';
        const allowed = indices(structure, chapletType);
        return { bead: allowed.includes(saved.bead) ? saved.bead : (allowed[0] || 0),
            mystery: MYSTERIES.includes(saved.mystery) ? saved.mystery : mysteryForDay(date), chapletType,
            intention: String(saved.intention || '').slice(0, 240), textMode: saved.textMode === 'name' ? 'name' : 'full',
            lang: ['pt', 'en', 'es', 'la'].includes(saved.lang) ? saved.lang : 'pt', completed: saved.completed === true };
    }
    function move(state, delta, structure) {
        const allowed = indices(structure, state.chapletType);
        const pos = Math.max(0, allowed.indexOf(state.bead));
        const next = Math.max(0, Math.min(allowed.length - 1, pos + delta));
        return { ...state, bead: allowed[next], completed: false };
    }
    function serialize(state, structure) { return JSON.stringify(restore(state, structure)); }
    function position(state, structure) {
        const bead = structure[state.bead];
        if (!bead) return { decade: 0, hail: 0 };
        return { decade: bead.decade, hail: bead.type === 'ave-maria' ? structure.slice(0, state.bead + 1).filter(b => b.decade === bead.decade && b.type === 'ave-maria').length : 0 };
    }
    g.RosaryCore = { MYSTERIES, mysteryForDay, indices, restore, move, serialize, position };
})(typeof self !== 'undefined' ? self : this);
