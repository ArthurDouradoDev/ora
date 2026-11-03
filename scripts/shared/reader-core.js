(function (g) {
    'use strict';
    const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
    function proportion(top, height, viewport) { return height > viewport ? clamp(top / (height - viewport), 0, 1) : 0; }
    function restore(ratio, height, viewport) { return clamp(ratio, 0, 1) * Math.max(0, height - viewport); }
    function preferences(saved = {}) { return { size: clamp(saved.size || 19, 16, 38), appearance: saved.appearance === 'papel' ? 'papel' : 'escuro' }; }
    g.ReaderCore = { proportion, restore, preferences };
})(typeof self !== 'undefined' ? self : this);
