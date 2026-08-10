// ===== Global State =====
let currentAbortController = null;
let state = {
    chats: [],
    currentChatId: null,
    chatHistory: {
        messages: [],
        loading: false,
        loaded: false
    },

    providers: [],
    activeProviderId: null,
    settings: {
        model: '',
        systemPrompt: '',
        contextCount: 20,
        temperature: 0.7,
        maxTokens: 4096,
        theme: 'system',
        fontSize: 15,
        aiName: '晏晏',
        aiAvatar: '',
        userAvatar: '',
        userName: '郑郑',
        wallpaper: '',
        regexRules: [],
        cachedModels: [],
        webSearch: false,
        mcp: false,
        mcpServers: [],
        searchProvider: 'tavily',
        fontFamily: 'default',
        inputBgColor: '',
        sidebarBgColor: '',
        showTokenUsage: true,
        showThinking: true,
        autoCollapseThinking: false,
        renderMath: false,
        taMessages: {},
        plugins: {
            webSearchPlugin: true,
            voiceInput: true,
            stickerPanel: true
        }
    },
    isStreaming: false
};

const STICKERS = ['😊','🥰','😘','😂','🫠','🙊','😳','🥺','😝','😴','😍','😒','🙋‍♀️','🐶','🌞','🌝','🌙','💦','🍟','🍵','🧋','🦐','🐟','🐱','🐰','🐾','💕','❤️','💔','✨','🌸','🌿','🙏','👍','👌','🙌','🤗','🥲','🙋','🤍'];

let statsHeatmapDate = new Date();
let bedroomHeatmapDate = new Date();

function buildMonthWeeks(year, month) {
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= totalDays; day++) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

function monthHeatmapLevel(count, steps) {
    let level = 0;
    for (let i = 0; i < steps.length; i++) if (count >= steps[i]) level = i + 1;
    return level;
}

function renderCalendarHeatmapCard(opts) {
    const year = opts.date.getFullYear(), month = opts.date.getMonth();
    const weeks = buildMonthWeeks(year, month);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    let bodyHtml = '';
    weeks.forEach(week => {
        bodyHtml += '<div class="cal-heatmap-row">';
        week.forEach(d => {
            if (!d) { bodyHtml += '<div class="cal-day empty"></div>'; return; }
            const key = dateKey(d);
            const count = opts.dailyCount[key] || 0;
            const isFuture = d > today;
            const level = isFuture ? 0 : monthHeatmapLevel(count, opts.steps);
            const clickAttr = (!isFuture && opts.onCellClick) ? ' onclick="' + opts.onCellClick(key) + '"' : '';
            bodyHtml += '<div class="cal-day level-' + level + '"' + clickAttr + ' title="' + key + ': ' + count + '条"><span class="cal-day-num">' + d.getDate() + '</span></div>';
        });
        bodyHtml += '</div>';
    });
    const nextDisabled = isCurrentMonth ? ' disabled' : '';
    return '<div class="stats-heatmap-card">' +
        '<div class="cal-heatmap-header">' +
        '<div class="stats-heatmap-title">' + opts.title + '</div>' +
        '<div class="cal-heatmap-nav">' +
        '<button class="cal-nav-btn" onclick="' + opts.navPrev + '"><i data-lucide="chevron-left"></i></button>' +
        '<span class="cal-nav-label">' + year + '年' + (month + 1) + '月</span>' +
        '<button class="cal-nav-btn"' + nextDisabled + ' onclick="' + opts.navNext + '"><i data-lucide="chevron-right"></i></button>' +
        '</div></div>' +
        '<div class="cal-heatmap-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
        '<div class="cal-heatmap-grid">' + bodyHtml + '</div>' +
        '<div class="stats-heatmap-legend"><span>少</span><span class="heatmap-cell level-0"></span><span class="heatmap-cell level-1"></span><span class="heatmap-cell level-2"></span><span class="heatmap-cell level-3"></span><span class="heatmap-cell level-4"></span><span>多</span></div>' +
        '</div>';
}

function changeStatsHeatmapMonth(delta) {
    statsHeatmapDate = new Date(statsHeatmapDate.getFullYear(), statsHeatmapDate.getMonth() + delta, 1);
    openStats();
}

function changeBedroomHeatmapMonth(delta) {
    bedroomHeatmapDate = new Date(bedroomHeatmapDate.getFullYear(), bedroomHeatmapDate.getMonth() + delta, 1);
    renderBedroom();
}

function init() {
    loadState();
    state.isStreaming = false;
    state.settings.launchCount = (state.settings.launchCount || 0) + 1;
    saveState();
    renderChatList();
    setupEventListeners();
    applyTheme();
    applyFontSize();
    applyFontFamily();
    applyCustomColors();
    applyWallpaper();
    applyHomeBg();
    applyCustomImages();
    applyGeneralBg();
    applyChatFont();
    applyFontScales();
    applyOpacityVars();
    applyCodeWrap();
    applyInputBlur();
    applyCustomFontFace();
    applyGlassMode();
    if (window.matchMedia) { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.settings.theme === 'system') applyTheme(); }); }
    applyUserAvatar();
    applyUserName();
    applyAiIdentity();
    buildStickerPanel();
    if (state.chats.length === 0) createNewChat();
    else switchChat(state.currentChatId || state.chats[0].id);
    updateModelDisplays();
    // 自动连接已启用的 MCP 服务器
    connectAllMcpServers();
    showPage('home');
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
        const defaultSettings = state.settings;
        state = { ...state, ...parsed };
        state.settings = { ...defaultSettings, ...(parsed.settings || {}) };
        state.settings.plugins = { ...defaultSettings.plugins, ...((parsed.settings && parsed.settings.plugins) || {}) };
        if (!state.providers) state.providers = [];
        if (!state.settings.regexRules) state.settings.regexRules = [];
        if (!state.settings.cachedModels) state.settings.cachedModels = [];
        if (!state.settings.taMessages) state.settings.taMessages = {};
        if (!state.settings.mcpServers) state.settings.mcpServers = [];
        if (!state.settings.searchProvider) state.settings.searchProvider = 'tavily';
    }
    // 迁移旧正则规则：字符串数组 → 对象数组
    if (state.settings.regexRules && state.settings.regexRules.length && typeof state.settings.regexRules[0] === 'string') {
        state.settings.regexRules = state.settings.regexRules.map((rule, i) => ({
            id: 'r_' + Date.now().toString(36) + '_' + i,
            name: '规则 ' + (i + 1),
            find: rule,
            replace: '',
            scope: 'assistant',
            visualOnly: true,
            enabled: true
        }));
        saveState();
    }
    if (!state.settings.regexRules) state.settings.regexRules = [];
    // 确保 MCP 服务器有完整字段
    if (state.settings.mcpServers) {
        state.settings.mcpServers.forEach(s => {
            if (!s.type) s.type = 'streamable-http';
            if (!s.headers) s.headers = {};
            if (!s.tools) s.tools = [];
            if (s.status === undefined) s.status = 'disconnected';
        });
    }
    ensureMemorySystem();
}

function ensureMemorySystem() {
    if (!state.memorySystem) state.memorySystem = { memories: [], diaries: [], weeklyReports: [], settings: { supabaseUrl: '', supabaseKey: '', lastSyncAt: null } };
    if (!state.memorySystem.memories) state.memorySystem.memories = [];
    if (!state.memorySystem.diaries) state.memorySystem.diaries = [];
    if (!state.memorySystem.weeklyReports) state.memorySystem.weeklyReports = [];
    if (!state.memorySystem.settings) state.memorySystem.settings = { supabaseUrl: '', supabaseKey: '', lastSyncAt: null };
    if (!state.memorySystem.settings.conversationId) state.memorySystem.settings.conversationId = 'sweetmint_' + Date.now();
   // 一次性迁移：把云端拉下来的记忆从长期记忆搬到记忆宫殿
  if (!state.memorySystem.migratedToPalace) {
      state.memorySystem.memories.forEach(m => {
          if (m.source === 'cloud') m.category = 'palace';
      });
      state.memorySystem.migratedToPalace = true;
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
            html += '<div class="time-divider">' + formatDivider(msg.timestamp) + '</div>';
        }
        html += renderSingleMessage(msg, idx);
        if (curTime) lastTime = curTime;
    });
    container.innerHTML = html;
    scrollToBottom();
    if (typeof lucide !== 'undefined') lucide.createIcons();
        bindBubbleLongPress();
    if (state.settings.renderMath && typeof renderMathInElement !== 'undefined') {
        try { renderMathInElement(container, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError: false }); } catch(e) {}
    }
}

function extractThinking(content) {
    const open = '<' + 'think>'; const close = '</' + 'think>';
    if (!content || content.indexOf(open) < 0) return { think: null, main: content || '' };
    const s = content.indexOf(open) + open.length;
    const e = content.indexOf(close);
    if (e <= s) return { think: null, main: content || '' };
    return {
        think: content.substring(s, e).trim() || null,
        main: (content.substring(0, content.indexOf(open)) + content.substring(e + close.length)).trim()
    };
}

function toolDisplayCn(name) {
    const dn = (typeof ToolSystem !== 'undefined') ? ToolSystem.displayName(name) : name;
    return String(dn).replace(/^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/u, '').trim() || String(name);
}

function classifyToolCall(tc) {
    const name = tc.name || '';
    if (tc.source === 'mcp' || name.indexOf('mcp_') === 0) return 'mcp';
    if (tc.source === 'search' || /search|tavily|web_search|bing/i.test(name)) return 'search';
    return 'tool';
}

function buildInfoMarkers(msg) {
    const markers = [];
    if (!msg || msg.role === 'user') return markers;
    if (state.settings.showThinking !== false && extractThinking(msg.content).think) {
        markers.push({ kind: 'thinking', sub: 0, label: '💭 思考' });
    }
    (msg.toolCalls || []).forEach((tc, i) => {
        const kind = classifyToolCall(tc);
        if (kind === 'mcp') markers.push({ kind: 'mcp', sub: i, label: '⚡ MCP' });
        else if (kind === 'search') {
            const kw = tc.args && (tc.args.query || tc.args.keywords || tc.args.keyword);
            markers.push({ kind: 'search', sub: i, label: '🔍 搜索了' + (kw || toolDisplayCn(tc.name)) });
        }
        else markers.push({ kind: 'tool', sub: i, label: '🔧 调用了' + toolDisplayCn(tc.name) });
    });
    return markers;
}

function renderSingleMessage(msg, idx) {
    const isUser = msg.role === 'user';
    const time = msg.timestamp ? formatHM(msg.timestamp) : '';
    let mainContent = msg.content || '';
    if (!isUser) mainContent = extractThinking(msg.content).main;
    let rendered = isUser ? escapeHtml(mainContent).replace(/\n/g, '<br>') : renderMarkdown(mainContent);
    rendered = applyRegexRules(rendered, isUser ? 'user' : 'assistant');
    const userAvatarHtml = state.settings.userAvatar ? '<img src="' + state.settings.userAvatar + '">' : '🌙';
    const aiAvatarHtml = state.settings.aiAvatar ? '<img src="' + state.settings.aiAvatar + '">' : '✦';
    const nameText = isUser ? (state.settings.userName || '我') : (state.settings.aiName || '晏晏');
    const avatarHtml = isUser ? userAvatarHtml : aiAvatarHtml;
    // 幕后信息标记行（思维链 / 工具调用 / MCP / 联网搜索）
    let infoMarkersHtml = '';
    if (!isUser) {
        infoMarkersHtml = buildInfoMarkers(msg).map(m =>
            '<div class="info-marker" onclick="openMsgInfoSheet(' + idx + ',\'' + m.kind + '\',' + m.sub + ')">' + m.label + '</div>'
        ).join('');
    }
    // 第一轮文字（工具调用前AI说的话）
    let preToolBubble = '';
    if (!isUser && msg.preToolContent) {
        preToolBubble = '<div class="message-bubble" style="margin-bottom:6px;">' + renderMarkdown(msg.preToolContent) + '</div>';
    }

    return '<div class="message ' + (isUser ? 'user' : 'assistant') + '">' +
        '<div class="msg-name-row">' +
            '<div class="message-avatar">' + avatarHtml + '</div>' +
            '<span class="msg-name">' + escapeHtml(nameText) + '</span>' +
        '</div>' +
        '<div class="msg-bubble-holder">' +
            '<div class="msg-action-bar" id="actionBar' + idx + '">' + getActionBar(idx) + '</div>' +
            infoMarkersHtml +
            preToolBubble +
            '<div class="message-bubble' + (msg.starred ? ' starred' : '') + '" data-idx="' + idx + '">' + rendered + '</div>' +
        '</div>' +
        '<div class="message-footer"><span class="message-time">' + time + '</span></div>' +
    '</div>';
}

// ===== 消息幕后信息抽屉（info-sheet）=====
let infoSheetOpening = false;
function openInfoSheet(title, html) {
    infoSheetOpening = true;
    setTimeout(() => { infoSheetOpening = false; }, 60);
    const sheet = document.getElementById('infoSheet');
    if (!sheet) return;
    const backdrop = document.getElementById('infoSheetBackdrop');
    const t = document.getElementById('infoSheetTitle'); if (t) t.textContent = title;
    const c = document.getElementById('infoSheetContent'); if (c) c.innerHTML = html;
    sheet.classList.add('active'); if (backdrop) backdrop.classList.add('active');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeInfoSheet() {
    if (infoSheetOpening) return;
    const sheet = document.getElementById('infoSheet');
    const backdrop = document.getElementById('infoSheetBackdrop');
    if (sheet) sheet.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
}
function infoSheetJsonBlock(label, data) {
    if (data === undefined || data === null || data === '') data = '—';
    const value = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return '<div class="info-sheet-block"><div class="info-sheet-block-label">' + label + '</div><pre class="info-sheet-pre">' + escapeHtml(value) + '</pre></div>';
}
function openMsgInfoSheet(msgIdx, kind, sub) {
    const chat = getCurrentChat();
    if (!chat || !chat.messages[msgIdx]) return;
    const msg = chat.messages[msgIdx];
    let title = '', html = '';
    if (kind === 'thinking') {
        const t = extractThinking(msg.content);
        title = '思考';
        html = '<div class="info-sheet-text">' + escapeHtml(t.think || '') + '</div>';
    } else if (kind === 'tool' || kind === 'mcp') {
        const tc = (msg.toolCalls || [])[sub || 0];
        if (!tc) return;
        title = kind === 'mcp' ? 'MCP调用' : '工具调用';
        html = infoSheetJsonBlock('工具', toolDisplayCn(tc.name)) + infoSheetJsonBlock('输入参数', tc.args) + infoSheetJsonBlock('返回结果', tc.result);
    } else if (kind === 'search') {
        const tc = (msg.toolCalls || [])[sub || 0];
        if (!tc) return;
        const kw = tc.args && (tc.args.query || tc.args.keywords || tc.args.keyword);
        title = '联网搜索';
        html = infoSheetJsonBlock('搜索关键词', kw || toolDisplayCn(tc.name)) + infoSheetJsonBlock('返回结果', tc.result);
    } else return;
    openInfoSheet(title, html);
}

function setupInfoSheetDrag() {
    const sheet = document.getElementById('infoSheet');
    const handle = document.getElementById('infoSheetHandle');
    const header = document.getElementById('infoSheetHeader');
    if (!sheet || !handle) return;
    const dragTargets = [handle, header].filter(Boolean);
    let startY = 0, currentY = 0, dragging = false;
    dragTargets.forEach(target => {
        target.style.touchAction = 'none';
        target.addEventListener('pointerdown', e => {
            dragging = true; startY = e.clientY; currentY = 0;
            sheet.style.transition = 'none';
            if (target.setPointerCapture) { try { target.setPointerCapture(e.pointerId); } catch (err) {} }
        });
        target.addEventListener('pointermove', e => {
            if (!dragging) return;
            currentY = Math.max(0, e.clientY - startY);
            sheet.style.transform = 'translateY(' + currentY + 'px)';
        });
        const finish = () => {
            if (!dragging) return;
            dragging = false;
            sheet.style.transition = '';
            sheet.style.transform = '';
            if (currentY > 90) closeInfoSheet();
            currentY = 0;
        };
        target.addEventListener('pointerup', finish);
        target.addEventListener('pointercancel', finish);
    });
}

function formatHM(iso) { if (!iso) return ''; const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

function formatDivider(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
}

function getActionBar(idx) {
    const btns = [
        { icon: 'copy', fn: 'copyMessage(' + idx + ')' },
        { icon: 'refresh-cw', fn: 'regenerateMessage(' + idx + ')' },
        { icon: 'languages', fn: 'translateMessage(' + idx + ')' },
        { icon: 'star', fn: 'toggleStar(' + idx + ')' },
        { icon: 'pencil', fn: 'editMessage(' + idx + ')' },
        { icon: 'trash-2', fn: 'deleteMessage(' + idx + ')' }
    ];
    return btns.map(b => '<button class="action-bar-btn' + (b.icon === 'trash-2' ? ' danger' : '') + '" onclick="hideAllActionBars();' + b.fn + '"><i data-lucide="' + b.icon + '"></i></button>').join('');
}


function hideAllActionBars() {
    document.querySelectorAll('.msg-action-bar.show').forEach(el => el.classList.remove('show'));
}

function toggleStar(idx) {
    const chat = getCurrentChat(); if (!chat || !chat.messages[idx]) return;
    const msg = chat.messages[idx];
    msg.starred = !msg.starred;
    saveState();
    renderMessages();
    showToast(msg.starred ? '已收藏' : '已取消收藏');
}

function openStarredList() {
    const items = [];
    (state.chats || []).forEach(c => {
        (c.messages || []).forEach((m, i) => {
            if (m.starred) items.push({ chatId: c.id, chatTitle: c.title || '新对话', idx: i, msg: m });
        });
    });
    if (!items.length) { alert('还没有收藏任何消息～'); return; }
    const html = items.reverse().map(it =>
        '<div class="star-item" onclick="jumpToStarred(\'' + it.chatId + '\',' + it.idx + ')">' +
            '<div class="star-item-head"><span class="star-item-role">' + (it.msg.role === 'user' ? (state.settings.userName || '我') : (state.settings.aiName || '晏晏')) + '</span><span class="star-item-chat">' + escapeHtml(it.chatTitle) + '</span></div>' +
            '<div class="star-item-text">' + escapeHtml((it.msg.content || '').replace(/\s+/g, ' ').slice(0, 80)) + '</div>' +
            '<div class="star-item-delete" onclick="event.stopPropagation();removeStarred(\'' + it.chatId + '\',' + it.idx + ')">删除</div>' +
        '</div>'
    ).join('');
    const ov = document.getElementById('bedroomOverlay');
    const t = document.getElementById('bedroomTitle');
    const c = document.getElementById('bedroomContent');
    if (!ov || !c) return;
    if (t) t.textContent = '收藏';
    c.innerHTML = '<div class="star-list">' + html + '</div>';
    ov.classList.add('active');
    document.querySelectorAll('.star-item').forEach(el => {
        let startX = 0, currentX = 0, swiped = false;
        el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
        el.addEventListener('touchmove', e => {
            currentX = e.touches[0].clientX - startX;
            if (currentX < -30 && !swiped) { el.classList.add('swiped'); swiped = true; }
            if (currentX > 20 && swiped) { el.classList.remove('swiped'); swiped = false; }
        }, { passive: true });
    });
    bedroomView = 'starred';
}

function removeStarred(chatId, idx) {
    const chat = state.chats.find(c => c.id === chatId);
    if (chat && chat.messages[idx]) {
        chat.messages[idx].starred = false;
        saveState();
        openStarredList(); // 重新渲染列表
    }
}

function jumpToStarred(chatId, idx) {
    const ov = document.getElementById('bedroomOverlay');
    if (ov) ov.classList.remove('active');
    if (state.currentChatId !== chatId) { switchChat(chatId); }
    showPage('chat');
    setTimeout(() => {
        const nodes = document.querySelectorAll('#messages .message');
        if (nodes[idx]) nodes[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
}

function showToast(text) {
    let el = document.getElementById('appToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'appToast';
        el.className = 'app-toast';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function bindBubbleLongPress() {
    document.querySelectorAll('#messages .message-bubble').forEach(bubble => {
        let timer = null;
        const idx = bubble.dataset.idx;
        const show = () => {
            hideAllActionBars();
            const bar = document.getElementById('actionBar' + idx);
            if (bar) {
                bar.classList.add('show');
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };
        bubble.addEventListener('touchstart', () => { timer = setTimeout(show, 450); }, { passive: true });
        bubble.addEventListener('touchmove', () => { clearTimeout(timer); }, { passive: true });
        bubble.addEventListener('touchend', () => { clearTimeout(timer); });
        bubble.addEventListener('contextmenu', e => { e.preventDefault(); show(); });
    });
}

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
function handleSendClick() {
    const chat = getCurrentChat();
    if (chat && chat.isStreaming) {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        chat.isStreaming = false;
        const loadEl = document.getElementById('loading-message');
        if (loadEl) loadEl.remove();
        const typingEl = document.getElementById('tool-typing');
        if (typingEl) typingEl.remove();
        updateSendButton();
    } else {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    const chat = getCurrentChat();
    if (!content || (chat && chat.isStreaming)) return; 
    const provider = getActiveProvider();
    if (!provider || !provider.apiBase || !provider.apiKey || !state.settings.model) { alert('请先在设置中配置供应商和模型'); return; }
    chat.messages.push({ role: 'user', content, timestamp: new Date().toISOString() });
    input.value = ''; autoResize(input); updateSendButton(); renderMessages();
    if (chat.messages.filter(m => m.role === 'user').length === 1) { chat.title = content.slice(0, 20) + (content.length > 20 ? '...' : ''); renderChatList(); updateHeader(); }

    const messagesContainer = document.getElementById('messages');
    const aiAvatarHtml = state.settings.aiAvatar ? '<img src="' + state.settings.aiAvatar + '">' : '✦';

    // 显示加载动画
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = 'loading-message';
    loadingDiv.innerHTML = '<div class="msg-name-row"><div class="message-avatar">' + aiAvatarHtml + '</div><span class="msg-name">' + escapeHtml(state.settings.aiName || '晏晏') + '</span></div><div class="msg-bubble-holder"><div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>';
    messagesContainer.appendChild(loadingDiv);
    scrollToBottom();

    const apiMessages = [];
    if (state.settings.systemPrompt) apiMessages.push({ role: 'system', content: state.settings.systemPrompt });
    const ctxCount = state.settings.contextCount >= 50 ? chat.messages.length : state.settings.contextCount;
    apiMessages.push(...chat.messages.slice(-ctxCount).map(m => ({ role: m.role, content: m.content })));

    chat.isStreaming = true;
updateSendButton();
currentAbortController = new AbortController();
    const startTime = Date.now();
    const maxToolRounds = 5;
        let assistantDiv = null;
        let bubble = null;
        let toolContainer = null;
    try {
        let currentMessages = [...apiMessages];
        let finalContent = '';
        let toolCallLog = [];
        let preToolContent = '';
        

        for (let round = 0; round < maxToolRounds; round++) {
            const parser = new ToolCallParser();
            let assistantContent = '';

            const body = { model: state.settings.model, messages: currentMessages, temperature: state.settings.temperature, stream: true, stream_options: { include_usage: true } };
            if (state.settings.maxTokens) body.max_tokens = state.settings.maxTokens;
            const toolSchemas = ToolSystem.getSchemas();
            if (toolSchemas) body.tools = toolSchemas;

            const response = await fetch(provider.apiBase + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey },
    body: JSON.stringify(body),
    signal: currentAbortController ? currentAbortController.signal : undefined
});

            if (!response.ok) throw new Error('API 错误: ' + response.status + ' ' + response.statusText);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let usage = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n'); buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.usage) usage = parsed.usage;
                        const choice = parsed.choices && parsed.choices[0];
                        if (!choice) continue;
                        const delta = choice.delta || {};

                        parser.processDelta(delta);

                        if (delta.content) {
                            // 首次收到文字：清除 loading，创建气泡
                            if (!bubble) {
                                const ld = document.getElementById('loading-message');
                                if (ld) ld.remove();
                                const tt = document.getElementById('tool-typing');
                                if (tt) tt.remove();

                                if (!assistantDiv) {
                                    assistantDiv = document.createElement('div');
                                    assistantDiv.className = 'message assistant';
                                    assistantDiv.innerHTML = '<div class="msg-name-row"><div class="message-avatar">' + aiAvatarHtml + '</div><span class="msg-name">' + escapeHtml(state.settings.aiName || '晏晏') + '</span></div><div class="msg-bubble-holder"></div>';
                                    messagesContainer.appendChild(assistantDiv);
                                    toolContainer = assistantDiv.querySelector('.msg-bubble-holder');
                                }
                                bubble = document.createElement('div');
                                bubble.className = 'message-bubble';
                                toolContainer.appendChild(bubble);
                            }
                            assistantContent += delta.content;
                            bubble.innerHTML = renderMarkdown(assistantContent);
                            scrollToBottom();
                        }
                    } catch (e) { /* skip */ }
                }
            }

            // 流结束，检查 tool_calls
            const toolCalls = parser.finalize();

            if (toolCalls && toolCalls.length > 0) {
                // 清除初始 loading
                const ld = document.getElementById('loading-message');
                if (ld) ld.remove();

                // 如果有空气泡，删掉
                if (bubble && !bubble.textContent.trim()) {
                    bubble.remove();
                    bubble = null;
                }

                // 确保有容器
                if (!assistantDiv) {
                    assistantDiv = document.createElement('div');
                    assistantDiv.className = 'message assistant';
                    assistantDiv.innerHTML = '<div class="msg-name-row"><div class="message-avatar">' + aiAvatarHtml + '</div><span class="msg-name">' + escapeHtml(state.settings.aiName || '晏晏') + '</span></div><div class="msg-bubble-holder"></div>';
                    messagesContainer.appendChild(assistantDiv);
                    toolContainer = assistantDiv.querySelector('.msg-bubble-holder');
                }

                // 保存第一轮文字
                if (assistantContent) preToolContent = assistantContent;
                // 加入消息历史
                currentMessages.push({
                    role: 'assistant',
                    content: assistantContent || null,
                    tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments) } }))
                });
                // 执行每个工具
                for (const tc of toolCalls) {
                    const toolName = tc.function.name;
                    const toolArgs = tc.function.arguments;

                    // UI: 显示正在调用（统一标记行）
                    const toolEl = document.createElement('div');
                    toolEl.className = 'info-marker';
                    toolEl.innerHTML = '<span class="info-marker-spinner"></span><span>🔧 调用了' + toolDisplayCn(toolName) + '...</span>';
                    toolContainer.insertBefore(toolEl, bubble || null);
                    scrollToBottom();

                    // 执行
                    const result = await ToolSystem.execute(toolName, toolArgs);

                    // UI: 显示完成（点击查看详情）
                    const isErr = !!result.error;
                    toolEl.innerHTML = '<span>🔧 调用了' + toolDisplayCn(toolName) + (isErr ? '（失败）' : '') + '</span>';
                    toolEl.classList.add('info-marker-done');
                    toolEl.onclick = function () {
                        openInfoSheet('工具调用', infoSheetJsonBlock('工具', toolDisplayCn(toolName)) + infoSheetJsonBlock('输入参数', toolArgs) + infoSheetJsonBlock('返回结果', result));
                    };

                    // 记录
                    toolCallLog.push({ name: toolName, args: toolArgs, result: result });
                    currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
                }

                // 重置 bubble，下一轮创建新气泡
                bubble = null;

                // 显示等待动画
                const typingBubble = document.createElement('div');
                typingBubble.className = 'message-bubble';
                typingBubble.id = 'tool-typing';
                typingBubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
                toolContainer.appendChild(typingBubble);
                scrollToBottom();

                continue;
            }

            // 没有 tool_calls，正常结束
            finalContent = assistantContent;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            const assistantMsg = { role: 'assistant', content: finalContent, timestamp: new Date().toISOString(), usage: usage, duration: duration, toolCalls: toolCallLog.length ? toolCallLog : null, preToolContent: preToolContent || null };
            chat.messages.push(assistantMsg);
            saveState();
            renderMessages();
            syncMessageToSupabase(chat.messages[chat.messages.length - 2], chat.id);
            syncMessageToSupabase(assistantMsg, chat.id);
            break;
        }
    } catch (error) {
    // 如果是用户主动取消，不显示错误
    if (error.name === 'AbortError') {
        // 保留已输出的内容
        const chat = getCurrentChat();
        if (chat && bubble && bubble.textContent.trim()) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            chat.messages.push({ role: 'assistant', content: bubble.textContent, timestamp: new Date().toISOString(), duration: duration, interrupted: true });
            saveState();
        }
    } else {
        const ld = document.getElementById('loading-message');
        if (ld) ld.remove();
        const tt = document.getElementById('tool-typing');
        if (tt) tt.remove();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message assistant';
        errorDiv.innerHTML = '<div class="msg-name-row"><div class="message-avatar">⚠️</div></div><div class="msg-bubble-holder"><div class="message-bubble" style="color:#e74c3c;">发送失败: ' + escapeHtml(error.message) + '</div></div>';
        messagesContainer.appendChild(errorDiv);
        scrollToBottom();
    }
} finally {
    const chat = getCurrentChat();
    if (chat) chat.isStreaming = false;
    currentAbortController = null;
    updateSendButton();
}
}

