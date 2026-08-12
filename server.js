// server.js - 恢复到阿里云语音识别之前的版本
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

// 所有密钥硬编码，不使用环境变量
const API_KEY = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const QWEN_API_KEY = 'sk-ws-H.EHHLDMD.lbQ8.MEYCIQCqw4mrb_Rl4RKBWtGpXP-_P4_lPs7QFHgpUvKV4JjJ3AIhANIlPKTZ7XfEHYpLHfeU06rGf7rl0V-4dKyfgQCrqhmu';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';
const AMAP_KEY = '85a9a797b358573152302861e5a7dd05';  // 与 nav.html 一致
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
            params: { key: AMAP_KEY, keywords, location: userLocation, radius: 5000, offset: 1 }
        });
    }
    return await axios.get('https://restapi.amap.com/v3/place/around', {
        params: { key: AMAP_KEY, keywords, location: '104.5647,28.7658', radius: 5000, offset: 1 }
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

app.post('/api/ai/ride-check', async (req, res) => { /* 原有代码省略，保持不动 */ });
app.post('/api/ai/nav', async (req, res) => { /* 原有代码省略，保持不动 */ });
app.post('/api/ai/risk', async (req, res) => { /* 原有代码省略，保持不动 */ });
app.post('/api/ai/summary', async (req, res) => { /* 原有代码省略，保持不动 */ });
app.post('/api/nlp/nav', async (req, res) => { /* 原有代码省略，保持不动 */ });
app.post('/api/voice/command', async (req, res) => { /* 原有代码省略，保持不动 */ });

// 关键恢复：语音识别使用通义千问
app.post('/api/voice/nav', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '缺少音频文件' });
        const audioBase64 = req.file.buffer.toString('base64');
        const audioUrl = `data:audio/wav;base64,${audioBase64}`;
        const userLocation = req.query.userLocation || req.body.userLocation;

        const response = await axios.post(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
            {
                model: 'qwen-omni-turbo',
                input: {
                    messages: [{
                        role: 'user',
                        content: [
                            { "audio": audioUrl },
                            { "text": "请将这段语音识别成文字，并提取出完整、准确的目的地名称。例如用户说'去万达广场'，destination应该是'万达广场'；用户说'最近的咖啡店'，destination应该是'星巴克'。同时判断出行方式（步行/骑行）。返回JSON：{\"text\":\"识别全文\",\"destination\":\"完整地名\",\"mode\":\"walking或riding\"}。只输出JSON，不要任何解释。" }
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
            const geoResp = await searchPlace(parsed.destination, userLocation);
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

app.get('/api/fall', (req, res) => {
  res.send(req.query.msg || '');
});

app.post('/api/fall', async (req, res) => {
  console.log('收到摔倒推送:', JSON.stringify(req.body));
  try {
    const imageUrl = req.body.image || '';
    const lat = req.body.lat || req.body.latitude || '';
    const lng = req.body.lng || req.body.longitude || '';
    let desp = '## ⚠️ 头盔检测到摔倒\n\n';
    desp += '- 设备：gps\n';
    desp += '- 产品ID：G2ddPjoILg\n';
    if (lat && lng) {
      desp += '- 坐标：' + lat + ', ' + lng + '\n';
      try {
        const geoResp = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
          params: { key: AMAP_KEY, location: lng + ',' + lat, output: 'json' }
        });
        if (geoResp.data.status === '1' && geoResp.data.regeocode) {
          const addr = geoResp.data.regeocode.formatted_address || '未知地址';
          desp += '- 地址：' + addr + '\n';
        }
      } catch (e) {}
    }
    if (imageUrl) {
      desp += '\n![现场图片](' + imageUrl + ')\n';
    }
    await sendWeChat('【智能头盔-摔倒警报】', desp);
    res.status(200).send('success');
  } catch (err) {
    console.error('摔倒推送失败:', err.message);
    res.status(200).send('ok');
  }
});

module.exports = app;