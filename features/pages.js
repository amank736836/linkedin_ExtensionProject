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

        // Find ALL buttons that look like Follow/Following buttons
        const allButtons = Array.from(document.querySelectorAll('button'));

        if (mode === 'follow') {
            actionableButtons = allButtons.filter(b => {
                const t = b.innerText.trim().toLowerCase();
                return t === 'follow' && !b.disabled && b.offsetParent !== null;
            });
        } else {
            actionableButtons = allButtons.filter(b => {
                const t = b.innerText.trim().toLowerCase();
                return t === 'following' && !b.disabled && b.offsetParent !== null;
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

            // Define "item" as the container for logging purposes
            const item = targetBtn.closest('li') || targetBtn.closest('div.artdeco-card') || targetBtn.closest('div');
            const name = item ? (item.innerText.split('\n')[0] || "Page") : "Page";

            // Scroll into view
            targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomSleep(1000);

            if (mode === 'follow') {
                log(`   ➕ Following: ${name}`, 'SUCCESS');
                targetBtn.click();

                // Update Statistics (Unified)
                await window.StatsManager.increment('pages');

                actionTaken = true;
            } else if (mode === 'unfollow') {
                log(`   ➖ Unfollowing: ${name}`, 'SUCCESS');
                targetBtn.click();
                await randomSleep(1500); // Wait for modal to appear

                // Confirm Unfollow Modal
                const modal = document.querySelector('.artdeco-modal');
                if (modal) {
                    log('   🛑 Unfollow Modal detected. Looking for confirm button...', 'DEBUG');
                    const modalBtns = Array.from(modal.querySelectorAll('button'));

                    // Try 1: Explicit "Unfollow" text
                    let confirmBtn = modalBtns.find(b => b.innerText.trim().toLowerCase() === 'unfollow');

                    // Try 2: "Unfollow" in aria-label
                    if (!confirmBtn) confirmBtn = modalBtns.find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('unfollow'));

                    // Try 3: Primary Button in Modal (usually the action button)
                    if (!confirmBtn) confirmBtn = modal.querySelector('.artdeco-button--primary');

                    if (confirmBtn) {
                        log('   ✅ Confirm button found. Clicking...', 'SUCCESS');
                        confirmBtn.click();
                        await randomSleep(1500); // Wait for action to complete
                    } else {
                        log('   ⚠️ Could not find "Unfollow" confirm button in modal.', 'WARNING');
                        // Attempt to dismiss to avoid getting stuck
                        const dismiss = modal.querySelector('button[aria-label*="Dismiss"], .artdeco-modal__dismiss');
                        if (dismiss) dismiss.click();
                    }
                } else {
                    log('   ⚠️ Unfollow Modal NOT detected after click.', 'WARNING');
                }

                // Update Statistics (Unified)
                await window.StatsManager.increment('pages');

                actionTaken = true;
            }


            // SAFETY: Increased delay to prevent rate limiting (5-10 seconds)
            const delay = 5000 + Math.random() * 5000;
            log(`   ⏳ Waiting ${Math.round(delay / 1000)}s...`, 'DEBUG');
            await randomSleep(delay);
        }

        // 3. Scroll & Pagination - ALWAYS CHECK FOR BUTTON FIRST!
        if (!actionTaken) {
            log('No actionable buttons visible. Checking for pagination button...', 'INFO');

            // ALWAYS CHECK FOR THE BUTTON BEFORE SCROLLING
            // Strategy 1: LinkedIn's specific load more button class
            let showMoreBtn = document.querySelector('button.scaffold-finite-scroll__load-button');
            log(`   🔍 Class selector found button: ${!!showMoreBtn}`, 'DEBUG');

            // Strategy 2: Fallback to text search if class selector fails
            if (!showMoreBtn) {
                log('   🔍 Trying text-based search for "show more"...', 'DEBUG');
                const allButtons = Array.from(document.querySelectorAll('button'));
                showMoreBtn = allButtons.find(b =>
                    b.innerText &&
                    b.innerText.toLowerCase().includes('show more') &&
                    !b.disabled &&
                    b.offsetParent !== null  // Must be visible
                );
                log(`   🔍 Text search found button: ${!!showMoreBtn}`, 'DEBUG');
            }

            // If button exists, CLICK IT (don't scroll!)
            if (showMoreBtn) {
                log(`   🔘 FOUND "Show more results" button! Clicking instead of scrolling...`, 'INFO');
                showMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await randomSleep(500);
                showMoreBtn.click();
                log(`   ✅ Show more button clicked successfully!`, 'SUCCESS');
                await randomSleep(3000);  // Wait for content to load
                scrollAttempts = 0; // Reset scroll counter
            } else {
                // Only scroll if button doesn't exist
                log('   📜 No "Show more" button found. Scrolling to load more content...', 'DEBUG');
                window.scrollBy(0, 800);
                await randomSleep(2000);
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
