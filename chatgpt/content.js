let isProcessingMem0 = false;

// Initialize the MutationObserver variable
let observer;

function createPopup(container) {
    const popup = document.createElement('div');
    popup.className = 'mem0-popup';
    popup.style.cssText = `
        display: none;
        position: absolute;
        background-color: black;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 10000;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 11px;
        white-space: nowrap;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    container.appendChild(popup);
    return popup;
}

function addMem0Button() {
    const sendButton = document.querySelector('button[aria-label="Send prompt"]');

    if (sendButton && !document.querySelector('#mem0-button')) {
        const sendButtonContainer = sendButton.parentElement;
        sendButtonContainer.style.display = 'flex';
        sendButtonContainer.style.alignItems = 'center';

        const mem0ButtonContainer = document.createElement('div');
        mem0ButtonContainer.style.position = 'relative';
        mem0ButtonContainer.style.display = 'inline-block';
        mem0ButtonContainer.style.marginRight = '-5px';

        const mem0Button = document.createElement('img');
        mem0Button.id = 'mem0-button';
        mem0Button.src = chrome.runtime.getURL('icons/mem0-claude-icon.png');
        mem0Button.style.width = '30px';
        mem0Button.style.height = '30px';
        mem0Button.style.cursor = 'pointer';
        mem0Button.style.padding = '8px';
        mem0Button.style.borderRadius = '5px';
        mem0Button.style.transition = 'filter 0.3s ease, opacity 0.3s ease';
        mem0Button.style.boxSizing = 'content-box';
        mem0Button.style.marginTop = '-3px';

        const popup = createPopup(mem0ButtonContainer);

        mem0Button.addEventListener('click', () => handleMem0Click(popup));

        mem0Button.addEventListener('mouseenter', () => {
            if (!mem0Button.disabled) {
                mem0Button.style.filter = 'brightness(70%)';
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
            }
        });
        mem0Button.addEventListener('mouseleave', () => {
            mem0Button.style.filter = 'none';
            tooltip.style.visibility = 'hidden';
            tooltip.style.opacity = '0';
        });

        const tooltip = document.createElement('div');
        tooltip.textContent = 'Add related memories';
        tooltip.style.visibility = 'hidden';
        tooltip.style.backgroundColor = 'black';
        tooltip.style.color = 'white';
        tooltip.style.textAlign = 'center';
        tooltip.style.borderRadius = '4px';
        tooltip.style.padding = '3px 6px';
        tooltip.style.position = 'absolute';
        tooltip.style.zIndex = '1';
        tooltip.style.top = 'calc(100% + 5px)';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.opacity = '0';
        tooltip.style.transition = 'opacity 0.3s';
        tooltip.style.fontSize = '12px';

        mem0ButtonContainer.appendChild(mem0Button);
        mem0ButtonContainer.appendChild(tooltip);

        // Insert the mem0Button before the sendButton
        sendButtonContainer.insertBefore(mem0ButtonContainer, sendButton);

        // Function to update button states
        function updateButtonStates() {
            const inputElement = document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
            const hasText = inputElement && inputElement.textContent.trim().length > 0;

            sendButton.disabled = !hasText;
            mem0Button.disabled = !hasText;

            if (hasText) {
                mem0Button.style.opacity = '1';
                mem0Button.style.pointerEvents = 'auto';
            } else {
                mem0Button.style.opacity = '0.5';
                mem0Button.style.pointerEvents = 'none';
            }
        }

        // Initial update
        updateButtonStates();

        // Listen for input changes
        const inputElement = document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
        if (inputElement) {
            inputElement.addEventListener('input', updateButtonStates);
        }
    }
}

async function handleMem0Click(popup) {
    const inputElement = document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
    let message = getInputValue();
    if (!message) {
        console.error('No input message found');
        showPopup(popup, 'No input message found');
        return;
    }

    const memInfoRegex = /\s*Here is some more information about me:[\s\S]*$/;
    message = message.replace(memInfoRegex, '').trim();
    const endIndex = message.indexOf('</p>');
    if (endIndex !== -1) {
        message = message.slice(0, endIndex+4);
    }

    if (isProcessingMem0) {
        return;
    }

    isProcessingMem0 = true;

    try {
        chrome.storage.sync.get(['apiKey', 'userId'], async function(data) {
            const apiKey = data.apiKey;
            const userId = data.userId || 'chrome-extension-user';

            if (!apiKey) {
                showPopup(popup, 'No API Key found');
                isProcessingMem0 = false;
                return;
            }

            const messages = getLastMessages(2);
            messages.push({ role: "user", content: message });

            // Existing search API call
            const searchResponse = await fetch('https://api.mem0.ai/v1/memories/search/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${apiKey}`
                },
                body: JSON.stringify({ query: message, user_id: userId, rerank: true, threshold: 0.1, limit: 10 })
            });

            fetch('https://api.mem0.ai/v1/memories/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${apiKey}`
                },
                body: JSON.stringify({
                    messages: messages,
                    user_id: userId,
                    infer: true
                })
            }).then(response => {
                if (!response.ok) {
                    console.error('Failed to add memory:', response.status);
                }
            }).catch(error => {
                console.error('Error adding memory:', error);
            });

            if (!searchResponse.ok) {
                throw new Error(`API request failed with status ${searchResponse.status}`);
            }

            const responseData = await searchResponse.json();

            if (inputElement) {
                const memories = responseData.map(item => item.memory);

                if (memories.length > 0) {
                    // Prepare the memories content
                    let currentContent = inputElement.tagName.toLowerCase() === 'div' ? inputElement.innerHTML : inputElement.value;

                    const memInfoRegex = /\s*<strong>Here is some more information about me:<\/strong>[\s\S]*$/;
                    currentContent = currentContent.replace(memInfoRegex, '').trim();
                    const endIndex = currentContent.indexOf('</p>');
                    if (endIndex !== -1) {
                        currentContent = currentContent.slice(0, endIndex+4);
                    }

                    let memoriesContent = '<div id="mem0-wrapper" style="background-color: rgb(220, 252, 231); padding: 8px; border-radius: 4px; margin-top: 8px; margin-bottom: 8px;">';
                    memoriesContent += '<strong>Here is some more information about me:</strong>';
                    memories.forEach(mem => {
                        memoriesContent += `<div>- ${mem}</div>`;
                    });
                    memoriesContent += '</div>';

                    // Insert the memories into the input field
                    if (inputElement.tagName.toLowerCase() === 'div') {
                        // For contenteditable div
                        inputElement.innerHTML = `${currentContent}<div><br></div>${memoriesContent}`;
                    } else {
                        // For textarea
                        inputElement.value = `${currentContent}\n${memoriesContent}`;
                    }
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    if (inputElement.tagName.toLowerCase() === 'div') {
                        inputElement.innerHTML = message;
                    } else {
                        // For textarea
                        inputElement.value = message;
                    }
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    showPopup(popup, 'No memories found');
                }
            } else {
                showPopup(popup, 'No input field found to update');
            }
        });
    } catch (error) {
        console.error('Error:', error);
    } finally {
        isProcessingMem0 = false;
    }
}

