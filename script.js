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
  
  lines.forEach((line, index) => {
    const span = document.createElement("span");
    span.className = "code-line";
    span.style.animationDelay = `${index * 0.15}s`;
    
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

// Project Filtering
const searchInput = document.querySelector("[data-project-search]");
const filterButtons = document.querySelectorAll("[data-filter]");
const projectList = document.querySelector("[data-project-list]");
const projectCount = document.querySelector("[data-project-count]");

if (projectList && projectCount) {
  const cards = Array.from(projectList.querySelectorAll(".project-card"));
  const total = cards.length;
  let activeFilter = "all";
  let activeQuery = "";

  const updateCount = (visible) => {
    projectCount.textContent = `Showing ${visible} of ${total} projects`;
  };

  const applyFilters = () => {
    let visible = 0;
    cards.forEach((card) => {
      const tags = (card.dataset.tags || "").toLowerCase().split(",").map((tag) => tag.trim());
      const text = (card.dataset.text || "").toLowerCase();
      const matchesTag = activeFilter === "all" || tags.includes(activeFilter);
      const matchesQuery = !activeQuery || text.includes(activeQuery);
      const shouldShow = matchesTag && matchesQuery;
      card.style.display = shouldShow ? "flex" : "none";
      if (shouldShow) {
        visible += 1;
      }
    });
    updateCount(visible);
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      activeFilter = button.dataset.filter || "all";
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      activeQuery = event.target.value.trim().toLowerCase();
      applyFilters();
    });
  }

  applyFilters();
}

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
// LIGHT / DARK MODE TOGGLE
// ============================================================
const themeToggle = document.getElementById("theme-toggle");
const savedTheme = localStorage.getItem("portfolio-theme") || "dark";

if (savedTheme === "light") {
  document.body.classList.add("light-mode");
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-mode");
    localStorage.setItem("portfolio-theme", isLight ? "light" : "dark");
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
// SKILL PROGRESS BARS — animate on scroll into view
// ============================================================
const skillCards = document.querySelectorAll(".skill-card");

if (skillCards.length > 0) {
  const skillBarObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("bars-animated");
        skillBarObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  skillCards.forEach((card) => skillBarObserver.observe(card));
}

// ============================================================
// CONTACT FORM — validation + mailto submit
// ============================================================
const contactForm = document.getElementById("contact-form");

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

  contactForm.addEventListener("submit", (e) => {
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

    const subject = encodeURIComponent(`Portfolio Contact from ${name}`);
    const body = encodeURIComponent(
      `Hi Duc,\n\nMy name is ${name} (${email}).\n\n${message}\n\nBest regards,\n${name}`
    );

    window.location.href = `mailto:duckcyzzz1305@gmail.com?subject=${subject}&body=${body}`;
    showToast("Opening your email client...", "info");
    contactForm.reset();
    fields.forEach((f) => f.classList.remove("valid", "invalid"));
  });
}

// ============================================================
// COPY EMAIL TO CLIPBOARD
// ============================================================
const copyEmailLinks = document.querySelectorAll(".copy-email");

copyEmailLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const text = link.dataset.copy;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
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
// SKILLS TAB SWITCHER
// ============================================================
(function () {
  const tabs = document.querySelectorAll(".skills-tab");
  const panels = document.querySelectorAll(".skills-panel");

  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.skillsTab;

      // Update tabs
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      // Swap panels — hide current, show new with animation
      panels.forEach((panel) => {
        if (panel.dataset.skillsPanel === target) {
          panel.classList.add("active");
        } else {
          panel.classList.remove("active");
        }
      });
    });
  });
})();

