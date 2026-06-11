// ============================================================
// POMODORO CORE — Shared, dependency-free timer logic
// ============================================================
// Used by sw.js (via importScripts) and by the test suite.
// Pure functions only: no chrome.* calls, no DOM access.
(function (global) {
    'use strict';

    function getDefaultSettings() {
        return {
            focus: 25,
            pause: 5,
            longPause: 15,
            sound: true,
            autoNext: false,
            continuousAlarm: false,
            wakeLock: false
        };
    }

    function getPhaseDuration(phase, settings) {
        if (phase === 'focus') return settings.focus * 60;
        if (phase === 'pause') return settings.pause * 60;
        if (phase === 'longPause') return settings.longPause * 60;
        return settings.focus * 60;
    }

    function advancePhase(state) {
        if (state.phase === 'focus') {
            state.pomodoroCount++;
            if (state.pomodoroCount % 4 === 0) {
                state.phase = 'longPause';
            } else {
                state.phase = 'pause';
            }
        } else {
            state.phase = 'focus';
        }
        state.timeRemaining = getPhaseDuration(state.phase, state.settings);
        state.totalDuration = state.timeRemaining;
        return state;
    }

    /**
     * Handle the day rollover for a persisted pomodoro state.
     * Mutates `state`. Returns true when a rollover happened (state changed).
     *
     * Daily counters always reset. The timer itself is only preserved when a
     * session is genuinely still running across midnight (expectedEndTime in
     * the future); anything else is residue from a previous day and is fully
     * reset to a fresh focus phase.
     */
    function applyDayRollover(state, currentKey, now = Date.now()) {
        if (state.todayKey === currentKey) return false;

        const activeCrossMidnight = !!(state.isRunning && state.expectedEndTime && state.expectedEndTime > now);

        state.todayKey = currentKey;
        state.totalFocusSeconds = 0;
        state.pomodoroCount = 0;

        if (!activeCrossMidnight) {
            state.isRunning = false;
            state.expectedEndTime = null;
            state.phase = 'focus';
            state.timeRemaining = getPhaseDuration('focus', state.settings);
            state.totalDuration = state.timeRemaining;
        }

        return true;
    }

    global.PomodoroCore = {
        getDefaultSettings,
        getPhaseDuration,
        advancePhase,
        applyDayRollover
    };
})(typeof self !== 'undefined' ? self : this);
