// --- POPUP FEATURE: AUTO-WITHDRAW ---

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    const withdrawBtn = document.getElementById('withdrawBtn');
    const stopWithdrawBtn = document.getElementById('stopWithdrawBtn');
    const withdrawCountDisplay = document.getElementById('withdrawCount');

    // Load and display withdrawal count
    function updateCounter() {
        if (withdrawCountDisplay) {
            console.log('[WITHDRAW POPUP] Checking storage for withdrawCount...');
            chrome.storage.local.get(['withdrawCount'], (data) => {
                console.log('[WITHDRAW POPUP] Storage data:', data);
                const count = data.withdrawCount || 0;
                console.log('[WITHDRAW POPUP] Setting counter to:', count);
                withdrawCountDisplay.innerText = count;
            });
        } else {
            console.error('[WITHDRAW POPUP] withdrawCountDisplay element NOT FOUND!');
        }
    }

    // Initial load
    updateCounter();

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
            // MUTUAL EXCLUSION
            if (window.clearAllStates) window.clearAllStates();

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    // Check if on correct page (/sent/ or /invitation-manager/sent/)
                    if (!tabs[0].url.includes('/sent/')) {
                        // Save state BEFORE redirect for auto-resume
                        chrome.storage.local.set({ withdrawRunning: true });

                        // REQUEST BYPASS BEFORE REDIRECT
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'bypassAlert' }, () => {
                            const targetUrl = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';
                            chrome.tabs.update(tabs[0].id, { url: targetUrl });

                            const logItem = document.createElement('div');
                            logItem.style.color = '#e6b800';
                            logItem.innerText = "[WITHDRAW] Redirecting to Sent Invitations... Will auto-resume in 5s!";
                            logDisplay.appendChild(logItem);
                        });
                        return;
                    }

                    const logItem = document.createElement('div');
                    logItem.innerText = "[WITHDRAW] 🛡️ Starting Auto-Withdraw...";
                    logDisplay.appendChild(logItem);

                    // Disable Start, Enable Stop
                    withdrawBtn.disabled = true;
                    if (stopWithdrawBtn) stopWithdrawBtn.disabled = false;

                    chrome.tabs.sendMessage(tabs[0].id, { action: 'startWithdraw' }, (response) => {
                        if (chrome.runtime.lastError) {
                            const errorLog = document.createElement('div');
                            errorLog.style.color = '#cc1016';
                            errorLog.innerText = `[WITHDRAW] Error: ${chrome.runtime.lastError.message}`;
                            logDisplay.appendChild(errorLog);
                            withdrawBtn.disabled = false;
                            if (stopWithdrawBtn) stopWithdrawBtn.disabled = true;
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
                    logItem.style.color = '#cc1016';
                    logItem.innerText = "[WITHDRAW] ⛔ Stopping...";
                    logDisplay.appendChild(logItem);

                    chrome.tabs.sendMessage(tabs[0].id, { action: 'stopWithdraw' });

                    // Re-enable Start, Disable Stop
                    withdrawBtn.disabled = false;
                    stopWithdrawBtn.disabled = true;
                }
            });
        });
    }

    // Real-time count updates (storage listener)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.withdrawCount && withdrawCountDisplay) {
            withdrawCountDisplay.innerText = changes.withdrawCount.newValue;
        }
    });

    // Polling fallback: Update counter every second while running
    let updateInterval = setInterval(() => {
        if (withdrawCountDisplay) {
            chrome.storage.local.get(['withdrawCount', 'withdrawRunning'], (data) => {
                if (data.withdrawCount !== undefined) {
                    withdrawCountDisplay.innerText = data.withdrawCount;
                }
                // Stop polling if not running
                if (!data.withdrawRunning) {
                    clearInterval(updateInterval);
                }
            });
        }
    }, 1000); // Update every second

}); // End DOMContentLoaded
