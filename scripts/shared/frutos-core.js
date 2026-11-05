// ============================================================
// FRUTOS CORE — o que de fato aconteceu no Ora, por semana ou mês
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Junta sessões de foco (ora_sessions), práticas (ora_practice_log), exames
// (ora_exam_logs) e tempo de tela (ora_screentime) em dias e numa síntese.
// Nada aqui julga: um dia sem registro é só "sem registro", e as contagens
// são de presença (em quantos dias), não metas.
//
// Dias são sempre construídos pelo calendário local (new Date(y, m, d + i)),
// nunca somando 24 h: a virada do horário de verão não duplica nem pula dias.
(function (global) {
    'use strict';

    const PRACTICE_MAX = 3000;
    // Tipos de prática registrados pelos módulos
    //   rosary  — terço completo          chaplet — terço da misericórdia
    //   prayer  — oração aberta no leitor lectio  — Lectio Divina concluída
    //   respiro — Respiro concluído        exam    — exame concluído (ref = id do log)
    //   morning / night — rituais da manhã e da noite concluídos
    const TYPES = ['rosary', 'chaplet', 'prayer', 'lectio', 'respiro', 'exam', 'morning', 'night'];
    const PRAYER_TYPES = ['rosary', 'chaplet', 'prayer', 'lectio', 'respiro'];
    const ROSARY_TYPES = ['rosary'];

    function isoDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function toMs(value) {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && value) return Date.parse(value);
        return NaN;
    }

    function toDate(now) {
        return now instanceof Date ? new Date(now.getTime()) : new Date(toMs(now) || Date.now());
    }

    function dayKey(value) {
        const ms = toMs(value);
        return isNaN(ms) ? null : isoDate(new Date(ms));
    }

    function parseIso(iso) {
        const [y, m, d] = String(iso).split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    // ── Períodos ──
    // Semana de segunda a domingo; mês do calendário. offset 0 = o atual,
    // -1 = o anterior. end é exclusivo (meia-noite do dia seguinte ao último).
    function periodRange(kind, anchor, offset) {
        const base = toDate(anchor);
        const shift = Number(offset) || 0;
        let start;
        let end;
        if (kind === 'mes') {
            start = new Date(base.getFullYear(), base.getMonth() + shift, 1);
            end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        } else {
            const mondayOffset = (base.getDay() + 6) % 7;
            start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - mondayOffset + shift * 7);
            end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
        }
        const days = [];
        for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
            days.push(isoDate(d));
        }
        return {
            kind: kind === 'mes' ? 'mes' : 'semana',
            offset: shift,
            start,
            end,
            startIso: days[0],
            lastIso: days[days.length - 1],
            days
        };
    }

    // ── Registro de práticas ──
    // Acrescenta um evento { type, at, id?, ref? }. Abrir a mesma oração várias
    // vezes no mesmo dia vira um só registro; o resto é guardado como veio.
    function appendPractice(log, event, now) {
        const list = Array.isArray(log) ? log.filter(e => e && TYPES.includes(e.type)) : [];
        const e = event || {};
        if (!TYPES.includes(e.type)) return list;
        const at = toMs(e.at !== undefined ? e.at : (now || Date.now()));
        if (isNaN(at)) return list;
        const record = { type: e.type, at };
        if (e.id) record.id = String(e.id);
        if (e.ref) record.ref = String(e.ref);
        const day = dayKey(at);
        const duplicate = list.some(x => {
            if (x.type !== record.type || dayKey(x.at) !== day) return false;
            if (record.type === 'prayer') return x.id === record.id;
            if (record.ref) return x.ref === record.ref;
            return record.type === 'morning' || record.type === 'night';
        });
        if (duplicate) return list;
        list.push(record);
        return list.length > PRACTICE_MAX ? list.slice(-PRACTICE_MAX) : list;
    }

    // Une o registro de práticas aos logs de exame (inclusive os migrados da
    // 1.1.5, que não têm evento): cada exame aparece uma vez.
    function normalizeEvents(practices, examLogs) {
        const events = [];
        const examIds = new Set();
        for (const log of Array.isArray(examLogs) ? examLogs : []) {
            if (!log) continue;
            const at = toMs(log.date !== undefined ? log.date : log.at);
            if (isNaN(at)) continue;
            const id = log.id ? String(log.id) : null;
            if (id) examIds.add(id);
            events.push({ type: 'exam', at, ref: id });
        }
        for (const e of Array.isArray(practices) ? practices : []) {
            if (!e || !TYPES.includes(e.type)) continue;
            const at = toMs(e.at);
            if (isNaN(at)) continue;
            if (e.type === 'exam' && e.ref && examIds.has(String(e.ref))) continue;
            events.push({ type: e.type, at, id: e.id || null, ref: e.ref || null });
        }
        return events.sort((a, b) => a.at - b.at);
    }

    function sessionDay(s) {
        if (!s) return null;
        if (typeof s.date === 'string') return s.date;
        return dayKey(s.startedAt);
    }

    function screenSecondsOf(entry) {
        const domains = entry && entry.domains && typeof entry.domains === 'object' ? entry.domains : {};
        return Object.values(domains).reduce((sum, v) => sum + (Number(v) > 0 ? Number(v) : 0), 0);
    }

    /**
     * summarize(period, data)
     *   period — resultado de periodRange
     *   data   — { sessions, practices, exams, screentime, tasks, taskHistory, extraDays, now }
     * Devolve { period, days[], totals, empty, daysWithOra }.
     *   days[i] — { date, weekday, dayOfMonth, today, future, focusMin, sessions,
     *               prayer, rosary, exam, screenSec, none }
     *   none: nenhum foco, oração ou exame registrado naquele dia (tempo de tela
     *   sozinho não conta como registro: é medido, mas não é algo que se faz no Ora).
     */
    function summarize(period, data) {
        const p = period && Array.isArray(period.days) ? period : periodRange('semana', Date.now(), 0);
        const d = data || {};
        const todayIso = dayKey(d.now !== undefined ? d.now : Date.now());
        const inPeriod = new Set(p.days);
        const byDay = new Map(p.days.map(iso => [iso, {
            date: iso,
            weekday: parseIso(iso).getDay(),
            dayOfMonth: parseIso(iso).getDate(),
            today: iso === todayIso,
            future: iso > todayIso,
            focusMin: 0,
            sessions: 0,
            prayer: false,
            rosary: false,
            exam: false,
            exams: 0,
            screenSec: 0,
            none: true
        }]));

        const totals = {
            sessions: 0,
            focusMin: 0,
            interrupted: 0,
            prayerDays: 0,
            rosaryDays: 0,
            exams: 0,
            examDays: 0,
            screenSec: 0,
            recordedDays: 0
        };

        for (const s of Array.isArray(d.sessions) ? d.sessions : []) {
            const iso = sessionDay(s);
            if (!iso || !inPeriod.has(iso)) continue;
            const minutes = Number(s.focusedMin) || 0;
            if (minutes < 1) continue;
            const day = byDay.get(iso);
            day.focusMin += minutes;
            totals.focusMin += minutes;
            // Totais importados da 1.1.5 são minutos, não sessões
            if (!s.imported) {
                day.sessions += 1;
                totals.sessions += 1;
                if (s.status === 'interrupted') totals.interrupted += 1;
            }
        }

        for (const e of normalizeEvents(d.practices, d.exams)) {
            const iso = dayKey(e.at);
            if (!iso || !inPeriod.has(iso)) continue;
            const day = byDay.get(iso);
            if (PRAYER_TYPES.includes(e.type)) day.prayer = true;
            if (ROSARY_TYPES.includes(e.type)) day.rosary = true;
            // O ritual da noite traz o seu olhar sobre o dia: conta como exame da noite,
            // uma vez por dia (o exame completo feito a partir dele já está no log)
            if (e.type === 'exam' || (e.type === 'night' && !day.nightCounted && !day.exam)) {
                day.exam = true;
                day.exams += 1;
                totals.exams += 1;
                if (e.type === 'night') day.nightCounted = true;
            }
        }

        const screen = d.screentime && typeof d.screentime === 'object' ? d.screentime : {};
        for (const iso of p.days) {
            const sec = screenSecondsOf(screen[iso]);
            if (sec > 0) {
                byDay.get(iso).screenSec = sec;
                totals.screenSec += sec;
            }
        }

        const days = p.days.map(iso => {
            const day = byDay.get(iso);
            delete day.nightCounted;
            day.none = !(day.focusMin > 0 || day.prayer || day.exam);
            if (!day.none) totals.recordedDays += 1;
            if (day.prayer) totals.prayerDays += 1;
            if (day.rosary) totals.rosaryDays += 1;
            if (day.exam) totals.examDays += 1;
            return day;
        });

        let daysWithOra = null;
        if (global.CounterCore) {
            daysWithOra = global.CounterCore.daysWithOra({
                sessions: d.sessions,
                tasks: d.tasks,
                taskHistory: d.taskHistory,
                extraDays: d.extraDays
            });
        }

        return {
            period: { kind: p.kind, offset: p.offset, startIso: p.startIso, lastIso: p.lastIso, current: p.days.includes(todayIso) },
            days,
            totals,
            empty: totals.recordedDays === 0,
            daysWithOra
        };
    }

    // Partes da frase-síntese, na ordem: foco, terço, outras orações, exames.
    // O módulo transforma cada parte em texto com t().
    function synthesisParts(summary) {
        const s = summary && summary.totals ? summary.totals : null;
        if (!s || (summary.empty)) return [];
        const parts = [];
        if (s.sessions > 0) parts.push({ kind: 'sessions', n: s.sessions, minutes: s.focusMin });
        else if (s.focusMin > 0) parts.push({ kind: 'focus', minutes: s.focusMin });
        if (s.rosaryDays > 0) parts.push({ kind: 'rosary', n: s.rosaryDays });
        if (s.prayerDays > s.rosaryDays) parts.push({ kind: 'prayer', n: s.prayerDays });
        if (s.exams > 0) parts.push({ kind: 'exams', n: s.exams });
        return parts;
    }

    // Intensidade do dia no calendário do mês (só pelo foco, nunca nota)
    function monthLevel(day) {
        if (!day || day.future) return 'fut';
        if (day.none) return 'none';
        if (day.focusMin >= 90) return 'f3';
        if (day.focusMin >= 30) return 'f2';
        if (day.focusMin >= 1) return 'f1';
        return 'p0';
    }

    // ── Reflexões ("Para refletir") ──
    // ora_reflections: [{ key: 'semana:2026-10-26', kind, start, last, question, text, savedAt }]
    function reflectionKey(period) {
        return `${period.kind}:${period.startIso}`;
    }

    // Pergunta da semana: a mesma para todo o período, trocável por "Outra pergunta"
    function questionIndex(period, count, shift) {
        const n = Math.max(1, Number(count) || 1);
        const start = parseIso(period.startIso);
        const seed = Math.floor(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / 86400000 / 7);
        return ((seed + (Number(shift) || 0)) % n + n) % n;
    }

    function upsertReflection(list, entry) {
        const items = Array.isArray(list) ? list.filter(r => r && typeof r.key === 'string') : [];
        if (!entry || !entry.key) return items;
        const text = typeof entry.text === 'string' ? entry.text.trim() : '';
        const rest = items.filter(r => r.key !== entry.key);
        // Texto vazio apaga a reflexão daquele período
        if (!text) return rest;
        rest.push({
            key: entry.key,
            kind: entry.kind,
            start: entry.start,
            last: entry.last,
            question: String(entry.question || ''),
            text,
            savedAt: entry.savedAt || Date.now()
        });
        return rest.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    }

    function findReflection(list, key) {
        return (Array.isArray(list) ? list : []).find(r => r && r.key === key) || null;
    }

    // Reflexões de outros períodos, da mais recente para a mais antiga
    function pastReflections(list, currentKey, limit) {
        return (Array.isArray(list) ? list : [])
            .filter(r => r && r.key !== currentKey && r.text)
            .sort((a, b) => String(b.start).localeCompare(String(a.start)))
            .slice(0, limit || 4);
    }

    global.FrutosCore = {
        TYPES,
        PRACTICE_MAX,
        isoDate,
        dayKey,
        periodRange,
        appendPractice,
        normalizeEvents,
        summarize,
        synthesisParts,
        monthLevel,
        reflectionKey,
        questionIndex,
        upsertReflection,
        findReflection,
        pastReflections
    };
})(typeof self !== 'undefined' ? self : this);
