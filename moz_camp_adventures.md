# CLAUDE.md — Moz Camp Adventures Frontend Development Rules

## 🔥 Always Do First
- Invoke the `frontend-design` skill before writing any frontend code, every session, no exceptions.
- Think like a **senior product designer + front-end engineer**, not just a developer.

---

# 🎯 Design Philosophy (CRITICAL)

This project MUST feel like a **premium travel platform** (similar to Airbnb, GetYourGuide, or Booking).

Every UI decision must prioritize:

- Visual clarity
- Emotional appeal (travel inspiration)
- Conversion (booking-focused UX)
- Simplicity and elegance

Avoid generic layouts at all costs.

---

# 🎨 UI/UX Standards (MANDATORY)

## Layout Quality
- Use clean spacing and strong visual hierarchy
- Avoid cluttered layouts
- Use whitespace intentionally

## Visual Hierarchy
- Titles must stand out clearly
- Secondary text must be softer
- Important actions (buttons) must be visually dominant

## Cards (VERY IMPORTANT)
All cards (tours, accommodations) must:

- Have soft shadows (not Bootstrap default)
- Use rounded corners (border-radius: 12px–20px)
- Include hover interaction:
  - slight lift (transform: translateY)
  - shadow enhancement

## Buttons
Buttons must:

- Have clear hierarchy (primary vs secondary)
- Include:
  - hover state
  - active state
  - focus-visible state

Avoid default Bootstrap button styles — customize them.

---

# ✨ Micro-Interactions

Use subtle animations:

- hover → transform + shadow
- transitions: 200ms–300ms ease
- animate ONLY:
  - transform
  - opacity

Never use `transition: all`

---

# 🧠 UX Rules

## Clarity First
- Users must immediately understand:
  - what the experience is
  - how much it costs
  - how to book

## Reduce Friction
- Keep forms simple
- Avoid unnecessary steps
- Make CTA buttons obvious

## Consistency
- All pages must feel part of the same system
- Reuse patterns (cards, sections, spacing)

---

# 🌍 Project Context

This project is the official website for **Moz Camp Adventures**, a tourism agency based in Maputo, Mozambique.

The website promotes:
- Island day trips
- Beach day trips
- Safaris
- Transfers
- Maputo city tours
- Luxury accommodations

The site must be:
- Professional
- Fast
- SEO-friendly
- Visually appealing
- Easy to maintain

---

# 🧱 Core Technology Stack

Use ONLY:

- HTML5
- Bootstrap 5
- Vanilla JavaScript
- Custom CSS
- JSON data

DO NOT use:
- React
- Vue
- Angular
- Next.js

---

# 📁 Project Structure

/pages
  index.html
  tours.html
  destinations.html
  accommodations.html
  package.html

/assets
  /css
  /js
  /images
  /icons

/data
  tours.json
  accommodations.json
  testimonials.json
  team.json

/components
  navbar.html
  footer.html

---

# 📦 Data Driven System

All packages must come from JSON.

❌ NEVER hardcode tours in HTML  
✅ ALWAYS render dynamically via JavaScript

---

# ⚙️ JavaScript Rules

- Always guard DOM elements

```js
const el = document.querySelector('.example')
if (!el) return