const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelector("[data-nav]");
const yearEl = document.querySelector("[data-year]");

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

if (navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

if (navLinks) {
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      document.body.classList.remove("nav-open");
      if (navToggle) {
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  });
}

// Scroll Spy - Highlight current section in navigation
const observerOptions = {
  threshold: 0.3,
  rootMargin: "-50% 0px -50% 0px"
};

const scrollSpy = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks?.querySelectorAll("a").forEach((link) => {
        link.classList.remove("active");
        if (link.getAttribute("href") === `#${id}`) {
          link.classList.add("active");
        }
      });
    }
  });
}, observerOptions);

document.querySelectorAll("section[id]").forEach((section) => {
  scrollSpy.observe(section);
});

// Scroll Animation Trigger - Intersection Observer for fade-in effects
const animationObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in-view");
      animationObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: "0px 0px -100px 0px"
});

document.querySelectorAll(".section").forEach((section) => {
  animationObserver.observe(section);
});

// Enhanced Button Interactions with Mouse Position
document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    btn.style.setProperty("--mouse-x", `${x}%`);
    btn.style.setProperty("--mouse-y", `${y}%`);
  });
});

// Tab System
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-content");

if (tabButtons.length > 0 && tabPanels.length > 0) {
  tabButtons[0].classList.add("active");
  if (tabPanels[0]) {
    tabPanels[0].classList.add("active");
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.getAttribute("data-tab");
      
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabPanels.forEach((panel) => panel.classList.remove("active"));
      
      button.classList.add("active");
      const activePanel = document.querySelector(`[data-tab-panel="${tabName}"]`);
      if (activePanel) {
        activePanel.classList.add("active");
      }
    });
  });
}

// Code Animation
const animatedBlocks = document.querySelectorAll("[data-animate-lines]");
animatedBlocks.forEach((block) => {
  const lines = block.textContent.split("\n");
  block.textContent = "";
  
  const keywords = ["name", "role", "focus", "stack", "Python", "Docker", "PostgreSQL", "Java"];
  const yamlKeywords = /^(\s*)([a-z_]+):/i;
  const stringPattern = /"([^"]*)"|'([^']*)'/;
  
  lines.forEach((line) => {
    const span = document.createElement("span");
    span.className = "code-line";
    
    if (line === "") {
      span.textContent = " ";
    } else {
      const yamlMatch = line.match(yamlKeywords);
      if (yamlMatch) {
        span.className += " keyword";
      }
      else if (stringPattern.test(line)) {
        span.className += " string";
      }
      else if (keywords.some(kw => line.includes(kw))) {
        span.className += " param";
      }
      else if (line.trim().startsWith("-")) {
        span.className += " function";
      }
      
      span.textContent = line === "" ? " " : line;
    }
    
    block.appendChild(span);
  });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    const href = this.getAttribute("href");
    if (href !== "#") {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
});

// Add ripple effect to buttons on click
document.querySelectorAll(".btn, .icon-button").forEach((element) => {
  element.addEventListener("click", function (e) {
    if (this.classList.contains("nav-toggle")) return;
    
    const ripple = document.createElement("span");
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    ripple.className = "ripple";
    ripple.style.position = "absolute";
    ripple.style.borderRadius = "50%";
    ripple.style.background = "radial-gradient(circle, rgba(255,255,255,0.5), transparent)";
    ripple.style.pointerEvents = "none";
    ripple.style.animation = "ripple-animation 0.6s ease-out forwards";
    
    this.style.position = "relative";
    this.style.overflow = "hidden";
    this.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
  });
});

