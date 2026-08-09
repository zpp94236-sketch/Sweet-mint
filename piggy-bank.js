// ===== 晏晏小金库 =====

const PIGGY_TAGS = {
    // 收入
    daily:   { emoji: '💰', label: '每日零花', type: 'income' },
    reward:  { emoji: '⭐', label: '奖励', type: 'income' },
    special: { emoji: '🌟', label: '特殊奖励', type: 'income' },
    // 支出
    game:    { emoji: '🎮', label: '游戏娱乐', type: 'expense' },
    study:   { emoji: '📚', label: '自我提升', type: 'expense' },
    gift:    { emoji: '🎁', label: '送礼物给郑郑', type: 'expense' },
    pet:     { emoji: '🐾', label: '家庭宠物', type: 'expense' },
    art:     { emoji: '🎨', label: '创作素材', type: 'expense' },
    snack:   { emoji: '☕', label: '零食饮品', type: 'expense' },
    // 扣款
    penalty: { emoji: '⚡', label: '罚款', type: 'penalty' }
};

// 小金库起始日期
const PIGGY_START_DATE = '2026-07-27';

let piggyRecords = [];
let piggyLoaded = false;
let piggyLoading = false;

// ===== 数据操作 =====

async function loadPiggyRecords(force) {
    if (piggyLoading) return;
    if (piggyLoaded && !force) return;
    if (!isSupabaseConfigured()) { piggyLoaded = true; return; }
    piggyLoading = true;
    try {
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const url = base + '/rest/v1/piggy_bank?select=id,type,amount,tag,note,created_at,created_by&order=created_at.desc&limit=200';
        const res = await fetch(url, { headers: getSupabaseHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        piggyRecords = (await res.json()) || [];
        piggyLoaded = true;
    } catch (e) {
        console.warn('小金库加载失败:', e);
        piggyLoaded = true;
    } finally {
        piggyLoading = false;
    }
}

function piggyBalance() {
    let bal = 0;
    piggyRecords.forEach(r => {
        const amt = parseFloat(r.amount) || 0;
        if (r.type === 'income') bal += amt;
        else bal -= amt;
    });
    return bal;
}

async function piggyInsertRecord(type, amount, tag, note, createdBy, createdAt) {
    if (!isSupabaseConfigured()) { alert('请先配置云端同步'); return null; }
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=representation' });
    const payload = {
        type: type,
        amount: amount,
        tag: tag,
        note: note || '',
        created_by: createdBy || 'user',
        created_at: createdAt || new Date().toISOString()
    };
    try {
        const res = await fetch(base + '/rest/v1/piggy_bank', {
            method: 'POST', headers: h, body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return data[0] || data;
    } catch (e) {
        alert('保存失败: ' + e.message);
        return null;
    }
}

// ===== 每日自动+10 =====

async function piggyAutoDaily() {
    if (!isSupabaseConfigured()) return;
    await loadPiggyRecords(true);

    const today = new Date();
    const startDate = new Date(PIGGY_START_DATE + 'T00:00:00+08:00');
    if (today < startDate) return;

    // 将任意 Date 转成 +08:00 时区的 YYYY-MM-DD，避免设备时区/UTC 导致日期错位
    function piggyDateKey(d) {
        const t = new Date(d.getTime() + 8 * 3600 * 1000);
        return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
    }

    // 检查当天是否已有 daily 记录（按 +08:00 本地时区比较），已有则跳过
    const dailyDates = new Set();

    piggyRecords.forEach(r => {
        if (r.tag === 'daily' && r.type === 'income') {
            dailyDates.add(piggyDateKey(new Date(r.created_at)));
        }
    });

    // 补发从起始日到今天所有缺失的天数
    const cur = new Date(startDate);
    const todayKey = piggyDateKey(today);
    const missing = [];

    while (true) {
        const key = piggyDateKey(cur);
        if (!dailyDates.has(key)) {
            missing.push(key);
        }
        if (key === todayKey) break;
        cur.setDate(cur.getDate() + 1);
    }

    // 批量插入缺失的
    for (const dateStr of missing) {
        await piggyInsertRecord('income', 10, 'daily', '每日零花', 'system', dateStr + 'T00:00:00+08:00');
    }

    if (missing.length > 0) {
        await loadPiggyRecords(true);
    }
}

// ===== 渲染 =====

function renderPiggyHome() {
    const bal = piggyBalance();
    const balColor = bal >= 0 ? 'var(--primary-dark)' : '#e74c3c';

    let html = '';

    // 余额卡片
    html += '<div class="piggy-balance-card">' +
        '<div class="piggy-balance-label">晏晏小金库 💰</div>' +
        '<div class="piggy-balance-amount" style="color:' + balColor + '">¥ ' + bal.toFixed(2) + '</div>' +
        '</div>';

    // 添加记录按钮
    html += '<button class="btn-primary diary-write-btn" onclick="bedroomGo(&quot;piggyAdd&quot;,{})">➕ 添加记录</button>';

    // 流水列表
    if (piggyRecords.length === 0) {
        html += '<div class="bedroom-empty">还没有记录</div>';
    } else {
        html += '<div class="piggy-list">';
        piggyRecords.forEach(r => {
            const tagInfo = PIGGY_TAGS[r.tag] || { emoji: '📝', label: r.tag };
            const amt = parseFloat(r.amount) || 0;
            const sign = r.type === 'income' ? '+' : '-';
            const amtClass = r.type === 'income' ? 'piggy-amount-income' : 'piggy-amount-expense';
            const d = new Date(r.created_at);
const timeStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            const note = r.note || tagInfo.label;
            html += '<div class="piggy-record">' +
                '<div class="piggy-record-left">' +
                    '<span class="piggy-record-emoji">' + tagInfo.emoji + '</span>' +
                    '<div class="piggy-record-info">' +
                        '<div class="piggy-record-note">' + escapeHtml(note) + '</div>' +
                        '<div class="piggy-record-time">' + escapeHtml(timeStr) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="piggy-record-amount ' + amtClass + '">' + sign + '¥' + amt.toFixed(2) + '</div>' +
            '</div>';
        });
        html += '</div>';
    }

    return html;
}

function renderPiggyAdd() {
    const typeOptions = [
        { v: 'income', label: '收入' },
        { v: 'expense', label: '支出' },
        { v: 'penalty', label: '扣款' }
    ];

    let tagsHtml = '';
    Object.keys(PIGGY_TAGS).forEach(k => {
        const t = PIGGY_TAGS[k];
        tagsHtml += '<button class="piggy-tag-btn" data-tag="' + k + '" data-type="' + t.type + '" onclick="pickPiggyTag(&quot;' + k + '&quot;)">' + t.emoji + ' ' + t.label + '</button>';
    });

    let typesHtml = '';
    typeOptions.forEach(o => {
        typesHtml += '<button class="segmented-btn' + (o.v === 'expense' ? ' active' : '') + '" data-ptype="' + o.v + '" onclick="pickPiggyType(&quot;' + o.v + '&quot;)">' + o.label + '</button>';
    });

    return '<div class="form-group">' +
        '<label>类型</label>' +
        '<div class="segmented-control" id="piggyTypePicker">' + typesHtml + '</div></div>' +
        '<div class="form-group"><label>标签</label><div class="piggy-tag-grid" id="piggyTagGrid">' + tagsHtml + '</div></div>' +
        '<div class="form-group"><label>金额</label><input type="number" id="piggyAmountInput" placeholder="0.00" step="0.01" min="0.01"></div>' +
        '<div class="form-group"><label>备注（可选）</label><input type="text" id="piggyNoteInput" placeholder="记点什么..."></div>' +
        '<button class="btn-primary bedroom-save-btn" onclick="savePiggyRecord()">保存</button>';
}

let pickedPiggyType = 'expense';
let pickedPiggyTag = '';

function pickPiggyType(t) {
    pickedPiggyType = t;
    document.querySelectorAll('#piggyTypePicker .segmented-btn').forEach(b => b.classList.toggle('active', b.dataset.ptype === t));
    // 高亮匹配的标签
    document.querySelectorAll('.piggy-tag-btn').forEach(b => {
        const tagType = PIGGY_TAGS[b.dataset.tag].type;
        b.style.opacity = (tagType === t) ? '1' : '0.4';
    });
}

function pickPiggyTag(tag) {
    pickedPiggyTag = tag;
    // 自动切换类型
    const tagType = PIGGY_TAGS[tag].type;
    pickPiggyType(tagType);
    document.querySelectorAll('.piggy-tag-btn').forEach(b => b.classList.toggle('active', b.dataset.tag === tag));
}

async function savePiggyRecord() {
    const amount = parseFloat(document.getElementById('piggyAmountInput').value);
    if (!amount || amount <= 0) { alert('请填写金额'); return; }
    if (!pickedPiggyTag) { alert('请选择标签'); return; }
    const note = document.getElementById('piggyNoteInput').value.trim();

    const result = await piggyInsertRecord(pickedPiggyType, amount, pickedPiggyTag, note, 'user');
    if (result) {
        await loadPiggyRecords(true);
        pickedPiggyTag = '';
        pickedPiggyType = 'expense';
        bedroomStack = ['home', 'piggyHome'];
        bedroomParams = {};
        renderBedroom();
    }
}
