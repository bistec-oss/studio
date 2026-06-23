// Deterministic HTML fixture returned by the mock design agent
export const MOCK_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
body { margin: 0; width: 1080px; height: 1080px; background: #0f172a; display: flex; align-items: center; justify-content: center; }
.card { color: #7dd3fc; font-family: Inter, sans-serif; font-size: 48px; text-align: center; padding: 40px; }
</style>
</head>
<body><div class="card">TEST POST</div></body>
</html>`

// Minimal 1×1 transparent PNG buffer for mock Puppeteer output
export const MOCK_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export const MOCK_PNG_BUFFER = Buffer.from(MOCK_PNG_B64, 'base64')