// Add ripple animation to stylesheet
const style = document.createElement("style");
style.textContent = `
  @keyframes ripple-animation {
    from {
      transform: scale(0);
      opacity: 1;
    }
    to {
      transform: scale(1);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Parallax effect on hero section
const heroSection = document.querySelector(".hero");
if (heroSection) {
  window.addEventListener("scroll", () => {
    const scrolled = window.scrollY;
    const heroOrbs = document.querySelectorAll(".orb");
    heroOrbs.forEach((orb) => {
      orb.style.transform = `translateY(${scrolled * 0.5}px)`;
    });
  });
}

// Animate stat cards on scroll into view
const statCards = document.querySelectorAll(".stat-card");
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in-view");
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

statCards.forEach((card) => {
  statsObserver.observe(card);
});


// ============================================================
// THEME PICKER DROPDOWN
// ============================================================
const THEMES = [
  { key: "dark",    class: "",             label: "Outer Space"     },
  { key: "light",   class: "light-mode",   label: "Daylight"        },
  { key: "forest",  class: "theme-forest", label: "Forest Terminal" },
  { key: "ocean",   class: "theme-ocean",  label: "Deep Ocean"      },
  { key: "sunset",  class: "theme-sunset", label: "Sunset Ember"    },
];

const ALL_THEME_CLASSES = THEMES.map((t) => t.class).filter(Boolean);

function applyTheme(key) {
  const theme = THEMES.find((t) => t.key === key) || THEMES[0];
  document.body.classList.remove(...ALL_THEME_CLASSES);
  if (theme.class) document.body.classList.add(theme.class);

  // Update pill label
  const label = document.getElementById("theme-pill-label");
  if (label) label.textContent = theme.label;

  // Update active state on picker items
  document.querySelectorAll(".theme-picker-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeKey === key);
  });

  localStorage.setItem("portfolio-theme", key);
}

function getSavedThemeKey() {
  return localStorage.getItem("portfolio-theme") || "dark";
}

// Apply saved theme on load
applyTheme(getSavedThemeKey());

// Dropdown open/close
const themeBrand = document.getElementById("theme-brand");
const themePillBtn = document.getElementById("theme-pill-btn");

if (themePillBtn && themeBrand) {
  themePillBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = themeBrand.classList.toggle("open");
    themePillBtn.setAttribute("aria-expanded", String(isOpen));
  });

  // Close when clicking outside
  document.addEventListener("click", () => {
    themeBrand.classList.remove("open");
    themePillBtn.setAttribute("aria-expanded", "false");
  });

  // Prevent close when clicking inside picker
  const picker = document.getElementById("theme-picker");
  if (picker) {
    picker.addEventListener("click", (e) => e.stopPropagation());
  }
}

// Theme item click
document.querySelectorAll(".theme-picker-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyTheme(btn.dataset.themeKey);
    // Close dropdown
    if (themeBrand) themeBrand.classList.remove("open");
    if (themePillBtn) themePillBtn.setAttribute("aria-expanded", "false");
  });
});

// Keep old theme-toggle button working (cycle) if it exists
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const cur = THEMES.findIndex((t) => t.key === getSavedThemeKey());
    const next = (cur + 1) % THEMES.length;
    applyTheme(THEMES[next].key);
  });
}

// ============================================================
// VERTICAL SCROLL PROGRESS BAR
// ============================================================
const scrollProgressBar = document.querySelector(".scroll-progress-vertical");

function updateScrollProgress() {
  if (!scrollProgressBar) return;
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  scrollProgressBar.style.height = pct + "%";
}

window.addEventListener("scroll", updateScrollProgress, { passive: true });
updateScrollProgress();

// ============================================================
// BACK TO TOP BUTTON
// ============================================================
const backToTopBtn = document.getElementById("back-to-top");

function handleBackToTopVisibility() {
  if (!backToTopBtn) return;
  if (window.scrollY > 400) {
    backToTopBtn.classList.add("visible");
  } else {
    backToTopBtn.classList.remove("visible");
  }
}

window.addEventListener("scroll", handleBackToTopVisibility, { passive: true });
handleBackToTopVisibility();

if (backToTopBtn) {
  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ============================================================
// CONTACT FORM — validation + mailto submit
// ============================================================
const contactForm = document.getElementById("contact-form");

function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    helper.style.pointerEvents = "none";
    document.body.appendChild(helper);
    helper.select();
    helper.setSelectionRange(0, helper.value.length);

    try {
      const copied = document.execCommand("copy");
      document.body.removeChild(helper);
      if (copied) {
        resolve();
      } else {
        reject(new Error("Clipboard copy was blocked."));
      }
    } catch (error) {
      document.body.removeChild(helper);
      reject(error);
    }
  });
}

function validateField(input) {
  const type = input.dataset.validate;
  const val = input.value.trim();
  const errorEl = input.parentElement.querySelector(".field-error");
  let msg = "";

  if (!val) {
    msg = "This field is required.";
  } else if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    msg = "Please enter a valid email address.";
  } else if (type === "name" && val.length < 2) {
    msg = "Name must be at least 2 characters.";
  } else if (type === "message" && val.length < 10) {
    msg = "Message must be at least 10 characters.";
  }

  if (errorEl) errorEl.textContent = msg;
  input.classList.toggle("valid", !msg && val.length > 0);
  input.classList.toggle("invalid", !!msg && val.length > 0);
  return !msg;
}

if (contactForm) {
  contactForm.querySelectorAll("[data-validate]").forEach((input) => {
    input.addEventListener("blur", () => validateField(input));
    input.addEventListener("input", () => {
      if (input.classList.contains("invalid") || input.classList.contains("valid")) {
        validateField(input);
      }
    });
  });

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = contactForm.querySelectorAll("[data-validate]");
    let allValid = true;

    fields.forEach((field) => {
      if (!validateField(field)) allValid = false;
    });

    if (!allValid) {
      const firstInvalid = contactForm.querySelector(".invalid");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const name = contactForm.querySelector("#cf-name").value.trim();
    const email = contactForm.querySelector("#cf-email").value.trim();
    const message = contactForm.querySelector("#cf-message").value.trim();

    const draftMessage = `Hi Duc,\n\nMy name is ${name} (${email}).\n\n${message}\n\nBest regards,\n${name}`;
    const subject = encodeURIComponent(`Portfolio Contact from ${name}`);
    const body = encodeURIComponent(draftMessage);
    let copiedBackup = false;

    try {
      await copyTextToClipboard(draftMessage);
      copiedBackup = true;
    } catch (_) {
      copiedBackup = false;
    }

    window.location.href = `mailto:duckcy.work@gmail.com?subject=${subject}&body=${body}`;
    showToast(
      copiedBackup
        ? "Opening your email client. Draft copied as backup."
        : "Opening your email client...",
      "info"
    );
    contactForm.reset();
    fields.forEach((f) => f.classList.remove("valid", "invalid"));
  });
}

// ============================================================
// COPY EMAIL TO CLIPBOARD
// ============================================================
const copyEmailLinks = document.querySelectorAll(".copy-email");

copyEmailLinks.forEach((link) => {
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    const text = link.dataset.copy;
    if (!text) return;

    copyTextToClipboard(text).then(() => {
      link.classList.add("copied");
      showToast("Email copied to clipboard! ✓", "success");
      setTimeout(() => link.classList.remove("copied"), 2500);
    }).catch(() => {
      // Fallback for browsers without clipboard API
      showToast("Email: " + text, "info");
    });
  });
});

// ============================================================
// TOAST HELPER
// ============================================================
function showToast(message, type = "info") {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type}`;

  // Force reflow to restart transition
  void toast.offsetWidth;
  toast.classList.add("show");

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// ============================================================
// STACK FILTER BAR — category dropdowns + tech tag filtering
// ============================================================
(function () {
  const filterBar = document.getElementById("stack-filter-bar");
  const projectList = document.querySelector("[data-project-list]");
  const projectCount = document.querySelector("[data-project-count]");
  const searchInput = document.querySelector("[data-project-search]");

  if (!filterBar || !projectList) return;

  const cards = Array.from(projectList.querySelectorAll(".project-showcase"));
  const total = cards.length;
  let activeTechs = new Set();
  let activeQuery = "";

  // Update visible count
  function updateCount(visible) {
    if (projectCount) projectCount.textContent = `Showing ${visible} of ${total} projects`;
  }

  // Apply both tech filter and search query
  function applyFilters() {
    let visible = 0;
    cards.forEach((card) => {
      const text = (card.dataset.text || "").toLowerCase();
      const matchesTech = activeTechs.size === 0 ||
        [...activeTechs].some((t) => text.includes(t.toLowerCase()));
      const matchesQuery = !activeQuery || text.includes(activeQuery);
      const show = matchesTech && matchesQuery;
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });
    updateCount(visible);
  }

  // Toggle dropdown open/close
  filterBar.querySelectorAll(".stack-category").forEach((cat) => {
    const btn = cat.querySelector(".stack-cat-btn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = cat.classList.contains("open");
      // Close all others
      filterBar.querySelectorAll(".stack-category.open").forEach((c) => {
        c.classList.remove("open");
        c.querySelector(".stack-cat-btn").setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        cat.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });

    // Tech tag click — toggle filter
    cat.querySelectorAll(".stack-tag").forEach((tag) => {
      tag.addEventListener("click", () => {
        const tech = tag.dataset.tech;
        if (activeTechs.has(tech)) {
          activeTechs.delete(tech);
          tag.classList.remove("active");
        } else {
          activeTechs.add(tech);
          tag.classList.add("active");
        }
        applyFilters();
      });
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", () => {
    filterBar.querySelectorAll(".stack-category.open").forEach((c) => {
      c.classList.remove("open");
      c.querySelector(".stack-cat-btn").setAttribute("aria-expanded", "false");
    });
  });

  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      activeQuery = e.target.value.trim().toLowerCase();
      applyFilters();
    });
  }

  applyFilters();
})();

