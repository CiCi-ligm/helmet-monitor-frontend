const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const { askQwen } = require('./aiService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 全局跨域中间件
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json());

// 项目固定配置（已补全完整AccessKey）
const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';
const AMAP_KEY = '85a9a797b358573152302861e5a7dd05';
const SENDKEY = 'SCT384452ThU4fzIdKTYNJk7rduQ9EZGwk';

// 微信推送通知函数
async function sendWechatNotice(title, desp) {
    console.log('开始发送微信通知：', title);
    try {
        const resp = await axios.post(`https://sctapi.ftqq.com/${SENDKEY}.send`, {
            title, desp
        });
        console.log('微信通知返回数据：', resp.data);
    } catch (err) {
        console.error('微信通知发送失败：', err.message);
    }
}

// 修复后的OneNET物模型下发核心函数（解决406报错）
async function sendToOneNET(navText) {
    const version = '2022-05-01';
    const resStr = `products/${PRODUCT_ID}`;
    const now = Math.floor(Date.now() / 1000);
    const signContent = `${version}\n${now}\n${resStr}\n`;
    const hmac = crypto.createHmac('sha1', Buffer.from(API_KEY, 'utf8'));
    const signature = hmac.update(signContent).digest('base64');

    const authToken = `version=${version}&res=${encodeURIComponent(resStr)}&time=${now}&sign=${encodeURIComponent(signature)}`;

    try {
        const resp = await axios.post(
            'https://iot-api.heclouds.com/thing/model/property/set',
            {
                device_name: DEVICE_NAME,
                properties: {
                    nav_text: navText
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken,
                    'Accept': 'application/json'
                },
                timeout: 4500
            }
        );
        const retData = resp.data;
        if (retData.code === 0) {
            console.log('✅ OneNET下发成功 | 导航文本：', navText, '返回：', retData);
        } else {
            console.warn('❌ OneNET下发业务失败 | code:', retData.code, 'msg:', retData.msg);
        }
    } catch (err) {
        if (err.response) {
            console.warn('❌ OneNET HTTP异常 状态码：', err.response.status, '返回内容：', err.response.data);
        } else {
            console.warn('❌ OneNET网络请求超时', err.message);
        }
    }
}

// AI导航接口 POST /api/ai/nav
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) return res.status(400).json({ error: '缺少目的地参数destination' });
        const prompt = `你是专业骑行导航助手，目的地：${destination}，骑行状态：${status || '正常骑行'}，输出15字以内简短导航指令，仅输出文字。`;
        const aiText = await askQwen(prompt);
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        console.error('/api/ai/nav 接口异常：', error);
        res.status(500).json({ error: 'AI导航生成失败' });
    }
});

// 安全风险告警接口 POST /api/ai/risk
app.post('/api/ai/risk', async (req, res) => {
    try {
        const { event, data, userLocation } = req.body;
        if (!event) return res.status(400).json({ error: '缺少告警事件event' });
        console.log('收到头盔告警事件：', event);
        const prompt = `骑行监测告警事件：${event}，传感器数据：${data || '无数据'}，严格返回JSON格式：{"level":"低/中/高","text":"15字以内警告文字"}`;
        const aiResult = await askQwen(prompt);
        const parsed = JSON.parse(aiResult);
        await sendToOneNET(parsed.text);

        // 高德逆地理编码获取地址
        let address = '未知位置';
        const loc = userLocation || '104.5647,28.7658';
        try {
            const geoResp = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
                params: { key: AMAP_KEY, location: loc }
            });
            address = geoResp.data.regeocode?.formatted_address || address;
        } catch (e) {
            console.log('逆地理地址解析失败');
        }
        const notifyMsg = `头盔告警事件：${event}\n坐标：${loc}\n地址：${address}`;
        await sendWechatNotice('智能头盔安全警报', notifyMsg);
        res.json({ success: true, level: parsed.level, text: parsed.text });
    } catch (error) {
        console.error('/api/ai/risk 接口异常：', error);
        res.status(500).json({ error: '风险分析处理失败' });
    }
});

// 骑行总结播报接口 POST /api/ai/summary
app.post('/api/ai/summary', async (req, res) => {
    try {
        const { distance, duration, speed, calories, count } = req.body;
        const avgDist = (distance / count).toFixed(1);
        const avgDur = Math.round(duration / count);
        const prompt = `骑行统计数据：共${count}次骑行，总里程${distance}km，平均单次${avgDist}km，平均时长${avgDur}分钟，平均速度${speed}km/h，60字以内骑行评价。`;
        const aiText = await askQwen(prompt);
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        console.error('/api/ai/summary 接口异常：', error);
        res.status(500).json({ error: '骑行总结生成失败' });
    }
});

// 文本地址解析接口 POST /api/nlp/nav
app.post('/api/nlp/nav', async (req, res) => {
    try {
        const { text, userLocation } = req.body;
        if (!text) return res.status(400).json({ error: '缺少地址文本text' });
        const prompt = `解析用户输入地址，仅返回JSON：{"destination":"地点名称","instruction":"简短导航提示"}，输入内容：${text}`;
        const aiRaw = await askQwen(prompt);
        const parsed = JSON.parse(aiRaw);
        const geoData = await axios.get('https://restapi.amap.com/v3/place/text', {
            params: { key: AMAP_KEY, keywords: parsed.destination, city: '宜宾' }
        });
        const pois = geoData.data.pois;
        if (!pois || pois.length === 0) {
            return res.json({ success: false, error: '未查询到该地点' });
        }
        const targetPoi = pois[0];
        res.json({
            success: true,
            destination: parsed.destination,
            detail: targetPoi.name,
            location: targetPoi.location,
            instruction: parsed.instruction
        });
    } catch (err) {
        console.error('/api/nlp/nav 接口异常：', err);
        res.status(500).json({ error: '地址解析失败' });
    }
});

// 音频上传预留接口
const audioUpload = upload.single('audio');
app.post('/api/voice/nav', audioUpload, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '未上传音频文件' });
        res.json({ success: true, msg: '音频接收完成，语音识别功能待开发' });
    } catch (e) {
        res.status(500).json({ error: '音频上传处理异常' });
    }
});

module.exports = app;
