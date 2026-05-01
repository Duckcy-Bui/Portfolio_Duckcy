# Code Snippets & Implementation Examples

## 🎨 ANIMATION SNIPPETS

### Skill Progress Bar Animation
```html
<!-- HTML -->
<div class="skill-bar">
  <div class="skill-label">Docker</div>
  <div class="skill-progress">
    <div class="skill-fill" style="--progress: 85%;"></div>
  </div>
  <span class="skill-percent">85%</span>
</div>
```

```css
/* CSS */
.skill-fill {
  width: var(--progress, 0%);
  height: 100%;
  background: linear-gradient(90deg, var(--accent-2) 0%, var(--accent) 100%);
  border-radius: 8px;
  animation: fillBar 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-fill-mode: both;
}

.skill-card:nth-child(1) .skill-fill { animation-delay: 0s; }
.skill-card:nth-child(2) .skill-fill { animation-delay: 0.15s; }
.skill-card:nth-child(3) .skill-fill { animation-delay: 0.3s; }
.skill-card:nth-child(4) .skill-fill { animation-delay: 0.45s; }

@keyframes fillBar {
  from {
    width: 0%;
    opacity: 0;
  }
  to {
    width: var(--progress);
    opacity: 1;
  }
}
```

```javascript
// JavaScript - Trigger on scroll into view
const skillBars = document.querySelectorAll(".skill-card");

const skillObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("animate");
      skillObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

skillBars.forEach((bar) => skillObserver.observe(bar));
```

---

### Counter Animation (Stats)
```html
<!-- HTML -->
<div class="stat-card">
  <div class="stat-number" data-target="3.4">0</div>
  <div class="stat-label">GPA</div>
</div>
```

```javascript
// JavaScript
function animateCounter(element, target, duration = 2000) {
  const start = 0;
  const increment = target / (duration / 16);
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = target.toFixed(1);
      clearInterval(timer);
    } else {
      element.textContent = current.toFixed(1);
    }
  }, 16);
}

// Trigger on scroll into view
const statCards = document.querySelectorAll("[data-target]");
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const target = parseFloat(entry.target.dataset.target);
      animateCounter(entry.target, target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

statCards.forEach((card) => counterObserver.observe(card));
```

---

### Form Input Validation
```html
<!-- HTML -->
<form class="contact-form" id="contact-form">
  <input 
    type="text" 
    name="name" 
    placeholder="Your Name"
    required
    data-validate="name"
  >
  <input 
    type="email" 
    name="email" 
    placeholder="Your Email"
    required
    data-validate="email"
  >
  <textarea 
    name="message" 
    placeholder="Your Message"
    required
    data-validate="message"
  ></textarea>
  <button type="submit" class="btn primary">Send Message</button>
</form>
```

```css
/* CSS */
input, textarea {
  border: 2px solid var(--stroke);
  border-radius: 10px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-family: inherit;
  transition: all 0.3s ease;
}

input:focus, textarea:focus {
  outline: none;
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 20px rgba(247, 209, 84, 0.2);
}

input.valid {
  border-color: #4ade80;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.2);
}

input.invalid, textarea.invalid {
  border-color: #ef4444;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
}

.error-message {
  color: #ef4444;
  font-size: 13px;
  margin-top: 4px;
  display: none;
}

input.invalid + .error-message,
textarea.invalid + .error-message {
  display: block;
}
```

```javascript
// JavaScript
const form = document.getElementById("contact-form");

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validateName(name) {
  return name.trim().length >= 2;
}

function validateMessage(message) {
  return message.trim().length >= 10;
}

form?.addEventListener("change", (e) => {
  const input = e.target;
  let isValid = false;

  switch (input.dataset.validate) {
    case "email":
      isValid = validateEmail(input.value);
      break;
    case "name":
      isValid = validateName(input.value);
      break;
    case "message":
      isValid = validateMessage(input.value);
      break;
  }

  input.classList.toggle("valid", isValid && input.value);
  input.classList.toggle("invalid", !isValid && input.value);
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const formData = new FormData(form);
  
  // Send to backend
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData)),
      headers: { "Content-Type": "application/json" }
    });
    
    if (response.ok) {
      showToast("Message sent successfully!", "success");
      form.reset();
    } else {
      showToast("Failed to send message", "error");
    }
  } catch (error) {
    showToast("Error sending message", "error");
  }
});
```

---

### Carousel/Testimonials
```html
<!-- HTML -->
<div class="carousel" id="testimonial-carousel">
  <div class="carousel-container">
    <div class="carousel-slide active">
      <p class="testimonial-text">"Great work!"</p>
      <p class="testimonial-author">John Doe - CEO</p>
    </div>
    <div class="carousel-slide">
      <p class="testimonial-text">"Excellent performance!"</p>
      <p class="testimonial-author">Jane Smith - CTO</p>
    </div>
  </div>
  
  <div class="carousel-controls">
    <button class="carousel-btn prev" aria-label="Previous slide">←</button>
    <button class="carousel-btn next" aria-label="Next slide">→</button>
  </div>
  
  <div class="carousel-indicators">
    <button class="indicator active" data-slide="0"></button>
    <button class="indicator" data-slide="1"></button>
  </div>
</div>
```