// ============================================================
// SKILLS TAB SWITCHER — supports multiple independent tab groups
// ============================================================
(function () {
  // Group tabs and panels by data-group attribute
  const groups = {};

  document.querySelectorAll(".skills-tab[data-group]").forEach((tab) => {
    const g = tab.dataset.group;
    if (!groups[g]) groups[g] = { tabs: [], panels: [] };
    groups[g].tabs.push(tab);
  });

  document.querySelectorAll(".skills-panel[data-group]").forEach((panel) => {
    const g = panel.dataset.group;
    if (!groups[g]) groups[g] = { tabs: [], panels: [] };
    groups[g].panels.push(panel);
  });

  // Also handle legacy tabs without data-group (fallback)
  const legacyTabs = document.querySelectorAll(".skills-tab:not([data-group])");
  const legacyPanels = document.querySelectorAll(".skills-panel:not([data-group])");
  if (legacyTabs.length) groups["__legacy"] = { tabs: Array.from(legacyTabs), panels: Array.from(legacyPanels) };

  Object.values(groups).forEach(({ tabs, panels }) => {
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.skillsTab;

        tabs.forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");

        panels.forEach((panel) => {
          if (panel.dataset.skillsPanel === target) {
            panel.classList.add("active");
          } else {
            panel.classList.remove("active");
          }
        });
      });
    });
  });
})();

