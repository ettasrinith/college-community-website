# Codebase Review and Security Audit: College Community Website

## Overview
I have conducted a thorough review of the `college-community-website` codebase. The project is an Express/Node.js backend with a MongoDB database, using a vanilla HTML/CSS/JS frontend. 

While the website has a decent functional structure and uses Cloudinary well for media storage, it suffers from **severe architectural flaws and critical security vulnerabilities**—which is common when a project is built via "vibe coding" (rapid development without a strict architectural/security plan). 

Below is the comprehensive analysis of your architecture, security, scalability, and code quality.

---

## 🚨 Critical Security Vulnerabilities (Must Fix Immediately)

### 1. Source Code & Secrets Exposure (Path Traversal)
**File:** `server.js` (Line 63)
```javascript
app.use(express.static(path.join(__dirname, '.')));
```
**The Risk:** You are serving the **entire backend root directory** as static files. Anyone on the internet can simply go to `https://your-domain.com/server.js` or `https://your-domain.com/config/admins.json` and download your backend code, including potentially `.env` files, database models, and route logic. 
**Fix:** Move all frontend files (`*.html`, `css/`, `js/`) into a `public/` directory and serve only that directory: `app.use(express.static(path.join(__dirname, 'public')));`.

### 2. Complete API Authentication Bypass (Spoofing)
**Files:** `routes/marketplaceRoute.js`, `routes/examPaperRoute.js`, `routes/lostFoundRoute.js`
**The Risk:** The backend relies entirely on the frontend to tell it who is making the request. In your frontend JS, you append `postedByEmail` to the `FormData` or JSON payload. The backend blindly trusts this input:
```javascript
// Example from marketplaceRoute.js
const { postedBy, postedByEmail } = req.body;
```
An attacker can bypass the frontend, open Postman or a terminal, and send a `POST /api/marketplace` request using *anyone's* email (including admins). They can also use this same flaw to delete other people's items by forging the `postedBy` field.
**Fix:** Never trust client input for authentication. You are using Passport.js for session management. Use `req.user` in the backend routes to verify identity instead of reading `req.body.postedByEmail`. Create a middleware `requireAuth` and apply it to all POST/DELETE routes.

### 3. Admin Authentication Bypass
**File:** `routes/announcementRoute.js`
**The Risk:** The `checkAdmin` middleware checks if a user is an admin by extracting their email from the request body:
```javascript
function checkAdmin(req, res, next) {
  const email = req.body.postedByEmail || req.query.postedByEmail;
  if (!email || !admins.includes(email)) { ... }
}
```
An attacker can simply send `postedByEmail="ettasrinith82@gmail.com"` in a POST request, and the backend will grant them full admin rights to create or delete announcements.
**Fix:** Read the email from the authenticated session: `const email = req.user?.email`.

### 4. Stored Cross-Site Scripting (XSS)
**Files:** `marketplace.html`, `announcements.html`, `lost-found.html`, `exams.html`
**The Risk:** You are directly injecting user input into the DOM using `.innerHTML`.
```javascript
// Example from marketplace.html
card.innerHTML = `<h3>${item.itemName}</h3> <p>${item.itemDescription}</p>`;
```
An attacker can upload a marketplace item with a description like `<img src="x" onerror="alert('Hacked')">`. When other users view the marketplace, this malicious JavaScript will execute in their browsers, potentially stealing their session cookies or redirecting them.
**Fix:** Use `textContent` or `innerText` to set text values safely. If you must build HTML strings, use a sanitization library like `DOMPurify` before injecting it into `.innerHTML`.

### 5. Unauthenticated File Uploads (Denial of Service)
**The Risk:** Because API routes are unprotected, anyone can hit your `POST` endpoints with file uploads. An attacker can write a script to upload 10,000 dummy PDFs or images, instantly exhausting your Cloudinary storage limits and incurring costs.
**Fix:** Require valid session authentication (`req.isAuthenticated()`) before processing any `multer` upload middleware.

---

## ⚠️ Medium & Minor Issues

### Architecture & Maintainability
- **Code Duplication:** The navigation bar, footer, and authentication logic (`auth-check.js`) are duplicated across every HTML file. If you want to change the navbar, you have to edit 5+ files. 
  - *Improvement:* Since you are using Express, you could use a templating engine like **EJS** (which is already in your `package.json`!) to use partials (e.g., `<%- include('partials/header') %>`).
