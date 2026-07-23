const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const { askQwen } = require('./aiService');

const app = express();
app.use(express.json());

// ✅ 关键修改：彻底解决 CORS 问题
// 1. 先手动设置所有响应头，确保包括 OPTIONS 预检请求在内的所有请求都带有正确的 CORS 头
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://cici-ligm.github.io');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // 2. 如果是预检请求（OPTIONS），直接返回 200，不再向后传递
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 3. 保留 cors 中间件作为备用（但上面的手动设置已经足够）
app.use(cors({
  origin: 'https://cici-ligm.github.io'
}));

// 测试路由
app.get('/test', (req, res) => res.send('服务正常'));

// 产品信息
const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';

// GET 测试路由
app.get('/api/ai/nav', (req, res) => {
    res.json({ message: 'AI 路由正常，请使用 POST 请求发送数据' });
});

// 核心 AI 路由
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) {
            return res.status(400).json({ error: '缺少目的地参数' });
        }

        const prompt = `用户骑行导航到"${destination}"已${status || '完成'}，请生成一句简短的语音提示（15字以内），语气积极。`;
        const aiText = await askQwen(prompt);

        const version = '2022-05-01';
        const resStr = `products/${PRODUCT_ID}`;
        const et = Math.ceil((Date.now() + 3600000) / 1000);
        const method = 'sha1';
        const base64Key = Buffer.from(API_KEY, 'base64');
        const signStr = et + '\n' + method + '\n' + resStr + '\n' + version;
        const hmac = crypto.createHmac('sha1', base64Key).update(signStr).digest('base64');
        const productToken = `version=${version}&res=${encodeURIComponent(resStr)}&et=${et}&method=${method}&sign=${encodeURIComponent(hmac)}`;

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

        res.json({ success: true, text: aiText, destination, status });
    } catch (error) {
        console.error('大模型调用失败:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: 'AI 服务暂时不可用' });
    }
});

// 本地开发时监听端口（Vercel 会自动忽略这部分）
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`🚀 本地后端运行在 http://localhost:${PORT}`);
    });
}

module.exports = app;