// --- FEATURE: AUTO-CONNECT ---

// Heuristics for skipping likely male profiles (if requested logic is active)
// Note: This logic was in the original file. Keeping it local to this feature.
const femaleHeuristics = {
    suffixes: ['a', 'i', 'shree', ' Lakshmi', ' Kumari', ' Kaur', ' Begum', ' Khatun', 'shika', 'nita', 'vya', 'mya', 'tya'],
    names: ['Anjali', 'Priya', 'Sneha', 'Deepika', 'Priyanka', 'Neha', 'Ritu', 'Kajal', 'Simran', 'Pooja', 'Sakshi', 'Ananya', 'Ishita']
};

function isLikelyFemale(name) {
    if (!name) return false;
    const n = name.toLowerCase().trim();
    if (femaleHeuristics.names.some(hn => n.startsWith(hn.toLowerCase()))) return true;
    if (n.endsWith('a') || n.endsWith('i') || n.endsWith('e')) return true;
    return femaleHeuristics.suffixes.some(s => n.endsWith(s.toLowerCase()));
}

window.startAutoConnect = async function (settings = {}) {
    if (LinkedInBot.isConnecting) return;

    // SAFETY CHECK INIT
    await handleSecurityCheckpoint();

    LinkedInBot.isConnecting = true;
    // Restore count if passed or valid
    LinkedInBot.connectCount = settings.startCount || LinkedInBot.connectCount || 0;

    // SMART LIMIT: Randomize target by +/- 10
    const originalLimit = parseInt(settings.limit, 10) || 50;
    const smartLimit = window.getSmartLimit(originalLimit, 10);

    // Override the simplistic setting
    settings.limit = smartLimit;

    const delay = settings.delay || 10;

    // PERSISTENCE: Save state so we can resume after reload
    chrome.storage.local.set({
        autoConnectRunning: true,
        connectSettings: settings,
        connectCount: LinkedInBot.connectCount
    });

    log(`🤝 Starting Refined Auto-Connect (Target: ${originalLimit} → Smart Limit: ${smartLimit}, Delay: ${delay}s)...`, 'INFO');

    const targetSections = [
        "People you may know based on your recent activity",
        "Software Engineers you may know",
        "People you may know in Greater Bengaluru Area",
        "People in the Software Development industry you may know",
        "People you may know from Chitkara University"
    ];

    while (LinkedInBot.isConnecting) {
        // Continuous Safety Check - PAUSE if needed
        await handleSecurityCheckpoint();
        if (!LinkedInBot.isConnecting) break; // Check if user stopped it manually during pause

        // Find and expand "Show all" buttons in target sections
        const sections = Array.from(document.querySelectorAll('section, .artdeco-card'));
        for (const section of sections) {
            const header = section.querySelector('h2, h3, h4')?.innerText || "";
            if (targetSections.some(ts => header.includes(ts))) {
                const showAllBtn = section.querySelector('button[aria-label*="Show all"], button[aria-label*="See all"]');
                if (showAllBtn) {
                    log(`Expanding section: ${header}`, 'DEBUG');
                    showAllBtn.click();
                    await randomSleep(3000, 1000); // 2-4 seconds
                }
            }
        }

        // Check if a modal is open
        const modal = document.querySelector('.artdeco-modal');
        const container = modal || document;

        if (modal) {
            log('Processing profiles in popup modal...', 'DEBUG');
        }

        // Find all connect buttons
        const buttons = Array.from(container.querySelectorAll('button'))
            .filter(btn => btn.innerText.trim() === 'Connect' && !btn.disabled);

        if (buttons.length === 0) {
            if (modal) {
                const scrollable = modal.querySelector('.artdeco-modal__content') || modal;
                log('No more buttons in modal. Scrolling modal...', 'DEBUG');
                scrollable.scrollBy(0, 500);
                await randomSleep(2000, 1000); // 1-3 seconds

                // If we scrolled and still no buttons, maybe we're done with the modal
                const stillNoButtons = Array.from(container.querySelectorAll('button'))
                    .filter(btn => btn.innerText.trim() === 'Connect' && !btn.disabled).length === 0;

                if (stillNoButtons) {
                    log('Finished with modal. Closing...', 'INFO');
                    modal.querySelector('button[aria-label*="Dismiss"], .artdeco-modal__dismiss')?.click();
                    await randomSleep(1000, 500); // 0.5-1.5 seconds
                }
            } else {
                log('No more connect buttons found. Scrolling page...', 'INFO');
                window.scrollBy(0, 1000);
                await randomSleep(3000, 1000); // 2-4 seconds

                // Check if we reached the end
                if (document.body.scrollHeight - window.scrollY < 1500) {
                    // FIRST: Try clicking "Load more" button if available
                    const loadMoreBtn = Array.from(document.querySelectorAll('button')).find(b =>
                        b.innerText.trim().toLowerCase().includes('load') &&
                        b.innerText.trim().toLowerCase().includes('more')
                    );

                    if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
                        log('📄 Clicking "Load more" button to fetch more profiles...', 'INFO');
                        loadMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await randomSleep(1000);
                        loadMoreBtn.click();
                        await randomSleep(3000, 1000); // Wait for new profiles to load
                        continue; // Continue the loop to find new buttons
                    }

                    // SECOND: If no Load More button, check reload limit
                    if (!LinkedInBot.connectReloadCount) LinkedInBot.connectReloadCount = 0;
                    LinkedInBot.connectReloadCount++;

                    if (LinkedInBot.connectReloadCount >= 3) {
                        log('⛔ No more profiles available after 3 reloads. Stopping automation.', 'WARNING');
                        LinkedInBot.isConnecting = false;
                        chrome.storage.local.set({ autoConnectRunning: false });
                        break;
                    }

                    log(`Reached end of page. Reloading for fresh leads (${LinkedInBot.connectReloadCount}/3)... ⏳`, 'WARNING');
                    await randomSleep(5000, 2000); // 3-7 seconds
                    window.scrollTo(0, 0);
                    chrome.storage.local.set({ autoConnectRunning: true });
                    window.location.reload();
                    return; // Stop script execution here
                } else {
                    // Reset reload count if we found more content by scrolling
                    LinkedInBot.connectReloadCount = 0;
                }
            }
            continue;
        }

        for (const btn of buttons) {
            if (!LinkedInBot.isConnecting) break;

            // Enhanced Limit Check (Modals & Toasts)
            const limitElement = document.querySelector('.artdeco-modal') || document.querySelector('div[role="alert"]') || document.querySelector('.artdeco-toast');
            if (limitElement) {
                const text = limitElement.innerText.toLowerCase();
                if (text.includes('reached the weekly limit') || text.includes('reached your weekly limit') || text.includes('invitation was not sent')) {
                    log('⛔ Weekly limit detected! Stopping.', 'WARNING');
                    LinkedInBot.isConnecting = false;
                    break;
                }
            }

            const card = btn.closest('.artdeco-card, li, div[class*="discover-entity-type-card"], .artdeco-modal__content li');
            const name = card?.querySelector('[class*="name"], [class*="title"]')?.innerText || "";

            if (name && !isLikelyFemale(name)) {
                log(`Skipping ${name} (Likely Male)`, 'DEBUG');
                continue;
            }

            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomSleep(1000, 500); // 0.5-1.5 seconds

            log(`🤝 Connecting with: ${name || 'Member'}. Waiting ${delay}s...`, 'SUCCESS');
            btn.click();

            // Update Statistics (Unified)
            await window.StatsManager.increment('connect');

            // Store Last Connect Date for user visibility
            chrome.storage.local.set({ lastConnectDate: new Date().toISOString() });

            // Post-click check (catch immediate toasts/modals)
            await randomSleep(2000, 1000); // 1-3 seconds
            const postClickCheck = document.querySelector('.artdeco-modal') || document.querySelector('div[role="alert"]') || document.querySelector('.artdeco-toast');
            if (postClickCheck) {
                const text = postClickCheck.innerText.toLowerCase();
                if (text.includes('reached the weekly limit') || text.includes('reached your weekly limit') || text.includes('invitation was not sent')) {
                    log('⛔ Weekly limit detected immediately! Stopping.', 'WARNING');
                    LinkedInBot.isConnecting = false;
                    break;
                }
            }

            // Wait remaining time
            if (delay > 2) await randomSleep((delay - 2) * 1000, 1000); // Remaining time ±1s
        }
    }

    LinkedInBot.isConnecting = false;
    log('🎉 Auto-Connect operation complete.', 'INFO');
};
