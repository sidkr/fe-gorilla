<script setup>
useHead({
  title: "",  // empty so titleTemplate uses the default homepage title
  meta: [
    { name: "description", content: "Fe-Mail Gorilla — iron-forged email marketing for senders who mean business. Design, segment, and send campaigns with 98.4% inbox placement. Free for your first 10,000 emails / month." },
    { property: "og:title", content: "Fe-Mail Gorilla — Email that hits like iron." },
    { property: "og:description", content: "Fe-Mail Gorilla: iron-forged email marketing. Design, segment, and send campaigns that actually arrive." },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://gorilla.email/" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
  link: [
    { rel: "canonical", href: "https://gorilla.email/" },
  ],
});
</script>

<template>

  <!-- ── NAV ─────────────────────────────────────────────── -->
  <nav class="nav">
    <div class="wrap nav-inner">
      <NuxtLink to="/" class="brand" aria-label="Fe-Mail Gorilla home">
        <svg class="brand-mark" width="32" height="32" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fe-Mail Gorilla">
          <path d="M14 22 C14 11 21 4 32 4 C43 4 50 11 50 22 L50 36 C50 47 43 56 32 60 C21 56 14 47 14 36 Z" fill="var(--color-pop)"/>
          <path d="M14 22 L50 22 L50 28 L14 28 Z" fill="var(--color-pop-deep)"/>
          <line x1="32" y1="4" x2="32" y2="22" stroke="var(--color-ink)" stroke-width="1.4" stroke-opacity="0.32"/>
          <circle cx="32" cy="12" r="1.6" fill="var(--color-ink)" fill-opacity="0.55"/>
          <circle cx="19" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
          <circle cx="45" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
          <rect x="19" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
          <rect x="36" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
          <path d="M22 45 L42 45 L38 53 L26 53 Z" fill="var(--color-pop-deep)"/>
        </svg>
        <span class="brand-word">Fe-Mail Gorilla</span>
        <span class="fe26" aria-label="Iron, element 26">
          <span class="num">26</span><span class="sym">Fe</span>
        </span>
      </NuxtLink>
      <ul class="nav-links">
        <li><a href="#">Product</a></li>
        <li><a href="#">Pricing</a></li>
        <li><a href="#">Customers</a></li>
        <li><a href="#">Changelog</a></li>
        <li><a href="#">Docs</a></li>
      </ul>
      <div class="nav-cta">
        <NuxtLink to="/login" class="nav-signin">Sign in</NuxtLink>
        <NuxtLink to="/signup" class="btn btn-primary btn-sm">Sign up free</NuxtLink>
      </div>
    </div>
  </nav>

  <!-- ── HERO ────────────────────────────────────────────── -->
  <section class="hero">
    <div class="wrap hero-inner">
      <div class="hero-copy">
        <div class="eyebrow hero-eyebrow" aria-label="Iron, element 26">
          <span class="dot" aria-hidden="true"></span>
          <span>26</span>
          <span class="sep">·</span>
          <span>Fe</span>
          <span class="sep">·</span>
          <span>Iron</span>
        </div>
        <h1>Email that hits like iron.</h1>
        <p class="lede">Fe-Mail Gorilla is iron-forged email marketing — design, segment, and send campaigns that actually arrive. 98.4% inbox placement, real-time reporting, and a visual editor your team won't fight.</p>
        <div class="hero-cta">
          <NuxtLink to="/signup" class="btn btn-primary btn-lg">
            Sign up free
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </NuxtLink>
          <a href="#" class="btn btn-ghost btn-lg">See live demo</a>
        </div>
        <p class="hero-trust">Free for your first 10,000 emails / month · no card required</p>
      </div>

      <div class="hero-figure" aria-hidden="true">
        <!-- decorative motion lines / forge marks -->
        <svg class="deco" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
          <g stroke="var(--color-pop-deep)" stroke-opacity="0.18" stroke-width="1.5" fill="none">
            <circle cx="200" cy="200" r="180"/>
            <circle cx="200" cy="200" r="150" stroke-dasharray="2 6"/>
          </g>
          <g stroke="var(--color-pop-deep)" stroke-opacity="0.32" stroke-width="2" stroke-linecap="round">
            <line x1="40" y1="80" x2="80" y2="80"/>
            <line x1="20" y1="120" x2="70" y2="120"/>
            <line x1="40" y1="160" x2="80" y2="160"/>
            <line x1="320" y1="80" x2="360" y2="80"/>
            <line x1="330" y1="120" x2="380" y2="120"/>
            <line x1="320" y1="160" x2="360" y2="160"/>
          </g>
          <g fill="var(--color-pop-deep)" fill-opacity="0.55">
            <circle cx="60" cy="280" r="3"/>
            <circle cx="80" cy="300" r="2"/>
            <circle cx="340" cy="280" r="3"/>
            <circle cx="320" cy="300" r="2"/>
            <circle cx="200" cy="40" r="2.5"/>
            <circle cx="200" cy="370" r="2.5"/>
          </g>
        </svg>
        <div class="mark-wrap">
          <svg class="brand-big" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fe-Mail Gorilla">
            <path d="M14 22 C14 11 21 4 32 4 C43 4 50 11 50 22 L50 36 C50 47 43 56 32 60 C21 56 14 47 14 36 Z" fill="var(--color-pop)"/>
            <path d="M14 22 L50 22 L50 28 L14 28 Z" fill="var(--color-pop-deep)"/>
            <line x1="32" y1="4" x2="32" y2="22" stroke="var(--color-ink)" stroke-width="1.4" stroke-opacity="0.32"/>
            <circle cx="32" cy="12" r="1.6" fill="var(--color-ink)" fill-opacity="0.55"/>
            <circle cx="19" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
            <circle cx="45" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
            <rect x="19" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
            <rect x="36" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
            <path d="M22 45 L42 45 L38 53 L26 53 Z" fill="var(--color-pop-deep)"/>
          </svg>
        </div>
        <span class="stamp">Forged · Fe26</span>
      </div>
    </div>

    <!-- ── STATS ─────────────────────────────────────────── -->
    <div class="stats">
      <div class="wrap stats-grid">
        <div class="stat">
          <div class="num">98.4<span class="accent">%</span></div>
          <div class="label">Inbox placement, measured weekly</div>
        </div>
        <div class="stat">
          <div class="num">12M<span class="accent">+</span></div>
          <div class="label">Emails sent through Fe-Mail Gorilla this week</div>
        </div>
        <div class="stat">
          <div class="num">3.2<span class="accent">s</span></div>
          <div class="label">Average composer-to-send time</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── FEATURE TRIO ────────────────────────────────────── -->
  <section class="block">
    <div class="wrap">
      <div class="sect-head">
        <span class="sect-eyebrow">What you get</span>
        <h2>Heavy-duty tools, finally easy to use.</h2>
      </div>
      <div class="features">
        <article class="feature">
          <span class="icon" aria-hidden="true">
            <!-- wand -->
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-pop)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>
            </svg>
          </span>
          <h3>Visual editor that doesn't get in your way.</h3>
          <p>Drag, drop, send. Or paste your existing HTML — we don't care, we just deliver.</p>
        </article>
        <article class="feature">
          <span class="icon" aria-hidden="true">
            <!-- target -->
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-pop)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
          </span>
          <h3>Segments that find the people who open.</h3>
          <p>Build rules across any field. Save them, reuse them, watch them update live.</p>
        </article>
        <article class="feature">
          <span class="icon" aria-hidden="true">
            <!-- chart -->
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-pop)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18"/>
              <path d="M7 15l4-4 3 3 6-7"/>
            </svg>
          </span>
          <h3>Reports that actually tell a story.</h3>
          <p>Open rate, click-through, per-link, per-recipient — everything's clickable, nothing's buried.</p>
        </article>
      </div>
    </div>
  </section>

  <!-- ── HOW IT WORKS ────────────────────────────────────── -->
  <section class="block how">
    <div class="wrap">
      <div class="sect-head">
        <span class="sect-eyebrow">How it works</span>
        <h2>Three steps. No surprises.</h2>
      </div>
      <div class="steps">
        <div class="step">
          <span class="num">01</span>
          <svg class="illo" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="8" y="14" width="64" height="52" rx="6" fill="var(--color-pop-bg)" stroke="var(--color-pop-deep)" stroke-width="1.5"/>
            <rect x="16" y="24" width="32" height="3" rx="1" fill="var(--color-pop)"/>
            <rect x="16" y="34" width="48" height="2" rx="1" fill="var(--color-ink)" fill-opacity="0.3"/>
            <rect x="16" y="42" width="40" height="2" rx="1" fill="var(--color-ink)" fill-opacity="0.3"/>
            <rect x="16" y="50" width="44" height="2" rx="1" fill="var(--color-ink)" fill-opacity="0.3"/>
            <path d="M52 56 L60 56 M56 52 L60 56 L56 60" stroke="var(--color-pop)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <h3>Import your list.</h3>
          <p>CSV, paste, or sync from your store. We dedupe, validate, and flag bad addresses.</p>
        </div>
        <div class="step">
          <span class="num">02</span>
          <svg class="illo" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="10" y="10" width="60" height="60" rx="6" fill="var(--color-surface)" stroke="var(--color-ink)" stroke-opacity="0.15" stroke-width="1.5"/>
            <rect x="18" y="20" width="44" height="8" rx="2" fill="var(--color-pop)"/>
            <rect x="18" y="32" width="20" height="20" rx="2" fill="var(--color-pop-bg)" stroke="var(--color-pop-deep)" stroke-width="1"/>
            <rect x="42" y="32" width="20" height="6" rx="1.5" fill="var(--color-ink)" fill-opacity="0.2"/>
            <rect x="42" y="42" width="20" height="3" rx="1" fill="var(--color-ink)" fill-opacity="0.18"/>
            <rect x="42" y="48" width="14" height="3" rx="1" fill="var(--color-ink)" fill-opacity="0.18"/>
            <rect x="18" y="56" width="44" height="6" rx="1.5" fill="var(--color-ink)" fill-opacity="0.12"/>
          </svg>
          <h3>Design your campaign.</h3>
          <p>Block editor or HTML. Merge tags work. Preview in 14 inbox clients.</p>
        </div>
        <div class="step">
          <span class="num">03</span>
          <svg class="illo" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M14 40 L66 14 L52 66 L42 44 Z" fill="var(--color-pop)" stroke="var(--color-pop-deep)" stroke-width="1.5" stroke-linejoin="round"/>
            <line x1="42" y1="44" x2="66" y2="14" stroke="var(--color-pop-deep)" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="20" cy="22" r="3" fill="var(--color-ink)" fill-opacity="0.18"/>
            <circle cx="64" cy="56" r="3" fill="var(--color-ink)" fill-opacity="0.18"/>
            <circle cx="14" cy="60" r="2" fill="var(--color-ink)" fill-opacity="0.2"/>
          </svg>
          <h3>Send and watch.</h3>
          <p>Schedule or send now. Reports update in real time. No refresh.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── TESTIMONIAL ─────────────────────────────────────── -->
  <section class="block">
    <div class="wrap testimonial-wrap">
      <div class="testimonial">
        <span class="qmark" aria-hidden="true">“</span>
        <blockquote>We moved off Mailchimp in a weekend. Fe-Mail Gorilla feels like it was forged by people who actually send email.</blockquote>
        <cite><strong>Alex K.</strong> · Head of Growth, Folkways</cite>
      </div>

      <div class="logos" aria-label="Trusted by">
        <span class="lbl">Trusted by</span>
        <svg width="92" height="20" viewBox="0 0 92 20" xmlns="http://www.w3.org/2000/svg" aria-label="Folkways">
          <text x="0" y="15" font-family="Manrope, sans-serif" font-weight="800" font-size="16" fill="currentColor" letter-spacing="-0.4">FOLKWAYS</text>
        </svg>
        <svg width="78" height="20" viewBox="0 0 78 20" xmlns="http://www.w3.org/2000/svg" aria-label="Northbeam">
          <circle cx="9" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/>
          <text x="20" y="15" font-family="Inter, sans-serif" font-weight="700" font-size="14" fill="currentColor">northbeam</text>
        </svg>
        <svg width="70" height="20" viewBox="0 0 70 20" xmlns="http://www.w3.org/2000/svg" aria-label="Kindling">
          <rect x="0" y="4" width="12" height="12" fill="currentColor"/>
          <text x="18" y="15" font-family="Manrope, sans-serif" font-weight="700" font-size="14" fill="currentColor">Kindling</text>
        </svg>
        <svg width="60" height="20" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg" aria-label="Maple &amp; Co">
          <text x="0" y="15" font-family="Inter, sans-serif" font-weight="600" font-size="13" fill="currentColor" font-style="italic">Maple &amp; Co.</text>
        </svg>
        <svg width="76" height="20" viewBox="0 0 76 20" xmlns="http://www.w3.org/2000/svg" aria-label="Argonaut">
          <polygon points="0,16 6,4 12,16" fill="currentColor"/>
          <text x="16" y="15" font-family="Manrope, sans-serif" font-weight="800" font-size="13" fill="currentColor" letter-spacing="1">ARGONAUT</text>
        </svg>
      </div>
    </div>
  </section>

  <!-- ── FINAL DARK CTA ──────────────────────────────────── -->
  <section class="final-cta">
    <div class="wrap">
      <h2>Start sending. We'll do the heavy lifting.</h2>
      <NuxtLink to="/signup" class="btn btn-primary btn-lg">
        Sign up free
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </NuxtLink>
      <p class="trust">Free for your first 10,000 emails / month · no card required</p>
    </div>
  </section>

  <!-- ── FOOTER ──────────────────────────────────────────── -->
  <footer>
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="#" class="brand">
            <svg class="brand-mark" width="28" height="28" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fe-Mail Gorilla">
              <path d="M14 22 C14 11 21 4 32 4 C43 4 50 11 50 22 L50 36 C50 47 43 56 32 60 C21 56 14 47 14 36 Z" fill="var(--color-pop)"/>
              <path d="M14 22 L50 22 L50 28 L14 28 Z" fill="var(--color-pop-deep)"/>
              <line x1="32" y1="4" x2="32" y2="22" stroke="var(--color-ink)" stroke-width="1.4" stroke-opacity="0.32"/>
              <circle cx="32" cy="12" r="1.6" fill="var(--color-ink)" fill-opacity="0.55"/>
              <circle cx="19" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
              <circle cx="45" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
              <rect x="19" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
              <rect x="36" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
              <path d="M22 45 L42 45 L38 53 L26 53 Z" fill="var(--color-pop-deep)"/>
            </svg>
            <span class="brand-word">Fe-Mail Gorilla</span>
          </a>
          <p class="blurb">Fe-Mail Gorilla — iron-forged email marketing for teams that want their campaigns to actually arrive.</p>
        </div>
        <div class="footer-col">
          <h4>Product</h4>
          <ul>
            <li><a href="#">Editor</a></li>
            <li><a href="#">Segments</a></li>
            <li><a href="#">Reports</a></li>
            <li><a href="#">Automations</a></li>
            <li><a href="#">Pricing</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Resources</h4>
          <ul>
            <li><a href="#">Docs</a></li>
            <li><a href="#">API reference</a></li>
            <li><a href="#">Templates</a></li>
            <li><a href="#">Deliverability guide</a></li>
            <li><a href="#">Changelog</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="#">About</a></li>
            <li><a href="#">Customers</a></li>
            <li><a href="#">Careers</a></li>
            <li><a href="#">Press kit</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Legal</h4>
          <ul>
            <li><a href="#">Terms</a></li>
            <li><a href="#">Privacy</a></li>
            <li><a href="#">GDPR</a></li>
            <li><a href="#">DPA</a></li>
            <li><a href="#">Security</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span class="meta">© 2026 Fe-Mail Gorilla · Forged for email</span>
        <span class="fe26" aria-label="Iron, element 26">
          <span class="num">26</span><span class="sym">Fe</span><span class="name">Iron</span>
        </span>
      </div>
    </div>
  </footer>

