const REPO = 'MrDeveloperJIS/tree-mapper';
const PKG_URL = `https://raw.githubusercontent.com/${REPO}/main/package.json`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

async function loadVersion() {
    try {
        const res = await fetch(PKG_URL);
        if (!res.ok) throw new Error('fetch failed');
        const pkg = await res.json();
        applyVersion(pkg.version);
    } catch (e) {
        console.warn('Could not fetch version from GitHub, falling back to releases page.', e);
        applyReleaseFallback();
    }
}

/* Populate all version-dependent elements once the version is known */
function applyVersion(v) {
    const downloadUrl = `https://github.com/${REPO}/releases/download/v${v}/tree-mapper-${v}.vsix`;

    document.querySelectorAll('[data-download-btn]').forEach(el => {
        el.href = downloadUrl;
    });

    document.getElementById('termCmd').textContent = `code --install-extension tree-mapper-${v}.vsix`;

    document.querySelectorAll('[data-version]').forEach(el => {
        el.textContent = `v${v}`;
        el.style.display = '';
    });

    document.querySelectorAll('[data-vsix-name]').forEach(el => {
        el.textContent = `tree-mapper-${v}.vsix`;
    });
}

/* On fetch failure, point download buttons to the releases page so users
   always land somewhere useful instead of a broken versioned URL */
function applyReleaseFallback() {
    document.querySelectorAll('[data-download-btn]').forEach(el => {
        el.href = RELEASES_URL;
    });
}

loadVersion();


/* Nav toggle — open/close with slide animation */
const navEl = document.getElementById('navLinks');
const hamburgerEl = document.getElementById('hamburger');

function closeNav() {
    if (!navEl.classList.contains('open')) return;
    navEl.classList.add('closing');
    navEl.classList.remove('open');
    hamburgerEl.classList.remove('open');
    navEl.addEventListener('transitionend', (e) => {
        if (e.propertyName !== 'opacity') return;
        navEl.classList.remove('closing');
    }, { once: true });
}

function openNav() {
    navEl.classList.remove('closing');
    navEl.classList.add('open');
    hamburgerEl.classList.add('open');
}

function toggleNav() {
    navEl.classList.contains('open') ? closeNav() : openNav();
}

hamburgerEl.addEventListener('click', toggleNav);

document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', closeNav);
});

/* Close nav when clicking outside */
document.addEventListener('click', (e) => {
    if (navEl.classList.contains('open') &&
        !navEl.contains(e.target) &&
        !hamburgerEl.contains(e.target)) {
        closeNav();
    }
});


/* Reveal elements as they enter the viewport */
const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
        }
    });
}, { threshold: 0.12 });
revealEls.forEach(el => observer.observe(el));

/* Hero elements reveal immediately on load without waiting for scroll */
document.querySelectorAll('.hero .reveal').forEach(el => {
    setTimeout(() => el.classList.add('visible'), 100);
});


/* Install tabs — driven by data-tab attributes */
function switchTab(id) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === id);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === 'tab-' + id);
    });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});


/* Terminal typewriter — loops indefinitely */
const lines = [
    { type: 'cmd',     text: '# Right-clicked: my-project/src' },
    { type: 'out',     text: '' },
    { type: 'out',     text: '⠸ Scanning workspace files…' },
    { type: 'out',     text: '⠸ Building tree for 14 files…' },
    { type: 'out',     text: '⠸ Rendering Markdown snapshot…' },
    { type: 'out',     text: '' },
    { type: 'tree',    text: 'src/' },
    { type: 'tree',    text: '├── <span class="file-js">extension.js</span>' },
    { type: 'tree',    text: '├── <span class="file-js">scanner.js</span>' },
    { type: 'tree',    text: '├── <span class="file-js">treeBuilder.js</span>' },
    { type: 'tree',    text: '├── <span class="file-js">markdownRenderer.js</span>' },
    { type: 'tree',    text: '└── <span class="file-js">languageMap.js</span>' },
    { type: 'out',     text: '' },
    { type: 'success', text: '✓ Snapshot saved → .tree/2026-04-11-14-35-22.md' },
    { type: 'out',     text: '' },
    { type: 'prompt',  text: '' },
];

const container = document.getElementById('terminalBody');
let li = 0;

function typeLine() {
    if (li >= lines.length) {
        setTimeout(() => {
            container.innerHTML = '';
            li = 0;
            setTimeout(typeLine, 400);
        }, 3000);
        return;
    }

    const line = lines[li++];
    const div = document.createElement('div');
    div.className = 't-line';

    if (line.type === 'cmd') {
        div.innerHTML = `<span class="t-prompt">$</span><span class="t-cmd"> ${line.text}</span>`;
    } else if (line.type === 'tree') {
        div.innerHTML = `<span class="t-out tree">${line.text}</span>`;
    } else if (line.type === 'success') {
        div.innerHTML = `<span class="t-out success">${line.text}</span>`;
    } else if (line.type === 'prompt') {
        div.innerHTML = `<span class="t-prompt">$</span><span class="t-cursor"></span>`;
    } else {
        div.innerHTML = `<span class="t-out">${line.text}</span>`;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    setTimeout(typeLine, line.type === 'out' && line.text === '' ? 80 : 120);
}

setTimeout(typeLine, 800);