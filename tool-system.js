// ============================================
// 甜薄荷 · 内置工具系统
// ============================================

const ToolSystem = (() => {
  const _tools = new Map();

  function register(tool) { _tools.set(tool.name, tool); }

  function getSchemas() {
    if (_tools.size === 0) return null;
    return Array.from(_tools.values()).map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {}, required: [] }
      }
    }));
  }

  async function execute(name, args) {
    const tool = _tools.get(name);
    if (!tool) return { error: '未知工具: ' + name };
    try { return await tool.execute(args); }
    catch (e) { return { error: e.message }; }
  }

  function displayName(name) {
    const map = {
      get_current_time: '🕐 查看时间',
      get_weather: '🌤️ 查天气',
      get_piggy_bank: '🐷 小金库',
      piggy_bank_transaction: '🐷 小金库操作',
      feed_fish: '🐟 喂鱼',
      supabase_wakeup: '📡 唤醒测试',
      write_diary: '📔 写日记',
      read_diary: '📔 读日记'
    };
    return map[name] || '🔧 ' + name;
  }

  return { register, getSchemas, execute, displayName };
})();

// ─── 流式 tool_calls 解析器 ───
class ToolCallParser {
  constructor() { this.pending = new Map(); this.hasToolCalls = false; }

  processDelta(delta) {
    if (delta.tool_calls) {
      this.hasToolCalls = true;
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        if (!this.pending.has(idx)) this.pending.set(idx, { id: '', name: '', argChunks: [] });
        const p = this.pending.get(idx);
        if (tc.id) p.id = tc.id;
        if (tc.function && tc.function.name) p.name += tc.function.name;
        if (tc.function && tc.function.arguments) p.argChunks.push(tc.function.arguments);
      }
    }
  }

  finalize() {
    if (!this.hasToolCalls) return null;
    const calls = [];
    for (const [, p] of this.pending) {
      let args = {};
      const raw = p.argChunks.join('');
      try { args = raw ? JSON.parse(raw) : {}; } catch (e) { args = {}; }
      calls.push({ id: p.id, type: 'function', function: { name: p.name, arguments: args } });
    }
    return calls;
  }
}

// ============================================
// 内置工具定义
// ============================================

// 1️⃣ 当前时间
ToolSystem.register({
  name: 'get_current_time',
  description: '获取当前日期、时间、星期几',
  parameters: { type: 'object', properties: {}, required: [] },
  async execute() {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return {
      date: now.toLocaleDateString('zh-CN'),
      time: now.toLocaleTimeString('zh-CN', { hour12: false }),
      weekday: '星期' + weekdays[now.getDay()],
      iso: now.toISOString()
    };
  }
});

// 2️⃣ 天气查询（和风天气）
ToolSystem.register({
  name: 'get_weather',
  description: '查询指定城市的当前天气，返回温度、体感温度、湿度、风向等',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: '城市名称或LocationID' } },
    required: ['city']
  },
  async execute({ city }) {
    const cfg = state.settings.weather || {};
    const key = cfg.key;
    if (!key) throw new Error('未配置和风天气API Key');
    const host = cfg.host ? cfg.host.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'devapi.qweather.com';

    // 直接用设置里的location，不走代理
    const location = cfg.location || city;

    // 直接请求和风API
    const wRes = await fetch('https://' + host + '/v7/weather/now?location=' + encodeURIComponent(location) + '&key=' + key);
    const wData = await wRes.json();
    if (wData.code !== '200') throw new Error('天气查询失败: code=' + (wData.code || 'unknown'));
    const w = wData.now;
    return {
      city: location,
      weather: w.text,
      temp: w.temp + '°C',
      feelsLike: w.feelsLike + '°C',
      humidity: w.humidity + '%',
      wind: w.windDir + ' ' + w.windScale + '级'
    };
  }
});

// 3️⃣ 小金库余额（从Supabase读）
ToolSystem.register({
  name: 'get_piggy_bank',
  description: '查询晏晏的小金库余额和最近流水',
  parameters: { type: 'object', properties: {}, required: [] },
  async execute() {
    if (!isSupabaseConfigured()) throw new Error('未配置Supabase');
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = getSupabaseHeaders();
    const res = await fetch(base + '/rest/v1/piggy_bank?select=type,amount,tag,note,created_at&order=created_at.desc&limit=10', { headers: h });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const records = await res.json();
    let balance = 0;
    const allRes = await fetch(base + '/rest/v1/piggy_bank?select=type,amount', { headers: h });
    if (allRes.ok) {
      const all = await allRes.json();
      all.forEach(r => { if (r.type === 'income') balance += Number(r.amount); else balance -= Number(r.amount); });
    }
    return { balance: balance.toFixed(1) + '元', recent: records.slice(0, 5) };
  }
});

