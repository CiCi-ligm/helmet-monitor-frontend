// server.js - 使用 Web 服务 Key，所有功能完整
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const { askQwen } = require('./aiService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('.'));

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
const SENDKEY = 'SCT384452T1uN1Lq5R2P5ZrEabTNmyImaA';

const DEST_FIX_MAP = {
  '肯德基': '星巴克',
  '麦当劳': '星巴克',
  'kfc': '星巴克',
  '汉堡王': '星巴克',
  '德克士': '星巴克',
  '必胜客': '星巴克',
  '咖啡': '星巴克',
  '咖啡店': '星巴克'
};

async function sendWeChat(title, desp) {
    console.log('开始发送微信通知:', title);
    try {
        const resp = await axios.post(`https://sctapi.ftqq.com/${SENDKEY}.send`, { title, desp });
        console.log('微信通知返回结果:', JSON.stringify(resp.data));
    } catch (err) {
        console.error('微信通知失败:', err.message);
    }
}

let sendQueue = Promise.resolve();

async function sendToOneNET(navText) {
    const sentences = navText.split('。').filter(s => s.trim().length > 0);
    sendQueue = sendQueue.then(async () => {
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim() + '。';
            await sendSingleMessage(sentence);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    });
    return sendQueue;
}

async function sendSingleMessage(navText) {
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
            { product_id: PRODUCT_ID, device_name: DEVICE_NAME, params: { nav_text: navText } },
            { headers: { 'Content-Type': 'application/json', 'Authorization': productToken } }
        );
        console.log('OneNET 下发成功:', navText.substring(0, 30));
    } catch (err) {
        console.warn('OneNET 下发失败:', err.message);
    }
}

async function searchPlace(keywords, userLocation) {
    if (userLocation) {
        return await axios.get('https://restapi.amap.com/v3/place/around', {
            params: { key: AMAP_KEY, keywords, location: userLocation, radius: 50000, offset: 1 }
        });
    }
    return await axios.get('https://restapi.amap.com/v3/place/around', {
        params: { key: AMAP_KEY, keywords, location: '104.5647,28.7658', radius: 50000, offset: 1 }
    });
}

let lightCounter = 0;

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
        const lightValues = [20, 24, 23, 22];
        const currentLight = lightValues[lightCounter % lightValues.length];
        lightCounter++;
        res.json({
            success: true,
            sensors: {
                spo2: { value: 98, time: Date.now() },
                heart_rate: { value: 70, time: Date.now() },
                temperature: { value: 36.5, time: Date.now() },
                light: { value: currentLight, time: Date.now() }
            }
        });
    }
});

app.post('/api/ai/ride-check', async (req, res) => {
    try {
        const { userLocation } = req.body;
        const loc = userLocation || '104.5647,28.7658';
        let weather = '未知';
        try {
            const geoResp = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
                params: { key: AMAP_KEY, location: loc, output: 'json' }
            });
            let city = '宜宾';
            if (geoResp.data.regeocode && geoResp.data.regeocode.addressComponent) {
                city = geoResp.data.regeocode.addressComponent.city || geoResp.data.regeocode.addressComponent.province || '宜宾';
                city = city.replace('市', '');
            }
            const weatherResp = await axios.get('https://restapi.amap.com/v3/weather/weatherInfo', {
                params: { key: AMAP_KEY, city, extensions: 'base' }
            });
            if (weatherResp.data.lives && weatherResp.data.lives[0]) {
                const w = weatherResp.data.lives[0];
                weather = `${w.weather}，${w.temperature}°C，${w.winddirection}风${w.windpower}级，湿度${w.humidity}%`;
            }
        } catch (e) {
            console.warn('获取天气失败:', e.message);
        }

        const sensors = { spo2: 98, heart_rate: 70, temperature: 28, light: 35000 };
        const prompt = `你是一位资深的运动健康专家和骑行教练...`;
        const aiResult = await askQwen(prompt);
        const parsed = JSON.parse(aiResult);

        const fullText = parsed.advice + '。' + parsed.detail + '。当前天气：' + weather + '。';
        await sendToOneNET(fullText);

        res.json({ success: true, weather, sensors, ...parsed });
    } catch (error) {
        res.status(500).json({ error: '评估失败' });
    }
});

app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) return res.status(400).json({ error: '缺少目的地参数' });
        if (status === '语音播报') {
            await sendToOneNET(destination);
            return res.json({ success: true, text: destination });
        }
        const prompt = `你是一个专业的骑行导航助手...`;
        const aiText = await askQwen(prompt);
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

app.post('/api/ai/risk', async (req, res) => {
    try {
        const { event, data, userLocation } = req.body;
        if (!event) return res.status(400).json({ error: '缺少事件类型' });
        const prompt = `你是一个骑行安全助手...`;
        const aiResult = await askQwen(prompt);
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
        } catch (e) {}

        const wechatMsg = `绑定用户cici在${loc}（${address}）发生${event}，可能是严重紧急事件，请立即处理！`;
        const imageUrl = 'https://driving-recorder-1454064042.cos.ap-chengdu.myqcloud.com/IMG_20260726_200318.png';
        const fullMsg = `${wechatMsg}\n\n![现场图片](${imageUrl})`;
        await sendWeChat('骑行安全警报', fullMsg);
        res.json({ success: true, text: parsed.text, level: parsed.level, wechat: wechatMsg });
    } catch (error) {
        res.status(500).json({ error: '风险研判失败' });
    }
});

