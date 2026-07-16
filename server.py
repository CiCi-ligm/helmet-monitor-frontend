import http.server
import socketserver
import urllib.request
import json

PORT = 8080
PRODUCT_ID = "G2ddPjoILg"
DEVICE_NAME = "gps"
ACCESS_KEY = "zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s"

class MyHandler(http.server.SimpleHTTPRequestHandler):
    # 处理 /api/send 的POST请求
    def do_POST(self):
        if self.path == '/api/send':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            body = json.loads(post_data)
            text = body.get('text', '')

            # ===== 第1步：原有逻辑，设置 nav_cmd 属性 =====
            req1 = urllib.request.Request(
                f'https://iot-api.heclouds.com/mqtt/thing/property/set?product_id={PRODUCT_ID}&device_name={DEVICE_NAME}',
                data=json.dumps({"params": {"nav_cmd": {"value": text}}}).encode(),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {ACCESS_KEY}'
                }
            )
            try:
                with urllib.request.urlopen(req1) as resp1:
                    result1 = json.loads(resp1.read())
                    print("✅ nav_cmd 下发结果:", result1)
            except Exception as e:
                print("❌ nav_cmd 下发失败:", e)

            # ===== 第2步：新增，模拟大模型生成指令并下发 llm_down_cmd =====
            llm_text = "前方左转，请注意安全"  # 暂时写死，后面再接入大模型

            req2 = urllib.request.Request(
                f'https://iot-api.heclouds.com/mqtt/thing/property/set?product_id={PRODUCT_ID}&device_name={DEVICE_NAME}',
                data=json.dumps({"params": {"llm_down_cmd": {"value": llm_text}}}).encode(),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {ACCESS_KEY}'
                }
            )
            try:
                with urllib.request.urlopen(req2) as resp2:
                    result2 = json.loads(resp2.read())
                    print("✅ llm_down_cmd 下发结果:", result2)
            except Exception as e:
                print("❌ llm_down_cmd 下发失败:", e)

            # 返回给前端
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"code": 0}).encode())
        else:
            super().do_POST()

    # 让 GET 请求正常走静态文件
    def do_GET(self):
        super().do_GET()

    # 处理 OPTIONS 预检请求（解决跨域）
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

# 启动服务器
with socketserver.TCPServer(("0.0.0.0", PORT), MyHandler) as httpd:
    print(f"服务已启动，手机访问 http://你的电脑IP:{PORT}/index.html")
    httpd.serve_forever()