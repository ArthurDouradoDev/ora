const SiteFavicon = {
    cacheUrl(pageUrl) {
        try {
            const url = new URL(chrome.runtime.getURL('/_favicon/'));
            url.searchParams.set('pageUrl', pageUrl);
            url.searchParams.set('size', '32');
            return url.href;
        } catch {
            return null;
        }
    }
};
