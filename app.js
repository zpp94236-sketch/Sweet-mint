// ===== Global State =====
let state = {
    chats: [],
    currentChatId: null,
    providers: [],
    activeProviderId: null,
    settings: {
        model: '',
        systemPrompt: '',
        contextCount: 20,
        temperature: 0.7,
        maxTokens: 4096,
        theme: 'light',
        fontSize: 15,
        aiName: 'AI',
        aiAvatar: '',
        userAvatar: '',
        userName: '郑郑',
        wallpaper: '',
        regexRules: [],
        cachedModels: [],
        webSearch: false,
        mcp: false
    },
    isStreaming: false
};

const STICKERS = ['😊','🥰','😘','😂','🫠','🙊','😳','🥺','😝','😴','😍','😒','🙋‍♀️','🐶','🌞','🌝','🌙','💦','🍟','🍵','🧋','🦐','🐟','🐱','🐰','🐾','💕','❤️','💔','✨','🌸','🌿','🙏','👍','👌','🙌','🤗','🥲','🙋','🤍'];

function init() {
    loadState();
    state.isStreaming = false;
    state.settings.launchCount = (state.settings.launchCount || 0) + 1;
    saveState();
    renderChatList();
    setupEventListeners();
    applyTheme();
    applyFontSize();
    applyWallpaper();
    applyUserAvatar();
    applyUserName();
    buildStickerPanel();
    if (state.chats.length === 0) createNewChat();
    else switchChat(state.currentChatId || state.chats[0].id);
    updateModelDisplays();
}

function saveState() { localStorage.setItem('chatApp_state', JSON.stringify(state)); }

function loadState() {
    const saved = localStorage.getItem('chatApp_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.settings && parsed.settings.apiBase && !parsed.providers) {
            parsed.providers = [{ id: Date.now().toString(), name: parsed.settings.providerName || 'Default', apiBase: parsed.settings.apiBase, apiKey: parsed.settings.apiKey }];
            parsed.activeProviderId = parsed.providers[0].id;
            delete parsed.settings.providerName; delete parsed.settings.apiBase; delete parsed.settings.apiKey;
        }
        state = { ...state, ...parsed };
        if (!state.providers) state.providers = [];
        if (!state.settings.regexRules) state.settings.regexRules = [];
        if (!state.settings.cachedModels) state.settings.cachedModels = [];
    }
}

function getActiveProvider() { return state.providers.find(p => p.id === state.activeProviderId) || null; }

function createNewChat() {
    const chat = { id: Date.now().toString(), title: '新对话', messages: [], createdAt: new Date().toISOString() };
    state.chats.unshift(chat); state.currentChatId = chat.id;
    saveState(); renderChatList(); renderMessages(); updateHeader();
}

function switchChat(chatId) { state.currentChatId = chatId; saveState(); renderChatList(); renderMessages(); updateHeader(); closeSidebar(); }

function deleteChat(chatId) {
    if (state.chats.length <= 1) { const c = state.chats.find(x => x.id === chatId); if (c) { c.messages = []; c.title = '新对话'; } }
    else { state.chats = state.chats.filter(x => x.id !== chatId); if (state.currentChatId === chatId) state.currentChatId = state.chats[0].id; }
    saveState(); renderChatList(); renderMessages(); updateHeader();
}

function getCurrentChat() { return state.chats.find(c => c.id === state.currentChatId); }

function renderChatList() {
    const container = document.getElementById('chatList');
    if (!container) return;
    container.innerHTML = state.chats.map(chat => {
        const lastMsg = chat.messages[chat.messages.length - 1];
        const lastTime = (lastMsg && lastMsg.timestamp) || chat.createdAt;
        const modelName = chat.model || state.settings.model || '未指定模型';
        return '<div class="chat-item' + (chat.id === state.currentChatId ? ' active' : '') + '" data-id="' + chat.id + '"><div class="chat-item-body"><div class="chat-item-row1"><span class="chat-item-title">' + escapeHtml(chat.title) + '</span><span class="chat-item-time">' + formatTime(lastTime) + '</span></div><span class="chat-item-subtitle">' + escapeHtml(modelName) + '</span></div><button class="chat-item-delete" data-id="' + chat.id + '" title="删除">🗑</button></div>';
    }).join('');
    container.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', (e) => { if (e.target.classList.contains('chat-item-delete')) { e.stopPropagation(); deleteChat(e.target.dataset.id); } else switchChat(el.dataset.id); });
    });
}

