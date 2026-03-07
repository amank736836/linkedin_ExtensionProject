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
    const MAX_EMPTY_SCROLLS = 10; // Try 10 scrolls to find next eligible request

    log(`🛡️ Starting Deep Clean... [Total Withdrawn: ${withdrawCount}]`, 'INFO');

    let sessionWithdrawn = 0; // Local counter for this run
    let cycleNumber = 0;

    while (LinkedInBot.isWithdrawing) {
        // SAFETY CHECK
        await handleSecurityCheckpoint();
        if (!LinkedInBot.isWithdrawing) break;

        cycleNumber++;
        log(`🔄 Scan Cycle ${cycleNumber}... (Empty scrolls: ${scrollAttempts}/${MAX_EMPTY_SCROLLS})`, 'INFO');

        // 1. Find all potential "Withdraw" nodes directly. 
        // Including div/p/span as used in the successful console script.
        const allNodes = Array.from(document.querySelectorAll('span, a, button, div, p'));
        const withdrawBtns = allNodes.filter(b => {
            const t = (b.innerText || "").trim().toLowerCase();
            if (t !== 'withdraw') return false;
            if (b.offsetParent === null) return false; // Must be visible
            // Optimization: Find innermost element (if any child has the exact same text, skip this parent)
            if (Array.from(b.querySelectorAll('*')).some(child => (child.innerText || "").trim().toLowerCase() === 'withdraw')) return false;
            return true;
        });

        log(`🔎 Found ${withdrawBtns.length} potential Withdraw buttons.`, 'INFO');

        let cycleWithdrawals = 0;

        for (const btn of withdrawBtns) {
            if (!LinkedInBot.isWithdrawing) break;

            // Check if button is still in DOM (might have been removed if list shifted)
            if (!document.body.contains(btn)) continue;

            // Safety check
            await handleSecurityCheckpoint();

            // 2. Find container dynamically by traversing up until we encapsulate the metadata
            let container = btn.parentElement;
            let foundCard = false;
            let timeTextFound = "";
            let nameFound = "Unknown";
            let fullText = "";

            for (let i = 0; i < 9; i++) {
                if (!container || container.tagName === 'BODY') break;
                fullText = (container.innerText || "").toLowerCase();
                // A valid card container will have "sent [time] ago" and "withdraw"
                if (fullText.includes('sent') && (fullText.includes('ago') || fullText.includes('week') || fullText.includes('month') || fullText.includes('year'))) {
                    foundCard = true;
                    break;
                }
                container = container.parentElement;
            }

            if (!container) continue;

            // Extract just the line with "Sent" if possible for logging
            const lines = container.innerText.split('\n').map(l => l.trim()).filter(l => l);
            const sentLine = lines.find(l => l.toLowerCase().includes('sent') && (l.toLowerCase().includes('ago') || l.toLowerCase().includes('week') || l.toLowerCase().includes('month') || l.toLowerCase().includes('year')));

            // Use full text if line not found
            timeTextFound = sentLine ? sentLine : fullText;

            // Name is usually the first non-empty line in the card block
            if (lines.length > 0) nameFound = lines[0];

            if (!foundCard) {
                // Not a valid invitation card or couldn't parse time
                continue;
            }

            let shouldWithdraw = false;
            const lowerTimeText = timeTextFound.toLowerCase();

            // PARSING LOGIC
            // Only withdraw if older than 2 weeks
            if (lowerTimeText.includes('year') || lowerTimeText.includes('month')) {
                // Any month or year is > 2 weeks
                shouldWithdraw = true;
            } else if (lowerTimeText.includes('week')) {
                // "sent 3 weeks ago", "3 weeks", etc.
                const match = lowerTimeText.match(/(\d+)\s+week/);
                if (match && parseInt(match[1], 10) >= 2) {
                    shouldWithdraw = true;
                }
            }

            if (!shouldWithdraw) {
                log(`   ⌛ Skipping ${nameFound} (${timeTextFound}) - too new.`, 'DEBUG');
                continue;
            }

            log(`🗑️ Withdrawing request to ${nameFound} (${timeTextFound})...`, 'INFO');

            if (btn) {
                // Find actual clickable parent (a link or button)
                let clickableBtn = btn;
                for (let i = 0; i < 3; i++) {
                    if (clickableBtn.tagName === 'BUTTON' || clickableBtn.tagName === 'A' || clickableBtn.getAttribute('role') === 'button') break;
                    if (clickableBtn.parentElement) clickableBtn = clickableBtn.parentElement;
                }

                clickableBtn.click();

                // 3. Wait for modal (up to 3s)
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
                    log('   🔍 Modal found. Searching for confirm button...', 'DEBUG');

                    const modalBtns = Array.from(modal.querySelectorAll('button, [role="button"]'));
                    confirmBtn = modalBtns.find(b => {
                        const txt = (b.innerText || "").trim().toLowerCase();
                        return txt === 'withdraw';
                    });

                    // Fallback to any primary button if exact text match fails
                    if (!confirmBtn) {
                        confirmBtn = modal.querySelector('.artdeco-button--primary');
                    }
                } else {
                    // Fallback: Global search for Confirm button since modal class might be obfuscated
                    log('   ⚠️ Modal container not found. Scanning globally for Confirmation...', 'WARNING');
                    const allNodesNow = Array.from(document.querySelectorAll('button, span, div'));
                    // Look for a blue button that says "Withdraw" and isn't the original card button
                    confirmBtn = allNodesNow.find(b => {
                        const txt = (b.innerText || "").trim().toLowerCase();
                        return txt === 'withdraw' && b !== btn && b.offsetParent !== null && b.classList.contains('artdeco-button--primary');
                    });
                }

                if (confirmBtn) {
                    // ENSURE WE CLICK THE ACTUAL BUTTON (traverse up if we found a span/div)
                    let modalClickable = confirmBtn;
                    for (let i = 0; i < 3; i++) {
                        if (modalClickable.tagName === 'BUTTON' || modalClickable.tagName === 'A') break;
                        if (modalClickable.parentElement) modalClickable = modalClickable.parentElement;
                    }

                    log('   ✅ Clicking Confirm Button...', 'INFO');
                    modalClickable.click();
                    await randomSleep(3000, 1000); // Wait for modal to close

                    // Update Statistics (Unified)
                    await window.StatsManager.increment('withdraw');
                    chrome.storage.local.set({ lastWithdrawDate: new Date().toISOString() });

                    sessionWithdrawn++;
                    log(`   📊 Withdrawn in session: ${sessionWithdrawn}`, 'SUCCESS');
                    cycleWithdrawals++;
                    // Reset scroll counter since we found a withdrawal
                    scrollAttempts = 0;

                    break; // Process one withdrawal per cycle to avoid rapid-fire
                } else {
                    log('   ❌ Confirm button NOT found (Modal or Global).', 'ERROR');
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

        // 1. Element-based scrolling (MOST RELIABLE for triggering lazy loaders)
        if (withdrawBtns.length > 0) {
            const lastBtn = withdrawBtns[withdrawBtns.length - 1];
            log(`   📜 Scrolling last invitation into view...`, 'DEBUG');
            lastBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomSleep(1000, 500);
        }

        // 2. Container-based scrolling (Backwards compatibility/Fallback)
        const scrollSelectors = [
            'main#workspace',
            '#workspace',
            'main',
            'div.artdeco-modal__content',
            '.invitation-manager-v2-main',
            'section.scaffold-layout__list'
        ];

        let scrollContainer = null;
        let beforeHeight = 0;

        for (const selector of scrollSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                scrollContainer = el;
                beforeHeight = el.scrollHeight;
                log(`   Container scroll: ${selector} (Height: ${beforeHeight})`, 'DEBUG');
                el.scrollTop = el.scrollHeight + 1000;
                break;
            }
        }

        // 3. Window-based scrolling (Ultimate fallback)
        window.scrollBy(0, 1000);
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

        if (!scrollContainer) {
            beforeHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
            scrollContainer = { scrollHeight: beforeHeight };
        }

        // Check for "Load more" button and click it
        await randomSleep(2000, 1000); // 1-3 seconds (human-like variation)
        const loadMoreBtn = Array.from(document.querySelectorAll('button')).find(btn => {
            const txt = (btn.innerText || "").trim().toLowerCase();
            return txt === 'load more' || txt.includes('show more results') || btn.classList.contains('scaffold-finite-scroll__load-button');
        });

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
    log(`🎉 Auto-Withdraw complete (or stopped). Total withdrawn this session: ${sessionWithdrawn}`, 'INFO');
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