</template>

<style>
    /* ── Reset-ish ─────────────────────────────────────────── */
    a { color: inherit; text-decoration: none; }
    button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
    ul { list-style: none; padding: 0; margin: 0; }
    h1, h2, h3, h4, p { margin: 0; }

    /* ── Layout helpers ────────────────────────────────────── */
    .wrap {
      max-width: var(--container-max);
      margin: 0 auto;
      padding: 0 var(--container-pad);
    }

    /* ── Brand mark / wordmark ─────────────────────────────── */
    .brand { display: inline-flex; align-items: center; gap: var(--space-3); }
    .brand-mark { display: block; }
    .brand-word {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: var(--text-xl);
      letter-spacing: var(--tracking-tight);
      color: var(--color-ink);
    }

    /* ── Fe26 element chip (the quiet signature) ───────────── */
    .fe26 {
      display: inline-flex;
      align-items: stretch;
      font-family: var(--font-mono);
      font-size: 10px;
      line-height: 1;
      border: 1px solid var(--color-rule-strong);
      border-radius: var(--radius-xs);
      overflow: hidden;
      background: var(--color-surface);
      color: var(--color-ink);
      letter-spacing: var(--tracking-wide);
    }
    .fe26 .num {
      padding: 4px 5px;
      background: var(--color-surface-sunk);
      color: var(--color-ink-soft);
      border-right: 1px solid var(--color-rule);
      font-weight: 500;
    }
    .fe26 .sym {
      padding: 4px 6px;
      font-weight: 600;
    }
    .fe26 .name {
      padding: 4px 6px;
      background: var(--color-ink);
      color: var(--color-ink-on-pop);
      letter-spacing: var(--tracking-wider);
    }

    /* ── Buttons ───────────────────────────────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      height: 44px;
      padding: 0 var(--space-5);
      border-radius: var(--radius-md);
      font-family: var(--font-body);
      font-weight: 600;
      font-size: var(--text-base);
      letter-spacing: var(--tracking-tight);
      transition: background var(--dur-base) var(--ease-out),
                  color var(--dur-base) var(--ease-out),
                  transform var(--dur-fast) var(--ease-out);
    }
    .btn:active { transform: translateY(1px); }
    .btn-primary {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-fg);
    }
    .btn-primary:hover { background: var(--btn-primary-hover); }
    .btn-ghost {
      color: var(--btn-ghost-fg);
      border: 1px solid var(--btn-ghost-border);
      background: var(--color-surface);
    }
    .btn-ghost:hover { background: var(--btn-ghost-hover-bg); }
    .btn-sm { height: 36px; padding: 0 var(--space-4); font-size: var(--text-sm); }
    .btn-lg { height: 52px; padding: 0 var(--space-6); font-size: var(--text-md); }

    /* ── Eyebrow chip (periodic-table styled) ──────────────── */
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      letter-spacing: var(--tracking-wider);
      color: var(--color-ink);
      text-transform: uppercase;
      padding: 6px 10px;
      background: var(--color-surface);
      border: 1px solid var(--color-rule-strong);
      border-radius: var(--radius-xs);
    }
    .eyebrow .dot {
      width: 8px;
      height: 8px;
      background: var(--color-pop);
      display: inline-block;
    }
    .eyebrow .sep { color: var(--color-ink-dim); }

    /* ── Section eyebrow (mono small caps with coral dot) ──── */
    .sect-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      letter-spacing: var(--tracking-wider);
      color: var(--color-ink-soft);
      text-transform: uppercase;
    }
    .sect-eyebrow::before {
      content: "";
      width: 8px;
      height: 8px;
      background: var(--color-pop);
      display: inline-block;
    }

    /* ── Nav ───────────────────────────────────────────────── */
    .nav {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(255, 255, 255, 0.92);
      border-bottom: 1px solid var(--color-rule);
      backdrop-filter: saturate(180%) blur(0); /* no blur per brand */
    }
    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 72px;
    }
    .nav-links {
      display: flex;
      gap: var(--space-6);
    }
    .nav-links a {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-ink-soft);
      letter-spacing: var(--tracking-tight);
      transition: color var(--dur-fast) var(--ease-out);
    }
    .nav-links a:hover { color: var(--color-ink); }
    .nav-cta { display: flex; align-items: center; gap: var(--space-3); }
    .nav-signin {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-ink);
      padding: 0 var(--space-3);
    }

    /* ── Hero ──────────────────────────────────────────────── */
    .hero {
      background: var(--color-pop-bg);
      position: relative;
      overflow: hidden;
    }
    .hero-inner {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: var(--space-8);
      align-items: center;
      padding: var(--space-9) 0 var(--space-8);
    }
    .hero-eyebrow { margin-bottom: var(--space-5); }
    .hero h1 {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: var(--text-7xl);
      line-height: 0.98;
      letter-spacing: -0.035em;
      color: var(--color-ink);
      margin-bottom: var(--space-5);
      max-width: 12ch;
    }
    .hero .lede {
      font-size: var(--text-lg);
      line-height: var(--leading-snug);
      color: var(--color-ink-soft);
      max-width: 52ch;
      margin-bottom: var(--space-6);
    }
    .hero-cta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .hero-trust {
      font-size: var(--text-sm);
      color: var(--color-ink-dim);
    }

    /* Hero composition (right column) */
    .hero-figure {
      position: relative;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hero-figure .mark-wrap {
      position: relative;
      width: 78%;
      max-width: 380px;
    }
    .hero-figure .deco {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    }
    .hero-figure svg.brand-big {
      position: relative;
      z-index: 1;
      width: 100%;
      height: auto;
      filter: drop-shadow(0 24px 48px rgba(197, 48, 48, 0.22));
    }
    .hero-figure .stamp {
      position: absolute;
      bottom: 6%;
      right: -2%;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-pop-deep);
      letter-spacing: var(--tracking-wider);
      text-transform: uppercase;
      border: 1.5px solid var(--color-pop-deep);
      padding: 6px 10px;
      border-radius: var(--radius-xs);
      transform: rotate(-6deg);
      background: var(--color-pop-bg);
      z-index: 2;
    }

    /* ── Stats strip ───────────────────────────────────────── */
    .stats {
      background: var(--color-pop-bg);
      border-top: 1px solid rgba(197, 48, 48, 0.14);
      padding: var(--space-7) 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-7);
    }
    .stat .num {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: var(--text-5xl);
      line-height: 1;
      letter-spacing: var(--tracking-tighter);
      color: var(--color-ink);
      margin-bottom: var(--space-2);
    }
    .stat .num .accent { color: var(--color-pop); }
    .stat .label {
      font-size: var(--text-sm);
      color: var(--color-ink-soft);
      letter-spacing: var(--tracking-tight);
    }

    /* ── Sections ──────────────────────────────────────────── */
    section.block {
      padding: var(--space-9) 0;
    }
    .sect-head { margin-bottom: var(--space-7); max-width: 720px; }
    .sect-head .sect-eyebrow { margin-bottom: var(--space-4); }
    .sect-head h2 {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: var(--text-5xl);
      line-height: 1.02;
      letter-spacing: var(--tracking-tighter);
      color: var(--color-ink);
    }

    /* ── Feature trio ──────────────────────────────────────── */
    .features {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-5);
    }
    .feature {
      padding: var(--space-6);
      background: var(--color-surface);
      border: 1px solid var(--color-rule);
      border-radius: var(--radius-lg);
      transition: border-color var(--dur-base) var(--ease-out),
                  box-shadow var(--dur-base) var(--ease-out),
                  transform var(--dur-base) var(--ease-out);
    }
    .feature:hover {
      border-color: var(--color-rule-strong);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .feature .icon {
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--color-pop-bg);
      border-radius: var(--radius-sm);
      margin-bottom: var(--space-5);
    }
    .feature h3 {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: var(--text-xl);
      letter-spacing: var(--tracking-tight);
      color: var(--color-ink);
      margin-bottom: var(--space-3);
      line-height: var(--leading-snug);
    }
    .feature p {
      font-size: var(--text-base);
      color: var(--color-ink-soft);
      line-height: var(--leading-normal);
    }

    /* ── How it works ──────────────────────────────────────── */
    .how {
      background: var(--color-surface-2);
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-7);
      position: relative;
    }
    .step {
      position: relative;
    }
    .step .num {
      font-family: var(--font-mono);
      font-size: var(--text-xl);
      color: var(--color-pop);
      letter-spacing: var(--tracking-wide);
      font-weight: 500;
      margin-bottom: var(--space-4);
      display: block;
    }
    .step .illo {
      width: 80px;
      height: 80px;
      margin-bottom: var(--space-5);
      display: block;
    }
    .step h3 {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: var(--text-2xl);
      letter-spacing: var(--tracking-tight);
      color: var(--color-ink);
      margin-bottom: var(--space-3);
      line-height: var(--leading-tight);
    }
    .step p {
      font-size: var(--text-base);
      color: var(--color-ink-soft);
      line-height: var(--leading-normal);
    }

    /* ── Testimonial ───────────────────────────────────────── */
    .testimonial-wrap {
      text-align: center;
      max-width: 760px;
      margin: 0 auto;
    }
    .testimonial {
      padding: var(--space-8) var(--space-7);
      background: var(--color-surface);
      border: 1px solid var(--color-rule);
      border-radius: var(--radius-xl);
      position: relative;
    }
    .testimonial .qmark {
      position: absolute;
      top: -18px;
      left: 50%;
      transform: translateX(-50%);
      width: 44px;
      height: 44px;
      background: var(--color-pop);
      color: var(--color-ink-on-pop);
      border-radius: var(--radius-sm);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-weight: 800;
      font-size: var(--text-2xl);
      line-height: 1;
    }
    .testimonial blockquote {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: var(--text-2xl);
      line-height: var(--leading-snug);
      letter-spacing: var(--tracking-tight);
      color: var(--color-ink);
      margin: 0 0 var(--space-5);
    }
    .testimonial cite {
      font-style: normal;
      font-size: var(--text-sm);
      color: var(--color-ink-soft);
      letter-spacing: var(--tracking-tight);
    }
    .testimonial cite strong {
      color: var(--color-ink);
      font-weight: 600;
    }

    /* Logo strip */
    .logos {
      margin-top: var(--space-7);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-6);
      flex-wrap: wrap;
    }
    .logos .lbl {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-ink-dim);
      letter-spacing: var(--tracking-wider);
      text-transform: uppercase;
    }
    .logos svg { display: block; color: var(--color-ink-dim); }

    /* ── Final dark CTA ────────────────────────────────────── */
    .final-cta {
      background: var(--color-ink);
      padding: var(--space-9) 0;
      text-align: center;
    }
    .final-cta h2 {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: var(--text-5xl);
      line-height: 1.05;
      letter-spacing: var(--tracking-tighter);
      color: var(--color-ink-on-pop);
      margin-bottom: var(--space-6);
      max-width: 18ch;
      margin-left: auto;
      margin-right: auto;
    }
    .final-cta .btn-primary {
      background: var(--color-pop);
      color: var(--color-ink-on-pop);
      height: 56px;
      padding: 0 var(--space-6);
      font-size: var(--text-md);
      font-weight: 700;
    }
    .final-cta .btn-primary:hover { background: var(--color-pop-deep); }
    .final-cta .trust {
      margin-top: var(--space-5);
      font-size: var(--text-sm);
      color: var(--color-ink-dim);
    }

    /* ── Footer ────────────────────────────────────────────── */
    footer {
      background: var(--color-surface);
      border-top: 1px solid var(--color-rule);
      padding: var(--space-8) 0 var(--space-6);
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1.4fr repeat(4, 1fr);
      gap: var(--space-7);
      padding-bottom: var(--space-7);
      border-bottom: 1px solid var(--color-rule);
    }
    .footer-brand .blurb {
      margin-top: var(--space-4);
      font-size: var(--text-sm);
      color: var(--color-ink-soft);
      line-height: var(--leading-normal);
      max-width: 28ch;
    }
    .footer-col h4 {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      letter-spacing: var(--tracking-wider);
      color: var(--color-ink-dim);
      text-transform: uppercase;
      font-weight: 500;
      margin-bottom: var(--space-4);
    }
    .footer-col ul li { margin-bottom: var(--space-3); }
    .footer-col a {
      font-size: var(--text-sm);
      color: var(--color-ink-soft);
      transition: color var(--dur-fast) var(--ease-out);
    }
    .footer-col a:hover { color: var(--color-ink); }
    .footer-bottom {
      padding-top: var(--space-5);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-5);
      flex-wrap: wrap;
    }
    .footer-bottom .meta {
      font-size: var(--text-sm);
      color: var(--color-ink-dim);
    }

    /* ── Responsive ────────────────────────────────────────── */
    @media (max-width: 960px) {
      .hero-inner { grid-template-columns: 1fr; padding: var(--space-8) 0; }
      .hero h1 { font-size: var(--text-5xl); }
      .hero-figure { max-width: 320px; margin: 0 auto; }
      .stats-grid { grid-template-columns: 1fr; gap: var(--space-5); }
      .features { grid-template-columns: 1fr; }
      .steps { grid-template-columns: 1fr; }
      .sect-head h2, .final-cta h2 { font-size: var(--text-4xl); }
      .stat .num { font-size: var(--text-4xl); }
      .footer-grid { grid-template-columns: 1fr 1fr; }
      .nav-links { display: none; }
    }
</style>
