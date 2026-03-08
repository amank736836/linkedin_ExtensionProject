// --- POPUP INITIALIZATION ---

// (Feature logic is now in popup_scripts/*.js)
// This file handles initialization, loading settings, and TABS.

// Helper: Switch to a tab by its data-tab id
function switchToTab(tabId) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.click();
}

// Auto-switch to active tab on first live status response
let hasAutoSwitched = false;
window.autoSwitchOnFirstStatus = function (status) {
    if (hasAutoSwitched) return;
    hasAutoSwitched = true;
    if (status.isWithdrawing) switchToTab('withdraw');
    else if (status.isConnecting) switchToTab('connect');
    else if (status.isCatchingUp) switchToTab('catchup');
    else if (status.isPagesRunning) switchToTab('pages');
    else if (status.isRunning) switchToTab('apply');
    // else: stays on default (Catch Up)
};

// 1. Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.sub-tab-content').forEach(c => c.style.display = 'none');

        // Add active to clicked tab
        btn.classList.add('active');

        // Show content
        const tabId = btn.getAttribute('data-tab');
        if (tabId) {
            const content = document.getElementById(tabId);
            if (content) content.classList.add('active');

            // If Settings tab clicked, auto-open the first sub-tab (Analytics)
            if (tabId === 'settings') {
                const firstSubTab = document.querySelector('.sub-tab-btn');
                if (firstSubTab) firstSubTab.click();
            }
        }

        // Sub-tabs logic (if clicked a sub-tab)
        const subTabId = btn.getAttribute('data-subtab');
        if (subTabId) {
            // Keep parent 'Settings' tab active if we are in subtabs
            const settingsTab = document.querySelector('[data-tab="settings"]');
            if (settingsTab) {
                settingsTab.classList.add('active');
                document.getElementById('settings').classList.add('active');
            }

            // Show sub-tab content
            const subContent = document.getElementById(subTabId);
            if (subContent) subContent.style.display = 'block';
        }
    });
});

// 2. Load stored settings or use defaults
chrome.storage.local.get([...fields, 'unknownQuestions', 'customLibrary'], (data) => {
    fields.forEach(field => {
        const el = document.getElementById(field);
        if (!el) return;
        const value = data[field] !== undefined ? data[field] : defaultSettings[field];
        if (el.type === 'checkbox') {
            el.checked = value;
        } else {
            el.value = value;
        }
    });

    renderLibrary(data.unknownQuestions || [], data.customLibrary || {});

    // Sync button states with Content Script immediately
    syncStatus();

    // Poll for status updates every second
    setInterval(syncStatus, 1000);

    // 5. Listen for Auto-Fill Complete Messages (from content script)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'autoFillComplete' && request.data) {
            const data = request.data;

            // Populate Fields
            if (data.fullName) document.getElementById('fullName').value = data.fullName;
            if (data.location) document.getElementById('location').value = data.location;

            // Save Public Profile URL (Silent)
            if (data.publicProfileUrl) {
                chrome.storage.local.set({ publicProfileUrl: data.publicProfileUrl });
            }

            if (data.keywords) {
                let k = data.keywords;
                if (data.openToWork) k += " (Open to Work)";
                document.getElementById('keywords').value = k;
            }
            if (data.experienceLevel) document.getElementById('experienceLevel').value = data.experienceLevel;

            // Save Immediately
            saveSettings();

            // Show success message in log
            const logItem = document.createElement('div');
            logItem.style.color = 'green';
            logItem.innerText = "✅ Profile Auto-Filled Successfully!";
            logDisplay.appendChild(logItem);

            log('✅ Profile Auto-Filled Successfully!', 'SUCCESS');

            sendResponse({ status: 'received' });
        }
    });


    // --- PROACTIVE ONBOARDING ---
    if (!data.onboardingComplete) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.includes('linkedin.com/in/')) {
                // Not on profile, ensure banner is visible (it is by default in HTML, but good to be explicit)
                if (onboardingBanner) onboardingBanner.style.display = 'block';
            } else {
                // Not on profile, ensure banner is visible
                if (onboardingBanner) onboardingBanner.style.display = 'block';
            }
        });
    } else {
        // Setup done, hide banner
        if (onboardingBanner) onboardingBanner.style.display = 'none';
    }
});

function syncStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('Could not sync status (Content script maybe inactive/reloading)');
                    return;
                }
                if (response) {
                    updateUI(response);
                }
            });
        }
    });
}

// "Save" buttons for the tabs (Global Settings)
if (saveBtnFilters) {
    saveBtnFilters.addEventListener('click', () => {
        saveSettings();
    });
}

if (saveBtnProfile) {
    saveBtnProfile.addEventListener('click', () => {
        saveSettings();
    });
}

// Analytics Polling
setInterval(updateAnalyticsUI, 2000);
updateAnalyticsUI(); // Initial

function updateAnalyticsUI() {
    chrome.storage.local.get(['stats'], (data) => {
        if (!data.stats) return;
        const s = data.stats;

        // Helper
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        // Apply
        if (s.apply) {
            set('stats_apply_daily', s.apply.daily || 0);
            set('stats_apply_weekly', s.apply.weekly || 0);
            set('stats_apply_total', s.apply.total || 0);
        }

        // Connect
        if (s.connect) {
            set('stats_connect_daily', s.connect.daily || 0);
            set('stats_connect_weekly', s.connect.weekly || 0);
            set('stats_connect_total', s.connect.total || 0);
        }

        // CatchUp
        if (s.catchup) {
            set('stats_catchup_daily', s.catchup.daily || 0);
            set('stats_catchup_weekly', s.catchup.weekly || 0);
            set('stats_catchup_total', s.catchup.total || 0);
        }

        // Pages
        if (s.pages) {
            set('stats_pages_daily', s.pages.daily || 0);
            set('stats_pages_weekly', s.pages.weekly || 0);
        }

        // Withdraw
        if (s.withdraw) {
            set('stats_withdraw_daily', s.withdraw.daily || 0);
            set('stats_withdraw_weekly', s.withdraw.weekly || 0);
            set('stats_withdraw_total', s.withdraw.total || 0);
        }
    });
}
