// ============ STATE ============
const state = {
    apiUrl: localStorage.getItem('apiUrl') || '',
    apiKey: localStorage.getItem('apiKey') || '',
    model: localStorage.getItem('model') || '',
    temperature: parseFloat(localStorage.getItem('temperature') || '0.7'),
    maxTokens: parseInt(localStorage.getItem('maxTokens') || '2048'),
    systemPrompt: localStorage.getItem('systemPrompt') || 'You are a helpful, friendly AI assistant.',
    stream: localStorage.getItem('stream') !== 'false',
    connected: false,
    generating: false,
    abortController: null,
    chats: JSON.parse(localStorage.getItem('chats') || '{}'),
    activeChatId: null,
};

// ============ PROXY HELPER ============
// Routes API calls through CORS proxy to avoid browser blocking
function getProxyUrl(targetUrl) {
    const origin = window.location.origin;
    // Local dev server uses /proxy
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return `${origin}/proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    // Vercel / production uses /api/proxy
    if (origin.includes('vercel.app') || origin.startsWith('https://')) {
        return `${origin}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    // Fallback: try direct
    return targetUrl;
}

// ============ DOM ELEMENTS ============
const $ = (sel) => document.querySelector(sel);
const sidebar = $('#sidebar');
const messagesContainer = $('#messagesContainer');
const messagesArea = $('#messagesArea');
const welcomeScreen = $('#welcomeScreen');
const messageInput = $('#messageInput');
const sendBtn = $('#sendBtn');
const stopBtn = $('#stopBtn');
const modelBadge = $('#modelBadge');
const modelNameEl = $('#modelName');
const chatHistory = $('#chatHistory');
const settingsModal = $('#settingsModal');
const connectionStatus = $('#connectionStatus');

// ============ INIT ============
function init() {
    loadSettingsToUI();
    renderChatHistory();
    if (state.apiUrl) testConnectionSilent();

    // Event listeners
    $('#toggleSidebar').onclick = toggleSidebar;
    $('#closeSidebar').onclick = () => sidebar.classList.add('collapsed');
    $('#newChatBtn').onclick = startNewChat;
    $('#clearChat').onclick = clearCurrentChat;
    $('#openSettings').onclick = () => settingsModal.classList.remove('hidden');
    $('#closeSettings').onclick = () => settingsModal.classList.add('hidden');
    $('#saveSettings').onclick = saveSettings;
    $('#resetSettings').onclick = resetSettings;
    $('#testConnection').onclick = testConnection;
    $('#temperature').oninput = (e) => { $('#tempValue').textContent = e.target.value; };

    sendBtn.onclick = sendMessage;
    stopBtn.onclick = stopGenerating;

    messageInput.oninput = () => {
        sendBtn.disabled = !messageInput.value.trim();
        autoResize(messageInput);
    };
    messageInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (messageInput.value.trim()) sendMessage();
        }
    };

    document.querySelectorAll('.quick-prompt').forEach(btn => {
        btn.onclick = () => {
            messageInput.value = btn.dataset.prompt;
            sendBtn.disabled = false;
            sendMessage();
        };
    });

    settingsModal.onclick = (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
    };
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

