const crypto = require('crypto');

const accessKey = 'zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s=';
const productId = 'G2ddPjoILg';

function generateAuthToken() {
  const version = '2022-05-01';
  // 关键修改：res 只写到产品，不加设备
  const res = `products/${productId}`;
  const et = Math.ceil((Date.now() + 3600000) / 1000);
  const method = 'sha1';

  const base64Key = Buffer.from(accessKey, 'base64');
  const StringForSignature = et + '\n' + method + '\n' + res + '\n' + version;
  const hmac = crypto.createHmac('sha1', base64Key);
  hmac.update(StringForSignature);
  const sign = hmac.digest('base64');

  const encodeRes = encodeURIComponent(res);
  const encodeSign = encodeURIComponent(sign);

  return `version=${version}&res=${encodeRes}&et=${et}&method=${method}&sign=${encodeSign}`;
}

console.log('Authorization: ' + generateAuthToken());
