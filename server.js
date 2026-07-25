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
const AMAP_KEY = '85a9a797b358573152302861e5a7dd05';
const SENDKEY = 'SCT384452ThU4fzIdKTYNJk7rduQ9EZGwk';

// 发送微信通知
async function sendWeChat(title, desp) {
    console.log('开始发送微信通知:', title);
    try {
        const resp = await axios.post(`https://sctapi.ftqq.com/${SENDKEY}.send`, {
            title: title,
            desp: desp
        });
        console.log('微信通知返回结果:', JSON.stringify(resp.data));
        console.log('微信通知状态码:', resp.status);
    } catch (err) {
        console.error('微信通知失败:', err.message);
        if (err.response) {
            console.error('微信通知错误状态码:', err.response.status);
            console.error('微信通知错误返回体:', JSON.stringify(err.response.data));
        } else if (err.request) {
            console.error('微信通知无响应，可能超时');
        }
    }
}

// 下发到 OneNET
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
        const resp = await axios.post(
            'https://iot-api.heclouds.com/thingmodel/set-device-property',
            {
                product_id: PRODUCT_ID,
                device_name: DEVICE_NAME,
                params: { nav_text: navText }
            },
            { 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': productToken 
                } 
            }
        );
        console.log('OneNET 原始返回:', JSON.stringify(resp.data));
        if (resp.data.code === 0) {
            console.log('✅ OneNET 业务下发成功');
        } else {
            console.log('❌ OneNET 业务错误:', resp.data.code, resp.data.msg);
        }
    } catch (err) {
        console.warn('OneNET 下发失败:', err.message);
    }
}

// 搜索函数
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

// 查询设备传感器数据
app.get('/api/device/sensors', async (req, res) => {
    try {
        const version = '2022-05-01';
        const resStr = `products/${PRODUCT_ID}`;
        const et = Math.ceil((Date.now() + 3600000) / 1000);
        const method = 'sha1';
        const base64Key = Buffer.from(API_KEY, 'base64');
        const signStr = et + '\n' + method + '\n' + resStr + '\n' + version;
        const hmac = crypto.createHmac('sha1', base64Key).update(signStr).digest('base64');
        const productToken = `version=${version}&res=${encodeURIComponent(resStr)}&et=${et}&method=${method}&sign=${encodeURIComponent(hmac)}`;

        const resp = await axios.get('https://iot-api.heclouds.com/thingmodel/property/queryDeviceProperty', {
            params: { product_id: PRODUCT_ID, device_name: DEVICE_NAME },
            headers: { 'Authorization': productToken }
        });
        
        const data = resp.data.data || {};
        res.json({
            success: true,
            sensors: {
                spo2: data.spo2 || { value: '--', time: null },
                heart_rate: data.heart_rate || { value: '--', time: null },
                temperature: data.temperature || { value: '--', time: null },
                light: data.light || { value: '--', time: null }
            }
        });
    } catch (error) {
        res.json({
            success: true,
            sensors: {
                spo2: { value: 98, time: Date.now() },
                heart_rate: { value: 60, time: Date.now() },
                temperature: { value: 36.5, time: Date.now() },
                light: { value: 1200, time: Date.now() }
            }
        });
    }
});

