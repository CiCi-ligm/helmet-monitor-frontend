const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { askQwen } = require('./aiService');

const app = express();

// ✅ 终极 CORS：通配符，无任何限制，彻底消除跨域拦截
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json());

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

        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请根据状态生成一句简短的导航语音指令（15字以内），例如"前方50米右转"、"继续直行200米"、"即将到达目的地"等。只输出导航动作本身，不要输出任何解释、问候或总结性文字。`;
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

if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`🚀 本地后端运行在 http://localhost:${PORT}`);
    });
}

module.exports = app;