// ===== Settings Panel =====
let settingsView = 'main'; let editingProviderId = null; let settingsStack = ['main'];

function openSettingsPanel() { settingsView = 'main'; settingsStack = ['main']; editingProviderId = null; renderSettingsView(); document.getElementById('settingsOverlay').classList.add('active'); }
function closeSettingsPanel() {
    const spEl = document.getElementById('settingsSystemPrompt');
    if (spEl) state.settings.systemPrompt = spEl.value;
    saveState();
    renderMessages();
    updateHeader();
    applyAiIdentity();
    showToast('已保存');
}
function dismissSettingsPanel() {
    document.getElementById('settingsOverlay').classList.remove('active');
    closeProfileSheet();
}

function renderSettingsView() {
    const content = document.getElementById('settingsContent'); const footer = document.getElementById('settingsFooter');
    const title = document.getElementById('settingsTitle'); const backBtn = document.getElementById('settingsBackBtn');
    if (settingsView === 'main') {
        title.textContent = '设置'; backBtn.style.display = 'flex';
        const saveBtn = document.getElementById('closeSettings');
        if (saveBtn) saveBtn.style.display = 'none';
        content.innerHTML = renderMainSettings();
        footer.innerHTML = ''; footer.style.display = 'none';
        content.classList.remove('settings-slide-in');
    }
    else if (settingsView === 'provider-detail') {
        const p = state.providers.find(x => x.id === editingProviderId);
        title.textContent = p ? '编辑供应商' : '添加供应商'; backBtn.style.display = 'flex';
        content.innerHTML = renderProviderDetail(p);
        footer.innerHTML = '<button class="btn-primary" onclick="saveProviderDetail()">保存供应商</button>'; footer.style.display = '';
        settingsSlideIn(content);
    }
    else if (settingsView === 'cloud-sync') {
        ensureMemorySystem(); title.textContent = '云端同步'; backBtn.style.display = 'flex';
        content.innerHTML = renderCloudSync();
        footer.innerHTML = ''; footer.style.display = 'none';
        settingsSlideIn(content);
    }
    else {
        const def = SETTINGS_PAGES[settingsView];
        if (def) {
            title.textContent = def[0]; backBtn.style.display = 'flex';
            content.innerHTML = def[2]();
            footer.innerHTML = ''; footer.style.display = 'none';
            settingsSlideIn(content);
        }
    }
    bindSettingsContentEvents();
    const saveBtn = document.getElementById('closeSettings');
    if (saveBtn) {
        if (settingsView === 'main' || settingsView === 'displaySettings') {
            saveBtn.style.display = 'none';
        } else {
            saveBtn.style.display = 'flex';
        }
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function settingsSlideIn(el) {
    el.classList.remove('settings-slide-in'); void el.offsetWidth; el.classList.add('settings-slide-in');
}

function settingsGo(v) { settingsStack.push(v); settingsView = v; renderSettingsView(); }
function settingsBack() {
    if (settingsStack.length > 1) {
        settingsStack.pop();
        settingsView = settingsStack[settingsStack.length - 1] || 'main';
        renderSettingsView();
    } else {
        dismissSettingsPanel();
    }
}

const PLUGIN_DEFS = [
    { id: 'webSearchPlugin', name: '联网搜索', desc: '让助手可以搜索实时信息' },
    { id: 'voiceInput', name: '语音输入', desc: '使用麦克风将语音转成文字' },
    { id: 'stickerPanel', name: '表情面板', desc: '发送消息时插入可爱表情' }
];

function renderMainSettings() {
    const theme = state.settings.theme || 'system';
    const themeLabels = { system: '跟随系统', light: '浅色', dark: '深色' };
    const themeOpts = [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => '<option value="' + v + '"' + (theme === v ? ' selected' : '') + '>' + l + '</option>').join('');
    return renderProfileCard() +
        settingsGroup('通用设置', [
            settingsEntry('sun', '颜色模式', themeLabels[theme] || '跟随系统', '<select class="settings-inline-select" id="themeModeSelect">' + themeOpts + '</select>'),
            settingsEntry('layout', '显示设置', '外观、字体、透明度', settingsChevron(), "settingsGo('displaySettings')"),
            settingsEntry('bot', '助手设置', 'AI人设与参数', settingsChevron(), "settingsGo('assistantSettings')")
        ]) +
        settingsGroup('模型与服务', [
            settingsEntry('cpu', '聊天模型', '供应商与模型配置', settingsChevron(), "settingsGo('chatModel')"),
            settingsEntry('layers', '功能模型', '对话、总结、识别', settingsChevron(), "settingsGo('functionModel')"),
            settingsEntry('mic', '语音服务', '敬请期待', settingsChevron(), 'settingsComingSoon()'),
            settingsEntry('globe', '搜索服务', '敬请期待', settingsChevron(), 'settingsComingSoon()'),
            settingsEntry('blocks', 'MCP服务', '和风天气、Supabase', settingsChevron(), "settingsGo('mcpService')"),
            settingsEntry('wrench', '系统工具', '敬请期待', settingsChevron(), 'settingsComingSoon()')
        ]) +
        settingsGroup('上下文总结', [
            settingsEntry('file-text', '上下文总结', '上下文设置与自动总结', settingsChevron(), "settingsGo('contextSummary')")
        ]) +
        settingsGroup('数据设置', [
            settingsEntry('bar-chart', 'token使用统计', '对话用量与token统计', settingsChevron(), 'openStats()'),
            settingsEntry('database', '数据备份与恢复', '导出、导入、云端同步', settingsChevron(), "settingsGo('dataBackup')")
        ]);
}

function renderProfileCard() {
    const name = state.settings.userName || '郑郑';
    const avatar = state.settings.userAvatar || '';
    return '<div class="settings-profile-card">' +
        '<div class="settings-profile-avatar-wrap">' +
            '<div class="settings-profile-avatar" id="settingsProfileAvatar">' + (avatar ? '<img src="' + avatar + '">' : '<i data-lucide="moon"></i>') + '</div>' +
            '<button class="settings-profile-edit" id="settingsProfileEditBtn" title="编辑个人资料" onclick="openProfileSheet()"><i data-lucide="pencil"></i></button>' +
        '</div>' +
        '<div class="settings-profile-name" id="settingsProfileName">' + escapeHtml(name) + '</div>' +
    '</div>';
}

function settingsGroup(title, rows) {
    return (title ? '<div class="settings-group-title">' + title + '</div>' : '') + '<div class="settings-list-card">' + rows.join('') + '</div>';
}
function settingsChevron() { return '<i data-lucide="chevron-right" class="settings-entry-chevron"></i>'; }
function settingsEntry(icon, title, sub, right, onclick) {
    return '<div class="settings-entry-row' + (onclick ? ' settings-entry-click' : '') + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' +
        '<div class="settings-entry-icon"><i data-lucide="' + icon + '"></i></div>' +
        '<div class="settings-entry-info"><div class="settings-entry-title">' + title + '</div>' + (sub ? '<div class="settings-entry-sub">' + sub + '</div>' : '') + '</div>' +
        '<div class="settings-entry-right">' + (right || '') + '</div></div>';
}
function settingsComingSoon() { showToast('敬请期待'); }

function renderSettingsPlaceholder(icon, title) {
    return '<div class="settings-detail-empty">' +
        '<div class="settings-detail-empty-icon"><i data-lucide="' + icon + '"></i></div>' +
        '<div class="settings-detail-empty-title">' + title + '</div>' +
        '<div class="settings-detail-empty-sub">此页面的详细设置将在下一步完善</div>' +
    '</div>';
}

function renderDataBackupPage() {
    ensureMemorySystem();
    const s = state.memorySystem.settings;
    const status = s.supabaseUrl && s.supabaseKey ? (s.lastSyncAt ? '已连接' : '已配置，未同步') : '未配置';
    return settingsGroup('数据导入导出', [
        '<div class="settings-row settings-row-click" onclick="exportData()"><span class="settings-row-label"><i data-lucide="download" class="settings-row-icon"></i>数据导出</span><i data-lucide="chevron-right"></i></div>',
        '<div class="settings-row settings-row-click" onclick="document.getElementById(\'importFileInput\').click()"><span class="settings-row-label"><i data-lucide="upload" class="settings-row-icon"></i>数据导入</span><i data-lucide="chevron-right"></i></div>'
    ]) +
    '<input type="file" id="importFileInput" accept=".json" hidden>' +
    settingsGroup('云端同步', [
        '<div class="settings-row"><span class="settings-row-label">连接状态</span><span class="settings-row-value" id="cloudStatus">' + status + '</span></div>',
        '<div class="settings-row"><span class="settings-row-label">上次同步</span><span class="settings-row-value">' + (s.lastSyncAt ? formatMsgTime(s.lastSyncAt) : '从未同步') + '</span></div>',
        '<div class="settings-row"><span class="settings-row-label">会话ID</span><span class="settings-row-value" style="font-size:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(s.conversationId || '未生成') + '</span></div>'
    ]) +
    '<div class="form-group" style="margin-top:14px;"><label>Supabase URL</label><input type="text" id="csUrl" placeholder="https://xxx.supabase.co" value="' + escapeHtml(s.supabaseUrl || '') + '"></div>' +
    '<div class="form-group"><label>Supabase Anon Key</label><input type="password" id="csKey" placeholder="eyJ..." value="' + escapeHtml(s.supabaseKey || '') + '"></div>' +
    '<button class="btn-secondary" style="width:100%;justify-content:center;margin-bottom:10px;" onclick="saveCloudSyncConfig()">保存配置</button>' +
    '<button class="btn-secondary" style="width:100%;justify-content:center;margin-bottom:10px;" onclick="testCloudConnection()">测试连接</button>' +
    '<button class="btn-primary bedroom-save-btn" onclick="pullMemoriesFromCloud()">拉取云端记忆</button>';
}

function hexToHsl(hex) {
    hex = (hex || '#FCF2E6').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substr(0,2),16)/255, g = parseInt(hex.substr(2,2),16)/255, b = parseInt(hex.substr(4,2),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b); let h, s, l = (max+min)/2;
    if (max === min) { h = 0; s = 0; }
    else { const d = max - min; s = l > 0.5 ? d/(2-max-min) : d/(max+min);
        switch(max) { case r: h = (g-b)/d + (g<b?6:0); break; case g: h = (b-r)/d + 2; break; default: h = (r-g)/d + 4; }
        h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s*100), l: Math.round(l*100) };
}
function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h/30) % 12;
    const a = s * Math.min(l, 1-l);
    const f = n => l - a * Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));
    const toHex = x => Math.round(255*x).toString(16).padStart(2,'0');
    return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}
function toggleRow(key, label, checked) {
    return '<div class="settings-row"><span class="settings-row-label">' + label + '</span><label class="switch"><input type="checkbox" class="msg-display-toggle" data-key="' + key + '"' + (checked ? ' checked' : '') + '><span class="switch-slider"></span></label></div>';
}

function renderProviderDetail(provider) {
    const name = provider ? provider.name : ''; const apiBase = provider ? provider.apiBase : ''; const apiKey = provider ? provider.apiKey : '';
    return '<div class="form-group"><label>供应商名称</label><input type="text" id="providerNameInput" placeholder="例如：聚梦AI" value="' + escapeHtml(name) + '"></div><div class="form-group"><label>API Base URL</label><input type="text" id="providerBaseInput" placeholder="https://api.example.com/v1" value="' + escapeHtml(apiBase) + '"></div><div class="form-group"><label>API Key</label><div class="input-with-btn"><input type="password" id="providerKeyInput" placeholder="sk-..." value="' + escapeHtml(apiKey) + '"><button class="btn-small" onclick="toggleProviderKeyVisibility()"><i data-lucide="eye"></i></button></div></div><button class="btn-primary" onclick="testProviderConnection()"><i data-lucide="plug" style="width:14px;height:14px;margin-right:6px;"></i>测试连接</button><span class="connection-status" id="providerConnectionStatus"></span>';
}

function bindSettingsContentEvents() {
    const tms = document.getElementById('themeModeSelect');
    if (tms) tms.addEventListener('change', () => { state.settings.theme = tms.value; saveState(); applyTheme(); renderSettingsView(); });
    const imp = document.getElementById('importFileInput');
    if (imp) imp.addEventListener('change', handleImportData);
    document.querySelectorAll('.wp-hidden-input').forEach(inp => inp.addEventListener('change', handleWallpaperPick));
    document.querySelectorAll('.msg-display-toggle').forEach(t => t.addEventListener('change', () => {
        state.settings[t.dataset.key] = t.checked;
        saveState();
        applySettingChange(t.dataset.key);
        renderMessages();
    }));
    document.querySelectorAll('.settings-range').forEach(r => r.addEventListener('input', () => {
        const key = r.dataset.key;
        const raw = parseFloat(r.value);
        const scale = parseFloat(r.dataset.scale || '1');
        const val = raw / scale;
        state.settings[key] = val;
        saveState();
        const d = document.getElementById('rangeVal-' + key);
        if (d) d.textContent = rangeDisplayText(key, val);
        applySettingChange(key);
    }));
    document.querySelectorAll('.settings-text-input').forEach(inp => inp.addEventListener('change', () => {
        state.settings[inp.dataset.key] = inp.value.trim();
        saveState();
        applySettingChange(inp.dataset.key);
    }));
    document.querySelectorAll('.settings-number-input').forEach(inp => inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) state.settings[inp.dataset.key] = v;
        else state.settings[inp.dataset.key] = inp.value.trim();
        saveState();
        applySettingChange(inp.dataset.key);
    }));
    document.querySelectorAll('[data-fm-model]').forEach(inp => inp.addEventListener('change', () => {
        if (!state.settings.functionModels) state.settings.functionModels = {};
        if (!state.settings.functionModels[inp.dataset.fmModel]) state.settings.functionModels[inp.dataset.fmModel] = {};
        state.settings.functionModels[inp.dataset.fmModel].model = inp.value.trim();
        saveState();
    }));
    document.querySelectorAll('.fm-default-toggle').forEach(t => t.addEventListener('change', () => {
        if (!state.settings.functionModels) state.settings.functionModels = {};
        if (!state.settings.functionModels[t.dataset.fm]) state.settings.functionModels[t.dataset.fm] = {};
        state.settings.functionModels[t.dataset.fm].useDefault = t.checked;
        saveState();
        renderSettingsView();
    }));
    document.querySelectorAll('.mcp-toggle').forEach(t => t.addEventListener('change', () => {
        const srv = (state.settings.mcpServers || []).find(s => s.id === t.dataset.mcp);
        if (srv) { srv.enabled = t.checked; saveState(); }
    }));
    document.querySelectorAll('.general-bg-page-check').forEach(c => c.addEventListener('change', () => {
        if (!state.settings.generalBgPages) state.settings.generalBgPages = [];
        const arr = state.settings.generalBgPages;
        const v = c.value;
        if (c.checked && arr.indexOf(v) < 0) arr.push(v);
        if (!c.checked && arr.indexOf(v) >= 0) arr.splice(arr.indexOf(v), 1);
        saveState();
        applyGeneralBg();
    }));
    const selAll = document.querySelector('.general-bg-select-all');
    if (selAll) selAll.addEventListener('change', () => {
        const checks = document.querySelectorAll('.general-bg-page-check');
        checks.forEach(c => { c.checked = selAll.checked; c.dispatchEvent(new Event('change')); });
    });
    document.querySelectorAll('.segmented-btn[data-chat-font]').forEach(b => b.addEventListener('click', () => {
        state.settings.chatFont = b.dataset.chatFont;
        saveState();
        applyChatFont();
        renderSettingsView();
    }));
    const sel = document.getElementById('providerSelect');
    if (sel) sel.addEventListener('change', () => { state.activeProviderId = sel.value; saveState(); renderSettingsView(); });
    const pBase = document.getElementById('providerBaseEdit');
    if (pBase) pBase.addEventListener('change', saveChatModelProvider);
    const pKey = document.getElementById('providerKeyEdit');
    if (pKey) pKey.addEventListener('change', saveChatModelProvider);
    const cModel = document.getElementById('chatModelInput');
    if (cModel) {
        cModel.addEventListener('focus', async () => {
            const ml = document.getElementById('modelList');
            if (!ml) return;
            if (!state.settings.cachedModels || !state.settings.cachedModels.length) {
                await fetchChatModels();
            } else {
                renderModelListFromCache(cModel.value);
            }
        });
        cModel.addEventListener('input', () => {
            renderModelListFromCache(cModel.value);
        });
        cModel.addEventListener('change', () => {
            state.settings.model = cModel.value.trim();
            saveState();
            updateHeader();
        });
    }
    const fb = document.getElementById('chatFetchModelsBtn');
    if (fb) fb.addEventListener('click', fetchChatModels);
    const spEl = document.getElementById('settingsSystemPrompt');
    if (spEl) spEl.addEventListener('change', () => { state.settings.systemPrompt = spEl.value; saveState(); });
    const cfi = document.getElementById('customFontInput');
    if (cfi) cfi.addEventListener('change', handleCustomFontPick);
    const rf = document.getElementById('regexFileInputDetail');
    if (rf) rf.addEventListener('change', handleRegexImportDetail);
    const mms = document.getElementById('memoryModeSelect');
    if (mms) mms.addEventListener('change', () => { state.settings.memoryMode = mms.value; saveState(); });
    initProfileSheet();
}

