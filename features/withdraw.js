// --- FEATURE: AUTO-WITHDRAW ---

window.startAutoWithdraw = async function () {
    if (LinkedInBot.isWithdrawing) return;
    LinkedInBot.isWithdrawing = true;

    // Confirm execution visually
    console.log('✅ Auto-Withdraw Script INVOKED!');

    log('🛡️ Starting Auto-Withdraw (Target: requests older than 2 weeks)...', 'INFO');

    // Ensure we are on the right page
    if (!window.location.href.includes('invitation-manager/sent')) {
        log('Redirecting to Sent Invitations page...', 'INFO');
        window.location.href = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';
        return;
    }

    await randomSleep(3000, 1000); // 2-4 seconds

    // Use StatsManager for count
    if (!window.StatsManager.state) await window.StatsManager.init();
    let withdrawCount = window.StatsManager.state.withdraw.total || 0;

    let scrollAttempts = 0;
    const MAX_EMPTY_SCROLLS = 5; // Try 5 scrolls to find next eligible request

    log(`🛡️ Starting Deep Clean... [Total Withdrawn: ${withdrawCount}]`, 'INFO');

    let cycleNumber = 0;
    let previousHeight = 0;

    while (LinkedInBot.isWithdrawing) {
        // SAFETY CHECK
        await handleSecurityCheckpoint();
        if (!LinkedInBot.isWithdrawing) break;

        cycleNumber++;
        log(`🔄 Scan Cycle ${cycleNumber}... (Empty scrolls: ${scrollAttempts}/${MAX_EMPTY_SCROLLS})`, 'INFO');

        // 1. Find all "Withdraw" buttons directly
        const allButtons = Array.from(document.querySelectorAll('button'));
        const withdrawBtns = allButtons.filter(b =>
            b.innerText.trim() === 'Withdraw' ||
            (b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('Withdraw'))
        );

        let cycleWithdrawals = 0;

        for (const btn of withdrawBtns) {
            if (!LinkedInBot.isWithdrawing) break;

            // Check if button is still in DOM (might have been removed if list shifted)
            if (!document.body.contains(btn)) continue;

            // Safety check
            await handleSecurityCheckpoint();

            // 2. Find container with "Sent" text nearby
            let container = btn.parentElement;
            let foundCard = false;
            let timeTextFound = "";
            let nameFound = "Unknown";

            // Traverse up to find the text
            for (let i = 0; i < 6; i++) {
                if (!container) break;
                const text = container.innerText.toLowerCase();

                // Check for "Sent" AND time unit (heuristic)
                if (text.includes('sent') && (text.includes('ago') || text.includes('week') || text.includes('month'))) {
                    foundCard = true;

                    // Extract just the line with "Sent" if possible for logging
                    const lines = container.innerText.split('\n');
                    const sentLine = lines.find(l => l.toLowerCase().includes('sent') && (l.toLowerCase().includes('ago') || l.toLowerCase().includes('week') || l.toLowerCase().includes('month')));

                    // Use full text if line not found
                    timeTextFound = sentLine ? sentLine.trim() : container.innerText;

                    // Try to grab name
                    const nameEl = container.querySelector('strong, .artdeco-entity-lockup__title, .invitation-card__title');
                    if (nameEl) nameFound = nameEl.innerText.trim();
                    else if (lines.length > 0) nameFound = lines[0].trim();

                    break;
                }
                container = container.parentElement;
            }

            if (!foundCard) continue;

            let shouldWithdraw = false;
            const lowerTimeText = timeTextFound.toLowerCase();

            // PARSING LOGIC
            if (lowerTimeText.includes('year') || lowerTimeText.includes('month')) {
                shouldWithdraw = true;
            } else if (lowerTimeText.includes('week')) {
                const match = lowerTimeText.match(/(\d+)\s+week/);
                if (match && parseInt(match[1]) >= 2) {
                    shouldWithdraw = true;
                }
            }

            if (shouldWithdraw) {
                log(`🗑️ Withdrawing request to ${nameFound} (${timeTextFound})...`, 'INFO');

                // The 'btn' variable is already the withdraw button we found
                if (btn) {
                    // Use same simple click as Auto-Connect works (line 145 in connect.js)
                    btn.click();

                    // Wait loop for modal (up to 3s)
                    let modal = null;
                    for (let i = 0; i < 6; i++) {
                        await randomSleep(500, 200); // 300-700ms
                        // LinkedIn's modal has id="dialog-header", not role="dialog"
                        modal = document.querySelector('.artdeco-modal') ||
                            document.getElementById('dialog-header')?.parentElement ||
                            document.querySelector('[role="main"]');
                        if (modal) break;
                    }

                    let confirmBtn = null;
                    if (modal) {
                        // Find Primary Button (Blue one) inside Modal
                        confirmBtn = Array.from(modal.querySelectorAll('button')).find(b =>
                            b.classList.contains('artdeco-button--primary') ||
                            b.innerText.trim() === 'Withdraw' ||
                            (b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('Withdraw'))
                        );
                    } else {
                        // Fallback: Global search for Primary Withdraw Button (if modal container not found)
                        log('   ⚠️ Modal container not found. Scanning globally for Confirm button...', 'WARNING');
                        const allPrimary = Array.from(document.querySelectorAll('button.artdeco-button--primary'));
                        confirmBtn = allPrimary.find(b => b.innerText.trim() === 'Withdraw' && b !== btn && b.offsetParent !== null);
                    }

                    if (confirmBtn) {
                        log('   ✅ Clicking Confirm Button...', 'INFO');
                        confirmBtn.click();
                        await randomSleep(3000, 1000); // Wait for modal to close

                        // Update Statistics (Unified)
                        const newState = await window.StatsManager.increment('withdraw');
                        withdrawCount = newState.withdraw.total;
                        cycleWithdrawals++;
                        Riverside.
                            // Reset scroll counter since we found a withdrawal
                            scrollAttempts = 0;

                        break; // Process one withdrawal per cycle to avoid rapid-fire
                    } else {
                        log('   ❌ Confirm button NOT found (Modal or Global).', 'ERROR');
                    }
                }
            }
        }

        if (!LinkedInBot.isWithdrawing) break;

        // If no withdrawals in this cycle, increment empty scroll counter
        if (cycleWithdrawals === 0) {
            scrollAttempts++;
        }

        // Check if we've scrolled too many times without finding anything
        // BUT: Continue if "Load more" button is still present
        const stillHasLoadMore = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.innerText.trim().toLowerCase() === 'load more' && btn.offsetParent !== null
        );

        if (scrollAttempts >= MAX_EMPTY_SCROLLS && !stillHasLoadMore) {
            log(`✅ Reached end - no "Load more" button and ${MAX_EMPTY_SCROLLS} empty scrolls. Done!`, 'INFO');
            break;
        } else if (scrollAttempts >= MAX_EMPTY_SCROLLS && stillHasLoadMore) {
            log(`   ⏭️ "Load more" button still present, continuing...`, 'DEBUG');
            scrollAttempts = 0; // Reset counter since more content is available
        }

        // SCROLL / LOAD MORE LOGIC
        log(`Cycle Complete. Withdrew: ${cycleWithdrawals}. Scrolling...`, 'INFO');

        // Measure scrollable height BEFORE scroll
        const scrollSelectors = [
            'section.scaffold-layout__list',
            'div.scaffold-layout__list',
            '#workspace',
            'div.artdeco-card'
        ];

        let scrollContainer = null;
        let beforeHeight = 0;

        for (const selector of scrollSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                scrollContainer = el;
                beforeHeight = el.scrollHeight;
                log(`   Found scroll container: ${selector}`, 'DEBUG');
                el.scrollTop = el.scrollHeight;
                break;
            }
        }

        if (!scrollContainer) {
            // Fallback to window scroll
            beforeHeight = document.body.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
        }

        // Check for "Load more" button and click it
        await randomSleep(2000, 1000); // 1-3 seconds (human-like variation)
        const loadMoreBtn = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.innerText.trim().toLowerCase() === 'load more'
        );

        if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
            log('   📥 Clicking "Load more" button...', 'INFO');
            loadMoreBtn.click();
            await randomSleep(2000, 1000); // 1-3 seconds
        }

        // Measure height AFTER scroll + Load more
        const afterHeight = scrollContainer ? scrollContainer.scrollHeight : document.body.scrollHeight;
        const heightChanged = afterHeight > beforeHeight;

        if (heightChanged) {
            log(`   📏 Height changed: ${beforeHeight} → ${afterHeight} (new content loaded)`, 'DEBUG');
        } else {
            log(`   📏 Height unchanged: ${beforeHeight} (no new content)`, 'DEBUG');
        }

        // Check for "Show more results" button
        const showMoreBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.innerText.toLowerCase().includes('show more results') ||
            b.classList.contains('scaffold-layout__list-show-more-button')
        );

        if (showMoreBtn) {
            log('Found "Show more results" button. Clicking...', 'INFO');
            showMoreBtn.click();
            await randomSleep(3000, 1000); // 2-4 seconds
        } else {
            // If we didn't find one, check if we are truly at the end (maybe via a footer or logic).
            // For now, let's keep scrolling until MAX_SCROLLS to be safe, as infinite scroll might just need scrolling.
        }
    }

    // Clear flag on complete
    LinkedInBot.isWithdrawing = false;
    chrome.storage.local.set({ withdrawRunning: false });
    log(`🎉 Auto-Withdraw complete (or stopped). Removed ${withdrawCount} old requests.`, 'INFO');
};

window.stopAutoWithdraw = function () {
    LinkedInBot.isWithdrawing = false;
    chrome.storage.local.set({ withdrawRunning: false });
    log('🛑 Stopping Auto-Withdraw...', 'WARNING');
};

// --- INITIALIZATION ---
// Check if we should auto-start (after reload)
(async function init() {
    const data = await chrome.storage.local.get('withdrawRunning');
    if (data.withdrawRunning) {
        log('🔄 Auto-Withdraw Persistence Detected. Resuming...', 'INFO');
        setTimeout(() => {
            if (typeof window.startAutoWithdraw === 'function') {
                window.startAutoWithdraw();
            }
        }, 2000);
    }
})();
