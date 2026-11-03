(function (g) {
    'use strict';
    function sanitize(saint) {
        if (!saint || !saint.name) return null;
        const result = { ...saint };
        if (!saint.quote || saint.quote.verified !== true || !/^https:\/\/[^\s]+$/.test(saint.quote.source || '')) delete result.quote;
        return result;
    }
    function forDate(data, date) { return ((data || {})[`${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`] || []).map(sanitize).filter(Boolean); }
    g.SaintsCore = { sanitize, forDate };
})(typeof self !== 'undefined' ? self : this);