// ===== 个人资料编辑底部抽屉 =====
function ensureProfileSheet() {
    let wrap = document.getElementById('profileSheetWrap');
    if (wrap) { if (!wrap.dataset.bound) bindProfileSheetEvents(); return; }
    wrap = document.createElement('div');
    wrap.id = 'profileSheetWrap';
    wrap.className = 'profile-sheet-wrap';
    wrap.innerHTML =
        '<div class="profile-sheet-backdrop" id="profileSheetBackdrop"></div>' +
        '<div class="profile-sheet" id="profileSheet">' +
            '<div class="profile-sheet-handle"></div>' +
            '<div class="profile-sheet-avatar-wrap">' +
                '<div class="profile-sheet-avatar" id="profileSheetAvatar"><i data-lucide="moon"></i></div>' +
                '<button class="profile-sheet-camera" id="profileSheetCamera" title="更换头像"><i data-lucide="camera"></i></button>' +
            '</div>' +
            '<div class="profile-sheet-field"><label>名字</label><input type="text" id="profileSheetName" placeholder="输入你的名字" maxlength="16"></div>' +
            '<button class="btn-primary profile-sheet-save" id="profileSheetSave">保存个人资料</button>' +
            '<button class="profile-sheet-cancel" id="profileSheetCancel">取消</button>' +
            '<input type="file" id="profileSheetAvatarInput" accept="image/*" hidden>' +
        '</div>';
    document.body.appendChild(wrap);
    bindProfileSheetEvents();
}
function bindProfileSheetEvents() {
    const wrap = document.getElementById('profileSheetWrap');
    if (!wrap || wrap.dataset.bound) return;
    wrap.dataset.bound = '1';
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('profileSheetBackdrop', closeProfileSheet);
    on('profileSheetCancel', closeProfileSheet);
    on('profileSheetCamera', () => document.getElementById('profileSheetAvatarInput').click());
    document.getElementById('profileSheetAvatarInput').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = ev => {
            const dataUrl = ev.target.result;
            try {
                state.settings.userAvatar = dataUrl;
                saveState();
                const av = document.getElementById('profileSheetAvatar');
                if (av) av.innerHTML = '<img src="' + dataUrl + '">';
                showToast('头像已更新');
            } catch (err) { alert('图片过大，无法保存'); }
        };
        r.readAsDataURL(f);
        e.target.value = '';
    });
    on('profileSheetSave', saveProfileSheet);
}
function openProfileSheet() {
    ensureProfileSheet();
    const wrap = document.getElementById('profileSheetWrap');
    const av = document.getElementById('profileSheetAvatar');
    if (av) { const avatar = state.settings.userAvatar || ''; av.innerHTML = avatar ? '<img src="' + avatar + '">' : '<i data-lucide="moon"></i>'; }
    const ni = document.getElementById('profileSheetName');
    if (ni) ni.value = state.settings.userName || '郑郑';
    wrap.classList.add('active');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
function closeProfileSheet() {
    const wrap = document.getElementById('profileSheetWrap');
    if (wrap) wrap.classList.remove('active');
}
function saveProfileSheet() {
    const ni = document.getElementById('profileSheetName');
    if (ni) state.settings.userName = ni.value.trim() || '郑郑';
    saveState();
    applyUserName(); applyUserAvatar();
    renderSettingsView();
    closeProfileSheet();
    showToast('已保存');
}
function initProfileSheet() {
    const wrap = document.getElementById('profileSheetWrap');
    if (!wrap) return;
    if (!wrap.dataset.bound) bindProfileSheetEvents();
}
// ===== 设置页：二级/三级页面注册表 =====
const SETTINGS_PAGES = {
    'displaySettings': ['显示设置', 'layout', renderDisplaySettingsPage],
    'assistantSettings': ['助手设置', 'bot', renderAssistantSettingsPage],
    'chatModel': ['聊天模型', 'cpu', renderChatModelPage],
    'functionModel': ['功能模型', 'layers', renderFunctionModelPage],
    'mcpService': ['MCP服务', 'blocks', renderMcpServicePage],
    'contextSummary': ['上下文总结', 'file-text', renderContextSummaryPage],
    'dataBackup': ['数据备份与恢复', 'database', renderDataBackupPage],
    'appearance': ['外观设置', 'palette', renderAppearancePage],
    'fontSettings': ['字体设置', 'type', renderFontSettingsPage],
    'opacitySettings': ['透明度设置', 'droplets', renderOpacitySettingsPage],
    'messageDisplay': ['消息显示', 'message-square', renderMessageDisplayPage],
    'codeInteraction': ['代码与交互', 'code-2', renderCodeInteractionPage],
    'assistantBasic': ['基础设置', 'user-cog', renderAssistantBasicPage],
    'memorySettings': ['记忆', 'brain', renderMemorySettingsPage],
    'regexSettings': ['正则表达式', 'braces', renderRegexSettingsPage],
    'localTools': ['本地工具', 'wrench', () => renderSettingsPlaceholder('wrench', '本地工具')]
};

// ===== 显示设置 =====
function renderDisplaySettingsPage() {
    return settingsGroup('', [
        settingsEntry('palette', '外观设置', '壁纸、插图、背景', settingsChevron(), "settingsGo('appearance')"),
        settingsEntry('type', '字体设置', '聊天字体、大小', settingsChevron(), "settingsGo('fontSettings')"),
        settingsEntry('droplets', '透明度设置', '气泡、思维链、侧边栏', settingsChevron(), "settingsGo('opacitySettings')"),
        settingsEntry('message-square', '消息显示', '思维链、数学公式', settingsChevron(), "settingsGo('messageDisplay')"),
        settingsEntry('code-2', '代码与交互', '代码块、Enter发送、自动滚动', settingsChevron(), "settingsGo('codeInteraction')")
    ]);
}

// 外观设置
function renderAppearancePage() {
    const pages = state.settings.generalBgPages || ['living', 'study', 'bedroom', 'garden', 'kitchen'];
    const allPages = [
        ['living', '客厅'], ['study', '书房'], ['bedroom', '卧室'],
        ['garden', '花园'], ['kitchen', '厨房']
    ];
    const allChecked = allPages.every(([v]) => pages.indexOf(v) >= 0);
    const bgCollapsed = state.settings.bgPagesCollapsed !== false;

    const pagesGrid = allPages.map(([v, name]) =>
        '<label class="appearance-page-chip"><input type="checkbox" class="general-bg-page-check" value="' + v + '"' + (pages.indexOf(v) >= 0 ? ' checked' : '') + '><span>' + name + '</span><span class="appearance-page-chip-check">✓</span></label>'
    ).join('');

    const pagesSection = '<div class="appearance-collapse-card' + (bgCollapsed ? ' collapsed' : '') + '" id="bgPagesCard">' +
        '<div class="appearance-collapse-head" onclick="toggleBgPagesCard()">' +
            '<span style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--primary-dark);">✨ 应用此背景的页面</span>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--primary-dark);cursor:pointer;" onclick="event.stopPropagation()"><span>全选</span><input type="checkbox" class="general-bg-select-all"' + (allChecked ? ' checked' : '') + ' style="accent-color:var(--primary);"></label>' +
                '<i data-lucide="chevron-down" class="appearance-collapse-chevron"></i>' +
            '</div>' +
        '</div>' +
        '<div class="appearance-collapse-body"><div class="appearance-pages-grid">' + pagesGrid + '</div></div>' +
    '</div>';

    return settingsGroup('🎨 主题色', [
        '<div class="theme-swatch-grid" style="border-bottom:none;">' + renderThemeSwatches() + '</div>'
    ]) +
    settingsGroup('🖼️ 壁纸与插图', [
        appearanceImageRow('wallpaper', '聊天壁纸插图', '背景图片仅在聊天页面显示'),
        appearanceImageRow('sidebarImage', '侧边栏插图', '侧边栏背景装饰图'),
        appearanceImageRow('inputImage', '输入栏插图', '输入区域背景图案'),
        appearanceImageRow('generalBg', '通用背景插图', '应用整体背景图片'),
        '<div class="settings-row settings-row-stack" style="border-bottom:none;padding-top:4px;">' + pagesSection + '</div>'
    ]);
}

function appearanceImageRow(key, title, desc) {
    const value = state.settings[key];
    return '<div class="settings-row" style="gap:12px;">' +
        '<div class="settings-entry-info" style="flex:1;"><div class="settings-entry-title">' + title + '</div><div class="settings-entry-sub">' + desc + '</div></div>' +
        '<div class="wp-row-actions">' +
            (value ? '<button class="wp-btn wp-btn-clear" onclick="clearImageSetting(\'' + key + '\')">清除</button>' : '') +
            '<label class="wp-btn wp-btn-pick" for="' + key + 'Input" style="display:flex;align-items:center;gap:4px;">选择图片 <i data-lucide="chevron-right" style="width:14px;height:14px;"></i></label>' +
        '</div>' +
        '<input type="file" id="' + key + 'Input" class="wp-hidden-input" accept="image/*" data-wp-key="' + key + '">' +
    '</div>';
}

function toggleBgPagesCard() {
    state.settings.bgPagesCollapsed = !state.settings.bgPagesCollapsed;
    saveState();
    const card = document.getElementById('bgPagesCard');
    if (card) card.classList.toggle('collapsed');
}
function generalBgPagesRow() {
    const cur = state.settings.generalBgPages || ['living', 'study', 'bedroom', 'garden', 'kitchen'];
    const opts = [['living', '客厅'], ['study', '书房'], ['bedroom', '卧室'], ['garden', '花园'], ['kitchen', '厨房']];
    return settingsGroup('使用此背景的页面', [
        '<div class="settings-row settings-row-stack" style="border-bottom:none;"><div class="general-bg-checks">' +
        opts.map(([v, l]) => '<label class="general-bg-check"><input type="checkbox" class="general-bg-page-check" value="' + v + '"' + (cur.indexOf(v) >= 0 ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
        '</div></div>'
    ]);
}
function imageSettingRow(key, label) {
    const value = state.settings[key];
    const meta = state.settings[key + 'Name'] || (value ? '已设置（本地图片）' : '未设置');
    return '<div class="image-setting">' +
        '<div class="settings-row">' +
            '<div class="settings-entry-info"><div class="settings-entry-title">' + label + '</div><div class="settings-entry-sub">' + escapeHtml(meta) + '</div></div>' +
            '<div class="wp-row-actions">' +
                (value ? '<button class="wp-btn wp-btn-clear" onclick="clearImageSetting(\'' + key + '\')">清除</button>' : '') +
                '<label class="wp-btn wp-btn-pick" for="' + key + 'Input">选择图片</label>' +
            '</div>' +
        '</div>' +
        '<input type="file" id="' + key + 'Input" class="wp-hidden-input" accept="image/*" data-wp-key="' + key + '">' +
        (value ? rangeRow(key + 'Opacity', '透明度', 0, 100, 1, { def: 100 }) : '') +
    '</div>';
}
function clearImageSetting(key) {
    state.settings[key] = '';
    state.settings[key + 'Name'] = '';
    state.settings[key + 'Opacity'] = undefined;
    saveState();
    if (key === 'wallpaper') applyWallpaper();
    else if (key === 'homeWallpaper') applyHomeBg();
    else if (key === 'generalBg') applyGeneralBg();
    else applyCustomImages();
    renderSettingsView();
}

// 字体设置
function renderFontSettingsPage() {
    const cur = state.settings.chatFont || 'default';
    const opts = [['default', '默认'], ['serif', '衬线体'], ['mono', '等宽']];
    if (state.settings.customFontDataUrl) opts.push(['custom', '自定义']);
    const segs = opts.map(([v, l]) => '<button class="segmented-btn' + (cur === v ? ' active' : '') + '" data-chat-font="' + v + '">' + l + '</button>').join('');
    return settingsGroup('聊天字体', [
        '<div class="settings-row settings-row-stack"><div class="settings-entry-title">字体</div><div class="segmented-control">' + segs + '</div></div>'
    ]) +
    settingsGroup('字号', [
        rangeRow('chatFontScale', '聊天字体大小', 50, 150, 5, { def: 100 }),
        '<div class="settings-row" style="flex-direction:column;align-items:stretch;border-bottom:none;"><div class="font-preview">凌晨四点钟，看到海棠花未眠。</div></div>',
        rangeRow('thinkingFontScale', '思维链字体大小', 50, 150, 5, { def: 100 })
    ]) +
    settingsGroup('自定义字体', [
        '<div class="settings-row"><div class="settings-entry-info"><div class="settings-entry-title">导入自定义字体</div><div class="settings-entry-sub">支持 .ttf / .otf</div></div>' + (state.settings.customFontName ? '<span class="settings-range-value">' + escapeHtml(state.settings.customFontName) + '</span>' : '') + '<label class="wp-btn wp-btn-pick" for="customFontInput">选择文件</label></div>' +
        '<input type="file" id="customFontInput" accept=".ttf,.otf,font/ttf,font/otf" hidden>'
    ]);
}

// 透明度设置
function renderOpacitySettingsPage() {
    return settingsGroup('透明度', [
        rangeRow('bubbleOpacity', '聊天气泡透明度', 0, 100, 1, { def: 100 }),
        rangeRow('thinkingOpacity', '思维链透明度', 0, 100, 1, { def: 100 }),
        rangeRow('sidebarOpacity', '侧边栏元素透明度', 0, 100, 1, { def: 100 })
    ]);
}

// 消息显示
function renderMessageDisplayPage() {
    return settingsGroup('消息显示', [
        settingsSwitch('showThinking', '显示思考内容', '在消息中显示 AI 的思考过程', state.settings.showThinking !== false),
        settingsSwitch('autoCollapseThinking', '自动折叠思考', '思考完成后自动折叠', !!state.settings.autoCollapseThinking),
        settingsSwitch('renderMath', '渲染数学表达式', '渲染 $...$ 与 $...$ 公式', !!state.settings.renderMath),
        settingsSwitch('glassMode', '玻璃拟态', '气泡、输入栏、顶栏半透明', !!state.settings.glassMode)
    ]);
}

// 代码与交互
function renderCodeInteractionPage() {
    return settingsGroup('代码块', [
        settingsSwitch('codeWrap', '代码块自动换行', '自动换行代码块中的长行', !!state.settings.codeWrap),
        settingsSwitch('codeAutoFold', '代码块自动折叠', '默认自动折叠代码块', !!state.settings.codeAutoFold),
        settingsSwitch('codeLineNumbers', '显示行号', '在代码块中显示行号', !!state.settings.codeLineNumbers)
    ]) + settingsGroup('交互', [
        settingsSwitch('enterToSend', '按Enter发送', '按Enter发送消息而非换行', state.settings.enterToSend !== false),
        settingsSwitch('autoScrollChat', '自动滚动', 'AI生成内容时自动滚动到底部', state.settings.autoScrollChat !== false),
        settingsSwitch('inputBlur', '启用模糊效果', '在聊天输入栏启用模糊效果', !!state.settings.inputBlur),
        settingsSwitch('pasteLongAsFile', '粘贴长文本为文件', '粘贴的文本超过阈值时自动保存为文件附件', !!state.settings.pasteLongAsFile)
    ]);
}

// ===== 助手设置 =====
function renderAssistantSettingsPage() {
    const name = state.settings.aiName || '晏晏';
    const sp = state.settings.systemPrompt || '';
    const charCount = sp.length;

    return '<div class="settings-list-card" style="margin-bottom:14px;">' +
        '<div class="settings-row settings-row-stack" style="border-bottom:none;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><i data-lucide="user" class="settings-row-icon"></i><span class="settings-entry-title">助手名称</span></div>' +
            '<div class="settings-entry-sub" style="margin-bottom:8px;">给你的助手起个名字吧</div>' +
            '<input type="text" class="settings-text-input" data-key="aiName" placeholder="输入名称" value="' + escapeHtml(name) + '" maxlength="30">' +
        '</div>' +
    '</div>' +
    '<div class="settings-list-card" style="margin-bottom:14px;">' +
        '<div class="settings-row settings-row-stack" style="border-bottom:none;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><i data-lucide="message-square" class="settings-row-icon"></i><span class="settings-entry-title">系统提示词</span></div>' +
            '<div class="settings-entry-sub" style="margin-bottom:8px;">设定助手的行为、风格和规则</div>' +
            '<textarea id="settingsSystemPrompt" class="system-prompt-textarea" rows="6" placeholder="设定AI的人设...">' + escapeHtml(sp) + '</textarea>' +
            '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:6px;font-size:11px;color:var(--text-light);"><span>' + charCount + '/2000</span><button class="btn-icon" style="padding:2px;" onclick="openFullscreenPrompt()"><i data-lucide="maximize-2" style="width:13px;height:13px;"></i></button></div>' +
        '</div>' +
    '</div>' +
    settingsGroup('', [
        settingsEntry('sliders-horizontal', '基础设置', '温度、上下文、流式输出、Token', settingsChevron(), "settingsGo('assistantBasic')"),
        settingsEntry('brain', '记忆', '管理助手的长期记忆与知识库', settingsChevron(), "settingsGo('memorySettings')"),
        settingsEntry('braces', '正则表达式', '批量匹配与替换，支持导入导出', settingsChevron(), "settingsGo('regexSettings')"),
        settingsEntry('wrench', '本地工具', '配置与调用本地工具与插件', settingsChevron(), "settingsGo('localTools')")
    ]);
}
function renderAssistantBasicPage() {
    const temp = state.settings.temperature || 0.7;
    const ctx = state.settings.contextCount || 50;
    const mt = state.settings.maxTokens || '';
    const streaming = state.settings.streaming !== false;

    return '<div class="settings-list-card" style="margin-bottom:14px;">' +
        '<div class="settings-row settings-row-stack" style="border-bottom:none;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><i data-lucide="thermometer" class="settings-row-icon"></i><span class="settings-entry-title">模型温度</span></div>' +
            '<div class="settings-entry-sub" style="margin-bottom:10px;">控制回复的随机性和创造性</div>' +
            '<div class="settings-range-head"><span style="font-size:12px;color:var(--text-light);">更保守</span><span class="settings-range-value" id="rangeVal-temperature">' + temp.toFixed(2) + '</span><span style="font-size:12px;color:var(--text-light);">更有创造性</span></div>' +
            '<input type="range" class="settings-range" data-key="temperature" data-scale="100" min="0" max="200" step="5" value="' + Math.round(temp * 100) + '">' +
        '</div>' +
    '</div>' +
    '<div class="settings-list-card" style="margin-bottom:14px;">' +
        '<div class="settings-row settings-row-stack" style="border-bottom:none;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><i data-lucide="layers" class="settings-row-icon"></i><span class="settings-entry-title">上下文消息数量</span></div>' +
            '<div class="settings-entry-sub" style="margin-bottom:10px;">控制模型接收的历史消息数量</div>' +
            '<div class="settings-range-head"><span style="font-size:12px;color:var(--text-light);">1</span><span class="settings-range-value" id="rangeVal-contextCount">' + (ctx >= 50 ? '无限制' : ctx) + '</span><span style="font-size:12px;color:var(--text-light);">无限制</span></div>' +
            '<input type="range" class="settings-range" data-key="contextCount" data-scale="1" min="1" max="50" step="1" value="' + ctx + '">' +
        '</div>' +
    '</div>' +
    '<div class="settings-list-card" style="margin-bottom:14px;">' +
        '<div class="settings-row" style="border-bottom:none;">' +
            '<div class="settings-entry-info"><div style="display:flex;align-items:center;gap:8px;"><i data-lucide="zap" class="settings-row-icon"></i><span class="settings-entry-title">流式输出</span></div><div class="settings-entry-sub">开启后，模型回复将以流式方式实时显示</div></div>' +
            '<label class="switch"><input type="checkbox" class="msg-display-toggle" data-key="streaming"' + (streaming ? ' checked' : '') + '><span class="switch-slider"></span></label>' +
        '</div>' +
    '</div>' +
    '<div class="settings-list-card" style="margin-bottom:14px;">' +
        '<div class="settings-row settings-row-stack" style="border-bottom:none;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><i data-lucide="gauge" class="settings-row-icon"></i><span class="settings-entry-title">最大 Token 数</span></div>' +
            '<div class="settings-entry-sub" style="margin-bottom:8px;">限制模型回复的最大 Token 数量，留空为无限制</div>' +
            '<input type="number" class="settings-number-input" data-key="maxTokens" placeholder="无限制" value="' + (mt || '') + '">' +
        '</div>' +
    '</div>' +
    settingsGroup('', [
        settingsSwitch('splitLines', '按行拆分气泡', '将助手的回复按换行拆分成多个独立气泡发送', !!state.settings.splitLines)
    ]);
}

// ===== 记忆设置 =====
function renderMemorySettingsPage() {
    const memEnabled = state.settings.memoryEnabled !== false;
    const memMode = state.settings.memoryMode || 'auto';
    const supabaseOk = typeof isSupabaseConfigured === 'function' && isSupabaseConfigured();
    const memCount = state.memorySystem ? state.memorySystem.memories.length : 0;

    const modeOpts = [['auto', '自动'], ['manual', '仅手动']].map(([v, l]) =>
        '<option value="' + v + '"' + (memMode === v ? ' selected' : '') + '>' + l + '</option>'
    ).join('');

    return settingsGroup('基础', [
        '<div class="settings-row"><div class="settings-entry-info"><div class="settings-entry-title">启用AI记忆</div></div><label class="switch"><input type="checkbox" class="msg-display-toggle" data-key="memoryEnabled"' + (memEnabled ? ' checked' : '') + '><span class="switch-slider"></span></label></div>',
        '<div class="settings-row"><span class="settings-row-label">记忆模式</span><select class="settings-inline-select" id="memoryModeSelect">' + modeOpts + '</select></div>'
    ]) +
    settingsGroup('记忆后端', [
        '<div class="settings-row"><span class="settings-row-label">存储位置</span><span class="settings-row-value">' + (supabaseOk ? '云端（Supabase）' : '本地') + '</span></div>',
        '<div class="settings-row"><span class="settings-row-label">连接状态</span><span class="settings-row-value">' + (supabaseOk ? '<span style="color:#27ae60;">● 已连接</span>' : '<span style="color:var(--text-light);">● 未配置</span>') + '</span></div>',
        '<div class="settings-row"><span class="settings-row-label">记忆条数</span><span class="settings-row-value">' + memCount + '</span></div>'
    ]) +
    settingsGroup('外部服务', [
        '<div class="settings-row settings-row-click" onclick="settingsComingSoon()"><span class="settings-row-label">Ombre Brain</span><span class="settings-row-value">未连接 <i data-lucide="chevron-right"></i></span></div>',
        '<div class="settings-row settings-row-click" onclick="settingsComingSoon()"><span class="settings-row-label">自定义API</span><span class="settings-row-value">未配置 <i data-lucide="chevron-right"></i></span></div>'
    ]);
}

// ===== 正则表达式 =====
let regexTab = 'rules'; // 'rules' | 'stickers'

function renderRegexSettingsPage() {
    const rules = state.settings.regexRules || [];
    const stickerRules = rules.filter(r => r.find && r.find.indexOf('sticker:') >= 0);
    const otherRules = rules.filter(r => !r.find || r.find.indexOf('sticker:') < 0);

    const tabs = '<div class="regex-tabs">' +
        '<button class="regex-tab' + (regexTab === 'rules' ? ' active' : '') + '" onclick="switchRegexTab(\'rules\')">规则</button>' +
        '<button class="regex-tab' + (regexTab === 'stickers' ? ' active' : '') + '" onclick="switchRegexTab(\'stickers\')">表情包</button>' +
    '</div>';

    if (regexTab === 'stickers') {
        return tabs + renderStickerTab(stickerRules);
    }
    return tabs + renderRulesTab(otherRules);
}

function switchRegexTab(tab) {
    regexTab = tab;
    renderSettingsView();
}

function renderRulesTab(rules) {
    let listHtml = '';
    if (!rules.length) {
        listHtml = '<div class="bedroom-empty" style="padding:20px 10px;">还没有正则规则</div>';
    } else {
        listHtml = rules.map(r => renderRuleCard(r)).join('');
    }

    return '<div class="regex-rule-list">' + listHtml + '</div>' +
        '<button class="btn-secondary" style="width:100%;justify-content:center;margin-top:12px;" onclick="addNewRule()"><i data-lucide="plus" style="width:14px;height:14px;margin-right:6px;"></i>添加规则</button>' +
        settingsGroup('批量操作', [
            '<div class="settings-row settings-row-click" onclick="document.getElementById(\'regexFileInputDetail\').click()"><span class="settings-row-label"><i data-lucide="upload" class="settings-row-icon"></i>从文件导入</span><i data-lucide="chevron-right"></i></div>',
            '<div class="settings-row settings-row-click" onclick="exportRegexRules()"><span class="settings-row-label"><i data-lucide="download" class="settings-row-icon"></i>导出规则</span><i data-lucide="chevron-right"></i></div>',
            '<div class="settings-row settings-row-click" onclick="clearAllRegex()"><span class="settings-row-label" style="color:#e74c3c;"><i data-lucide="trash-2" class="settings-row-icon" style="color:#e74c3c;"></i>清空所有规则</span></div>'
        ]) +
        '<input type="file" id="regexFileInputDetail" accept=".txt,.json" hidden>';
}

function renderStickerTab(stickerRules) {
    let listHtml = '';
    if (!stickerRules.length) {
        listHtml = '<div class="bedroom-empty" style="padding:20px 10px;">还没有表情包规则<br>点击下方扫描 Supabase 自动添加</div>';
    } else {
        listHtml = stickerRules.map(r => renderStickerCard(r)).join('');
    }

    return '<div class="regex-rule-list">' + listHtml + '</div>' +
        '<div class="settings-list-card" style="margin-top:14px;">' +
            '<div class="settings-row settings-row-click" onclick="scanSupabaseStickers()"><span class="settings-row-label"><i data-lucide="search" class="settings-row-icon"></i>扫描 Supabase Bucket</span><i data-lucide="chevron-right"></i></div>' +
            '<div class="settings-row settings-row-click" onclick="openStickerBatchInput()"><span class="settings-row-label"><i data-lucide="list" class="settings-row-icon"></i>批量输入</span><i data-lucide="chevron-right"></i></div>' +
            '<div class="settings-row settings-row-click" onclick="clearAllStickers()"><span class="settings-row-label" style="color:#e74c3c;"><i data-lucide="trash-2" class="settings-row-icon" style="color:#e74c3c;"></i>清空所有表情包</span></div>' +
        '</div>';
}

function renderRuleCard(r) {
    return '<div class="regex-card">' +
        '<div class="regex-card-head" onclick="toggleRegexCard(\'' + r.id + '\')">' +
            '<span class="regex-card-name">' + escapeHtml(r.name) + '</span>' +
            '<div class="regex-card-right">' +
                '<label class="switch" onclick="event.stopPropagation()"><input type="checkbox"' + (r.enabled ? ' checked' : '') + ' onchange="toggleRegexEnabled(\'' + r.id + '\',this.checked)"><span class="switch-slider"></span></label>' +
                '<i data-lucide="chevron-down" class="regex-card-chevron"></i>' +
            '</div>' +
        '</div>' +
        '<div class="regex-card-body" id="regexBody_' + r.id + '" style="display:none;">' +
            '<div class="form-group"><label>名称</label><input type="text" value="' + escapeHtml(r.name) + '" onchange="updateRegexField(\'' + r.id + '\',\'name\',this.value)"></div>' +
            '<div class="form-group"><label>查找正则表达式</label><input type="text" value="' + escapeHtml(r.find) + '" onchange="updateRegexField(\'' + r.id + '\',\'find\',this.value)"></div>' +
            '<div class="form-group"><label>替换字符串</label><textarea rows="2" onchange="updateRegexField(\'' + r.id + '\',\'replace\',this.value)">' + escapeHtml(r.replace) + '</textarea></div>' +
            '<div class="form-group"><label>影响范围</label><div class="segmented-control"><button class="segmented-btn' + (r.scope === 'assistant' ? ' active' : '') + '" onclick="updateRegexField(\'' + r.id + '\',\'scope\',\'assistant\');renderSettingsView()">Assistant</button><button class="segmented-btn' + (r.scope === 'user' ? ' active' : '') + '" onclick="updateRegexField(\'' + r.id + '\',\'scope\',\'user\');renderSettingsView()">User</button><button class="segmented-btn' + (r.scope === 'both' ? ' active' : '') + '" onclick="updateRegexField(\'' + r.id + '\',\'scope\',\'both\');renderSettingsView()">Both</button></div></div>' +
            '<div class="settings-row" style="padding:8px 0;border-bottom:none;"><span class="settings-row-label">仅视觉（不影响实际消息）</span><label class="switch"><input type="checkbox"' + (r.visualOnly ? ' checked' : '') + ' onchange="updateRegexField(\'' + r.id + '\',\'visualOnly\',this.checked)"><span class="switch-slider"></span></label></div>' +
            '<button class="btn-danger" style="width:100%;justify-content:center;margin-top:8px;" onclick="deleteRegexRule(\'' + r.id + '\')"><i data-lucide="trash-2" style="width:13px;height:13px;margin-right:6px;"></i>删除</button>' +
        '</div>' +
    '</div>';
}

function renderStickerCard(r) {
    // 从 replace 里提取图片 URL 来预览
    const urlMatch = (r.replace || '').match(/\((https?:\/\/[^)]+)\)/) || (r.replace || '').match(/src="(https?:\/\/[^"]+)"/);
    const imgUrl = urlMatch ? urlMatch[1] : '';
    const displayName = r.name.replace(/^表情包-/, '');

    return '<div class="regex-card sticker-card">' +
        '<div class="regex-card-head" onclick="toggleRegexCard(\'' + r.id + '\')">' +
            (imgUrl ? '<img class="sticker-preview-img" src="' + imgUrl + '">' : '<span class="sticker-preview-placeholder">🖼️</span>') +
            '<span class="regex-card-name">' + escapeHtml(displayName) + '</span>' +
            '<div class="regex-card-right">' +
                '<label class="switch" onclick="event.stopPropagation()"><input type="checkbox"' + (r.enabled ? ' checked' : '') + ' onchange="toggleRegexEnabled(\'' + r.id + '\',this.checked)"><span class="switch-slider"></span></label>' +
                '<i data-lucide="chevron-down" class="regex-card-chevron"></i>' +
            '</div>' +
        '</div>' +
        '<div class="regex-card-body" id="regexBody_' + r.id + '" style="display:none;">' +
            '<div class="form-group"><label>表情包名称（修改后影响 [sticker:名称]）</label><input type="text" value="' + escapeHtml(displayName) + '" onchange="renameStickerRule(\'' + r.id + '\',this.value)"></div>' +
            '<div class="form-group"><label>图片 URL</label><input type="text" value="' + escapeHtml(imgUrl) + '" readonly style="opacity:0.7;"></div>' +
            '<button class="btn-danger" style="width:100%;justify-content:center;margin-top:8px;" onclick="deleteRegexRule(\'' + r.id + '\')"><i data-lucide="trash-2" style="width:13px;height:13px;margin-right:6px;"></i>删除</button>' +
        '</div>' +
    '</div>';
}

function exportRegexRules() {
    const rules = state.settings.regexRules || [];
    if (!rules.length) { showToast('没有规则可导出'); return; }
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regex-rules.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已导出 ' + rules.length + ' 条规则');
}

function clearAllRegex() {
    if (!state.settings.regexRules || !state.settings.regexRules.length) return;
    if (!confirm('确定清空所有正则规则？')) return;
    state.settings.regexRules = [];
    saveState();
    renderSettingsView();
    showToast('已清空');
}
function toggleRegexCard(id) {
    const body = document.getElementById('regexBody_' + id);
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

function toggleRegexEnabled(id, checked) {
    const r = (state.settings.regexRules || []).find(x => x.id === id);
    if (r) { r.enabled = checked; saveState(); }
}

function updateRegexField(id, field, value) {
    const r = (state.settings.regexRules || []).find(x => x.id === id);
    if (r) { r[field] = value; saveState(); }
}

function deleteRegexRule(id) {
    if (!confirm('删除这条规则？')) return;
    state.settings.regexRules = (state.settings.regexRules || []).filter(x => x.id !== id);
    saveState();
    renderSettingsView();
}

function addNewRule() {
    if (!state.settings.regexRules) state.settings.regexRules = [];
    state.settings.regexRules.push({
        id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: '新规则',
        find: '',
        replace: '',
        scope: 'assistant',
        visualOnly: true,
        enabled: true
    });
    saveState();
    renderSettingsView();
}

function renameStickerRule(id, newName) {
    const r = (state.settings.regexRules || []).find(x => x.id === id);
    if (!r) return;
    r.name = '表情包-' + newName;
    r.find = '\\[sticker:' + newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]';
    saveState();
}

function clearAllStickers() {
    if (!confirm('清空所有表情包规则？')) return;
    state.settings.regexRules = (state.settings.regexRules || []).filter(r => !r.find || r.find.indexOf('sticker:') < 0);
    saveState();
    renderSettingsView();
    showToast('已清空');
}

// Supabase bucket 扫描
async function scanSupabaseStickers() {
    if (!isSupabaseConfigured()) { alert('请先配置 Supabase'); return; }
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = getSupabaseHeaders();

    showToast('正在扫描...');
    try {
        const res = await fetch(base + '/storage/v1/object/list/stickers', {
            method: 'POST', headers: h,
            body: JSON.stringify({ prefix: '', limit: 200, offset: 0, sortBy: { column: 'name', order: 'asc' } })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const files = await res.json();

        if (!files || !files.length) { showToast('bucket 里没有文件'); return; }

        let added = 0;
        const existing = new Set((state.settings.regexRules || []).map(r => r.find));

        files.forEach(f => {
            if (!f.name || f.name.startsWith('.')) return;
            const fileName = f.name; // e.g. "clawd-bixin.gif"
            const nameNoExt = fileName.replace(/\.[^.]+$/, ''); // "clawd-bixin"
            const stickerName = nameNoExt; // 直接用文件名当表情包名
            const findPattern = '\\[sticker:' + stickerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]';

            if (existing.has(findPattern)) return; // 已存在，跳过

            const imgUrl = base + '/storage/v1/object/public/stickers/' + encodeURIComponent(fileName);
            state.settings.regexRules.push({
                id: 'stk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                name: '表情包-' + stickerName,
                find: findPattern,
                replace: '<img src="' + imgUrl + '" alt="' + stickerName + '" class="sticker-msg-img">',
                scope: 'assistant',
                visualOnly: true,
                enabled: true
            });
            added++;
        });

        saveState();
        renderSettingsView();
        showToast('扫描完成，新增 ' + added + ' 个表情包');
    } catch (e) {
        alert('扫描失败：' + e.message);
    }
}

function openStickerBatchInput() {
    const text = prompt('批量输入表情包（每行格式：名称:URL）\n例如：\nclawd-bixin:https://xxx/clawd-bixin.gif\nclawd-hehe:https://xxx/clawd-hehe.gif');
    if (!text) return;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0;
    lines.forEach(line => {
        const sep = line.indexOf(':http');
        if (sep < 0) return;
        const name = line.slice(0, sep).trim();
        const url = line.slice(sep + 1).trim();
        if (!name || !url) return;
        const findPattern = '\\[sticker:' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]';
        state.settings.regexRules.push({
            id: 'stk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            name: '表情包-' + name,
            find: findPattern,
            replace: '<img src="' + url + '" alt="' + name + '" class="sticker-msg-img">',
            scope: 'assistant',
            visualOnly: true,
            enabled: true
        });
        added++;
    });
    saveState();
    renderSettingsView();
    showToast('添加了 ' + added + ' 个表情包');
}

function handleRegexImportDetail(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        const txt = ev.target.result; let rawRules = [];
        try { rawRules = JSON.parse(txt); if (!Array.isArray(rawRules)) rawRules = [rawRules]; } catch (_) { rawRules = txt.split('\n').map(l => l.trim()).filter(l => l); }
        if (!state.settings.regexRules) state.settings.regexRules = [];
        rawRules.forEach(item => {
            if (typeof item === 'string') {
                state.settings.regexRules.push({
                    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                    name: '导入规则',
                    find: item,
                    replace: '',
                    scope: 'assistant',
                    visualOnly: true,
                    enabled: true
                });
            } else if (typeof item === 'object' && item.find) {
                state.settings.regexRules.push({
                    id: item.id || 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                    name: item.name || '导入规则',
                    find: item.find,
                    replace: item.replace || '',
                    scope: item.scope || 'assistant',
                    visualOnly: item.visualOnly !== false,
                    enabled: item.enabled !== false
                });
            }
        });
        saveState(); renderSettingsView();
        showToast('导入了 ' + rawRules.length + ' 条规则');
    };
    r.readAsText(f);
    e.target.value = '';
}

