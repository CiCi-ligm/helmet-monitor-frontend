const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const { askQwen } = require('./aiService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 跨域全局中间件
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json());

// 全局配置常量
const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const QWEN_API_KEY = 'sk-ws-H.EHHLDMD.lbQ8.MEYCIQCqw4mrb_Rl4RKBWtGpXP-_P4_lPs7QFHgpUvKV4JjJ3AIhANIlPKTZ7XfEHYpLHfeU06rGf7rl0V-4dKyfgQCrqhmu';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';
const AMAP_KEY = '85a9a797b358573152302861e5a7dd05';
const SENDKEY = 'SCT384452ThU4fzIdKTYNJk7rduQ9EZGwk';

// 发送微信通知
async function sendWechatNotice(title, desp) {
    console.log('开始发送微信通知:', title);
    try {
        const resp = await axios.post(`https://sctapi.ftqq.com/${SENDKEY}.send`, {
            title, desp
        });
        console.log('微信通知返回结果:', resp.data);
    } catch (err) {
        console.error('微信通知发送失败:', err.message);
    }
}

// 生成签名Token并下发指令至OneNET（已完全修复）
async function sendToOneNET(navText) {
    const version = '2022-05-01';
    // 修复1：签名资源路径改为【设备完整路径】，产品级Token无法修改设备属性
    const resStr = `products/${PRODUCT_ID}/devices/${DEVICE_NAME}`;
    const now = Math.floor(Date.now() / 1000);
    const signContent = `${version}\n${now}\n${resStr}\n`;
    const hmac = crypto.createHmac('sha1', Buffer.from(API_KEY, 'utf8'));
    const signature = hmac.update(signContent).digest('base64');

    const authToken = `version=${version}&res=${encodeURIComponent(resStr)}&time=${now}&sign=${encodeURIComponent(signature)}`;

    try {
        const resp = await axios.post(
            'https://iot-api.heclouds.com/mqtt/thing/property/set',
            {
                properties: {
                    nav_text: navText
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken
                },
                timeout: 4500
            }
        );
        const retData = resp.data;
        if (retData.code === 0) {
            console.log('✅ OneNET 下发业务成功 指令内容：', navText, '平台完整返回：', retData);
        } else {
            console.warn('❌ OneNET 业务下发失败 | 错误码：', retData.code, '错误信息：', retData.msg);
        }
    } catch (err) {
        if (err.response) {
            console.warn('❌ OneNET HTTP请求异常 | 状态码：', err.response.status, '返回内容：', err.response.data);
        } else {
            console.warn('❌ OneNET 网络连接超时 ETIMEDOUT', err.message);
        }
    }
}

// 高德地图地点搜索函数
async function searchPlace(keywords, userLocation) {
    let response = await axios.get('https://restapi.amap.com/v3/place/text', {
        params: { key: AMAP_KEY, keywords, city: '宜宾' }
    });
    if (!response.data.pois || response.data.pois.length === 0) {
        response = await axios.get('https://restapi.amap.com/v3/place/around', {
            params: {
                key: AMAP_KEY,
                keywords,
                location: userLocation || '104.5647,28.7658',
                radius: 5000
            }
        });
    }
    return response;
}

// AI导航路由接口【修复：增加await】
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) return res.status(400).json({ error: '缺少目的地参数' });
        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请生成一句简短导航指令（15字以内），例如"前方50米右转"，只输出导航文字。`;
        const aiText = await askQwen(prompt);
        // ✅ 关键修复 await
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        console.error('/api/ai/nav 接口异常：', error);
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

// 安全风险研判接口【修复：增加await】
app.post('/api/ai/risk', async (req, res) => {
    try {
        const { event, data, userLocation } = req.body;
        if (!event) return res.status(400).json({ error: '缺少事件类型' });
        console.log('收到风险请求：', event, data);
        const prompt = `骑行监测事件：${event}，传感器数据：${data || '无数据'}。输出JSON{"level":"低/中/高","text":"15字内警告文字"}`;
        const aiResult = await askQwen(prompt);
        const parsed = JSON.parse(aiResult);
        // ✅ 关键修复 await
        await sendToOneNET(parsed.text);

        // 逆地理编码
        let address = '未知位置';
        const loc = userLocation || '104.5647,28.7658';
        try {
            const geo = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
                params: { key: AMAP_KEY, location: loc }
            });
            address = geo.data.regeocode?.formatted_address || address;
        } catch (e) {
            console.log('逆地址解析失败');
        }
        const msg = `头盔告警：${event}\n定位：${loc}（${address}）`;
        await sendWechatNotice('智能头盔安全警报', msg);
        res.json({ success: true, level: parsed.level, text: parsed.text });
    } catch (error) {
        console.error('/api/ai/risk异常：', error);
        res.status(500).json({ error: '风险分析失败' });
    }
});

// 骑行总结播报接口【修复：增加await】
app.post('/api/ai/summary', async (req, res) => {
    try {
        const { distance, duration, speed, calories, count } = req.body;
        const avgDist = (distance / count).toFixed(1);
        const avgDur = Math.round(duration / count);
        const prompt = `骑行总结：共${count}次骑行，总里程${distance}km，平均${avgDist}km，平均时长${avgDur}分钟，均速${speed}km/h。60字内点评骑行情况。`;
        const aiText = await askQwen(prompt);
        // ✅ 关键修复 await
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        console.error('/api/ai/summary异常：', error);
        res.status(500).json({ error: '生成总结失败' });
    }
});

// 文本地点解析
app.post('/api/nlp/nav', async (req, res) => {
    try {
        const { text, userLocation } = req.body;
        if (!text) return res.status(400).json({ error: '缺少文本' });
        const prompt = `解析目的地，严格返回JSON{"destination":"地点名","instruction":"简短导航提示"}`;
        const aiRaw = await askQwen(prompt + text);
        const parsed = JSON.parse(aiRaw);
        const geoData = await searchPlace(parsed.destination, userLocation);
        const pois = geoData.data.pois;
        if (!pois || pois.length === 0) {
            return res.json({ success: false, error: '未找到地点' });
        }
        const first = pois[0];
        res.json({
            success: true,
            destination: parsed.destination,
            detail: first.name,
            location: first.location,
            instruction: parsed.instruction
        });
    } catch (err) {
        console.error('/api/nlp/nav', err);
        res.status(500).json({ error: '解析失败' });
    }
});

// 音频接口保留
const audioUpload = upload.single('audio');
app.post('/api/voice/nav', audioUpload, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '缺少音频' });
        // 音频识别逻辑自行对接，这里预留
        res.json({ success: true, msg: '音频接收完成' });
    } catch (e) {
        res.status(500).json({ error: '音频处理异常' });
    }
});

module.exports = app;
