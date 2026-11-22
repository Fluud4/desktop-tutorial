(() => {
  const EXAMPLES = {
    hello: {
      stdin: "",
      code: `#include <iostream>

int main() {
    std::cout << "Hello from IvaFluud\\n";
    std::cout << "C++ is ready.\\n";
    return 0;
}
`,
    },
    sum: {
      stdin: "7 15\n",
      code: `#include <iostream>

int main() {
    long long a, b;
    if (!(std::cin >> a >> b)) {
        std::cerr << "Need two numbers on stdin\\n";
        return 1;
    }
    std::cout << a << " + " << b << " = " << (a + b) << "\\n";
    return 0;
}
`,
    },
    fib: {
      stdin: "12\n",
      code: `#include <iostream>
#include <vector>

int main() {
    int n;
    if (!(std::cin >> n) || n < 0 || n > 90) {
        std::cerr << "Enter n in [0..90]\\n";
        return 1;
    }

    if (n <= 1) {
        std::cout << n << "\\n";
        return 0;
    }

    long long a = 0, b = 1;
    for (int i = 2; i <= n; ++i) {
        long long next = a + b;
        a = b;
        b = next;
    }
    std::cout << "F(" << n << ") = " << b << "\\n";
    return 0;
}
`,
    },
    lambda: {
      stdin: "",
      code: `#include <iostream>
#include <vector>
#include <algorithm>
#include <numeric>

int main() {
    std::vector<int> xs{3, 1, 4, 1, 5, 9, 2, 6};
    std::sort(xs.begin(), xs.end());

    const auto sum = std::accumulate(xs.begin(), xs.end(), 0);
    std::cout << "sorted:";
    for (int x : xs) std::cout << ' ' << x;
    std::cout << "\\nsum = " << sum << "\\n";

    auto twice = [](int v) { return v * 2; };
    std::cout << "twice(21) = " << twice(21) << "\\n";
    return 0;
}
`,
    },
  };

  const codeEl = document.getElementById("code");
  const stdinEl = document.getElementById("stdin");
  const standardEl = document.getElementById("standard");
  const exampleEl = document.getElementById("example");
  const runBtn = document.getElementById("runBtn");
  const outputEl = document.getElementById("output");
  const statusEl = document.getElementById("status");
  const metaEl = document.getElementById("meta");

  let busy = false;

  function loadExample(key) {
    const sample = EXAMPLES[key] || EXAMPLES.hello;
    codeEl.value = sample.code.trimStart();
    stdinEl.value = sample.stdin;
    setStatus("idle", "Готов");
    outputEl.classList.add("empty");
    outputEl.textContent = "";
    metaEl.textContent = "stdout · stderr · статус";
  }

  function setStatus(kind, text) {
    statusEl.className = `status ${kind}`;
    statusEl.textContent = text;
  }

  function escapeHtml(text) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function renderResult(data, elapsedMs) {
    outputEl.classList.remove("empty");
    const parts = [];

    parts.push(
      `<span class="sec">Статус</span>${escapeHtml(data.message || "")}` +
        (typeof data.exitCode === "number" ? ` · exit ${data.exitCode}` : "") +
        ` · ${elapsedMs} ms · ${escapeHtml(data.standard || standardEl.value)}`
    );

    if (data.stdout) {
      parts.push(
        `<span class="sec">stdout</span><span class="ok-text">${escapeHtml(
          data.stdout
        )}</span>`
      );
    }

    if (data.stderr) {
      parts.push(
        `<span class="sec">stderr</span><span class="err-text">${escapeHtml(
          data.stderr
        )}</span>`
      );
    }

    if (!data.stdout && !data.stderr) {
      parts.push(`<span class="sec">Вывод</span>(пусто)`);
    }

    outputEl.innerHTML = parts.join("\n");
    metaEl.textContent = data.ok ? "успех" : data.stage === "compile" ? "ошибка компиляции" : "ошибка выполнения";
    setStatus(data.ok ? "ok" : "err", data.ok ? "Готово" : "Ошибка");
  }

  async function run() {
    if (busy) return;
    busy = true;
    runBtn.disabled = true;
    runBtn.classList.add("busy");
    setStatus("run", "Компиляция…");
    outputEl.classList.remove("empty");
    outputEl.textContent = "Собираем и запускаем…";

    const started = performance.now();

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeEl.value,
          stdin: stdinEl.value,
          standard: standardEl.value,
        }),
      });

      const data = await res.json();
      const elapsed = Math.round(performance.now() - started);

      if (!res.ok && !data.message) {
        throw new Error(`HTTP ${res.status}`);
      }

      renderResult(data, elapsed);
    } catch (err) {
      outputEl.classList.remove("empty");
      outputEl.innerHTML = `<span class="sec">Ошибка</span><span class="err-text">${escapeHtml(
        String(err.message || err)
      )}</span>`;
      setStatus("err", "Сбой сети");
      metaEl.textContent = "не удалось связаться с компилятором";
    } finally {
      busy = false;
      runBtn.disabled = false;
      runBtn.classList.remove("busy");
    }
  }

  function onTab(e) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    const value = e.target.value;
    e.target.value = value.slice(0, start) + "  " + value.slice(end);
    e.target.selectionStart = e.target.selectionEnd = start + 2;
  }

  exampleEl.addEventListener("change", () => loadExample(exampleEl.value));
  runBtn.addEventListener("click", run);
  codeEl.addEventListener("keydown", onTab);
  stdinEl.addEventListener("keydown", onTab);

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });

  loadExample("hello");
})();
