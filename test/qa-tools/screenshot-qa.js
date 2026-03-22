// UrhoX Headless QA Tool — Automated Player
/**
 * UrhoX Headless QA Tool — "Automated Player"
 *
 * 在无 GPU 的受限环境下，通过 Puppeteer + SwiftShader 软件渲染
 * 自动加载 UrhoX WASM 游戏，执行交互操作，截图 + 采集全量运行数据。
 *
 * ── 两种运行模式 ──
 *
 * 模式 A：纯截图模式（向后兼容，不传 --actions）
 *   node screenshot-qa.js --wait=25 --shots=3 --interval=5
 *
 * 模式 B：Action Script 模式（传 --actions=<file.json>）
 *   node screenshot-qa.js --actions=my-test.json
 *
 * ── Action Script JSON 格式 ──
 *
 *   {
 *     "description": "测试主菜单交互",
 *     "viewport": { "width": 1280, "height": 720 },
 *     "waitForEngine": 20,
 *     "actions": [
 *       { "type": "screenshot", "name": "initial" },
 *       { "type": "click", "x": 640, "y": 400 },
 *       { "type": "wait", "duration": 2 },
 *       { "type": "screenshot", "name": "after-click" },
 *       { "type": "key", "key": "Escape" },
 *       { "type": "wait", "duration": 1 },
 *       { "type": "screenshot", "name": "after-escape" },
 *       { "type": "log-snapshot", "name": "final-logs" }
 *     ]
 *   }
 *
 * ── 支持的 Action 类型 ──
 *
 *   screenshot     截图          { name?: string }
 *   click          鼠标点击      { x, y, button?: "left"|"middle"|"right", clickCount?: 1|2 }
 *   mouse-move     鼠标移动      { x, y }
 *   mouse-down     鼠标按下      { x, y, button?: "left" }
 *   mouse-up       鼠标松开      { x, y, button?: "left" }
 *   mouse-drag     鼠标拖拽      { fromX, fromY, toX, toY, steps?: 10, button?: "left" }
 *   key            键盘按键      { key: string (Puppeteer key name) }
 *   key-down       键盘按下      { key: string }
 *   key-up         键盘松开      { key: string }
 *   type           键盘输入文本  { text: string, delay?: 50 }
 *   touch-tap      触控点击      { x, y }
 *   touch-swipe    触控滑动      { fromX, fromY, toX, toY, duration?: 300 }
 *   wait           等待          { duration: seconds }
 *   wait-for-log   等待特定日志  { pattern: string, timeout?: 10 }
 *   log-snapshot   日志快照      { name: string }
 *   evaluate       执行JS表达式  { expression: string }
 *   repeat         重复执行      { count: number, actions: Action[] }
 *
 * ── 通用 CLI 选项 ──
 *
 *   --width=N        视口宽度（默认 1280，action script 中可覆盖）
 *   --height=N       视口高度（默认 720）
 *   --wait=N         等待引擎加载的秒数（默认 20，action script 中可覆盖）
 *   --shots=N        截图数量（默认 3，仅模式A）
 *   --interval=N     截图间隔秒数（默认 5，仅模式A）
 *   --output=DIR     输出目录（默认 ./screenshots）
 *   --port=N         本地服务端口（默认 8091）
 *   --dist=PATH      dist 目录路径（默认 /workspace/dist）
 *   --log-file=PATH  日志输出文件（默认 output/console.log）
 *   --actions=FILE   Action Script JSON 文件路径（启用模式B）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// ── 参数解析 ──
function parseArgs() {
    const args = {
        width: 1280, height: 720, wait: 20, shots: 3, interval: 5,
        output: './screenshots', port: 8091, dist: '/workspace/dist',
        logFile: null, actions: null,
    };
    for (const arg of process.argv.slice(2)) {
        const m = arg.match(/^--(\w[\w-]*)=(.+)$/);
        if (m) {
            const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            args[key] = isNaN(m[2]) ? m[2] : Number(m[2]);
        }
    }
    if (!args.logFile) args.logFile = path.join(args.output, 'console.log');
    return args;
}

// ── MIME 映射 ──
const MIME = {
    '.html': 'text/html', '.js': 'application/javascript',
    '.json': 'application/json', '.wasm': 'application/wasm',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.lua': 'text/plain',
    '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

// ── 静态文件服务（带 COOP/COEP 头） ──
function createServer(distPath, port) {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const fp = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath);
            fs.readFile(fp, (err, data) => {
                if (err) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, {
                    'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                });
                res.end(data);
            });
        });
        srv.listen(port, () => resolve(srv));
    });
}

// ── 日志收集器 ──
class LogCollector {
    constructor() {
        this.logs = [];
        this.errors = [];
        this.engineEvents = [];
        this._snapshots = {};
    }

    onConsole(msg) {
        const text = msg.text();
        const type = msg.type();
        const entry = { time: Date.now(), type, text };
        this.logs.push(entry);

        // 提取引擎关键事件
        if (text.includes('[UrhoX]') || text.includes('INFO:') ||
            text.includes('ERROR') || text.includes('Start()') ||
            text.includes('Loading screen')) {
            this.engineEvents.push({ time: entry.time, text });
        }
    }

    onError(err) {
        this.errors.push({ time: Date.now(), message: err.message });
    }

    /** 创建当前时刻的日志快照 */
    snapshot(name) {
        this._snapshots[name] = {
            time: Date.now(),
            logCount: this.logs.length,
            errorCount: this.errors.length,
            recentLogs: this.logs.slice(-30).map(e => `[${e.type}] ${e.text}`),
            recentErrors: this.errors.slice(-10).map(e => e.message),
        };
    }

    /** 等待指定模式的日志出现 */
    async waitForLog(pattern, timeoutSec = 10) {
        const regex = new RegExp(pattern);
        const start = Date.now();
        const deadline = start + timeoutSec * 1000;

        // 先检查已有日志
        for (const entry of this.logs) {
            if (regex.test(entry.text)) return { found: true, elapsed: 0, text: entry.text };
        }

        // 轮询新日志
        const startIdx = this.logs.length;
        while (Date.now() < deadline) {
            for (let i = startIdx; i < this.logs.length; i++) {
                if (regex.test(this.logs[i].text)) {
                    return { found: true, elapsed: Date.now() - start, text: this.logs[i].text };
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }
        return { found: false, elapsed: Date.now() - start, text: null };
    }

    /** 生成纯文本日志（向后兼容） */
    toPlainText() {
        return this.logs.map(e => `[${e.type}] ${e.text}`).join('\n');
    }

    /** 生成报告数据 */
    toReportData() {
        return {
            engineEvents: this.engineEvents.map(e => e.text),
            errorCount: this.errors.length,
            errors: this.errors.slice(0, 20).map(e => e.message),
            logCount: this.logs.length,
            logSnapshots: this._snapshots,
        };
    }
}

// ── Action 执行器 ──
class ActionExecutor {
    constructor(page, outputDir, logCollector) {
        this.page = page;
        this.outputDir = outputDir;
        this.collector = logCollector;
        this.screenshotIndex = 0;
        this.results = [];
    }

    async execute(action) {
        const start = Date.now();
        let result = { action: action.type, status: 'ok', detail: null };

        try {
            switch (action.type) {
                case 'screenshot':
                    result.detail = await this._screenshot(action);
                    break;
                case 'click':
                    await this._click(action);
                    result.detail = { x: action.x, y: action.y, button: action.button || 'left' };
                    break;
                case 'mouse-move':
                    await this.page.mouse.move(action.x, action.y);
                    result.detail = { x: action.x, y: action.y };
                    break;
                case 'mouse-down':
                    await this.page.mouse.move(action.x, action.y);
                    await this.page.mouse.down({ button: action.button || 'left' });
                    result.detail = { x: action.x, y: action.y };
                    break;
                case 'mouse-up':
                    await this.page.mouse.move(action.x, action.y);
                    await this.page.mouse.up({ button: action.button || 'left' });
                    result.detail = { x: action.x, y: action.y };
                    break;
                case 'mouse-drag':
                    result.detail = await this._drag(action);
                    break;
                case 'key':
                    await this.page.keyboard.press(action.key);
                    result.detail = { key: action.key };
                    break;
                case 'key-down':
                    await this.page.keyboard.down(action.key);
                    result.detail = { key: action.key };
                    break;
                case 'key-up':
                    await this.page.keyboard.up(action.key);
                    result.detail = { key: action.key };
                    break;
                case 'type':
                    await this.page.keyboard.type(action.text, { delay: action.delay || 50 });
                    result.detail = { text: action.text };
                    break;
                case 'touch-tap':
                    await this.page.touchscreen.tap(action.x, action.y);
                    result.detail = { x: action.x, y: action.y };
                    break;
                case 'touch-swipe':
                    result.detail = await this._touchSwipe(action);
                    break;
                case 'wait':
                    await new Promise(r => setTimeout(r, (action.duration || 1) * 1000));
                    result.detail = { duration: action.duration || 1 };
                    break;
                case 'wait-for-log':
                    result.detail = await this.collector.waitForLog(
                        action.pattern, action.timeout || 10
                    );
                    if (!result.detail.found) result.status = 'timeout';
                    break;
                case 'log-snapshot':
                    this.collector.snapshot(action.name);
                    result.detail = { name: action.name };
                    break;
                case 'evaluate':
                    const evalResult = await this.page.evaluate(action.expression);
                    result.detail = { expression: action.expression, result: evalResult };
                    break;
                case 'repeat':
                    result.detail = await this._repeat(action);
                    break;
                default:
                    result.status = 'unknown-action';
                    result.detail = { type: action.type };
            }
        } catch (err) {
            result.status = 'error';
            result.detail = { error: err.message };
        }

        result.elapsed = Date.now() - start;
        this.results.push(result);
        return result;
    }

    async _screenshot(action) {
        this.screenshotIndex++;
        const name = action.name || `shot-${this.screenshotIndex}`;
        const filename = `${name}.png`;
        const filepath = path.join(this.outputDir, filename);
        await this.page.screenshot({ path: filepath, fullPage: false });
        const stat = fs.statSync(filepath);
        const info = { file: filename, size: stat.size, time: new Date().toISOString() };
        console.log(`  Screenshot: ${filename} (${(stat.size / 1024).toFixed(1)}KB)`);
        return info;
    }

    async _click(action) {
        const opts = { button: action.button || 'left' };
        if (action.clickCount) opts.clickCount = action.clickCount;
        await this.page.mouse.click(action.x, action.y, opts);
    }

    async _drag(action) {
        const steps = action.steps || 10;
        const button = action.button || 'left';
        await this.page.mouse.move(action.fromX, action.fromY);
        await this.page.mouse.down({ button });
        // 分步移动到目标位置
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = action.fromX + (action.toX - action.fromX) * t;
            const y = action.fromY + (action.toY - action.fromY) * t;
            await this.page.mouse.move(x, y);
            await new Promise(r => setTimeout(r, 16)); // ~60fps
        }
        await this.page.mouse.up({ button });
        return { from: [action.fromX, action.fromY], to: [action.toX, action.toY], steps };
    }

    async _touchSwipe(action) {
        const duration = action.duration || 300;
        const steps = Math.max(5, Math.floor(duration / 16));
        // Puppeteer 的 touchscreen 没有原生 swipe，用 mouse 事件模拟
        // 触发 touch start
        await this.page.touchscreen.touchStart(action.fromX, action.fromY);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = action.fromX + (action.toX - action.fromX) * t;
            const y = action.fromY + (action.toY - action.fromY) * t;
            await this.page.touchscreen.touchMove(x, y);
            await new Promise(r => setTimeout(r, duration / steps));
        }
        await this.page.touchscreen.touchEnd();
        return { from: [action.fromX, action.fromY], to: [action.toX, action.toY], duration };
    }

    async _repeat(action) {
        const count = action.count || 1;
        const subActions = action.actions || [];
        const subResults = [];
        for (let i = 0; i < count; i++) {
            const iterResults = [];
            for (const subAction of subActions) {
                iterResults.push(await this.execute(subAction));
            }
            subResults.push({ iteration: i + 1, results: iterResults });
        }
        return { count, iterations: subResults };
    }
}