function renderMessages() {
    const container = document.getElementById('messages');
    if (!container) return;
    const chat = getCurrentChat();
    if (!chat || chat.messages.length === 0) { container.innerHTML = ''; return; }
    let html = ''; let lastTime = 0;
    chat.messages.forEach((msg, idx) => {
        const curTime = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
        if (curTime && (idx === 0 || curTime - lastTime > 30 * 60 * 1000)) {
            html += '<div class="time-divider">' + formatMsgTime(msg.timestamp) + '</div>';
        }
        html += renderSingleMessage(msg, idx);
        if (curTime) lastTime = curTime;
    });
    container.innerHTML = html;
    scrollToBottom();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderSingleMessage(msg, idx) {
    const isUser = msg.role === 'user';
    const time = msg.timestamp ? formatMsgTime(msg.timestamp) : '';
    let thinkingHtml = ''; let mainContent = msg.content || '';
    const thinkOpen = '<' + 'think>'; const thinkClose = '</' + 'think>';
    if (!isUser && mainContent.includes(thinkOpen)) {
        const s = mainContent.indexOf(thinkOpen) + thinkOpen.length;
        const e = mainContent.indexOf(thinkClose);
        if (e > s) { const t = mainContent.substring(s, e).trim(); thinkingHtml = '<div class="thinking-block"><div class="thinking-header" onclick="toggleThinking(this)"><i data-lucide="chevron-right"></i><span>Thinking</span></div><div class="thinking-content">' + escapeHtml(t) + '</div></div>'; mainContent = mainContent.substring(0, mainContent.indexOf(thinkOpen)) + mainContent.substring(e + thinkClose.length); mainContent = mainContent.trim(); }
    }
    const rendered = isUser ? escapeHtml(mainContent).replace(/\n/g, '<br>') : renderMarkdown(mainContent);
    const aiName = state.settings.aiName || 'AI';
    const actions = isUser ? getUserActions(idx) : getAiActions(idx);
    const userAvatarHtml = state.settings.userAvatar ? '<img src="' + state.settings.userAvatar + '">' : '🌙';
    const aiAvatarHtml = state.settings.aiAvatar ? '<img src="' + state.settings.aiAvatar + '">' : '✦';
    if (isUser) {
        return '<div class="message user"><div class="message-avatar">' + userAvatarHtml + '</div><div class="message-content-wrap"><div class="message-meta user-meta-row"><span class="message-time">' + time + '</span></div><div class="message-bubble">' + rendered + '</div>' + actions + '</div></div>';
    }
    let tokenHtml = '';
    if (msg.usage) {
        const parts = [];
        if (msg.usage.prompt_tokens != null) parts.push('输入 ' + msg.usage.prompt_tokens);
        if (msg.usage.completion_tokens != null) parts.push('输出 ' + msg.usage.completion_tokens + ' tokens');
        if (msg.duration) parts.push('耗时 ' + msg.duration + 's');
        if (parts.length) tokenHtml = '<div class="message-tokens">' + parts.join(' · ') + '</div>';
    }
    return '<div class="message assistant"><div class="message-avatar">' + aiAvatarHtml + '</div><div class="message-content-wrap"><div class="message-meta"><span class="message-time">' + time + '</span></div>' + thinkingHtml + '<div class="message-bubble">' + rendered + '</div>' + actions + tokenHtml + '</div></div>';
}

function getUserActions(idx) { return '<div class="message-actions"><button class="msg-action-btn" onclick="copyMessage(' + idx + ')" title="复制"><i data-lucide="copy"></i></button><button class="msg-action-btn" onclick="regenerateMessage(' + idx + ')" title="重新生成"><i data-lucide="refresh-cw"></i></button><div class="msg-more-menu"><button class="msg-action-btn" onclick="toggleMoreMenu(this)" title="更多"><i data-lucide="more-horizontal"></i></button><div class="msg-more-dropdown"><button class="msg-dropdown-item" onclick="editMessage(' + idx + ')"><i data-lucide="pencil"></i>编辑</button><button class="msg-dropdown-item" onclick="branchChat(' + idx + ')"><i data-lucide="git-branch"></i>分支</button><button class="msg-dropdown-item danger" onclick="deleteMessage(' + idx + ')"><i data-lucide="trash-2"></i>删除</button></div></div></div>'; }

function getAiActions(idx) { return '<div class="message-actions"><button class="msg-action-btn" onclick="copyMessage(' + idx + ')" title="复制"><i data-lucide="copy"></i></button><button class="msg-action-btn" onclick="regenerateMessage(' + idx + ')" title="重新生成"><i data-lucide="refresh-cw"></i></button><button class="msg-action-btn" onclick="speakMessage(' + idx + ')" title="语音"><i data-lucide="volume-2"></i></button><button class="msg-action-btn" onclick="translateMessage(' + idx + ')" title="翻译"><i data-lucide="languages"></i></button><div class="msg-more-menu"><button class="msg-action-btn" onclick="toggleMoreMenu(this)" title="更多"><i data-lucide="more-horizontal"></i></button><div class="msg-more-dropdown"><button class="msg-dropdown-item" onclick="editMessage(' + idx + ')"><i data-lucide="pencil"></i>编辑</button><button class="msg-dropdown-item" onclick="branchChat(' + idx + ')"><i data-lucide="git-branch"></i>分支</button><button class="msg-dropdown-item danger" onclick="deleteMessage(' + idx + ')"><i data-lucide="trash-2"></i>删除</button></div></div></div>'; }

function updateHeader() {
    const chat = getCurrentChat();
    const titleEl = document.getElementById('currentChatTitle'); if (titleEl) titleEl.textContent = chat ? chat.title : '新对话';
    const provider = getActiveProvider();
    const modelText = state.settings.model || '未配置模型';
    const badge = document.getElementById('modelBadge'); if (badge) badge.textContent = provider ? provider.name + ' / ' + modelText : modelText;
    updateModelDisplays();
}

function updateModelDisplays() {
    const modelText = state.settings.model || '未配置模型';
    const pill = document.getElementById('modelPillText'); if (pill) pill.textContent = modelText;
    const pm = document.getElementById('plusMenuModel'); if (pm) pm.innerHTML = escapeHtml(state.settings.model || '未配置') + '<i data-lucide="chevron-right"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function scrollToBottom() { const c = document.getElementById('messages'); if (c) c.scrollTop = c.scrollHeight; }

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || state.isStreaming) return;
    const provider = getActiveProvider();
    if (!provider || !provider.apiBase || !provider.apiKey || !state.settings.model) { alert('请先在设置中配置供应商和模型'); return; }
    const chat = getCurrentChat();
    chat.messages.push({ role: 'user', content, timestamp: new Date().toISOString() });
    input.value = ''; autoResize(input); updateSendButton(); renderMessages();
    if (chat.messages.filter(m => m.role === 'user').length === 1) { chat.title = content.slice(0, 20) + (content.length > 20 ? '...' : ''); renderChatList(); updateHeader(); }
    const messagesContainer = document.getElementById('messages');
    const loadingDiv = document.createElement('div'); loadingDiv.className = 'message assistant'; loadingDiv.id = 'loading-message';
    const aiAvatarHtml = state.settings.aiAvatar ? '<img src="' + state.settings.aiAvatar + '">' : '✦';
    loadingDiv.innerHTML = '<div class="message-avatar">' + aiAvatarHtml + '</div><div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
    messagesContainer.appendChild(loadingDiv); scrollToBottom();
    const messages = [];
    if (state.settings.systemPrompt) messages.push({ role: 'system', content: state.settings.systemPrompt });
    const ctxCount = state.settings.contextCount >= 50 ? chat.messages.length : state.settings.contextCount;
    messages.push(...chat.messages.slice(-ctxCount).map(m => ({ role: m.role, content: m.content })));
    state.isStreaming = true;
    const startTime = Date.now();
    try {
        const response = await fetch(provider.apiBase + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }, body: JSON.stringify({ model: state.settings.model, messages, temperature: state.settings.temperature, max_tokens: state.settings.maxTokens || undefined, stream: true, stream_options: { include_usage: true } }) });
        if (!response.ok) throw new Error('API 错误: ' + response.status + ' ' + response.statusText);
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let assistantContent = ''; let usage = null; let buffer = '';
        loadingDiv.remove();
        const assistantDiv = document.createElement('div'); assistantDiv.className = 'message assistant';
        assistantDiv.innerHTML = '<div class="message-avatar">' + aiAvatarHtml + '</div><div class="message-content-wrap"><div class="message-bubble"></div></div>';
        messagesContainer.appendChild(assistantDiv); const bubble = assistantDiv.querySelector('.message-bubble');
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n'); buffer = lines.pop();
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim(); if (data === '[DONE]') continue;
                    try { const parsed = JSON.parse(data);
                        if (parsed.usage) usage = parsed.usage;
                        const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
                        if (delta) { assistantContent += delta; bubble.innerHTML = renderMarkdown(assistantContent); scrollToBottom(); }
                    } catch(e){}
                }
            }
        }
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        chat.messages.push({ role: 'assistant', content: assistantContent, timestamp: new Date().toISOString(), usage: usage, duration: duration }); saveState(); renderMessages();
    } catch (error) { loadingDiv.remove(); const errorDiv = document.createElement('div'); errorDiv.className = 'message assistant'; errorDiv.innerHTML = '<div class="message-avatar">⚠️</div><div class="message-bubble" style="color:#e74c3c;">发送失败: ' + escapeHtml(error.message) + '</div>'; messagesContainer.appendChild(errorDiv); scrollToBottom(); }
    finally { state.isStreaming = false; }
}

// ===== Settings Panel =====
let settingsView = 'main'; let editingProviderId = null;

