from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.request

PRODUCT_ID = "G2ddPjoILg"
DEVICE_NAME = "gps"
ACCESS_KEY = "zwcf9R9tkduLoePvpSEpg2XToeMNgU8NJyNridtN84s"

# 导航网页（无登录跳转，只加载一次）
NAV_PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>智能头盔导航</title>
  <script>
    window._AMapSecurityConfig = { securityJsCode: "fc5eab52eb041ff4874aba0dd149d954" };
  </script>
  <script src="https://webapi.amap.com/maps?v=2.0&key=977b6123358698744cd4f2a96e219145&plugin=AMap.AutoComplete,AMap.Geolocation,AMap.Walking,AMap.Riding"></script>
  <style>
    * {margin:0;padding:0;box-sizing:border-box;font-family:Arial,"Microsoft Yahei"}
    html,body{height:100%;overflow:hidden}
    #container{width:100%;height:100vh}
    .input-box{position:fixed;top:0;left:0;right:0;z-index:9999;background:#fff;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,0.15);}
    .input-box input{width:100%;padding:10px 12px;font-size:16px;border:1px solid #ccc;border-radius:6px;margin-bottom:10px;outline:none;}
    .input-box input:focus{border-color:#1677ff}
    .btn-group{display:flex;gap:2%}
    .btn-group button{width:32%;padding:10px;background:#1677ff;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer;}
    .btn-group button.gray{background:#666}
    #suggest-list{position:fixed;top:110px;left:12px;right:12px;z-index:9998;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.15);max-height:260px;overflow-y:auto;display:none;}
    #suggest-list .item{padding:12px 14px;font-size:15px;border-bottom:1px solid #f0f0f0;cursor:pointer;}
    #suggest-list .highlight{color:#1677ff;font-weight:bold}
    #tip{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:rgba(0,0,0,0.7);color:#fff;padding:10px 20px;border-radius:20px;font-size:15px;}
    #nav-panel{position:fixed;left:12px;right:12px;bottom:75px;z-index:9998;background:#ffffff;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,0.25);max-height:220px;overflow-y:auto;padding:14px;display:none;border:1px solid #e8e8e8;}
    .nav-step{padding:8px 0 8px 24px;font-size:14px;position:relative;color:#555;line-height:1.6;border-bottom:1px solid #f5f5f5;}
    .nav-step::before{content:"●";position:absolute;left:8px;top:9px;color:#ccc;font-size:12px;}
    .nav-step.active{color:#1677ff;font-weight:500;background:#f0f7ff;border-radius:8px;margin:3px 0;padding-left:24px;}
    .nav-step.active::before{color:#1677ff;content:"▶";font-size:10px;left:8px;top:10px;}
    .tab-bar{position:fixed;bottom:0;left:0;right:0;height:60px;background:#fff;border-top:1px solid #eee;display:flex;justify-content:space-around;align-items:center;z-index:9999;}
    .tab-item{display:flex;flex-direction:column;align-items:center;font-size:12px;color:#666;text-decoration:none;gap:2px;}
    .tab-item.active{color:#2563eb}
    .tab-item .icon{font-size:22px}
  </style>
</head>
<body>
  <div id="container"></div>
  <div class="input-box">
    <input id="addressInput" placeholder="输入目的地" />
    <div class="btn-group">
      <button onclick="startNav('walking')">步行导航</button>
      <button onclick="startNav('riding')">骑行导航</button>
      <button class="gray" onclick="clearAll()">清空</button>
    </div>
  </div>
  <div id="suggest-list"></div>
  <div id="tip">正在定位...</div>
  <div id="nav-panel">
    <div id="nav-summary"></div>
    <div id="step-list"></div>
  </div>
  <div class="tab-bar">
    <span class="tab-item active"><span class="icon">🗺️</span><span>导航</span></span>
  </div>

  <script>
    const PROXY_URL = "http://192.168.43.5:8080/send";
    const PRODUCT_ID = "G2ddPjoILg";
    const DEVICE_NAME = "gps";

    let map, myMarker, currentPos, targetPos;
    let navSteps = [], currentStepIndex = 0, isNavigating = false, watchId = null;
    const ARRIVE_DIST = 30;

    window.onload = function(){
      map = new AMap.Map("container", { zoom: 16, resizeEnable: true, center: [104.5647, 28.7658] });
      initAutoComplete();
      getMyLocation();
    };

    function sendNavTextToCloud(text) {
      fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text })
      })
      .then(r => r.json())
      .then(d => {
        if (d.code === 0) alert("✅ 指令已下发: " + text);
        else alert("❌ 失败: " + JSON.stringify(d));
      })
      .catch(e => alert("❌ 请求失败: " + e.message));
    }

    function getMyLocation(){
      const tip = document.getElementById('tip');
      tip.innerText = "正在定位..."; tip.style.display = "block";
      new AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000 }).getCurrentPosition((status, result) => {
        if(status === "complete" && result.position){
          currentPos = result.position;
          if(myMarker) myMarker.setMap(null);
          myMarker = new AMap.Marker({ position: currentPos });
          myMarker.setMap(map);
          map.setCenter(currentPos);
          tip.style.display = "none";
        } else { tip.innerText = "定位失败"; }
      });
    }

    function initAutoComplete(){
      const autoComplete = new AMap.AutoComplete({ city: "宜宾" });
      let timer = null;
      document.getElementById('addressInput').addEventListener('input', function(){
        const keyword = this.value.trim();
        if(!keyword){ document.getElementById('suggest-list').style.display = "none"; return; }
        clearTimeout(timer);
        timer = setTimeout(()=>{
          autoComplete.search(keyword, (status, res) => {
            if(status === "complete" && res.tips && res.tips.length > 0){
              const list = document.getElementById('suggest-list');
              list.innerHTML = "";
              res.tips.forEach(tipItem => {
                if(!tipItem.location) return;
                const div = document.createElement('div');
                div.className = "item";
                div.innerHTML = tipItem.name.replace(new RegExp(`(${keyword})`, 'gi'), '<span class="highlight">$1</span>');
                div.onclick = () => {
                  document.getElementById('addressInput').value = tipItem.name;
                  targetPos = tipItem.location;
                  list.style.display = "none";
                };
                list.appendChild(div);
              });
              list.style.display = "block";
            }
          });
        }, 300);
      });
    }

    function startNav(type){
      if(!currentPos || !targetPos) return;
      isNavigating = true; currentStepIndex = 0; navSteps = [];
      const plugin = type === 'walking' ? 'AMap.Walking' : 'AMap.Riding';
      AMap.plugin(plugin, ()=>{
        const route = new (type === 'walking' ? AMap.Walking : AMap.Riding)({ map, hideMarkers: true, autoFitView: true });
        route.search(currentPos, targetPos, (status, res) => {
          if(status === "complete" && res.routes && res.routes.length > 0){
            const routeData = res.routes[0];
            let stepArr = [], distance = 0, duration = 0;
            if(routeData.paths && routeData.paths.length > 0){
              stepArr = routeData.paths[0].steps;
              distance = routeData.paths[0].distance;
              duration = routeData.paths[0].time || routeData.paths[0].duration;
            } else if(routeData.steps && routeData.steps.length > 0){
              stepArr = routeData.steps;
              distance = routeData.distance;
              duration = routeData.time || routeData.duration;
            }
            navSteps = stepArr.map(s => ({
              text: s.instruction.replace(/<[^>]+>/g, ''),
              endPos: new AMap.LngLat(s.path[s.path.length-1].lng, s.path[s.path.length-1].lat)
            }));
            document.getElementById('nav-summary').innerHTML = '🎯 ' + document.getElementById('addressInput').value + ' | ' + (type==='walking'?'步行':'骑行') + ' | ' + (distance/1000).toFixed(1) + 'km | 约' + Math.round(duration/60) + '分钟';
            document.getElementById('step-list').innerHTML = navSteps.map((step, i) => '<div class="nav-step ' + (i===0?'active':'') + '">' + step.text + '</div>').join('');
            document.getElementById('nav-panel').style.display = "block";
            if(watchId) navigator.geolocation.clearWatch(watchId);
            watchId = navigator.geolocation.watchPosition(
              (res) => {
                currentPos = new AMap.LngLat(res.coords.longitude, res.coords.latitude);
                if(myMarker) myMarker.setPosition(currentPos);
                if(isNavigating && currentStepIndex < navSteps.length && currentPos.distance(navSteps[currentStepIndex].endPos) < 30){
                  currentStepIndex++;
                  const items = document.getElementById('step-list').querySelectorAll('.nav-step');
                  items.forEach((el, idx) => el.classList.toggle('active', idx === currentStepIndex));
                  if(currentStepIndex < navSteps.length){
                    sendNavTextToCloud(navSteps[currentStepIndex].text);
                    voiceSpeak(navSteps[currentStepIndex].text);
                  } else {
                    voiceSpeak("已到达目的地");
                    endNav();
                  }
                }
              },
              () => {},
              { enableHighAccuracy: true, maximumAge: 2000 }
            );
            if(navSteps.length > 0){
              sendNavTextToCloud('开始' + (type==='walking'?'步行':'骑行') + '导航，' + navSteps[0].text);
              voiceSpeak('开始' + (type==='walking'?'步行':'骑行') + '导航，' + navSteps[0].text);
            }
          } else { alert("路线规划失败"); }
        });
      });
    }

    function endNav(){
      isNavigating = false; navSteps = [];
      if(watchId) navigator.geolocation.clearWatch(watchId);
      window.speechSynthesis.cancel();
      document.getElementById('nav-panel').style.display = "none";
    }

    function voiceSpeak(text) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = "zh-CN"; msg.rate = 1.1;
      speechSynthesis.speak(msg);
    }

    function clearAll(){
      document.getElementById('addressInput').value = ""; targetPos = null;
      endNav();
      document.getElementById('suggest-list').style.display = "none";
    }
  </script>
</body>
</html>"""

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(NAV_PAGE.encode())

    def do_POST(self):
        if self.path == '/send':
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length))
            text = body.get('text', '')

            # 1. 上报 nav_cmd（原有功能）
            api_url = f"https://iot-api.heclouds.com/mqtt/thing/property/set?product_id={PRODUCT_ID}&device_name={DEVICE_NAME}"
            req_body = json.dumps({"params": {"nav_cmd": {"value": text}}}).encode()
            req = urllib.request.Request(api_url, data=req_body, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ACCESS_KEY}"
            })
            try:
                with urllib.request.urlopen(req) as resp:
                    result_nav = json.loads(resp.read())
                    print("✅ nav_cmd 下发结果:", result_nav)
            except Exception as e:
                print("❌ nav_cmd 下发失败:", e)

            # 2. 下发 llm_down_cmd（模拟大模型指令，测试链路）
            llm_text = "前方左转，请注意安全"
            req_body2 = json.dumps({"params": {"llm_down_cmd": {"value": llm_text}}}).encode()
            req2 = urllib.request.Request(api_url, data=req_body2, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ACCESS_KEY}"
            })
            try:
                with urllib.request.urlopen(req2) as resp2:
                    result_llm = json.loads(resp2.read())
                    print("✅ llm_down_cmd 下发结果:", result_llm)
            except Exception as e:
                print("❌ llm_down_cmd 下发失败:", e)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"code": 0}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

print("服务器已启动，手机访问 http://192.168.43.5:8080")
HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()