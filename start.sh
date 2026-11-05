#!/bin/zsh
# เปิดเว็บ LENSIQ
#   ./start.sh          ใช้บนเครื่องนี้       -> http://localhost:8000
#   ./start.sh mobile   ให้มือถือ/แท็บเล็ตในวง Wi-Fi เดียวกันใช้กล้องได้ (HTTPS) -> https://<IP เครื่องนี้>:8443
cd "$(dirname "$0")"
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; }
pkill -f "server.py" 2>/dev/null

if [ "$1" = "mobile" ]; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
  [ -n "$IP" ] || { echo "ไม่พบ IP ของเครื่อง — ตรวจว่าต่อ Wi-Fi อยู่"; exit 1; }
  mkdir -p certs
  # สร้างใบรับรองแบบ self-signed ใหม่เมื่อยังไม่มี หรือ IP เปลี่ยน
  if [ ! -f certs/cert.pem ] || [ "$(cat certs/ip.txt 2>/dev/null)" != "$IP" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout certs/key.pem -out certs/cert.pem -subj "/CN=LENSIQ local" \
      -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost" 2>/dev/null || { echo "สร้างใบรับรองไม่สำเร็จ"; exit 1; }
    echo "$IP" > certs/ip.txt
  fi
  echo "เปิดบนมือถือ: https://$IP:8443"
  echo "ครั้งแรกเบราว์เซอร์จะเตือนว่าไม่ปลอดภัย (ใบรับรองทำเอง) ให้กด 'ขั้นสูง' > 'ไปต่อ' / 'เยี่ยมชมเว็บไซต์นี้'"
  echo "ใช้เฉพาะในเครือข่ายที่ไว้ใจได้ (กด Ctrl+C เพื่อหยุด)"
  LENSIQ_MOBILE=1 exec .venv/bin/python server.py
fi

echo "เว็บรันที่ http://localhost:8000  (กด Ctrl+C เพื่อหยุด)"
exec .venv/bin/python server.py
