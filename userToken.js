const crypto = require('crypto');

const userAccessKey = 'f0c1e8c5e67a48968643e90af1271e17';
const userId = '511380';

const version = '2022-05-01';
const res = `userid/${userId}`;
const et = Math.ceil((Date.now() + 3600000) / 1000);
const method = 'sha1';
const base64Key = Buffer.from(userAccessKey, 'base64');
const signStr = et + '\n' + method + '\n' + res + '\n' + version;
const hmac = crypto.createHmac('sha1', base64Key).update(signStr).digest('base64');
const token = `version=${version}&res=${encodeURIComponent(res)}&et=${et}&method=${method}&sign=${encodeURIComponent(hmac)}`;

console.log('Authorization: ' + token);