function openSettingsPanel() { settingsView = 'main'; editingProviderId = null; renderSettingsView(); document.getElementById('settingsOverlay').classList.add('active'); }
function closeSettingsPanel() { document.getElementById('settingsOverlay').classList.remove('active'); }

function renderSettingsView() {
    const content = document.getElementById('settingsContent'); const footer = document.getElementById('settingsFooter');
    const title = document.getElementById('settingsTitle'); const backBtn = document.getElementById('settingsBackBtn');
    if (settingsView === 'main') { title.textContent = '设置'; backBtn.style.display = 'none'; content.innerHTML = renderMainSettings(); footer.innerHTML = '<button class="btn-primary" onclick="saveMainSettings()">保存设置</button>'; bindMainSettingsEvents(); }
    else if (settingsView === 'provider-detail') { const p = state.providers.find(x => x.id === editingProviderId); title.textContent = p ? '编辑供应商' : '添加供应商'; backBtn.style.display = 'flex'; content.innerHTML = renderProviderDetail(p); footer.innerHTML = '<button class="btn-primary" onclick="saveProviderDetail()">保存供应商</button>'; }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderMainSettings() {
    let cards = state.providers.map(p => { const active = p.id === state.activeProviderId; return '<div class="provider-card' + (active ? ' active' : '') + '"><div class="provider-card-left"><div class="provider-card-icon"><i data-lucide="cloud"></i></div><div class="provider-card-info"><div class="provider-card-name">' + escapeHtml(p.name) + '</div><div class="provider-card-url">' + escapeHtml(p.apiBase || '未配置') + '</div></div></div><div class="provider-card-actions"><button onclick="event.stopPropagation();setActiveProvider(\'' + p.id + '\')" title="设为当前"><i data-lucide="' + (active ? 'check-circle' : 'circle') + '"></i></button><button onclick="event.stopPropagation();editProvider(\'' + p.id + '\')" title="编辑"><i data-lucide="pencil"></i></button><button onclick="event.stopPropagation();deleteProvider(\'' + p.id + '\')" title="删除"><i data-lucide="trash-2"></i></button></div></div>'; }).join('');
    cards += '<div class="add-provider-btn" onclick="addNewProvider()"><i data-lucide="plus"></i> 添加供应商</div>';
    let model = '<section class="settings-section"><h3><i data-lucide="cpu" class="section-icon"></i>模型选择</h3><div class="form-group"><button class="btn-secondary" id="fetchModelsBtn"><i data-lucide="refresh-cw" style="width:13px;height:13px;margin-right:4px;"></i>获取模型列表</button></div><div class="form-group"><label>当前模型</label><input type="text" id="modelInput" placeholder="输入或选择模型名称" value="' + escapeHtml(state.settings.model || '') + '"><input type="text" class="model-search-input" id="modelSearchInput" placeholder="🔍 搜索模型..." style="display:none;"><div class="model-list" id="modelList" style="display:none;"></div></div></section>';
    let wp = '<section class="settings-section"><h3><i data-lucide="palette" class="section-icon"></i>外观设置</h3><div class="form-group"><label>颜色模式</label><select id="themeMode"><option value="light"' + (state.settings.theme === 'light' ? ' selected' : '') + '>浅色</option><option value="dark"' + (state.settings.theme === 'dark' ? ' selected' : '') + '>深色</option></select></div><div class="form-group"><label>字体大小: <span id="fontSizeDisplay">' + getFontSizeLabel(state.settings.fontSize) + '</span></label><input type="range" id="fontSize" min="12" max="20" value="' + (state.settings.fontSize || 15) + '"></div><div class="form-group"><label>聊天壁纸</label><div class="wallpaper-preview-grid"><div class="wallpaper-option wallpaper-option-none' + (!state.settings.wallpaper ? ' active' : '') + '" onclick="setWallpaper(\'\')">默认格子</div>' + (state.settings.wallpaper ? '<div class="wallpaper-option wallpaper-option-custom active" style="background-image:url(' + state.settings.wallpaper + ');background-size:cover;background-position:center;"></div>' : '') + '<div class="wallpaper-custom-upload" onclick="uploadWallpaper()">+</div></div><input type="file" id="wallpaperInput" accept="image/*" hidden></div></section>';
    let appear = wp;
    let data = '<section class="settings-section"><h3><i data-lucide="database" class="section-icon"></i>数据管理</h3><div class="form-group"><button class="btn-secondary" onclick="exportData()" style="margin-right:8px;"><i data-lucide="download" style="width:13px;height:13px;margin-right:4px;"></i>导出数据</button><button class="btn-secondary" onclick="document.getElementById(\'importFileInput\').click()"><i data-lucide="upload" style="width:13px;height:13px;margin-right:4px;"></i>导入数据</button><input type="file" id="importFileInput" accept=".json" hidden></div></section>';
    return '<section class="settings-section"><h3><i data-lucide="cloud" class="section-icon"></i>供应商管理</h3>' + cards + '</section>' + model + appear + data;
}

function renderProviderDetail(provider) {
    const name = provider ? provider.name : ''; const apiBase = provider ? provider.apiBase : ''; const apiKey = provider ? provider.apiKey : '';
    return '<div class="form-group"><label>供应商名称</label><input type="text" id="providerNameInput" placeholder="例如：聚梦AI" value="' + escapeHtml(name) + '"></div><div class="form-group"><label>API Base URL</label><input type="text" id="providerBaseInput" placeholder="https://api.example.com/v1" value="' + escapeHtml(apiBase) + '"></div><div class="form-group"><label>API Key</label><div class="input-with-btn"><input type="password" id="providerKeyInput" placeholder="sk-..." value="' + escapeHtml(apiKey) + '"><button class="btn-small" onclick="toggleProviderKeyVisibility()"><i data-lucide="eye"></i></button></div></div><button class="btn-primary" onclick="testProviderConnection()"><i data-lucide="plug" style="width:14px;height:14px;margin-right:6px;"></i>测试连接</button><span class="connection-status" id="providerConnectionStatus"></span>';
}

function bindMainSettingsEvents() {
    const f = document.getElementById('fontSize'); if(f) f.addEventListener('input', e => { document.getElementById('fontSizeDisplay').textContent = getFontSizeLabel(parseInt(e.target.value)); });
    const fb = document.getElementById('fetchModelsBtn'); if(fb) fb.addEventListener('click', fetchModels);
    const mi = document.getElementById('modelInput'); if(mi) mi.addEventListener('focus', () => { const ml = document.getElementById('modelList'); if(ml && ml.children.length > 0) { ml.style.display = 'block'; showModelSearch(); } });
    const wp = document.getElementById('wallpaperInput'); if(wp) wp.addEventListener('change', handleWallpaperUpload);
    const imp = document.getElementById('importFileInput'); if(imp) imp.addEventListener('change', handleImportData);
}

function addNewProvider() { editingProviderId = null; settingsView = 'provider-detail'; renderSettingsView(); }
function editProvider(id) { editingProviderId = id; settingsView = 'provider-detail'; renderSettingsView(); }
function deleteProvider(id) { if (!confirm('确定删除这个供应商？')) return; state.providers = state.providers.filter(p => p.id !== id); if (state.activeProviderId === id) state.activeProviderId = state.providers.length > 0 ? state.providers[0].id : null; saveState(); renderSettingsView(); updateHeader(); }
function setActiveProvider(id) { state.activeProviderId = id; saveState(); renderSettingsView(); updateHeader(); }

function saveProviderDetail() {
    const name = document.getElementById('providerNameInput').value.trim();
    const apiBase = document.getElementById('providerBaseInput').value.trim().replace(/\/$/, '');
    const apiKey = document.getElementById('providerKeyInput').value.trim();
    if (!name) { alert('请填写供应商名称'); return; }
    if (editingProviderId) { const p = state.providers.find(x => x.id === editingProviderId); if(p) { p.name = name; p.apiBase = apiBase; p.apiKey = apiKey; } }
    else { const np = { id: Date.now().toString(), name, apiBase, apiKey }; state.providers.push(np); if (!state.activeProviderId) state.activeProviderId = np.id; }
    saveState(); settingsView = 'main'; renderSettingsView(); updateHeader();
}

function toggleProviderKeyVisibility() { const i = document.getElementById('providerKeyInput'); i.type = i.type === 'password' ? 'text' : 'password'; }

async function testProviderConnection() {
    const s = document.getElementById('providerConnectionStatus');
    const base = document.getElementById('providerBaseInput').value.trim().replace(/\/$/, '');
    const key = document.getElementById('providerKeyInput').value.trim();
    if (!base || !key) { s.textContent = '❌ 请填写地址和密钥'; s.style.color = '#e74c3c'; return; }
    s.textContent = '⏳ 测试中...'; s.style.color = '#f39c12';
    try { const r = await fetch(base + '/models', { headers: { 'Authorization': 'Bearer ' + key } }); if (r.ok) { s.textContent = '✅ 连接成功！'; s.style.color = '#27ae60'; } else { s.textContent = '❌ 错误 ' + r.status; s.style.color = '#e74c3c'; } } catch(e) { s.textContent = '❌ 无法连接'; s.style.color = '#e74c3c'; }
}

async function fetchModels() {
    const provider = getActiveProvider(); if (!provider || !provider.apiBase || !provider.apiKey) { alert('请先选择一个已配置的供应商'); return; }
    try { const r = await fetch(provider.apiBase + '/models', { headers: { 'Authorization': 'Bearer ' + provider.apiKey } }); const d = await r.json(); const models = d.data || []; const ml = document.getElementById('modelList'); const si = document.getElementById('modelSearchInput');
        const ids = models.map(m => m.id).sort((a,b) => a.localeCompare(b));
        state.settings.cachedModels = ids; saveState();
        if (ids.length === 0) ml.innerHTML = '<div class="model-list-item">没有找到可用模型</div>';
        else { ml.innerHTML = ids.map(id => '<div class="model-list-item" data-model="' + escapeHtml(id) + '">' + escapeHtml(id) + '</div>').join(''); ml.querySelectorAll('.model-list-item').forEach(el => { el.addEventListener('click', () => { document.getElementById('modelInput').value = el.dataset.model; ml.style.display = 'none'; si.style.display = 'none'; }); }); }
        ml.style.display = 'block'; showModelSearch();
    } catch(e) { alert('获取模型列表失败: ' + e.message); }
}

function showModelSearch() { const si = document.getElementById('modelSearchInput'); if(!si) return; si.style.display = 'block'; si.oninput = function() { const f = this.value.toLowerCase(); document.querySelectorAll('#modelList .model-list-item').forEach(item => { item.style.display = item.textContent.toLowerCase().includes(f) ? '' : 'none'; }); }; }

function saveMainSettings() {
    state.settings.model = document.getElementById('modelInput').value.trim();
    state.settings.theme = document.getElementById('themeMode').value;
    state.settings.fontSize = parseInt(document.getElementById('fontSize').value);
    saveState(); applyTheme(); applyFontSize(); applyWallpaper(); updateHeader(); closeSettingsPanel();
}

function setWallpaper(v) { state.settings.wallpaper = v; saveState(); applyWallpaper(); renderSettingsView(); }
function uploadWallpaper() { document.getElementById('wallpaperInput').click(); }
function handleWallpaperUpload(e) { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ev => { state.settings.wallpaper = ev.target.result; saveState(); applyWallpaper(); renderSettingsView(); }; r.readAsDataURL(f); }
function applyWallpaper() { const m = document.getElementById('chatMain'); const msg = document.getElementById('messages'); if (!m || !msg) return; if (state.settings.wallpaper) { m.classList.add('has-wallpaper'); m.classList.remove('default-gingham'); msg.style.backgroundImage = 'url(' + state.settings.wallpaper + ')'; } else { m.classList.remove('has-wallpaper'); m.classList.add('default-gingham'); msg.style.backgroundImage = ''; } }

function applyUserAvatar() { const d = document.getElementById('userAvatarDisplay'); if (!d) return; if (state.settings.userAvatar) { d.innerHTML = '<img src="' + state.settings.userAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'; } }
function applyUserName() { const d = document.getElementById('usernameDisplay'); if (d && state.settings.userName) d.textContent = state.settings.userName; }

function exportData() { const o = { version: 2, exportedAt: new Date().toISOString(), providers: state.providers, activeProviderId: state.activeProviderId, settings: state.settings, chats: state.chats }; const b = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'chat-backup-' + new Date().toISOString().slice(0,10) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); alert('导出成功！'); }

function handleImportData(e) { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ev => { try { const imp = JSON.parse(ev.target.result); if (!confirm('导入将覆盖当前所有数据，确定继续？')) return; if(imp.providers) state.providers = imp.providers; if(imp.activeProviderId) state.activeProviderId = imp.activeProviderId; if(imp.settings) state.settings = {...state.settings,...imp.settings}; if(imp.chats) state.chats = imp.chats; if(state.chats.length > 0) state.currentChatId = state.chats[0].id; saveState(); applyTheme(); applyFontSize(); applyWallpaper(); applyUserAvatar(); renderChatList(); renderMessages(); updateHeader(); renderSettingsView(); alert('导入成功！'); } catch(err) { alert('导入失败：文件格式不正确'); } }; r.readAsText(f); e.target.value = ''; }

function applyTheme() { document.documentElement.setAttribute('data-theme', state.settings.theme || 'light'); }
function applyFontSize() { document.documentElement.style.setProperty('--font-size', (state.settings.fontSize || 15) + 'px'); }
function getFontSizeLabel(s) { return {12:'极小',13:'小',14:'偏小',15:'标准',16:'偏大',17:'大',18:'较大',19:'很大',20:'超大'}[s]||'标准'; }

// ===== AI Assistant Modal =====
let assistantModalTab = 'basic';
function openEditAiAssistant() {
    let ov = document.getElementById('assistantModalOverlay');
    if (!ov) { ov = document.createElement('div'); ov.className = 'assistant-modal-overlay'; ov.id = 'assistantModalOverlay'; ov.innerHTML = '<div class="assistant-modal"><div class="assistant-modal-header"><button class="stats-back" onclick="closeAssistantModal()"><i data-lucide="chevron-left"></i></button><h3>AI 助手</h3></div><div class="assistant-modal-tabs"><button class="assistant-modal-tab active" data-tab="basic" onclick="switchAssistantTab(\'basic\')">基础设定</button><button class="assistant-modal-tab" data-tab="prompt" onclick="switchAssistantTab(\'prompt\')">提示词</button></div><div class="assistant-modal-content" id="assistantModalContent"></div><div class="assistant-modal-footer"><button class="btn-primary" onclick="saveAssistantSettings()">保存</button></div></div>'; document.body.appendChild(ov); }
    assistantModalTab = 'basic'; ov.classList.add('active'); renderAssistantModalContent(); if(typeof lucide!=='undefined') lucide.createIcons();
}
function closeAssistantModal() { const ov = document.getElementById('assistantModalOverlay'); if(ov) ov.classList.remove('active'); }
function switchAssistantTab(tab) { assistantModalTab = tab; document.querySelectorAll('.assistant-modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab)); renderAssistantModalContent(); }
function renderAssistantModalContent() {
    const c = document.getElementById('assistantModalContent');
    if (assistantModalTab === 'basic') { c.innerHTML = renderBasicTab(); bindBasicTabEvents(); } else { c.innerHTML = renderPromptTab(); bindPromptTabEvents(); }
    if(typeof lucide!=='undefined') lucide.createIcons();
}
function renderBasicTab() {
    const n = state.settings.aiName||'AI'; const av = state.settings.aiAvatar||''; const t = state.settings.temperature||0.7; const mt = state.settings.maxTokens||''; const ctx = state.settings.contextCount||50;
    const avHtml = av ? '<img src="'+av+'">' : '✦';
    return '<div class="form-group"><label>助手名称</label><input type="text" id="assistantNameInput" value="'+escapeHtml(n)+'" placeholder="给AI起个名字"></div><div class="form-group"><label>助手头像</label><div style="display:flex;align-items:center;gap:12px;"><div class="ai-avatar-preview" onclick="document.getElementById(\'aiAvatarFileInput\').click()">'+avHtml+'</div><span style="font-size:12px;color:var(--text-light);">点击更换</span></div><input type="file" id="aiAvatarFileInput" accept="image/*" hidden></div><div class="form-group"><label>Temperature: <span id="assistantTempDisplay">'+t+'</span></label><input type="range" id="assistantTemp" min="0" max="200" value="'+Math.round(t*100)+'"></div><div class="form-group"><label>Max Tokens <span style="font-size:11px;color:var(--text-light);">(留空=无限制)</span></label><input type="number" id="assistantMaxTokens" placeholder="无限制" value="'+(mt||'')+'"></div><div class="form-group"><label>上下文消息数: <span id="assistantCtxDisplay">'+(ctx>=50?'无限制':ctx)+'</span></label><input type="range" id="assistantCtx" min="1" max="50" value="'+ctx+'"></div>';
}
function bindBasicTabEvents() {
    const t = document.getElementById('assistantTemp'); if(t) t.addEventListener('input', e => { document.getElementById('assistantTempDisplay').textContent = (e.target.value/100).toFixed(2); });
    const ctx = document.getElementById('assistantCtx'); if(ctx) ctx.addEventListener('input', e => { const v = parseInt(e.target.value); document.getElementById('assistantCtxDisplay').textContent = v>=50?'无限制':v; });
    const av = document.getElementById('aiAvatarFileInput'); if(av) av.addEventListener('change', e => { const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{state.settings.aiAvatar=ev.target.result;renderAssistantModalContent();}; r.readAsDataURL(f); });
}
function renderPromptTab() {
    const sp = state.settings.systemPrompt||''; const rules = state.settings.regexRules||[];
    let rh = '<div class="regex-list" id="regexList">'; rules.forEach((rule,i) => { rh += '<div class="regex-item"><span class="regex-item-text">'+escapeHtml(rule)+'</span><button onclick="deleteRegex('+i+')"><i data-lucide="x"></i></button></div>'; }); rh += '</div>';
    return '<div class="form-group"><label>System Prompt</label><textarea id="assistantSystemPrompt" class="system-prompt-textarea" rows="8" placeholder="设定AI的人设...">'+escapeHtml(sp)+'</textarea></div><div class="form-group"><label>消息正则表达式</label>'+rh+'<div class="regex-add-row"><input type="text" id="regexNewInput" placeholder="输入正则表达式..."><button class="btn-secondary" onclick="addRegex()">添加</button></div><div style="margin-top:8px;"><button class="btn-secondary" onclick="document.getElementById(\'regexFileInput\').click()"><i data-lucide="upload" style="width:12px;height:12px;margin-right:4px;"></i>批量导入</button><input type="file" id="regexFileInput" accept=".txt,.json" hidden></div></div>';
}
function bindPromptTabEvents() { const r = document.getElementById('regexFileInput'); if(r) r.addEventListener('change', handleRegexImport); }
function addRegex() { const i = document.getElementById('regexNewInput'); const v = i.value.trim(); if(!v) return; if(!state.settings.regexRules) state.settings.regexRules=[]; state.settings.regexRules.push(v); i.value=''; renderAssistantModalContent(); }
function deleteRegex(idx) { if(!state.settings.regexRules) return; state.settings.regexRules.splice(idx,1); renderAssistantModalContent(); }
function handleRegexImport(e) { const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{ const txt=ev.target.result; let rules=[]; try{rules=JSON.parse(txt);if(!Array.isArray(rules))rules=[rules];}catch(_){rules=txt.split('\n').map(l=>l.trim()).filter(l=>l);} if(!state.settings.regexRules)state.settings.regexRules=[]; state.settings.regexRules.push(...rules); renderAssistantModalContent(); }; r.readAsText(f); e.target.value=''; }
function saveAssistantSettings() {
    const ni = document.getElementById('assistantNameInput'); if(ni) state.settings.aiName = ni.value.trim()||'AI';
    const ti = document.getElementById('assistantTemp'); if(ti) state.settings.temperature = parseInt(ti.value)/100;
    const mt = document.getElementById('assistantMaxTokens'); if(mt) state.settings.maxTokens = parseInt(mt.value)||0;
    const ctx = document.getElementById('assistantCtx'); if(ctx) state.settings.contextCount = parseInt(ctx.value);
    const sp = document.getElementById('assistantSystemPrompt'); if(sp) state.settings.systemPrompt = sp.value;
    saveState(); renderMessages(); updateHeader(); closeAssistantModal();
}

function speakMessage(idx) { const chat=getCurrentChat(); const msg=chat.messages[idx]; if(!msg)return; const u=new SpeechSynthesisUtterance(msg.content); u.lang='zh-CN'; speechSynthesis.speak(u); }
function translateMessage(idx) { const chat=getCurrentChat(); const msg=chat.messages[idx]; if(!msg)return; const provider=getActiveProvider(); if(!provider){alert('请先配置供应商');return;} fetch(provider.apiBase+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+provider.apiKey},body:JSON.stringify({model:state.settings.model,messages:[{role:'user',content:'请将以下文本翻译成英文（如果原文是英文则翻译成中文），只输出翻译结果：\n\n'+msg.content}],temperature:0.3})}).then(r=>r.json()).then(data=>{const result=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;if(result)alert('翻译结果：\n\n'+result);else alert('翻译失败');}).catch(e=>alert('翻译失败: '+e.message)); }

// ===== Sidebar =====
function openSidebar() { const s=document.getElementById('sidebar'); if(s)s.classList.remove('hidden'); const b=document.getElementById('sidebarBackdrop'); if(b)b.classList.add('active'); }
function closeSidebar() { const s=document.getElementById('sidebar'); if(s)s.classList.add('hidden'); const b=document.getElementById('sidebarBackdrop'); if(b)b.classList.remove('active'); }

// ===== Stats =====
function fmtNum(n) {
    if (!n && n !== 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}
function openStats() {
    const dailyCount = {};
    let totalMsg = 0, totalIn = 0, totalOut = 0, totalCached = 0;
    state.chats.forEach(c => c.messages.forEach(m => {
        totalMsg++;
        if (m.timestamp) {
            const d = new Date(m.timestamp);
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            dailyCount[key] = (dailyCount[key] || 0) + 1;
        }
        if (m.role === 'assistant' && m.usage) {
            totalIn += m.usage.prompt_tokens || 0;
            totalOut += m.usage.completion_tokens || 0;
            const details = m.usage.prompt_tokens_details;
            if (details && details.cached_tokens) totalCached += details.cached_tokens;
            else if (m.usage.prompt_cache_hit_tokens) totalCached += m.usage.prompt_cache_hit_tokens;
        }
    }));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setMonth(start.getMonth() - 5);
    start.setDate(1);
    const sd = start.getDay(); const off = sd === 0 ? 6 : sd - 1;
    start.setDate(start.getDate() - off);

    const weeks = []; let cur = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const count = dailyCount[key] || 0;
        let level = 0;
        if (count > 0) level = 1;
        if (count >= 3) level = 2;
        if (count >= 8) level = 3;
        if (count >= 20) level = 4;
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        if (dayIdx === 0 && cur.length) { weeks.push(cur); cur = []; }
        cur.push({ date: key, count, level, dayIdx, month: d.getMonth() + 1 });
    }
    if (cur.length) weeks.push(cur);

    const monthLabels = []; const seen = new Set();
    weeks.forEach((w, i) => { const m = w[0].month; if (!seen.has(m)) { seen.add(m); monthLabels.push({ col: i, month: m }); } });
    let monthsHtml = '';
    weeks.forEach((w, i) => {
        const found = monthLabels.find(x => x.col === i);
        monthsHtml += '<span class="month-label">' + (found ? found.month + '月' : '') + '</span>';
    });

    let weeksHtml = '';
    weeks.forEach(w => {
        weeksHtml += '<div class="stats-heatmap-week">';
        for (let day = 0; day < 7; day++) {
            const c = w.find(x => x.dayIdx === day);
            if (c) weeksHtml += '<div class="heatmap-cell level-' + c.level + '" title="' + c.date + ': ' + c.count + '条"></div>';
            else weeksHtml += '<div class="heatmap-cell empty"></div>';
        }
        weeksHtml += '</div>';
    });

    const heatmapHtml = '<div class="stats-heatmap-card">' +
        '<div class="stats-heatmap-title">聊天热力图</div>' +
        '<div class="stats-heatmap-scroll"><div class="stats-heatmap-wrap">' +
        '<div class="stats-heatmap-months">' + monthsHtml + '</div>' +
        '<div class="stats-heatmap-body">' +
        '<div class="stats-heatmap-labels"><span class="spacer">日</span><span>一</span><span class="spacer">二</span><span>三</span><span class="spacer">四</span><span>五</span><span class="spacer">日</span></div>' +
        '<div class="stats-heatmap-weeks">' + weeksHtml + '</div>' +
        '</div></div></div>' +
        '<div class="stats-heatmap-legend"><span>少</span><span class="heatmap-cell level-0"></span><span class="heatmap-cell level-1"></span><span class="heatmap-cell level-2"></span><span class="heatmap-cell level-3"></span><span class="heatmap-cell level-4"></span><span>多</span></div>' +
        '</div>';

    const cards = [
        { icon: 'bar-chart-3', label: '总对话数', value: fmtNum(state.chats.length) },
        { icon: 'message-circle', label: '总消息数', value: fmtNum(totalMsg) },
        { icon: 'cpu', label: '输入 Token', value: fmtNum(totalIn) },
        { icon: 'cpu', label: '输出 Token', value: fmtNum(totalOut) },
        { icon: 'zap', label: '缓存节省 Token', value: fmtNum(totalCached), wide: true },
        { icon: 'rocket', label: '应用启动次数', value: fmtNum(state.settings.launchCount || 1), wide: true }
    ];
    const cardsHtml = '<div class="stats-grid">' + cards.map(c => '<div class="stat-card' + (c.wide ? ' wide' : '') + '"><div class="stat-icon"><i data-lucide="' + c.icon + '"></i></div><div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>').join('') + '</div>';

    const sc = document.getElementById('statsContent'); if (sc) sc.innerHTML = heatmapHtml + cardsHtml;
    document.getElementById('statsOverlay').classList.add('active');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
function closeStats() { document.getElementById('statsOverlay').classList.remove('active'); }

// ===== Input toolbar popups =====
function togglePlusMenu() { const p = document.getElementById('plusMenu'); const s = document.getElementById('stickerPanel'); if(s)s.classList.remove('active'); if(p)p.classList.toggle('active'); const q=document.getElementById('modelQuickList'); if(q)q.style.display = 'none'; if (typeof lucide !== 'undefined') lucide.createIcons(); }
function toggleStickerPanel() { const s = document.getElementById('stickerPanel'); const p = document.getElementById('plusMenu'); if(p)p.classList.remove('active'); if(s)s.classList.toggle('active'); }
function closeInputPopups() { const p=document.getElementById('plusMenu'); if(p)p.classList.remove('active'); const s=document.getElementById('stickerPanel'); if(s)s.classList.remove('active'); const u=document.getElementById('uploadMenu'); if(u)u.classList.remove('active'); }

async function compressHistory() {
    const chat = getCurrentChat();
    if (!chat || chat.messages.length < 2) { alert('对话内容太少，无需压缩'); return; }
    const provider = getActiveProvider();
    if (!provider || !state.settings.model) { alert('请先配置供应商和模型'); return; }
    if (!confirm('将当前对话压缩成一段摘要，替换现有消息。确定继续？')) return;
    const original = chat.messages.map(m => (m.role === 'user' ? '用户: ' : 'AI: ') + m.content).join('\n\n');
    try {
        const r = await fetch(provider.apiBase + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }, body: JSON.stringify({ model: state.settings.model, messages: [{ role: 'user', content: '请用简洁的中文总结以下对话的核心内容，保留关键信息，控制在300字以内：\n\n' + original }], temperature: 0.3 }) });
        const data = await r.json();
        const summary = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!summary) throw new Error('压缩失败');
        chat.messages = [{ role: 'assistant', content: '【对话摘要】\n' + summary, timestamp: new Date().toISOString() }];
        saveState(); renderMessages(); alert('已压缩');
    } catch(e) { alert('压缩失败: ' + e.message); }
}

