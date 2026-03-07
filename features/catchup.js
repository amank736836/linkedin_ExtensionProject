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

        // 1. Find all visible Cards (more robust than just finding links)
        const cards = Array.from(document.querySelectorAll('div[data-view-name="nurture-card"], li.artdeco-list__item'));

        log(`Found ${cards.length} cards on this screen. (Scroll ${scrollAttempts}/${maxScrolls})`, 'INFO');

        if (cards.length === 0) {
            log('No cards found. Scrolling down...', 'INFO');
            window.scrollBy(0, 800);
            await randomSleep(3000);
            scrollAttempts++;
            continue;
        }

        let actionTakenOnPage = false;

        for (const card of cards) {
            if (!LinkedInBot.isCatchingUp) break;

            const nameLines = card.innerText.split('\n');
            const name = nameLines ? nameLines[0].trim() : "Connection";

            // HISTORY CHECK: Don't skip yet! Just mark as history.
            const alreadyInHistory = processedNames.has(name);

            // Add to processed list for NEXT time (if not there)
            if (!alreadyInHistory) {
                processedNames.add(name);
                chrome.storage.local.set({ 'catchUpProcessed': Array.from(processedNames) });
            }

            const cardText = card.innerText.toUpperCase();

            // Filter by Type (Soft check based on text)
            if (type === 'birthday' && !cardText.includes('BIRTHDAY')) continue;
            if (type === 'career' && !(cardText.includes('ANNIVERSARY') || cardText.includes('JOB') || cardText.includes('POSITION'))) continue;

            // 1. LIKE ACTION (Strictly Likes/Reactions)
            let likeBtn = card.querySelector('button[aria-label="Open reactions menu"], button[aria-label*="reactions"], button[aria-label*="React"], button[aria-label^="Like"], .react-button__trigger');

            if (!likeBtn) {
                const allCardBtns = Array.from(card.querySelectorAll('button'));
                likeBtn = allCardBtns.find(b => b.innerText.trim() === 'Like');
            }

            // RELIABLE CHECK using User's snippets and button state
            const cardHtml = card.innerHTML;
            const hasBlueFill = cardHtml.includes('fill="#378fe9"');
            const hasNoReactionLabel = cardHtml.includes('Reaction button state: no reaction');

            let isLiked = false;
            if (hasBlueFill) {
                isLiked = true;
            } else if (hasNoReactionLabel) {
                isLiked = false;
            } else if (likeBtn) {
                if (likeBtn.getAttribute('aria-pressed') === 'true') isLiked = true;
                if (likeBtn.className.includes('active') || likeBtn.classList.contains('artdeco-button--primary')) isLiked = true;
                const label = (likeBtn.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('undo') || label.includes('reacted') || label.includes('remove reaction')) isLiked = true;
                if (likeBtn.innerHTML.includes('#378fe9') || likeBtn.innerHTML.includes('artdeco-button__icon--filled')) isLiked = true;
            }

            if (likeBtn && !isLiked) {
                log(`   👍 Clicking Like for ${name}...`, 'INFO');
                likeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await randomSleep(500);

                // STEP 1: Click the trigger to open the menu
                likeBtn.click();
                await randomSleep(800);

                // STEP 2: Find the specific "Like" reaction button (Tray Logic)
                const reactionTray = document.querySelector('.artdeco-hoverable-content__content, .reactions-menu');
                let reactionOption = null;

                if (reactionTray) {
                    reactionOption = reactionTray.querySelector('button[aria-label="Like"]');
                }

                if (reactionOption) {
                    reactionOption.click();
                    await randomSleep(1000);
                } else {
                    const allLikeOptions = Array.from(document.querySelectorAll('button[aria-label="Like"]'));
                    const visibleOption = allLikeOptions.find(b => b.offsetParent !== null && b !== likeBtn);
                    if (visibleOption) {
                        visibleOption.click();
                    } else {
                        log('      Could not find reaction option. Assuming standard click worked.', 'WARNING');
                    }
                }
                await randomSleep(1500);
                actionTakenOnPage = true;
            }

            // 2. MESSAGE ACTION (Button Priority)
            if (alreadyInHistory || cardText.includes('MESSAGE SENT')) {
                log(`   Skipping Message for ${name} (History/Sent).`, 'DEBUG');
                continue;
            }

            let messageTriggerBtn = card.querySelector('button[aria-label*="Say happy birthday"], button[aria-label*="Congratulate"], button[aria-label*="Message"], button[aria-label*="Wishing you"], button[aria-label*="Happy"]');

            const messageLink = card.querySelector('a[href*="/messaging/compose/"]');

            if (!messageTriggerBtn) {
                const buttons = Array.from(card.querySelectorAll('button'));
                messageTriggerBtn = buttons.find(b => {
                    const t = b.innerText.toLowerCase();
                    return t.includes('say happy') ||
                        t.includes('congratulate') ||
                        t.includes('message') ||
                        t.includes('wishing you') ||
                        t.includes('happy birthday') ||
                        t.includes('happy work anniversary') ||
                        t.includes('happy anniversary') ||
                        t.includes('happy belated');
                });
            }

            const hasPropUrn = messageLink && messageLink.href.toUpperCase().includes('PROPURN');

            if (messageTriggerBtn || messageLink) {

                log(`🎂 Sending request to: ${name}...`, 'INFO');

                // PERSISTENCE: Mark as running BEFORE we might navigate
                chrome.storage.local.set({
                    catchUpRunning: true,
                    catchUpSettings: { type }
                });

                if (messageTriggerBtn) {
                    messageTriggerBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await randomSleep(1000);
                    messageTriggerBtn.click();
                } else {
                    log('   ⚠️ No Message Button found. Clicking Link (May navigate)...', 'WARNING');
                    messageLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await randomSleep(1000);

                    // If it's a messaging/compose link, it often navigates. 
                    // Let's try to click it and let content.js handle recovery if it navigates.
                    messageLink.click();
                }

                await randomSleep(3500);
                actionTakenOnPage = true;

                // Helper to find the SEND button
                const findSendButton = () => {
                    const shadowHost = document.querySelector('#interop-outlet');
                    if (shadowHost && shadowHost.shadowRoot) {
                        const shadowBtns = Array.from(shadowHost.shadowRoot.querySelectorAll('button.msg-form__send-button, button[type="submit"]'));
                        const enabledBtn = shadowBtns.reverse().find(b => !b.disabled);
                        if (enabledBtn) return enabledBtn;
                        if (shadowBtns.length > 0) return shadowBtns[shadowBtns.length - 1];
                    }
                    const allBtns = Array.from(document.querySelectorAll('button'));
                    const candidates = allBtns.filter(b => {
                        const text = b.innerText.trim().toUpperCase();
                        return (text === 'SEND' || text === 'SUBMIT' || b.classList.contains('msg-form__send-button')) && b.offsetParent !== null;
                    });

                    const enabledGlobal = candidates.reverse().find(b => !b.disabled);
                    if (enabledGlobal) return enabledGlobal;

                    if (candidates.length > 0) return candidates[candidates.length - 1];
                    return null;
                };

                let sendBtn = null;
                for (let k = 0; k < 10; k++) { sendBtn = findSendButton(); if (sendBtn) break; await randomSleep(500); }

                if (sendBtn) {
                    for (let k = 0; k < 6; k++) {
                        if (!sendBtn.disabled) break;
                        await randomSleep(500);
                    }

                    if (sendBtn.disabled) {
                        log('   ⚠️ Send button is DISABLED. Form wake-up...', 'WARNING');
                        let textarea = null;
                        const shadowHost = document.querySelector('#interop-outlet');
                        if (shadowHost && shadowHost.shadowRoot) {
                            const textareas = shadowHost.shadowRoot.querySelectorAll('textarea, div[role="textbox"]');
                            if (textareas.length > 0) textarea = textareas[textareas.length - 1];
                        }
                        if (!textarea) textarea = document.querySelector('textarea, div[role="textbox"]');

                        if (textarea) {
                            textarea.focus();
                            ['input', 'change', 'keydown', 'keyup'].forEach(eventType => {
                                textarea.dispatchEvent(new Event(eventType, { bubbles: true }));
                            });
                            await randomSleep(500);
                        }
                    }

                    log(`   ✉️ Clicking Send (Text: "${sendBtn.innerText.trim()}", Disabled: ${sendBtn.disabled})...`, 'DEBUG');

                    try {
                        sendBtn.disabled = false;
                        sendBtn.click();
                        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    } catch (e) { log('   ❌ Click error: ' + e.message, 'ERROR'); }

                    // Update Statistics (Unified)
                    await window.StatsManager.increment('catchup');

                    // Keep card UI updated locally
                    card.setAttribute('data-processed', 'true');
                    log(`   📊 Progress: ${LinkedInBot.catchUpCount}/${sessionLimit}`, 'INFO');

                    if (LinkedInBot.catchUpCount >= sessionLimit) {
                        log(`✅ Catch-Up Limit Reached (${sessionLimit}). Stopping.`, 'SUCCESS');
                        LinkedInBot.isCatchingUp = false;
                        break;
                    }

                    log('   👀 Verifying message sent...', 'INFO');
                    for (let v = 0; v < 10; v++) {
                        const c = (messageLink) ? messageLink.closest('.artdeco-card, li') : null;
                        if (c && c.innerText.includes('Message sent')) { log('   ✅ Verified.', 'SUCCESS'); break; }
                        await randomSleep(500);
                    }
                } else {
                    log('   ❌ Send button disabled.', 'ERROR');
                }
                await randomSleep(1500);
                const closeBtn = document.querySelector('button[aria-label*="Dismiss"], .msg-overlay-bubble-header__control--close-btn');
                if (closeBtn) closeBtn.click();
            } else {
                const closeBtn = document.querySelector('button[aria-label*="Dismiss"], .msg-overlay-bubble-header__control--close-btn');
                if (closeBtn) closeBtn.click();
            }

            await randomSleep(1000); // Post-action delay
        }

        // --- SCROLL STRATEGY ---
        log(`FINISHED VIEW. Attempting to scroll...`, 'INFO');

        const workspace = document.getElementById('workspace');
        if (workspace) {
            const previousTop = workspace.scrollTop;

            log('   Usage: Scrolling "workspace" container...', 'DEBUG');
            workspace.scrollTop = workspace.scrollHeight;
            await randomSleep(2000);
            workspace.scrollTop += 1000;
            await randomSleep(1000);

            const showMoreBtn = document.querySelector('button.scaffold-finite-scroll__load-button');
            if (showMoreBtn) {
                log('Found "Show more results" button. Clicking...', 'INFO');
                showMoreBtn.click();
                await randomSleep(3000);
            }

            const currentTop = workspace.scrollTop;
            await randomSleep(3000);

            if (actionTakenOnPage) {
                scrollAttempts = 0;
            } else {
                if (Math.abs(currentTop - previousTop) < 10) {
                    log('⚠️ Workspace scroll stuck. Forcing...', 'WARNING');
                    workspace.scrollTop += 5000;
                    await randomSleep(2000);
                }
                scrollAttempts++;
            }
        } else {
            window.scrollTo({ top: document.body.scrollHeight + 1000, behavior: 'smooth' });
            await randomSleep(3000);
            scrollAttempts++;
        }
    }

    LinkedInBot.isCatchingUp = false;
    chrome.storage.local.set({ catchUpRunning: false });
    log('🎉 Catch-Up operation complete.', 'INFO');
};
