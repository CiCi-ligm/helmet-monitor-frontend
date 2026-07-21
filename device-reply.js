const mqtt = require('mqtt');
const crypto = require('crypto');

const productId = 'G2ddPjoILg';
const deviceName = 'gps';
const deviceKey = 'dzdoVnBFZDNwUk1iU3RQcGl2Z0xGRXYxWGNjNWc4V1g=';

const version = '2018-10-31';
const res = `products/${productId}/devices/${deviceName}`;
const et = Math.ceil((Date.now() + 3600000) / 1000);
const method = 'md5';
const key = Buffer.from(deviceKey, 'base64').toString();
const signStr = et + '\n' + method + '\n' + res + '\n' + version;
const sign = crypto.createHmac('md5', key).update(signStr).digest('base64');
const token = `version=${version}&res=${encodeURIComponent(res)}&et=${et}&method=${method}&sign=${encodeURIComponent(sign)}`;

// 使用 IP 直连 + WebSocket 路径
const client = mqtt.connect('wss://183.230.40.33:443/mqtt', {
    clientId: productId + deviceName,
    username: productId,
    password: token,
    clean: true,
    rejectUnauthorized: false
});

client.on('connect', () => {
    console.log('模拟设备上线成功');
    client.subscribe(`$sys/${productId}/${deviceName}/thingmodel/property/set`, (err) => {
        if (err) {
            console.error('订阅失败:', err);
        } else {
            console.log('已订阅属性设置主题，等待平台下发...');
        }
    });
});

client.on('message', (topic, payload) => {
    try {
        const data = JSON.parse(payload.toString());
        console.log('\n收到平台下发属性:', JSON.stringify(data, null, 2));
        const id = data.id;
        const navText = data.params?.nav_text;
        if (navText) {
            console.log('>>> AI 语音文本:', navText);
            const reply = { id, code: 200, msg: 'success' };
            client.publish(
                `$sys/${productId}/${deviceName}/thingmodel/property/set/reply`,
                JSON.stringify(reply),
                (err) => {
                    if (err) console.error('回复失败:', err);
                    else console.log('✅ 已回复平台，全链路验证成功！');
                }
            );
        }
    } catch (e) {
        console.error('消息解析错误:', e);
    }
});

client.on('error', (err) => {
    console.error('MQTT连接错误:', err.message);
});