// ============ SIDEBAR ============
function toggleSidebar() {
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

// ============ CHAT MANAGEMENT ============
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function startNewChat() {
    state.activeChatId = null;
    messagesArea.innerHTML = '';
    welcomeScreen.classList.remove('hidden');
    messageInput.value = '';
    sendBtn.disabled = true;
    renderChatHistory();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function clearCurrentChat() {
    if (state.activeChatId && state.chats[state.activeChatId]) {
        delete state.chats[state.activeChatId];
        localStorage.setItem('chats', JSON.stringify(state.chats));
    }
    startNewChat();
}

function loadChat(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;
    state.activeChatId = chatId;
    messagesArea.innerHTML = '';
    welcomeScreen.classList.add('hidden');

    chat.messages.forEach(msg => {
        if (msg.role === 'system') return;
        appendMessage(msg.role, msg.content, false);
    });
    scrollToBottom();
    renderChatHistory();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function saveChat() {
    if (!state.activeChatId) return;
    localStorage.setItem('chats', JSON.stringify(state.chats));
    renderChatHistory();
}

function renderChatHistory() {
    const items = Object.entries(state.chats)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt);

    // Keep the label, clear rest
    chatHistory.innerHTML = '<div class="history-label">Recent</div>';

    if (items.length === 0) {
        chatHistory.innerHTML += '<div style="padding:12px;color:var(--text-muted);font-size:0.8rem;">No chats yet</div>';
        return;
    }

    items.forEach(([id, chat]) => {
        const div = document.createElement('div');
        div.className = 'history-item' + (id === state.activeChatId ? ' active' : '');
        const title = document.createElement('span');
        title.textContent = chat.title || 'New Chat';
        title.style.overflow = 'hidden';
        title.style.textOverflow = 'ellipsis';

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-chat';
        delBtn.textContent = '✕';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            delete state.chats[id];
            localStorage.setItem('chats', JSON.stringify(state.chats));
            if (id === state.activeChatId) startNewChat();
            else renderChatHistory();
        };

        div.appendChild(title);
        div.appendChild(delBtn);
        div.onclick = () => loadChat(id);
        chatHistory.appendChild(div);
    });
}

// ============ MESSAGES ============
function appendMessage(role, content, animate = true) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (!animate) div.style.animation = 'none';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = renderMarkdown(content);

    div.appendChild(avatar);
    div.appendChild(contentDiv);
    messagesArea.appendChild(div);

    // Add copy buttons to code blocks
    div.querySelectorAll('pre').forEach(pre => {
        const btn = document.createElement('button');
        btn.className = 'copy-code-btn';
        btn.textContent = 'Copy';
        btn.onclick = () => {
            navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent);
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 1500);
        };
        pre.style.position = 'relative';
        pre.appendChild(btn);
    });

    return contentDiv;
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============ MARKDOWN RENDERER ============
function renderMarkdown(text) {
    if (!text) return '';
    let html = text;

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Paragraphs — wrap loose lines
    html = html.replace(/^(?!<[a-z])((?!<\/)[^\n]+)$/gm, '<p>$1</p>');

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');

    return html;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============ API CALLS ============
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || state.generating) return;

    if (!state.apiUrl) {
        settingsModal.classList.remove('hidden');
        showConnectionStatus('Please configure your API URL first.', 'error');
        return;
    }

    // Hide welcome, show messages
    welcomeScreen.classList.add('hidden');

    // Create new chat if needed
    if (!state.activeChatId) {
        const id = generateId();
        state.activeChatId = id;
        state.chats[id] = {
            title: text.slice(0, 50),
            messages: [{ role: 'system', content: state.systemPrompt }],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    // Add user message
    const chat = state.chats[state.activeChatId];
    chat.messages.push({ role: 'user', content: text });
    chat.updatedAt = Date.now();
    appendMessage('user', text);
    scrollToBottom();

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Show typing & switch buttons
    state.generating = true;
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    // Create assistant message placeholder
    const assistantDiv = appendMessage('assistant', '');
    const typingHtml = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    assistantDiv.innerHTML = typingHtml;
    scrollToBottom();

    try {
        state.abortController = new AbortController();
        const baseUrl = state.apiUrl.replace(/\/+$/, '');
        const targetUrl = `${baseUrl}/v1/chat/completions`;
        const url = getProxyUrl(targetUrl);

        const headers = { 'Content-Type': 'application/json' };
        if (state.apiKey) headers['Authorization'] = `Bearer ${state.apiKey}`;

        const body = {
            model: state.model || 'default',
            messages: chat.messages.filter(m => m.role !== 'system' ? true : true), // send all
            temperature: state.temperature,
            max_tokens: state.maxTokens,
            stream: state.stream,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: state.abortController.signal,
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        let fullResponse = '';

        if (state.stream) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));

                for (const line of lines) {
                    const data = line.replace('data: ', '').trim();
                    if (data === '[DONE]') break;

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        fullResponse += delta;
                        assistantDiv.innerHTML = renderMarkdown(fullResponse);

                        // Add copy buttons dynamically
                        assistantDiv.querySelectorAll('pre:not(.has-copy)').forEach(pre => {
                            pre.classList.add('has-copy');
                            const btn = document.createElement('button');
                            btn.className = 'copy-code-btn';
                            btn.textContent = 'Copy';
                            btn.onclick = () => {
                                navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent);
                                btn.textContent = 'Copied!';
                                setTimeout(() => btn.textContent = 'Copy', 1500);
                            };
                            pre.style.position = 'relative';
                            pre.appendChild(btn);
                        });

                        scrollToBottom();
                    } catch (e) { /* skip invalid JSON */ }
                }
            }
        } else {
            const data = await response.json();
            fullResponse = data.choices?.[0]?.message?.content || 'No response received.';
            assistantDiv.innerHTML = renderMarkdown(fullResponse);

            assistantDiv.querySelectorAll('pre').forEach(pre => {
                const btn = document.createElement('button');
                btn.className = 'copy-code-btn';
                btn.textContent = 'Copy';
                btn.onclick = () => {
                    navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent);
                    btn.textContent = 'Copied!';
                    setTimeout(() => btn.textContent = 'Copy', 1500);
                };
                pre.style.position = 'relative';
                pre.appendChild(btn);
            });

            scrollToBottom();
        }

        // Save assistant message
        chat.messages.push({ role: 'assistant', content: fullResponse });
        chat.updatedAt = Date.now();
        saveChat();

    } catch (err) {
        if (err.name === 'AbortError') {
            assistantDiv.innerHTML += '<p style="color:var(--warning);font-size:0.8rem;margin-top:8px;">⚠ Generation stopped</p>';
        } else {
            assistantDiv.innerHTML = `<p style="color:var(--error);">❌ Error: ${escapeHtml(err.message)}</p>
            <p style="color:var(--text-muted);font-size:0.8rem;">Check your API URL and that LM Studio is running.</p>`;
        }
    } finally {
        state.generating = false;
        state.abortController = null;
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
    }
}

