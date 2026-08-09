// ===== Settings Panel =====
let settingsView = 'main'; let editingProviderId = null; let settingsPrevView = 'main';

function openSettingsPanel() { settingsView = 'main'; settingsPrevView = 'main'; editingProviderId = null; renderSettingsView(); document.getElementById('settingsOverlay').classList.add('active'); }
function closeSettingsPanel() { document.getElementById('settingsOverlay').classList.remove('active'); }

function renderSettingsView() {
    const content = document.getElementById('settingsContent'); const footer = document.getElementById('settingsFooter');
    const title = document.getElementById('settingsTitle'); const backBtn = document.getElementById('settingsBackBtn');
    if (settingsView === 'main') {
        title.textContent = '设置'; backBtn.style.display = 'none';
        content.innerHTML = renderMainSettings();
        footer.innerHTML = '';
        content.classList.remove('settings-slide-in');
    }
    else if (settingsView === 'provider-detail') {
        const p = state.providers.find(x => x.id === editingProviderId);
        title.textContent = p ? '编辑供应商' : '添加供应商'; backBtn.style.display = 'flex';
        content.innerHTML = renderProviderDetail(p);
        footer.innerHTML = '<button class="btn-primary" onclick="saveProviderDetail()">保存供应商</button>';
        content.classList.remove('settings-slide-in'); void content.offsetWidth; content.classList.add('settings-slide-in');
    }
    else {
        const pages = {
            'appearance': ['外观', renderAppearancePage],
            'message-display': ['消息显示', renderMessageDisplayPage],
            'plugins': ['插件管理', renderPluginsPage],
            'assistant': ['助手', renderAssistantDetail],
            'providers': ['供应商', renderProvidersPage],
            'models': ['模型选择', renderModelsPage],
            'cloud-sync': ['云端同步', renderCloudSync],
            'profile': ['个人信息', renderProfileDetail]
        };
        const page = pages[settingsView];
        if (page) {
            title.textContent = page[0]; backBtn.style.display = 'flex';
            content.innerHTML = page[1]();
            footer.innerHTML = '';
            content.classList.remove('settings-slide-in'); void content.offsetWidth; content.classList.add('settings-slide-in');
        }
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function settingsGo(v) { settingsPrevView = settingsView; settingsView = v; renderSettingsView(); }

const PLUGIN_DEFS = [
    { id: 'webSearchPlugin', name: '联网搜索', desc: '让助手可以搜索实时信息' },
    { id: 'voiceInput', name: '语音输入', desc: '使用麦克风将语音转成文字' },
    { id: 'stickerPanel', name: '表情面板', desc: '发送消息时插入可爱表情' }
];

function renderMainSettings() {
    const theme = state.settings.theme || 'system';
    const themeLabels = { system: '跟随系统', light: '浅色', dark: '深色' };
    const themeOpts = [['system','跟随系统'],['light','浅色'],['dark','深色']].map(([v,l]) => '<option value="' + v + '"' + (theme === v ? ' selected' : '') + '>' + l + '</option>').join('');
    return settingsGroup('通用设置', [
        settingsEntry('sun', '颜色模式', themeLabels[theme] || '跟随系统', '<select class="settings-inline-select" id="themeModeSelect">' + themeOpts + '</select>'),
        settingsEntry('palette', '外观', '主题色、壁纸、字体', settingsChevron(), "settingsGo('appearance')"),
        settingsEntry('layout', '消息显示', '气泡、token、思维链', settingsChevron(), "settingsGo('message-display')"),
        settingsEntry('puzzle', '插件管理', '联网搜索、语音、表情', settingsChevron(), "settingsGo('plugins')"),
        settingsEntry('bot', '助手', '设置AI助手人设', settingsChevron(), "settingsGo('assistant')")
    ]) + settingsGroup('模型与服务', [
        settingsEntry('cloud', '供应商', '配置AI供应商', settingsChevron(), "settingsGo('providers')"),
        settingsEntry('cpu', '模型选择', '选择默认模型', settingsChevron(), "settingsGo('models')"),
        settingsEntry('globe', '搜索服务', '敬请期待', settingsChevron(), 'settingsComingSoon()'),
        settingsEntry('blocks', 'MCP配置', '敬请期待', settingsChevron(), 'settingsComingSoon()')
    ]) + settingsGroup('数据', [
        settingsEntry('download', '数据导出', '导出全部聊天与设置', settingsChevron(), 'exportData()'),
        settingsEntry('upload', '数据导入', '从备份文件恢复', settingsChevron(), "document.getElementById('importFileInput').click()"),
        settingsEntry('cloud', '云端同步', 'Supabase配置', settingsChevron(), "settingsGo('cloud-sync')"),
        settingsEntry('user', '个人信息', '用户名、头像', settingsChevron(), "settingsGo('profile')")
    ]) + '<input type="file" id="importFileInput" accept=".json" hidden>';
}

function settingsGroup(title, rows) {
    return '<div class="settings-group-title">' + title + '</div><div class="settings-list-card">' + rows.join('') + '</div>';
}
function settingsChevron() { return '<i data-lucide="chevron-right" class="settings-entry-chevron"></i>'; }
function settingsEntry(icon, title, sub, right, onclick) {
    return '<div class="settings-entry-row' + (onclick ? ' settings-entry-click' : '') + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' +
        '<div class="settings-entry-icon"><i data-lucide="' + icon + '"></i></div>' +
        '<div class="settings-entry-info"><div class="settings-entry-title">' + title + '</div>' + (sub ? '<div class="settings-entry-sub">' + sub + '</div>' : '') + '</div>' +
        '<div class="settings-entry-right">' + (right || '') + '</div></div>';
}
function settingsComingSoon() { showToast('敬请期待'); }

// ===== 设置详情页 =====
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

function renderAppearancePage() {
    const fontOpts = [['default','默认'],['rounded','圆体'],['handwriting','手写体'],['mono','等宽']].map(([v,l]) => '<option value="' + v + '"' + (state.settings.fontFamily === v ? ' selected' : '') + '>' + l + '</option>').join('');
    return '<div class="settings-detail-section-title">主题色</div>' +
        '<div class="settings-list-card"><div class="theme-swatch-grid">' + renderThemeSwatches() + '</div></div>' +
        '<div class="settings-detail-section-title">图片与壁纸</div>' +
        '<div class="settings-list-card">' +
            wallpaperRow('wallpaper', '聊天壁纸', state.settings.wallpaper) +
            wallpaperRow('homeWallpaper', '小家背景', state.settings.homeWallpaper) +
            wallpaperRow('sidebarImage', '侧边栏插图', state.settings.sidebarImage) +
            wallpaperRow('inputImage', '输入框插图', state.settings.inputImage) +
        '</div>' +
        '<div class="settings-detail-section-title">文字与字体</div>' +
        '<div class="settings-list-card">' +
            '<div class="settings-row"><span class="settings-row-label">自定义字体</span><select id="fontFamilySelect" class="settings-select">' + fontOpts + '</select></div>' +
            '<div class="settings-row"><span class="settings-row-label">字体大小：<span id="fontSizeDisplay">' + getFontSizeLabel(state.settings.fontSize) + '</span></span></div>' +
            '<div class="settings-row" style="border-bottom:none;"><input type="range" id="fontSize" min="12" max="20" value="' + (state.settings.fontSize || 15) + '" style="width:100%;"></div>' +
        '</div>' +
        '<div class="settings-detail-section-title">天气配置</div>' +
        '<div class="settings-list-card">' +
            '<div class="settings-row"><span class="settings-row-label">和风天气 Key</span><input type="password" id="weatherKeyInput" class="settings-input-inline" placeholder="留空=不启用" value="' + escapeHtml((state.settings.weather && state.settings.weather.key) || '') + '"></div>' +
            '<div class="settings-row"><span class="settings-row-label">城市 / LocationID</span><input type="text" id="weatherLocInput" class="settings-input-inline" placeholder="如 101180901" value="' + escapeHtml((state.settings.weather && state.settings.weather.location) || '') + '"></div>' +
            '<div class="settings-row" style="border-bottom:none;"><span class="settings-row-label">API Host</span><input type="text" id="weatherHostInput" class="settings-input-inline" placeholder="devapi.qweather.com" value="' + escapeHtml((state.settings.weather && state.settings.weather.host) || '') + '"></div>' +
        '</div>';
}

function renderMessageDisplayPage() {
    return '<div class="settings-detail-section-title">消息显示</div>' +
        '<div class="settings-list-card">' +
            toggleRow('glassMode', '玻璃拟态（气泡/输入栏/顶栏半透明）', !!state.settings.glassMode) +
            toggleRow('showTokenUsage', '显示token用量和上下文消息统计', state.settings.showTokenUsage !== false) +
            toggleRow('showThinking', '显示思考内容（默认展开并显示）', state.settings.showThinking !== false) +
            toggleRow('autoCollapseThinking', '自动折叠思考（思考完成后自动折叠）', !!state.settings.autoCollapseThinking) +
            toggleRow('renderMath', '渲染数学表达式或公式', !!state.settings.renderMath) +
        '</div>';
}

function renderPluginsPage() {
    const rows = PLUGIN_DEFS.map(p => {
        const on = state.settings.plugins && state.settings.plugins[p.id] !== false;
        return '<div class="settings-row"><div class="settings-entry-info"><div class="settings-entry-title">' + p.name + '</div><div class="settings-entry-sub">' + p.desc + '</div></div><label class="switch"><input type="checkbox" class="plugin-toggle" data-plugin="' + p.id + '"' + (on ? ' checked' : '') + '><span class="switch-slider"></span></label></div>';
    }).join('');
    return '<div class="settings-detail-section-title">插件</div>' + '<div class="settings-list-card">' + rows + '</div>';
}

function renderProvidersPage() {
    let cards = state.providers.map(p => {
        const active = p.id === state.activeProviderId;
        return '<div class="provider-card' + (active ? ' active' : '') + '"><div class="provider-card-left"><div class="provider-card-icon"><i data-lucide="cloud"></i></div><div class="provider-card-info"><div class="provider-card-name">' + escapeHtml(p.name) + '</div><div class="provider-card-url">' + escapeHtml(p.apiBase || '未配置') + '</div></div></div><div class="provider-card-actions"><button onclick="event.stopPropagation();setActiveProvider(\'' + p.id + '\')" title="设为当前"><i data-lucide="' + (active ? 'check-circle' : 'circle') + '"></i></button><button onclick="event.stopPropagation();editProvider(\'' + p.id + '\')" title="编辑"><i data-lucide="pencil"></i></button><button onclick="event.stopPropagation();deleteProvider(\'' + p.id + '\')" title="删除"><i data-lucide="trash-2"></i></button></div></div>';
    }).join('');
    cards += '<div class="add-provider-btn" onclick="addNewProvider()"><i data-lucide="plus"></i> 添加供应商</div>';
    return '<div class="settings-detail-section-title">供应商列表</div>' + cards;
}

function renderModelsPage() {
    return '<div class="settings-detail-section-title">默认模型</div>' +
        '<div class="settings-list-card">' +
            '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;border-bottom:none;"><span class="settings-row-label">当前模型</span><input type="text" id="modelInput" placeholder="输入或选择模型名称" value="' + escapeHtml(state.settings.model || '') + '"></div>' +
        '</div>' +
        '<button class="btn-secondary" style="width:100%;justify-content:center;margin:12px 0;" id="fetchModelsBtn"><i data-lucide="refresh-cw" style="width:13px;height:13px;margin-right:4px;"></i>获取模型列表</button>' +
        '<input type="text" class="model-search-input" id="modelSearchInput" placeholder="🔍 搜索模型..." style="display:none;">' +
        '<div class="model-list" id="modelList" style="display:none;"></div>';
}

function renderProfileDetail() {
    const name = state.settings.userName || '郑郑';
    const avatar = state.settings.userAvatar || '';
    return '<div class="settings-detail-section-title">个人信息</div>' +
        '<div class="settings-list-card">' +
            '<div class="settings-row" style="justify-content:center;border-bottom:none;padding:20px 16px;"><div style="text-align:center;"><div class="edit-user-avatar" id="profileAvatarDisplay">' + (avatar ? '<img src="' + avatar + '">' : '<i data-lucide="moon"></i>') + '</div><div style="margin-top:10px;"><button class="btn-secondary" id="changeProfileAvatarBtn" style="font-size:12px;">更换头像</button></div></div></div>' +
            '<div class="settings-row"><span class="settings-row-label">用户名</span><input type="text" id="profileNameInput" placeholder="输入用户名" value="' + escapeHtml(name) + '" style="width:150px;text-align:right;border:none;outline:none;background:transparent;padding:4px 0;"></div>' +
        '</div>' +
        '<button class="btn-primary" id="saveProfileBtn" style="width:100%;justify-content:center;margin-top:14px;">保存</button>' +
        '<input type="file" id="profileAvatarInput" accept="image/*" hidden>';
}
function saveProfileDetail() {
    const ni = document.getElementById('profileNameInput');
    if (ni) state.settings.userName = ni.value.trim() || '郑郑';
    saveState();
    applyUserName(); applyUserAvatar();
    renderSettingsView();
    showToast('已保存');
}

function renderAssistantDetail() {
    const n = state.settings.aiName || 'AI'; const av = state.settings.aiAvatar || ''; const t = state.settings.temperature || 0.7; const mt = state.settings.maxTokens || ''; const ctx = state.settings.contextCount || 50;
    const avHtml = av ? '<img src="' + av + '">' : '✦';
    const sp = state.settings.systemPrompt || ''; const rules = state.settings.regexRules || [];
    let rh = '<div class="regex-list" id="regexList">'; rules.forEach((rule, i) => { rh += '<div class="regex-item"><span class="regex-item-text">' + escapeHtml(rule) + '</span><button onclick="deleteRegexDetail(' + i + ')"><i data-lucide="x"></i></button></div>'; }); rh += '</div>';
    return '<div class="settings-detail-section-title">基础设定</div>' +
        '<div class="settings-list-card">' +
            '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;"><span class="settings-row-label">助手名称</span><input type="text" id="assistantNameInput" value="' + escapeHtml(n) + '" placeholder="给AI起个名字"></div>' +
            '<div class="settings-row" style="border-bottom:none;"><div class="settings-entry-info"><div class="settings-entry-title">助手头像</div><div class="settings-entry-sub">点击更换</div></div><div class="ai-avatar-preview" style="width:44px;height:44px;cursor:pointer;" onclick="document.getElementById(\'aiAvatarInputDetail\').click()">' + avHtml + '</div></div>' +
        '</div>' +
        '<div class="settings-list-card" style="margin-top:10px;">' +
            '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;"><span class="settings-row-label">Temperature：<span id="assistantTempDisplay">' + t + '</span></span><input type="range" id="assistantTemp" min="0" max="200" value="' + Math.round(t * 100) + '"></div>' +
            '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;"><span class="settings-row-label">Max Tokens <span style="font-size:11px;color:var(--text-light);">（留空=无限制）</span></span><input type="number" id="assistantMaxTokens" placeholder="无限制" value="' + (mt || '') + '"></div>' +
            '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;border-bottom:none;"><span class="settings-row-label">上下文消息数：<span id="assistantCtxDisplay">' + (ctx >= 50 ? '无限制' : ctx) + '</span></span><input type="range" id="assistantCtx" min="1" max="50" value="' + ctx + '"></div>' +
        '</div>' +
        '<div class="settings-detail-section-title">提示词</div>' +
        '<div class="settings-list-card">' +
            '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;"><span class="settings-row-label">System Prompt</span><textarea id="assistantSystemPrompt" class="system-prompt-textarea" rows="8" placeholder="设定AI的人设...">' + escapeHtml(sp) + '</textarea></div>' +
            '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;border-bottom:none;"><span class="settings-row-label">消息正则表达式</span>' + rh + '<div class="regex-add-row"><input type="text" id="regexNewInput" placeholder="输入正则表达式..."><button class="btn-secondary" onclick="addRegexDetail()">添加</button></div><div style="margin-top:8px;"><button class="btn-secondary" onclick="document.getElementById(\'regexFileInputDetail\').click()"><i data-lucide="upload" style="width:12px;height:12px;margin-right:4px;"></i>批量导入</button><input type="file" id="regexFileInputDetail" accept=".txt,.json" hidden></div></div>' +
        '</div>' +
        '<button class="btn-primary" style="width:100%;justify-content:center;margin-top:14px;" onclick="saveAssistantDetail()">保存设置</button>' +
        '<input type="file" id="aiAvatarInputDetail" accept="image/*" hidden>';
}
function addRegexDetail() { const i = document.getElementById('regexNewInput'); const v = i.value.trim(); if (!v) return; if (!state.settings.regexRules) state.settings.regexRules = []; state.settings.regexRules.push(v); renderSettingsView(); }
function deleteRegexDetail(idx) { if (!state.settings.regexRules) return; state.settings.regexRules.splice(idx, 1); renderSettingsView(); }
function handleRegexImportDetail(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { const txt = ev.target.result; let rules = []; try { rules = JSON.parse(txt); if (!Array.isArray(rules)) rules = [rules]; } catch (_) { rules = txt.split('\n').map(l => l.trim()).filter(l => l); } if (!state.settings.regexRules) state.settings.regexRules = []; state.settings.regexRules.push(...rules); renderSettingsView(); }; r.readAsText(f); e.target.value = ''; }
function saveAssistantDetail() {
    const ni = document.getElementById('assistantNameInput'); if (ni) state.settings.aiName = ni.value.trim() || 'AI';
    const ti = document.getElementById('assistantTemp'); if (ti) state.settings.temperature = parseInt(ti.value) / 100;
    const mt = document.getElementById('assistantMaxTokens'); if (mt) state.settings.maxTokens = parseInt(mt.value) || 0;
    const ctx = document.getElementById('assistantCtx'); if (ctx) state.settings.contextCount = parseInt(ctx.value);
    const sp = document.getElementById('assistantSystemPrompt'); if (sp) state.settings.systemPrompt = sp.value;
    saveState(); renderMessages(); updateHeader(); applyAiIdentity(); renderSettingsView(); showToast('已保存');
}

function wallpaperRow(key, label, value) {
    const meta = state.settings[key + 'Name'] || (value ? '已设置（本地图片）' : '未设置');
    return '<div class="wp-row">' +
        '<div class="wp-row-info">' +
            '<div class="wp-row-label">' + label + '</div>' +
            '<div class="wp-row-meta">' + escapeHtml(meta) + '</div>' +
        '</div>' +
        '<div class="wp-row-actions">' +
            (value ? '<button class="wp-btn wp-btn-clear" onclick="clearWallpaperSetting(\'' + key + '\')">清除</button>' : '') +
            '<label class="wp-btn wp-btn-pick" for="' + key + 'Input">选择图片</label>' +
        '</div>' +
        '<input type="file" id="' + key + 'Input" class="wp-hidden-input" accept="image/*" data-wp-key="' + key + '">' +
        '</div>';
}

function clearWallpaperSetting(key) {
    state.settings[key] = '';
    state.settings[key + 'Name'] = '';
    saveState();
    if (key === 'wallpaper') applyWallpaper();
    else if (key === 'homeWallpaper') applyHomeBg();
    else applyCustomImages();
    renderSettingsView();
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

function bindMainSettingsEvents() {
    const f = document.getElementById('fontSize'); if (f) f.addEventListener('input', e => { document.getElementById('fontSizeDisplay').textContent = getFontSizeLabel(parseInt(e.target.value)); state.settings.fontSize = parseInt(e.target.value); saveState(); applyFontSize(); });
    const fb = document.getElementById('fetchModelsBtn'); if (fb) fb.addEventListener('click', fetchModels);
    const mi = document.getElementById('modelInput'); if (mi) { mi.addEventListener('focus', () => { const ml = document.getElementById('modelList'); if (ml && ml.children.length > 0) { ml.style.display = 'block'; showModelSearch(); } }); mi.addEventListener('change', () => { state.settings.model = mi.value.trim(); saveState(); updateHeader(); }); }
    document.querySelectorAll('.wp-hidden-input').forEach(inp => inp.addEventListener('change', handleWallpaperPick));
    const imp = document.getElementById('importFileInput'); if (imp) imp.addEventListener('change', handleImportData);
    const tms = document.getElementById('themeModeSelect'); if (tms) tms.addEventListener('change', () => { state.settings.theme = tms.value; saveState(); applyTheme(); renderSettingsView(); });
    const fontSel = document.getElementById('fontFamilySelect'); if (fontSel) fontSel.addEventListener('change', () => { state.settings.fontFamily = fontSel.value; saveState(); applyFontFamily(); });
    document.querySelectorAll('.msg-display-toggle').forEach(t => t.addEventListener('change', () => { state.settings[t.dataset.key] = t.checked; saveState(); if (t.dataset.key === 'glassMode') applyGlassMode(); renderMessages(); }));
    document.querySelectorAll('.plugin-toggle').forEach(t => t.addEventListener('change', () => { if (!state.settings.plugins) state.settings.plugins = {}; state.settings.plugins[t.dataset.plugin] = t.checked; saveState(); }));
    const at = document.getElementById('assistantTemp'); if (at) at.addEventListener('input', e => { const d = document.getElementById('assistantTempDisplay'); if (d) d.textContent = (e.target.value / 100).toFixed(2); });
    const ac = document.getElementById('assistantCtx'); if (ac) ac.addEventListener('input', e => { const d = document.getElementById('assistantCtxDisplay'); if (d) d.textContent = (e.target.value >= 50 ? '无限制' : e.target.value); });
    const ai = document.getElementById('aiAvatarInputDetail'); if (ai) ai.addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { state.settings.aiAvatar = ev.target.result; saveState(); renderSettingsView(); }; r.readAsDataURL(f); });
    const ri = document.getElementById('regexFileInputDetail'); if (ri) ri.addEventListener('change', handleRegexImportDetail);
    const pab = document.getElementById('changeProfileAvatarBtn'); if (pab) pab.addEventListener('click', () => document.getElementById('profileAvatarInput').click());
    const pai = document.getElementById('profileAvatarInput'); if (pai) pai.addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { state.settings.userAvatar = ev.target.result; saveState(); applyUserAvatar(); renderSettingsView(); }; r.readAsDataURL(f); });
    const psb = document.getElementById('saveProfileBtn'); if (psb) psb.addEventListener('click', saveProfileDetail);
}