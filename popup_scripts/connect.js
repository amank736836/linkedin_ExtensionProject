// --- POPUP FEATURE: AUTO-CONNECT ---

// AUTO-RESUME: Check if we should resume after redirect
chrome.storage.local.get(['connectRunning', 'connectSettings'], (data) => {
    if (data.connectRunning && data.connectSettings) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && (tabs[0].url.includes('/search/results/people') || tabs[0].url.includes('/mynetwork'))) {
                const logItem = document.createElement('div');
                logItem.style.color = '#00d084';
                logItem.innerText = "[CONNECT] 🔄 Auto-Resuming from previous session! Starting in 5s...";
                if (logDisplay) logDisplay.appendChild(logItem);

                // Auto-resume after 5s delay (allow page to stabilize)
                setTimeout(() => {
                    if (startConnectBtn) startConnectBtn.click();
                }, 5000);
            }
        });
    }
});

// Load and display connect count on popup open (Renamed to avoid utils.js conflict)
const connectDisplayLocal = document.getElementById('connectCount');
if (connectDisplayLocal) {
    chrome.storage.local.get(['stats'], (data) => {
        if (data.stats && data.stats.connect) {
            connectDisplayLocal.innerText = data.stats.connect.total || 0;
        }
    });
}

if (startConnectBtn) {
    // Initialize Weekly Manager UI
    const weeklyLimitInput = document.getElementById('weeklyLimit');
    const distStrategyInput = document.getElementById('distStrategy');
    const weeklyCountDisplay = document.getElementById('weeklyCount');
    const weeklyLimitDisplay = document.getElementById('weeklyLimitDisplay');

    if (weeklyLimitInput && window.WeeklyManager) {
        window.WeeklyManager.init().then(state => {
            weeklyCountDisplay.innerText = state.weekly || 0;
            weeklyLimitInput.value = localStorage.getItem('s_weeklyLimit') || 1000;
            distStrategyInput.value = localStorage.getItem('s_distStrategy') || 'standard';
            weeklyLimitDisplay.innerText = weeklyLimitInput.value;
        });

        weeklyLimitInput.addEventListener('change', () => {
            localStorage.setItem('s_weeklyLimit', weeklyLimitInput.value);
            weeklyLimitDisplay.innerText = weeklyLimitInput.value;
        });

        distStrategyInput.addEventListener('change', () => {
            localStorage.setItem('s_distStrategy', distStrategyInput.value);
        });
    }

    // Initialize Daily Limit
    const dailyConnectLimitInput = document.getElementById('dailyConnectLimit');
    if (dailyConnectLimitInput) {
        // Default to 1000 if not set
        dailyConnectLimitInput.value = localStorage.getItem('s_dailyConnectLimit') || 1000;

        dailyConnectLimitInput.addEventListener('change', () => {
            localStorage.setItem('s_dailyConnectLimit', dailyConnectLimitInput.value);
        });
    }

    startConnectBtn.addEventListener('click', async () => {
        // 1. Get Inputs & Init Managers
        const connectDelayInput = document.getElementById('connectDelay');
        const weeklyLimitInput = document.getElementById('weeklyLimit');
        const dailyConnectLimitInput = document.getElementById('dailyConnectLimit');
        const distStrategyInput = document.getElementById('distStrategy');

        const delayVal = connectDelayInput ? parseInt(connectDelayInput.value, 10) : 10;
        const weeklyLimit = parseInt(weeklyLimitInput ? weeklyLimitInput.value : 1000, 10) || 1000;
        const dailyLimit = dailyConnectLimitInput ? parseInt(dailyConnectLimitInput.value, 10) : 1000;
        const strategy = distStrategyInput ? distStrategyInput.value : 'standard';

        // Save delay setting
        if (connectDelayInput) {
            chrome.storage.local.set({ connectDelay: connectDelayInput.value });
        }

        // Smart Scheduling Calculation
        if (window.WeeklyManager) await window.WeeklyManager.init();
        let dailyTarget = window.WeeklyManager ? window.WeeklyManager.getDailyTarget(weeklyLimit, strategy) : dailyLimit;

        // Apply Daily Limit Cap (Crucial for Standard Mode)
        dailyTarget = Math.min(dailyTarget, dailyLimit);

        // MUTUAL EXCLUSION
        if (window.clearAllStates) window.clearAllStates();

        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                // 1. Check URL & Auto-Redirect
                if (!tabs[0].url.includes('mynetwork/grow/')) {
                    // Save state BEFORE redirect for auto-resume
                    chrome.storage.local.set({
                        connectRunning: true,
                        autoConnectRunning: true, // Legacy support
                        connectSettings: { delay: delayVal, limit: dailyTarget }
                    });

                    const targetUrl = 'https://www.linkedin.com/mynetwork/grow/';

                    // REQUEST BYPASS BEFORE REDIRECT
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'bypassAlert' }, () => {
                        chrome.tabs.update(tabs[0].id, { url: targetUrl });

                        const logItem = document.createElement('div');
                        logItem.style.color = '#e6b800';
                        logItem.innerText = "[CONNECT] Redirecting to 'Grow' page... Will auto-resume in 5s!";
                        logDisplay.appendChild(logItem);
                    });
                    return;
                }


                const logItem = document.createElement('div');
                logItem.innerText = `[CONNECT] 🚀 Starting! Smart Target: ${dailyTarget} (Weekly Left: ${Math.max(0, weeklyLimit - (window.StatsManager?.state?.connect?.weekly || 0))})`;
                logDisplay.appendChild(logItem);

                if (dailyTarget <= 0) {
                    logItem.innerText = `[CONNECT] ⚠️ Weekly Limit Reached! (Used: ${window.StatsManager?.state?.connect?.weekly}/${weeklyLimit})`;
                    logItem.style.color = 'red';
                    return;
                }

                // Save persistence state BEFORE attempting connection
                chrome.storage.local.set({
                    autoConnectRunning: true,
                    connectRunning: true, // Consistent Flag
                    connectSettings: { delay: delayVal, limit: dailyTarget }
                });

                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'startConnect',
                    settings: {
                        delay: delayVal,
                        limit: dailyTarget // Pass the Calculated Daily Target 
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        const logItem = document.createElement('div');
                        logItem.style.color = '#ff9800';
                        logItem.innerText = "[CONNECT] Connection lost. Reloading page... Auto-resume in 4s ⏳";
                        logDisplay.appendChild(logItem);

                        // State already saved above - just reload
                        chrome.tabs.reload(tabs[0].id);
                        return;
                    }


                    if (response) {
                        startConnectBtn.disabled = true;
                        stopConnectBtn.disabled = false;
                        // Clear running state once automation starts successfully
                        chrome.storage.local.set({ connectRunning: false });
                    }
                });
            }
        });
    });
}