function openEditUser() {
    const overlay = document.getElementById('editUserOverlay'); if (!overlay) return;
    closeSidebar();
    const nameInput = document.getElementById('editUserNameInput');
    const avatarBox = document.getElementById('editUserAvatar');
    if (nameInput) nameInput.value = state.settings.userName || '郑郑';
    if (avatarBox) avatarBox.innerHTML = state.settings.userAvatar ? '<img src="' + state.settings.userAvatar + '">' : '<i data-lucide="moon"></i>';
    overlay.classList.add('active');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
function closeEditUser() { const o = document.getElementById('editUserOverlay'); if (o) o.classList.remove('active'); }
function saveEditUser() {
    const nameInput = document.getElementById('editUserNameInput');
    if (nameInput) state.settings.userName = nameInput.value.trim() || '郑郑';
    saveState();
    const disp = document.getElementById('usernameDisplay'); if (disp) disp.textContent = state.settings.userName;
    closeEditUser();
}

function toggleUploadMenu() {
    const u = document.getElementById('uploadMenu');
    const p = document.getElementById('plusMenu');
    if (p) p.classList.remove('active');
    if (u) u.classList.toggle('active');
}
function handleUploadedFile(file, type) {
    if (!file) return;
    const input = document.getElementById('messageInput');
    if (type === 'image' || (file.type && file.type.startsWith('image/'))) {
        const r = new FileReader();
        r.onload = ev => { input.value = (input.value + '\n[图片: ' + file.name + ']').trim(); autoResize(input); updateSendButton(); input.focus(); };
        r.readAsDataURL(file);
    } else {
        const r = new FileReader();
        r.onload = ev => { const content = ev.target.result; input.value = (input.value + '\n[文件: ' + file.name + ']\n' + content.slice(0, 4000)).trim(); autoResize(input); updateSendButton(); input.focus(); };
        r.readAsText(file);
    }
    const u = document.getElementById('uploadMenu'); if (u) u.classList.remove('active');
}

function buildStickerPanel() {
    const s = document.getElementById('stickerPanel');
    if (!s) return;
    s.innerHTML = STICKERS.map(e => '<button class="sticker-item">' + e + '</button>').join('');
    s.querySelectorAll('.sticker-item').forEach(btn => btn.addEventListener('click', () => { const input = document.getElementById('messageInput'); input.value += btn.textContent; autoResize(input); updateSendButton(); input.focus(); }));
}

function toggleModelQuickList() {
    const list = document.getElementById('modelQuickList');
    if (!list) return;
    if (list.style.display === 'block') { list.style.display = 'none'; return; }
    const models = state.settings.cachedModels || [];
    if (models.length === 0) { list.innerHTML = '<div class="model-quick-empty">请先在设置里获取模型列表</div>'; }
    else { list.innerHTML = models.map(m => '<div class="model-quick-item' + (m === state.settings.model ? ' active' : '') + '" data-model="' + escapeHtml(m) + '">' + escapeHtml(m) + '</div>').join(''); list.querySelectorAll('.model-quick-item').forEach(el => el.addEventListener('click', () => { state.settings.model = el.dataset.model; saveState(); updateHeader(); list.style.display = 'none'; closeInputPopups(); })); }
    list.style.display = 'block';
}

let recognition = null; let isRecording = false;
function toggleVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('当前浏览器不支持语音输入'); return; }
    const btn = document.getElementById('voiceBtn');
    if (isRecording) { if (recognition) recognition.stop(); return; }
    recognition = new SR(); recognition.lang = 'zh-CN'; recognition.interimResults = true; recognition.continuous = false;
    const input = document.getElementById('messageInput'); const base = input.value;
    recognition.onstart = () => { isRecording = true; btn.classList.add('recording'); };
    recognition.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; input.value = base + txt; autoResize(input); updateSendButton(); };
    recognition.onerror = () => { isRecording = false; btn.classList.remove('recording'); };
    recognition.onend = () => { isRecording = false; btn.classList.remove('recording'); };
    recognition.start();
}

