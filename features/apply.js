// --- FEATURE: AUTO-APPLY ---

// Helpers for Apply Form
async function fillForm() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]');
    for (const input of inputs) {
        const labelText = (input.getAttribute('aria-label') ||
            input.getAttribute('placeholder') ||
            input.parentElement?.querySelector('label')?.innerText ||
            '').toLowerCase().trim();

        if (!labelText) continue;

        let value = "";
        const settings = LinkedInBot.userSettings;

        if (labelText.includes('name') && labelText.includes('first')) value = settings.fullName.split(' ')[0];
        else if (labelText.includes('name') && labelText.includes('last')) value = settings.fullName.split(' ').pop();
        else if (labelText.includes('email')) value = settings.email;
        else if (labelText.includes('phone')) value = settings.phone;
        else if (labelText.includes('salary') || labelText.includes('expected')) value = settings.salary;
        else if (labelText.includes('notice')) value = settings.notice;
        else if (settings.customLibrary && settings.customLibrary[labelText]) {
            value = settings.customLibrary[labelText];
            log(`Found answer in library for: "${labelText}"`, 'SUCCESS');
        }

        if (value) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Radio buttons
    document.querySelectorAll('fieldset').forEach(fs => {
        const text = fs.innerText.toLowerCase();
        if (text.includes('authorized')) {
            const yes = Array.from(fs.querySelectorAll('label')).find(l => l.innerText.includes('Yes'));
            if (yes) yes.click();
        } else if (LinkedInBot.userSettings.customLibrary) {
            // Check library for fieldset questions
            const question = fs.querySelector('legend')?.innerText.toLowerCase().trim();
            if (question && LinkedInBot.userSettings.customLibrary[question]) {
                const answer = LinkedInBot.userSettings.customLibrary[question];
                const option = Array.from(fs.querySelectorAll('label')).find(l => l.innerText.trim() === answer);
                if (option) option.click();
            }
        }
    });
}

const dismissAndSave = async () => {
    log('   ❎ Dismissing form...', 'INFO');
    const dismissBtn = document.querySelector('button[aria-label*="Dismiss"]');
    if (dismissBtn) {
        dismissBtn.click();
        await randomSleep(1000);
    }

    // Check for "Save" modal (Retry a few times)
    for (let k = 0; k < 3; k++) {
        const modal = document.querySelector('.artdeco-modal');
        if (modal && (modal.innerText.includes('Save') || modal.innerText.includes('discard'))) {
            const saveBtn = Array.from(modal.querySelectorAll('button')).find(b =>
                b.innerText.trim() === 'Save' || b.classList.contains('artdeco-button--primary')
            );
            if (saveBtn) {
                log('   💾 "Save" modal found. Clicking Save...', 'SUCCESS');
                saveBtn.click();
                await randomSleep(1000);
                return;
            }
        }
        await randomSleep(500);
    }
};

window.startAutomation = async function (settings) {
    if (LinkedInBot.isRunning) return;
    LinkedInBot.isRunning = true;
    LinkedInBot.userSettings = settings;

    // SMART LIMIT: Randomize target by +/- 10
    const originalCount = parseInt(settings.maxApps) || 43;
    const targetCount = window.getSmartLimit(originalCount, 10);

    // Override the simplistic setting locally for this run
    log(`🚀 Starting Automation Run (Target: ${originalCount} → Smart Limit: ${targetCount})...`, 'INFO');

    while (LinkedInBot.applicationCount < targetCount && LinkedInBot.isRunning) {
        // Safety Clean-up at start of loop
        const strayModal = document.querySelector('.artdeco-modal');
        if (strayModal && strayModal.innerText.includes('Save')) {
            await dismissAndSave();
        }

        const cards = document.querySelectorAll('li[data-occludable-job-id]');
        log(`Found ${cards.length} jobs on this page.`, 'INFO');

        for (let i = 0; i < cards.length && LinkedInBot.applicationCount < targetCount && LinkedInBot.isRunning; i++) {
            log(`Processing job ${i + 1}/${cards.length} (Total: ${LinkedInBot.applicationCount}/${targetCount})`, 'INFO');
            cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomSleep(2000);

            const link = cards[i].querySelector('a.job-card-list__title--link');
            if (link) {
                const jobUrl = link.href;
                link.click();
                await randomSleep(3000);

                const applyBtn = document.querySelector('button.jobs-apply-button');
                if (applyBtn && !applyBtn.innerText.includes('Applied')) {
                    log('Clicking Easy Apply...', 'INFO');
                    applyBtn.click();
                    await randomSleep(2000);

                    let formHandlingAttempts = 0;
                    let success = false;

                    while (formHandlingAttempts < 5 && LinkedInBot.isRunning) {
                        await fillForm();

                        const submit = document.querySelector('button[aria-label*="Submit"]');
                        if (submit) {
                            submit.click();

                            // Update Statistics (Unified)
                            await window.StatsManager.increment('apply');

                            log(`✓ Applied! Waiting 45s...`, 'SUCCESS');
                            await randomSleep(45000);
                            // Dismiss and Handle "Save" Modal
                            await dismissAndSave();
                            success = true;
                            break;
                        } else {
                            const next = document.querySelector('button[aria-label*="Next"], button[aria-label*="Review"]');
                            if (next) {
                                log('Moving to next step...', 'INFO');
                                next.click();
                                await randomSleep(2000);
                                formHandlingAttempts++;
                            } else {
                                log('⚠️ Form stalled or unknown question detected.', 'WARNING');
                                break;
                            }
                        }
                    }

                    if (!success && LinkedInBot.isRunning) {
                        log('⚠️ Saving unknown questions to library...', 'WARNING');
                        const unanswered = [];
                        document.querySelectorAll('input:invalid, .artdeco-text-input--error input').forEach(el => {
                            const lbl = el.parentElement?.querySelector('label')?.innerText || el.getAttribute('aria-label');
                            if (lbl) unanswered.push(lbl.trim());
                        });

                        if (unanswered.length > 0) {
                            chrome.storage.local.get('unknownQuestions', (data) => {
                                const existing = data.unknownQuestions || [];
                                const combined = [...new Set([...existing, ...unanswered])];
                                chrome.storage.local.set({ unknownQuestions: combined });
                            });
                        }

                        // Dismiss and Handle "Save" Modal
                        await dismissAndSave();
                    }
                } else {
                    log('Skipping job (already applied or no Easy Apply button)', 'DEBUG');
                }
            }
        }

        // Pagination: Look for "Next" button
        if (LinkedInBot.applicationCount < targetCount && LinkedInBot.isRunning) {
            log('Finished page, looking for Next page...', 'INFO');
            const nextLink = document.querySelector('button.jobs-search-pagination__button--next');
            const pageNumbers = document.querySelectorAll('.jobs-search-pagination__indicator');

            if (nextLink && !nextLink.disabled) {
                log('Moving to next page...', 'INFO');
                nextLink.click();
                await randomSleep(5000); // Wait for page load
            } else {
                log('No more pages found.', 'WARNING');
                break;
            }
        }
    }

    LinkedInBot.isRunning = false;
    log('🎉 Automation finished or stopped.', 'INFO');
};
