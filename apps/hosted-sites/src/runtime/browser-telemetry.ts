import { telemetryControlLabels, telemetryButtonLabels } from "@agentbench/shared/hosted-telemetry";

export function browserTelemetryScript() {
  return `
    (function () {
      var pending = new Map();
      var lastSubmitClick = 0;
      var fields = ${JSON.stringify(telemetryControlLabels)};
      var labels = ${JSON.stringify(telemetryButtonLabels)};
      function safeLabel(text) {
        if (typeof text !== 'string' || text.length > 120) return null;
        return labels.concat(Object.values(fields)).find(function (label) { return label.toLowerCase() === text.trim().toLowerCase(); }) || null;
      }
      function route(value) {
        try {
          var parts = new URL(value, location.origin).pathname.split('/').filter(Boolean);
          if (!['shopping','wiki','forum','repo','notes','calendar','sheets','inbox'].includes(parts[0])) return null;
          var sections = ['cart','order','article','thread','compose','note','edit','new','event','file','search','merge','request','draft'];
          return '/' + parts[0] + (parts.length > 1 ? '/' + (sections.includes(parts[1]) ? parts[1] : ':item') : '') + (parts.length > 2 ? '/:item' : '');
        } catch (_) { return null; }
      }
      function control(target) {
        var label = target.labels && target.labels[0];
        var name = target.getAttribute('name');
        return {
          name: Object.hasOwn(fields, name) ? name : null,
          label: Object.hasOwn(fields, name) ? fields[name] : safeLabel(target.getAttribute('aria-label') || (label ? label.textContent.trim() : '')),
          tag: target.tagName
        };
      }
      function flush() {
        pending.forEach(function (edit) { clearTimeout(edit.timer); abTelemetry('input', edit.payload); });
        pending.clear();
      }
      function queue(target, kind) {
        if (!target || !target.getAttribute || target.type === 'password' || target.type === 'hidden') return;
        var prior = pending.get(target);
        if (prior) clearTimeout(prior.timer);
        var payload = control(target);
        payload.kind = kind;
        pending.set(target, { payload: payload, timer: setTimeout(function () {
          var edit = pending.get(target);
          if (edit) { pending.delete(target); abTelemetry('input', edit.payload); }
        }, 600) });
      }
      window.addEventListener('load', function () {
        var from = null;
        try { from = sessionStorage.getItem('agentbench.telemetry.previousPath'); } catch (_) {}
        abTelemetry('page.load', { from: from });
        // Query strings and tokens are never stored in browser telemetry history.
        try { sessionStorage.setItem('agentbench.telemetry.previousPath', route(location.pathname) || ''); } catch (_) {}
      });
      document.addEventListener('click', function (event) {
        var target = event.target && event.target.closest ? event.target.closest('button,a,input,select,textarea') : null;
        if (!target || target.type === 'password' || target.type === 'hidden') return;
        flush();
        var payload = control(target);
        payload.text = safeLabel(target.innerText || target.getAttribute('aria-label') || '');
        payload.href = target.tagName === 'A' ? route(target.getAttribute('href')) : null;
        if (target.tagName === 'A') payload.kind = 'navigation';
        if (target.form && target.type === 'submit') { payload.kind = 'submit'; lastSubmitClick = Date.now(); }
        abTelemetry('click', payload);
      }, true);
      document.addEventListener('input', function (event) {
        var target = event.target;
        if (target && target.tagName !== 'SELECT' && target.type !== 'checkbox' && target.type !== 'radio') queue(target, 'input');
      }, true);
      document.addEventListener('change', function (event) {
        var target = event.target;
        if (target && target.tagName === 'SELECT') queue(target, 'select');
        else if (target && (target.type === 'checkbox' || target.type === 'radio')) queue(target, 'toggle');
      }, true);
      document.addEventListener('focusout', flush, true);
      document.addEventListener('submit', function (event) {
        flush();
        // A submit-button click already describes this submission; Enter needs its own event.
        if (Date.now() - lastSubmitClick < 300) return;
        var submitter = event.submitter;
        var payload = submitter ? control(submitter) : {};
        payload.text = submitter ? safeLabel(submitter.innerText) : null;
        abTelemetry('submit', payload);
      }, true);
      window.addEventListener('pagehide', flush);
      function routeChanged() {
        flush();
        var from = null;
        try {
          from = sessionStorage.getItem('agentbench.telemetry.previousPath');
          sessionStorage.setItem('agentbench.telemetry.previousPath', route(location.pathname) || '');
        } catch (_) {}
        abTelemetry('page.load', { from: from });
      }
      window.addEventListener('popstate', routeChanged);
      if (window.history) ['pushState', 'replaceState'].forEach(function (method) {
        var original = window.history[method];
        window.history[method] = function () {
          var previous = location.pathname;
          var result = original.apply(this, arguments);
          if (previous !== location.pathname) routeChanged();
          return result;
        };
      });
    })();
  `;
}