function stopGenerating() {
    if (state.abortController) {
        state.abortController.abort();
    }
}

// ============ SETTINGS ============
function loadSettingsToUI() {
    $('#apiUrl').value = state.apiUrl;
    $('#apiKey').value = state.apiKey;
    $('#temperature').value = state.temperature;
    $('#tempValue').textContent = state.temperature;
    $('#maxTokens').value = state.maxTokens;
    $('#systemPrompt').value = state.systemPrompt;
    $('#streamToggle').checked = state.stream;

    if (state.model) {
        const sel = $('#modelSelect');
        sel.innerHTML = `<option value="${state.model}" selected>${state.model}</option>`;
    }
}

function saveSettings() {
    state.apiUrl = $('#apiUrl').value.trim();
    state.apiKey = $('#apiKey').value.trim();
    state.temperature = parseFloat($('#temperature').value);
    state.maxTokens = parseInt($('#maxTokens').value);
    state.systemPrompt = $('#systemPrompt').value.trim();
    state.stream = $('#streamToggle').checked;

    const selectedModel = $('#modelSelect').value;
    if (selectedModel) state.model = selectedModel;

    // Persist
    localStorage.setItem('apiUrl', state.apiUrl);
    localStorage.setItem('apiKey', state.apiKey);
    localStorage.setItem('model', state.model);
    localStorage.setItem('temperature', state.temperature);
    localStorage.setItem('maxTokens', state.maxTokens);
    localStorage.setItem('systemPrompt', state.systemPrompt);
    localStorage.setItem('stream', state.stream);

    settingsModal.classList.add('hidden');
    if (state.apiUrl) testConnectionSilent();
}

function resetSettings() {
    $('#apiUrl').value = '';
    $('#apiKey').value = '';
    $('#temperature').value = 0.7;
    $('#tempValue').textContent = '0.7';
    $('#maxTokens').value = 2048;
    $('#systemPrompt').value = 'You are a helpful, friendly AI assistant.';
    $('#streamToggle').checked = true;
    $('#modelSelect').innerHTML = '<option value="">Connect first to load models</option>';
}

async function testConnection() {
    const url = $('#apiUrl').value.trim();
    if (!url) {
        showConnectionStatus('Please enter an API URL', 'error');
        return;
    }

    showConnectionStatus('Testing connection...', '');
    try {
        const baseUrl = url.replace(/\/+$/, '');
        const headers = {};
        const key = $('#apiKey').value.trim();
        if (key) headers['Authorization'] = `Bearer ${key}`;

        const res = await fetch(getProxyUrl(`${baseUrl}/v1/models`), { headers, signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const models = data.data || [];

        // Populate model select
        const sel = $('#modelSelect');
        sel.innerHTML = '';
        if (models.length === 0) {
            sel.innerHTML = '<option value="">No models loaded</option>';
            showConnectionStatus('Connected, but no models loaded in LM Studio.', 'error');
        } else {
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.id;
                sel.appendChild(opt);
            });

            // Auto-select first or saved model
            if (state.model && models.find(m => m.id === state.model)) {
                sel.value = state.model;
            }

            showConnectionStatus(`✓ Connected! Found ${models.length} model(s).`, 'success');
        }

        updateConnectionBadge(true, models[0]?.id || 'Connected');
    } catch (err) {
        showConnectionStatus(`Connection failed: ${err.message}`, 'error');
        updateConnectionBadge(false);
    }
}

async function testConnectionSilent() {
    try {
        const baseUrl = state.apiUrl.replace(/\/+$/, '');
        const headers = {};
        if (state.apiKey) headers['Authorization'] = `Bearer ${state.apiKey}`;

        const res = await fetch(getProxyUrl(`${baseUrl}/v1/models`), { headers, signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error();

        const data = await res.json();
        const models = data.data || [];
        const name = state.model || models[0]?.id || 'Connected';
        updateConnectionBadge(true, name);
    } catch {
        updateConnectionBadge(false);
    }
}

function showConnectionStatus(msg, type) {
    connectionStatus.classList.remove('hidden', 'success', 'error');
    connectionStatus.textContent = msg;
    if (type) connectionStatus.classList.add(type);
}

function updateConnectionBadge(connected, name) {
    state.connected = connected;
    if (connected) {
        modelBadge.classList.add('connected');
        modelNameEl.textContent = name;
    } else {
        modelBadge.classList.remove('connected');
        modelNameEl.textContent = 'Not Connected';
    }
}

// ============ START ============
document.addEventListener('DOMContentLoaded', init);