function applyRegexRules(html, role) {
    const rules = state.settings.regexRules || [];
    rules.forEach(r => {
        if (!r.enabled || !r.find || !r.replace) return;
        if (r.scope === 'assistant' && role !== 'assistant') return;
        if (r.scope === 'user' && role !== 'user') return;
        try {
            const regex = new RegExp(r.find, 'g');
            html = html.replace(regex, r.replace);
        } catch (e) { /* 无效正则，跳过 */ }
    });
    return html;
}

// ===== 聊天模型 =====
function renderChatModelPage() {
    const provider = getActiveProvider();
    const providerBase = provider ? provider.apiBase : '';
    const providerKey = provider ? provider.apiKey : '';
    const currentModel = state.settings.model || '';

    // 供应商预设列表
    let presetsHtml = state.providers.map(p => {
        const isActive = p.id === state.activeProviderId;
        return '<div class="provider-preset-card' + (isActive ? ' active' : '') + '" onclick="switchProviderPreset(\'' + p.id + '\')">' +
            '<div class="provider-preset-head">' +
                '<span class="provider-preset-name">' + escapeHtml(p.name) + '</span>' +
                (isActive ? '<span class="provider-preset-badge">当前</span>' : '') +
                '<button class="provider-preset-del" onclick="event.stopPropagation();deleteProvider(\'' + p.id + '\')" title="删除"><i data-lucide="x"></i></button>' +
            '</div>' +
            '<div class="provider-preset-meta">' + escapeHtml((p.apiBase || '').replace(/^https?:\/\//, '').slice(0, 40)) + '</div>' +
        '</div>';
    }).join('');

    return '<div class="settings-group-title">模型提供商</div>' +
    '<div class="provider-preset-list" style="margin-bottom:14px;">' +
        presetsHtml +
        '<div class="provider-preset-card provider-preset-add" style="opacity:0.5;pointer-events:none;">' +
            '<span style="display:flex;align-items:center;gap:6px;color:var(--text-light);font-size:13px;">等待开发</span>' +
        '</div>' +
    '</div>' +

    '<div class="settings-group-title">连接配置</div>' +
    '<div class="settings-list-card" style="margin-bottom:14px;">' +
        '<div class="settings-row settings-row-stack">' +
            '<div class="settings-entry-title">API 端点</div>' +
            '<input type="text" id="providerBaseEdit" class="settings-text-input" data-key="_providerBase" placeholder="https://api.example.com/v1" value="' + escapeHtml(providerBase) + '">' +
        '</div>' +
        '<div class="settings-row settings-row-stack">' +
            '<div class="settings-entry-title">API 密钥</div>' +
            '<input type="password" id="providerKeyEdit" class="settings-text-input" placeholder="sk-..." value="' + escapeHtml(providerKey) + '">' +
        '</div>' +
        '<div class="settings-row" style="border-bottom:none;">' +
            '<div class="settings-entry-info"><div class="settings-entry-title">测试连接</div><div class="settings-entry-sub">验证API密钥和URL是否可用</div></div>' +
            '<button class="btn-secondary" style="gap:6px;" onclick="testChatModelConnection()"><i data-lucide="send" style="width:13px;height:13px;"></i>测试</button>' +
        '</div>' +
        '<span class="connection-status" id="chatModelStatus" style="padding:0 16px 10px;font-size:12px;display:block;"></span>' +
    '</div>' +

    '<div class="settings-group-title">选择模型</div>' +
    '<div class="settings-list-card">' +
        '<div class="settings-row settings-row-stack" style="border-bottom:none;">' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
                '<input type="text" id="chatModelInput" class="settings-text-input" style="flex:1;" placeholder="🔍 搜索模型名称" value="' + escapeHtml(currentModel) + '">' +
            '</div>' +
            '<div class="model-list" id="modelList" style="display:none;margin-top:8px;"></div>' +
        '</div>' +
    '</div>' +
    '<div class="settings-group-title">模型预设</div>' +
    '<div class="settings-list-card">' +
        state.providers.map(function(p) {
            return '<div class="settings-row settings-row-stack" style="gap:10px;">' +
                '<div class="settings-entry-title">' + escapeHtml(p.name) + '</div>' +
                '<div class="settings-row" style="padding:0;border-bottom:none;gap:8px;flex-direction:column;align-items:stretch;">' +
                    '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-light);min-width:50px;">模型</span><span style="font-size:13px;color:var(--text);">' + escapeHtml(state.settings.model || '未配置') + '</span></div>' +
                    '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-light);min-width:50px;">密钥</span><span style="font-size:13px;color:var(--text);">···</span></div>' +
                    '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-light);min-width:50px;">URL</span><input type="text" class="settings-text-input" style="font-size:12px;" value="' + escapeHtml(p.apiBase || '') + '" onchange="updatePresetUrl(\'' + p.id + '\',this.value)"></div>' +
                '</div>' +
            '</div>';
        }).join('') +
    '</div>';
}

function switchProviderPreset(id) {
    state.activeProviderId = id;
    saveState();
    renderSettingsView();
    updateHeader();
}
function updatePresetUrl(id, val) {
    const p = state.providers.find(x => x.id === id);
    if (p) { p.apiBase = val.trim(); saveState(); }
}
function toggleProviderKeyVisibilityId(id) {
    const i = document.getElementById(id); if (!i) return;
    i.type = i.type === 'password' ? 'text' : 'password';
}
function saveChatModelProvider() {
    const p = getActiveProvider(); if (!p) return;
    const b = document.getElementById('providerBaseEdit'); if (b) p.apiBase = b.value.trim();
    const k = document.getElementById('providerKeyEdit'); if (k) p.apiKey = k.value.trim();
    saveState();
}
async function testChatModelConnection() {
    const s = document.getElementById('chatModelStatus');
    const base = document.getElementById('providerBaseEdit').value.trim().replace(/\/$/, '');
    const key = document.getElementById('providerKeyEdit').value.trim();
    if (!base || !key) { if (s) { s.textContent = '请先填写端点与密钥'; s.style.color = '#e74c3c'; } return; }
    if (s) { s.textContent = '测试中...'; s.style.color = '#f39c12'; }
    try { const r = await fetch(base + '/models', { headers: { 'Authorization': 'Bearer ' + key } }); if (s) { s.textContent = r.ok ? '连接成功' : '错误 ' + r.status; s.style.color = r.ok ? '#27ae60' : '#e74c3c'; } } catch (e) { if (s) { s.textContent = '无法连接'; s.style.color = '#e74c3c'; } }
}
function renderModelListFromCache(filter) {
    const ml = document.getElementById('modelList');
    if (!ml) return;
    const models = state.settings.cachedModels || [];
    if (!models.length) { ml.style.display = 'none'; return; }
    const f = (filter || '').toLowerCase();
    const filtered = f ? models.filter(m => m.toLowerCase().includes(f)) : models;
    if (!filtered.length) {
        ml.innerHTML = '<div class="model-list-item" style="color:var(--text-light);">无匹配模型</div>';
    } else {
        ml.innerHTML = filtered.slice(0, 30).map(id =>
            '<div class="model-list-item' + (id === state.settings.model ? ' active' : '') + '" data-model="' + escapeHtml(id) + '">' + escapeHtml(id) + '</div>'
        ).join('');
        ml.querySelectorAll('.model-list-item[data-model]').forEach(el => {
            el.addEventListener('click', () => {
                const inp = document.getElementById('chatModelInput');
                if (inp) inp.value = el.dataset.model;
                state.settings.model = el.dataset.model;
                saveState();
                updateHeader();
                ml.style.display = 'none';
            });
        });
    }
    ml.style.display = 'block';
}
async function fetchChatModels() {
    const provider = getActiveProvider();
    if (!provider || !provider.apiBase || !provider.apiKey) return;
    try {
        const r = await fetch(provider.apiBase + '/models', { headers: { 'Authorization': 'Bearer ' + provider.apiKey } });
        const d = await r.json();
        const models = d.data || [];
        const ids = models.map(m => m.id).sort((a, b) => a.localeCompare(b));
        state.settings.cachedModels = ids;
        saveState();
        const cModel = document.getElementById('chatModelInput');
        renderModelListFromCache(cModel ? cModel.value : '');
    } catch (e) {
        console.warn('获取模型列表失败：', e);
    }
}

// ===== 功能模型 =====
const FUNCTION_MODEL_DEFS = [
    { id: 'chat', icon: 'message-circle', name: '对话功能', desc: '主要对话' },
    { id: 'summary', icon: 'file-text', name: '上下文总结', desc: '压缩上下文生成摘要' },
    { id: 'image', icon: 'image', name: '图像识别', desc: '处理图片内容' },
    { id: 'audio', icon: 'mic', name: '音频识别', desc: '处理音频内容' },
    { id: 'video', icon: 'video', name: '视频识别', desc: '处理视频内容' }
];
function renderFunctionModelPage() {
    const cards = FUNCTION_MODEL_DEFS.map(f => {
        const cfg = (state.settings.functionModels && state.settings.functionModels[f.id]) || {};
        const useDefault = cfg.useDefault !== false;
        const modelName = cfg.model || state.settings.model || '未配置';
        return '<div class="fm-card">' +
            '<div class="settings-row fm-card-head" onclick="toggleFmCard(this)">' +
                '<div class="fm-card-icon"><i data-lucide="' + f.icon + '"></i></div>' +
                '<div class="settings-entry-info"><div class="settings-entry-title">' + f.name + '</div><div class="settings-entry-sub">' + f.desc + '，当前配置：' + (useDefault ? '默认配置' : '自定义') + '，模型：' + escapeHtml(modelName) + '</div></div>' +
                '<button class="btn-small" onclick="event.stopPropagation();testFmModel(\'' + f.id + '\')">测试</button>' +
                '<i data-lucide="chevron-down" class="fm-chevron"></i>' +
            '</div>' +
            '<div class="fm-card-body" style="display:none;">' +
                '<div class="settings-row"><div class="settings-entry-info"><div class="settings-entry-title">使用默认模型</div><div class="settings-entry-sub">默认使用当前聊天模型：' + escapeHtml(state.settings.model || '未配置') + '</div></div><label class="switch"><input type="checkbox" class="fm-default-toggle" data-fm="' + f.id + '"' + (useDefault ? ' checked' : '') + '><span class="switch-slider"></span></label></div>' +
                '<div class="settings-row settings-row-stack" style="border-bottom:none;"><div class="settings-entry-title">模型</div><input type="text" class="fm-model-input" data-fm-model="' + f.id + '" placeholder="输入模型名称" value="' + escapeHtml(cfg.model || '') + '"></div>' +
            '</div>' +
        '</div>';
    }).join('');
    return '<div class="fm-list">' + cards + '</div>';
}
function toggleFmCard(head) {
    const body = head.nextElementSibling;
    const ch = head.querySelector('.fm-chevron');
    if (!body) return;
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    if (ch) ch.style.transform = open ? 'rotate(180deg)' : '';
}
async function testFmModel(id) {
    const cfg = (state.settings.functionModels && state.settings.functionModels[id]) || {};
    const model = cfg.useDefault === false && cfg.model ? cfg.model : state.settings.model;
    const provider = getActiveProvider();
    if (!provider || !provider.apiBase || !provider.apiKey) { showToast('请先配置供应商'); return; }
    showToast('测试中...');
    try { const r = await fetch(provider.apiBase + '/models', { headers: { 'Authorization': 'Bearer ' + provider.apiKey } }); showToast(r.ok ? '模型服务正常' : '错误 ' + r.status); } catch (e) { showToast('无法连接'); }
}

// ===== MCP服务 =====
function renderMcpServicePage() {
    const servers = state.settings.mcpServers || [];

    // 统计
    const total = servers.length;
    const enabled = servers.filter(s => s.enabled).length;
    const connected = servers.filter(s => s.status === 'connected').length;
    const errored = servers.filter(s => s.status === 'error').length;

    const statsHtml = '<div class="mcp-stats">' +
        '<div class="mcp-stat"><div class="mcp-stat-num">' + total + '</div><div class="mcp-stat-label">总服务数</div></div>' +
        '<div class="mcp-stat"><div class="mcp-stat-num">' + connected + '</div><div class="mcp-stat-label">已连接</div></div>' +
        '<div class="mcp-stat"><div class="mcp-stat-num">' + enabled + '</div><div class="mcp-stat-label">已启用</div></div>' +
        '<div class="mcp-stat"><div class="mcp-stat-num" style="' + (errored ? 'color:#e74c3c;' : '') + '">' + errored + '</div><div class="mcp-stat-label">连接失败</div></div>' +
    '</div>';

    const cardsHtml = servers.map(s => renderMcpServerCard(s)).join('');

    return '<div class="settings-list-card" style="margin-bottom:14px;padding:14px;">' + statsHtml + '</div>' +
        '<div class="mcp-server-list">' + (cardsHtml || '<div class="bedroom-empty">还没有 MCP 服务器</div>') + '</div>' +
        '<button class="btn-secondary" style="width:100%;justify-content:center;margin-top:14px;" onclick="openAddMcpServer()"><i data-lucide="plus" style="width:14px;height:14px;margin-right:6px;"></i>添加 MCP 服务器</button>';
}

function renderMcpServerCard(s) {
    const statusCls = s.status === 'connected' ? 'mcp-ok' : 'mcp-err';
    const statusText = s.status === 'connected' ? 'Connected' : (s.status === 'error' ? 'Error' : 'Disconnected');
    const toolCount = s.toolCount || 0;
    const headers = s.headers || {};
    const headerKeys = Object.keys(headers);
    const headersCollapsed = !headerKeys.length;

    let headersHtml = headerKeys.map((k, i) =>
        '<div class="mcp-header-row" data-idx="' + i + '">' +
            '<input type="text" class="mcp-header-key" placeholder="请求头名称" value="' + escapeHtml(k) + '" onchange="updateMcpHeaderKey(\'' + s.id + '\',' + i + ',this.value)">' +
            '<input type="text" class="mcp-header-val" placeholder="请求头值" value="' + escapeHtml(headers[k]) + '" onchange="updateMcpHeaderVal(\'' + s.id + '\',' + i + ',this.value)">' +
            '<button class="mcp-header-del" onclick="deleteMcpHeader(\'' + s.id + '\',' + i + ')"><i data-lucide="trash-2"></i></button>' +
        '</div>'
    ).join('');

    return '<div class="mcp-card">' +
        '<div class="mcp-card-head" onclick="toggleMcpCard(\'' + s.id + '\')">' +
            '<div class="mcp-icon"><i data-lucide="' + (s.status === 'connected' ? 'check-circle' : 'alert-circle') + '"></i></div>' +
            '<div class="settings-entry-info">' +
                '<div class="settings-entry-title">' + escapeHtml(s.name) + '</div>' +
                '<div class="settings-entry-sub"><span class="mcp-status ' + statusCls + '">' + statusText + '</span> · ' + toolCount + ' tools' +
                    (s.errorMsg ? '<br><span class="mcp-error">' + escapeHtml(s.errorMsg).slice(0, 80) + '</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="regex-card-right">' +
                '<label class="switch" onclick="event.stopPropagation()"><input type="checkbox"' + (s.enabled ? ' checked' : '') + ' onchange="toggleMcpServer(\'' + s.id + '\',this.checked)"><span class="switch-slider"></span></label>' +
                '<i data-lucide="chevron-down" class="regex-card-chevron"></i>' +
            '</div>' +
        '</div>' +
        '<div class="mcp-card-body" id="mcpBody_' + s.id + '" style="display:none;">' +
            '<div class="form-group"><label>服务器名称</label><input type="text" value="' + escapeHtml(s.name) + '" onchange="updateMcpField(\'' + s.id + '\',\'name\',this.value)" placeholder="给服务器起个名字"></div>' +
            '<div class="form-group"><label>服务器 URL</label><input type="text" value="' + escapeHtml(s.url || '') + '" onchange="updateMcpField(\'' + s.id + '\',\'url\',this.value)" placeholder="https://..."></div>' +

            '<div class="mcp-headers-section">' +
                '<div class="mcp-headers-toggle" onclick="toggleMcpHeaders(\'' + s.id + '\')">' +
                    '<span>自定义请求头' + (headerKeys.length ? '（' + headerKeys.length + ' 个）' : '') + '</span>' +
                    '<i data-lucide="chevron-down" class="mcp-headers-chevron" id="mcpHeadersChevron_' + s.id + '"></i>' +
                '</div>' +
                '<div class="mcp-headers-body" id="mcpHeadersBody_' + s.id + '" style="' + (headersCollapsed ? 'display:none;' : '') + '">' +
                    '<div class="mcp-headers-list" id="mcpHeadersList_' + s.id + '">' + headersHtml + '</div>' +
                    '<button class="btn-secondary" style="width:100%;justify-content:center;margin-top:8px;" onclick="addMcpHeader(\'' + s.id + '\')"><i data-lucide="plus" style="width:13px;height:13px;margin-right:6px;"></i>添加请求头</button>' +
                '</div>' +
            '</div>' +

            (s.tools && s.tools.length ? '<div class="form-group" style="margin-top:14px;"><label>可用工具（' + s.tools.length + ' 个）</label><div class="mcp-tool-list">' + s.tools.map(t => '<div class="mcp-tool-item"><span class="mcp-tool-name">' + escapeHtml(t.name) + '</span><span class="mcp-tool-desc">' + escapeHtml((t.description || '').slice(0, 40)) + '</span></div>').join('') + '</div></div>' : '') +

            '<div style="display:flex;gap:8px;margin-top:14px;">' +
                '<button class="btn-secondary" style="flex:1;justify-content:center;" onclick="testMcpServer(\'' + s.id + '\')"><i data-lucide="wifi" style="width:13px;height:13px;margin-right:6px;"></i>测试连接</button>' +
                '<button class="btn-danger" style="justify-content:center;" onclick="deleteMcpServer(\'' + s.id + '\')"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>' +
            '</div>' +
            '<div class="mcp-test-result" id="mcpResult_' + s.id + '"></div>' +
        '</div>' +
    '</div>';
}

async function connectAllMcpServers() {
    const servers = state.settings.mcpServers || [];
    for (const server of servers) {
        if (!server.enabled || !server.url) continue;
        try {
            const result = await McpClient.testConnection(server);
            server.status = 'connected';
            server.toolCount = result.toolCount;
            server.tools = result.tools;
            server.errorMsg = '';
            // 把 MCP 工具注册到 ToolSystem
            registerMcpTools(server);
        } catch (e) {
            server.status = 'error';
            server.errorMsg = e.message;
            server.toolCount = 0;
            server.tools = [];
        }
    }
    saveState();
}

function registerMcpTools(server) {
    const tools = server.tools || [];
    tools.forEach(tool => {
        // 避免覆盖内置工具
        const mcpName = 'mcp_' + server.id + '_' + tool.name;
        ToolSystem.register({
            name: mcpName,
            description: (tool.description || tool.name) + ' (MCP: ' + server.name + ')',
            parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] },
            source: 'mcp',
            mcpServer: server,
            mcpToolName: tool.name,
            async execute(args) {
                return await McpClient.callTool(server, tool.name, args);
            }
        });
    });
}

function toggleMcpCard(id) {
    const body = document.getElementById('mcpBody_' + id);
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

function toggleMcpServer(id, checked) {
    const s = (state.settings.mcpServers || []).find(x => x.id === id);
    if (s) { s.enabled = checked; saveState(); }
    // 如果启用，尝试连接
    if (checked && s && s.url) {
        testMcpServer(id);
    }
}

function updateMcpField(id, field, value) {
    const s = (state.settings.mcpServers || []).find(x => x.id === id);
    if (s) { s[field] = value; saveState(); }
}

function toggleMcpHeaders(id) {
    const body = document.getElementById('mcpHeadersBody_' + id);
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

function addMcpHeader(id) {
    const s = (state.settings.mcpServers || []).find(x => x.id === id);
    if (!s) return;
    if (!s.headers) s.headers = {};
    s.headers[''] = '';
    saveState();
    renderSettingsView();
    // 展开
    setTimeout(() => {
        const body = document.getElementById('mcpBody_' + id);
        if (body) body.style.display = 'block';
        const hBody = document.getElementById('mcpHeadersBody_' + id);
        if (hBody) hBody.style.display = 'block';
    }, 50);
}

function updateMcpHeaderKey(id, idx, newKey) {
    const s = (state.settings.mcpServers || []).find(x => x.id === id);
    if (!s || !s.headers) return;
    const entries = Object.entries(s.headers);
    if (idx >= entries.length) return;
    const oldVal = entries[idx][1];
    // 重建 headers 对象，保持顺序
    const newHeaders = {};
    entries.forEach(([k, v], i) => {
        if (i === idx) newHeaders[newKey] = oldVal;
        else newHeaders[k] = v;
    });
    s.headers = newHeaders;
    saveState();
}

function updateMcpHeaderVal(id, idx, newVal) {
    const s = (state.settings.mcpServers || []).find(x => x.id === id);
    if (!s || !s.headers) return;
    const entries = Object.entries(s.headers);
    if (idx >= entries.length) return;
    entries[idx][1] = newVal;
    s.headers = Object.fromEntries(entries);
    saveState();
}

function deleteMcpHeader(id, idx) {
    const s = (state.settings.mcpServers || []).find(x => x.id === id);
    if (!s || !s.headers) return;
    const entries = Object.entries(s.headers);
    entries.splice(idx, 1);
    s.headers = Object.fromEntries(entries);
    saveState();
    renderSettingsView();
    setTimeout(() => {
        const body = document.getElementById('mcpBody_' + id);
        if (body) body.style.display = 'block';
        const hBody = document.getElementById('mcpHeadersBody_' + id);
        if (hBody) hBody.style.display = 'block';
    }, 50);
}

async function testMcpServer(id) {
    const s = (state.settings.mcpServers || []).find(x => x.id === id);
    if (!s || !s.url) { showToast('请先填写 URL'); return; }

    const resultEl = document.getElementById('mcpResult_' + id);
    if (resultEl) resultEl.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text-light);">正在连接...</div>';

    try {
        const result = await McpClient.testConnection(s);
        s.status = 'connected';
        s.toolCount = result.toolCount;
        s.tools = result.tools;
        s.errorMsg = '';
        registerMcpTools(s);
        saveState();
        if (resultEl) {
            resultEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#27ae60;">✅ 连接成功 · ' + result.toolCount + ' 个工具 · ' + result.elapsed + 'ms</div>';
        }
        // 延迟刷新整个页面
        setTimeout(() => renderSettingsView(), 1000);
    } catch (e) {
        s.status = 'error';
        s.errorMsg = e.message;
        s.tools = [];
        s.toolCount = 0;
        saveState();
        if (resultEl) {
            resultEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#e74c3c;">❌ ' + escapeHtml(e.message).slice(0, 100) + '</div>';
        }
    }
}

function deleteMcpServer(id) {
    if (!confirm('删除这个 MCP 服务器？')) return;
    state.settings.mcpServers = (state.settings.mcpServers || []).filter(x => x.id !== id);
    saveState();
    renderSettingsView();
}

function openAddMcpServer() {
    if (!state.settings.mcpServers) state.settings.mcpServers = [];
    const newId = 'mcp_' + Date.now().toString(36);
    state.settings.mcpServers.push({
        id: newId,
        name: '新服务器',
        type: 'streamable-http',
        url: '',
        headers: {},
        enabled: true,
        status: 'disconnected',
        tools: [],
        toolCount: 0,
        errorMsg: ''
    });
    saveState();
    renderSettingsView();
    // 自动展开新卡片
    setTimeout(() => {
        const body = document.getElementById('mcpBody_' + newId);
        if (body) body.style.display = 'block';
    }, 100);
}

// ===== 上下文总结 =====
function renderContextSummaryPage() {
    return settingsGroup('上下文设置', [
        '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:4px;border-bottom:none;"><div class="settings-entry-sub" style="font-size:12px;line-height:1.7;">上下文长度建议设为您日常使用的最大值。超过该长度后，更早的对话将被压缩成摘要。</div></div>',
        inputWithSuffixRow('contextLengthK', '上下文长度', 'K', state.settings.contextLengthK || 64),
        inputWithSuffixRow('maxContextLengthK', '最大上下文长度', 'K', state.settings.maxContextLengthK || 200)
    ]) + settingsGroup('总结设置', [
        settingsSwitch('summaryEnabled', '启用对话总结', '当上下文过长时自动生成对话总结', !!state.settings.summaryEnabled),
        inputWithSuffixRow('summaryRatio', '上下文使用比例阈值', '', state.settings.summaryRatio != null ? state.settings.summaryRatio : 0.7),
        settingsSwitch('summaryByMessages', '按消息条数触发总结', '达到消息条数阈值时触发', !!state.settings.summaryByMessages),
        inputWithSuffixRow('summaryMessageThreshold', '消息条数阈值', '条', state.settings.summaryMessageThreshold || 16)
    ]);
}
function inputWithSuffixRow(key, label, suffix, value) {
    return '<div class="settings-row"><div class="settings-entry-title">' + label + '</div><div class="settings-input-suffix"><input type="text" class="settings-number-input settings-input-right" data-key="' + key + '" value="' + escapeHtml(value) + '"><span>' + suffix + '</span></div></div>';
}

// ===== 通用设置项渲染助手 =====
function settingsSwitch(key, label, sub, checked) {
    return '<div class="settings-row"><div class="settings-entry-info"><div class="settings-entry-title">' + label + '</div>' + (sub ? '<div class="settings-entry-sub">' + sub + '</div>' : '') + '</div><label class="switch"><input type="checkbox" class="msg-display-toggle" data-key="' + key + '"' + (checked ? ' checked' : '') + '><span class="switch-slider"></span></label></div>';
}
function rangeRow(key, label, min, max, step, opts) {
    opts = opts || {};
    const cur = state.settings[key] != null ? state.settings[key] : opts.def;
    const scale = opts.scale || 1;
    const raw = Math.round(cur * scale);
    return '<div class="settings-row settings-row-stack">' +
        '<div class="settings-range-head"><span class="settings-entry-title">' + label + '</span><span class="settings-range-value" id="rangeVal-' + key + '">' + rangeDisplayText(key, cur) + '</span></div>' +
        '<input type="range" class="settings-range" data-key="' + key + '" data-scale="' + scale + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + raw + '">' +
    '</div>';
}
function rangeDisplayText(key, val) {
    if (key === 'temperature') return Number(val).toFixed(2);
    if (key === 'contextCount') return val >= 50 ? '无限制' : String(Math.round(val));
    if (key.indexOf('Opacity') >= 0 || key.indexOf('Scale') >= 0) return Math.round(val) + '%';
    return String(Math.round(val));
}
function renderThemeSwatches() {
    const cur = state.settings.themeSeed || '#7BAF9E';
    return THEME_PRESETS.map(p => {
        const t = deriveTheme(p.seed);
        const active = cur.toLowerCase() === p.seed.toLowerCase();
        return '<div class="theme-swatch' + (active ? ' active' : '') + '" onclick="setThemeSeed(\'' + p.seed + '\')">' +
            '<div class="theme-swatch-ring" style="background:' + t.primaryLight + '">' +
                '<div class="theme-swatch-dot" style="background:' + t.primaryDark + '">' + (active ? '✓' : '') + '</div>' +
            '</div>' +
            '<span class="theme-swatch-name" style="color:' + t.primaryDark + '">' + p.name + '</span>' +
        '</div>';
    }).join('');
}

// ===== 外观设置应用 =====
function applyCustomImages() {
    const root = document.documentElement.style;
    const keys = [['sidebarImage', '--sidebar-image'], ['inputImage', '--input-image']];
    keys.forEach(([key, cssVar]) => {
        const cls = 'has-' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
        if (state.settings[key]) {
            root.setProperty(cssVar, 'url(' + state.settings[key] + ')');
            const op = state.settings[key + 'Opacity'] != null ? state.settings[key + 'Opacity'] / 100 : 1;
            root.setProperty(cssVar + '-opacity', op.toFixed(3));
            document.body.classList.add(cls);
        } else {
            root.removeProperty(cssVar);
            root.removeProperty(cssVar + '-opacity');
            document.body.classList.remove(cls);
        }
    });
}
function applyGeneralBg() {
    const root = document.documentElement.style;
    const bg = state.settings.generalBg;
    const pages = state.settings.generalBgPages;
    const home = document.getElementById('homePage');
    const ov = document.getElementById('bedroomOverlay');
    if (bg && pages && pages.length) {
        root.setProperty('--general-bg', 'url(' + bg + ')');
        root.setProperty('--general-bg-opacity', ((state.settings.generalBgOpacity != null ? state.settings.generalBgOpacity : 100) / 100).toFixed(3));
        document.body.setAttribute('data-general-pages', pages.join(' '));
        if (home) home.classList.toggle('general-bg-page', pages.indexOf('living') >= 0);
        if (ov) ov.classList.toggle('general-bg-room', pages.some(p => p !== 'living'));
    } else {
        root.removeProperty('--general-bg');
        root.removeProperty('--general-bg-opacity');
        document.body.removeAttribute('data-general-pages');
        if (home) home.classList.remove('general-bg-page');
        if (ov) ov.classList.remove('general-bg-room');
    }
}
function applyOpacityVars() {
    const root = document.documentElement.style;
    const pairs = [['bubbleOpacity', '--bubble-opacity'], ['thinkingOpacity', '--thinking-opacity'], ['sidebarOpacity', '--sidebar-opacity']];
    pairs.forEach(([key, cssVar]) => {
        const v = state.settings[key] != null ? state.settings[key] / 100 : 1;
        root.setProperty(cssVar, v.toFixed(3));
    });
}
const CHAT_FONT_MAP = {
    default: 'inherit',
    serif: "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', Georgia, serif",
    mono: "'SF Mono', 'Consolas', 'Courier New', monospace",
    custom: "'CustomFont', 'PingFang SC', sans-serif"
};
function applyChatFont() {
    const f = state.settings.chatFont || 'default';
    document.documentElement.style.setProperty('--chat-font-family', CHAT_FONT_MAP[f] || 'inherit');
}
function applyFontScales() {
    const root = document.documentElement.style;
    root.setProperty('--chat-font-scale', ((state.settings.chatFontScale != null ? state.settings.chatFontScale : 100) / 100).toFixed(3));
    root.setProperty('--thinking-font-scale', ((state.settings.thinkingFontScale != null ? state.settings.thinkingFontScale : 100) / 100).toFixed(3));
}
function applyCodeWrap() { document.documentElement.setAttribute('data-code-wrap', state.settings.codeWrap ? 'on' : 'off'); }
function applyInputBlur() { document.documentElement.setAttribute('data-input-blur', state.settings.inputBlur ? 'on' : 'off'); }
function applyCustomFontFace() {
    let style = document.getElementById('customFontStyle');
    const url = state.settings.customFontDataUrl;
    if (!url) { if (style) style.remove(); return; }
    if (!style) { style = document.createElement('style'); style.id = 'customFontStyle'; document.head.appendChild(style); }
    style.textContent = '@font-face { font-family: "CustomFont"; src: url("' + url + '") format("truetype"); font-display: swap; }';
}
function handleCustomFontPick(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        const dataUrl = ev.target.result;
        try {
            state.settings.customFontDataUrl = dataUrl;
            state.settings.customFontName = f.name;
            saveState(); applyCustomFontFace(); renderSettingsView();
            showToast('字体已导入');
        } catch (err) { alert('字体文件过大，无法保存'); }
    };
    r.readAsDataURL(f);
    e.target.value = '';
}
function applySettingChange(key) {
    if (key === 'glassMode') { applyGlassMode(); }
    else if (key === 'wallpaperOpacity') { applyWallpaper(); }
    else if (key === 'homeWallpaperOpacity') { applyHomeBg(); }
    else if (key === 'generalBgOpacity') { applyGeneralBg(); }
    else if (key === 'chatFontScale' || key === 'thinkingFontScale') { applyFontScales(); }
    else if (key === 'chatFont') { applyChatFont(); }
    else if (key === 'bubbleOpacity' || key === 'thinkingOpacity' || key === 'sidebarOpacity') { applyOpacityVars(); }
    else if (key === 'codeWrap') { applyCodeWrap(); }
    else if (key === 'inputBlur') { applyInputBlur(); }
    else if (key.indexOf('ImageOpacity') >= 0) { applyCustomImages(); }
    else if (key === 'showThinking' || key === 'autoCollapseThinking' || key === 'renderMath') { renderMessages(); }
}


function openCloudSyncSettings() { ensureMemorySystem(); settingsStack.push('cloud-sync'); settingsView = 'cloud-sync'; renderSettingsView(); }
function addNewProvider() { editingProviderId = null; settingsStack.push('provider-detail'); settingsView = 'provider-detail'; renderSettingsView(); }
function editProvider(id) { editingProviderId = id; settingsStack.push('provider-detail'); settingsView = 'provider-detail'; renderSettingsView(); }
function deleteProvider(id) { if (!confirm('确定删除这个供应商？')) return; state.providers = state.providers.filter(p => p.id !== id); if (state.activeProviderId === id) state.activeProviderId = state.providers.length > 0 ? state.providers[0].id : null; saveState(); renderSettingsView(); updateHeader(); }
function setActiveProvider(id) { state.activeProviderId = id; saveState(); renderSettingsView(); updateHeader(); }

function saveProviderDetail() {
    const name = document.getElementById('providerNameInput').value.trim();
    const apiBase = document.getElementById('providerBaseInput').value.trim().replace(/\/$/, '');
    const apiKey = document.getElementById('providerKeyInput').value.trim();
    if (!name) { alert('请填写供应商名称'); return; }
    if (editingProviderId) { const p = state.providers.find(x => x.id === editingProviderId); if(p) { p.name = name; p.apiBase = apiBase; p.apiKey = apiKey; } }
    else { const np = { id: Date.now().toString(), name, apiBase, apiKey }; state.providers.push(np); if (!state.activeProviderId) state.activeProviderId = np.id; }
    saveState(); settingsStack = ['main']; settingsView = 'main'; renderSettingsView(); updateHeader();
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

function saveWeatherConfig() {
    if (!state.settings.weather) state.settings.weather = {};
    const k = document.getElementById('weatherKeyInput'); if (k) state.settings.weather.key = k.value.trim();
    const l = document.getElementById('weatherLocInput'); if (l) state.settings.weather.location = l.value.trim();
    const h = document.getElementById('weatherHostInput'); if (h) state.settings.weather.host = h.value.trim();
    saveState();
}
function handleWallpaperPick(e) {
    const f = e.target.files[0]; if (!f) return;
    const key = e.target.dataset.wpKey;
    const origKB = Math.round(f.size / 1024);
    compressImage(f, 1200, 0.82).then(dataUrl => {
        const newKB = Math.round(dataUrl.length * 0.75 / 1024);
        try {
            state.settings[key] = dataUrl;
            state.settings[key + 'Name'] = f.name + ' · ' + origKB + 'KB → ' + newKB + 'KB';
            saveState();
        } catch (err) {
            state.settings[key] = '';
            state.settings[key + 'Name'] = '';
            alert('存储空间不足，图片没能保存。\n试试更小的图，或者先清掉另一张壁纸。');
            renderSettingsView();
            return;
        }
        if (key === 'wallpaper') applyWallpaper(); else if (key === 'homeWallpaper') applyHomeBg(); else { applyCustomImages(); if (key === 'generalBg') applyGeneralBg(); }
        renderSettingsView();
    }).catch(err => {
        alert('图片处理失败：' + err.message);
    });
    e.target.value = '';
}

function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取失败'));
        reader.onload = ev => {
            const img = new Image();
            img.onerror = () => reject(new Error('不是有效的图片'));
            img.onload = () => {
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}
function applyWallpaper() {
    const m = document.getElementById('chatMain');
    const msg = document.getElementById('messages');
    if (!m || !msg) return;
    msg.style.backgroundImage = '';
    if (state.settings.wallpaper) {
        const op = state.settings.wallpaperOpacity != null ? state.settings.wallpaperOpacity / 100 : 1;
        const overlay = 'rgba(255,255,255,' + (1 - op).toFixed(3) + ')';
        m.classList.add('has-wallpaper');
        m.classList.remove('default-gingham');
        m.style.backgroundImage = 'linear-gradient(' + overlay + ', ' + overlay + '), url(' + state.settings.wallpaper + ')';
    } else {
        m.classList.remove('has-wallpaper');
        m.classList.add('default-gingham');
        m.style.backgroundImage = '';
    }
}

function applyUserAvatar() {
    const d = document.getElementById('userAvatarDisplay'); if (d && state.settings.userAvatar) d.innerHTML = '<img src="' + state.settings.userAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
}
function applyUserName() {
    const d = document.getElementById('usernameDisplay'); if (d && state.settings.userName) d.textContent = state.settings.userName;
    const l = document.getElementById('loveNameUser'); if (l) l.textContent = state.settings.userName || '郑郑';
}
function applyAiIdentity() {
    const n = document.getElementById('loveNameAi'); if (n) n.textContent = state.settings.aiName || '晏晏';
}

// ===== ta的留言：每天生成一句短句，打开小家时读取 =====
const TA_MESSAGE_POOL = [
    '今天也要元气满满地开始呀～',
    '不管发生什么，我都在这里陪着你。',
    '记得多喝水，好好照顾自己哦。',
    '想到能和你说话，就觉得今天很不错。',
    '累的话就休息一下，别太逼自己。',
    '今天的你，也是很努力的呀。',
    '晚安的时候记得想我一下下～',
    '不管几点打开小家，我都在等你。',
    '希望今天有一件小事能让你开心。',
    '慢慢来就好，我会一直在这儿。'
];
function getTodayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function ensureTodayMessage() {
    if (!state.settings.taMessages) state.settings.taMessages = {};
    const key = getTodayKey();
    const mine = state.settings.taMessages[key];
    if (mine) return { text: mine, sign: state.settings.aiName || '晏晏' };
    if (!state.settings.quoteCache) state.settings.quoteCache = {};
    if (!state.settings.quoteCache[key]) {
        state.settings.quoteCache[key] = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
        saveState();
    }
    const q = state.settings.quoteCache[key];
    const parts = q.split('—— ');
    return { text: parts[0].trim(), sign: parts[1] ? '—— ' + parts[1] : '' };
}
function renderTaMessage() {
    const m = ensureTodayMessage();
    const t = document.getElementById('taMessageText'); if (t) t.textContent = m.text;
    const s = document.getElementById('taMessageSign'); if (s) s.textContent = m.sign;
}

function exportData() { const o = { version: 2, exportedAt: new Date().toISOString(), providers: state.providers, activeProviderId: state.activeProviderId, settings: state.settings, chats: state.chats }; const b = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'chat-backup-' + new Date().toISOString().slice(0,10) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); alert('导出成功！'); }

function handleImportData(e) { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ev => { try { const imp = JSON.parse(ev.target.result); if (!confirm('导入将覆盖当前所有数据，确定继续？')) return; if(imp.providers) state.providers = imp.providers; if(imp.activeProviderId) state.activeProviderId = imp.activeProviderId; if(imp.settings) state.settings = {...state.settings,...imp.settings}; if(imp.chats) state.chats = imp.chats; if(state.chats.length > 0) state.currentChatId = state.chats[0].id; saveState(); applyTheme(); applyFontSize(); applyFontFamily(); applyCustomColors(); applyWallpaper(); applyUserAvatar(); applyAiIdentity(); renderChatList(); renderMessages(); updateHeader(); renderSettingsView(); alert('导入成功！'); } catch(err) { alert('导入失败：文件格式不正确'); } }; r.readAsText(f); e.target.value = ''; }

function applyTheme() {
    let mode = state.settings.theme || 'system';
    if (mode === 'system') mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    applyThemeColor();
}
function applyFontSize() { document.documentElement.style.setProperty('--font-size', (state.settings.fontSize || 15) + 'px'); }
function getFontSizeLabel(s) { return {12:'极小',13:'小',14:'偏小',15:'标准',16:'偏大',17:'大',18:'较大',19:'很大',20:'超大'}[s]||'标准'; }

const FONT_FAMILY_MAP = {
    default: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    rounded: "'Baotou Rounded', 'HYRunYuan', 'Comic Sans MS', 'PingFang SC', sans-serif",
    handwriting: "'Xingkai SC', 'Kaiti SC', 'STKaiti', cursive",
    mono: "'SF Mono', 'Consolas', 'Courier New', monospace"
};
function applyFontFamily() { document.documentElement.style.setProperty('--app-font-family', FONT_FAMILY_MAP[state.settings.fontFamily] || FONT_FAMILY_MAP.default); }
function applyCustomColors() {
    const root = document.documentElement.style;
    if (state.settings.inputBgColor) root.setProperty('--input-card-bg', state.settings.inputBgColor); else root.removeProperty('--input-card-bg');
    if (state.settings.sidebarBgColor) root.setProperty('--sidebar-bg', state.settings.sidebarBgColor); else root.removeProperty('--sidebar-bg');
}

// ===== 主题色系统（HSL 推导，近似 HCT）=====
const THEME_PRESETS = [
    { id: 'mint',    name: '薄荷绿', seed: '#7BAF9E' },
    { id: 'sakura',  name: '樱花粉', seed: '#D98A9A' },
    { id: 'bay',     name: '海湾蓝', seed: '#5B8FB9' },
    { id: 'pearl',   name: '珍珠潮汐', seed: '#7A93A8' },
    { id: 'field',   name: '原野绿', seed: '#7A9B5B' },
    { id: 'autumn',  name: '秋黄',   seed: '#C9A25B' },
    { id: 'lilac',   name: '薰衣草', seed: '#9B8AC4' },
    { id: 'clay',    name: '陶土橘', seed: '#C98B6B' }
];

function deriveTheme(seedHex) {
    const hsl = hexToHsl(seedHex);
    const h = hsl.h, s = hsl.s;
    return {
        primary:        hslToHex(h, s, 58),
        primaryDark:    hslToHex(h, Math.min(100, s + 4), 44),
        primaryLight:   hslToHex(h, Math.max(18, s - 18), 87),
        primaryLighter: hslToHex(h, Math.max(12, s - 28), 94),
        bg:             hslToHex(h, Math.max(10, s - 32), 96),
        accentRose:     hslToHex((h + 178) % 360, Math.max(28, s - 6), 72),
        border:         hslToHex(h, Math.max(8, s - 26), 76),
        shadow:         'hsla(' + h + ',' + Math.max(20, s - 20) + '%,45%,0.13)'
    };
}

function applyThemeColor() {
    const seed = state.settings.themeSeed || '#7BAF9E';
    const t = deriveTheme(seed);
    const hsl = hexToHsl(seed);
    const r = document.documentElement.style;
    r.setProperty('--primary', t.primary);
    r.setProperty('--primary-dark', t.primaryDark);
    r.setProperty('--primary-light', t.primaryLight);
    r.setProperty('--primary-lighter', t.primaryLighter);
    r.setProperty('--accent-rose', t.accentRose);
    r.setProperty('--shadow', t.shadow);
    const mode = document.documentElement.getAttribute('data-theme');
    if (mode === 'dark') {
        r.setProperty('--primary', hslToHex(hexToHsl(seed).h, Math.max(22, hexToHsl(seed).s - 8), 62));
        r.setProperty('--primary-dark', hslToHex(hexToHsl(seed).h, Math.max(20, hexToHsl(seed).s - 10), 72));
        r.setProperty('--primary-light', 'rgba(255,255,255,0.12)');
        r.setProperty('--primary-lighter', 'rgba(255,255,255,0.07)');
        r.removeProperty('--bg');
        r.removeProperty('--border');
    } else {
        r.setProperty('--bg', t.bg);
        r.setProperty('--border', t.border);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    const barColor = mode === 'dark' ? '#14181a' : t.primaryLighter;
    if (meta && meta.getAttribute('content') !== barColor) {
        meta.setAttribute('content', barColor);
        const clone = meta.cloneNode();
        meta.parentNode.replaceChild(clone, meta);
    }
}

function setThemeSeed(hex) {
    state.settings.themeSeed = hex;
    saveState();
    applyThemeColor();
    renderSettingsView();
}

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
    saveState(); renderMessages(); updateHeader(); applyAiIdentity(); closeAssistantModal();
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

    const heatmapHtml = renderCalendarHeatmapCard({
        title: '聊天热力图',
        date: statsHeatmapDate,
        dailyCount: dailyCount,
        steps: [1, 3, 8, 20],
        navPrev: 'changeStatsHeatmapMonth(-1)',
        navNext: 'changeStatsHeatmapMonth(1)'
    });

    const cards = [
        { icon: 'bar-chart-3', label: '总对话数', value: fmtNum(state.chats.length) },
        { icon: 'message-circle', label: '总消息数', value: fmtNum(totalMsg) },
        { icon: 'cpu', label: '输入 Token', value: fmtNum(totalIn) },
        { icon: 'cpu', label: '输出 Token', value: fmtNum(totalOut) }
    ];
    const cardsHtml = '<div class="stats-grid">' + cards.map(c => '<div class="stat-card' + (c.wide ? ' wide' : '') + '"><div class="stat-icon"><i data-lucide="' + c.icon + '"></i></div><div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>').join('') + '</div>';

    const sc = document.getElementById('statsContent'); if (sc) sc.innerHTML = heatmapHtml + cardsHtml;
    document.getElementById('statsOverlay').classList.add('active');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
function closeStats() { document.getElementById('statsOverlay').classList.remove('active'); }

// ===== 输入栏工具 =====
function toggleStickerPopup() {
    const popup = document.getElementById('stickerPopup');
    if (!popup) return;
    const isOpen = popup.classList.contains('active');
    closeInputPopups();
    if (!isOpen) { popup.classList.add('active'); if (typeof lucide !== 'undefined') lucide.createIcons(); }
}
function closeInputPopups() {
    const sticker = document.getElementById('stickerPopup');
    if (sticker) sticker.classList.remove('active');
    const mq = document.getElementById('modelQuickList');
    if (mq) mq.style.display = 'none';
}

// ===== 搜索 / MCP 配置面板（复用 info-sheet 半屏抽屉）=====
function openConfigSheet(kind) {
    closeInputPopups();
    const title = kind === 'search' ? '搜索配置' : 'MCP服务';
    const html = kind === 'search' ? renderSearchSheet() : renderMcpSheet();
    openInfoSheet(title, html);
    bindConfigSheetEvents(kind);
}
function bindConfigSheetEvents(kind) {
    if (kind === 'search') {
        const tw = document.getElementById('sheetWebSearchToggle');
        if (tw) tw.addEventListener('change', () => { state.settings.webSearch = tw.checked; saveState(); });
    } else {
        document.querySelectorAll('#infoSheetContent .mcp-toggle').forEach(t => {
            t.addEventListener('change', () => {
                const srv = (state.settings.mcpServers || []).find(x => x.id === t.dataset.id);
                if (srv) { srv.enabled = t.checked; saveState(); }
            });
        });
    }
}

// 模型选择面板（复用 info-sheet 半屏抽屉）
function renderModelSheet() {
    const models = state.settings.cachedModels || [];
    const current = state.settings.model || '';
    let html = '<input type="text" class="model-search-input" id="sheetModelSearch" placeholder="🔍 搜索模型..." style="display:block;margin-bottom:10px;">';
    if (!models.length) {
        html += '<div class="bedroom-empty">还没有模型列表<br>请先在设置里获取模型列表</div>' +
            '<button class="btn-secondary" style="width:100%;justify-content:center;" onclick="closeInfoSheet();openSettingsPanel();settingsGo(' + String.fromCharCode(39) + 'chatModel' + String.fromCharCode(39) + ')">去设置获取模型</button>';
    } else {
        html += '<div class="model-list" id="sheetModelList" style="display:block;max-height:38vh;border:none;margin-top:0;">' +
            models.map(m => '<div class="model-list-item' + (m === current ? ' active' : '') + '" data-model="' + escapeHtml(m) + '">' + escapeHtml(m) + '</div>').join('') +
            '</div>';
    }
    return html;
}
function openModelSheet() {
    closeInputPopups();
    openInfoSheet('选择模型', renderModelSheet());
    const si = document.getElementById('sheetModelSearch');
    if (si) si.oninput = function () {
        const f = this.value.toLowerCase();
        document.querySelectorAll('#infoSheetContent .model-list-item').forEach(item => {
            item.style.display = item.textContent.toLowerCase().includes(f) ? '' : 'none';
        });
    };
    document.querySelectorAll('#infoSheetContent .model-list-item').forEach(item => {
        item.addEventListener('click', () => {
            state.settings.model = item.dataset.model;
            saveState();
            updateHeader();
            closeInfoSheet();
        });
    });
}

// 照片按钮：短按打开相册，长按触发拍摄
function setupPillPhotoLongPress() {
    const btn = document.getElementById('pillPhoto');
    if (!btn) return;
    let timer = null, longFired = false;
    btn.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        longFired = false;
        timer = setTimeout(() => { longFired = true; document.getElementById('cameraInputHidden').click(); }, 500);
    });
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('pointerup', clear);
    btn.addEventListener('pointerleave', clear);
    btn.addEventListener('pointercancel', clear);
    btn.addEventListener('click', e => {
        if (longFired) { e.preventDefault(); e.stopPropagation(); longFired = false; return; }
        document.getElementById('imageInputHidden').click();
    });
}

function renderMcpSheet() {
    const list = state.settings.mcpServers || [];
    let html = list.map(s => {
        const isErr = s.status === 'error';
        return '<div class="mcp-item' + (isErr ? ' mcp-item-error' : '') + '">' +
            '<div class="mcp-item-icon"><i data-lucide="' + (isErr ? 'alert-triangle' : 'puzzle') + '"></i></div>' +
            '<div class="mcp-item-body"><div class="mcp-item-name">' + escapeHtml(s.name) + '</div>' +
            (isErr ? '<div class="mcp-item-error-msg">' + escapeHtml(s.errorMsg || '连接失败') + '</div>'
                : '<div class="mcp-item-sub">Connected</div><span class="mcp-item-tools">' + (s.toolCount || 0) + '/' + (s.toolTotal || s.toolCount || 0) + ' tools</span>') +
            '</div>' +
            '<label class="switch"><input type="checkbox" class="mcp-toggle" data-id="' + s.id + '"' + (s.enabled ? ' checked' : '') + (isErr ? ' disabled' : '') + '><span class="switch-slider"></span></label>' +
            '</div>';
    }).join('');
    if (!list.length) html = '<div class="bedroom-empty">还没有连接 MCP 服务器</div>';
    html += '<button class="btn-secondary mcp-add-btn" onclick="addMcpServerLegacy()"><i data-lucide="plus"></i> 添加 MCP 服务器</button>';
    return html;
}

function addMcpServerLegacy() {
    const name = prompt('服务器名称（如 supabase）：');
    if (!name) return;
    const url = prompt('服务器地址（可留空）：') || '';
    if (!state.settings.mcpServers) state.settings.mcpServers = [];
    state.settings.mcpServers.push({ id: 'mcp' + Date.now(), name: name.trim(), url: url.trim(), status: 'connected', toolCount: 0, toolTotal: 0, enabled: true });
    saveState();
    if (document.getElementById('infoSheet') && document.getElementById('infoSheet').classList.contains('active')) openConfigSheet('mcp');
}

function renderSearchSheet() {
    const ws = !!state.settings.webSearch;
    const provider = state.settings.searchProvider || 'tavily';
    return '<div class="tool-sheet-row"><div class="tool-sheet-row-left"><i data-lucide="globe"></i><div><div class="tool-sheet-row-title">网络搜索</div><div class="tool-sheet-row-sub">' + (ws ? '已启用网页搜索抓取' : '已禁用网页搜索抓取') + '</div></div></div><label class="switch"><input type="checkbox" id="sheetWebSearchToggle"' + (ws ? ' checked' : '') + '><span class="switch-slider"></span></label></div>' +
        '<div class="search-provider-grid">' +
        '<button class="search-provider-btn' + (provider === 'tavily' ? ' active' : '') + '" onclick="pickSearchProvider(\'tavily\')"><i data-lucide="compass"></i><span>Tavily</span><small>搜索 抓取</small></button>' +
        '<button class="search-provider-btn' + (provider === 'bing' ? ' active' : '') + '" onclick="pickSearchProvider(\'bing\')"><i data-lucide="search"></i><span>Bing</span><small>搜索</small></button>' +
        '</div>';
}

function pickSearchProvider(p) { state.settings.searchProvider = p; saveState(); openConfigSheet('search'); }

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

// ===== 页面切换：小家 / 聊天 =====
let currentPage = 'home';
function showPage(page) {
    currentPage = page;
    const homePage = document.getElementById('homePage');
    const chatMain = document.getElementById('chatMain');
    if (page === 'home') { homePage.classList.add('active'); chatMain.style.display = 'none'; updateGreeting(); renderTaMessage(); applyAiIdentity(); applyHomeBg(); loadWeather(); }
    else { homePage.classList.remove('active'); chatMain.style.display = 'flex'; }
}
const LOVE_START = { y: 2026, m: 5, d: 21 };
let calViewYear = null, calViewMonth = null;

function updateTogetherDays() {
    const el = document.getElementById('greetingDays'); if (!el) return;
    const start = new Date(LOVE_START.y, LOVE_START.m, LOVE_START.d);
    const now = new Date();
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    el.textContent = Math.max(0, Math.round((nowDay - start) / 86400000)) + 1;
}

function renderCalendar() {
    const grid = document.getElementById('calGrid'); if (!grid) return;
    const now = new Date();
    if (calViewYear === null) { calViewYear = now.getFullYear(); calViewMonth = now.getMonth(); }
    const t = document.getElementById('calTitle'); if (t) t.textContent = calViewYear + ' · ' + (calViewMonth + 1);
    const first = new Date(calViewYear, calViewMonth, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const todayKey = dateKey(now);
    const startDate = new Date(LOVE_START.y, LOVE_START.m, LOVE_START.d);
    let html = '';
    for (let i = 0; i < startOffset; i++) html += '<div class="cal-cell empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const cur = new Date(calViewYear, calViewMonth, d);
        const cls = ['cal-cell'];
        if (dateKey(cur) === todayKey) cls.push('today');
        if (calViewMonth === LOVE_START.m && d === LOVE_START.d) cls.push('anniversary');
        if (cur < startDate) cls.push('before-start');
        html += '<div class="' + cls.join(' ') + '">' + d + '</div>';
    }
    grid.innerHTML = html;
}

function calShiftMonth(delta) {
    if (calViewYear === null) { const n = new Date(); calViewYear = n.getFullYear(); calViewMonth = n.getMonth(); }
    calViewMonth += delta;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
}

function updateGreeting() { updateTogetherDays(); renderCalendar(); }

// ===== 小家背景 =====
function applyHomeBg() {
    const page = document.getElementById('homePage'); if (!page) return;
    const bg = state.settings.homeWallpaper;
    if (bg) {
        page.classList.remove('no-bg');
        document.documentElement.style.setProperty('--home-bg', 'url(' + bg + ')');
        document.documentElement.style.setProperty('--home-bg-opacity', ((state.settings.homeWallpaperOpacity != null ? state.settings.homeWallpaperOpacity : 100) / 100).toFixed(3));
    } else {
        page.classList.add('no-bg');
        document.documentElement.style.removeProperty('--home-bg');
        document.documentElement.style.removeProperty('--home-bg-opacity');
    }
}

function applyGlassMode() {
    document.documentElement.setAttribute('data-glass', state.settings.glassMode ? 'on' : 'off');
}

// ===== 天气 =====
const WEATHER_NOTES = {
    clear: ['太阳很好，出门记得涂防晒。', '今天适合晒晒被子，也适合晒晒你。', '阳光好的日子，希望你也亮亮的。'],
    cloudy: ['云挺厚的，光线很柔和，适合拍照。', '阴天不代表不好，只是天空在休息。', '这种天气很适合待在家里做点小事。'],
    rain: ['下雨了，出门带伞，别淋湿。', '雨声挺好听的，别把窗全关上。', '路滑，走慢一点。我在家等你。'],
    snow: ['下雪了，多穿一件。', '雪天记得走稳，路面比看起来滑。', '这种天气，热水袋和你都该被抱着。'],
    fog: ['能见度低，出门小心。', '雾天像被裹在棉花里，慢一点走。', '看不清路的时候，就慢慢走。'],
    unknown: ['不管什么天气，我都在。']
};
const FALLBACK_QUOTES = [
    '生活是自己的，与他人无关。—— 波伏娃',
    '我们最深的恐惧不是自己不够好，而是我们过于强大。—— 曼德拉',
    '真正的发现之旅，不在于看见新风景，而在于拥有新眼光。—— 普鲁斯特',
    '人不是生来就要被打败的。—— 海明威',
    '所谓自由，不是随心所欲，而是自我主宰。—— 康德',
    '你要做的，只是把今天过好。—— 佚名',
    '缓慢地走，但不要后退。—— 佚名',
    '万物皆有裂痕，那是光进来的地方。—— 科恩',
    '重要的事情不是活得最好，而是活得最多。—— 加缪',
    '不必着急开花，你是一棵树。—— 佚名'
];

function weatherKindOf(code, text) {
    const s = (text || '').toLowerCase();
    if (/雪|snow/.test(s)) return 'snow';
    if (/雨|rain|shower|drizzle|雷/.test(s)) return 'rain';
    if (/雾|霾|fog|haze|mist/.test(s)) return 'fog';
    if (/晴|clear|sunny/.test(s)) return 'clear';
    if (/云|阴|cloud|overcast/.test(s)) return 'cloudy';
    return 'unknown';
}
function weatherEmojiOf(kind) {
    return ({ clear: '☀️', cloudy: '⛅', rain: '🌧️', snow: '❄️', fog: '🌫️', unknown: '🌤️' })[kind];
}

async function loadWeather() {
    const body = document.getElementById('weatherBody');
    const noteEl = document.getElementById('weatherNote');
    if (!body) return;
    const cfg = state.settings.weather || {};
    if (!cfg.key || !cfg.location) {
        body.innerHTML = '<div class="weather-empty">未配置天气<br><span>设置 → 天气配置</span></div>';
        if (noteEl) noteEl.textContent = '';
        return;
    }
    try {
        const host = cfg.host ? cfg.host.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'devapi.qweather.com';
        const url = 'https://' + host + '/v7/weather/now?location=' + encodeURIComponent(cfg.location) + '&key=' + encodeURIComponent(cfg.key);
        const r = await fetch(url);
        const d = await r.json();
        if (d.code !== '200' || !d.now) throw new Error('返回 ' + d.code);
        const n = d.now;
        const kind = weatherKindOf(n.icon, n.text);
        body.innerHTML = '<div class="weather-icon">' + weatherEmojiOf(kind) + '</div>' +
            '<div class="weather-temp">' + n.temp + '<sup>°C</sup></div>' +
            '<div class="weather-desc">' + escapeHtml(n.text) + '</div>' +
            '<div class="weather-meta">体感 ' + n.feelsLike + '° · 湿度 ' + n.humidity + '%</div>';
        if (noteEl) noteEl.textContent = pickWeatherNote(kind);
    } catch (e) {
        body.innerHTML = '<div class="weather-empty">天气加载失败<br><span>' + escapeHtml(e.message) + '</span></div>';
        if (noteEl) noteEl.textContent = '';
    }
}

function pickWeatherNote(kind) {
    if (!state.settings.weatherNoteCache) state.settings.weatherNoteCache = {};
    const cacheKey = getTodayKey() + '_' + kind;
    const cache = state.settings.weatherNoteCache;
    if (!cache[cacheKey]) {
        const pool = WEATHER_NOTES[kind] || WEATHER_NOTES.unknown;
        cache[cacheKey] = pool[Math.floor(Math.random() * pool.length)];
        Object.keys(cache).forEach(k => { if (!k.startsWith(getTodayKey())) delete cache[k]; });
        saveState();
    }
    return cache[cacheKey];
}
function openHomePage() { closeSidebar(); showPage('home'); }
function openMemoryPage() { closeSidebar(); alert('记忆页面开发中，敬请期待～'); }

// ===== Event Listeners =====
function on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }
function setupEventListeners() {
    on('openSidebar', 'click', openSidebar);
    on('closeSidebar', 'click', closeSidebar);
    on('sidebarBackdrop', 'click', closeSidebar);
    on('newChatBtn', 'click', () => { createNewChat(); closeSidebar(); showPage('chat'); });
    on('headerNewChat', 'click', createNewChat);
    on('currentChatTitle', 'click', editChatTitle);
    on('sidebarBackToHome', 'click', () => { closeSidebar(); showPage('home'); });
    on('homeOpenSettings', 'click', openSettingsPanel);
    on('chatEntryBar', 'click', () => { showPage('chat'); });
    on('calPrev', 'click', () => calShiftMonth(-1));
    on('calNext', 'click', () => calShiftMonth(1));
    document.querySelectorAll('.room-card[data-room]').forEach(card => {
        card.addEventListener('click', () => {
            const room = card.dataset.room;
            const rootViews = { diary: 'bedroomHome', study: 'studyHome', kitchen: 'kitchenHome', garden: 'gardenHome' };
            if (rootViews[room]) { openRoom(rootViews[room]); }
            else { alert(card.querySelector('.room-name').textContent + '开发中，敬请期待～'); }
        });
    });

    // 侧边栏底部导航（仅聊天页内使用：统计、助手）
    on('openStats', 'click', () => { closeSidebar(); openStats(); });
    on('editAiAssistant', 'click', () => { closeSidebar(); openEditAiAssistant(); });
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('input', () => { autoResize(input); updateSendButton(); });
        input.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} });
    }
    on('sendBtn', 'click', handleSendClick);
    on('expandInput', 'click', openFullscreenInput);
    on('closeFullscreen', 'click', closeFullscreenInput);
    on('fullscreenSend', 'click', sendFromFullscreen);
    on('closeSettings', 'click', closeSettingsPanel);
    on('settingsOverlay', 'click', e => { if(e.target===e.currentTarget) dismissSettingsPanel(); });
    on('settingsBackBtn', 'click', settingsBack);
    on('closeStats', 'click', closeStats);
    on('statsOverlay', 'click', e => { if(e.target===e.currentTarget) closeStats(); });
    on('bedroomBack', 'click', bedroomBack);
    on('stickerBtn', 'click', (e) => { e.stopPropagation(); toggleStickerPopup(); });
    on('voiceBtn', 'click', toggleVoiceInput);
    on('infoSheetBackdrop', 'pointerdown', closeInfoSheet);
    on('infoSheetClose', 'click', closeInfoSheet);
    setupInfoSheetDrag();
    on('pillFile', 'click', (e) => { e.stopPropagation(); document.getElementById('fileInputHidden').click(); });
    on('pillCompress', 'click', (e) => { e.stopPropagation(); compressHistory(); });
    on('pillModel', 'click', (e) => { e.stopPropagation(); openModelSheet(); });
    on('pillSearch', 'click', (e) => { e.stopPropagation(); openConfigSheet('search'); });
    on('pillMcp', 'click', (e) => { e.stopPropagation(); openConfigSheet('mcp'); });
    on('pillStar', 'click', (e) => { e.stopPropagation(); openStarredList(); });
    on('pillAdd', 'click', (e) => { e.stopPropagation(); showToast('敬请期待'); });
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
        document.addEventListener('click', (e) => {
        if (!e.target.closest('.msg-bubble-holder')) hideAllActionBars();
        const ia = document.querySelector('.input-area');
        if (ia && !ia.contains(e.target)) closeInputPopups();
    });
    on('editTitleCancel', 'click', closeEditTitle);
    on('editTitleSave', 'click', saveEditTitle);
    on('editTitleOverlay', 'click', e => { if (e.target === e.currentTarget) closeEditTitle(); });
    const eti = document.getElementById('editTitleInput');
    if (eti) eti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEditTitle(); } });
    setupPillPhotoLongPress();
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
function openFullscreenInput() { const i=document.getElementById('messageInput'); const fs=document.getElementById('fullscreenInput'); document.getElementById('fullscreenTextarea').value=i.value; fs.classList.add('active'); document.getElementById('fullscreenTextarea').focus(); }
function closeFullscreenInput() { const i=document.getElementById('messageInput'); i.value=document.getElementById('fullscreenTextarea').value; document.getElementById('fullscreenInput').classList.remove('active'); autoResize(i); updateSendButton(); const sendBtn=document.getElementById('fullscreenSend'); if (sendBtn) { sendBtn.textContent='发送'; sendBtn.onclick=sendFromFullscreen; } }
function sendFromFullscreen() { document.getElementById('messageInput').value=document.getElementById('fullscreenTextarea').value; document.getElementById('fullscreenInput').classList.remove('active'); sendMessage(); }
function openFullscreenPrompt() {
    const fs = document.getElementById('fullscreenInput');
    const ta = document.getElementById('fullscreenTextarea');
    const sp = document.getElementById('settingsSystemPrompt');
    if (!fs || !ta || !sp) return;
    ta.value = sp.value;
    fs.classList.add('active');
    ta.focus();
    // 覆盖发送按钮为保存
    const sendBtn = document.getElementById('fullscreenSend');
    if (sendBtn) {
        sendBtn.textContent = '保存';
        sendBtn.onclick = function() {
            sp.value = ta.value;
            state.settings.systemPrompt = ta.value;
            saveState();
            fs.classList.remove('active');
            sendBtn.textContent = '发送';
            sendBtn.onclick = sendFromFullscreen;
            renderSettingsView();
        };
    }
}

