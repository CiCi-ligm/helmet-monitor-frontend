export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { text } = req.body;
  const apiUrl = "https://iot-api.heclouds.com/mqtt/thing/property/set?product_id=G2ddPjoILg&device_name=gps";

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s'
      },
      body: JSON.stringify({
        params: {
          nav_cmd: { value: text },
          llm_down_cmd: { value: "前方左转，请注意安全" }
        }
      })
    });
    const data = await resp.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}