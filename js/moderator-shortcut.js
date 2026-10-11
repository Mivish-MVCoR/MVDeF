document.addEventListener('keydown', event => {
    if (!event.ctrlKey || !event.shiftKey || event.code !== 'KeyH' || event.repeat) return;
    if (!sessionStorage.getItem('uuid')) return;

    const target = event.target;
    if (target instanceof HTMLElement && (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    )) return;

    event.preventDefault();
    window.location.href = new URL('moderator.html', document.baseURI).href;
}, true);