- **Hardcoded API URLs:** In your frontend JS, you hardcoded `const API_BASE_URL = 'https://college-community-website.onrender.com/api';`. This makes local development a nightmare because the local frontend will talk to the production database.
  - *Improvement:* Use relative paths like `const API_BASE_URL = '/api';`.

### Database & MongoDB
- **Deprecated Mongoose Options:** In `server.js`, you use `{ useNewUrlParser: true, useUnifiedTopology: true }`. These are deprecated and do nothing in Mongoose v8+. You can remove them.
- **Missing Pagination:** Endpoints like `GET /api/marketplace` return *all* items at once. If your app scales to 10,000 items, the server will crash trying to load them all, and the frontend will freeze. You need to implement pagination (limit/skip).

### General Security Best Practices
- **Missing Rate Limiting:** Add `express-rate-limit` to prevent brute force attacks or API spamming.
- **Missing CORS Configuration:** While `cors` is in `package.json`, it isn't implemented in `server.js`.
- **Session Configuration:** Your session uses `secure: false`. In production (HTTPS), this should be `true` to prevent man-in-the-middle attacks from stealing session cookies.

---

## 📊 Project Scoring

- **Code Quality Score:** **4/10**
  *The logic is functional, but heavy duplication in HTML/JS and reliance on client-side state makes it brittle.*
- **Security Score:** **1/10**
  *Critical zero-day vulnerabilities exist. The site can be completely compromised, source code downloaded, and database filled with malicious data within minutes of discovery.*
- **Scalability Score:** **5/10**
  *Cloudinary usage is great for offloading media. However, the lack of API pagination and caching will bottleneck the database quickly.*
- **Production Readiness Score:** **2/10**
  *Not ready for production due to the security risks.*
- **Developer Level:** **Beginner to Intermediate**
  *The app successfully integrates multiple moving parts (OAuth, MongoDB, Express, Cloudinary, Multer), which is an intermediate skill. However, trusting client-side input for backend authorization is a classic beginner mistake.*

---

## 🛠️ Step-by-Step Action Plan (How to fix this)

1. **Fix the Static Directory Leak (Top Priority)**
   Create a folder named `public`. Move all your `.html` files, `css`, and frontend `js` into `public`. 
   Update `server.js`: `app.use(express.static(path.join(__dirname, 'public')));`.
   Update all `res.sendFile` paths in `server.js` to point to the `public` folder.

2. **Implement Real Backend Authentication Protection**
   In `server.js`, you have an `isAuthenticated` function. Export it or create a middleware file:
   ```javascript
   const requireAuth = (req, res, next) => {
       if (req.isAuthenticated()) return next();
       res.status(401).json({ error: 'Unauthorized' });
   };
   module.exports = requireAuth;
   ```
   Apply this to all `POST` and `DELETE` routes in your API routers:
   ```javascript
   router.post('/', requireAuth, upload.single('image'), async (req, res) => { ... })
   ```

3. **Stop Trusting `req.body` for Identity**
   In all your routes (Marketplace, Announcements, Lost & Found), **delete** `postedBy` and `postedByEmail` from the `req.body` extraction. Extract them directly from `req.user`:
   ```javascript
   // Inside your POST route
   const postedBy = req.user._id;
   const postedByEmail = req.user.email;
   ```

4. **Fix the Admin Check**
   In `announcementRoute.js`:
   ```javascript
   function checkAdmin(req, res, next) {
     if (!req.isAuthenticated() || !admins.includes(req.user.email)) {
       return res.status(403).json({ error: 'Forbidden' });
     }
     next();
   }
   ```

5. **Fix XSS Vulnerabilities**
   In your frontend JS, stop using `.innerHTML` to insert user data. Instead of building massive HTML strings, either:
   - Use `document.createElement()` and `element.textContent`.
   - Include a library like DOMPurify (`<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>`) and wrap your inputs: `card.innerHTML = DOMPurify.sanitize(yourHTMLString);`

6. **Clean up API URLs**
   In your HTML scripts, change:
   `const API_BASE_URL = 'https://college-community-website.onrender.com/api';`
   to
   `const API_BASE_URL = '/api';`
