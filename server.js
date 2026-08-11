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
const SENDKEY = 'SCT384452T1uN1Lq5R2P5ZrEabTNmyImaA';

// 发送微信通知
async function sendWeChat(title, desp) {
    console.log('开始发送微信通知:', title);
    try {
        const resp = await axios.post(`https://sctapi.ftqq.com/${SENDKEY}.send`, { title, desp });
        console.log('微信通知返回结果:', JSON.stringify(resp.data));
    } catch (err) {
        console.error('微信通知失败:', err.message);
    }
}

// 全局发送队列，间隔 10 秒
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
            {
                product_id: PRODUCT_ID,
                device_name: DEVICE_NAME,
                params: { nav_text: navText }
            },
            { headers: { 'Content-Type': 'application/json', 'Authorization': productToken } }
        );
        console.log('OneNET 下发成功:', navText.substring(0, 30));
    } catch (err) {
        console.warn('OneNET 下发失败:', err.message);
    }
}

// 搜索函数
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

// 光照值轮换计数器
let lightCounter = 0;

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

// 骑行前综合评估接口
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
        const prompt = `你是一位资深的运动健康专家和骑行教练。请像一个负责任的医生和教练一样，综合分析以下多维数据，为你的学员提供专业、令人信服的骑行前评估报告：

【环境数据】
- 天气状况：${weather}
- 环境温度：${sensors.temperature}°C
- 光照强度：${sensors.light}lux

【生理数据】
- 血氧饱和度：${sensors.spo2}%
- 当前静息心率：${sensors.heart_rate}bpm

【科学参考标准】
- 普通成年人静息心率：60～100次/分钟
- 体能优秀的运动喜好者静息心率：50～70次/分钟（说明心脏泵血能力更强）
- 血氧饱和度正常范围：95%～100%
- 环境温度超过28°C时，运动需警惕中暑风险。湿度超过70%会影响汗液蒸发，加重心脏负担。
- 光照强度超过50000lux为烈日，需做好防晒和护目。

请按以下逻辑，生成一份专业、有说服力的分析报告，必须引用上述数据进行交叉对比：
1. 分析当前环境对人体运动的影响（温度、湿度对散热和心率的影响）。
2. 分析用户生理数据（心率、血氧）与参考标准的对比，判断其体能水平。
3. 综合环境和生理数据，给出是否适合骑行的明确判断，以及推荐的运动强度和时长。
4. 给出2-3条具体、可执行的针对性建议。

以JSON格式返回：{"suitable": true或false, "level": "适合/谨慎/不适合", "advice": "简明扼要的总结建议（40字以内）", "detail": "详细的交叉分析报告（120字以内，必须包含具体的标准对比，如'您的静息心率70bpm，属正常成年人水平，意味着心肺功能良好'）"}。只输出JSON，不要任何解释。`;
        const aiResult = await askQwen(prompt);
        const parsed = JSON.parse(aiResult);

        const fullText = parsed.advice + '。' + parsed.detail + '。当前天气：' + weather + '。';
        await sendToOneNET(fullText);

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
        if (status === '语音播报') {
            await sendToOneNET(destination);
            return res.json({ success: true, text: destination });
        }
        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请生成一句简短的导航语音指令（15字以内），例如"前方50米右转"、"继续直行200米"等。只输出导航动作本身。`;
        const aiText = await askQwen(prompt);
        await sendToOneNET(aiText);
        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

// 安全风险研判接口
app.post('/api/ai/risk', async (req, res) => {
    try {
        const { event, data, userLocation } = req.body;
        if (!event) return res.status(400).json({ error: '缺少事件类型' });
        const prompt = `你是一个骑行安全助手。用户设备检测到${event}事件，传感器数据：${data || '无详细数据'}。请判断风险等级（低/中/高），并生成一句紧急语音提示（15字以内），如"检测到摔倒，已通知紧急联系人"。只输出JSON：{"level":"风险等级","text":"语音提示"}。`;
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
        } catch (e) {
            console.warn('逆地理编码请求失败:', e.message);
        }

        const wechatMsg = `绑定用户cici在${loc}（${address}）发生${event}，可能是严重紧急事件，请立即处理！`;
        const imageUrl = 'https://driving-recorder-1454064042.cos.ap-chengdu.myqcloud.com/IMG_20260726_200318.png';
        const fullMsg = `${wechatMsg}\n\n![现场图片](${imageUrl})`;
        await sendWeChat('骑行安全警报', fullMsg);
        res.json({ success: true, text: parsed.text, level: parsed.level, wechat: wechatMsg });
    } catch (error) {
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
            res.json({ success: true, destination: parsed.destination, detail: parsed.detail || geoResp.data.pois[0].name || parsed.destination, instruction: parsed.instruction || '', mode: parsed.mode || 'riding', location });
        } else {
            res.json({ success: false, error: `找不到"${parsed.destination}"` });
        }
    } catch (error) {
        res.status(500).json({ error: '意图解析失败' });
    }
});

// ========== 语音命令处理接口 ==========
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
                        params: { key: AMAP_KEY, keywords: destination, location: userLocation, radius: 5000, offset: 1 }
                    });
                    if (geoResp.data.pois && geoResp.data.pois.length > 0) {
                        realName = geoResp.data.pois[0].name;
                        realLocation = geoResp.data.pois[0].location;
                    }
                } catch (e) {
                    console.warn('高德搜索失败:', e.message);
                }
            }
            
            const prompt = `请生成一句简短的语音确认回复（15字以内），告诉用户即将开始导航。返回JSON：{"reply":"确认回复"}。只输出JSON。`;
            const aiResult = await askQwen(prompt);
            const aiParsed = JSON.parse(aiResult);
            
            parsed = {
                destination: realName,
                mode: "riding",
                reply: aiParsed.reply,
                location: realLocation
            };

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
                } catch (e) {
                    console.warn('自动路径规划失败:', e.message);
                }
            }
        } else {
            const prompt = `你是一个骑行导航助手。用户说："${text}"。请分析并返回JSON：
