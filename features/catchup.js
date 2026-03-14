// --- FEATURE: CATCH-UP ---

window.startAutoCatchUp = async function (settings = {}) {
    if (LinkedInBot.isCatchingUp) return;
    LinkedInBot.isCatchingUp = true;
    LinkedInBot.catchUpCount = 0;
    const type = settings.type || 'all';
    const sessionLimit = settings.limit || 200;

    log(`🎂 Starting Catch-Up (${type})...`, 'INFO');

    // Scroll Loop: Retry up to 5 times if no contacts found or exhausted
    let scrollAttempts = 0;
    const maxScrolls = 5;

    // Load processed names from Storage (Persistent Memory)
    let processedNames = new Set();
    try {
        const data = await chrome.storage.local.get(['catchUpProcessed']);
        if (data.catchUpProcessed) {
            processedNames = new Set(data.catchUpProcessed);
            log(`🧠 Loaded ${processedNames.size} known contacts from memory.`, 'INFO');
        }

        // Use StatsManager for count
        if (!window.StatsManager.state) await window.StatsManager.init();
        LinkedInBot.catchUpCount = window.StatsManager.state.catchup.total || 0;

    } catch (e) { console.error(e); }

    while (LinkedInBot.isCatchingUp && scrollAttempts < maxScrolls) {

        // SAFETY CHECK - PAUSE if needed
        await handleSecurityCheckpoint();
        if (!LinkedInBot.isCatchingUp) break;

        // 1. Find all actionable triggers
        const triggers = Array.from(document.querySelectorAll('a[href*="/messaging/compose"], button[aria-label]')).filter(el => {
            const label = (el.getAttribute('aria-label') || '').toLowerCase();
            return label.includes('message ') ||
                label.includes('say happy') ||
                label.includes('congratulate') ||
                label === 'like' ||
                label.includes('react');
        });

        log(`Found ${triggers.length} actionable items on screen. (Scroll ${scrollAttempts}/${maxScrolls})`, 'INFO');

        let actionTakenOnPage = false;

        for (const trigger of triggers) {
            if (!LinkedInBot.isCatchingUp) break;

            const label = trigger.getAttribute('aria-label') || '';
            const href = trigger.getAttribute('href') || '';
            const parentCard = trigger.closest('li, .artdeco-card, [data-view-name*="card"], .nt-card, .mn-nurture-card, .mn-nurture-list__item');

            // Extract Action Type
            const isLikeAction = label.toLowerCase().includes('like') || label.toLowerCase().includes('react') || label.toLowerCase().includes('reaction');
            const actionPrefix = isLikeAction ? 'like_' : 'msg_';

            // Generate a truly UNIQUE ID for this person + action
            let idBase = label;
            if (href.includes('profileUrn=')) {
                idBase = href.split('profileUrn=')[1].split('&')[0];
            } else if (parentCard) {
                const profileLink = parentCard.querySelector('a[href*="/in/"]');
                if (profileLink) {
                    idBase = profileLink.href.split('?')[0].split('/in/')[1]?.replace(/\/$/, '') || profileLink.href;
                } else {
                    // Fallback to card text summary
                    idBase = parentCard.innerText.split('\n')[0].trim();
                }
            }

            const uniqueId = `${actionPrefix}${idBase}`;

            if (processedNames.has(uniqueId)) continue;
            processedNames.add(uniqueId);
            chrome.storage.local.set({ 'catchUpProcessed': Array.from(processedNames) });

            const labelLower = label.toLowerCase();

            // Check filters
            if (type === 'birthday' && !labelLower.includes('birthday')) continue;
            if (type === 'career' && !(labelLower.includes('anniversary') || labelLower.includes('job') || labelLower.includes('position') || labelLower.includes('started'))) continue;

            // Extract Name for logging
            let name = "Connection";
            const nameMatch = label.match(/Message\s+(.*?):/i);
            if (nameMatch && nameMatch[1]) name = nameMatch[1].trim();
            else if (labelLower.includes('say happy') || labelLower.includes('congratulate')) name = label.replace(/(say happy.*to|congratulate)\s+/i, '').trim();
            else if (isLikeAction) {
                const nameFromCard = parentCard ? parentCard.innerText.split('\n')[0].trim() : "";
                name = nameFromCard || "Connection";
            }

            // branch: Like vs Message
            if (isLikeAction) {
                // Find the actual button inside if 'open reactions menu' was the trigger
                let likeBtn = trigger;
                if (labelLower.includes('menu')) {
                    // Look for a sibling or child button that is just the Like button
                    likeBtn = trigger.parentElement.querySelector('button[aria-label="Like"]') || trigger;
                }

                const isAlreadyLiked = likeBtn.classList.contains('active') || likeBtn.getAttribute('aria-pressed') === 'true' || likeBtn.innerHTML.includes('fill="#378fe9"');
                if (!isAlreadyLiked) {
                    log(`   👍 Liking update for: ${name}...`, 'INFO');
                    likeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await randomSleep(1000);
                    likeBtn.click();
                    actionTakenOnPage = true;
                    await randomSleep(2000);
                }
                continue;
            }

            log(`✉️ Opening composer for: ${name}...`, 'INFO');
            trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomSleep(1500);
            trigger.click();

            actionTakenOnPage = true;
            await randomSleep(3500, 1000);

            // Find Send Button (Standard + Shadow DOM)
            const findSendBtn = () => {
                const shadowHost = document.querySelector('#interop-outlet');
                if (shadowHost && shadowHost.shadowRoot) {
                    const shadowBtns = Array.from(shadowHost.shadowRoot.querySelectorAll('button.msg-form__send-button, button[type="submit"]'));
                    return shadowBtns.reverse().find(b => !b.disabled);
                }
                const allGlobalBtns = Array.from(document.querySelectorAll('button'));
                return allGlobalBtns.filter(b => {
                    const t = b.innerText.trim().toUpperCase();
                    return (t === 'SEND' || t === 'SUBMIT' || b.classList.contains('msg-form__send-button')) && b.offsetParent !== null;
                }).reverse().find(b => !b.disabled);
            };

            let sendBtn = null;
            for (let k = 0; k < 12; k++) {
                sendBtn = findSendBtn();
                if (sendBtn && !sendBtn.disabled) break;
                await randomSleep(500);
            }

            if (sendBtn && !sendBtn.disabled) {
                log(`   ✅ Clicking Send...`, 'DEBUG');
                try {
                    sendBtn.click();
                    sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

                    await window.StatsManager.increment('catchup');
                    chrome.storage.local.set({ lastCatchUpDate: new Date().toISOString() });

                    LinkedInBot.catchUpCount++;
                    log(`   📊 Progress: ${LinkedInBot.catchUpCount}/${sessionLimit}`, 'INFO');

                    if (LinkedInBot.catchUpCount >= sessionLimit) {
                        log(`✅ Catch-Up Limit Reached (${sessionLimit}). Stopping.`, 'SUCCESS');
                        LinkedInBot.isCatchingUp = false;
                        break;
                    }
                } catch (e) { log("   ❌ Send error: " + e.message, 'ERROR'); }
            } else {
                log("   ⚠️ Send button not enabled. Skipping.", 'WARNING');
            }

            await randomSleep(1500);
            const closeBtn = document.querySelector('button[aria-label*="Dismiss"], .msg-overlay-bubble-header__control--close-btn');
            if (closeBtn) closeBtn.click();
            await randomSleep(1000);
        }

        // --- Scrolling Strategy ---
        log(`   Scrolling down to load more...`, 'DEBUG');

        // Target the specific scrollable container if it exists
        const mainScroll = document.getElementById('workspace') || document.querySelector('.scaffold-layout__main') || document.querySelector('.mn-nurture-list');

        if (mainScroll) {
            mainScroll.scrollTop = mainScroll.scrollHeight;
            await randomSleep(1000);
            mainScroll.scrollBy(0, -200);
            await randomSleep(500);
            mainScroll.scrollBy(0, 400);
        } else {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            await randomSleep(1000);
            window.scrollBy(0, -300);
            await randomSleep(500);
            window.scrollBy(0, 600);
        }
        await randomSleep(2500);

        // Infinite load button
        const showMore = document.querySelector('button[aria-label*="Show more"], button.scaffold-finite-scroll__load-button');
        if (showMore) {
            log('   Clicking "Show more"...', 'INFO');
            showMore.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomSleep(1000);
            showMore.click();
            await randomSleep(3000);
        }

        // IMPORTANT: Only reset attempts if we actually clicked something new
        if (actionTakenOnPage) scrollAttempts = 0;
        else scrollAttempts++;
    }

    LinkedInBot.isCatchingUp = false;
    chrome.storage.local.set({ catchUpRunning: false });
    log('🎉 Catch-Up operation complete.', 'INFO');
};