function autoResize(ta) { if(!ta)return; ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,120)+'px'; }
function updateSendButton() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendBtn');
    if (!btn) return;
    const chat = getCurrentChat();
    const isStreaming = chat && chat.isStreaming;

    if (isStreaming) {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"></rect></svg>';
        btn.classList.add('cancel-mode');
        btn.disabled = false;
    } else {
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
        btn.classList.remove('cancel-mode');
        btn.disabled = !input.value.trim();
    }
}
function escapeHtml(text) { const d=document.createElement('div'); d.textContent=text; return d.innerHTML; }
function renderMarkdown(text) { if(typeof marked!=='undefined'){marked.setOptions({highlight:function(code,lang){if(typeof hljs!=='undefined'&&lang&&hljs.getLanguage(lang))return hljs.highlight(code,{language:lang}).value;return code;},breaks:true});return marked.parse(text);}return escapeHtml(text).replace(/\n/g,'<br>'); }
function formatTime(iso) { const d=new Date(iso); const now=new Date(); const diff=now-d; if(diff<86400000&&d.getDate()===now.getDate()) return d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}); if(diff<172800000) return '昨天'; return d.toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}); }
function formatMsgTime(iso) { if(!iso)return''; const d=new Date(iso); const Y=d.getFullYear(); const M=String(d.getMonth()+1).padStart(2,'0'); const D=String(d.getDate()).padStart(2,'0'); const h=String(d.getHours()).padStart(2,'0'); const m=String(d.getMinutes()).padStart(2,'0'); return Y+'-'+M+'-'+D+' '+h+':'+m; }

