(function () {
  "use strict";

  function openContactModal(productName) {
    var modal = document.getElementById("contact-modal");
    if (!modal) return;
    var productInput = modal.querySelector('input[name="product"]');
    if (productInput) productInput.value = productName || "";
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      var firstInput = modal.querySelector('input[name="name"]');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  function closeContactModal() {
    var modal = document.getElementById("contact-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
  }

  window.openContactModal = openContactModal;
  window.closeContactModal = closeContactModal;

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var modal = document.getElementById("contact-modal");
    if (modal && !modal.classList.contains("hidden")) closeContactModal();
  });

  document.addEventListener("click", function (e) {
    var popupLink = e.target.closest && e.target.closest('a[href^="#popup:"]');
    if (popupLink) {
      e.preventDefault();
      var target = popupLink.getAttribute("href").slice("#popup:".length);
      if (target === "contact") {
        openContactModal(popupLink.getAttribute("data-product"));
      }
      return;
    }

    var closer =
      e.target.closest &&
      e.target.closest("[data-modal-close],[data-contact-modal-close]");
    if (closer) {
      var open = closer.closest("[data-modal]");
      if (open) {
        open.classList.add("hidden");
        open.classList.remove("flex");
        document.body.style.overflow = "";
      } else if (closer.closest("#contact-modal")) {
        closeContactModal();
      }
    }
  });

  function isPhoneInput(el) {
    if (!el || el.tagName !== "INPUT") return false;
    var t = (el.getAttribute("type") || "text").toLowerCase();
    if (t !== "tel" && t !== "text") return false;
    return t === "tel" || el.name === "phone";
  }

  function filterPhoneChars(v) {
    var out = v.replace(/[^\d+()\s-]/g, "");
    return out.charAt(0) === "+"
      ? "+" + out.slice(1).replace(/\+/g, "")
      : out.replace(/\+/g, "");
  }

  function formatPhone(raw) {
    var compact = raw.replace(/[^\d+]/g, "");
    if (!compact) return "";
    if (compact === "+") return "+";
    var digits = compact.replace(/\D/g, "");
    if (compact.charAt(0) === "+" && digits.charAt(0) !== "7") {
      return "+" + digits.slice(0, 15);
    }
    var d =
      digits.charAt(0) === "8"
        ? "7" + digits.slice(1)
        : digits.charAt(0) === "7"
          ? digits
          : "7" + digits;
    d = d.slice(0, 11);
    var out = "+7";
    if (d.length > 1) out += " (" + d.slice(1, 4);
    if (d.length >= 5) out += ") " + d.slice(4, 7);
    if (d.length >= 8) out += "-" + d.slice(7, 9);
    if (d.length >= 10) out += "-" + d.slice(9, 11);
    return out;
  }

  function phoneValueInvalid(v) {
    var s = (v || "").trim();
    if (!s) return false;
    var digits = s.replace(/\D/g, "");
    if (s.charAt(0) === "+" && digits.charAt(0) !== "7") {
      return digits.length < 8 || digits.length > 15;
    }
    return digits.length !== 11;
  }

  function phoneErrorEl(input) {
    var n = input.nextElementSibling;
    return n && n.hasAttribute && n.hasAttribute("data-phone-error") ? n : null;
  }

  function clearPhoneError(input) {
    input.style.borderColor = "";
    var err = phoneErrorEl(input);
    if (err) err.remove();
  }

  function showPhoneError(input) {
    input.style.borderColor = "#dc2626";
    var err = phoneErrorEl(input);
    if (!err) {
      err = document.createElement("p");
      err.setAttribute("data-phone-error", "");
      err.style.cssText =
        "color:#dc2626;font-size:.8125rem;margin-top:.375rem";
      input.insertAdjacentElement("afterend", err);
    }
    err.textContent = "Проверьте номер телефона";
  }

  function validateLeadPhones(form) {
    var inputs = form.querySelectorAll('input[name="phone"], input[type="tel"]');
    var firstBad = null;
    for (var i = 0; i < inputs.length; i++) {
      if (!isPhoneInput(inputs[i])) continue;
      if (phoneValueInvalid(inputs[i].value)) {
        showPhoneError(inputs[i]);
        if (!firstBad) firstBad = inputs[i];
      }
    }
    if (firstBad) {
      firstBad.focus();
      return false;
    }
    return true;
  }

  document.addEventListener(
    "input",
    function (e) {
      var el = e.target;
      if (!isPhoneInput(el)) return;
      clearPhoneError(el);
      var atEnd =
        el.selectionStart == null ||
        (el.selectionStart === el.value.length &&
          el.selectionEnd === el.value.length);
      if (atEnd) {
        var f = formatPhone(el.value);
        if (f !== el.value) el.value = f;
        return;
      }
      var pos = el.selectionStart;
      var filtered = filterPhoneChars(el.value);
      if (filtered !== el.value) {
        var np =
          pos -
          (el.value.slice(0, pos).length -
            filterPhoneChars(el.value.slice(0, pos)).length);
        el.value = filtered;
        el.setSelectionRange(np, np);
      }
    },
    false
  );

  document.addEventListener(
    "focusout",
    function (e) {
      var el = e.target;
      if (!isPhoneInput(el)) return;
      var f = formatPhone(el.value);
      if (f === "+" || f === "+7") f = "";
      if (f !== el.value) el.value = f;
    },
    false
  );

  var LEAD_EMAIL = "yugput@rambler.ru";
  var LEAD_ENDPOINT = "https://formsubmit.co/ajax/" + LEAD_EMAIL;

  function showLeadSuccess(form) {
    var successHTML =
      '<div style="text-align:center;padding:2rem 0">' +
      '<div style="font-size:2.5rem;line-height:1;color:#16a34a">✓</div>' +
      '<p style="font-size:1.25rem;font-weight:700;margin-top:.75rem">Спасибо! Заявка принята.</p>' +
      '<p style="font-size:.875rem;opacity:.7;margin-top:.25rem">Заявка отправлена на ' +
      LEAD_EMAIL +
      ". Мы свяжемся с вами по указанному телефону.</p>" +
      "</div>";
    var modal = form.closest && form.closest("#contact-modal");
    if (modal) {
      var panel = form.parentElement;
      var closeBtn = panel.querySelector('button[aria-label="Закрыть"]');
      panel.innerHTML = "";
      if (closeBtn) panel.appendChild(closeBtn);
      var wrap = document.createElement("div");
      wrap.innerHTML = successHTML;
      panel.appendChild(wrap.firstElementChild);
    } else {
      form.innerHTML = successHTML;
    }
  }

  function showLeadError(form, message) {
    var err = form.querySelector("[data-lead-error]");
    if (!err) {
      err = document.createElement("p");
      err.setAttribute("data-lead-error", "");
      err.style.cssText =
        "color:#dc2626;font-size:.875rem;margin-top:.5rem;text-align:center";
      form.appendChild(err);
    }
    err.textContent =
      message ||
      "Не удалось отправить заявку. Напишите на " + LEAD_EMAIL + " или позвоните.";
  }

  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || !form.matches || !form.matches("form[data-lead-form]")) return;
      e.preventDefault();
      var honeypot = form.querySelector('input[name="website"]');
      if (honeypot && honeypot.value) return;
      if (!validateLeadPhones(form)) return;

      var btn =
        form.querySelector('button[type="submit"]') ||
        form.querySelector("button:not([type])");
      var btnText = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Отправляем…";
      }

      var nameInput = form.querySelector('input[name="name"]');
      var phoneInput = form.querySelector('input[name="phone"]');
      var productInput = form.querySelector('input[name="product"]');
      var payload = {
        name: nameInput ? nameInput.value.trim() : "",
        phone: phoneInput ? phoneInput.value.trim() : "",
        product: productInput ? productInput.value.trim() : "",
        _subject: "Заявка с сайта ЮгПуть",
        _template: "table",
        _captcha: "false",
      };

      fetch(LEAD_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () {
              return {};
            }).then(function () {
              return Promise.reject(new Error("bad"));
            });
          }
          return res.json().catch(function () {
            return { success: true };
          });
        })
        .then(function () {
          showLeadSuccess(form);
        })
        .catch(function () {
          // Fallback: open a prefilled email if the relay is unavailable.
          var subject = encodeURIComponent("Заявка с сайта ЮгПуть");
          var body = encodeURIComponent(
            "Имя: " +
              payload.name +
              "\nТелефон: " +
              payload.phone +
              (payload.product ? "\nИнтерес: " + payload.product : "")
          );
          window.location.href =
            "mailto:" + LEAD_EMAIL + "?subject=" + subject + "&body=" + body;
          if (btn) {
            btn.disabled = false;
            btn.textContent = btnText || "Отправить заявку";
          }
          showLeadError(
            form,
            "Откройте почтовый клиент и отправьте письмо на " + LEAD_EMAIL + "."
          );
        });
    },
    false
  );

  (function stickyCta() {
    var HYSTERESIS = 96;
    var root = document.documentElement;
    var bar = document.getElementById("sticky-bottom-cta");
    if (!bar) return;
    bar.setAttribute("data-sticky-cta", "");
    root.setAttribute("data-sticky-cta", "off");
    var hero = document.querySelector("section");
    var ticking = false;

    function bottomAnchorTop() {
      var top = Infinity;
      var footer = document.querySelector("footer");
      if (footer) top = Math.min(top, footer.getBoundingClientRect().top);
      return top;
    }

    function measure() {
      ticking = false;
      var vh = window.innerHeight || 0;
      var y = window.pageYOffset || root.scrollTop || 0;
      var barHeight = bar.offsetHeight || 72;
      var shown = root.getAttribute("data-sticky-cta") === "on";
      var threshold = vh * 0.9;
      if (hero) {
        var heroBottom = hero.getBoundingClientRect().bottom + y;
        if (heroBottom > threshold) threshold = heroBottom;
      }
      var passedFirstScreen = y + (shown ? HYSTERESIS : 0) > threshold;
      var atBottom;
      var anchorTop = bottomAnchorTop();
      if (anchorTop === Infinity) {
        var docHeight = Math.max(
          document.body ? document.body.scrollHeight : 0,
          root.scrollHeight
        );
        atBottom = y + vh >= docHeight - barHeight - 1;
      } else {
        atBottom = anchorTop < vh - barHeight + (shown ? 0 : HYSTERESIS);
      }
      root.setAttribute(
        "data-sticky-cta",
        passedFirstScreen && !atBottom ? "on" : "off"
      );
    }

    function schedule() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
  })();

  document.addEventListener("DOMContentLoaded", function () {
    document
      .querySelectorAll('input[name="phone"], input[type="tel"]')
      .forEach(function (el) {
        if (!isPhoneInput(el)) return;
        if (!el.getAttribute("inputmode")) el.setAttribute("inputmode", "tel");
        if (!el.getAttribute("autocomplete"))
          el.setAttribute("autocomplete", "tel");
      });

    var targets = document.querySelectorAll("[data-reveal]");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var siblings = Array.prototype.slice.call(
            entry.target.parentNode.querySelectorAll(":scope > [data-reveal]")
          );
          var delay = Math.min(siblings.indexOf(entry.target), 5) * 90;
          setTimeout(function () {
            entry.target.classList.add("is-visible");
          }, Math.max(delay, 0));
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 }
    );
    targets.forEach(function (el) {
      revealObserver.observe(el);
    });
  });
})();