// 小屋/记忆页面占位
function openHomePage() { closeSidebar(); alert('小屋页面开发中，敬请期待～'); }
function openMemoryPage() { closeSidebar(); alert('记忆页面开发中，敬请期待～'); }

// ===== Event Listeners =====
function on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }
function setupEventListeners() {
    on('openSidebar', 'click', openSidebar);
    on('closeSidebar', 'click', closeSidebar);
    on('sidebarBackdrop', 'click', closeSidebar);
    on('newChatBtn', 'click', () => { createNewChat(); closeSidebar(); });
    on('headerNewChat', 'click', createNewChat);
    on('currentChatTitle', 'click', editChatTitle);
    // 侧边栏底部导航（5个按钮）
    on('navHome', 'click', openHomePage);
    on('navMemory', 'click', openMemoryPage);
    on('openStats', 'click', () => { closeSidebar(); openStats(); });
    on('editAiAssistant', 'click', () => { closeSidebar(); openEditAiAssistant(); });
    on('openSettings', 'click', () => { closeSidebar(); openSettingsPanel(); });
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('input', () => { autoResize(input); updateSendButton(); });
        input.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} });
    }
    on('sendBtn', 'click', sendMessage);
    on('expandInput', 'click', openFullscreenInput);
    on('closeFullscreen', 'click', closeFullscreenInput);
    on('fullscreenSend', 'click', sendFromFullscreen);
    on('closeSettings', 'click', closeSettingsPanel);
    on('settingsOverlay', 'click', e => { if(e.target===e.currentTarget) closeSettingsPanel(); });
    on('settingsBackBtn', 'click', () => { settingsView='main'; renderSettingsView(); });
    on('closeStats', 'click', closeStats);
    on('statsOverlay', 'click', e => { if(e.target===e.currentTarget) closeStats(); });
    on('plusBtn', 'click', (e) => { e.stopPropagation(); togglePlusMenu(); });
    on('stickerBtn', 'click', (e) => { e.stopPropagation(); toggleStickerPanel(); });
    on('voiceBtn', 'click', toggleVoiceInput);
    on('modelPill', 'click', (e) => { e.stopPropagation(); togglePlusMenu(); toggleModelQuickList(); });
    on('modelSwitchRow', 'click', (e) => { e.stopPropagation(); toggleModelQuickList(); });
    on('emojiRow', 'click', (e) => { e.stopPropagation(); const s=document.getElementById('stickerPanel'); if(s) s.classList.toggle('active'); });
    on('compressRow', 'click', (e) => { e.stopPropagation(); closeInputPopups(); compressHistory(); });
    on('uploadBtn', 'click', (e) => { e.stopPropagation(); toggleUploadMenu(); });
    on('uploadFile', 'click', () => { document.getElementById('fileInputHidden').click(); });
    on('uploadCamera', 'click', () => { document.getElementById('cameraInputHidden').click(); });
    on('uploadImage', 'click', () => { document.getElementById('imageInputHidden').click(); });
    on('userInfoClickable', 'click', openEditUser);
    on('closeEditUser', 'click', closeEditUser);
    on('saveEditUser', 'click', saveEditUser);
    on('changeUserAvatarBtn', 'click', () => document.getElementById('userAvatarInput').click());
    on('editUserOverlay', 'click', e => { if (e.target === e.currentTarget) closeEditUser(); });
    const fi = document.getElementById('fileInputHidden'); if (fi) fi.addEventListener('change', e => { handleUploadedFile(e.target.files[0], 'file'); e.target.value = ''; });
    const ci = document.getElementById('cameraInputHidden'); if (ci) ci.addEventListener('change', e => { handleUploadedFile(e.target.files[0], 'image'); e.target.value = ''; });
    const ii = document.getElementById('imageInputHidden'); if (ii) ii.addEventListener('change', e => { handleUploadedFile(e.target.files[0], 'image'); e.target.value = ''; });
    const tw = document.getElementById('toggleWebSearch'); if(tw){ tw.checked = !!state.settings.webSearch; tw.addEventListener('change', () => { state.settings.webSearch = tw.checked; saveState(); }); }
    const tm = document.getElementById('toggleMcp'); if(tm){ tm.checked = !!state.settings.mcp; tm.addEventListener('change', () => { state.settings.mcp = tm.checked; saveState(); }); }
    const uai = document.getElementById('userAvatarInput'); if(uai) uai.addEventListener('change', e => { const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{ state.settings.userAvatar=ev.target.result; saveState(); applyUserAvatar(); renderMessages(); }; r.readAsDataURL(f); });
    document.addEventListener('click', (e) => { const ia = document.querySelector('.input-area'); if (ia && !ia.contains(e.target)) closeInputPopups(); });
    on('editTitleCancel', 'click', closeEditTitle);
    on('editTitleSave', 'click', saveEditTitle);
    on('editTitleOverlay', 'click', e => { if (e.target === e.currentTarget) closeEditTitle(); });
    const eti = document.getElementById('editTitleInput');
    if (eti) eti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEditTitle(); } });
    if (window.innerWidth <= 768) closeSidebar();
}

