// ============================================================
// PRÁTICAS — registro do que acontece em Rezar, para Frutos
// ============================================================
// Terço concluído, oração aberta no leitor, Lectio, Respiro, exame e rituais
// gravam um evento { type, at } em ora_practice_log (FrutosCore.appendPractice).
// A fila ordena chamadas nesta página; o Web Lock coordena a gravação entre abas.
// Dependências: AsyncStorage, FrutosCore.

const PracticeLog = {
    KEY: 'ora_practice_log',
    queue: Promise.resolve(true),

    init: function() {
        this.cacheDOM();
        this.bindEvents();
    },
    cacheDOM: function() {},
    bindEvents: function() {},

    // Devolve true quando a gravação foi confirmada
    record: function(type, extra) {
        const event = Object.assign({ type, at: Date.now() }, extra || {});
        const write = async () => {
            const current = await AsyncStorage.get(this.KEY, []);
            const next = FrutosCore.appendPractice(Array.isArray(current) ? current : [], event);
            const last = next[next.length - 1];
            if (!last || last.type !== event.type || last.at !== event.at) return true; // já registrado hoje
            const ok = await AsyncStorage.set(this.KEY, next);
            if (!ok) console.warn('[Ora] Practice not recorded:', type);
            return ok;
        };
        this.queue = this.queue.catch(() => false).then(() =>
            navigator.locks ? navigator.locks.request('ora-practices-write', write) : write()
        );
        return this.queue;
    }
};

window.PracticeLog = PracticeLog;
