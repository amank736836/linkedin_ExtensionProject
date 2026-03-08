// --- POPUP UTILS & DOM ---

// Global Element References
const fields = [
    'fullName', 'email', 'phone', 'salary', 'notice', 'maxApps',
    'keywords', 'location', 'datePosted', 'experienceLevel', 'workplaceType',
    'under10Apps', 'connectDelay', 'catchUpLimit', 'pagesLimit', 'weeklyLimit', 'distStrategy'
];
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtnFilters = document.getElementById('saveBtnFilters');
const saveBtnProfile = document.getElementById('saveBtnProfile');

const startConnectBtn = document.getElementById('startConnectBtn');
const stopConnectBtn = document.getElementById('stopConnectBtn');
const connectCountDisplay = document.getElementById('connectCount');

const startCatchUpBtn = document.getElementById('startCatchUpBtn');
const stopCatchUpBtn = document.getElementById('stopCatchUpBtn');
const catchUpType = document.getElementById('catchUpType');
const catchUpCountDisplay = document.getElementById('catchUpCount');

const startPagesBtn = document.getElementById('startPagesBtn');
const stopPagesBtn = document.getElementById('stopPagesBtn');
const pagesMode = document.getElementById('pagesMode');
const pagesLimit = document.getElementById('pagesLimit');
const pagesCountDisplay = document.getElementById('pagesCount');

const countDisplay = document.getElementById('count');
const logDisplay = document.getElementById('log');
const libraryContainer = document.getElementById('questionLibrary');

const defaultSettings = {
    fullName: "Aman Kumar",
    email: "amankarguwal1@gmail.com",
    phone: "+916284736836",
    salary: "8 LPA",
    notice: "1 month",
    maxApps: "43",
    keywords: "software developer",
    location: "Bengaluru",
    datePosted: "r86400",
    experienceLevel: "2",
    workplaceType: "2",
    under10Apps: false,
    connectDelay: 10,
    catchUpLimit: 200,
    pagesLimit: 500,
    weeklyLimit: 1000,
    distStrategy: 'standard'
};

// UI Helpers
function renderLibrary(unknown, library) {
    if (unknown.length === 0) {
        libraryContainer.innerHTML = 'No new questions detected yet.';
        return;
    }

    libraryContainer.innerHTML = '';
    unknown.forEach(q => {
        const div = document.createElement('div');
        div.className = 'input-group';
        div.style.borderBottom = '1px solid #eee';
        div.style.paddingBottom = '8px';
        div.innerHTML = `
            <label style="color: #0a66c2; font-weight: bold;">${q}</label>
            <div style="display: flex; gap: 5px;">
                <input type="text" placeholder="Your answer..." id="answer-${btoa(q).substring(0, 10)}">
                <button class="btn" style="width: auto; padding: 5px 10px; font-size: 10px;" id="save-${btoa(q).substring(0, 10)}">Save</button>
            </div>
        `;
        libraryContainer.appendChild(div);

        div.querySelector('button').onclick = () => {
            const answer = div.querySelector('input').value;
            if (!answer) return;

            chrome.storage.local.get(['customLibrary', 'unknownQuestions'], (data) => {
                const lib = data.customLibrary || {};
                const unk = data.unknownQuestions || [];
                lib[q] = answer;
                const newUnk = unk.filter(item => item !== q);
                chrome.storage.local.set({ customLibrary: lib, unknownQuestions: newUnk }, () => {
                    div.remove();
                    if (newUnk.length === 0) libraryContainer.innerHTML = 'No new questions detected yet.';
                });
            });
        };
    });
}

function updateUI(status) {
    // Auto-switch to active tab on first live status
    if (window.autoSwitchOnFirstStatus) window.autoSwitchOnFirstStatus(status);

    if (startBtn) startBtn.disabled = status.isRunning;
    if (stopBtn) stopBtn.disabled = !status.isRunning;

    if (startConnectBtn) startConnectBtn.disabled = status.isConnecting;
    if (stopConnectBtn) stopConnectBtn.disabled = !status.isConnecting;

    if (startCatchUpBtn) {
        startCatchUpBtn.disabled = status.isCatchingUp;
        stopCatchUpBtn.disabled = !status.isCatchingUp;
    }

    if (startPagesBtn) {
        startPagesBtn.disabled = status.isPagesRunning;
        stopPagesBtn.disabled = !status.isPagesRunning;
    }

    if (status.stats) {
        if (countDisplay && status.stats.apply) countDisplay.innerText = status.stats.apply.total || 0;
        if (connectCountDisplay && status.stats.connect) {
            connectCountDisplay.innerText = status.stats.connect.total || 0;
            const weekDisplay = document.getElementById('connectCountWeekly');
            if (weekDisplay) weekDisplay.innerText = status.stats.connect.weekly || 0;
        }
        const catchUpD = document.getElementById('catchUpCount');
        if (catchUpD && status.stats.catchup) catchUpD.innerText = status.stats.catchup.total || 0;
        const pagesD = document.getElementById('pagesCount');
        if (pagesD && status.stats.pages) pagesD.innerText = status.stats.pages.total || 0;
        const withdrawD = document.getElementById('withdrawCount');
        if (withdrawD && status.stats.withdraw) withdrawD.innerText = status.stats.withdraw.total || 0;
    } else {
        if (countDisplay) countDisplay.innerText = status.applicationCount || 0;
        if (connectCountDisplay) connectCountDisplay.innerText = status.connectCount || 0;
        const catchUpD = document.getElementById('catchUpCount');
        if (catchUpD) catchUpD.innerText = status.catchUpCount || 0;
        const pagesD = document.getElementById('pagesCount');
        if (pagesD) pagesD.innerText = status.pagesCount || 0;
        const withdrawD = document.getElementById('withdrawCount');
        if (withdrawD) withdrawD.innerText = status.withdrawCount || 0;
    }
}

function saveSettings() {
    const settings = {};
    fields.forEach(field => {
        const el = document.getElementById(field);
        if (el) {
            settings[field] = el.type === 'checkbox' ? el.checked : el.value;
        }
    });
    chrome.storage.local.set(settings, () => {
        console.log('Settings saved');
    });
}

// LOG LISTENER (Added)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log') {
        const logItem = document.createElement('div');
        logItem.innerText = request.message;

        // Auto-Scroll
        logDisplay.appendChild(logItem);
        logDisplay.scrollTop = logDisplay.scrollHeight;

        // Cleanup old logs if too many (optional optimization)
        if (logDisplay.childNodes.length > 200) {
            logDisplay.removeChild(logDisplay.firstChild);
        }
    }
});

// AUTO-SAVE LISTENERS
fields.forEach(field => {
    const el = document.getElementById(field);
    if (el) {
        el.addEventListener('change', () => {
            saveSettings();
        });
    }
});

// MUTUAL EXCLUSION HELPER
function clearAllStates(exclude = null) {
    const states = {
        isRunning: false,          // Apply
        connectRunning: false,     // Connect
        autoConnectRunning: false, // Connect (Legacy)
        catchUpRunning: false,     // CatchUp
        pagesRunning: false,       // Pages
        withdrawRunning: false,    // Withdraw
        catchUpSettings: {}        // Clear catchup settings on full stop
    };


    // Explicitly set excluded state to true if requested (though usually handled by caller)
    // But caller usually does: clearAllStates(); customStart();

    chrome.storage.local.set(states, () => {
        // Optional: Log clearing
        console.log('Cleared all automation states.');
    });
}
// Export to window
window.clearAllStates = clearAllStates;
