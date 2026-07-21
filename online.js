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

// 关键：使用 IP 直连，避免 DNS 解析失败
const client = mqtt.connect('mqtts://183.230.40.33:1883', {
    clientId: productId + deviceName,
    username: productId,
    password: token,
    clean: true,
    rejectUnauthorized: false
});

client.on('connect', () => {
    console.log('>>> 设备上线成功！现在去执行 curl 命令吧！ <<<');
});

client.on('error', (err) => {
    console.error('连接失败:', err.message);
});