// ── 模式 A: 纯截图模式（向后兼容） ──
async function runLegacyMode(page, args, collector) {
    console.log(`Waiting ${args.wait}s for engine initialization...`);
    await new Promise(r => setTimeout(r, args.wait * 1000));

    const screenshots = [];
    for (let i = 1; i <= args.shots; i++) {
        const filename = `shot-${i}.png`;
        const filepath = path.join(args.output, filename);
        await page.screenshot({ path: filepath, fullPage: false });

        const stat = fs.statSync(filepath);
        screenshots.push({ file: filename, size: stat.size, time: new Date().toISOString() });
        console.log(`  Screenshot ${i}/${args.shots}: ${filename} (${(stat.size / 1024).toFixed(1)}KB)`);

        if (i < args.shots) {
            await new Promise(r => setTimeout(r, args.interval * 1000));
        }
    }
    return screenshots;
}

// ── 模式 B: Action Script 模式 ──
async function runActionMode(page, args, collector, script) {
    // Action Script 可覆盖 wait 时间
    const waitTime = script.waitForEngine != null ? script.waitForEngine : args.wait;
    console.log(`Waiting ${waitTime}s for engine initialization...`);
    await new Promise(r => setTimeout(r, waitTime * 1000));

    const executor = new ActionExecutor(page, args.output, collector);

    console.log(`\nExecuting ${script.actions.length} actions...`);
    for (let i = 0; i < script.actions.length; i++) {
        const action = script.actions[i];
        const label = action.name || action.type;
        process.stdout.write(`  [${i + 1}/${script.actions.length}] ${action.type}`);
        if (action.name) process.stdout.write(` (${action.name})`);

        const result = await executor.execute(action);

        if (result.status === 'ok') {
            console.log(' ✓');
        } else if (result.status === 'timeout') {
            console.log(` ⏱ timeout`);
        } else {
            console.log(` ✗ ${result.status}: ${result.detail?.error || ''}`);
        }
    }

    return executor.results;
}

