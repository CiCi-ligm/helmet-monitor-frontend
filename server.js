const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const { askQwen } = require('./aiService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

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
const QWEN_API_KEY = 'sk-ws-H.EHHLDMD.lbQ8.MEYCIQCqw4mrb_Rl4RKBWtGpXP-_P4_lPs7QFHgpUvKV4JjJ3AIhANIlPKTZ7XfEHYpLHfeU06rGf7rl0V-4dKyfgQCrqhmu';
const PRODUCT_ID = 'G2ddPjoILg';
const DEVICE_NAME = 'gps';

// 原有 AI 导航路由
app.post('/api/ai/nav', async (req, res) => {
    try {
        const { destination, status } = req.body;
        if (!destination) return res.status(400).json({ error: '缺少目的地参数' });

        const prompt = `你是一个专业的骑行导航助手。用户正在骑行前往"${destination}"，当前状态为"${status || '进行中'}"。请生成一句简短的导航语音指令（15字以内），例如"前方50米右转"、"继续直行200米"等。只输出导航动作本身。`;
        const aiText = await askQwen(prompt);

        res.json({ success: true, text: aiText });
    } catch (error) {
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

// 自然语言解析接口
app.post('/api/nlp/nav', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: '缺少语音文本' });

        const prompt = `从以下用户指令中提取出目的地和导航类型（步行/骑行），以JSON格式返回：{"destination":"地点名","mode":"walking"或"riding"}。只输出JSON，不要任何解释。用户指令：${text}`;
        const aiResult = await askQwen(prompt);
        
        // ✅ 安全解析JSON
        let parsed;
        try {
            parsed = JSON.parse(aiResult);
        } catch (e) {
            console.error('NLP JSON解析失败，AI原始输出:', aiResult);
            return res.status(500).json({ error: 'AI输出格式错误' });
        }

        if (!parsed.destination) return res.json({ success: false, error: '未识别到目的地' });

        const geoResp = await axios.get('https://restapi.amap.com/v3/assistant/inputtips', {
            params: {
                key: '977b6123358698744cd4f2a96e219145',
                keywords: parsed.destination
            }
        });

        if (geoResp.data.tips && geoResp.data.tips.length > 0) {
            const location = geoResp.data.tips[0].location;
            res.json({ success: true, destination: parsed.destination, mode: parsed.mode || 'riding', location });
        } else {
            res.json({ success: false, error: '找不到该目的地' });
        }
    } catch (error) {
        res.status(500).json({ error: '意图解析失败' });
    }
});

// 语音导航接口（接收音频，调用大模型识别并解析意图）
app.post('/api/voice/nav', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '缺少音频文件' });
        }

        // 将音频 buffer 转为 base64
        const audioBase64 = req.file.buffer.toString('base64');
        const audioUrl = `data:audio/wav;base64,${audioBase64}`;

        // 调用通义千问多模态模型，同时完成语音识别和意图解析
        const prompt = '请分析这段语音，提取出目的地和导航类型（步行/骑行），以JSON格式返回：{"destination":"地点名","mode":"walking"或"riding"}。只输出JSON，不要任何解释。';
        const response = await axios.post(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
            {
                model: 'qwen-omni-turbo',
                input: {
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { "audio": audioUrl },
                                { "text": prompt }
                            ]
                        }
                    ]
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${QWEN_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // ✅ 安全提取AI返回内容
        let aiOutput;
        try {
            aiOutput = response.data.output.choices[0].message.content[0].text;
        } catch (e) {
            console.error('提取AI返回内容失败，原始返回:', JSON.stringify(response.data));
            return res.status(500).json({ error: 'AI返回格式异常，请查看日志' });
        }

        // ✅ 安全解析JSON
        let parsed;
        try {
            parsed = JSON.parse(aiOutput);
        } catch (e) {
            console.error('JSON解析失败，AI原始输出:', aiOutput);
            return res.status(500).json({ error: 'AI输出格式错误', raw: aiOutput });
        }

        if (!parsed.destination) {
            return res.json({ success: false, error: '未识别到目的地' });
        }

        // 使用高德搜索坐标
        const geoResp = await axios.get('https://restapi.amap.com/v3/assistant/inputtips', {
            params: {
                key: '977b6123358698744cd4f2a96e219145',
                keywords: parsed.destination
            }
        });

        if (geoResp.data.tips && geoResp.data.tips.length > 0) {
            const location = geoResp.data.tips[0].location;
            res.json({ success: true, destination: parsed.destination, mode: parsed.mode || 'riding', location });
        } else {
            res.json({ success: false, error: '找不到该目的地' });
        }
    } catch (error) {
        console.error('语音处理失败:', error.response?.data || error.message);
        res.status(500).json({ error: '语音服务暂时不可用' });
    }
});

// Vercel 导出
module.exports = app;