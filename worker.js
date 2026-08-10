// 甜薄荷 MCP 通用代理 Worker
// 用法：https://你的worker.workers.dev/proxy?url=目标MCP地址

const ALLOWED_ORIGINS = [
  'https://sweet-mint.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500'
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1');

    // 预检请求直接返回
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowed ? origin : ALLOWED_ORIGINS[0])
      });
    }

    // 安全检查：只允许白名单域名
    if (!allowed && origin) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 解析目标 URL
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: '缺少 url 参数', usage: '/proxy?url=https://mcp.example.com/mcp' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }

    // 转发请求
    try {
      const headers = new Headers();
      // 复制原始请求头（跳过浏览器自动加的）
      const skipHeaders = new Set(['host', 'origin', 'referer', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-worker', 'cf-ipcountry', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip']);
      for (const [key, value] of request.headers) {
        if (!skipHeaders.has(key.toLowerCase())) {
          headers.set(key, value);
        }
      }

      const fetchOptions = {
        method: request.method,
        headers: headers
      };

      // 带 body 的请求
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        fetchOptions.body = await request.text();
      }

      const response = await fetch(targetUrl, fetchOptions);

      // 构建响应，加上 CORS 头
      const responseHeaders = new Headers(response.headers);
      const cors = corsHeaders(origin);
      for (const [key, value] of Object.entries(cors)) {
        responseHeaders.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }
  }
};