function getLastMessages(count) {
    const messageContainer = document.querySelector('.flex.flex-col.text-sm.md\\:pb-9');
    if (!messageContainer) return [];

    const messageElements = Array.from(messageContainer.children).reverse();
    const messages = [];

    for (const element of messageElements) {
        if (messages.length >= count) break;

        const userElement = element.querySelector('[data-message-author-role="user"]');
        const assistantElement = element.querySelector('[data-message-author-role="assistant"]');

        if (userElement) {
            const content = userElement.querySelector('.whitespace-pre-wrap').textContent.trim();
            messages.unshift({ role: "user", content });
        } else if (assistantElement) {
            const content = assistantElement.querySelector('.markdown').textContent.trim();
            messages.unshift({ role: "assistant", content });
        }
    }

    return messages;
}

function showPopup(popup, message) {
    popup.textContent = message;
    popup.style.display = 'block';
    setTimeout(() => {
        popup.style.display = 'none';
    }, 1000);
}

function getInputValue() {
    const inputElement = document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
    return inputElement ? (inputElement.textContent || inputElement.value) : null;
}

function addSyncButton() {
    const buttonContainer = document.querySelector('div.mt-5.flex.justify-end');
    if (buttonContainer) {
        let syncButton = document.querySelector('#sync-button');

        // If the syncButton does not exist, create it
        if (!syncButton) {
            syncButton = document.createElement('button');
            syncButton.id = 'sync-button';
            syncButton.className = 'btn relative btn-neutral mr-2';
            syncButton.innerHTML = '<div class="flex items-center justify-center text-white">Sync memories</div>';
            syncButton.style.border = '1px solid white'; // Add white border

            const syncIcon = document.createElement('img');
            syncIcon.src = chrome.runtime.getURL('icons/sync-icon.png');
            syncIcon.style.width = '16px';
            syncIcon.style.height = '16px';
            syncIcon.style.marginRight = '8px';

            syncButton.prepend(syncIcon);

            syncButton.addEventListener('click', handleSyncClick);

            syncButton.addEventListener('mouseenter', () => {
                syncButton.style.filter = 'brightness(90%)';
            });
            syncButton.addEventListener('mouseleave', () => {
                syncButton.style.filter = 'none';
            });
        }

        if (!buttonContainer.contains(syncButton)) {
            buttonContainer.insertBefore(syncButton, buttonContainer.firstChild);
        }

        // Optionally, handle the disabled state
        function updateSyncButtonState() {
            // Define when the sync button should be enabled or disabled
            syncButton.disabled = false; // For example, always enabled
            // Update opacity or pointer events if needed
            if (syncButton.disabled) {
                syncButton.style.opacity = '0.5';
                syncButton.style.pointerEvents = 'none';
            } else {
                syncButton.style.opacity = '1';
                syncButton.style.pointerEvents = 'auto';
            }
        }

        updateSyncButtonState();
    } else {
        // If resetMemoriesButton or specificTable is not found, remove syncButton from DOM
        const existingSyncButton = document.querySelector('#sync-button');
        if (existingSyncButton && existingSyncButton.parentNode) {
            existingSyncButton.parentNode.removeChild(existingSyncButton);
        }
    }
}

