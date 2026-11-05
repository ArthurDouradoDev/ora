// ============================================================
// REMINDERS CORE — o espaço único de convite em Hoje
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Só um convite aparece por vez; os outros esperam a vez (prioridade
// pela ordem de INVITES). "Agora não" vale para o horário atual: o mesmo
// convite volta no próximo horário (ex.: Angelus das 12h → das 18h).
// Com uma sessão (de foco ou pausa) em andamento, nenhum convite aparece.
//
// handled: { 'YYYY-MM-DD:id:janela': true } — convites já atendidos ou adiados.
(function (global) {
    'use strict';

    // [início, fim) em horas locais
    // A manhã vem antes: é o primeiro convite da primeira aba do dia (fase 5)
    const INVITES = [
        { id: 'morning', setting: 'morning', windows: [[4, 12, 'manha']] },
        { id: 'angelus', setting: 'angelus', windows: [[6, 8, 'manha'], [12, 14, 'meio-dia'], [18, 21, 'tarde']] },
        { id: 'mercy', setting: 'mercy', windows: [[15, 16, '15h']] },
        { id: 'closeDay', setting: 'evening', windows: [[21, 24, 'noite'], [0, 4, 'madrugada']] },
        { id: 'midday', setting: 'midday', windows: [[11, 14, 'meio-dia']] },
        // Oração para usar a internet: uma vez por sessão do navegador, a qualquer hora
        { id: 'carlo', setting: 'carlo', perBrowserSession: true }
    ];
    const KEEP_DAYS = 2;

    function isoDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function toDate(now) {
        return now instanceof Date ? now : new Date(now || Date.now());
    }

    function windowAt(def, date) {
        const h = date.getHours();
        return (def.windows || []).find(([from, to]) => h >= from && h < to) || null;
    }

    function keyFor(id, windowName, date) {
        return `${isoDate(date)}:${id}:${windowName}`;
    }

    /**
     * Escolhe o convite do momento.
     *   now           — Date ou ms
     *   enabled       — { angelus, mercy, evening, midday, carlo } (ausente = ligado)
     *   handled       — mapa de convites já atendidos/adiados
     *   carloPending  — a oração de abertura ainda não foi vista nesta sessão do navegador
     *   sessionActive — há foco ou pausa em andamento (nenhum convite)
     *   skip          — ids que não devem aparecer agora (ex.: ritual já feito,
     *                   RitualsCore.hiddenInvites)
     * Devolve { id, window, key } ou null.
     */
    function pickInvite(opts) {
        const o = opts || {};
        if (o.sessionActive) return null;
        const date = toDate(o.now);
        const enabled = o.enabled || {};
        const handled = o.handled || {};
        const skip = Array.isArray(o.skip) ? o.skip : [];
        for (const def of INVITES) {
            if (enabled[def.setting] === false || skip.includes(def.id)) continue;
            if (def.perBrowserSession) {
                if (o.carloPending) return { id: def.id, window: 'sessao', key: null };
                continue;
            }
            const win = windowAt(def, date);
            if (!win) continue;
            const key = keyFor(def.id, win[2], date);
            if (handled[key]) continue;
            return { id: def.id, window: win[2], key };
        }
        return null;
    }

    // Marca o convite como atendido/adiado até o próximo horário. Remove
    // registros antigos. Devolve um mapa novo.
    function dismiss(handled, invite, now) {
        const date = toDate(now);
        const cutoff = isoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() - KEEP_DAYS));
        const next = {};
        for (const [key, value] of Object.entries(handled && typeof handled === 'object' ? handled : {})) {
            if (value && key.slice(0, 10) >= cutoff) next[key] = true;
        }
        if (invite && invite.key) next[invite.key] = true;
        return next;
    }

    // Marca um convite pelo id no horário atual (ex.: exame concluído por outro caminho).
    function dismissById(handled, id, now) {
        const date = toDate(now);
        const def = INVITES.find(d => d.id === id);
        const win = def ? windowAt(def, date) : null;
        return dismiss(handled, win ? { key: keyFor(id, win[2], date) } : null, date);
    }

    global.RemindersCore = {
        INVITES,
        pickInvite,
        dismiss,
        dismissById
    };
})(typeof self !== 'undefined' ? self : this);
