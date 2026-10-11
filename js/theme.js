(() => {
    const themeKey = 'mvdef-theme';
    const root = document.documentElement;
    const savedTheme = localStorage.getItem(themeKey);
    let theme = savedTheme === 'light' ? 'light' : 'dark';
    let transitionTimer;
    const themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.className = 'theme-toggle';

    const setTheme = nextTheme => {
        theme = nextTheme;
        root.dataset.theme = theme;
        localStorage.setItem(themeKey, theme);
        themeButton.textContent = theme === 'light' ? '◐' : '☼';
        themeButton.setAttribute(
            'aria-label',
            theme === 'light' ? 'Увімкнути темну тему' : 'Увімкнути світлу тему'
        );
        themeButton.title = theme === 'light' ? 'Темна тема' : 'Світла тема';
    };

    setTheme(theme);

    themeButton.addEventListener('click', () => {
        root.style.setProperty(
            '--theme-transition-cover',
            getComputedStyle(root)
                .getPropertyValue(theme === 'dark' ? '--theme-dark-cover' : '--theme-light-cover')
                .trim()
        );
        setTheme(theme === 'dark' ? 'light' : 'dark');
        root.classList.remove('theme-changing');
        void root.offsetWidth;
        root.classList.add('theme-changing');
        window.clearTimeout(transitionTimer);
        transitionTimer = window.setTimeout(() => root.classList.remove('theme-changing'), 750);
    });
    document.body.append(themeButton);
})();
