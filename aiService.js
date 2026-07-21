const axios = require('axios');

const QWEN_API_KEY = 'sk-ws-H.EHHLDMD.lbQ8.MEYCIQCqw4mrb_Rl4RKBWtGpXP-_P4_lPs7QFHgpUvKV4JjJ3AIhANIlPKTZ7XfEHYpLHfeU06rGf7rl0V-4dKyfgQCrqhmu';
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/**
 * 调用通义千问
 * @param {string} userMessage 用户原始输入
 * @param {string} systemPrompt 系统人设（可选）
 * @returns {string} 大模型的回复文本
 */
async function askQwen(userMessage, systemPrompt = '你是一个骑行助手，回答简洁专业。') {
    const response = await axios.post(QWEN_URL, {
        model: 'qwen-turbo',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ]
    }, {
        headers: {
            'Authorization': `Bearer ${QWEN_API_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    return response.data.choices[0].message.content;
}

module.exports = { askQwen };