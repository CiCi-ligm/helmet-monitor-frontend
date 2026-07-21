const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const { askQwen } = require('./aiService');

const app = express();
app.use(express.json());
app.use(cors());

// 测试路由
app.get('/test', (req, res) => res.send('服务正常'));

// 产品信息
const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';

// 核心 AI 路由
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) {
            return res.status(400).json({ error: '缺少目的地参数' });
        }

        // 调用大模型
        const prompt = `用户骑行导航到“${destination}”已${status || '完成'}，请生成一句简短的语音提示（15字以内），语气积极。`;
        const aiText = await askQwen(prompt);

        // 生成产品签名 token
        const version = '2022-05-01';
        const resStr = `products/${PRODUCT_ID}`;
        const et = Math.ceil((Date.now() + 3600000) / 1000);
        const method = 'sha1';
        const base64Key = Buffer.from(API_KEY, 'base64');
        const signStr = et + '\n' + method + '\n' + resStr + '\n' + version;
        const hmac = crypto.createHmac('sha1', base64Key).update(signStr).digest('base64');
        const productToken = `version=${version}&res=${encodeURIComponent(resStr)}&et=${et}&method=${method}&sign=${encodeURIComponent(hmac)}`;

        // 下发 OneNET
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

// 导出 app 供 Vercel 使用
module.exports = app;