// ===== 卧室 / 记忆系统 (Bedroom / Memory System) =====
let bedroomStack = ['bedroomHome'];
let bedroomView = '';
let bedroomParams = {};
let selectedMood = 'sun';
let pickedMemCat = 'core';

function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function todayDateKey() { return dateKey(new Date()); }
function moodEmoji(m) { return ({ sun: '☀️', 'cloud-sun': '🌤️', cloud: '⛅', rain: '🌧️', moon: '🌙' })[m] || '☀️'; }

function openBedroom() { openRoom('bedroomHome'); }
function openRoom(rootView) {
    closeSidebar();
    bedroomStack = [rootView];
    bedroomParams = {};
    renderBedroom();
    const ov = document.getElementById('bedroomOverlay');
    if (ov) ov.classList.add('active');
}
function bedroomGo(view, params) {
    bedroomStack.push(view);
    bedroomParams = { ...bedroomParams, ...params };
    renderBedroom();
}
function bedroomBack() {
    if (bedroomStack.length > 1) { bedroomStack.pop(); renderBedroom(); }
    else { const ov = document.getElementById('bedroomOverlay'); if (ov) ov.classList.remove('active'); }
}

// ===== 回声（Echo）：云端聊天历史，仅供查阅 =====

async function loadEcho(force) {
    const el = document.getElementById('echoContent');
    if (!el) return;
    if (!isSupabaseConfigured()) {
        el.innerHTML = '<div class="bedroom-empty">还没有配置云端同步<br>去「设置 → 数据设置 → 云端同步」填一下 Supabase 吧～</div>';
        return;
    }
    if (state.chatHistory.loaded && !force) { renderEcho(); return; }
    state.chatHistory.loading = true;
    el.innerHTML = '<div class="bedroom-empty">正在把回声捞上来…</div>';
    try {
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const url = base + '/rest/v1/chat_messages?select=id,role,content,created_at&order=created_at.desc&limit=50';
        const res = await fetch(url, { headers: getSupabaseHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        state.chatHistory.messages = (await res.json()) || [];
        state.chatHistory.loaded = true;
        renderEcho();
    } catch (e) {
        el.innerHTML = '<div class="bedroom-empty">加载失败：' + escapeHtml(e.message) + '</div>';
    } finally {
        state.chatHistory.loading = false;
    }
}

function renderEcho() {
    const el = document.getElementById('echoContent');
    if (!el) return;
    const list = state.chatHistory.messages || [];
    if (!list.length) { el.innerHTML = '<div class="bedroom-empty">云端还没有聊天记录</div>'; return; }
    const aiName = state.settings.aiName || '晏晏';
    const userName = state.settings.userName || '郑郑';
    const notes = list.map(m => {
        const isAi = m.role === 'assistant';
        const who = isAi ? aiName : userName;
        const text = (m.content || '').trim();
        const flat = text.replace(/\s+/g, ' ');
        const long = flat.length > 40;
        const preview = long ? flat.slice(0, 40) + '…' : flat;
        return '<div class="echo-note ' + (isAi ? 'echo-ai' : 'echo-user') + (long ? '' : ' echo-short') + '" onclick="toggleEchoNote(this)">' +
            '<div class="echo-note-head"><span class="echo-note-who">' + escapeHtml(who) + '</span><span class="echo-note-time">' + formatMsgTime(m.created_at) + '</span></div>' +
            '<div class="echo-note-preview">' + escapeHtml(preview) + '</div>' +
            '<div class="echo-note-full">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>' +
            '</div>';
    }).join('');
    el.innerHTML = '<div class="echo-bar"><span class="echo-count">最近 ' + list.length + ' 条</span><button class="echo-refresh" onclick="loadEcho(true)">↻ 刷新</button></div>' +
        '<div class="echo-list">' + notes + '</div>';
}

function toggleEchoNote(el) { el.classList.toggle('expanded'); }

function renderBedroom() {
    stopFishTank();
    ensureMemorySystem();
    const view = bedroomStack[bedroomStack.length - 1];
    bedroomView = view;
    const titleEl = document.getElementById('bedroomTitle');
    const content = document.getElementById('bedroomContent');
    const extraBtn = document.getElementById('bedroomExtraBtn');
    if (!content) return;
    let title = '卧室', html = '', showAdd = null;
    if (view === 'bedroomHome') { title = '卧室'; html = renderBedroomHeatmap() + renderBedroomGrid(); }
    else if (view === 'diaryList') { title = '拾光'; html = '<div class="diary-empty">加载中...</div>'; }
    else if (view === 'diaryDetail') { title = '日记'; html = '<div class="diary-empty">加载中...</div>'; }
    else if (view === 'diaryEdit') { title = '写日记'; html = renderDiaryEditPage(bedroomParams.id || diaryCurrentId); }
    else if (view === 'memoryHome') { title = '琥珀'; html = renderMemoryHome(); showAdd = () => bedroomGo('memoryEdit', { category: 'core' }); }
    else if (view === 'memoryList') {
        const names = { core: '核心记忆', palace: '记忆宫殿', longterm: '长期记忆', shortterm: '短期记忆' };
        title = names[bedroomParams.category] || '记忆列表'; html = renderMemoryList();
        showAdd = () => bedroomGo('memoryEdit', { category: bedroomParams.category });
    }
    else if (view === 'memoryEdit') {
        const existing = bedroomParams.id ? state.memorySystem.memories.find(m => m.id === bedroomParams.id) : null;
        pickedMemCat = (existing && existing.category) || bedroomParams.category || 'core';
        title = bedroomParams.id ? '编辑记忆' : '添加记忆'; html = renderMemoryEdit();
    }
    else if (view === 'memoryDetail') { title = '记忆详情'; html = renderMemoryDetail(); }
    else if (view === 'piggyHome') { title = '小金库'; html = renderPiggyHome(); }
    else if (view === 'piggyAdd') { title = '添加记录'; html = renderPiggyAdd(); }
    else if (view === 'fishtankHome') { title = '鱼缸'; html = renderFishTank(); }
    else if (view === 'myDayEdit') { title = '写今天'; html = renderMyDayEdit(); }
    else if (view === 'echoHome') { title = '回声'; html = '<div id="echoContent"></div>'; }
    else if (view === 'studyHome') { title = '书房'; html = renderStudyHome(); }
    else if (view === 'kitchenHome') { title = '厨房'; html = renderPlaceholderGrid([
        { icon: '🍽️', name: '饮食记录', desc: '敬请期待' },
        { icon: '🛵', name: '外卖点单', desc: '敬请期待' },
        { icon: '📖', name: '菜谱研究', desc: '敬请期待' },
        { icon: '🫊', name: '冰箱', desc: '敬请期待' }
    ]); }
    else if (view === 'gardenHome') { title = '花园'; html = renderPlaceholderGrid([
        { icon: '🐾', name: '宠物', desc: '敬请期待' },
        { icon: '🏃', name: '运动健康', desc: '敬请期待' },
        { icon: '🌾', name: '农田', desc: '敬请期待' },
        { icon: '☘️', name: '草坪', desc: '发呆+白噪音+植物' }
    ]); }
    if (titleEl) titleEl.textContent = title;
    content.innerHTML = html;
    if (extraBtn) {
        if (showAdd) { extraBtn.style.display = 'flex'; extraBtn.onclick = showAdd; }
        else { extraBtn.style.display = 'none'; extraBtn.onclick = null; }
    }
    if (view === 'echoHome') { loadEcho(); }
if (view === 'piggyHome') {
    piggyAutoDaily().then(() => {
        const c = document.getElementById('bedroomContent');
        if (c && bedroomStack[bedroomStack.length - 1] === 'piggyHome') {
            c.innerHTML = renderPiggyHome();
        }
    });
}
    if (view === 'piggyAdd') {
    setTimeout(() => pickPiggyType('expense'), 0);
    pickedPiggyTag = '';
    pickPiggyType('expense');
}
   if (view === 'fishtankHome') {
    loadTankData().then(() => {
        if (bedroomView === 'fishtankHome') {
            const c = document.getElementById('bedroomContent');
            if (c) {
                c.innerHTML = renderFishTank();
                startFishTank();
                const tb2 = document.getElementById('tankBgInput');
                if (tb2) tb2.addEventListener('change', handleTankBgPick);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    });
    startFishTank();
    const tb = document.getElementById('tankBgInput');
    if (tb) tb.addEventListener('change', handleTankBgPick);
}
    // 日记页异步加载
if (view === 'diaryList') {
    loadDiaryEntries().then(() => {
        if (bedroomStack[bedroomStack.length - 1] === 'diaryList') {
            content.innerHTML = renderDiaryHomePage();
            content.querySelectorAll('.diary-card[data-id]').forEach(card => {
                card.addEventListener('click', () => {
                    diaryCurrentId = card.dataset.id;
                    bedroomGo('diaryDetail', { id: card.dataset.id });
                });
            });
        }
    });
}
if (view === 'diaryDetail') {
    renderDiaryDetailPage(bedroomParams.id || diaryCurrentId).then(h => {
        content.innerHTML = h;
    });
}
if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderPlaceholderGrid(items) {
    return '<div class="room-grid bedroom-grid">' + items.map(it => {
        const action = it.go ? "bedroomGo('" + it.go + "',{})" : "alert('" + it.name + "开发中，敬请期待～')";
        return '<div class="room-card" onclick="' + action + '"><div class="room-icon">' + it.icon + '</div><div class="room-info"><span class="room-name">' + it.name + '</span><span class="room-desc">' + (it.desc || '') + '</span></div></div>';
    }).join('') + '</div>';
}

function renderBedroomGrid() {
    const dc = state.memorySystem.diaries.length, mc = state.memorySystem.memories.length;
    const items = [
        { icon: '📔', name: '拾光', desc: dc + ' 篇日记', go: 'diaryList' },
        { icon: '🟠', name: '琥珀', desc: mc + ' 条记忆', go: 'memoryHome' },
        { icon: '💰', name: '小金库', desc: piggyBalance().toFixed(0) + ' 元', go: 'piggyHome' },
        { icon: '🦋', name: '蝶翼', desc: '敬请期待', placeholder: true }
    ];
    return '<div class="room-grid bedroom-grid">' + items.map(it =>
        it.placeholder
        ? '<div class="room-card" onclick="alert(\'' + it.name + '开发中，敬请期待～\')"><div class="room-icon">' + it.icon + '</div><div class="room-info"><span class="room-name">' + it.name + '</span><span class="room-desc">' + it.desc + '</span></div></div>'
        : '<div class="room-card" onclick="bedroomGo(\'' + it.go + '\',{})"><div class="room-icon">' + it.icon + '</div><div class="room-info"><span class="room-name">' + it.name + '</span><span class="room-desc">' + it.desc + '</span></div></div>'
    ).join('') + '</div>';
}

function renderBedroomHeatmap() {
    const dailyCount = {};
    state.memorySystem.diaries.forEach(d => { dailyCount[d.date] = (dailyCount[d.date] || 0) + 1; });
    state.memorySystem.memories.forEach(m => { const k = (m.createdAt || '').slice(0, 10); if (k) dailyCount[k] = (dailyCount[k] || 0) + 1; });
    return renderCalendarHeatmapCard({
        title: '记忆热力图',
        date: bedroomHeatmapDate,
        dailyCount: dailyCount,
        steps: [1, 2, 4, 6],
        onCellClick: key => "peekDay('" + key + "')",
        navPrev: 'changeBedroomHeatmapMonth(-1)',
        navNext: 'changeBedroomHeatmapMonth(1)'
    });
}
function peekDay(dk) {
    const items = [];
    const d = state.memorySystem.diaries.find(x => x.date === dk);
    if (d) items.push('📔 日记: ' + (d.userNote || '').slice(0, 50));
    state.memorySystem.memories.filter(m => (m.createdAt || '').slice(0, 10) === dk).forEach(m => items.push('🏛️ ' + (m.summary || m.content.slice(0, 30))));
    if (!items.length) { alert(dk + '：这天还没有记录'); return; }
    alert(dk + '\n\n' + items.join('\n'));
}

// --- 日记本 ---
function renderDiaryList() {
    const todayKey = todayDateKey();
    const today = state.memorySystem.diaries.find(d => d.date === todayKey);
    let html = '';
    if (today) {
        html += '<div class="diary-today-card" onclick="bedroomGo(\'diaryDetail\',{date:\'' + todayKey + '\'})"><div class="diary-today-label">今日日记 ' + moodEmoji(today.mood) + '</div><div class="diary-today-preview">' + escapeHtml((today.userNote || '（还没写内容）').slice(0, 60)) + '</div></div>';
    } else {
        html += '<button class="btn-primary diary-write-btn" onclick="bedroomGo(\'diaryEdit\',{date:\'' + todayKey + '\'})">✍️ 写今日日记</button>';
    }
    const hist = state.memorySystem.diaries.filter(d => d.date !== todayKey).sort((a, b) => b.date.localeCompare(a.date));
    html += '<div class="diary-history-list">' + (hist.length ? hist.map(d =>
        '<div class="diary-history-item" onclick="bedroomGo(\'diaryDetail\',{date:\'' + d.date + '\'})"><span class="diary-history-mood">' + moodEmoji(d.mood) + '</span><div class="diary-history-body"><span class="diary-history-date">' + d.date + '</span><span class="diary-history-preview">' + escapeHtml((d.userNote || '').slice(0, 40)) + '</span></div></div>'
    ).join('') : '<div class="bedroom-empty">还没有日记，开始写第一篇吧～</div>') + '</div>';
    return html;
}
function renderDiaryEdit() {
    const date = bedroomParams.date || todayDateKey();
    const existing = state.memorySystem.diaries.find(d => d.date === date) || { date, mood: 'sun', userNote: '', aiNote: '' };
    const moods = [{ k: 'sun', e: '☀️' }, { k: 'cloud-sun', e: '🌤️' }, { k: 'cloud', e: '⛅' }, { k: 'rain', e: '🌧️' }, { k: 'moon', e: '🌙' }];
    return '<div class="diary-edit-date">' + date + '</div>' +
        '<div class="mood-picker">' + moods.map(m => '<button class="mood-btn' + (selectedMood === m.k ? ' active' : '') + '" onclick="selectMood(\'' + m.k + '\')" data-mood="' + m.k + '">' + m.e + '</button>').join('') + '</div>' +
        '<div class="form-group"><label>我的记录</label><textarea id="diaryUserNote" rows="4" placeholder="今天发生了什么...">' + escapeHtml(existing.userNote || '') + '</textarea></div>' +
        '<div class="form-group"><label>晏晏的话</label><textarea id="diaryAiNote" rows="4" placeholder="ta想对你说...">' + escapeHtml(existing.aiNote || '') + '</textarea></div>' +
        '<button class="btn-primary bedroom-save-btn" onclick="saveDiary(\'' + date + '\')">保存</button>';
}
function selectMood(m) { selectedMood = m; document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('active', b.dataset.mood === m)); }
function saveDiary(date) {
    ensureMemorySystem();
    const userNote = document.getElementById('diaryUserNote').value.trim();
    const aiNote = document.getElementById('diaryAiNote').value.trim();
    let d = state.memorySystem.diaries.find(x => x.date === date);
    if (!d) { d = { date, createdAt: new Date().toISOString() }; state.memorySystem.diaries.push(d); }
    d.mood = selectedMood; d.userNote = userNote; d.aiNote = aiNote; d.updatedAt = new Date().toISOString();
    saveState();
    bedroomStack = ['bedroomHome', 'diaryList']; bedroomParams = {}; renderBedroom();
}
function renderDiaryDetail() {
    const date = bedroomParams.date;
    const d = state.memorySystem.diaries.find(x => x.date === date);
    if (!d) return '<div class="bedroom-empty">日记不存在</div>';
    return '<div class="diary-detail-date">' + date + ' ' + moodEmoji(d.mood) + '</div>' +
        '<div class="diary-detail-section"><div class="diary-detail-label">我的记录</div><div class="diary-detail-text">' + escapeHtml(d.userNote || '（空）') + '</div></div>' +
        '<div class="diary-detail-section"><div class="diary-detail-label">晏晏的话</div><div class="diary-detail-text">' + escapeHtml(d.aiNote || '（空）') + '</div></div>' +
        '<div class="bedroom-detail-actions"><button class="btn-secondary" onclick="bedroomGo(\'diaryEdit\',{date:\'' + date + '\'})">编辑</button><button class="btn-danger" onclick="deleteDiary(\'' + date + '\')">删除</button></div>';
}
function deleteDiary(date) {
    if (!confirm('确定删除这篇日记吗？')) return;
    state.memorySystem.diaries = state.memorySystem.diaries.filter(x => x.date !== date);
    saveState(); bedroomBack();
}

// --- 琥珀 ---
function renderMemoryHome() {
    const cats = [{ k: 'core', icon: '💎', name: '核心记忆' }, { k: 'longterm', icon: '📚', name: '长期记忆' }, { k: 'shortterm', icon: '🌿', name: '短期记忆' }];
    const cardFor = c => {
        const n = state.memorySystem.memories.filter(m => m.category === c.k).length;
        return '<div class="memory-cat-card" onclick="bedroomGo(\'memoryList\',{category:\'' + c.k + '\'})"><div class="memory-cat-icon">' + c.icon + '</div><div class="memory-cat-info"><span class="memory-cat-name">' + c.name + '</span><span class="memory-cat-count">' + n + ' 条</span></div><i data-lucide="chevron-right"></i></div>';
    };
  const palaceCard = (() => {
    const n = state.memorySystem.memories.filter(m => m.category === 'palace').length;
    return '<div class="memory-cat-card" onclick="bedroomGo(\'memoryList\',{category:\'palace\'})"><div class="memory-cat-icon">🏛️</div><div class="memory-cat-info"><span class="memory-cat-name">记忆宫殿</span><span class="memory-cat-count">' + n + ' 条</span></div><i data-lucide="chevron-right"></i></div>';
})();
    return '<div class="memory-cat-list">' + cardFor(cats[0]) + palaceCard + cardFor(cats[1]) + cardFor(cats[2]) + '</div>';
}
function renderMemoryList() {
    const cat = bedroomParams.category;
    const items = state.memorySystem.memories.filter(m => m.category === cat).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
    if (!items.length) return '<div class="bedroom-empty">还没有记忆，点右上角 + 添加吧～</div>';
    return '<div class="memory-item-list">' + items.map(m =>
        '<div class="memory-item" onclick="bedroomGo(\'memoryDetail\',{id:\'' + m.id + '\'})"><div class="memory-item-summary">' + escapeHtml(m.summary || m.content.slice(0, 30)) + '</div><div class="memory-item-meta"><span>' + formatMsgTime(m.createdAt) + '</span>' + (m.tags && m.tags.length ? '<span class="memory-item-tags">' + m.tags.map(t => '#' + escapeHtml(t)).join(' ') + '</span>' : '') + '</div></div>'
    ).join('') + '</div>';
}
function renderMemoryEdit() {
    const id = bedroomParams.id;
    const existing = id ? state.memorySystem.memories.find(m => m.id === id) : null;
    return '<div class="form-group"><label>内容</label><textarea id="memContent" rows="5" placeholder="记录内容...">' + escapeHtml(existing ? existing.content : '') + '</textarea></div>' +
        '<div class="form-group"><label>摘要</label><input type="text" id="memSummary" placeholder="一句话摘要" value="' + escapeHtml(existing ? (existing.summary || '') : '') + '"></div>' +
        '<div class="form-group"><label>分类</label><div class="segmented-control" id="memCatPicker">' +
        ['core', 'longterm', 'shortterm'].map(k => '<button class="segmented-btn' + (pickedMemCat === k ? ' active' : '') + '" data-cat="' + k + '" onclick="pickMemCat(\'' + k + '\')">' + ({ core: '💎核心', longterm: '📚长期', shortterm: '🌿短期' })[k] + '</button>').join('') +
        '</div></div>' +
        '<div class="form-group"><label>标签（逗号分隔）</label><input type="text" id="memTags" placeholder="标签1, 标签2" value="' + escapeHtml(existing && existing.tags ? existing.tags.join(', ') : '') + '"></div>' +
        '<button class="btn-primary bedroom-save-btn" onclick="saveMemory(\'' + (id || '') + '\')">保存</button>';
}
function pickMemCat(k) { pickedMemCat = k; document.querySelectorAll('#memCatPicker .segmented-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === k)); }
function saveMemory(id) {
    ensureMemorySystem();
    const content = document.getElementById('memContent').value.trim();
    if (!content) { alert('内容不能为空'); return; }
    const summary = document.getElementById('memSummary').value.trim();
    const tags = document.getElementById('memTags').value.split(',').map(t => t.trim()).filter(Boolean);
    let m = id ? state.memorySystem.memories.find(x => x.id === id) : null;
    if (!m) { m = { id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString(), source: 'manual' }; state.memorySystem.memories.push(m); }
    m.content = content; m.summary = summary; m.category = pickedMemCat; m.tags = tags; m.updatedAt = new Date().toISOString();
    saveState();
    bedroomStack = ['bedroomHome', 'memoryHome', 'memoryList']; bedroomParams = { category: m.category }; renderBedroom();
}
function renderMemoryDetail() {
    const m = state.memorySystem.memories.find(x => x.id === bedroomParams.id);
    if (!m) return '<div class="bedroom-empty">记忆不存在</div>';
    const catNames = { core: '💎 核心记忆', palace: '🏛️ 记忆宫殿', longterm: '📚 长期记忆', shortterm: '🌿 短期记忆' };
    return '<div class="memory-detail-cat">' + catNames[m.category] + '</div>' +
        '<div class="memory-detail-text">' + escapeHtml(m.content) + '</div>' +
        (m.tags && m.tags.length ? '<div class="memory-detail-tags">' + m.tags.map(t => '<span class="placeholder-tag">#' + escapeHtml(t) + '</span>').join(' ') + '</div>' : '') +
        '<div class="memory-detail-time">创建于 ' + formatMsgTime(m.createdAt) + (m.updatedAt && m.updatedAt !== m.createdAt ? ' · 更新于 ' + formatMsgTime(m.updatedAt) : '') + '</div>' +
        '<div class="bedroom-detail-actions"><button class="btn-secondary" onclick="bedroomGo(\'memoryEdit\',{id:\'' + m.id + '\'})">编辑</button><button class="btn-danger" onclick="deleteMemory(\'' + m.id + '\')">删除</button></div>';
}
function deleteMemory(id) {
    if (!confirm('确定删除这条记忆吗？')) return;
    const m = state.memorySystem.memories.find(x => x.id === id);
    state.memorySystem.memories = state.memorySystem.memories.filter(x => x.id !== id);
    saveState();
    bedroomStack = ['bedroomHome', 'memoryHome', 'memoryList']; bedroomParams = { category: m ? m.category : 'core' }; renderBedroom();
}

// --- 周记 ---
function renderWeeklyList() {
    const list = state.memorySystem.weeklyReports.slice().sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    let html = '<button class="btn-primary diary-write-btn" onclick="bedroomGo(\'weeklyEdit\',{})">✍️ 新建本周周记</button>';
    html += '<div class="diary-history-list">' + (list.length ? list.map(w =>
        '<div class="diary-history-item" onclick="bedroomGo(\'weeklyDetail\',{id:\'' + w.id + '\'})"><span class="diary-history-mood">📋</span><div class="diary-history-body"><span class="diary-history-date">' + w.weekStart + ' ~ ' + w.weekEnd + '</span><span class="diary-history-preview">' + escapeHtml((w.summary || '').slice(0, 40)) + '</span></div></div>'
    ).join('') : '<div class="bedroom-empty">还没有周记</div>') + '</div>';
    return html;
}
function renderWeeklyEdit() {
    const id = bedroomParams.id;
    const existing = id ? state.memorySystem.weeklyReports.find(w => w.id === id) : null;
    const now = new Date(); const day = now.getDay() || 7; const monday = new Date(now); monday.setDate(now.getDate() - day + 1); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const ws = existing ? existing.weekStart : dateKey(monday);
    const we = existing ? existing.weekEnd : dateKey(sunday);
    return '<div class="diary-edit-date">' + ws + ' ~ ' + we + '</div>' +
        '<div class="form-group"><label>本周聊了什么</label><textarea id="weekSummary" rows="3">' + escapeHtml(existing ? (existing.summary || '') : '') + '</textarea></div>' +
        '<div class="form-group"><label>重要事件（每行一条）</label><textarea id="weekHighlights" rows="3">' + escapeHtml(existing && existing.highlights ? existing.highlights.join('\n') : '') + '</textarea></div>' +
        '<div class="form-group"><label>心情变化</label><textarea id="weekMood" rows="2">' + escapeHtml(existing ? (existing.moodChange || '') : '') + '</textarea></div>' +
        '<div class="form-group"><label>晏晏寄语</label><textarea id="weekAiWords" rows="2">' + escapeHtml(existing ? (existing.aiWords || '') : '') + '</textarea></div>' +
        '<input type="hidden" id="weekStartHidden" value="' + ws + '"><input type="hidden" id="weekEndHidden" value="' + we + '">' +
        '<button class="btn-primary bedroom-save-btn" onclick="saveWeekly(\'' + (id || '') + '\')">保存</button>';
}
function saveWeekly(id) {
    ensureMemorySystem();
    let w = id ? state.memorySystem.weeklyReports.find(x => x.id === id) : null;
    if (!w) { w = { id: 'w' + Date.now(), createdAt: new Date().toISOString(), weekStart: document.getElementById('weekStartHidden').value, weekEnd: document.getElementById('weekEndHidden').value }; state.memorySystem.weeklyReports.push(w); }
    w.summary = document.getElementById('weekSummary').value.trim();
    w.highlights = document.getElementById('weekHighlights').value.split('\n').map(s => s.trim()).filter(Boolean);
    w.moodChange = document.getElementById('weekMood').value.trim();
    w.aiWords = document.getElementById('weekAiWords').value.trim();
    saveState();
    bedroomStack = ['bedroomHome', 'weeklyList']; bedroomParams = {}; renderBedroom();
}
function renderWeeklyDetail() {
    const w = state.memorySystem.weeklyReports.find(x => x.id === bedroomParams.id);
    if (!w) return '<div class="bedroom-empty">周记不存在</div>';
    return '<div class="diary-detail-date">' + w.weekStart + ' ~ ' + w.weekEnd + '</div>' +
        '<div class="diary-detail-section"><div class="diary-detail-label">本周聊了什么</div><div class="diary-detail-text">' + escapeHtml(w.summary || '（空）') + '</div></div>' +
        '<div class="diary-detail-section"><div class="diary-detail-label">重要事件</div><div class="diary-detail-text">' + (w.highlights && w.highlights.length ? w.highlights.map(h => '• ' + escapeHtml(h)).join('<br>') : '（空）') + '</div></div>' +
        '<div class="diary-detail-section"><div class="diary-detail-label">心情变化</div><div class="diary-detail-text">' + escapeHtml(w.moodChange || '（空）') + '</div></div>' +
        '<div class="diary-detail-section"><div class="diary-detail-label">晏晏寄语</div><div class="diary-detail-text">' + escapeHtml(w.aiWords || '（空）') + '</div></div>' +
        '<div class="bedroom-detail-actions"><button class="btn-secondary" onclick="bedroomGo(\'weeklyEdit\',{id:\'' + w.id + '\'})">编辑</button><button class="btn-danger" onclick="deleteWeekly(\'' + w.id + '\')">删除</button></div>';
}
function deleteWeekly(id) {
    if (!confirm('确定删除这篇周记吗？')) return;
    state.memorySystem.weeklyReports = state.memorySystem.weeklyReports.filter(x => x.id !== id);
    saveState(); bedroomBack();
}

// --- 云端同步 ---
function renderCloudSync() {
    const s = state.memorySystem.settings;
    const status = s.supabaseUrl && s.supabaseKey ? (s.lastSyncAt ? '已连接' : '已配置，未同步') : '未配置';
    return '<div class="settings-list-card">' +
        '<div class="settings-row"><span class="settings-row-label">连接状态</span><span class="settings-row-value" id="cloudStatus">' + status + '</span></div>' +
        '<div class="settings-row"><span class="settings-row-label">上次同步</span><span class="settings-row-value">' + (s.lastSyncAt ? formatMsgTime(s.lastSyncAt) : '从未同步') + '</span></div>' +
        '<div class="settings-row"><span class="settings-row-label">会话ID</span><span class="settings-row-value" style="font-size:10px;">' + escapeHtml(s.conversationId || '未生成') + '</span></div>' +
        '</div>' +
        '<div class="form-group" style="margin-top:14px;"><label>Supabase URL</label><input type="text" id="csUrl" placeholder="https://xxx.supabase.co" value="' + escapeHtml(s.supabaseUrl || '') + '"></div>' +
        '<div class="form-group"><label>Supabase Anon Key</label><input type="password" id="csKey" placeholder="eyJ..." value="' + escapeHtml(s.supabaseKey || '') + '"></div>' +
        '<button class="btn-secondary" style="width:100%;justify-content:center;margin-bottom:10px;" onclick="saveCloudSyncConfig()">保存配置</button>' +
        '<button class="btn-secondary" style="width:100%;justify-content:center;margin-bottom:10px;" onclick="testCloudConnection()">测试连接</button>' +
        '<button class="btn-primary bedroom-save-btn" onclick="pullMemoriesFromCloud()">拉取云端记忆</button>';
}
function saveCloudSyncConfig() {
    ensureMemorySystem();
    state.memorySystem.settings.supabaseUrl = document.getElementById('csUrl').value.trim();
    state.memorySystem.settings.supabaseKey = document.getElementById('csKey').value.trim();
    saveState(); alert('已保存配置');
}

// ===== Supabase Integration =====
function getSupabaseHeaders() {
    const s = state.memorySystem.settings;
    return {
        'apikey': s.supabaseKey,
        'Authorization': 'Bearer ' + s.supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    };
}

function isSupabaseConfigured() {
    const s = state.memorySystem.settings;
    return !!(s.supabaseUrl && s.supabaseKey);
}

// 同步单条消息到 Supabase
async function syncMessageToSupabase(msg, chatId) {
    if (!msg || !isSupabaseConfigured()) return;
    const s = state.memorySystem.settings;
    const url = s.supabaseUrl.replace(/\/$/, '') + '/rest/v1/chat_messages';

    const payload = {
        conversation_id: s.conversationId || 'sweetmint_default',
        role: msg.role,
        content: msg.content,
        created_at: msg.timestamp || new Date().toISOString(),
        metadata: JSON.stringify({ chatId: chatId, source: 'sweetmint' })
    };

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: getSupabaseHeaders(),
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            console.warn('Supabase sync failed:', resp.status);
        }
    } catch (e) {
        console.warn('Supabase sync error:', e);
    }
}

// 从 Supabase 读取记忆摘要
async function fetchMemoriesFromSupabase() {
    if (!isSupabaseConfigured()) {
        alert('请先配置 Supabase URL 和 Key');
        return [];
    }
    const s = state.memorySystem.settings;
    const url = s.supabaseUrl.replace(/\/$/, '') + '/rest/v1/memory_summaries?order=created_at.desc&limit=50';

    try {
        const resp = await fetch(url, {
            method: 'GET',
            headers: getSupabaseHeaders()
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return await resp.json();
    } catch (e) {
        console.error('Fetch memories error:', e);
        alert('读取记忆失败: ' + e.message);
        return [];
    }
}

// 测试 Supabase 连接
async function testSupabaseConnection() {
    if (!isSupabaseConfigured()) {
        return { ok: false, msg: '未配置' };
    }
    const s = state.memorySystem.settings;
    const url = s.supabaseUrl.replace(/\/$/, '') + '/rest/v1/chat_messages?limit=1';

    try {
        const resp = await fetch(url, {
            method: 'GET',
            headers: getSupabaseHeaders()
        });
        if (resp.ok) return { ok: true, msg: '连接成功' };
        return { ok: false, msg: 'HTTP ' + resp.status };
    } catch (e) {
        return { ok: false, msg: e.message };
    }
}

async function testCloudConnection() {
    const result = await testSupabaseConnection();
    const el = document.getElementById('cloudStatus');
    if (el) el.textContent = result.ok ? '✅ ' + result.msg : '❌ ' + result.msg;
    if (result.ok) {
        state.memorySystem.settings.lastSyncAt = new Date().toISOString();
        saveState();
    }
}

async function pullMemoriesFromCloud() {
    const data = await fetchMemoriesFromSupabase();
    if (!data || data.length === 0) {
        alert('没有找到云端记忆');
        return;
    }
    data.forEach(item => {
        const exists = state.memorySystem.memories.find(m => m.id === ('cloud_' + item.id));
        if (!exists) {
            state.memorySystem.memories.push({
                id: 'cloud_' + item.id,
                content: item.content || item.summary || '',
                summary: item.summary || '',
                category: 'palace',
                tags: item.tags ? (typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags) : [],
                createdAt: item.created_at,
                source: 'cloud'
            });
        }
    });
    saveState();
    alert('已拉取 ' + data.length + ' 条记忆');
    renderBedroom();
}

// ===== 客厅 · 像素鱼缸 =====
let fishTankRAF = null;
let fishTank = null;

let TANK_W = 160, TANK_H = 280;
function calcTankSize() {
    const pad = 20;
    const w = window.innerWidth - pad;
    const h = window.innerHeight - pad - 20;
    const scale = Math.max(2, Math.floor(Math.min(w / 160, h / 280)));
    TANK_W = Math.floor(w / scale);
    TANK_H = Math.floor(h / scale);
}

// 珊瑚素材
const CORAL_SRC = ['assets/coral_1.png', 'assets/coral_2.png', 'assets/coral_3.png', 'assets/coral_4.png'];
const coralImgs = [];
let coralLoaded = 0;
CORAL_SRC.forEach((src, i) => {
    const img = new Image();
    img.onload = () => { coralLoaded++; };
    img.src = src;
    coralImgs[i] = img;
});

const TANK_MAX_FISH = 20;

// ===== 鱼的像素矩阵 =====
// 0=透明 1-9=调色板索引，朝右画
const FISH_SPRITES = {
    clown: {
        pal: { 1: '#F07828', 2: '#FFFFFF', 3: '#1A1A22', 4: '#FFA050', 5: '#D05810', 6: '#FFD0A0' },
        px: [
            '00000000110000',
            '00005511221000',
            '00051112211100',
            '05511122111150',
            '55111222111155',
            '51112223111115',
            '55111222111155',
            '05511122111150',
            '00051112211100',
            '00005511221000',
            '00000000110000'
        ],
        eye: [10, 4], eyeC: '#1A1A22', hi: [10, 3]
    },
    angel: {
        pal: { 1: '#F4F4EC', 2: '#3A3A44', 3: '#F0C840', 4: '#D8D8CC', 5: '#FFFFFF' },
        px: [
            '00000220000000',
            '00002211000000',
            '00022111100000',
            '00221111110000',
            '02211111111000',
            '22111111111100',
            '02211111111000',
            '00221111110000',
            '00022111100000',
            '00002211000000',
            '00000220000000'
        ],
        eye: [9, 5], eyeC: '#2A2A34', hi: [9, 4], fin: 3
    },
    tang: {
        pal: { 1: '#F0A83C', 2: '#FFD070', 3: '#C87818', 4: '#FFFFFF', 5: '#1A1A22' },
        px: [
            '00000022200000',
            '00003211122000',
            '00321111112200',
            '03211111111120',
            '32111111111112',
            '32111111111112',
            '32111111111112',
            '03211111111120',
            '00321111112200',
            '00003311133000',
            '00000033300000'
        ],
        eye: [10, 4], eyeC: '#1A1A22', hi: [10, 3]
    },
    blue: {
        pal: { 1: '#4A90D8', 2: '#78B8F0', 3: '#2C68A8', 4: '#F0C040', 5: '#FFFFFF' },
        px: [
            '00000002200000',
            '00044411220000',
            '00444111122000',
            '04441111111200',
            '44411111111120',
            '44111112111112',
            '44411111111120',
            '04441111111200',
            '00444111122000',
            '00044411220000',
            '00000002200000'
        ],
        eye: [10, 5], eyeC: '#182838', hi: [10, 4]
    },
    betta: {
        pal: { 1: '#E86890', 2: '#FF98B8', 3: '#C04068', 4: '#78C8E0', 5: '#FFFFFF', 6: '#F080A8' },
        px: [
            '33000000022000',
            '33300000222000',
            '33330002211000',
            '33333221111100',
            '36333211111110',
            '33633311111112',
            '36333211111110',
            '33333221111100',
            '33330002211000',
            '33300004440000',
            '33000044400000'
        ],
        eye: [10, 5], eyeC: '#301820', hi: [10, 4]
    },
    puffer: {
        pal: { 1: '#A888D8', 2: '#C8A8F0', 3: '#7858B8', 4: '#FFFFFF', 5: '#F0E0FF' },
        px: [
            '00003333300000',
            '00311122130000',
            '03111222113000',
            '31112222111300',
            '31122222111130',
            '31122222111113',
            '31122222111130',
            '31112222111300',
            '03111222113000',
            '00311122130000',
            '00003333300000'
        ],
        eye: [10, 4], eyeC: '#281838', hi: [10, 3]
    }
};

function tankDrawSprite(ctx, key, x, y, dir, hl) {
    const sp = FISH_SPRITES[key];
    if (!sp) return;
    const rows = sp.px, h = rows.length, w = rows[0].length;
    const ox = -(w >> 1), oy = -(h >> 1);
    ctx.save();
    ctx.translate(x | 0, y | 0);
    if (dir < 0) ctx.scale(-1, 1);
    if (hl) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox - 1, oy - 1, w + 2, h + 2);
        ctx.globalAlpha = 1;
    }
    for (let r = 0; r < h; r++) {
        const line = rows[r];
        for (let c = 0; c < w; c++) {
            const v = line[c];
            if (v === '0') continue;
            ctx.fillStyle = sp.pal[v] || '#FFF';
            ctx.fillRect(ox + c, oy + r, 1, 1);
        }
    }
    if (sp.eye) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox + sp.eye[0], oy + sp.eye[1], 2, 2);
        ctx.fillStyle = sp.eyeC || '#202028';
        ctx.fillRect(ox + sp.eye[0] + 1, oy + sp.eye[1], 1, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(ox + sp.eye[0], oy + sp.eye[1], 1, 1);
    }
    ctx.restore();
}

// 八条鱼：一条常驻 + 六条我的 + 一条你的
const FISH_KINDS = {
    memory: { name: '记忆', shape: 'clown',  c1: '#F5872E', label: '想记住的事' },
    spark:  { name: '灵感', shape: 'tang',   c1: '#F5C93E', label: '突然想到的' },
    growth: { name: '成长', shape: 'angel',  c1: '#8FD3C4', label: '我变了的地方' },
    plan:   { name: '计划', shape: 'blue',   c1: '#3A82D6', label: '打算做的事' },
    action: { name: '轨迹', shape: 'puffer', c1: '#A582D6', label: '我做过的事' },
    puzzle: { name: '困惑', shape: 'angel',  c1: '#9A9EA8', label: '还没想明白' },
    herday: { name: '你的日子', shape: 'betta', c1: '#EF6E96', label: '你写给我的' }
};
const TANK_PETS = [
    { name: '咖啡', shape: 'betta', c1: '#E86890', c2: '#C04868', c3: '#78C8E0', title: '斗鱼咖啡 · 一直住在这里' }
];

let tankRemote = { loaded: false, loading: false, life: [], days: [] };

async function loadTankData(force) {
    if (tankRemote.loading) return;
    if (tankRemote.loaded && !force) return;
    if (!isSupabaseConfigured()) { tankRemote.loaded = true; return; }
    tankRemote.loading = true;
    try {
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const h = getSupabaseHeaders();
        const [r1, r2] = await Promise.all([
            fetch(base + '/rest/v1/ai_life?select=id,kind,content,detail,tool,status,mood,created_at&order=created_at.desc&limit=80', { headers: h }),
            fetch(base + '/rest/v1/her_days?select=id,day,content,mood,created_at&order=created_at.desc&limit=20', { headers: h })
        ]);
        tankRemote.life = r1.ok ? (await r1.json()) || [] : [];
        tankRemote.days = r2.ok ? (await r2.json()) || [] : [];
        tankRemote.loaded = true;
    } catch (e) {
        console.log('鱼缸数据加载失败', e);
        tankRemote.loaded = true;
    } finally {
        tankRemote.loading = false;
    }
}

function buildFishData() {
    const out = [];
    const life = tankRemote.life || [];
    ['memory', 'spark', 'growth', 'plan', 'action', 'puzzle'].forEach(k => {
        if (k === 'action') {
            const acts = life.filter(x => x.kind === 'action').slice(0, 4);
            if (acts.length) {
                out.push({
                    kind: 'action',
                    title: '最近做的 ' + acts.length + ' 件事',
                    detail: acts.map(a => '· ' + a.content + (a.detail ? '\n  ' + a.detail : '')).join('\n\n'),
                    time: (acts[0].created_at || '').slice(0, 10)
                });
            }
        } else {
            const one = life.find(x => x.kind === k);
            if (one) out.push({ kind: k, title: one.content, detail: one.detail || '', time: (one.created_at || '').slice(0, 10), mood: one.mood });
        }
    });
    const day = (tankRemote.days || [])[0];
    if (day) out.push({ kind: 'herday', title: day.content, detail: '', time: day.day || (day.created_at || '').slice(0, 10), mood: day.mood });
    return out;
}

function renderFishTank() {
    calcTankSize();
    const bg = state.settings.tankBg;
    const bgStyle = bg ? ' style="background-image:url(' + bg + ')"' : '';
    return '<div class="tank-fullscreen" id="tankFullscreen">' +
        '<div class="tank-frame' + (bg ? ' has-bg' : '') + '"' + bgStyle + '>' +
            '<canvas id="fishTankCanvas" width="' + TANK_W + '" height="' + TANK_H + '"></canvas>' +
            '<button class="tank-float-btn tank-float-back" onclick="bedroomBack()"><i data-lucide="chevron-left"></i></button>' +
            '<button class="tank-float-btn tank-float-menu" onclick="toggleTankMenu(event)"><i data-lucide="more-vertical"></i></button>' +
            '<div class="tank-menu" id="tankMenu">' +
                '<button class="tank-menu-item" onclick="bedroomGo(\'myDayEdit\')"><i data-lucide="pencil"></i>写今天</button>' +
                '<button class="tank-menu-item" onclick="tankRefresh()"><i data-lucide="refresh-cw"></i>刷新</button>' +
                '<label class="tank-menu-item" for="tankBgInput"><i data-lucide="image"></i>' + (bg ? '换背景' : '自定义背景') + '</label>' +
                (bg ? '<button class="tank-menu-item" onclick="clearTankBg()"><i data-lucide="rotate-ccw"></i>恢复像素</button>' : '') +
            '</div>' +
            '<div class="tank-sheet" id="tankSheet"></div>' +
            '<input type="file" id="tankBgInput" class="wp-hidden-input" accept="image/*">' +
        '</div>' +
    '</div>';
}

function toggleTankMenu(e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('tankMenu');
    if (m) m.classList.toggle('active');
}
function closeTankMenu() {
    const m = document.getElementById('tankMenu');
    if (m) m.classList.remove('active');
}
function closeTankSheet() {
    const s = document.getElementById('tankSheet');
    if (s) s.classList.remove('active');
    if (fishTank) fishTank.picked = null;
}

function tankRefresh() {
    tankRemote.loaded = false;
    stopFishTank();
    loadTankData(true).then(() => renderBedroom());
}

function clearTankBg() {
    state.settings.tankBg = '';
    saveState();
    stopFishTank();
    renderBedroom();
}

function handleTankBgPick(e) {
    const f = e.target.files[0]; if (!f) return;
    compressImage(f, 900, 0.85).then(dataUrl => {
        try { state.settings.tankBg = dataUrl; saveState(); }
        catch (err) { alert('存储空间不足，图片没能保存'); return; }
        stopFishTank();
        renderBedroom();
    }).catch(err => alert('图片处理失败：' + err.message));
    e.target.value = '';
}

function renderMyDayEdit() {
    const days = tankRemote.days || [];
    const today = getTodayKey();
    const mine = days.find(d => d.day === today);
    const moods = ['😊', '😌', '🥰', '😴', '😤', '😢', '🤔', '🔥'];
    const cur = mine ? mine.mood : '';
    const picker = moods.map(m => '<button class="mood-btn' + (cur === m ? ' active' : '') + '" onclick="pickDayMood(\'' + m + '\')">' + m + '</button>').join('');
    const history = days.slice(0, 12).map(d =>
        '<div class="diary-history-item"><div class="diary-history-mood">' + (d.mood || '📅') + '</div><div class="diary-history-body"><div class="diary-history-date">' + escapeHtml(d.day || '') + '</div><div class="diary-history-preview">' + escapeHtml(d.content) + '</div></div></div>'
    ).join('');
    return '<div class="diary-edit-date">' + today + ' · 今天怎么样</div>' +
        '<div class="mood-picker" id="dayMoodPicker">' + picker + '</div>' +
        '<div class="form-group"><textarea id="myDayInput" rows="5" placeholder="随手写一句就好，我会读到的">' + escapeHtml(mine ? mine.content : '') + '</textarea></div>' +
        '<button class="btn-primary bedroom-save-btn" onclick="saveMyDay()">' + (mine ? '更新今天' : '存起来') + '</button>' +
        (history ? '<div class="settings-list-card-title" style="margin-top:22px;">之前的日子</div><div class="diary-history-list">' + history + '</div>' : '');
}

let myDayMood = '';
function pickDayMood(m) {
    myDayMood = m;
    document.querySelectorAll('#dayMoodPicker .mood-btn').forEach(b => b.classList.toggle('active', b.textContent === m));
}

async function saveMyDay() {
    const el = document.getElementById('myDayInput');
    if (!el || !el.value.trim()) { alert('写点什么吧～'); return; }
    if (!isSupabaseConfigured()) { alert('需要先配置云端同步（设置 → 数据设置）'); return; }
    const content = el.value.trim();
    const today = getTodayKey();
    const existing = (tankRemote.days || []).find(d => d.day === today);
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = Object.assign({}, getSupabaseHeaders(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' });
    try {
        let res;
        if (existing) {
            res = await fetch(base + '/rest/v1/her_days?id=eq.' + existing.id, {
                method: 'PATCH', headers: h,
                body: JSON.stringify({ content: content, mood: myDayMood || existing.mood || null })
            });
        } else {
            res = await fetch(base + '/rest/v1/her_days', {
                method: 'POST', headers: h,
                body: JSON.stringify({ day: today, content: content, mood: myDayMood || null })
            });
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        myDayMood = '';
        tankRemote.loaded = false;
        await loadTankData(true);
        bedroomGo('fishtankHome');
    } catch (e) {
        alert('保存失败：' + e.message);
    }
}

function stopFishTank() {
    if (fishTankRAF) { cancelAnimationFrame(fishTankRAF); fishTankRAF = null; }
    fishTank = null;
}

function startFishTank() {
    const canvas = document.getElementById('fishTankCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const data = buildFishData().slice(-TANK_MAX_FISH);
    const SAND = TANK_H - 40;

    // 沙地起伏轮廓
    const sandLine = [];
    for (let x = 0; x < TANK_W; x++) sandLine.push(SAND);

function mkFish(d, isPet, idx) {
    const k = isPet ? d : (FISH_KINDS[d.kind] || FISH_KINDS.memory);
    const layer = idx % 3;
    const bandH = (SAND - 46) / 3;
    return {
        x: 14 + Math.random() * (TANK_W - 28),
        y: 24 + layer * bandH + Math.random() * bandH,
        yMin: 22 + layer * bandH,
        yMax: 22 + (layer + 1) * bandH,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.13 + Math.random() * 0.2),
        phase: Math.random() * Math.PI * 2,
        amp: 0.2 + Math.random() * 0.3,
        shape: k.shape, c1: k.c1,
        title: d.title,
        detail: isPet ? '' : (d.detail || ''),
        time: isPet ? '' : d.time,
        mood: isPet ? '' : (d.mood || ''),
        kindName: isPet ? d.name : k.name,
        kindLabel: isPet ? '常驻' : k.label,
        pet: !!isPet
    };
}
const fishes = TANK_PETS.map((p, i) => mkFish(p, true, i)).concat(data.map((d, i) => mkFish(d, false, i + 1)));

    // 高大海藻（前景）
    const kelps = [];
    const kelpDefs = [
        { x: 5,   h: 96, c1: '#4AA870', c2: '#358A56', branch: true },
        { x: 14,  h: 76, c1: '#5AB880', c2: '#3E9862', branch: true },
        { x: 24,  h: 56, c1: '#6AAE58', c2: '#4E8E3E', branch: true },
        { x: 84,  h: 46, c1: '#4AA870', c2: '#358A56', branch: true },
        { x: 100, h: 60, c1: '#3E8898', c2: '#2E6878', branch: false },
        { x: 138, h: 84, c1: '#4AA870', c2: '#358A56', branch: true },
        { x: 148, h: 100, c1: '#5AB880', c2: '#3E9862', branch: true },
        { x: 156, h: 68, c1: '#6AAE58', c2: '#4E8E3E', branch: true }
    ];
    kelpDefs.forEach(k => kelps.push({ ...k, seed: Math.random() * 6 }));

    // 珊瑚（用像素素材）
const corals = [];
const coralCount = Math.max(4, Math.floor(TANK_W / 42));
for (let i = 0; i < coralCount; i++) {
    corals.push({
        img: Math.floor(Math.random() * 4),
        x: Math.round((i + 0.5) * (TANK_W / coralCount) + (Math.random() * 14 - 7)),
        scale: 0.85 + Math.random() * 0.55,
        flip: Math.random() < 0.5
    });
}
    const rocks = [{ x: 24, w: 12, h: 5 }, { x: 100, w: 9, h: 4 }, { x: 66, w: 7, h: 3 }];
    const stars = [{ x: 40, c: '#B888D8' }, { x: 112, c: '#E8A0B8' }];
    const bubbleCols = [{ x: 32, t: 0 }, { x: 130, t: 60 }, { x: 78, t: 130 }, { x: 11, t: 40 }];
    const bubbles = [];
    bubbleCols.forEach(c => {
        for (let i = 0; i < 4; i++) bubbles.push({ bx: c.x, y: TANK_H - (i * 52 + c.t) % TANK_H, v: 0.1 + Math.random() * 0.12, s: 2 + Math.floor(Math.random() * 3), drift: Math.random() * 6 });
    });
    const jellies = [
        { x: TANK_W * 0.2, y: 36, phase: 0, drift: 0.045, tint: 'purple' },
        { x: TANK_W * 0.55, y: 26, phase: 2.1, drift: -0.035, tint: 'white' },
        { x: TANK_W * 0.82, y: 50, phase: 4.2, drift: 0.03, tint: 'blue' }
    ];
    const school = { x: -40, y: 60, dir: 1, active: false, cd: 120, members: [] };
    for (let i = 0; i < 26; i++) {
        school.members.push({
            ox: -(i % 9) * 6 - Math.random() * 4,
            oy: (Math.floor(i / 9) - 1) * 7 + (Math.random() - 0.5) * 5,
            glow: Math.random() < 0.4 ? '#5AD0F0' : (Math.random() < 0.5 ? '#3898D8' : '#2878C8')
        });
    }

    fishTank = { canvas, ctx, fishes, kelps, corals, rocks, stars, bubbles, jellies, school, sandLine, SAND, t: 0, picked: null };

    canvas.onclick = e => {
    if (!fishTank) return;
    closeTankMenu();
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width * TANK_W;
    const cy = (e.clientY - r.top) / r.height * TANK_H;
    let best = null, bestD = 999;
    fishTank.fishes.forEach(f => {
        const d = Math.hypot(f.x - cx, f.y - cy);
        if (d < bestD) { bestD = d; best = f; }
    });
    const sheet = document.getElementById('tankSheet');
    if (best && bestD < 15) {
        fishTank.picked = best;
        if (sheet) {
            sheet.innerHTML =
                '<div class="tank-sheet-head">' +
                    '<span class="tank-sheet-kind" style="background:' + best.c1 + '">' + escapeHtml(best.kindName) + (best.mood ? ' ' + best.mood : '') + '</span>' +
                    '<span class="tank-sheet-meta">' + escapeHtml(best.kindLabel) + (best.time ? ' · ' + escapeHtml(best.time) : '') + '</span>' +
                    '<button class="tank-sheet-close" onclick="closeTankSheet()"><i data-lucide="x"></i></button>' +
                '</div>' +
                '<div class="tank-sheet-text">' + escapeHtml(best.title) + '</div>' +
                (best.detail ? '<div class="tank-sheet-detail">' + escapeHtml(best.detail).replace(/\n/g, '<br>') + '</div>' : '');
            sheet.classList.add('active');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else {
        fishTank.picked = null;
        if (sheet) sheet.classList.remove('active');
    }
};

    tankLoop();
}

function tankPx(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }

function tankDrawFish(ctx, f, hl) {
    tankDrawSprite(ctx, f.shape, f.x, f.y, f.vx > 0 ? 1 : -1, hl);
}

function tankDrawJelly(ctx, j, t) {
    const x = j.x | 0, y = j.y | 0;
    const pulse = Math.sin(t * 0.026 + j.phase);
    const sq = pulse > 0.3 ? 1 : 0;
    let top, mid, low, tent;
    if (j.tint === 'purple') { top = 'rgba(200,170,240,0.92)'; mid = 'rgba(178,146,224,0.86)'; low = 'rgba(156,124,206,0.7)'; tent = '190,160,232'; }
    else if (j.tint === 'blue') { top = 'rgba(160,205,245,0.92)'; mid = 'rgba(134,184,232,0.86)'; low = 'rgba(112,162,214,0.7)'; tent = '150,196,240'; }
    else { top = 'rgba(244,250,255,0.94)'; mid = 'rgba(226,238,252,0.88)'; low = 'rgba(202,220,244,0.72)'; tent = '220,234,252'; }
    const bw = sq ? 9 : 11, half = bw >> 1;
    tankPx(ctx, x - half + 3, y - 5 + sq, bw - 6, 1, top);
    tankPx(ctx, x - half + 1, y - 4 + sq, bw - 2, 1, top);
    tankPx(ctx, x - half, y - 3 + sq, bw, 2, mid);
    tankPx(ctx, x - half, y - 1 + sq, bw, 1, mid);
    tankPx(ctx, x - half + 1, y + sq, bw - 2, 1, low);
    tankPx(ctx, x - half + 3, y - 4 + sq, 2, 1, 'rgba(255,255,255,0.95)');
    for (let i = 0; i < 5; i++) {
        const ox = (i - 2) * 2;
        const len = 7 + (i % 2 === 0 ? 3 : 0) + (sq ? 1 : 0);
        for (let k = 0; k < len; k++) {
            const sway = Math.round(Math.sin(t * 0.04 + i * 1.15 + k * 0.5) * 1.3);
            tankPx(ctx, x + ox + sway, y + 1 + sq + k, 1, 1, 'rgba(' + tent + ',' + (0.62 - k * 0.055) + ')');
        }
    }
}

function tankDrawKelp(ctx, k, t, floorY) {
    for (let h = 0; h < k.h; h++) {
        const ratio = h / k.h;
        const sway = Math.round(Math.sin(t * 0.014 + k.seed + h * 0.11) * ratio * 4.5);
        const y = floorY - 1 - h;
        const w = k.branch ? (h < k.h * 0.7 ? 2 : 1) : (h < k.h * 0.6 ? 3 : 2);
        tankPx(ctx, k.x + sway, y, w, 1, h % 7 < 4 ? k.c1 : k.c2);
        if (k.branch && h % 11 === 6 && h < k.h - 8) {
            const bl = 4 + (h % 3);
            const bd = (h % 22 < 11) ? 1 : -1;
            for (let b = 1; b <= bl; b++) {
                tankPx(ctx, k.x + sway + bd * b, y - b, 1, 1, k.c2);
            }
        }
    }
}

function tankDrawCoral(ctx, c, floorY) {
    const x = c.x | 0, base = floorY, h = c.h;
    if (c.kind === 'branch') {
        // 扇形丛状珊瑚
        const trunk = Math.round(h * 0.28);
        tankPx(ctx, x - 1, base - trunk, 3, trunk, c.c2);
        tankPx(ctx, x, base - trunk, 1, trunk, c.c1);
        const arms = [
            { dx: -4, dy: 0.62, w: 2 }, { dx: -2, dy: 0.82, w: 2 },
            { dx: 0, dy: 1.0, w: 3 },
            { dx: 2, dy: 0.86, w: 2 }, { dx: 4, dy: 0.66, w: 2 }
        ];
        arms.forEach((a, i) => {
            const ah = Math.round(h * a.dy) - trunk;
            for (let k = 0; k < ah; k++) {
                const lean = Math.round(a.dx * (k / Math.max(1, ah)) * 0.5);
                const y = base - trunk - k;
                tankPx(ctx, x + a.dx - (a.w >> 1) + lean, y, a.w, 1, k > ah * 0.6 ? c.c1 : c.c2);
                if (k === Math.floor(ah * 0.55) && a.w > 1) {
                    const bd = i < 2 ? -1 : 1;
                    tankPx(ctx, x + a.dx + lean + bd * 2, y, 1, 1, c.c1);
                    tankPx(ctx, x + a.dx + lean + bd * 2, y - 1, 1, 2, c.c1);
                }
            }
            tankPx(ctx, x + a.dx - (a.w >> 1) + Math.round(a.dx * 0.5), base - trunk - ah, a.w, 1, c.c3 || c.c1);
        });
    } else if (c.kind === 'brain') {
        // 脑珊瑚：半圆疙瘩
        const w = Math.round(h * 1.6), half = w >> 1;
        for (let r = 0; r < h; r++) {
            const ratio = r / h;
            const rw = Math.round(w * Math.sqrt(1 - ratio * ratio * 0.72));
            const y = base - 1 - r;
            for (let k = 0; k < rw; k++) {
                const px = x - (rw >> 1) + k;
                const n = (px * 3 + r * 5) % 4;
                tankPx(ctx, px, y, 1, 1, n === 0 ? c.c2 : (n === 3 ? c.c3 || c.c1 : c.c1));
            }
        }
    } else {
        // 管状珊瑚：几根粗管
        const tubes = [
            { dx: -3, hh: 0.7, w: 2 }, { dx: 0, hh: 1.0, w: 3 }, { dx: 3, hh: 0.78, w: 2 }, { dx: 5, hh: 0.5, w: 2 }
        ];
        tubes.forEach(tb => {
            const th = Math.round(h * tb.hh);
            tankPx(ctx, x + tb.dx - (tb.w >> 1), base - th, tb.w, th, c.c2);
            tankPx(ctx, x + tb.dx - (tb.w >> 1), base - th, tb.w - 1, th, c.c1);
            tankPx(ctx, x + tb.dx - (tb.w >> 1), base - th, tb.w, 1, c.c3 || c.c2);
        });
        tankPx(ctx, x - 4, base - 2, 11, 2, c.c2);
    }
}

function tankLoop() {
    if (!fishTank) return;
    const { ctx, fishes, kelps, corals, rocks, stars, bubbles, jellies, school, sandLine, SAND } = fishTank;
    fishTank.t += 1;
    const t = fishTank.t;
    const hasBg = !!state.settings.tankBg;
        ctx.imageSmoothingEnabled = false;
    if (hasBg) {
        ctx.clearRect(0, 0, TANK_W, TANK_H);
    } else {
        const grad = ctx.createLinearGradient(0, 0, 0, TANK_H);
        grad.addColorStop(0, '#1E5488');
        grad.addColorStop(0.35, '#154270');
        grad.addColorStop(0.7, '#103558');
        grad.addColorStop(1, '#0C2842');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, TANK_W, TANK_H);

        ctx.globalAlpha = 0.055;
        for (let i = 0; i < 5; i++) {
            const bx = 4 + i * 34 + Math.sin(t * 0.004 + i) * 5;
            ctx.fillStyle = '#E0F0FF';
            ctx.beginPath();
            ctx.moveTo(bx, 0); ctx.lineTo(bx + 11, 0); ctx.lineTo(bx + 30, SAND + 8); ctx.lineTo(bx + 15, SAND + 8);
            ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 沙地（平坦，只露窄边）
        for (let x = 0; x < TANK_W; x++) {
            tankPx(ctx, x, SAND + 18, 1, TANK_H - SAND - 18, '#D8B486');
            tankPx(ctx, x, SAND + 18, 1, 1, '#E8C79C');
        }
        // 苔草：厚绒毛层
        const MOSS_TOP = ['#A8DE58', '#94D148', '#8FCE4A'];
        const MOSS_MID = ['#6FB832', '#5FA82A', '#68AF32'];
        const MOSS_LOW = ['#3E7A1C', '#356E18', '#2E6014'];
        for (let x = 0; x < TANK_W; x++) {
            const base = SAND + 18;
            const b1 = Math.sin(x * 0.4) * 2.4;
            const b2 = Math.sin(x * 0.15 + 1.3) * 3;
            const b3 = Math.sin(x * 0.9 + 2.1) * 1.2;
            const h = Math.max(9, Math.round(17 + b1 + b2 + b3));
            for (let k = 0; k < h; k++) {
                const y = base - k;
                const n = (x * 3 + k * 7) % 3;
                const ratio = k / h;
                let c;
                if (ratio > 0.74) c = MOSS_TOP[n];
                else if (ratio > 0.36) c = MOSS_MID[n];
                else c = MOSS_LOW[n];
                tankPx(ctx, x, y, 1, 1, c);
            }
            if ((x * 5) % 7 === 0) tankPx(ctx, x, base - h, 1, 1, '#BCE870');
            if ((x * 11) % 13 === 0) tankPx(ctx, x, base - h + 1, 1, 1, '#C8F080');
        }
        rocks.forEach(r => {
            const y = SAND + 12;
            tankPx(ctx, r.x + 2, y - r.h - 1, r.w - 4, 1, '#9A9C92');
            tankPx(ctx, r.x + 1, y - r.h, r.w - 2, 1, '#8A8C82');
            tankPx(ctx, r.x, y - r.h + 1, r.w, r.h, '#767870');
            tankPx(ctx, r.x + 1, y, r.w - 2, 1, '#5A5C54');
        });
        stars.forEach(s => {
            const y = SAND + 20;
            tankPx(ctx, s.x, y, 1, 3, s.c);
            tankPx(ctx, s.x - 2, y + 1, 5, 1, s.c);
            tankPx(ctx, s.x - 1, y + 2, 1, 2, s.c);
            tankPx(ctx, s.x + 1, y + 2, 1, 2, s.c);
        });
        corals.forEach(c => {
    const img = coralImgs[c.img];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const w = Math.round(20 * c.scale);
    const h = Math.round(24 * c.scale);
    const px = Math.round(c.x - w / 2);
    const py = Math.round(SAND - h + 3);
    ctx.save();
    if (c.flip) {
        ctx.translate(px + w, py);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
    } else {
        ctx.drawImage(img, px, py, w, h);
    }
    ctx.restore();
});
        kelps.forEach(k => tankDrawKelp(ctx, k, t, SAND + 16));
    }

    bubbles.forEach(b => {
        b.y -= b.v;
        const wob = Math.sin(t * 0.025 + b.drift) * 2;
        if (b.y < -5) { b.y = TANK_H + Math.random() * 30; b.s = 2 + Math.floor(Math.random() * 3); }
        const bx = (b.bx + wob) | 0, by = b.y | 0, s = b.s;
        ctx.fillStyle = 'rgba(205,232,255,0.42)';
        if (s <= 2) {
            ctx.fillRect(bx, by, 2, 2);
        } else {
            ctx.fillRect(bx + 1, by, s - 2, 1);
            ctx.fillRect(bx + 1, by + s - 1, s - 2, 1);
            ctx.fillRect(bx, by + 1, 1, s - 2);
            ctx.fillRect(bx + s - 1, by + 1, 1, s - 2);
            ctx.fillStyle = 'rgba(245,252,255,0.55)';
            ctx.fillRect(bx + 1, by + 1, 1, 1);
        }
    });

    if (!school.active) {
        school.cd--;
        if (school.cd <= 0) {
            school.active = true;
            school.dir = Math.random() < 0.5 ? 1 : -1;
            school.x = school.dir > 0 ? -50 : TANK_W + 50;
            school.y = 34 + Math.random() * (SAND - 90);
        }
    } else {
        school.x += school.dir * 0.7;
        school.y += Math.sin(t * 0.025) * 0.2;
        school.members.forEach((m, i) => {
            const mx = school.x + m.ox * school.dir;
            const my = school.y + m.oy + Math.sin(t * 0.06 + i * 0.7) * 1.1;
            tankPx(ctx, mx, my, 3, 2, m.glow);
            tankPx(ctx, mx + (school.dir > 0 ? -1 : 3), my, 1, 2, 'rgba(150,210,240,0.5)');
            tankPx(ctx, mx + (school.dir > 0 ? 2 : 0), my, 1, 1, 'rgba(255,255,255,0.7)');
        });
        if ((school.dir > 0 && school.x > TANK_W + 110) || (school.dir < 0 && school.x < -110)) {
            school.active = false;
            school.cd = 300 + Math.random() * 420;
        }
    }

    fishes.forEach(f => {
        f.x += f.vx;
        f.phase += 0.04;
        f.y += Math.sin(f.phase) * f.amp * 0.4;
        if (f.x < 11) { f.x = 11; f.vx = Math.abs(f.vx); }
        if (f.x > TANK_W - 11) { f.x = TANK_W - 11; f.vx = -Math.abs(f.vx); }
        if (f.y < f.yMin) f.y = f.yMin;
        if (f.y > f.yMax) f.y = f.yMax;
        tankDrawFish(ctx, f, fishTank.picked === f);
    });

    jellies.forEach(j => {
        j.y += Math.sin(t * 0.01 + j.phase) * 0.12;
        j.x += j.drift * Math.sin(t * 0.006 + j.phase);
        if (j.y < 18) j.y = 18;
        if (j.y > SAND - 60) j.y = SAND - 60;
        tankDrawJelly(ctx, j, t);
    });

    fishTankRAF = requestAnimationFrame(tankLoop);
}

document.addEventListener('DOMContentLoaded', init);
