// ============================================
// 甜薄荷 · MCP Streamable HTTP 客户端
// ============================================

const McpClient = (() => {
    // 每个服务器的连接状态
    const _sessions = new Map(); // id -> { sessionId, tools: [] }

    /**
     * 发送 JSON-RPC 请求到 MCP 服务器
     */
    async function rpcRequest(server, method, params) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        };

        // 添加自定义请求头
        if (server.headers && typeof server.headers === 'object') {
            Object.keys(server.headers).forEach(k => {
                if (k && server.headers[k]) headers[k] = server.headers[k];
            });
        }

        // 如果有 sessionId，带上
        const session = _sessions.get(server.id);
        if (session && session.sessionId) {
            headers['Mcp-Session-Id'] = session.sessionId;
        }

        const body = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: method,
            params: params || {}
        };

        const res = await fetch(server.url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            throw new Error('MCP HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200));
        }

        // 保存 session ID
        const sid = res.headers.get('Mcp-Session-Id');
        if (sid) {
            if (!_sessions.has(server.id)) _sessions.set(server.id, { sessionId: null, tools: [] });
            _sessions.get(server.id).sessionId = sid;
        }

        const contentType = res.headers.get('Content-Type') || '';

        // 如果是 SSE 流式响应，解析最后一个 JSON
        if (contentType.includes('text/event-stream')) {
            const text = await res.text();
            const lines = text.split('\n');
            let lastData = null;
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    lastData = line.slice(6);
                }
            }
            if (lastData) return JSON.parse(lastData);
            throw new Error('SSE 响应中没有 data 行');
        }

        return await res.json();
    }

    /**
     * 初始化连接：发送 initialize + initialized 通知
     */
    async function connect(server) {
        // 清理旧 session
        _sessions.set(server.id, { sessionId: null, tools: [] });

        // Step 1: initialize
        const initResult = await rpcRequest(server, 'initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'SweetMint', version: '1.0.0' }
        });

        if (!initResult || !initResult.result) {
            throw new Error('initialize 返回格式异常');
        }

        // Step 2: initialized 通知（无 id 字段）
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        };
        if (server.headers && typeof server.headers === 'object') {
            Object.keys(server.headers).forEach(k => {
                if (k && server.headers[k]) headers[k] = server.headers[k];
            });
        }
        const session = _sessions.get(server.id);
        if (session && session.sessionId) {
            headers['Mcp-Session-Id'] = session.sessionId;
        }

        await fetch(server.url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
        });

        return initResult.result;
    }

    /**
     * 获取工具列表
     */
    async function listTools(server) {
        const result = await rpcRequest(server, 'tools/list', {});
        const tools = (result && result.result && result.result.tools) || [];
        const session = _sessions.get(server.id);
        if (session) session.tools = tools;
        return tools;
    }

    /**
     * 调用工具
     */
    async function callTool(server, toolName, args) {
        const result = await rpcRequest(server, 'tools/call', {
            name: toolName,
            arguments: args || {}
        });
        if (result && result.result) return result.result;
        if (result && result.error) throw new Error(result.error.message || JSON.stringify(result.error));
        return result;
    }

    /**
     * 测试连接：initialize + listTools
     */
    async function testConnection(server) {
        const start = Date.now();
        const info = await connect(server);
        const tools = await listTools(server);
        const elapsed = Date.now() - start;
        return {
            ok: true,
            serverName: info.serverInfo ? info.serverInfo.name : '未知',
            serverVersion: info.serverInfo ? info.serverInfo.version : '',
            toolCount: tools.length,
            tools: tools,
            elapsed: elapsed
        };
    }

    /**
     * 获取缓存的工具列表
     */
    function getCachedTools(serverId) {
        const session = _sessions.get(serverId);
        return session ? session.tools : [];
    }

    return { connect, listTools, callTool, testConnection, getCachedTools, rpcRequest };
})();
