#!/bin/bash
# UrhoX Headless Screenshot QA - 一键安装
# 在无 sudo 的受限环境中安装 Puppeteer + 缺失系统库

set -e

LIBDIR="$HOME/.local/lib"
DEBS_DIR="/tmp/qa-debs"

echo "=== UrhoX Headless Screenshot QA Setup ==="
echo ""

# 1. 安装 Puppeteer
echo "[1/3] Installing Puppeteer..."
cd /workspace/test/qa-tools
if [ -d node_modules/puppeteer ]; then
    echo "  Puppeteer already installed"
else
    export http_proxy=http://127.0.0.1:1080
    export https_proxy=http://127.0.0.1:1080
    npm install puppeteer 2>&1 | tail -3
fi

# 2. 检查 Chromium 缺失的库
CHROME=$(node -e "console.log(require('puppeteer').executablePath())")
echo ""
echo "[2/3] Checking Chromium dependencies..."
echo "  Chrome: $CHROME"

MISSING=$(LD_LIBRARY_PATH=$LIBDIR:$LD_LIBRARY_PATH ldd "$CHROME" 2>/dev/null | grep "not found" | wc -l)
if [ "$MISSING" -eq 0 ]; then
    echo "  All dependencies satisfied"
else
    echo "  Missing libraries: $MISSING"
    echo "  Downloading from Ubuntu mirrors..."
    
    mkdir -p "$LIBDIR" "$DEBS_DIR"
    export http_proxy=http://127.0.0.1:1080
    export https_proxy=http://127.0.0.1:1080
    
    # 下载缺失的 .deb 包
    MIRROR="http://mirrors.aliyun.com/ubuntu/pool/main"
    URLS=(
        "$MIRROR/n/nspr/libnspr4_4.35-1.1build1_amd64.deb"
        "$MIRROR/n/nss/libnss3_3.98-1build1_amd64.deb"
        "$MIRROR/a/at-spi2-core/libatk1.0-0t64_2.52.0-1build1_amd64.deb"
        "$MIRROR/a/at-spi2-core/libatk-bridge2.0-0t64_2.52.0-1build1_amd64.deb"
        "$MIRROR/a/at-spi2-core/libatspi2.0-0t64_2.52.0-1build1_amd64.deb"
        "$MIRROR/c/cups/libcups2t64_2.4.7-1.2ubuntu7_amd64.deb"
        "$MIRROR/libx/libxcomposite/libxcomposite1_0.4.6-1build3_amd64.deb"
        "$MIRROR/libx/libxdamage/libxdamage1_1.1.6-1build1_amd64.deb"
        "$MIRROR/a/avahi/libavahi-common3_0.8-13ubuntu6_amd64.deb"
        "$MIRROR/a/avahi/libavahi-client3_0.8-13ubuntu6_amd64.deb"
    )
    
    cd "$DEBS_DIR"
    for url in "${URLS[@]}"; do
        fname=$(basename "$url")
        if [ ! -f "$fname" ] || [ $(stat -c%s "$fname") -lt 1000 ]; then
            curl -sL -o "$fname" "$url"
        fi
    done
    
    # 用 Python 解压 .so（因为环境没有 ar 命令）
    python3 - "$DEBS_DIR" "$LIBDIR" << 'PYEOF'
import os, sys, tarfile, io, lzma, gzip, subprocess

debs_dir, libdir = sys.argv[1], sys.argv[2]
os.makedirs(libdir, exist_ok=True)
AR_MAGIC = b'!<arch>\n'

for fname in sorted(os.listdir(debs_dir)):
    if not fname.endswith('.deb'): continue
    fpath = os.path.join(debs_dir, fname)
    if os.path.getsize(fpath) < 1000: continue
    with open(fpath, 'rb') as f:
        if f.read(8) != AR_MAGIC: continue
        while True:
            header = f.read(60)
            if len(header) < 60: break
            name = header[:16].strip().decode()
            try: member_size = int(header[48:58].strip().decode())
            except: break
            data = f.read(member_size)
            if member_size % 2 == 1: f.read(1)
            if not name.startswith('data.tar'): continue
            try:
                if name.endswith('.zst'):
                    r = subprocess.run(['zstd','-d','--stdout'], input=data, capture_output=True)
                    tar_data = r.stdout
                elif name.endswith('.xz'): tar_data = lzma.decompress(data)
                elif name.endswith('.gz'): tar_data = gzip.decompress(data)
                else: tar_data = data
                tf = tarfile.open(fileobj=io.BytesIO(tar_data))
                for m in tf.getmembers():
                    if '.so' in m.name:
                        m.name = os.path.basename(m.name)
                        tf.extract(m, libdir)
                tf.close()
            except: pass
PYEOF
    
    # 重新检查
    MISSING=$(LD_LIBRARY_PATH=$LIBDIR:$LD_LIBRARY_PATH ldd "$CHROME" 2>/dev/null | grep "not found" | wc -l)
    echo "  After fix: $MISSING missing libraries"
fi

# 3. 验证
echo ""
echo "[3/3] Verifying..."
cd /workspace/test/qa-tools
LD_LIBRARY_PATH=$LIBDIR:$LD_LIBRARY_PATH node -e "
const p = require('puppeteer');
(async () => {
    const b = await p.launch({headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-first-run','--no-zygote','--single-process'],env:{...process.env,LD_LIBRARY_PATH:'$LIBDIR:'+(process.env.LD_LIBRARY_PATH||'')}});
    console.log('  Chrome', await b.version(), '- OK');
    await b.close();
})();
" 2>&1

echo ""
echo "=== Setup Complete ==="
echo "Usage: LD_LIBRARY_PATH=$LIBDIR:\$LD_LIBRARY_PATH node screenshot-qa.js"
