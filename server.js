const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { askQwen } = require('./aiService');

const app = express();

// 终极 CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json());

const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';

// 原有 AI 导航路由
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) return res.status(400).json({ error: '缺少目的地参数' });

        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请生成一句简短的导航语音指令（15字以内），例如"前方50米右转"、"继续直行200米"等。只输出导航动作本身。`;
        const aiText = await askQwen(prompt);

        // 生成产品 token 并下发 OneNET（省略，可保留原逻辑）
        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

// 新增：自然语言解析接口
app.post('/api/nlp/nav', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: '缺少语音文本' });

        const prompt = `从以下用户指令中提取出目的地和导航类型（步行/骑行），以JSON格式返回：{"destination":"地点名","mode":"walking"或"riding"}。只输出JSON，不要任何解释。用户指令：${text}`;
        const aiResult = await askQwen(prompt);
        const parsed = JSON.parse(aiResult);

        if (!parsed.destination) return res.json({ success: false, error: '未识别到目的地' });

        // 高德 POI 搜索
        const geoResp = await axios.get('https://restapi.amap.com/v3/assistant/inputtips', {
            params: {
                key: '977b6123358698744cd4f2a96e219145',
                keywords: parsed.destination
            }
        });

        if (geoResp.data.tips && geoResp.data.tips.length > 0) {
            const location = geoResp.data.tips[0].location; // "lng,lat"
            res.json({ success: true, destination: parsed.destination, mode: parsed.mode || 'riding', location });
        } else {
            res.json({ success: false, error: '找不到该目的地' });
        }
    } catch (error) {
        res.status(500).json({ error: '意图解析失败' });
    }
});

// Vercel 导出
module.exports = app;