if (stopConnectBtn) {
    stopConnectBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const logItem = document.createElement('div');
                logItem.innerText = "[CONNECT] 🛑 Stopping...";
                logDisplay.appendChild(logItem);

                chrome.tabs.sendMessage(tabs[0].id, { action: 'stopConnect' }, (response) => {
                    if (response) {
                        startConnectBtn.disabled = false;
                        stopConnectBtn.disabled = true;
                    }
                });
            }
        });
    });
}

// AUTO-WITHDRAW LOGIC
const withdrawBtn = document.getElementById('withdrawBtn');
const stopWithdrawBtn = document.getElementById('stopWithdrawBtn');

if (withdrawBtn) {
    // SYNC UI STATE (Check if already running)
    chrome.storage.local.get('withdrawRunning', (data) => {
        if (data.withdrawRunning) {
            withdrawBtn.disabled = true;
            if (stopWithdrawBtn) stopWithdrawBtn.disabled = false;

            const logItem = document.createElement('div');
            logItem.style.color = '#e6b800'; // Gold color
            logItem.innerText = "[WITHDRAW] 🔄 Auto-Resumed from previous session!";
            if (logDisplay) logDisplay.appendChild(logItem);
        }
    });


    withdrawBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                // Redirect if wrong page
                if (!tabs[0].url.includes('invitation-manager/sent')) {
                    const targetUrl = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';
                    chrome.tabs.update(tabs[0].id, { url: targetUrl });
                    const logItem = document.createElement('div');
                    logItem.style.color = '#e6b800';
                    logItem.innerText = "[WITHDRAW] Redirecting to 'Sent' page... Please click Withdraw again once page loads.";
                    logDisplay.appendChild(logItem);
                    return;
                }

                const logItem = document.createElement('div');
                logItem.innerText = "[WITHDRAW] 📡 Requesting start...";
                logDisplay.appendChild(logItem);

                // Set persistence flag immediately (so if connection fails/reloads, it resumes)
                chrome.storage.local.set({ withdrawRunning: true });

                chrome.tabs.sendMessage(tabs[0].id, { action: 'startWithdraw' }, (response) => {
                    if (chrome.runtime.lastError) {
                        const errItem = document.createElement('div');
                        errItem.style.color = 'red';
                        errItem.innerText = "[WITHDRAW] ❌ Connection Failed. Auto-reloading page in 1s...";
                        logDisplay.appendChild(errItem);
                        setTimeout(() => { chrome.tabs.reload(tabs[0].id); }, 1000);
                    } else if (response && response.status === 'withdrawing') {
                        logItem.innerText += " ✅ Signal Received!";

                        if (stopWithdrawBtn) {
                            withdrawBtn.disabled = true;
                            stopWithdrawBtn.disabled = false;
                        }
                    }
                });
            }
        });
    });
}

if (stopWithdrawBtn) {
    stopWithdrawBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const logItem = document.createElement('div');
                logItem.innerText = "[WITHDRAW] 🛑 Stopping...";
                logDisplay.appendChild(logItem);

                // Clear persistence flag
                chrome.storage.local.set({ withdrawRunning: false });

                chrome.tabs.sendMessage(tabs[0].id, { action: 'stopWithdraw' }, (response) => {
                    withdrawBtn.disabled = false;
                    stopWithdrawBtn.disabled = true;
                });
            }
        });
    });
}