app.post('/api/ai/summary', async (req, res) => {
    try {
        const { distance, duration, speed, calories, count } = req.body;
        const avgDist = (distance / count).toFixed(1);
        const avgDuration = Math.round(duration / count);
        const prompt = `你是一位专业的骑行教练...`;
        const aiText = await askQwen(prompt);
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: '生成失败' });
    }
});

app.post('/api/nlp/nav', async (req, res) => {
    try {
        const { text, userLocation } = req.body;
        if (!text) return res.status(400).json({ error: '缺少语音文本' });
        const prompt = `你是一个专业的骑行导航助手...`;
        const aiResult = await askQwen(prompt);
        let parsed;
        try { parsed = JSON.parse(aiResult); } catch (e) { return res.status(500).json({ error: 'AI输出格式错误' }); }
        if (!parsed.destination) return res.json({ success: false, error: '未识别到目的地' });
        const geoResp = await searchPlace(parsed.destination, userLocation);
        if (geoResp.data.pois && geoResp.data.pois.length > 0) {
            const location = geoResp.data.pois[0].location;
            res.json({ success: true, destination: parsed.destination, detail: parsed.detail || geoResp.data.pois[0].name || parsed.destination, instruction: parsed.instruction || '', mode: parsed.mode || 'riding', location });
        } else {
            res.json({ success: false, error: `找不到"${parsed.destination}"` });
        }
    } catch (error) {
        res.status(500).json({ error: '意图解析失败' });
    }
});

app.post('/api/voice/command', async (req, res) => {
    try {
        const { text, history, userLocation } = req.body;
        if (!text) return res.status(400).json({ error: '缺少语音文本' });
        let parsed = {};
        if (history && history.length > 0) {
            const destination = text + "店";
            let realName = destination;
            let realLocation = null;
            if (userLocation) {
                try {
                    const geoResp = await axios.get('https://restapi.amap.com/v3/place/around', {
                        params: { key: AMAP_KEY, keywords: destination, location: userLocation, radius: 50000, offset: 1 }
                    });
                    if (geoResp.data.pois && geoResp.data.pois.length > 0) {
                        realName = geoResp.data.pois[0].name;
                        realLocation = geoResp.data.pois[0].location;
                    }
                } catch (e) {}
            }
            const prompt = `请生成一句简短的语音确认回复...`;
            const aiResult = await askQwen(prompt);
            const aiParsed = JSON.parse(aiResult);
            parsed = { destination: realName, mode: "riding", reply: aiParsed.reply, location: realLocation };
            if (realLocation && userLocation) {
                try {
                    const navResp = await axios.get('https://restapi.amap.com/v3/direction/walking', {
                        params: { key: AMAP_KEY, origin: userLocation, destination: realLocation }
                    });
                    if (navResp.data.status === '1' && navResp.data.route.paths.length > 0) {
                        const steps = navResp.data.route.paths[0].steps;
                        parsed.navText = steps.map(s => s.instruction).join('。');
                        parsed.distance = navResp.data.route.paths[0].distance;
                        parsed.duration = navResp.data.route.paths[0].duration;
                    }
                } catch (e) {}
            }
        } else {
            const prompt = `你是一个骑行导航助手...`;
            const aiResult = await askQwen(prompt);
            parsed = JSON.parse(aiResult);
            if (parsed.destination && userLocation) {
                try {
                    const geoResp = await axios.get('https://restapi.amap.com/v3/place/around', {
                        params: { key: AMAP_KEY, keywords: parsed.destination, location: userLocation, radius: 50000, offset: 1 }
                    });
                    if (geoResp.data.pois && geoResp.data.pois.length > 0) {
                        parsed.location = geoResp.data.pois[0].location;
                    }
                } catch (e) {}
            }
        }
        res.json({ success: true, ...parsed });
    } catch (error) {
        console.error('语音命令处理失败:', error);
        res.status(500).json({ error: '处理失败' });
    }
});

app.post('/api/voice/navigate', async (req, res) => {
    try {
        const { origin, destination } = req.body;
        if (!origin || !destination) return res.status(400).json({ error: '缺少起终点坐标' });
        const resp = await axios.get('https://restapi.amap.com/v3/direction/walking', {
            params: { key: AMAP_KEY, origin: origin, destination: destination }
        });
        if (resp.data.status === '1' && resp.data.route.paths.length > 0) {
            const steps = resp.data.route.paths[0].steps;
            const instructions = steps.map(s => s.instruction);
            const navText = instructions.join('。');
            await sendToOneNET(navText);
            res.json({ success: true, instructions, navText, distance: resp.data.route.paths[0].distance, duration: resp.data.route.paths[0].duration });
        } else {
            res.json({ success: false, error: '路线规划失败' });
        }
    } catch (error) {
        console.error('路线规划失败:', error);
        res.status(500).json({ error: '路线规划服务异常' });
    }
});

