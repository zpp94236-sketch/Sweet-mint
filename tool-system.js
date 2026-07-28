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
      feed_fish: '🐟 喂鱼',
      supabase_wakeup: '📡 唤醒测试'
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

// 2️⃣ 天气查询（和风天气，走Vercel代理）
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
      city: location
      weather: w.text,
      temp: w.temp + '°C',
      feelsLike: w.feelsLike + '°C',
      humidity: w.humidity + '%',
      wind: w.windDir + ' ' + w.windScale + '级'
    };
  }
});

// 3️⃣ 小金库余额
ToolSystem.register({
  name: 'get_piggy_bank',
  description: '查询晏晏的小金库余额',
  parameters: { type: 'object', properties: {}, required: [] },
  async execute() {
    // 直接读本地 state
    const balance = piggyBalance();
    const records = (state.settings.piggyRecords || []).slice(-5);
    return { balance: balance.toFixed(1) + ' 元', recentRecords: records };
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
