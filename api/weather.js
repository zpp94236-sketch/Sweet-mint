export default async function handler(req, res) {
  const { location, key, host } = req.query;
  const apiHost = host || 'devapi.qweather.com';

  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (!location || !key) {
    return res.status(400).json({ error: '缺少 location 或 key 参数' });
  }

  try {
    const response = await fetch(
      `https://${apiHost}/v7/weather/now?location=${encodeURIComponent(location)}&key=${key}`
    );
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: e.message });
  }
}
