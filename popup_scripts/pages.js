// --- POPUP FEATURE: PAGES AUTOMATION ---

// AUTO-RESUME: Now handled by content.js persistence detection
// (Removed duplicate logic to prevent conflicts)

if (startPagesBtn) {
    startPagesBtn.addEventListener('click', () => {
        // MUTUAL EXCLUSION
        if (window.clearAllStates) window.clearAllStates();

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const currentUrl = tabs[0].url;

                // Get current mode
                const selectedMode = pagesMode.value;

                // Check if we're on the CORRECT page for the selected mode
                const isCorrectPage =
                    (selectedMode === 'unfollow' && currentUrl.includes('/mynetwork/network-manager/company/')) ||
                    (selectedMode === 'follow' && currentUrl.includes('/search/results/companies/'));

                if (!isCorrectPage) {
                    // Save state BEFORE redirect for auto-resume
                    const limitVal = parseInt(document.getElementById('pagesLimit').value, 10) || 500;
                    chrome.storage.local.set({
                        pagesRunning: true,
                        pagesSettings: { mode: selectedMode, limit: limitVal }
                    });

                    const logItem = document.createElement('div');
                    logItem.style.color = '#e6b800';
                    logItem.innerText = `[PAGES] Redirecting to ${selectedMode === 'unfollow' ? 'Following' : 'Search'}... Will auto-resume in 5s!`;
                    logDisplay.appendChild(logItem);
                    logDisplay.scrollTop = logDisplay.scrollHeight;

                    // REQUEST BYPASS BEFORE REDIRECT
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'bypassAlert' }, () => {
                        // Determine Target URL
                        const targetUrl = selectedMode === 'unfollow'
                            ? 'https://www.linkedin.com/mynetwork/network-manager/company/'
                            : 'https://www.linkedin.com/search/results/companies/';

                        chrome.tabs.update(tabs[0].id, { url: targetUrl });
                    });
                    return;
                }

                // Explicitly Parse Limit
                const limitVal = parseInt(pagesLimit.value, 10);
                const appliedLimit = (isNaN(limitVal) || limitVal < 1) ? 500 : limitVal;

                // LOG IT
                const logItem = document.createElement('div');
                logItem.innerText = `[PAGES] 🚀 Starting! Mode: ${pagesMode.value}, Limit: ${appliedLimit}`;
                logDisplay.appendChild(logItem);
                logDisplay.scrollTop = logDisplay.scrollHeight;

                const settings = {
                    mode: pagesMode.value,
                    limit: appliedLimit
                };

                chrome.tabs.sendMessage(tabs[0].id, { action: 'startPages', settings }, (response) => {
                    if (chrome.runtime.lastError) {
                        const logItem = document.createElement('div');
                        logItem.style.color = '#ff9800';
                        logItem.innerText = "[PAGES] Connection lost. Reloading page... Auto-resume in 5s ⏳";
                        logDisplay.appendChild(logItem);

                        // Save persistence state for auto-resume
                        chrome.storage.local.set({
                            pagesRunning: true,
                            pagesSettings: settings
                        }, () => {
                            // Reload the page - content.js will auto-resume
                            chrome.tabs.reload(tabs[0].id);
                        });
                        return;
                    }
                    if (response) {
                        startPagesBtn.disabled = true;
                        stopPagesBtn.disabled = false;
                        // Clear running state once automation starts successfully
                        chrome.storage.local.set({ pagesRunning: false });
                    }
                });
            }
        });
    });

    // Init Count from Storage
    if (pagesCountDisplay) {
        chrome.storage.local.get(['stats'], (data) => {
            if (data.stats && data.stats.pages) {
                pagesCountDisplay.innerText = data.stats.pages.total || 0;
            }
        });
    }
}

if (stopPagesBtn) {
    stopPagesBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const logItem = document.createElement('div');
                logItem.innerText = "[PAGES] 🛑 Stopping...";
                logDisplay.appendChild(logItem);

                chrome.tabs.sendMessage(tabs[0].id, { action: 'stopPages' }, (response) => {
                    if (response) {
                        startPagesBtn.disabled = false;
                        stopPagesBtn.disabled = true;
                    }
                });
            }
        });
    });
}
