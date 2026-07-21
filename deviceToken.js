const crypto = require('crypto');

// 新设备密钥
const deviceAccessKey = 'dzdoVnBFZDNwUk1iU3RQcGl2Z0xGRXYxWGNjNWc4V1g=';
const productId = 'G2ddPjoILg';
const deviceId = '2587890563';

const version = '2022-05-01';
const res = `products/${productId}/devices/${deviceId}`;
const et = Math.ceil((Date.now() + 3600000) / 1000);
const method = 'sha1';
const base64Key = Buffer.from(deviceAccessKey, 'base64');
const signStr = et + '\n' + method + '\n' + res + '\n' + version;
const hmac = crypto.createHmac('sha1', base64Key).update(signStr).digest('base64');
const token = `version=${version}&res=${encodeURIComponent(res)}&et=${et}&method=${method}&sign=${encodeURIComponent(hmac)}`;

console.log('Authorization: ' + token);
