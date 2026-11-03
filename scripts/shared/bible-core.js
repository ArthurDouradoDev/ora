(function(g) {
    'use strict';
    function chapterURL(book, chapter, locale) {
        chapter = Number(chapter);
        if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > (book.chaptersByLocale?.[locale] || book.chapters)) return null;
        if (locale === 'en') return `https://bible.usccb.org/bible/${encodeURIComponent(book.enSlug)}/${chapter}`;
        if (locale === 'es') return `https://www.bibliacatolica.com.br/es/biblia-latinoamericana/${encodeURIComponent(book.esSlug)}/${chapter}/`;
        return `https://www.bibliacatolica.com.br/biblia-ave-maria/${encodeURIComponent(book.ptSlug)}/${chapter}/`;
    }
    g.BibleCore = { chapterURL };
})(typeof self !== 'undefined' ? self : this);
