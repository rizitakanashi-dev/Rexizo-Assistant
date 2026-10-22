import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig(function (_a) {
    var _b;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var API_KEY = (_b = env.JARVIS_API_KEY) !== null && _b !== void 0 ? _b : '';
    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            port: 5173,
            proxy: {
                '/api': {
                    target: 'http://127.0.0.1:8000',
                    changeOrigin: true,
                    configure: function (proxy) {
                        proxy.on('proxyReq', function (proxyReq) {
                            if (API_KEY)
                                proxyReq.setHeader('X-JARVIS-API-KEY', API_KEY);
                        });
                    },
                },
                '/ws': {
                    target: 'ws://127.0.0.1:8000',
                    ws: true,
                    changeOrigin: true,
                },
            },
        },
    };
});