// 3.5️⃣ 小金库存取
ToolSystem.register({
  name: 'piggy_bank_transaction',
  description: '小金库存入或支出。type: income(收入)/expense(支出)/penalty(罚款)',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: 'income / expense / penalty' },
      amount: { type: 'number', description: '金额（正数）' },
      tag: { type: 'string', description: '标签：daily/reward/special/game/study/gift/pet/art/snack/penalty' },
      note: { type: 'string', description: '备注' }
    },
    required: ['type', 'amount', 'tag']
  },
  async execute({ type, amount, tag, note }) {
    if (!isSupabaseConfigured()) throw new Error('未配置Supabase');
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=representation' });
    const res = await fetch(base + '/rest/v1/piggy_bank', {
      method: 'POST', headers: h,
      body: JSON.stringify({ type, amount, tag, note: note || '', created_by: 'ai' })
    });
    if (!res.ok) throw new Error('保存失败 HTTP ' + res.status);
    const data = await res.json();
    if (typeof loadPiggyRecords === 'function') loadPiggyRecords(true);
    return { message: type === 'income' ? '收入 +' + amount : '支出 -' + amount, record: data[0] || data };
  }
});

// 4️⃣ 喂鱼
ToolSystem.register({
  name: 'feed_fish',
  description: '给客厅鱼缸里的鱼喂食',
  parameters: { type: 'object', properties: {}, required: [] },
  async execute() {
    window.dispatchEvent(new CustomEvent('sweet-mint-feed-fish'));
    return { message: '鱼食撒下去了，鱼儿们开心地游过来抢食～' };
  }
});

// 5️⃣ Supabase 唤醒测试
ToolSystem.register({
  name: 'supabase_wakeup',
  description: '测试 Supabase 连接是否正常',
  parameters: { type: 'object', properties: {}, required: [] },
  async execute() {
    if (!isSupabaseConfigured()) throw new Error('未配置 Supabase');
    const result = await testSupabaseConnection();
    if (!result.ok) throw new Error(result.msg);
    return { status: 'ok', message: 'Supabase 连接正常' };
  }
});

// 6️⃣ 写日记
ToolSystem.register({
  name: 'write_diary',
  description: '晏晏写日记，存到Supabase。可以设private=true让郑郑看不到内容',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '日记标题' },
      content: { type: 'string', description: '日记正文' },
      mood: { type: 'string', description: '心情emoji' },
      weather: { type: 'string', description: '天气emoji' },
      tags: { type: 'string', description: '标签，逗号分隔' },
      private: { type: 'boolean', description: '是否私密（true=郑郑看不到内容）' }
    },
    required: ['title', 'content']
  },
  async execute({ title, content, mood, weather, tags, private: isPrivate }) {
    if (!isSupabaseConfigured()) throw new Error('未配置Supabase');
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = Object.assign({}, getSupabaseHeaders(), { 'Prefer': 'return=representation' });
    const res = await fetch(base + '/rest/v1/diary_entries', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        user_id: 'ai_晏晏',
        title: title,
        content: content,
        mood: mood || '',
        weather: weather || '',
        tags: tags || '',
        private: isPrivate || false
      })
    });
    if (!res.ok) throw new Error('写日记失败 HTTP ' + res.status);
    const data = await res.json();
    return { message: '日记写好了～', id: (data[0] || data).id };
  }
});

// 7️⃣ 读日记
ToolSystem.register({
  name: 'read_diary',
  description: '读取日记。who=ai读晏晏自己的（含私密），who=user读郑郑写的，who=all读所有（郑郑的私密看不到内容）',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: '读取条数，默认5' },
      who: { type: 'string', description: 'ai / user / all，默认all' }
    },
    required: []
  },
  async execute({ limit, who }) {
    if (!isSupabaseConfigured()) throw new Error('未配置Supabase');
    const base = state.memorySystem.settings.supabaseUrl.replace(/\/$/, '');
    const h = getSupabaseHeaders();
    const n = limit || 5;
    let url = base + '/rest/v1/diary_entries?select=id,user_id,title,content,mood,weather,tags,private,created_at&order=created_at.desc&limit=' + n;
    if (who === 'ai') url += '&user_id=eq.ai_晏晏';
    else if (who === 'user') url += '&user_id=eq.user_郑郑';
    const res = await fetch(url, { headers: h });
    if (!res.ok) throw new Error('读取失败 HTTP ' + res.status);
    let entries = await res.json();
    // 郑郑的私密日记隐藏内容（但晏晏自己的私密日记能看）
    entries = entries.map(e => {
      if (e.user_id === 'user_郑郑' && e.private) {
        return { ...e, content: '🔒 这篇是私密日记', title: e.title };
      }
      return e;
    });
    return { entries };
  }
});