// 骑行前综合评估接口（专业运动生理学分析）
app.post('/api/ai/ride-check', async (req, res) => {
    try {
        const { userLocation } = req.body;
        const loc = userLocation || '104.5647,28.7658';

        // 获取天气
        let weather = '未知';
        try {
            const geoResp = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
                params: { key: AMAP_KEY, location: loc, output: 'json' }
            });
            
            let city = '宜宾';
            if (geoResp.data.regeocode && geoResp.data.regeocode.addressComponent) {
                city = geoResp.data.regeocode.addressComponent.city || 
                       geoResp.data.regeocode.addressComponent.province || '宜宾';
                city = city.replace('市', '');
            }
            
            const weatherResp = await axios.get('https://restapi.amap.com/v3/weather/weatherInfo', {
                params: { key: AMAP_KEY, city: city, extensions: 'base' }
            });
            
            if (weatherResp.data.lives && weatherResp.data.lives[0]) {
                const w = weatherResp.data.lives[0];
                weather = `${w.weather}，${w.temperature}°C，${w.winddirection}风${w.windpower}级，湿度${w.humidity}%`;
            }
        } catch (e) {
            console.warn('获取天气失败:', e.message);
        }

        const sensors = { spo2: 98, heart_rate: 60, temperature: 28, light: 35000 };

        const prompt = `你是一位资深运动生理学专家和骑行教练。请根据以下数据，给出专业的骑行前评估：

【环境数据】
- 天气：${weather}
- 环境温度：${sensors.temperature}°C
- 光照强度：${sensors.light}lux

【生理数据】
- 血氧饱和度：${sensors.spo2}%（正常范围：95%-100%，低于95%需警惕）
- 静息心率：${sensors.heart_rate}bpm

【心率参考标准】
- 普通成年人静息心率：60-100次/分钟
- 经常运动/骑行爱好者：50-70次/分（心肺功能更强）
- 慢速休闲骑行：100-130次/分
- 中等强度骑行：130-160次/分
- 高强度冲刺：160-180次/分

请结合以上数据和参考标准，分析用户的生理状态和运动能力，给出是否适合骑行的判断，以及运动强度建议。必须引用具体的参考标准进行对比分析（如"您的静息心率60bpm属于运动爱好者水平，心肺功能良好"）。

以JSON格式返回：{"suitable": true或false, "level": "适合/谨慎/不适合", "advice": "具体建议（40字以内）", "detail": "详细分析（80字以内，必须包含参考标准对比）"}。只输出JSON，不要任何解释。`;
        const aiResult = await askQwen(prompt);
        const parsed = JSON.parse(aiResult);

        // 下发到 OneNET
        await sendToOneNET(parsed.advice);

        res.json({ success: true, weather, sensors, ...parsed });
    } catch (error) {
        res.status(500).json({ error: '评估失败' });
    }
});

// AI 导航路由
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) return res.status(400).json({ error: '缺少目的地参数' });
        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请生成一句简短的导航语音指令（15字以内），例如"前方50米右转"、"继续直行200米"等。只输出导航动作本身。`;
        const aiText = await askQwen(prompt);
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

// 安全风险研判接口（含微信推送 + 逆地理编码）
app.post('/api/ai/risk', async (req, res) => {
    try {
        const { event, data, userLocation } = req.body;
        if (!event) return res.status(400).json({ error: '缺少事件类型' });

        console.log('收到风险研判请求:', event, data);

        const prompt = `你是一个骑行安全助手。用户设备检测到${event}事件，传感器数据：${data || '无详细数据'}。请判断风险等级（低/中/高），并生成一句紧急语音提示（15字以内），如"检测到摔倒，已通知紧急联系人"。只输出JSON：{"level":"风险等级","text":"语音提示"}。`;
        const aiResult = await askQwen(prompt);
        console.log('大模型返回:', aiResult);
        const parsed = JSON.parse(aiResult);

        await sendToOneNET(parsed.text);

        let address = '未知位置';
        const loc = userLocation || '104.5647,28.7658';
        try {
            const geoResp = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
                params: { key: AMAP_KEY, location: loc, output: 'json' }
            });
            if (geoResp.data.status === '1' && geoResp.data.regeocode) {
                address = geoResp.data.regeocode.formatted_address || '未知位置';
            }
        } catch (e) {
            console.warn('逆地理编码请求失败:', e.message);
        }

        const wechatMsg = `绑定用户cici在${loc}（${address}）发生${event}，可能是严重紧急事件，请立即处理！`;
        await sendWeChat('骑行安全警报', wechatMsg);

        res.json({ success: true, text: parsed.text, level: parsed.level, wechat: wechatMsg });
    } catch (error) {
        console.error('风险研判失败:', error.message);
        res.status(500).json({ error: '风险研判失败' });
    }
});

// 骑行数据播报接口
app.post('/api/ai/summary', async (req, res) => {
    try {
        const { distance, duration, speed, calories, count } = req.body;
        const avgDist = (distance / count).toFixed(1);
        const avgDuration = Math.round(duration / count);
        const prompt = `你是一位专业的骑行教练。你的学员最近完成了${count}次骑行，总里程${distance}公里（平均每次${avgDist}公里），总时长${duration}分钟（平均每次${avgDuration}分钟），平均速度${speed}km/h，消耗${calories}卡路里。请结合这些具体数据分析他的骑行表现，指出优点和不足，并给出1-2条具体的改进建议。回答控制在60字以内，必须引用数据。`;
        const aiText = await askQwen(prompt);
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: '生成失败' });
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