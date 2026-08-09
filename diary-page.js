// ============================================
// 甜薄荷 · 拾光日记页面
// ============================================

let diaryCache = { entries: [], loaded: false, loading: false };
let diaryCurrentId = null; // 当前查看的日记ID

// ===== 数据层 =====

async function loadDiaryEntries(force) {
    if (diaryCache.loading) return;
    if (diaryCache.loaded && !force) return;
    if (!isSupabaseConfigured()) { diaryCache.loaded = true; return; }
    diaryCache.loading = true;
    try {
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        const url = base + '/rest/v1/diary_entries?select=id,user_id,title,content,mood,weather,tags,private,likes,created_at&order=created_at.desc&limit=100';
        const res = await fetch(url, { headers: getSupabaseHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        diaryCache.entries = (await res.json()) || [];
        diaryCache.loaded = true;
    } catch (e) {
        console.warn('日记加载失败:', e);
        diaryCache.loaded = true;
    } finally {
        diaryCache.loading = false;
    }
}

async function loadDiaryComments(diaryId) {
    if (!isSupabaseConfigured()) return [];
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const url = base + '/rest/v1/diary_comments?diary_id=eq.' + diaryId + '&select=id,user_id,content,created_at&order=created_at.asc';
    try {
        const res = await fetch(url, { headers: getSupabaseHeaders() });
        if (!res.ok) return [];
        return await res.json();
    } catch (e) { return []; }
}

async function toggleDiaryLike(diaryId) {
    const entry = diaryCache.entries.find(e => e.id === diaryId);
    if (!entry) return;
    const myId = 'user_郑郑'; // 点赞的人是郑郑（用户侧）
    let likes = entry.likes || [];
    if (typeof likes === 'string') try { likes = JSON.parse(likes); } catch(e) { likes = []; }
    const idx = likes.indexOf(myId);
    if (idx >= 0) likes.splice(idx, 1); else likes.push(myId);
    entry.likes = likes;
    // 更新到 Supabase
    if (isSupabaseConfigured()) {
        const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
        await fetch(base + '/rest/v1/diary_entries?id=eq.' + diaryId, {
            method: 'PATCH',
            headers: Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=minimal' }),
            body: JSON.stringify({ likes: likes })
        });
    }
}

async function postDiaryComment(diaryId, content) {
    if (!isSupabaseConfigured() || !content.trim()) return null;
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=representation' });
    const res = await fetch(base + '/rest/v1/diary_comments', {
        method: 'POST', headers: h,
        body: JSON.stringify({ diary_id: diaryId, user_id: 'user_郑郑', content: content.trim() })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] || data;
}

async function deleteDiaryEntry(diaryId) {
    if (!isSupabaseConfigured()) return;
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    await fetch(base + '/rest/v1/diary_entries?id=eq.' + diaryId, {
        method: 'DELETE', headers: getSupabaseHeaders()
    });
    diaryCache.entries = diaryCache.entries.filter(e => e.id !== diaryId);
}

async function saveDiaryEntry(data) {
    if (!isSupabaseConfigured()) { alert('请先配置云端同步'); return null; }
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=representation' });
    if (data.id) {
        // 编辑
        const res = await fetch(base + '/rest/v1/diary_entries?id=eq.' + data.id, {
            method: 'PATCH', headers: h,
            body: JSON.stringify({ title: data.title, content: data.content, mood: data.mood, weather: data.weather, tags: data.tags, private: data.private })
        });
        if (!res.ok) { alert('保存失败'); return null; }
        return (await res.json())[0];
    } else {
        // 新建
        const res = await fetch(base + '/rest/v1/diary_entries', {
            method: 'POST', headers: h,
            body: JSON.stringify({ user_id: data.user_id || 'user_郑郑', title: data.title, content: data.content, mood: data.mood || '', weather: data.weather || '', tags: data.tags || '', private: data.private || false })
        });
        if (!res.ok) { alert('保存失败'); return null; }
        return (await res.json())[0];
    }
}

async function deleteDiaryComment(commentId) {
    if (!isSupabaseConfigured()) return;
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    await fetch(base + '/rest/v1/diary_comments?id=eq.' + commentId, {
        method: 'DELETE', headers: getSupabaseHeaders()
    });
}

// ===== 渲染层 =====

function diaryUserName(userId) {
    if (userId === 'ai_晏晏') return state.settings.aiName || '晏晏';
    return state.settings.userName || '郑郑';
}

function diaryUserColor(userId) {
    return userId === 'ai_晏晏' ? 'blue' : 'pink';
}

function diaryDaysCount() {
    if (!diaryCache.entries.length) return 0;
    const sorted = [...diaryCache.entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = new Date(sorted[0].created_at);
    const now = new Date();
    return Math.max(1, Math.floor((now - first) / 86400000) + 1);
}

function formatDiaryTime(iso) {
    const d = new Date(iso);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const w = '星期' + weekdays[d.getDay()];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return y + '.' + m + '.' + day + ' ' + w + ' ' + hh + ':' + mm;
}

// --- 首页 ---
let diaryCalCursor = new Date();
let diaryHeaderWrapped = false;

function diaryDateKey(iso) {
    const d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function diaryDayEntries() {
    // 按 created_at 倒序，每天保留最新一条
    const map = new Map();
    [...diaryCache.entries]
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .forEach(e => {
            const k = diaryDateKey(e.created_at);
            if (!map.has(k)) map.set(k, e);
        });
    return Array.from(map.values());
}

function renderDiaryTimeline(entries) {
    if (!entries.length) return '<div class="diary-empty">还没有日记，写下第一篇吧～</div>';
    return entries.map(e => {
        const locked = e.private && e.user_id === 'ai_晏晏';
        const key = diaryDateKey(e.created_at);
        const parts = key.split('-');
        const month = parseInt(parts[1], 10), day = parseInt(parts[2], 10);
        const who = e.user_id === 'ai_晏晏' ? 'ai' : 'user';
        const content = e.content || '';
        const preview = locked
            ? '<div class="diary-tl-content tl-locked">🔒 这篇日记被锁住了</div>'
            : '<div class="diary-tl-content tl-' + who + '">' + escapeHtml(content.slice(0, 90)) + (content.length > 90 ? '...' : '') + '</div>';
        return '<div class="diary-tl-item" data-date="' + key + '" onclick="openDiaryDetail(\'' + e.id + '\')">' +
            '<div class="diary-tl-date">' +
                '<span class="diary-tl-day">' + String(day).padStart(2, '0') + '</span>' +
                '<span class="diary-tl-month">' + month + '月</span>' +
            '</div>' +
            '<div class="diary-tl-line"></div>' +
            '<div class="diary-tl-body">' +
                preview +
                (locked || !e.mood ? '' : '<span class="diary-tl-mood">' + e.mood + '</span>') +
            '</div>' +
        '</div>';
    }).join('');
}

function renderDiaryHomePage() {
    const dayEntries = diaryDayEntries();
    diaryHeaderSync();
    return '<div class="diary-home">' +
        '<div class="diary-home-body"><div class="diary-view-content">' + renderDiaryTimeline(dayEntries) + '</div></div>' +
        '<button class="diary-fab" onclick="diaryNewEntry()">+</button>' +
    '</div>';
}

function openDiaryDetail(id) {
    diaryCurrentId = id;
    bedroomGo('diaryDetail', { id: id });
}

// --- 右上角 “xx天 📅” 按钮（与顶部返回栏同排） ---
const DIARY_CAL_BTN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>';
const DIARY_CAL_CHEVRON_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const DIARY_CAL_CHEVRON_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

function diaryHeaderSync() {
    installDiaryHeaderSync();
    const header = document.querySelector('#bedroomOverlay .stats-header');
    if (!header) return;
    let btn = document.getElementById('diaryCalendarBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'diaryCalendarBtn';
        btn.className = 'stats-back diary-cal-header-btn';
        btn.innerHTML = '<span class="diary-cal-days"></span>' + DIARY_CAL_BTN_SVG;
        btn.addEventListener('click', function (e) { e.stopPropagation(); openDiaryCalendar(); });
        header.appendChild(btn);
    }
    const stack = (typeof bedroomStack !== 'undefined') ? bedroomStack : [];
    const view = stack[stack.length - 1];
    if (view === 'diaryList') {
        btn.style.display = 'flex';
        const span = btn.querySelector('.diary-cal-days');
        if (span) span.textContent = diaryDaysCount() + '天';
    } else {
        btn.style.display = 'none';
    }
}

function installDiaryHeaderSync() {
    if (diaryHeaderWrapped) return;
    if (typeof window.renderBedroom !== 'function') return; // app.js 尚未加载
    diaryHeaderWrapped = true;
    const orig = window.renderBedroom;
    window.renderBedroom = function () {
        if (typeof orig === 'function') orig();
        diaryHeaderSync();
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installDiaryHeaderSync);
} else {
    installDiaryHeaderSync();
}

// --- 日历浮层 ---
function openDiaryCalendar() {
    let ov = document.getElementById('diaryCalOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'diaryCalOverlay';
        ov.className = 'diary-cal-overlay';
        ov.innerHTML = '<div class="diary-cal-panel">' +
            '<div class="diary-cal-head">' +
                '<button class="diary-cal-nav" onclick="diaryCalMonth(-1)">' + DIARY_CAL_CHEVRON_L + '</button>' +
                '<span class="diary-cal-label" id="diaryCalLabel"></span>' +
                '<button class="diary-cal-nav" onclick="diaryCalMonth(1)">' + DIARY_CAL_CHEVRON_R + '</button>' +
            '</div>' +
            '<div class="diary-cal-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
            '<div class="diary-cal-grid" id="diaryCalGrid"></div>' +
        '</div>';
        ov.addEventListener('click', function (e) { if (e.target === ov) closeDiaryCalendar(); });
        document.body.appendChild(ov);
    }
    diaryCalCursor = new Date();
    renderDiaryCalendar();
    ov.classList.add('active');
}

function closeDiaryCalendar() {
    const ov = document.getElementById('diaryCalOverlay');
    if (ov) ov.classList.remove('active');
}

function diaryCalMonth(delta) {
    diaryCalCursor = new Date(diaryCalCursor.getFullYear(), diaryCalCursor.getMonth() + delta, 1);
    renderDiaryCalendar();
}

function renderDiaryCalendar() {
    const ov = document.getElementById('diaryCalOverlay');
    if (!ov) return;
    const y = diaryCalCursor.getFullYear(), m = diaryCalCursor.getMonth();
    const startOffset = (new Date(y, m, 1).getDay() + 6) % 7;
    const totalDays = new Date(y, m + 1, 0).getDate();
    const diarySet = new Set(diaryDayEntries().map(e => diaryDateKey(e.created_at)));
    let cells = '';
    for (let i = 0; i < startOffset; i++) cells += '<div class="diary-cal-day empty"></div>';
    for (let d = 1; d <= totalDays; d++) {
        const key = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        cells += diarySet.has(key)
            ? '<div class="diary-cal-day has" onclick="diaryCalPick(\'' + key + '\')"><span>' + d + '</span><i class="diary-cal-dot"></i></div>'
            : '<div class="diary-cal-day"><span>' + d + '</span></div>';
    }
    document.getElementById('diaryCalGrid').innerHTML = cells;
    document.getElementById('diaryCalLabel').textContent = y + '年' + (m + 1) + '月';
}

function diaryCalPick(key) {
    closeDiaryCalendar();
    diaryScrollToDate(key);
}

function diaryScrollToDate(key) {
    const body = document.querySelector('.diary-home-body');
    if (!body) return;
    const item = body.querySelector('.diary-tl-item[data-date="' + key + '"]');
    if (!item) return;
    const top = item.offsetTop - body.offsetTop;
    if (typeof body.scrollTo === 'function') {
        try { body.scrollTo({ top: top, behavior: 'smooth' }); return; } catch (e) {}
    }
    body.scrollTop = top;
}

function toggleDiaryMenu(id) {
    const menu = document.getElementById('diaryMenu_' + id);
    // 关闭其他菜单
    document.querySelectorAll('.diary-card-menu.show').forEach(m => { if (m.id !== 'diaryMenu_' + id) m.classList.remove('show'); });
    if (menu) menu.classList.toggle('show');
}

function diaryNewEntry() {
    diaryCurrentId = null;
    bedroomGo('diaryEdit', {});
}

function diaryEditEntry(id) {
    diaryCurrentId = id;
    bedroomGo('diaryEdit', { id: id });
}

async function diaryDeleteEntry(id) {
    if (!confirm('确定删除这篇日记吗？')) return;
    await deleteDiaryEntry(id);
    renderBedroom();
}

// --- 详情页 ---
async function renderDiaryDetailPage(id) {
    const entry = diaryCache.entries.find(e => e.id === id);
    if (!entry) return '<div class="diary-empty">日记不存在</div>';

    const isLocked = entry.private && entry.user_id === 'ai_晏晏';
    const comments = await loadDiaryComments(id);
    const likes = entry.likes || [];
    const isLiked = likes.includes('user_郑郑');

    let contentHtml = '';
    if (isLocked) {
        contentHtml = '<div class="diary-detail-locked">诶呀 这条日记被锁住啦 🔒</div>';
    } else {
        contentHtml = '<div class="diary-detail-content">' + escapeHtml(entry.content || '').replace(/\n/g, '<br>') + '</div>';
    }

    let commentsHtml = '';
    comments.forEach(c => {
    commentsHtml += '<div class="diary-comment">' +
        '<div class="diary-comment-header">' +
            '<span class="diary-comment-name">' + escapeHtml(diaryUserName(c.user_id)) + '</span>' +
            '<span class="diary-comment-time">' + formatDiaryTime(c.created_at) + '</span>' +
        '</div>' +
        '<div class="diary-comment-content">' + escapeHtml(c.content) + '</div>' +
        '<div class="diary-comment-footer">' +
            '<button class="diary-comment-reply-btn" onclick="diaryReplyComment(\'' + id + '\',\'' + escapeHtml(diaryUserName(c.user_id)) + '\')">回复</button>' +
            '<button class="diary-comment-delete-btn" onclick="diaryDeleteComment(\'' + c.id + '\',\'' + id + '\')">删除</button>' +
        '</div>' +
    '</div>';
});

    return '<div class="diary-detail">' +
        '<div class="diary-detail-card">' +
            '<div class="diary-detail-header">' +
                '<div class="diary-detail-meta">' +
                    '<div class="diary-detail-time">' + formatDiaryTime(entry.created_at) + '</div>' +
                    '<div class="diary-detail-author">' + escapeHtml(diaryUserName(entry.user_id)) + '</div>' +
                '</div>' +
                '<div class="diary-detail-icons">' +
                    (entry.weather ? '<span>' + entry.weather + '</span>' : '') +
                    (entry.mood ? '<span>' + entry.mood + '</span>' : '') +
                '</div>' +
            '</div>' +
            contentHtml +
            '<div class="diary-detail-actions">' +
                '<button class="diary-like-btn' + (isLiked ? ' liked' : '') + '" onclick="diaryToggleLike(\'' + id + '\')">' +
                    (isLiked ? '❤️' : '♡') + ' 赞' +
                '</button>' +
                '<span class="diary-actions-divider">|</span>' +
                '<button class="diary-comment-btn" onclick="diaryShowCommentInput(\'' + id + '\')">' +
                    '💬 评论' +
                '</button>' +
            '</div>' +
        '</div>' +
        (comments.length ? '<div class="diary-comments-card">' +
            '<div class="diary-comments-title">评论</div>' +
            commentsHtml +
        '</div>' : '') +
        '<div class="diary-comment-input-area" id="diaryCommentArea" style="display:none;">' +
            '<input type="text" id="diaryCommentInput" placeholder="写点什么...">' +
            '<button class="diary-comment-send" onclick="diarySendComment(\'' + id + '\')">发送</button>' +
        '</div>' +
    '</div>';
}

async function diaryToggleLike(id) {
    await toggleDiaryLike(id);
    // 重新渲染详情页
    const content = document.getElementById('bedroomContent');
    if (content) content.innerHTML = await renderDiaryDetailPage(id);
}

function diaryShowCommentInput(id) {
    const area = document.getElementById('diaryCommentArea');
    if (area) {
        area.style.display = area.style.display === 'none' ? 'flex' : 'none';
        if (area.style.display === 'flex') {
            setTimeout(() => document.getElementById('diaryCommentInput')?.focus(), 100);
        }
    }
}

async function diarySendComment(diaryId) {
    const input = document.getElementById('diaryCommentInput');
    if (!input || !input.value.trim()) return;
    await postDiaryComment(diaryId, input.value);
    input.value = '';
    // 等一小会确保数据库写入完成，再重新渲染
    setTimeout(async () => {
        const content = document.getElementById('bedroomContent');
        if (content) content.innerHTML = await renderDiaryDetailPage(diaryId);
    }, 300);
}

// --- 编辑页 ---
function renderDiaryEditPage(id) {
    const entry = id ? diaryCache.entries.find(e => e.id === id) : null;
    const title = entry ? entry.title : '';
    const contentText = entry ? entry.content : '';
    const mood = entry ? entry.mood : '';
    const weather = entry ? entry.weather : '';
    const isPrivate = entry ? entry.private : false;

    const moods = ['😊', '😌', '🥰', '😴', '😤', '😢', '🤔', '🔥', '🌙', '☀️'];
    const weathers = ['☀️', '⛅', '🌧️', '❄️', '🌫️', '🌈'];

    return '<div class="diary-edit">' +
        '<div class="diary-edit-card">' +
            '<div class="diary-edit-row">' +
                '<label>心情</label>' +
                '<div class="diary-edit-emoji-row" id="diaryMoodRow">' +
                    moods.map(m => '<button class="diary-emoji-btn' + (mood === m ? ' active' : '') + '" data-val="' + m + '" onclick="diaryPickEmoji(\'mood\',\'' + m + '\')">' + m + '</button>').join('') +
                '</div>' +
            '</div>' +
            '<div class="diary-edit-row">' +
                '<label>天气</label>' +
                '<div class="diary-edit-emoji-row" id="diaryWeatherRow">' +
                    weathers.map(w => '<button class="diary-emoji-btn' + (weather === w ? ' active' : '') + '" data-val="' + w + '" onclick="diaryPickEmoji(\'weather\',\'' + w + '\')">' + w + '</button>').join('') +
                '</div>' +
            '</div>' +
            '<div class="diary-edit-row">' +
                '<label>标题</label>' +
                '<input type="text" id="diaryEditTitle" placeholder="给今天取个名字" value="' + escapeHtml(title) + '">' +
            '</div>' +
            '<div class="diary-edit-row">' +
                '<label>正文</label>' +
                '<textarea id="diaryEditContent" rows="8" placeholder="写点什么...">' + escapeHtml(contentText) + '</textarea>' +
            '</div>' +
            '<div class="diary-edit-row diary-edit-toggle">' +
                '<label>🔒 私密（对方看不到内容）</label>' +
                '<label class="switch"><input type="checkbox" id="diaryEditPrivate"' + (isPrivate ? ' checked' : '') + '><span class="switch-slider"></span></label>' +
            '</div>' +
            '<button class="btn-primary diary-save-btn" onclick="diarySaveFromEdit(\'' + (id || '') + '\')">保存</button>' +
        '</div>' +
    '</div>';
}

let diaryEditMood = '';
let diaryEditWeather = '';

function diaryPickEmoji(type, val) {
    if (type === 'mood') {
        diaryEditMood = diaryEditMood === val ? '' : val;
        document.querySelectorAll('#diaryMoodRow .diary-emoji-btn').forEach(b => b.classList.toggle('active', b.dataset.val === diaryEditMood));
    } else {
        diaryEditWeather = diaryEditWeather === val ? '' : val;
        document.querySelectorAll('#diaryWeatherRow .diary-emoji-btn').forEach(b => b.classList.toggle('active', b.dataset.val === diaryEditWeather));
    }
}

async function diarySaveFromEdit(id) {
    const title = document.getElementById('diaryEditTitle').value.trim();
    const content = document.getElementById('diaryEditContent').value.trim();
    const isPrivate = document.getElementById('diaryEditPrivate').checked;
    if (!content) { alert('写点内容再保存吧～'); return; }

    const data = {
        id: id || undefined,
        user_id: 'user_郑郑',
        title: title,
        content: content,
        mood: diaryEditMood,
        weather: diaryEditWeather,
        tags: '',
        private: isPrivate
    };
    // 如果是编辑已有的，保留原 user_id
    if (id) {
        const existing = diaryCache.entries.find(e => e.id === id);
        if (existing) data.user_id = existing.user_id;
    }

    const result = await saveDiaryEntry(data);
    if (result) {
        await loadDiaryEntries(true);
        diaryEditMood = '';
        diaryEditWeather = '';
        // 回到日记首页
        bedroomStack = ['home', 'diaryList'];
        bedroomParams = {};
        renderBedroom();
    }
}
function diaryReplyComment(diaryId, replyTo) {
    const area = document.getElementById('diaryCommentArea');
    if (area) area.style.display = 'flex';
    const input = document.getElementById('diaryCommentInput');
    if (input) {
        input.value = '回复 ' + replyTo + '：';
        input.focus();
    }
}

async function diaryDeleteComment(commentId, diaryId) {
    if (!confirm('删除这条评论？')) return;
    await deleteDiaryComment(commentId);
    setTimeout(async () => {
        const content = document.getElementById('bedroomContent');
        if (content) content.innerHTML = await renderDiaryDetailPage(diaryId);
    }, 300);
}