// --- POPUP FEATURE: AUTO-APPLY ---

// AUTO-RESUME: Check if we should resume after redirect
chrome.storage.local.get(['applyRunning', 'applySettings'], (data) => {
    if (data.applyRunning && data.applySettings) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.includes('/jobs/search/')) {
                const logItem = document.createElement('div');
                logItem.style.color = '#00d084';
                logItem.innerText = "[APPLY] 🔄 Auto-Resuming from previous session! Starting in 5s...";
                if (logDisplay) logDisplay.appendChild(logItem);

                // Auto-resume after 5s delay (allow page to stabilize)
                setTimeout(() => {
                    if (startBtn) startBtn.click();
                }, 5000);
            }
        });
    }
});

// Load and display apply count on popup open
chrome.storage.local.get(['applyCount'], (data) => {
    const applyCountDisplay = document.getElementById('count');
    if (applyCountDisplay) {
        applyCountDisplay.innerText = data.applyCount || 0;
    }
});

if (startBtn) {
    startBtn.addEventListener('click', () => {
        const settings = {};
        fields.forEach(field => {
            const el = document.getElementById(field);
            settings[field] = el.type === 'checkbox' ? el.checked : el.value;
        });

        // MUTUAL EXCLUSION
        if (window.clearAllStates) window.clearAllStates();

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const currentUrl = tabs[0].url;
                const targetUrl = new URL("https://www.linkedin.com/jobs/search/");
                targetUrl.searchParams.set('f_AL', 'true');
                if (settings.keywords) targetUrl.searchParams.set('keywords', settings.keywords);
                if (settings.location) targetUrl.searchParams.set('location', settings.location);
                if (settings.datePosted) targetUrl.searchParams.set('f_TPR', settings.datePosted);
                if (settings.experienceLevel) targetUrl.searchParams.set('f_E', settings.experienceLevel);
                if (settings.workplaceType) targetUrl.searchParams.set('f_WT', settings.workplaceType);
                if (settings.under10Apps) targetUrl.searchParams.set('f_EA', 'true');

                const isTargetPage = currentUrl.includes('/jobs/search/') &&
                    (!settings.keywords || currentUrl.includes(encodeURIComponent(settings.keywords)));

                if (!isTargetPage) {
                    // Save state BEFORE redirect for auto-resume
                    chrome.storage.local.set({
                        applyRunning: true,
                        applySettings: settings
                    });

                    const logItem = document.createElement('div');
                    logItem.style.color = '#e6b800';
                    logItem.innerText = "[APPLY] Redirecting to Jobs Search page... Will auto-resume in 5s!";
                    logDisplay.appendChild(logItem);

                    // REQUEST BYPASS BEFORE REDIRECT
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'bypassAlert' }, () => {
                        chrome.tabs.update(tabs[0].id, { url: targetUrl.toString() });
                    });
                    return;
                }

                const logItem = document.createElement('div');
                logItem.innerText = `[APPLY] 🚀 Starting! Target: ${settings.maxApps}`;
                logDisplay.appendChild(logItem);

                chrome.tabs.sendMessage(tabs[0].id, { action: 'start', settings }, (response) => {
                    if (chrome.runtime.lastError) {
                        const logItem = document.createElement('div');
                        logItem.style.color = '#ff0000';
                        logItem.innerText = "[APPLY] Connection Lost. Please reload the page and click Start again.";
                        logDisplay.appendChild(logItem);
                        return;
                    }
                    if (response) {
                        startBtn.disabled = true;
                        stopBtn.disabled = false;
                        // Clear running state once automation starts successfully
                        chrome.storage.local.set({ applyRunning: false });
                    }
                });
            }
        });
    });


    // Init Count from Storage
    chrome.storage.local.get(['stats'], (data) => {
        const applyCountDisplayLocal = document.getElementById('count');
        if (applyCountDisplayLocal) {
            chrome.storage.local.get(['stats'], (data) => {
                if (data.stats && data.stats.apply) {
                    applyCountDisplayLocal.innerText = data.stats.apply.total || 0;
                }
            });
        }
    });

}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const logItem = document.createElement('div');
                logItem.innerText = "[APPLY] 🛑 Stopping...";
                logDisplay.appendChild(logItem);

                chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' }, (response) => {
                    if (response) {
                        startBtn.disabled = false;
                        stopBtn.disabled = true;
                    }
                });
            }
        });
    });
}
