# Cloudflare Access Login Page

Cloudflare Access login is rendered before the Worker app loads, so the React app cannot style that challenge directly.

Use the template in `docs/cloudflare-access-login-luma.html` in Cloudflare Zero Trust:

1. Go to **Zero Trust > Reusable components > Custom pages**.
2. Create or edit an **Access login page**.
3. Paste the HTML template.
4. Assign it to the Consulenza360 Access application.

The placeholders `{{ providers }}` and `{{ login_form }}` are intentionally left for Cloudflare Access to render.
