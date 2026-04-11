/* ── Nav toggle ── */
function toggleNav() {
    document.getElementById('navLinks').classList.toggle('open');
}

// Close nav when a link is clicked (mobile)
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        document.getElementById('navLinks').classList.remove('open');
    });
});

/* ── Scroll reveal ── */
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

// Trigger hero elements immediately on load
document.querySelectorAll('.hero .reveal').forEach(el => {
    setTimeout(() => el.classList.add('visible'), 100);
});

/* ── Tabs ── */
function switchTab(id) {
    const tabIds = ['vsix', 'terminal', 'update'];
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', tabIds[i] === id);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === 'tab-' + id);
    });
}

/* ── Copy button ── */
function copyCmd(id, btn) {
    const text = document.getElementById(id).textContent;
    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'copy';
            btn.classList.remove('copied');
        }, 2000);
    });
}

/* ── Terminal typewriter ── */
const lines = [
    { type: 'cmd', text: '# Right-clicked: my-project/src' },
    { type: 'out', text: '' },
    { type: 'out', text: '⠸ Scanning workspace files…' },
    { type: 'out', text: '⠸ Building tree for 14 files…' },
    { type: 'out', text: '⠸ Rendering Markdown snapshot…' },
    { type: 'out', text: '' },
    { type: 'tree', text: 'src/' },
    { type: 'tree', text: '├── <span class="file-js">extension.js</span>' },
    { type: 'tree', text: '├── <span class="file-js">scanner.js</span>' },
    { type: 'tree', text: '├── <span class="file-js">treeBuilder.js</span>' },
    { type: 'tree', text: '├── <span class="file-js">markdownRenderer.js</span>' },
    { type: 'tree', text: '└── <span class="file-js">languageMap.js</span>' },
    { type: 'out', text: '' },
    { type: 'success', text: '✓ Snapshot saved → .tree/2026-04-11-14-35-22.md' },
    { type: 'out', text: '' },
    { type: 'prompt', text: '' },
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