function copyMessage(idx) { const chat=getCurrentChat(); const msg=chat.messages[idx]; if(msg) navigator.clipboard.writeText(msg.content); }
function deleteMessage(idx) { const chat=getCurrentChat(); chat.messages.splice(idx,1); saveState(); renderMessages(); }
function regenerateMessage(idx) { const chat=getCurrentChat(); if(chat.messages[idx]&&chat.messages[idx].role==='assistant'){chat.messages.splice(idx,1);saveState();renderMessages();resendLastUserMessage();}else if(chat.messages[idx]&&chat.messages[idx].role==='user'){const c=chat.messages[idx].content;chat.messages=chat.messages.slice(0,idx);saveState();document.getElementById('messageInput').value=c;sendMessage();} }
async function resendLastUserMessage() { const chat=getCurrentChat(); const last=[...chat.messages].reverse().find(m=>m.role==='user'); if(last){document.getElementById('messageInput').value=last.content;chat.messages.pop();saveState();sendMessage();} }
function editMessage(idx) { const chat=getCurrentChat(); const msg=chat.messages[idx]; const nc=prompt('编辑消息:',msg.content); if(nc!==null){msg.content=nc;saveState();renderMessages();} }
function branchChat(idx) { const chat=getCurrentChat(); const bm=chat.messages.slice(0,idx+1); const nc={id:Date.now().toString(),title:'分支: '+(chat.title||'新对话'),messages:JSON.parse(JSON.stringify(bm)),createdAt:new Date().toISOString()}; state.chats.unshift(nc); state.currentChatId=nc.id; saveState(); renderChatList(); renderMessages(); updateHeader(); }
function editChatTitle() { openEditTitle(); }
function openEditTitle() {
    const chat = getCurrentChat(); if (!chat) return;
    const input = document.getElementById('editTitleInput');
    if (input) input.value = chat.title;
    const ov = document.getElementById('editTitleOverlay');
    if (ov) ov.classList.add('active');
    if (input) setTimeout(() => { input.focus(); input.select(); }, 100);
}
function closeEditTitle() { const ov = document.getElementById('editTitleOverlay'); if (ov) ov.classList.remove('active'); }
function saveEditTitle() {
    const chat = getCurrentChat();
    const input = document.getElementById('editTitleInput');
    if (!chat || !input) return;
    const t = input.value.trim();
    if (t) { chat.title = t; saveState(); renderChatList(); updateHeader(); }
    closeEditTitle();
}
function toggleMoreMenu(btn) { document.querySelectorAll('.msg-more-dropdown.show').forEach(el=>el.classList.remove('show')); const dd=btn.parentElement.querySelector('.msg-more-dropdown'); dd.classList.toggle('show'); setTimeout(()=>{document.addEventListener('click',function cl(e){if(!btn.parentElement.contains(e.target)){dd.classList.remove('show');document.removeEventListener('click',cl);}});},0); }
function toggleThinking(header) { header.classList.toggle('expanded'); header.nextElementSibling.classList.toggle('show'); }

