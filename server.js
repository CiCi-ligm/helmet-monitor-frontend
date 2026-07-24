const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const { askQwen } = require('./aiService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json());

const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const QWEN_API_KEY = 'sk-ws-H.EHHLDMD.lbQ8.MEYCIQCqw4mrb_Rl4RKBWtGpXP-_P4_lPs7QFHgpUvKV4JjJ3AIhANIlPKTZ7XfEHYpLHfeU06rGf7rl0V-4dKyfgQCrqhmu';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';
const AMAP_KEY = '977b6123358698744cd4f2a96e219145';

async function sendToOneNET(navText) {
    const version = '2022-05-01';
    const resStr = `products/${PRODUCT_ID}`;
    const et = Math.ceil((Date.now() + 3600000) / 1000);
    const method = 'sha1';
    const base64Key = Buffer.from(API_KEY, 'base64');
    const signStr = et + '\n' + method + '\n' + resStr + '\n' + version;
    const hmac = crypto.createHmac('sha1', base64Key).update(signStr).digest('base64');
    const productToken = `version=${version}&res=${encodeURIComponent(resStr)}&et=${et}&method=${method}&sign=${encodeURIComponent(hmac)}`;

    try {
        await axios.post(
            'https://iot-api.heclouds.com/thingmodel/set-device-property',
            { product_id: PRODUCT_ID, device_name: DEVICE_NAME, params: { nav_text: navText } },
            { headers: { 'Content-Type': 'application/json', 'Authorization': productToken } }
        );
        console.log('OneNET 下发成功:', navText);
    } catch (err) {
        console.warn('OneNET 下发失败:', err.response?.data || err.message);
    }
}

async function searchPlace(keywords, userLocation) {
    let response = await axios.get('https://restapi.amap.com/v3/place/text', {
        params: { key: AMAP_KEY, keywords: keywords, city: '宜宾' }
    });
    if (!response.data.pois || response.data.pois.length === 0) {
        response = await axios.get('https://restapi.amap.com/v3/place/around', {
            params: { key: AMAP_KEY, keywords: keywords, location: userLocation || '104.5647,28.7658', radius: 5000, offset: 1 }
        });
    }
    return response;
}

// AI 导航路由
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) return res.status(400).json({ error: '缺少目的地参数' });
        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请生成一句简短的导航语音指令（15字以内），例如"前方50米右转"、"继续直行200米"等。只输出导航动作本身。`;
        const aiText = await askQwen(prompt);
        sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

// 安全风险研判接口
app.post('/api/ai/risk', async (req, res) => {
    try {
        const { event, data } = req.body;
        if (!event) return res.status(400).json({ error: '缺少事件类型' });
        const prompt = `你是一个骑行安全助手。用户设备检测到${event}事件，传感器数据：${data || '无详细数据'}。请判断风险等级（低/中/高），并生成一句紧急语音提示（15字以内），如"检测到摔倒，已通知紧急联系人"。只输出JSON：{"level":"风险等级","text":"语音提示"}。`;
        const aiResult = await askQwen(prompt);
        const parsed = JSON.parse(aiResult);
        sendToOneNET(parsed.text);
        res.json({ success: true, text: parsed.text, level: parsed.level });
    } catch (error) {
        res.status(500).json({ error: '风险研判失败' });
    }
});

// 自然语言解析接口
app.post('/api/nlp/nav', async (req, res) => {
    try {
        const { text, userLocation } = req.body;
        if (!text) return res.status(400).json({ error: '缺少语音文本' });
        const prompt = `你是一个专业的骑行导航助手。用户说：${text}。请分析这句话，以JSON格式返回：{"destination":"具体地点名","detail":"检测到的最近的具体地点（如星巴克宜宾万达店）","mode":"walking或riding","instruction":"一句简短的导航起始指令，如'直走50米后左转'"}。只输出JSON，不要任何解释。`;
        const aiResult = await askQwen(prompt);
        let parsed;
        try { parsed = JSON.parse(aiResult); } catch (e) { return res.status(500).json({ error: 'AI输出格式错误' }); }
        if (!parsed.destination) return res.json({ success: false, error: '未识别到目的地' });
        const geoResp = await searchPlace(parsed.destination, userLocation);
        if (geoResp.data.pois && geoResp.data.pois.length > 0) {
            const location = geoResp.data.pois[0].location;
            res.json({ success: true, destination: parsed.destination, detail: parsed.detail || geoResp.data.pois[0].name || parsed.destination, instruction: parsed.instruction || '', mode: parsed.mode || 'riding', location: location });
        } else {
            res.json({ success: false, error: `找不到"${parsed.destination}"` });
        }
    } catch (error) {
        res.status(500).json({ error: '意图解析失败' });
    }
});

// 语音导航接口
app.post('/api/voice/nav', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '缺少音频文件' });
        const audioBase64 = req.file.buffer.toString('base64');
        const audioUrl = `data:audio/wav;base64,${audioBase64}`;
        const prompt = '你是一个专业的骑行导航助手。请分析这段语音，以JSON格式返回：{"destination":"具体地点名","detail":"检测到的最近的具体地点","mode":"walking或riding","instruction":"一句简短的导航起始指令"}。只输出JSON，不要任何解释。';
        const response = await axios.post('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
            model: 'qwen-omni-turbo', input: { messages: [{ role: 'user', content: [{ "audio": audioUrl }, { "text": prompt }] }] }
        }, { headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' } });
        let aiOutput;
        try { aiOutput = response.data.output.choices[0].message.content[0].text; } catch (e) { return res.status(500).json({ error: 'AI返回格式异常' }); }
        let parsed;
        try { parsed = JSON.parse(aiOutput); } catch (e) { return res.status(500).json({ error: 'AI输出格式错误', raw: aiOutput }); }
        if (!parsed.destination) return res.json({ success: false, error: '未识别到目的地' });
        const geoResp = await searchPlace(parsed.destination, req.body.userLocation);
        if (geoResp.data.pois && geoResp.data.pois.length > 0) {
            const location = geoResp.data.pois[0].location;
            res.json({ success: true, destination: parsed.destination, detail: parsed.detail || geoResp.data.pois[0].name || parsed.destination, instruction: parsed.instruction || '', mode: parsed.mode || 'riding', location: location });
        } else {
            res.json({ success: false, error: `找不到"${parsed.destination}"` });
        }
    } catch (error) {
        res.status(500).json({ error: '语音服务暂时不可用' });
    }
});

module.exports = app;