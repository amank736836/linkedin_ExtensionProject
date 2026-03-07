// --- POPUP FEATURE: CATCH-UP ---

// Load and display catchup count on popup open
chrome.storage.local.get(['stats'], (data) => {
    const catchUpCountDisplay = document.getElementById('catchUpCount');
    if (catchUpCountDisplay && data.stats && data.stats.catchup) {
        catchUpCountDisplay.innerText = data.stats.catchup.daily || 0;
    }
});

if (startCatchUpBtn) {
    startCatchUpBtn.addEventListener('click', () => {
        // MUTUAL EXCLUSION
        if (window.clearAllStates) window.clearAllStates();

        // 1. Get Settings
        const type = catchUpType ? catchUpType.value : 'all';
        const limitInput = document.getElementById('catchUpLimit');
        const limit = parseInt(limitInput ? limitInput.value : 200, 10) || 200;

        // 2. Save Running State (Settings are auto-saved by fields array in utils.js)
        chrome.storage.local.set({
            catchUpRunning: true,
            catchUpSettings: { type, limit }
        });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                // 3. Check URL and Redirect if needed
                if (!tabs[0].url.includes('mynetwork/catch-up')) {
                    // REQUEST BYPASS BEFORE REDIRECT
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'bypassAlert' }, () => {
                        const targetUrl = 'https://www.linkedin.com/mynetwork/catch-up/all/';
                        chrome.tabs.update(tabs[0].id, { url: targetUrl });

                        const logItem = document.createElement('div');
                        logItem.style.color = '#e6b800'; // Orange/Yellow
                        logItem.innerText = "[CATCH-UP] Redirecting to 'Catch-Up' page... Will auto-resume in 4s! 🚀";
                        logDisplay.appendChild(logItem);
                    });
                    return;
                }

                const logItem = document.createElement('div');
                logItem.innerText = `[CATCH-UP] 🚀 Starting! Type: ${type}, Limit: ${limit}`;
                logDisplay.appendChild(logItem);

                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'startCatchUp',
                    settings: { type, limit }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        const logItem = document.createElement('div');
                        logItem.style.color = '#ff9800';
                        logItem.innerText = "[CATCH-UP] Connection lost. Reloading page... Auto-resume in 4s ⏳";
                        logDisplay.appendChild(logItem);

                        // Persistence state already saved above - just reload
                        chrome.tabs.reload(tabs[0].id);
                        return;
                    }
                    if (response) {
                        startCatchUpBtn.disabled = true;
                        stopCatchUpBtn.disabled = false;
                        // Clear running state once automation starts successfully
                        chrome.storage.local.set({ catchUpRunning: false });
                    }
                });
            }
        });
    });

    // Init Count from Storage
    chrome.storage.local.get(['stats'], (data) => {
        const catchUpCount = document.getElementById('catchUpCount');
        if (data.stats && data.stats.catchup && catchUpCount) {
            catchUpCount.innerText = data.stats.catchup.daily || 0;
        }
    });
}

if (stopCatchUpBtn) {
    stopCatchUpBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const logItem = document.createElement('div');
                logItem.innerText = "[CATCH-UP] 🛑 Stopping...";
                logDisplay.appendChild(logItem);

                chrome.tabs.sendMessage(tabs[0].id, { action: 'stopCatchUp' }, (response) => {
                    if (response) {
                        startCatchUpBtn.disabled = false;
                        stopCatchUpBtn.disabled = true;
                        chrome.storage.local.set({ catchUpRunning: false });
                    }
                });
            }
        });
    });
}