function openFullscreenInput() { const i=document.getElementById('messageInput'); const fs=document.getElementById('fullscreenInput'); document.getElementById('fullscreenTextarea').value=i.value; fs.classList.add('active'); document.getElementById('fullscreenTextarea').focus(); }
function closeFullscreenInput() { const i=document.getElementById('messageInput'); i.value=document.getElementById('fullscreenTextarea').value; document.getElementById('fullscreenInput').classList.remove('active'); autoResize(i); updateSendButton(); }
function sendFromFullscreen() { document.getElementById('messageInput').value=document.getElementById('fullscreenTextarea').value; document.getElementById('fullscreenInput').classList.remove('active'); sendMessage(); }

function autoResize(ta) { if(!ta)return; ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,120)+'px'; }
function updateSendButton() { const b=document.getElementById('sendBtn'); const i=document.getElementById('messageInput'); if(b&&i) b.disabled=!i.value.trim(); }
function escapeHtml(text) { const d=document.createElement('div'); d.textContent=text; return d.innerHTML; }
function renderMarkdown(text) { if(typeof marked!=='undefined'){marked.setOptions({highlight:function(code,lang){if(typeof hljs!=='undefined'&&lang&&hljs.getLanguage(lang))return hljs.highlight(code,{language:lang}).value;return code;},breaks:true});return marked.parse(text);}return escapeHtml(text).replace(/\n/g,'<br>'); }
function formatTime(iso) { const d=new Date(iso); const now=new Date(); const diff=now-d; if(diff<86400000&&d.getDate()===now.getDate()) return d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}); if(diff<172800000) return '昨天'; return d.toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}); }
function formatMsgTime(iso) { if(!iso)return''; const d=new Date(iso); const Y=d.getFullYear(); const M=String(d.getMonth()+1).padStart(2,'0'); const D=String(d.getDate()).padStart(2,'0'); const h=String(d.getHours()).padStart(2,'0'); const m=String(d.getMinutes()).padStart(2,'0'); return Y+'-'+M+'-'+D+' '+h+':'+m; }

document.addEventListener('DOMContentLoaded', init);
