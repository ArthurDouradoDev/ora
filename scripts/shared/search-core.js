(function (g) {
    'use strict';
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    function search(prayers, { query = '', category = 'all', favoritesOnly = false, favorites = [] } = {}) {
        const terms = normalize(query).split(/\s+/).filter(Boolean);
        return prayers.filter(p => (category === 'all' || p.category === category) &&
            (!favoritesOnly || favorites.includes(p.id)) && terms.every(term =>
                normalize([p.title, ...Object.values(p.titles || {}), ...Object.values(p.text || {})].join(' ')).includes(term)));
    }
    g.SearchCore = { normalize, search };
})(typeof self !== 'undefined' ? self : this);
