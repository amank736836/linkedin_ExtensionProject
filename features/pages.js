// --- FEATURE: PAGES AGENT ---

window.runPagesAutomation = async function (settings = {}) {
    if (LinkedInBot.isPagesRunning) return;
    LinkedInBot.isPagesRunning = true;

    // Use StatsManager for count
    if (!window.StatsManager.state) await window.StatsManager.init();
    LinkedInBot.pagesCount = window.StatsManager.state.pages.total || 0;

    const limit = settings.limit || 500;
    const mode = settings.mode || 'follow'; // 'follow' or 'unfollow'

    log(`🏢 Starting Pages Automation (Mode: ${mode.toUpperCase()}, Limit: ${limit})...`, 'INFO');

    let scrollAttempts = 0;
    const maxScrolls = 5;

    while (LinkedInBot.isPagesRunning && LinkedInBot.pagesCount < limit && scrollAttempts < maxScrolls) {

        // SAFETY CHECK - PAUSE if needed
        await handleSecurityCheckpoint();
        if (!LinkedInBot.isPagesRunning) break;

        // 1. Identify Context & Selectors (BUTTON FIRST STRATEGY)
        let actionableButtons = [];

        // Find ALL elements that look like Follow/Following buttons, ignoring obfuscated tags
        const allNodes = Array.from(document.querySelectorAll('span, div, button, a, p'));

        if (mode === 'follow') {
            actionableButtons = allNodes.filter(b => {
                const t = (b.innerText || "").trim().toLowerCase();
                // Optimization: Find innermost element (if any child has the exact same text, skip this parent)
                if (Array.from(b.querySelectorAll('*')).some(child => (child.innerText || "").trim().toLowerCase() === 'follow')) return false;
                return t === 'follow' && !b.disabled && b.offsetParent !== null;
            });
        } else {
            // mode === 'unfollow'
            actionableButtons = allNodes.filter(b => {
                const t = (b.innerText || "").trim().toLowerCase();
                // Optimization: Find innermost element (if any child has the exact same text, skip this parent)
                if (Array.from(b.querySelectorAll('*')).some(child => (child.innerText || "").trim().toLowerCase() === 'following')) return false;

                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                return (t === 'following' || aria.includes('following') || aria.includes('unfollow'))
                    && !b.disabled && b.offsetParent !== null;
            });
        }

        log(`Found ${actionableButtons.length} actionable '${mode}' buttons on screen.`, 'INFO');

        if (actionableButtons.length === 0) {
            log('No buttons found. Scrolling...', 'INFO');
            window.scrollBy(0, 800);
            await randomSleep(2000);
            scrollAttempts++;
            continue;
        }

        let actionTaken = false;

        for (const targetBtn of actionableButtons) {
            if (!LinkedInBot.isPagesRunning || LinkedInBot.pagesCount >= limit) break;

            // Define "item" dynamically by traversing up until we encompass enough info
            let item = targetBtn.parentElement;
            for (let i = 0; i < 7; i++) {
                if (!item || item.tagName === 'BODY') break;
                // A valid item typically has lines of text. We'll grab the first line as name.
                if (item.innerText && item.innerText.split('\n').length > 1) break;
                item = item.parentElement;
            }
            const name = item ? (item.innerText.split('\n').map(l => l.trim()).filter(l => l)[0] || "Page") : "Page";

            // Find actual clickable parent
            let clickableBtn = targetBtn;
            for (let i = 0; i < 3; i++) {
                if (clickableBtn.tagName === 'BUTTON' || clickableBtn.tagName === 'A' || clickableBtn.getAttribute('role') === 'button') break;
                if (clickableBtn.parentElement) clickableBtn = clickableBtn.parentElement;
            }

            // Scroll into view
            clickableBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomSleep(1000);

            if (mode === 'follow') {
                log(`   ➕ Following: ${name}`, 'SUCCESS');
                clickableBtn.click();

                // Update Statistics (Unified)
                await window.StatsManager.increment('pages');

                actionTaken = true;
            } else if (mode === 'unfollow') {
                log(`   ➖ Unfollowing: ${name}`, 'SUCCESS');
                clickableBtn.click();
                await randomSleep(1500); // Wait for modal to appear

                // 3. Confirm Unfollow Modal
                let modal = null;
                for (let i = 0; i < 6; i++) {
                    await randomSleep(500, 200);
                    modal = document.querySelector('.artdeco-modal');
                    if (modal) break;
                }

                if (modal) {
                    log('   🛑 Unfollow Modal detected. Searching for confirm button...', 'DEBUG');

                    // High-precision: only look at actual <button> elements with exact text
                    const modalBtns = Array.from(modal.querySelectorAll('button, [role="button"]'));
                    const confirmBtn = modalBtns.find(b => (b.innerText || "").trim().toLowerCase() === 'unfollow')
                        || modal.querySelector('.artdeco-button--primary');

                    if (confirmBtn) {
                        log('   ✅ Confirm button found. Clicking...', 'SUCCESS');
                        confirmBtn.click();
                        await randomSleep(2000, 1000); // Wait for action to complete

                    } else {
                        log('   ❌ Confirm button NOT found in modal.', 'ERROR');
                        // Attempt to dismiss to avoid getting stuck
                        const dismiss = modal.querySelector('button[aria-label*="Dismiss"], .artdeco-modal__dismiss');
                        if (dismiss) dismiss.click();
                    }
                } else {
                    log('   ⚠️ Unfollow Modal NOT detected after click.', 'WARNING');
                }

                // Update Statistics (Unified)
                await window.StatsManager.increment('pages');
                chrome.storage.local.set({ lastPagesDate: new Date().toISOString() });

                actionTaken = true;
            }


            // SAFETY: Increased delay to prevent rate limiting (5-10 seconds)
            const delay = 5000 + Math.random() * 5000;
            log(`   ⏳ Waiting ${Math.round(delay / 1000)}s...`, 'DEBUG');
            await randomSleep(delay);
        }

        // 3. Scroll & Pagination
        if (!actionTaken) {
            log('No actionable buttons visible. Checking for "Show more" button...', 'INFO');

            let showMoreBtn = document.querySelector('button.scaffold-finite-scroll__load-button');
            if (!showMoreBtn) {
                const allButtons = Array.from(document.querySelectorAll('button'));
                showMoreBtn = allButtons.find(b =>
                    (b.innerText || "").toLowerCase().includes('show more') && !b.disabled && b.offsetParent !== null
                );
            }

            if (showMoreBtn) {
                log(`   🔘 FOUND "Show more results" button! Clicking...`, 'INFO');
                showMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await randomSleep(1000);
                showMoreBtn.click();
                await randomSleep(3000);
                scrollAttempts = 0;
            } else {
                log('   📜 No "Show more" button. Triggering scroll...', 'INFO');

                // 1. Element-based scrolling (trigger lazy loaders)
                if (actionableButtons.length > 0) {
                    const lastBtn = actionableButtons[actionableButtons.length - 1];
                    log(`   📜 Scrolling last button found into view...`, 'DEBUG');
                    lastBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await randomSleep(1000, 500);
                }

                // 2. Container-based scrolling
                const scrollSelectors = [
                    'main#workspace',
                    '#workspace',
                    'main',
                    '.artdeco-list',
                    'section.scaffold-layout__list',
                    'div.scaffold-layout__list'
                ];

                for (const selector of scrollSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        log(`   Scrolling container: ${selector}`, 'DEBUG');
                        el.scrollTop = el.scrollHeight + 1000;
                        break;
                    }
                }

                // 3. Window-based scrolling
                window.scrollBy(0, 1000);
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

                await randomSleep(2500);
                scrollAttempts++;
            }
        } else {
            scrollAttempts = 0; // Reset scroll count if we did something
        }
    }

    LinkedInBot.isPagesRunning = false;

    if (scrollAttempts >= maxScrolls) {
        log(`🛑 Stopped: No actionable buttons found after ${maxScrolls} consecutive scrolls.`, 'WARNING');
    } else {
        log('🎉 Pages Automation complete.', 'INFO');
    }
    chrome.runtime.sendMessage({ action: 'pagesComplete' });
};