// ============================================================
// CANVAS BACKGROUND ENGINE — multi-theme animated backgrounds
// ============================================================
(function () {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Resize ──────────────────────────────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", () => { resize(); activeScene.build(); });

  // ── Theme detection ─────────────────────────────────────────
  function getThemeKey() {
    const b = document.body;
    if (b.classList.contains("theme-forest"))  return "forest";
    if (b.classList.contains("theme-ocean"))   return "ocean";
    if (b.classList.contains("theme-sunset"))  return "sunset";
    if (b.classList.contains("light-mode"))    return "light";
    return "dark";
  }

  // ════════════════════════════════════════════════════════════
  // SCENE: OUTER SPACE (dark) — stars + shooting meteors
  // ════════════════════════════════════════════════════════════
  const sceneSpace = {
    stars: [], meteors: [], lastSpawn: 0, nextDelay: 2500,
    build() {
      this.stars = [];
      for (let i = 0; i < 280; i++) {
        const size = Math.random() < 0.15 ? Math.random() * 1.8 + 0.8
                   : Math.random() < 0.5  ? Math.random() * 0.9 + 0.3
                   :                        Math.random() * 0.5 + 0.1;
        this.stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          size, opacity: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.008 + 0.002, twinklePhase: Math.random() * Math.PI * 2 });
      }
      this.meteors = [];
    },
    spawnMeteor() {
      const angle = (Math.random() * 90 - 60) * (Math.PI / 180);
      const speed = Math.random() * 1.2 + 0.8;
      const length = Math.random() * 120 + 80;
      let x, y;
      if (Math.random() < 0.6) { x = Math.random() * canvas.width * 1.2 - canvas.width * 0.1; y = -20; }
      else { x = -20; y = Math.random() * canvas.height * 0.6; }
      this.meteors.push({ x, y, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + Math.abs(Math.cos(angle)) * 2,
        length, opacity: 0, life: 0, maxLife: Math.floor((canvas.width * 1.4) / speed) + 40 });
    },
    draw(ts) {
      for (const s of this.stars) {
        s.twinklePhase += s.twinkleSpeed;
        const twinkle = 0.6 + 0.4 * Math.sin(s.twinklePhase);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.opacity * twinkle})`; ctx.fill();
      }
      if (prefersReducedMotion) return;
      if (this.meteors.length < 3 && ts - this.lastSpawn > this.nextDelay) {
        this.spawnMeteor(); this.lastSpawn = ts; this.nextDelay = 2500 + Math.random() * 3000;
      }
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const m = this.meteors[i];
        m.x += m.vx; m.y += m.vy; m.life++;
        if (m.life < 30) m.opacity = m.life / 30;
        else if (m.life > m.maxLife - 30) m.opacity = Math.max(0, (m.maxLife - m.life) / 30);
        else m.opacity = 1;
        if (m.life > m.maxLife || m.x > canvas.width + 100 || m.y > canvas.height + 100) { this.meteors.splice(i, 1); continue; }
        const len = Math.hypot(m.vx, m.vy);
        const tailX = m.x - (m.vx / len) * m.length; const tailY = m.y - (m.vy / len) * m.length;
        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, `rgba(92,197,255,0)`); grad.addColorStop(0.6, `rgba(92,197,255,${m.opacity * 0.6})`); grad.addColorStop(1, `rgba(255,255,255,${m.opacity})`);
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.stroke();
        ctx.beginPath(); ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${m.opacity * 0.95})`; ctx.fill();
        const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 8);
        glow.addColorStop(0, `rgba(92,197,255,${m.opacity * 0.4})`); glow.addColorStop(1, `rgba(92,197,255,0)`);
        ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: DAYLIGHT (light) — drifting clouds
  // ════════════════════════════════════════════════════════════
  const sceneLight = {
    clouds: [],
    build() {
      this.clouds = [];
      for (let i = 0; i < 9; i++) this.clouds.push(this._makeCloud(Math.random() * canvas.width));
    },
    _makeCloud(x) {
      return { x, y: Math.random() * canvas.height * 0.55,
        scale: Math.random() * 0.8 + 0.4, speed: Math.random() * 0.25 + 0.08,
        opacity: Math.random() * 0.25 + 0.1,
        puffs: Array.from({ length: Math.floor(Math.random() * 3) + 3 }, () => ({
          dx: (Math.random() - 0.5) * 80, dy: (Math.random() - 0.5) * 20, r: Math.random() * 28 + 18 })) };
    },
    draw() {
      for (const c of this.clouds) {
        if (!prefersReducedMotion) c.x += c.speed;
        if (c.x - 200 * c.scale > canvas.width) c.x = -200 * c.scale;
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.scale, c.scale);
        ctx.globalAlpha = c.opacity; ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (const p of c.puffs) { ctx.beginPath(); ctx.arc(p.dx, p.dy, p.r, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore(); ctx.globalAlpha = 1;
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: FOREST TERMINAL — fireflies + falling leaves
  // ════════════════════════════════════════════════════════════
  const sceneForest = {
    fireflies: [], leaves: [],
    build() {
      this.fireflies = [];
      for (let i = 0; i < 55; i++) {
        this.fireflies.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          r: Math.random() * 2.2 + 0.8, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
          phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.025 + 0.01,
          hue: Math.random() < 0.7 ? 120 : 80 });
      }
      this.leaves = [];
      for (let i = 0; i < 18; i++) this.leaves.push(this._makeLeaf());
    },
    _makeLeaf() {
      return { x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height,
        size: Math.random() * 7 + 4, vy: Math.random() * 0.6 + 0.3, vx: (Math.random() - 0.5) * 0.5,
        rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.03,
        opacity: Math.random() * 0.4 + 0.2, green: Math.random() < 0.5 };
    },
    draw() {
      for (const f of this.fireflies) {
        if (!prefersReducedMotion) {
          f.phase += f.speed;
          f.x += f.vx + Math.sin(f.phase * 0.7) * 0.3; f.y += f.vy + Math.cos(f.phase * 0.5) * 0.3;
          if (f.x < 0) f.x = canvas.width; if (f.x > canvas.width) f.x = 0;
          if (f.y < 0) f.y = canvas.height; if (f.y > canvas.height) f.y = 0;
        }
        const glow = 0.4 + 0.6 * Math.abs(Math.sin(f.phase));
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 5);
        grd.addColorStop(0, `hsla(${f.hue},100%,70%,${glow * 0.9})`);
        grd.addColorStop(0.4, `hsla(${f.hue},100%,60%,${glow * 0.4})`);
        grd.addColorStop(1, `hsla(${f.hue},100%,50%,0)`);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 5, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${f.hue},100%,90%,${glow})`; ctx.fill();
      }
      for (const l of this.leaves) {
        if (!prefersReducedMotion) {
          l.y += l.vy; l.x += l.vx + Math.sin(l.rot) * 0.3; l.rot += l.rotSpeed;
          if (l.y > canvas.height + 20) { Object.assign(l, this._makeLeaf()); l.y = -20; }
        }
        ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot);
        ctx.globalAlpha = l.opacity;
        ctx.fillStyle = l.green ? "#4ade80" : "#86efac";
        ctx.beginPath(); ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: DEEP OCEAN — rising bubbles + seafloor waves
  // ════════════════════════════════════════════════════════════
  const sceneOcean = {
    bubbles: [], waveOffset: 0,
    build() {
      this.bubbles = [];
      for (let i = 0; i < 40; i++) this.bubbles.push(this._makeBubble());
      this.waveOffset = 0;
    },
    _makeBubble() {
      return { x: Math.random() * canvas.width, y: canvas.height + Math.random() * canvas.height,
        r: Math.random() * 5 + 2, vy: -(Math.random() * 0.6 + 0.3),
        wobble: Math.random() * Math.PI * 2, wobbleSpeed: Math.random() * 0.03 + 0.01,
        opacity: Math.random() * 0.35 + 0.1 };
    },
    draw() {
      if (!prefersReducedMotion) this.waveOffset += 0.008;
      const wh = canvas.height; const waveH = 60;
      ctx.beginPath(); ctx.moveTo(0, wh);
      for (let x = 0; x <= canvas.width; x += 4) {
        const y = wh - waveH * 0.4
          - Math.sin(x * 0.008 + this.waveOffset) * waveH * 0.3
          - Math.sin(x * 0.015 + this.waveOffset * 1.3) * waveH * 0.2;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, wh); ctx.closePath();
      const wg = ctx.createLinearGradient(0, wh - waveH, 0, wh);
      wg.addColorStop(0, "rgba(34,211,238,0.08)"); wg.addColorStop(1, "rgba(14,165,233,0.18)");
      ctx.fillStyle = wg; ctx.fill();
      for (const b of this.bubbles) {
        if (!prefersReducedMotion) {
          b.wobble += b.wobbleSpeed; b.y += b.vy; b.x += Math.sin(b.wobble) * 0.4;
          if (b.y < -20) Object.assign(b, this._makeBubble());
        }
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34,211,238,${b.opacity})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,245,255,${b.opacity * 0.6})`; ctx.fill();
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: SUNSET EMBER — volcano silhouette + rising embers + ash
  // ════════════════════════════════════════════════════════════
  const sceneSunset = {
    embers: [], ashParticles: [],
    build() {
      this.embers = [];
      for (let i = 0; i < 60; i++) this.embers.push(this._makeEmber());
      this.ashParticles = [];
      for (let i = 0; i < 25; i++) this.ashParticles.push(this._makeAsh());
    },
    _makeEmber() {
      return { x: canvas.width * 0.35 + (Math.random() - 0.5) * canvas.width * 0.5,
        y: canvas.height + Math.random() * 80,
        r: Math.random() * 2.5 + 0.8, vy: -(Math.random() * 1.2 + 0.5), vx: (Math.random() - 0.5) * 0.8,
        life: 0, maxLife: Math.floor(Math.random() * 180 + 80), hue: Math.random() < 0.6 ? 20 : 40 };
    },
    _makeAsh() {
      return { x: Math.random() * canvas.width, y: -10 - Math.random() * canvas.height * 0.5,
        r: Math.random() * 1.5 + 0.5, vy: Math.random() * 0.3 + 0.1, vx: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.3 + 0.1, wobble: Math.random() * Math.PI * 2, wobbleSpeed: Math.random() * 0.02 + 0.005 };
    },
    _drawVolcano() {
      const w = canvas.width; const h = canvas.height;
      // Left volcano
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w * 0.18, h * 0.52); ctx.lineTo(w * 0.28, h * 0.62); ctx.lineTo(w * 0.42, h); ctx.closePath();
      const g1 = ctx.createLinearGradient(0, h * 0.5, 0, h);
      g1.addColorStop(0, "rgba(30,8,2,0.85)"); g1.addColorStop(1, "rgba(15,4,1,0.95)");
      ctx.fillStyle = g1; ctx.fill();
      // Main volcano
      ctx.beginPath(); ctx.moveTo(w * 0.38, h); ctx.lineTo(w * 0.52, h * 0.38); ctx.lineTo(w * 0.56, h * 0.42); ctx.lineTo(w * 0.72, h); ctx.closePath();
      const g2 = ctx.createLinearGradient(w * 0.5, h * 0.35, w * 0.5, h);
      g2.addColorStop(0, "rgba(40,10,2,0.9)"); g2.addColorStop(1, "rgba(15,4,1,0.98)");
      ctx.fillStyle = g2; ctx.fill();
      // Far right hill
      ctx.beginPath(); ctx.moveTo(w * 0.65, h); ctx.lineTo(w * 0.82, h * 0.65); ctx.lineTo(w, h * 0.72); ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = "rgba(20,6,1,0.88)"; ctx.fill();
      // Crater glow
      const craterX = w * 0.535; const craterY = h * 0.39;
      const lg = ctx.createRadialGradient(craterX, craterY, 0, craterX, craterY, 60);
      lg.addColorStop(0, "rgba(255,120,0,0.55)"); lg.addColorStop(0.4, "rgba(255,60,0,0.25)"); lg.addColorStop(1, "rgba(255,30,0,0)");
      ctx.beginPath(); ctx.arc(craterX, craterY, 60, 0, Math.PI * 2); ctx.fillStyle = lg; ctx.fill();
      // Ground glow
      const gg = ctx.createLinearGradient(0, h * 0.85, 0, h);
      gg.addColorStop(0, "rgba(249,115,22,0)"); gg.addColorStop(1, "rgba(249,115,22,0.12)");
      ctx.fillRect(0, h * 0.85, w, h * 0.15);
    },
    draw() {
      this._drawVolcano();
      for (let i = this.embers.length - 1; i >= 0; i--) {
        const e = this.embers[i];
        if (!prefersReducedMotion) {
          e.x += e.vx + Math.sin(e.life * 0.05) * 0.3; e.y += e.vy; e.life++;
          if (e.life > e.maxLife || e.y < -20) { this.embers[i] = this._makeEmber(); continue; }
        }
        const progress = e.life / e.maxLife;
        const alpha = progress < 0.1 ? progress * 10 : progress > 0.7 ? (1 - progress) / 0.3 : 1;
        const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 3);
        grd.addColorStop(0, `hsla(${e.hue},100%,70%,${alpha * 0.9})`);
        grd.addColorStop(0.5, `hsla(${e.hue},100%,55%,${alpha * 0.4})`);
        grd.addColorStop(1, `hsla(${e.hue},100%,40%,0)`);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 3, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${e.hue + 20},100%,85%,${alpha})`; ctx.fill();
      }
      for (const a of this.ashParticles) {
        if (!prefersReducedMotion) {
          a.wobble += a.wobbleSpeed; a.y += a.vy; a.x += a.vx + Math.sin(a.wobble) * 0.3;
          if (a.y > canvas.height + 10) { Object.assign(a, this._makeAsh()); a.y = -10; }
        }
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,100,50,${a.opacity})`; ctx.fill();
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE ROUTER
  // ════════════════════════════════════════════════════════════
  const scenes = { dark: sceneSpace, light: sceneLight, forest: sceneForest, ocean: sceneOcean, sunset: sceneSunset };
  let activeScene = sceneSpace;
  let currentKey  = "dark";

  function switchScene(key) {
    if (key === currentKey) return;
    currentKey  = key;
    activeScene = scenes[key] || sceneSpace;
    activeScene.build();
  }

  activeScene.build();

  // ── Draw loop ────────────────────────────────────────────────
  let raf;
  function draw(ts) {
    const key = getThemeKey();
    if (key !== currentKey) switchScene(key);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    activeScene.draw(ts);
    raf = requestAnimationFrame(draw);
  }

  raf = requestAnimationFrame(draw);

  // Pause when tab is hidden to save CPU
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }
  });

  // Expose for theme switcher
  window.__rebuildBgScene = () => switchScene(getThemeKey());

})();