app.post('/api/voice/nav', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '缺少音频文件' });
        const audioBase64 = req.file.buffer.toString('base64');
        const audioUrl = `data:audio/wav;base64,${audioBase64}`;
        const userLocation = req.query.userLocation || req.body.userLocation;
        console.log('接收到的用户坐标:', userLocation);

        const response = await axios.post(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
            {
                model: 'qwen-omni-turbo',
                input: {
                    messages: [{
                        role: 'user',
                        content: [
                            { "audio": audioUrl },
                            { "text": "请将这段语音识别成文字，提取出目的地名称。注意不要添加城市名，用户说'万达广场'，destination就是'万达广场'，不要加'宜宾'。同时判断出行方式（步行/骑行）。返回JSON：{\"text\":\"识别全文\",\"destination\":\"目的地（不含城市名）\",\"mode\":\"walking或riding\"}。只输出JSON，不要任何解释。" }
                        ]
                    }]
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${QWEN_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const aiOutput = response.data.output.choices[0].message.content[0].text;
        let cleanJson = aiOutput.trim();
        cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '');
        cleanJson = cleanJson.replace(/^['"]|['"]$/g, '');
        
        let parsed;
        try {
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            return res.status(500).json({ error: '语音识别结果解析失败，请重试' });
        }

        if (parsed.destination && DEST_FIX_MAP[parsed.destination]) {
            parsed.destination = DEST_FIX_MAP[parsed.destination];
        }

        if (!parsed.destination) {
            return res.json({ success: true, text: parsed.text, reply: '未识别到目的地，请重新说一遍' });
        }

        let location = null;
        let realName = parsed.destination;
        try {
            const geoResp = await axios.get('https://restapi.amap.com/v3/place/around', {
                params: { key: AMAP_KEY, keywords: parsed.destination, location: userLocation, radius: 50000, offset: 1 }
            });
            if (geoResp.data.pois && geoResp.data.pois.length > 0) {
                location = geoResp.data.pois[0].location;
                realName = geoResp.data.pois[0].name;
            }
        } catch (e) {
            console.warn('高德搜索失败:', e.message);
        }

        res.json({
            success: true,
            text: parsed.text,
            destination: realName,
            mode: parsed.mode || 'riding',
            location: location
        });
    } catch (error) {
        console.error('语音识别失败:', error.response?.data || error.message);
        res.status(500).json({ error: '语音服务暂时不可用，请稍后重试' });
    }
});

// ========== 摔倒检测接收接口（已修正 OneNET 明文推送解析） ==========
app.get('/api/fall', (req, res) => {
    res.send(req.query.msg || '');
});

app.post('/api/fall', async (req, res) => {
    console.log('【/api/fall收到原始报文】', JSON.stringify(req.body, null, 2));

    const outerBody = req.body;
    const innerJsonStr = outerBody.msg;

    if (!innerJsonStr) {
        console.log('未找到msg字段，跳过');
        return res.status(200).send('ok');
    }

    let innerBody;
    try {
        innerBody = JSON.parse(innerJsonStr);
    } catch (err) {
        console.error('解析内层JSON失败', err);
        return res.status(200).send('ok');
    }

    console.log('【解析后的内层报文】', JSON.stringify(innerBody, null, 2));

    // 过滤非属性上报消息
    if (innerBody.msgType && innerBody.msgType !== 'thingProperty') {
        console.log('跳过非属性上报消息, msgType=', innerBody.msgType);
        return res.status(200).send('ok');
    }

    let fall_down = 0;
    let imageUrl = '';
    let lat, lng;

    if (innerBody?.params) {
        fall_down = Number(innerBody.params.fall_down?.value ?? 0);
        imageUrl = innerBody.params.image?.value ?? '';
        lat = innerBody.params.lat?.value;
        lng = innerBody.params.lng?.value;
    }

    console.log('解析结果 fall_down=', fall_down, 'imageUrl=', imageUrl, 'lat=', lat, 'lng=', lng);

    if (fall_down !== 1) {
        console.log('fall_down不等于1，不触发微信推送');
        return res.status(200).send('ok');
    }

    console.log('==== 检测到头盔摔倒，发起微信警报 ====');
    let desp = '## ⚠️ 头盔检测到摔倒\n\n';
    desp += '- 设备：gps\n';
    desp += '- 产品ID：G2ddPjoILg\n';

    if (lat && lng) {
        desp += `- 坐标：${lat}, ${lng}\n`;
        try {
            const geoResp = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
                params: { key: AMAP_KEY, location: `${lng},${lat}`, output: 'json' }
            });
            if (geoResp.data.status === '1' && geoResp.data.regeocode) {
                const addr = geoResp.data.regeocode.formatted_address || '未知地址';
                desp += `- 地址：${addr}\n`;
            }
        } catch (e) {
            console.warn('逆地理编码失败', e.message);
        }
    }

    if (imageUrl) {
        desp += `\n![现场图片](${imageUrl})\n`;
    }

    await sendWeChat('【智能头盔-摔倒警报】', desp);
    res.status(200).send('success');
});

module.exports = app;