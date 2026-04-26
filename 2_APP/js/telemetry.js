export class TelemetryClient {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.reconnectTimer = null;
    }

    connect() {
        if (this.socket) {
            this.socket.close();
        }

        console.log(`Conectando a ${this.url}...`);
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log('Conectado a la telemetría.');
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(true);
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
            } catch (err) {
                console.error("Error parseando telemetría:", err);
            }
        };

        this.socket.onclose = () => {
            console.log('Desconectado. Intentando reconectar...');
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
            this.socket = null;
            this.reconnectTimer = setTimeout(() => this.connect(), 2000);
        };

        this.socket.onerror = (err) => {
            console.error('WebSocket Error:', err);
            this.socket.close(); // Forzar onclose para reconectar
        };
    }

    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    onStatusChange(callback) {
        this.onStatusChangeCallback = callback;
    }

    sendCommand(cmdStr) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(cmdStr);
        }
    }
}