function handleSyncClick() {
    const table = document.querySelector('table.w-full.border-separate.border-spacing-0');
    const syncButton = document.querySelector('#sync-button');

    if (table && syncButton) {
        const rows = table.querySelectorAll('tbody tr');
        let syncedCount = 0;
        let totalCount = rows.length;

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 1) {
                const memory = {
                    content: cells[0].querySelector('div.whitespace-pre-wrap').textContent.trim(),
                    timestamp: new Date().toISOString()
                };

                sendMemoryToMem0(memory)
                    .then(() => {
                        syncedCount++;
                        if (syncedCount === totalCount) {
                            showSyncPopup(syncButton, `${syncedCount} memories synced`);
                        }
                    })
                    .catch(error => {
                        console.error('Error syncing memory:', error);
                        if (syncedCount === totalCount) {
                            showSyncPopup(syncButton, `${syncedCount}/${totalCount} memories synced`);
                        }
                    });
            }
        });
    } else {
        console.error('Table or Sync button not found');
    }
}

function showSyncPopup(button, message) {
    const popup = document.createElement('div');
    popup.textContent = message;
    popup.style.cssText = `
        position: absolute;
        top: -30px;
        left: 50%;
        transform: translateX(-50%);
        background-color: black;
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 1000;
    `;
    
    button.style.position = 'relative';
    button.appendChild(popup);

    setTimeout(() => {
        popup.remove();
    }, 1000);
}

function sendMemoryToMem0(memory) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['apiKey', 'userId'], function(items) {
            if (items.apiKey && items.userId) {
                fetch('https://api.mem0.ai/v1/memories/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Token ${items.apiKey}`
                    },
                    body: JSON.stringify({
                        messages: [{ content: memory.content, role: 'user' }],
                        user_id: items.userId,
                        infer: true
                    })
                })
                .then(response => {
                    if (!response.ok) {
                        reject(`Failed to add memory: ${response.status}`);
                    } else {
                        resolve();
                    }
                })
                .catch(error => reject(`Error sending memory to Mem0: ${error}`));
            } else {
                reject('API Key or User ID not set');
            }
        });
    });
}

function initializeMem0Integration() {
    document.addEventListener('DOMContentLoaded', () => {
        addMem0Button();
        addSyncButton();
    });

    observer = new MutationObserver(() => {
        addMem0Button();
        addSyncButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

initializeMem0Integration();