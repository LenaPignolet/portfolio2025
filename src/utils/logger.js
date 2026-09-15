/**
 * Système de logging centralisé pour tracker le flux complet
 * Accessible depuis le navigateur et le serveur
 */

class Logger {
    constructor() {
        this.logs = [];
        this.enabled = false; // toggle console output
        this.colors = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️',
            loading: '⏳',
            data: '📦',
            api: '🌐',
            cache: '💾',
            debug: '🔍',
        };
    }

    log(type, module, message, data = null) {
        const timestamp = new Date().toLocaleTimeString('fr-FR');
        const emoji = this.colors[type] || '•';
        const logEntry = {
            type,
            module,
            message,
            data,
            timestamp,
        };

        this.logs.push(logEntry);

        const formattedMessage = `[${timestamp}] ${emoji} [${module}] ${message}`;
        // Only output to console when enabled
        if (this.enabled) {
            if (data !== null) {
                if (typeof data === 'object') {
                    console.log(formattedMessage, data);
                } else {
                    console.log(`${formattedMessage}: ${data}`);
                }
            } else {
                console.log(formattedMessage);
            }
        }

        return logEntry;
    }

    success(module, message, data) {
        return this.log('success', module, message, data);
    }

    error(module, message, data) {
        return this.log('error', module, message, data);
    }

    info(module, message, data) {
        return this.log('info', module, message, data);
    }

    warning(module, message, data) {
        return this.log('warning', module, message, data);
    }

    loading(module, message, data) {
        return this.log('loading', module, message, data);
    }

    data(module, message, data) {
        return this.log('data', module, message, data);
    }

    api(module, message, data) {
        return this.log('api', module, message, data);
    }

    cache(module, message, data) {
        return this.log('cache', module, message, data);
    }

    debug(module, message, data) {
        return this.log('debug', module, message, data);
    }

    getAllLogs() {
        return this.logs;
    }

    clearLogs() {
        this.logs = [];
    }

    printAllLogs() {
        if (!this.enabled) return;
        console.group('📊 Tous les logs');
        this.logs.forEach((log) => {
            const emoji = this.colors[log.type] || '•';
            console.log(
                `[${log.timestamp}] ${emoji} [${log.module}] ${log.message}`,
                log.data || ''
            );
        });
        console.groupEnd();
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
    }
}

export const logger = new Logger();