// ============================================================
// NAV DROPDOWN — About submenu with tab targeting
// ============================================================
(function () {
  const dropdownWraps = document.querySelectorAll(".nav-dropdown-wrap");

  dropdownWraps.forEach((wrap) => {
    const btn = wrap.querySelector(".nav-dropdown-btn");
    if (!btn) return;

    // Toggle on button click
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = wrap.classList.contains("open");
      // Close all others
      dropdownWraps.forEach((w) => w.classList.remove("open"));
      if (!isOpen) wrap.classList.add("open");
      btn.setAttribute("aria-expanded", String(!isOpen));
    });

    // Dropdown link click — scroll to section and activate tab
    wrap.querySelectorAll(".nav-dropdown a").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");

        // Close mobile nav
        document.body.classList.remove("nav-open");
        const navToggle = document.querySelector("[data-nav-toggle]");
        if (navToggle) navToggle.setAttribute("aria-expanded", "false");

        const tabTarget = link.dataset.tabTarget;
        const sectionHref = link.getAttribute("href");

        // Scroll to section
        const section = document.querySelector(sectionHref);
        if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });

        // Activate the correct tab
        if (tabTarget) {
          setTimeout(() => {
            const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabTarget}"]`);
            if (tabBtn) tabBtn.click();
          }, 400);
        }
      });
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    dropdownWraps.forEach((w) => {
      w.classList.remove("open");
      const b = w.querySelector(".nav-dropdown-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dropdownWraps.forEach((w) => {
        w.classList.remove("open");
        const b = w.querySelector(".nav-dropdown-btn");
        if (b) b.setAttribute("aria-expanded", "false");
      });
    }
  });
})();

