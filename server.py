import http.server
import socketserver
import urllib.request
import json

PORT = 8080

class MyHandler(http.server.SimpleHTTPRequestHandler):
    # 处理 /api/send 的POST请求
    def do_POST(self):
        if self.path == '/api/send':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            # 转发到 OneNET API
            req = urllib.request.Request(
                'https://iot-api.heclouds.com/mqtt/thing/property/set',
                data=post_data,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s'
                }
            )
            try:
                with urllib.request.urlopen(req) as resp:
                    result = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(result)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode())
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
    httpd.serve_forever()import http.server
import socketserver
import urllib.request
import json

PORT = 8080

class MyHandler(http.server.SimpleHTTPRequestHandler):
    # 处理 /api/send 的POST请求
    def do_POST(self):
        if self.path == '/api/send':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            # 转发到 OneNET API
            req = urllib.request.Request(
                'https://iot-api.heclouds.com/mqtt/thing/property/set',
                data=post_data,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s'
                }
            )
            try:
                with urllib.request.urlopen(req) as resp:
                    result = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(result)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode())
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