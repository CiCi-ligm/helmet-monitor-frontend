const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const { askQwen } = require('./aiService');

const app = express();
app.use(express.json());

// ✅ 彻底解决 CORS：手动设置所有响应头，并正确处理 OPTIONS 预检请求
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://cici-ligm.github.io');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 保留 cors 中间件作为备用
app.use(cors({
    origin: 'https://cici-ligm.github.io'
}));

// 测试路由
app.get('/test', (req, res) => res.send('服务正常'));

// 产品信息
const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';

// GET 测试路由，验证 AI 路由是否可访问
app.get('/api/ai/nav', (req, res) => {
    res.json({ message: 'AI 路由正常，请使用 POST 请求发送数据' });
});

// 核心 AI 路由（生成具体导航指令并下发 OneNET）
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) {
            return res.status(400).json({ error: '缺少目的地参数' });
        }

        // ✅ 修改提示词：生成具体的导航动作指令，而不是总结性语句
        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请根据状态生成一句简短的导航语音指令（15字以内），例如"前方50米右转"、"继续直行200米"、"即将到达目的地"等。只输出导航动作本身，不要输出任何解释、问候或总结性文字。`;
        const aiText = await askQwen(prompt);

        // 生成产品签名 token（用于调用 OneNET 物模型接口）
        const version = '2022-05-01';
        const resStr = `products/${PRODUCT_ID}`;
        const et = Math.ceil((Date.now() + 3600000) / 1000);
        const method = 'sha1';
        const base64Key = Buffer.from(API_KEY, 'base64');
        const signStr = et + '\n' + method + '\n' + resStr + '\n' + version;
        const hmac = crypto.createHmac('sha1', base64Key).update(signStr).digest('base64');
        const productToken = `version=${version}&res=${encodeURIComponent(resStr)}&et=${et}&method=${method}&sign=${encodeURIComponent(hmac)}`;

        // 下发 AI 文本到 OneNET 设备（gps 的 nav_text 属性）
        try {
            const onenetRes = await axios.post(
                'https://iot-api.heclouds.com/thingmodel/set-device-property',
                {
                    product_id: PRODUCT_ID,
                    device_name: DEVICE_NAME,
                    params: { nav_text: aiText }
                },
                { headers: { 'Content-Type': 'application/json', 'Authorization': productToken } }
            );
            console.log('OneNET 下发成功:', onenetRes.data);
        } catch (err) {
            console.warn('OneNET 下发失败（设备可能离线）:', err.response?.data || err.message);
        }

        // 返回 AI 文本给前端
        res.json({ success: true, text: aiText, destination, status });
    } catch (error) {
        console.error('大模型调用失败:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: 'AI 服务暂时不可用' });
    }
});

// 本地开发时监听端口（Vercel 环境会忽略）
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`🚀 本地后端运行在 http://localhost:${PORT}`);
    });
}

module.exports = app;