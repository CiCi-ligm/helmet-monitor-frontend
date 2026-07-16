// pages/api/proxy.js
export default async function handler(req, res) {
  // 跨域配置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 预检请求直接放行
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 从环境变量读取密钥，不要写死
  const ONE_NET_TOKEN = process.env.ONENET_AUTH_TOKEN;
  if (!ONE_NET_TOKEN) {
    return res.status(500).json({ error: "未配置OneNET鉴权密钥" });
  }

  // 前端传参，解耦硬编码
  const { text, llmTip = "前方左转，请注意安全" } = req.body;
  const productId = "G2ddPjoILg";
  const deviceName = "gps";
  const apiUrl = `https://iot-api.heclouds.com/mqtt/thing/property/set?product_id=${productId}&device_name=${deviceName}`;

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ONE_NET_TOKEN}`
      },
      body: JSON.stringify({
        params: {
          nav_cmd: { value: text },
          llm_down_cmd: { value: llmTip }
        }
      })
    });

    const data = await resp.json();
    res.status(resp.ok ? 200 : resp.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "请求OneNET接口失败", msg: e.message });
  }
}