```css
/* CSS */
.carousel {
  position: relative;
  overflow: hidden;
}

.carousel-container {
  display: flex;
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.carousel-slide {
  min-width: 100%;
  padding: 40px;
  text-align: center;
}

.carousel-slide.active {
  animation: slideIn 0.6s ease forwards;
}

.carousel-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(247, 209, 84, 0.1);
  border: 2px solid var(--accent);
  color: var(--accent);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 10;
}

.carousel-btn:hover {
  background: var(--accent);
  color: #0b0f1c;
  transform: translateY(-50%) scale(1.1);
}

.carousel-btn.prev { left: 20px; }
.carousel-btn.next { right: 20px; }

.carousel-indicators {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

.indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--stroke);
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
}

.indicator.active {
  background: var(--accent);
  border-color: var(--accent);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

```javascript
// JavaScript
class Carousel {
  constructor(selector) {
    this.carousel = document.querySelector(selector);
    this.container = this.carousel.querySelector(".carousel-container");
    this.slides = this.carousel.querySelectorAll(".carousel-slide");
    this.indicators = this.carousel.querySelectorAll(".indicator");
    this.currentSlide = 0;
    
    this.carousel.querySelector(".carousel-btn.prev").addEventListener("click", () => this.prev());
    this.carousel.querySelector(".carousel-btn.next").addEventListener("click", () => this.next());
    
    this.indicators.forEach((indicator, index) => {
      indicator.addEventListener("click", () => this.goToSlide(index));
    });
  }
  
  goToSlide(index) {
    this.currentSlide = index;
    this.container.style.transform = `translateX(-${index * 100}%)`;
    
    this.indicators.forEach(ind => ind.classList.remove("active"));
    this.indicators[index].classList.add("active");
  }
  
  next() {
    this.goToSlide((this.currentSlide + 1) % this.slides.length);
  }
  
  prev() {
    this.goToSlide((this.currentSlide - 1 + this.slides.length) % this.slides.length);
  }
}

new Carousel("#testimonial-carousel");
```

---

### Scroll Progress Bar
```html
<!-- HTML -->
<div class="scroll-progress"></div>
```

```css
/* CSS */
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%);
  width: 0%;
  z-index: 1000;
  transition: width 0.1s ease;
}
```

```javascript
// JavaScript
window.addEventListener("scroll", () => {
  const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
  const scrolled = (window.scrollY / windowHeight) * 100;
  document.querySelector(".scroll-progress").style.width = scrolled + "%";
});
```

---

### Light/Dark Mode Toggle
```html
<!-- HTML -->
<button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark/light mode">
  <span class="theme-icon">🌙</span>
</button>
```

```css
/* CSS */
:root {
  color-scheme: dark;
}

body.light-mode {
  --bg: #f5f5f5;
  --text: #1a1a1a;
  --muted: #666;
  --stroke: rgba(0, 0, 0, 0.1);
}

body.light-mode .theme-icon::before {
  content: "☀️";
}

.theme-toggle {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.theme-toggle:hover {
  transform: rotate(20deg);
}
```

```javascript
// JavaScript
const themeToggle = document.getElementById("theme-toggle");
const savedTheme = localStorage.getItem("theme") || "dark";

document.body.classList.toggle("light-mode", savedTheme === "light");

themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});
```

---

### Copy to Clipboard
```html
<!-- HTML -->
<a href="mailto:email@example.com" class="copy-to-clipboard" data-copy="email@example.com">
  email@example.com
  <span class="copy-icon">📋</span>
</a>
```

```javascript
// JavaScript
document.querySelectorAll(".copy-to-clipboard").forEach((element) => {
  element.addEventListener("click", (e) => {
    e.preventDefault();
    const text = element.dataset.copy;
    
    navigator.clipboard.writeText(text).then(() => {
      const original = element.textContent;
      element.textContent = "Copied! ✓";
      element.classList.add("copied");
      
      setTimeout(() => {
        element.textContent = original;
        element.classList.remove("copied");
      }, 2000);
    });
  });
});
```

---

### Glassmorphism Cards
```css
/* CSS */
.glass-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding: 24px;
  transition: all 0.3s ease;
}

.glass-card:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}
```

---

### 3D Hover Effect
```css
/* CSS */
.card-3d {
  perspective: 1000px;
  transition: transform 0.3s ease;
}

.card-3d:hover {
  transform: perspective(1000px) rotateX(5deg) rotateY(5deg) scale(1.02);
}
```

---

## 🔗 USEFUL JAVASCRIPT PATTERNS

### Debounce Function
```javascript
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Usage
const handleResize = debounce(() => {
  console.log("Window resized");
}, 250);

window.addEventListener("resize", handleResize);
```

### Event Delegation
```javascript
// Instead of adding listeners to each button
document.addEventListener("click", (e) => {
  if (e.target.matches(".btn")) {
    console.log("Button clicked:", e.target);
  }
});
```

### LocalStorage Theme
```javascript
const theme = localStorage.getItem("theme") || "dark";
document.body.classList.add(`${theme}-mode`);

function toggleTheme() {
  const newTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
  document.body.classList.toggle("dark-mode");
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", newTheme);
}
```

---

## 📚 RESOURCES

### CSS Animation References
- [MDN Web Docs - Animations](https://developer.mozilla.org/en-US/docs/Web/CSS/animation)
- [CSS Tricks - Animation](https://css-tricks.com/almanac/properties/a/animation/)
- [Easing Functions](https://easings.net/)

### JavaScript Resources
- [MDN Web Docs - JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- [JavaScript.info](https://javascript.info/)
- [Web APIs](https://developer.mozilla.org/en-US/docs/Web/API)

### Tools & Generators
- [Cubic Bezier Generator](https://cubic-bezier.com/)
- [Animation Generator](https://animista.net/)
- [Color Palette Generator](https://coolors.co/)
- [Font Pairings](https://www.fontpair.co/)

---

**Note:** These are standalone snippets. Test and adapt them for your specific needs.