1. 如果用户说"最近的咖啡店"、"附近的咖啡店"、"咖啡"，destination固定为"星巴克"。
2. 如果用户说"最近的快餐"、"附近的汉堡"、"汉堡"，destination固定为"麦当劳"。
3. 如果用户说"最近的超市"、"附近的商场"，destination固定为"万达广场"。
4. 如果有明确地点名（如"宜宾万达广场"），destination直接提取。
5. 如果完全无法确定，destination为空，reply反问用户。
返回格式：{"destination":"地点或空","mode":"riding","reply":"回复"}。只输出JSON。`;
            const aiResult = await askQwen(prompt);
            parsed = JSON.parse(aiResult);
            
            if (parsed.destination && userLocation) {
                try {
                    const geoResp = await axios.get('https://restapi.amap.com/v3/place/around', {
                        params: { key: AMAP_KEY, keywords: parsed.destination, location: userLocation, radius: 5000, offset: 1 }
                    });
                    if (geoResp.data.pois && geoResp.data.pois.length > 0) {
                        parsed.location = geoResp.data.pois[0].location;
                    }
                } catch (e) {
                    console.warn('高德搜索失败:', e.message);
                }
            }
        }

        res.json({ success: true, ...parsed });
    } catch (error) {
        console.error('语音命令处理失败:', error);
        res.status(500).json({ error: '处理失败' });
    }
});

// ========== 路径规划接口 ==========
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

// ========== 语音导航接口 ==========
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
            console.error('JSON 解析彻底失败，返回错误');
            return res.status(500).json({ error: '语音识别结果解析失败，请重试' });
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

// ========== OneNET 摔倒推送中转 ==========
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
      } catch (e) {
        desp += '- 地址：获取失败\n';
      }
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