// ── 主流程 ──
async function main() {
    const args = parseArgs();
    const LIBDIR = '/home/Maker/.local/lib';

    // 加载 Action Script（如果有）
    let actionScript = null;
    if (args.actions) {
        const scriptPath = path.resolve(args.actions);
        if (!fs.existsSync(scriptPath)) {
            console.error(`Action script not found: ${scriptPath}`);
            process.exit(2);
        }
        actionScript = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
        // Action Script 中的 viewport 覆盖 CLI 参数
        if (actionScript.viewport) {
            args.width = actionScript.viewport.width || args.width;
            args.height = actionScript.viewport.height || args.height;
        }
    }

    fs.mkdirSync(args.output, { recursive: true });

    const mode = actionScript ? 'Action Script' : 'Legacy Screenshot';
    console.log('=== UrhoX Headless QA — Automated Player ===');
    console.log(`Mode: ${mode}`);
    console.log(`Viewport: ${args.width}x${args.height}`);
    if (actionScript) {
        console.log(`Script: ${args.actions}`);
        console.log(`Description: ${actionScript.description || '(none)'}`);
        console.log(`Actions: ${actionScript.actions.length}`);
    } else {
        console.log(`Wait: ${args.wait}s, Shots: ${args.shots}, Interval: ${args.interval}s`);
    }
    console.log(`Dist: ${args.dist}`);
    console.log(`Output: ${args.output}`);

    // 1. 启动静态服务
    const server = await createServer(args.dist, args.port);
    console.log(`\nServer started on port ${args.port}`);

    // 2. 启动浏览器
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run', '--no-zygote', '--single-process',
            '--use-gl=angle', '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--enable-webgl', '--enable-webgl2',
            '--ignore-gpu-blocklist',
            '--enable-features=SharedArrayBuffer',
        ],
        env: { ...process.env, LD_LIBRARY_PATH: LIBDIR + ':' + (process.env.LD_LIBRARY_PATH || '') },
    });

    const page = await browser.newPage();
    await page.setViewport({ width: args.width, height: args.height });

    // 3. 日志收集
    const collector = new LogCollector();
    page.on('console', msg => collector.onConsole(msg));
    page.on('pageerror', err => collector.onError(err));

    // 4. 加载页面
    console.log('\nLoading game page...');
    await page.goto(`http://localhost:${args.port}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });

    // 5. 执行模式
    let screenshots = [];
    let actionResults = [];

    if (actionScript) {
        actionResults = await runActionMode(page, args, collector, actionScript);
        // 从 action results 中提取截图信息
        screenshots = actionResults
            .filter(r => r.action === 'screenshot' && r.status === 'ok' && r.detail?.file)
            .map(r => r.detail);
    } else {
        screenshots = await runLegacyMode(page, args, collector);
    }

    // 6. 生成报告
    const logData = collector.toReportData();
    const report = {
        timestamp: new Date().toISOString(),
        mode: actionScript ? 'action-script' : 'legacy',
        viewport: { width: args.width, height: args.height },
        browserVersion: await browser.version(),
        screenshots,
        ...logData,
    };

    // Action Script 模式：追加 action 执行结果
    if (actionScript) {
        report.actionScript = {
            description: actionScript.description || null,
            totalActions: actionScript.actions.length,
            results: actionResults,
            summary: {
                ok: actionResults.filter(r => r.status === 'ok').length,
                timeout: actionResults.filter(r => r.status === 'timeout').length,
                error: actionResults.filter(r => r.status === 'error').length,
                unknown: actionResults.filter(r => r.status === 'unknown-action').length,
            },
        };
    }

    fs.writeFileSync(path.join(args.output, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(args.logFile, collector.toPlainText());
    if (collector.errors.length > 0) {
        fs.writeFileSync(
            path.join(args.output, 'errors.log'),
            collector.errors.map(e => e.message).join('\n')
        );
    }

    // 7. 输出摘要
    console.log('\n=== Report ===');
    console.log(`Mode: ${report.mode}`);
    console.log(`Browser: ${report.browserVersion}`);
    console.log(`Screenshots: ${screenshots.length}`);
    console.log(`Engine events: ${logData.engineEvents.length}`);
    console.log(`Errors: ${logData.errorCount}`);
    console.log(`Total console logs: ${logData.logCount}`);
    if (report.actionScript) {
        const s = report.actionScript.summary;
        console.log(`Actions: ${s.ok} ok, ${s.timeout} timeout, ${s.error} error`);
    }
    if (Object.keys(logData.logSnapshots).length > 0) {
        console.log(`Log snapshots: ${Object.keys(logData.logSnapshots).join(', ')}`);
    }
    console.log(`\nOutput: ${path.resolve(args.output)}/`);

    // 8. 清理
    await browser.close();
    server.close();

    // 退出码：有 JS 错误或 action 错误返回 1
    const hasCriticalError = collector.errors.some(e =>
        !e.message.includes('getInternalformatParameter') &&
        !e.message.includes('INVALID_ENUM')
    );
    const hasActionError = actionResults.some(r => r.status === 'error');
    process.exit((hasCriticalError || hasActionError) ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(2); });