// ============================================================
// CANVAS STARFIELD — static stars + random shooting stars
// ============================================================
(function () {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const isLightMode = () => document.body.classList.contains("light-mode");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Resize canvas to full viewport ──────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", () => { resize(); buildStars(); });

  // ── Static star field ────────────────────────────────────────
  const STAR_COUNT = 280;
  let stars = [];

  function buildStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const size = Math.random() < 0.15 ? Math.random() * 1.8 + 0.8   // bright
                 : Math.random() < 0.5  ? Math.random() * 0.9 + 0.3   // medium
                 :                        Math.random() * 0.5 + 0.1;   // dim
      stars.push({
        x:       Math.random() * canvas.width,
        y:       Math.random() * canvas.height,
        size,
        opacity: Math.random() * 0.5 + 0.3,
        // gentle twinkle
        twinkleSpeed: Math.random() * 0.008 + 0.002,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  }
  buildStars();

  // ── Shooting stars ───────────────────────────────────────────
  // Each meteor has a random direction: mostly diagonal (top→bottom-right)
  // but also some left→right and top→bottom variants.
  const meteors = [];
  const MAX_METEORS = 3; // max simultaneous on screen

  function spawnMeteor() {
    // Random direction: angle between -60° and +30° from horizontal
    // 0° = pure left→right, -45° = diagonal top-left→bottom-right
    const angle = (Math.random() * 90 - 60) * (Math.PI / 180); // -60° to +30°
    const speed = Math.random() * 1.2 + 0.8;   // 0.8–2 px/frame (slow glide)
    const length = Math.random() * 120 + 80;    // 80–200px tail

    // Start position: random point along top or left edge
    let x, y;
    if (Math.random() < 0.6) {
      // Start from top edge
      x = Math.random() * canvas.width * 1.2 - canvas.width * 0.1;
      y = -20;
    } else {
      // Start from left edge
      x = -20;
      y = Math.random() * canvas.height * 0.6;
    }

    meteors.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + Math.abs(Math.cos(angle)) * 2, // always moves down a bit
      length,
      opacity: 0,
      phase: "fadein", // fadein → travel → fadeout
      life: 0,
      maxLife: Math.floor((canvas.width * 1.4) / speed) + 40,
    });
  }

  // Spawn interval: every 2.5–5.5 seconds (medium frequency)
  let lastSpawn = 0;
  let nextSpawnDelay = 2500 + Math.random() * 3000;

  // ── Draw loop ────────────────────────────────────────────────
  let raf;
  function draw(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const light = isLightMode();

    // Draw static stars
    for (const s of stars) {
      s.twinklePhase += s.twinkleSpeed;
      const twinkle = 0.6 + 0.4 * Math.sin(s.twinklePhase);
      const alpha = s.opacity * twinkle * (light ? 0.25 : 1);

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fillStyle = light
        ? `rgba(30, 40, 80, ${alpha})`
        : `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }

    if (!prefersReducedMotion) {
      // Spawn new meteors
      if (meteors.length < MAX_METEORS && timestamp - lastSpawn > nextSpawnDelay) {
        spawnMeteor();
        lastSpawn = timestamp;
        nextSpawnDelay = 2500 + Math.random() * 3000;
      }

      // Update and draw meteors
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life++;

        // Fade in quickly, travel, fade out at end
        if (m.life < 30) {
          m.opacity = m.life / 30;
        } else if (m.life > m.maxLife - 30) {
          m.opacity = Math.max(0, (m.maxLife - m.life) / 30);
        } else {
          m.opacity = 1;
        }

        // Remove if off screen or life expired
        if (
          m.life > m.maxLife ||
          m.x > canvas.width + 100 ||
          m.y > canvas.height + 100
        ) {
          meteors.splice(i, 1);
          continue;
        }

        // Draw meteor tail
        const tailX = m.x - m.vx / Math.hypot(m.vx, m.vy) * m.length;
        const tailY = m.y - m.vy / Math.hypot(m.vx, m.vy) * m.length;

        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        if (light) {
          grad.addColorStop(0, `rgba(0, 144, 204, 0)`);
          grad.addColorStop(0.7, `rgba(0, 144, 204, ${m.opacity * 0.5})`);
          grad.addColorStop(1, `rgba(255, 255, 255, ${m.opacity * 0.8})`);
        } else {
          grad.addColorStop(0, `rgba(92, 197, 255, 0)`);
          grad.addColorStop(0.6, `rgba(92, 197, 255, ${m.opacity * 0.6})`);
          grad.addColorStop(1, `rgba(255, 255, 255, ${m.opacity})`);
        }

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.stroke();

        // Bright head dot
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${m.opacity * 0.95})`;
        ctx.fill();

        // Soft glow around head
        const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 8);
        glow.addColorStop(0, `rgba(92, 197, 255, ${m.opacity * 0.4})`);
        glow.addColorStop(1, `rgba(92, 197, 255, 0)`);
        ctx.beginPath();
        ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }
    }

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
})();
