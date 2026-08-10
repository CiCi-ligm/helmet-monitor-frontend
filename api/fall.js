const axios = require('axios');

module.exports = async (req, res) => {
  // GET 请求：返回 msg 参数，通过 OneNET 验证
  if (req.method === 'GET') {
    return res.send(req.query.msg || '');
  }

  // POST 请求：收到摔倒数据，转发给 Server 酱
  if (req.method === 'POST') {
    try {
      await axios.post('https://sctapi.ftqq.com/SCT384452T1uN1Lq5R2P5ZrEabTNmyImaA.send', {
        title: '【智能头盔-摔倒警报】',
        desp: '设备触发摔倒上报，上报数据：' + JSON.stringify(req.body)
      });
      return res.status(200).send('success');
    } catch (err) {
      return res.status(200).send('ok');
    }
  }

  res.status(405).send('Method Not Allowed');
};