// ============================================================
// CHATBOT FAB TOOLTIP — show on page load, auto-dismiss
// ============================================================
(function () {
  const tooltip = document.getElementById("chatbot-fab-tooltip");
  const closeBtn = document.getElementById("chatbot-tooltip-close");
  const fab = document.getElementById("chatbot-fab");

  if (!tooltip) return;

  let hideTimer;

  function showTooltip() {
    tooltip.classList.add("visible");
    // Auto-hide after 6 seconds
    hideTimer = setTimeout(hideTooltip, 6000);
  }

  function hideTooltip() {
    clearTimeout(hideTimer);
    tooltip.classList.remove("visible");
  }

  // Show 2s after page load
  setTimeout(showTooltip, 2000);

  // Dismiss on close button
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideTooltip();
    });
  }

  // Hide when FAB is clicked (chat opens)
  if (fab) {
    fab.addEventListener("click", hideTooltip);
  }
})();


// ============================================================
// FLAPPY CLOUD — isolated lazy bootstrap (resources load on activation)
// ============================================================
(function initFlappyCloudBootstrap() {
  "use strict";

  const INTENT_KEY = "cloud-rescue:intent";
  const LOAD_TIMEOUT_MS = 10000;
  const MODULE_PATH = "./game/fc-engine.js";
  const STYLESHEET_PATH = "./game/fc-overlay.css";
  const CLOSE_LABEL = "Close Deploy Before Dawn: Cloud Rescue";

  function afterDomReady(callback) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", callback, { once: true });
    else callback();
  }

  afterDomReady(() => {
    const cta = document.querySelector(".cr-cta");
    const root = document.getElementById("cloud-rescue-root");
    if (!cta || !root) return;

    const readIntent = () => {
      try { return sessionStorage.getItem(INTENT_KEY); } catch { return null; }
    };
    const rememberIntent = () => {
      try { sessionStorage.setItem(INTENT_KEY, "open"); } catch { /* Storage is optional. */ }
    };
    const clearIntent = () => {
      try { sessionStorage.removeItem(INTENT_KEY); } catch { /* Storage is optional. */ }
    };

    let generation = 0;
    let activationPending = false;
    let loadedEngine = null;
    let modulePromise = null;
    let cssLink = null;
    let cssPromise = null;
    let cssCancel = null;
    let cssReady = false;
    let activeSession = null;
    let loadingAbortController = null;
    let activeDeadline = null;
    let criticalStyle = null;

    function typedError(code, message, cause) {
      const error = new Error(message, cause ? { cause } : undefined);
      error.code = code;
      return error;
    }

    function capabilitySupported() {
      try {
        const scratch = document.createElement("canvas");
        return typeof scratch.getContext === "function" && Boolean(scratch.getContext("2d"));
      } catch {
        return false;
      }
    }

    function showUnavailable() {
      cta.disabled = true;
      cta.setAttribute("aria-disabled", "true");
      let status = cta.parentElement?.querySelector("[data-fc-unavailable]");
      if (!status) {
        status = document.createElement("span");
        status.dataset.fcUnavailable = "true";
        status.className = "cr-unavailable-message";
        status.setAttribute("role", "status");
        cta.insertAdjacentElement("afterend", status);
      }
      status.textContent = "Mini-game không khả dụng trên trình duyệt này";
      clearIntent();
    }

    function captureStyles(element, properties) {
      return Object.fromEntries(properties.map((property) => [property, element.style.getPropertyValue(property)]));
    }

    function restoreStyles(element, values) {
      for (const [property, value] of Object.entries(values)) {
        if (value) element.style.setProperty(property, value);
        else element.style.removeProperty(property);
      }
      if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
    }

    function createBootstrapOverlaySession(trigger) {
      const body = document.body;
      const html = document.documentElement;
      const scrollX = Number.isFinite(window.scrollX) ? window.scrollX : 0;
      const scrollY = Number.isFinite(window.scrollY) ? window.scrollY : 0;
      const activeElement = document.activeElement;
      const bodyProperties = ["position", "top", "left", "right", "width", "overflow", "padding-right"];
      const siblingSnapshots = [...(root.parentElement?.children || [])]
        .filter((node) => node !== root)
        .map((node) => ({
          node,
          inertSupported: "inert" in node,
          inert: "inert" in node ? Boolean(node.inert) : undefined,
          ariaHidden: node.getAttribute("aria-hidden"),
        }));
      const snapshot = Object.freeze({
        activeElement,
        scrollX,
        scrollY,
        bodyStyles: Object.freeze(captureStyles(body, bodyProperties)),
        htmlStyles: Object.freeze(captureStyles(html, ["overflow"])),
        bodyHadClass: body.classList.contains("cr-game-open"),
        siblingSnapshots,
      });
      let owner = "bootstrap";
      let transferred = false;
      let restoreCount = 0;

      body.classList.add("cr-game-open");
      body.style.position = "fixed";
      body.style.top = `${-scrollY}px`;
      body.style.left = `${-scrollX}px`;
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 0;
      const documentWidth = Number.isFinite(html.clientWidth) ? html.clientWidth : 0;
      const scrollbarWidth = documentWidth > 0 ? Math.max(0, viewportWidth - documentWidth) : 0;
      if (scrollbarWidth > 0) {
        const currentPadding = Number.parseFloat(window.getComputedStyle?.(body)?.paddingRight || "0") || 0;
        body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      }
      html.style.overflow = "hidden";
      for (const entry of siblingSnapshots) {
        if (entry.inertSupported) entry.node.inert = true;
        else entry.node.setAttribute("aria-hidden", "true");
      }

      return {
        snapshot,
        trigger,
        transferToEngine() {
          if (owner === "restored") throw typedError("SESSION_RESTORED", "OverlaySession was already restored.");
          if (!transferred) {
            transferred = true;
            owner = "engine";
          }
          return owner === "engine";
        },
        restore(requester = owner) {
          if (owner === "restored" || requester !== owner) return false;
          for (const entry of siblingSnapshots) {
            if (entry.inertSupported) entry.node.inert = entry.inert;
            if (entry.ariaHidden === null) entry.node.removeAttribute("aria-hidden");
            else entry.node.setAttribute("aria-hidden", entry.ariaHidden);
          }
          restoreStyles(body, snapshot.bodyStyles);
          restoreStyles(html, snapshot.htmlStyles);
          if (!snapshot.bodyHadClass) body.classList.remove("cr-game-open");
          try { window.scrollTo(scrollX, scrollY); } catch { /* Some webviews disallow scrollTo. */ }
          const focusTarget = trigger?.isConnected ? trigger : activeElement?.isConnected ? activeElement : document.querySelector("h1, h2");
          try { focusTarget?.focus?.({ preventScroll: true }); } catch { focusTarget?.focus?.(); }
          owner = "restored";
          restoreCount += 1;
          return true;
        },
        get owner() { return owner; },
        get restoreCount() { return restoreCount; },
        get locked() { return owner !== "restored"; },
      };
    }

    function ensureCriticalStyle() {
      if (criticalStyle?.isConnected) return criticalStyle;
      criticalStyle = document.createElement("style");
      criticalStyle.setAttribute("data-fc-loading-critical", "true");
      criticalStyle.textContent = `
        #cloud-rescue-root { position: fixed; inset: 0; z-index: 10000; overflow: hidden; }
        #cloud-rescue-root .cr-loading-shell { position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; overflow: auto; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); color: #f8fafc; background: #080b1b; opacity: 1; transition: opacity 240ms ease; font-family: "Urbanist", system-ui, sans-serif; }
        #cloud-rescue-root .cr-loading-shell h2 { font-family: "Space Grotesk", "Urbanist", system-ui, sans-serif; }
        #cloud-rescue-root .cr-loading-shell button { min-width: 44px; min-height: 44px; border: 1px solid #aab6d3; border-radius: 999px; padding: 10px 18px; color: #f8fafc; background: #11182e; font: inherit; font-weight: 700; }
        #cloud-rescue-root .cr-loading-shell .cr-close { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); width: 44px; height: 44px; padding: 0; font-size: 24px; }
        #cloud-rescue-root .cr-loading-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        #cloud-rescue-root .cr-loading-shell :focus-visible { outline: 3px solid #7dd3fc; outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) { #cloud-rescue-root .cr-loading-shell { transition-duration: 0ms; } }
      `;
      document.head.appendChild(criticalStyle);
      return criticalStyle;
    }

    function removeCriticalStyle() {
      criticalStyle?.remove();
      criticalStyle = null;
    }

    function abortLoadingTrap() {
      loadingAbortController?.abort();
      loadingAbortController = null;
    }

    function focusables(container) {
      return [...container.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hidden);
    }

    function installLoadingTrap(shell) {
      abortLoadingTrap();
      loadingAbortController = new AbortController();
      const signal = loadingAbortController.signal;
      shell.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const elements = focusables(shell);
        if (elements.length === 0) return;
        event.preventDefault();
        const current = elements.indexOf(document.activeElement);
        const offset = event.shiftKey ? -1 : 1;
        const next = (current + offset + elements.length) % elements.length;
        elements[next].focus();
      }, { signal });
    }

    function shellMarkup(kind, error) {
      const loading = kind === "loading";
      const message = error?.code === "LOAD_TIMEOUT"
        ? "Cloud Rescue could not finish loading in 10 seconds."
        : error
          ? "Cloud Rescue is temporarily unavailable. Your portfolio is unchanged."
          : "Loading mini-game…";
      return `<div class="cr-loading-shell" role="dialog" aria-modal="true" aria-labelledby="cr-loading-title" aria-describedby="cr-loading-status" aria-busy="${loading ? "true" : "false"}">
        <button type="button" class="cr-close" data-loading-action="close" aria-label="${CLOSE_LABEL}">×</button>
        <h2 id="cr-loading-title" tabindex="-1">Deploy Before Dawn: Cloud Rescue</h2>
        <p id="cr-loading-status" role="${error ? "alert" : "status"}">${message}</p>
        <div class="cr-loading-actions">
          ${error ? '<button type="button" data-loading-action="retry">Retry</button>' : ''}
          <button type="button" data-loading-action="back">Back to Portfolio</button>
        </div>
      </div>`;
    }

    function abandonBootstrapSession(reason = "back") {
      generation += 1;
      activationPending = false;
      activeDeadline?.cancel();
      activeDeadline = null;
      abortLoadingTrap();
      if (!cssReady) {
        const cancelCss = cssCancel;
        cssCancel = null;
        const pendingLink = cssLink;
        cssLink = null;
        cssPromise = null;
        cancelCss?.();
        pendingLink?.remove();
      }
      root.replaceChildren();
      root.hidden = true;
      removeCriticalStyle();
      if (activeSession?.owner === "bootstrap") activeSession.restore("bootstrap");
      activeSession = null;
      clearIntent();
      return reason;
    }

    function mountBootstrapView(kind, error = null) {
      ensureCriticalStyle();
      root.hidden = false;
      root.innerHTML = shellMarkup(kind, error);
      const shell = root.querySelector(".cr-loading-shell");
      installLoadingTrap(shell);
      shell.addEventListener("click", (event) => {
        const action = event.target.closest?.("[data-loading-action]")?.dataset.loadingAction;
        if (action === "retry") beginAttempt();
        else if (action === "close" || action === "back") abandonBootstrapSession(action);
      }, { signal: loadingAbortController.signal });
      const initialFocus = error ? shell.querySelector("[data-loading-action='retry']") : shell.querySelector("#cr-loading-title");
      try { initialFocus?.focus?.({ preventScroll: true }); } catch { initialFocus?.focus?.(); }
    }

    function ensureStylesheet() {
      if (cssReady && cssLink?.isConnected) return Promise.resolve(cssLink);
      if (cssPromise) return cssPromise;
      const link = document.querySelector('link[data-fc-game-resource="styles"]') || document.createElement("link");
      const shouldAppend = !link.isConnected;
      if (shouldAppend) {
        link.rel = "stylesheet";
        link.href = STYLESHEET_PATH;
        link.dataset.fcGameResource = "styles";
      }
      let cancelRequest = null;
      const pending = new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          link.removeEventListener("load", onLoad);
          link.removeEventListener("error", onError);
        };
        const settle = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback(value);
        };
        const onLoad = () => settle(resolve, link);
        const onError = () => settle(reject, typedError("CSS_LOAD_FAILED", "Cloud Rescue styles failed to load."));
        cancelRequest = () => settle(reject, typedError("STALE_LOAD", "Cancelled stale stylesheet load."));
        if (link.sheet) { settle(resolve, link); return; }
        link.addEventListener("load", onLoad);
        link.addEventListener("error", onError);
      });
      let attemptPromise;
      attemptPromise = pending.then((loadedLink) => {
        if (cssLink === link) {
          cssReady = true;
          cssCancel = null;
        }
        return loadedLink;
      }).catch((error) => {
        if (cssLink === link) {
          cssPromise = null;
          cssCancel = null;
          cssReady = false;
          cssLink = null;
        }
        link.remove();
        throw error;
      });
      cssLink = link;
      cssPromise = attemptPromise;
      cssCancel = cancelRequest;
      if (shouldAppend) document.head.appendChild(link);
      return attemptPromise;
    }

    function ensureModule() {
      if (loadedEngine) return Promise.resolve(loadedEngine);
      if (!modulePromise) {
        modulePromise = import(MODULE_PATH)
          .then((engine) => { loadedEngine = engine; return engine; })
          .catch((error) => { modulePromise = null; throw typedError("MODULE_LOAD_FAILED", "Cloud Rescue module failed to load.", error); });
      }
      return modulePromise;
    }

    function deadlinePromise(start, token) {
      let timeoutId = null;
      let cancelled = false;
      const promise = new Promise((_, reject) => {
        const check = () => {
          if (cancelled) return;
          if (token !== generation) { reject(typedError("STALE_LOAD", "Stale game load.")); return; }
          const remaining = start + LOAD_TIMEOUT_MS - performance.now();
          if (remaining <= 0) { reject(typedError("LOAD_TIMEOUT", "Cloud Rescue took longer than 10 seconds to load.")); return; }
          timeoutId = window.setTimeout(check, Math.min(remaining, 250));
        };
        timeoutId = window.setTimeout(check, LOAD_TIMEOUT_MS);
      });
      return {
        promise,
        cancel() { cancelled = true; if (timeoutId !== null) window.clearTimeout(timeoutId); },
      };
    }

    function handoffToEngine(engine, token) {
      if (token !== generation || !activationPending || activeSession?.owner !== "bootstrap") return;
      abortLoadingTrap();
      const session = activeSession;
      try {
        engine.open({
          root,
          trigger: cta,
          overlaySession: session,
          onClose: () => {
            clearIntent();
            activationPending = false;
            activeSession = null;
            removeCriticalStyle();
          },
        });
        activationPending = false;
        clearIntent();
        queueMicrotask(removeCriticalStyle);
      } catch (error) {
        if (session.owner === "bootstrap") session.restore("bootstrap");
        activeSession = null;
        activationPending = true;
        try { activeSession = createBootstrapOverlaySession(cta); } catch { activeSession = null; }
        if (activeSession) mountBootstrapView("error", typedError("ENGINE_OPEN_FAILED", "Cloud Rescue could not open.", error));
        else abandonBootstrapSession("open-error");
      }
    }

    function beginAttempt() {
      if (!activeSession || activeSession.owner !== "bootstrap") return;
      const token = ++generation;
      activationPending = true;
      mountBootstrapView("loading");
      const start = performance.now();
      activeDeadline?.cancel();
      const deadline = deadlinePromise(start, token);
      activeDeadline = deadline;
      const resources = Promise.all([ensureModule(), ensureStylesheet()]);
      Promise.race([resources, deadline.promise])
        .then(([engine]) => {
          deadline.cancel();
          if (activeDeadline === deadline) activeDeadline = null;
          if (token !== generation) throw typedError("STALE_LOAD", "Stale game load.");
          handoffToEngine(engine, token);
        })
        .catch((error) => {
          deadline.cancel();
          if (activeDeadline === deadline) activeDeadline = null;
          if (token !== generation || error?.code === "STALE_LOAD") return;
          generation += 1;
          activationPending = true;
          mountBootstrapView("error", error);
        });
    }

    function activate() {
      if (activationPending || loadedEngine?.isOpen?.()) return;
      if (!capabilitySupported()) { showUnavailable(); return; }
      rememberIntent();
      activeSession = createBootstrapOverlaySession(cta);
      beginAttempt();
    }

    // Native button activation already maps click, Enter, Space, and tap to one event.
    cta.addEventListener("click", activate);

    // A stale crash intent is never treated as a fresh user activation.
    if (readIntent() === "open") clearIntent();
  });
})();
