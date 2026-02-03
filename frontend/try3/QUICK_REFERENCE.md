# ⚡ Quick Reference Card

> **All important commands and links in one place**

---

## 🚀 Common Commands

### Start Local Server
```bash
cd e:\Proggn\Projects\GitRepos\poke-tcg\frontend\try3
python3 -m http.server 8000
# Open: http://localhost:8000
```

### Testing Locally
```bash
# 1. Server running (see above)
# 2. Open browser to http://localhost:8000
# 3. Follow TESTING.md checklist
```

### Deploy to GitHub
```bash
# 1. Test locally ✅
git add frontend/try3/
git commit -m "feat: Complete try3 frontend with analytics and error handling"
git push origin feature/try3-google-sheets-frontend

# 2. Create Pull Request on GitHub
# 3. Merge to main
# 4. Wait 5 minutes for auto-deployment
```

### Check GitHub Actions Status
```bash
# Open: https://github.com/veraatversus/poke-tcg/actions
# Watch workflows:
# - merge-to-release.yml
# - deploy-pages.yml
```

### View Deployed Site
```
Production:
https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/
```

---

## 📚 Important Documents

### 🎯 START HERE
- [GETTING_STARTED.md](./GETTING_STARTED.md) - 3 steps to deployment

### 📖 Main Guides
- [README.md](./README.md) - Project overview
- [TESTING.md](./TESTING.md) - Testing & debugging
- [RELEASE_NOTES.md](./RELEASE_NOTES.md) - New features
- [FINAL_CHECKLIST.md](./FINAL_CHECKLIST.md) - Pre-release checklist

### 🔧 Technical
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Architecture
- [docs/GOOGLE_CLOUD_SETUP.md](./docs/GOOGLE_CLOUD_SETUP.md) - Setup
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Deployment
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Try1/Try2 migration

---

## 🔑 Key Configuration

### config/config.js
```javascript
export const CONFIG = {
  CLIENT_ID: 'DEINE_CLIENT_ID.apps.googleusercontent.com',
  SPREADSHEET_ID: 'DEINE_SPREADSHEET_ID',
  API_KEY: 'DEIN_API_KEY', // Optional
};
```

### Find Spreadsheet ID
```
URL: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
Copy the [SPREADSHEET_ID] part
```

### Find Client ID
```
Google Cloud Console
  → APIs & Services
  → Credentials
  → OAuth 2.0 Client IDs
  → Copy the Client ID (ends with .apps.googleusercontent.com)
```

---

## 🧪 Testing Checklist (Quick)

```
✅ Authentication Test
  - Google Sign-In button works
  - Login successful
  - User email displays

✅ Data Loading Test
  - Sets load from Google Sheets
  - Cards display correctly
  - Progress shows accurately

✅ Checkbox Test
  - Can toggle Normal/Reverse
  - Changes sync to Google Sheets
  - No console errors

✅ Search/Filter/Sort Test
  - Search filters cards
  - Filter by set works
  - Sort options work

✅ Analytics Test
  - Analytics button visible
  - Modal opens
  - Statistics correct

✅ Export Test
  - CSV export works
  - JSON export works
  - Print dialog opens

✅ Error Handling Test
  - Offline mode recognized
  - Helpful error messages
  - No unhandled exceptions

✅ Responsive Test
  - Desktop: 5 columns
  - Tablet: 3 columns
  - Mobile: 2 columns
  - Everything accessible
```

---

## 🐛 Troubleshooting Quick Fixes

### "Invalid Client ID"
1. Check `config/config.js`
2. Verify CLIENT_ID exactly matches Google Cloud
3. No extra spaces or special characters
4. Save and refresh browser

### "Redirect URI Mismatch"
1. Go to Google Cloud Console
2. APIs & Services → Credentials
3. Edit OAuth Client ID
4. Check "Authorized redirect URIs"
5. Must include: `http://localhost:8000/frontend/try3/`
6. Save and retry

### "Failed to load sets"
1. Check Spreadsheet-ID in `config/config.js`
2. Verify you have access to the Google Sheets
3. Check sheet names (must be exact: e.g., "base1", "xy1")
4. Check Google Sheets sharing settings

### "Offline Mode"
- Normal if no internet connection
- Changes queue locally
- Auto-sync when online
- Check browser connection status

### "No data appears"
1. Press F12 → Console
2. Look for error messages
3. Check Network tab (should see API calls)
4. Try Sign Out + Sign In again
5. Clear browser cache (Ctrl+Shift+Delete)

### "Console Errors"
1. Open F12 → Console
2. Read error messages carefully
3. Common ones: see TESTING.md troubleshooting
4. Check internet connection
5. Try reloading page (Ctrl+F5)

---

## 📊 File List Quick Reference

### JavaScript Modules (js/)
- `app.js` - Main application
- `auth.js` - Authentication
- `sheets-api.js` - Google Sheets wrapper
- `ui.js` - UI rendering
- `models.js` - Data models
- `cache.js` - Caching
- `utils.js` - Utilities
- `modals.js` - Dialogs
- `analytics.js` - Statistics
- `errors.js` - Error handling

### Stylesheets (css/)
- `main.css` - Main styles
- `grid.css` - Grid layout
- `auth.css` - Auth styles
- `responsive.css` - Mobile responsive
- `modals.css` - Modal styles
- `analytics.css` - Analytics styles

### Documentation
- `README.md` - Overview
- `GETTING_STARTED.md` - Quick start
- `TESTING.md` - Testing guide
- `RELEASE_NOTES.md` - New features
- `MIGRATION_GUIDE.md` - Try1/Try2 guide
- `FINAL_CHECKLIST.md` - Pre-release
- `IMPLEMENTATION_PLAN.md` - Architecture
- `docs/GOOGLE_CLOUD_SETUP.md` - Setup
- `docs/DEPLOYMENT.md` - Deployment

---

## ⏱️ Time Estimates

| Phase | Duration |
|-------|----------|
| Local Testing | 1-2 hours |
| Git Commit | 5 minutes |
| GitHub PR | 5 minutes |
| Auto-Merge | 2-5 minutes |
| Auto-Deploy | 2-3 minutes |
| **Total** | **~2 hours** |

---

## 🎯 Status Overview

| Item | Status |
|------|--------|
| **Implementation** | ✅ Complete |
| **Documentation** | ✅ Complete |
| **Code Quality** | ✅ Complete |
| **Testing** | ⏳ Next |
| **Deployment** | ⏳ After Testing |

---

## 🔗 Important URLs

### Local Development
- Local: `http://localhost:8000`
- Local Try3: `http://localhost:8000/frontend/try3/`

### GitHub
- Repo: `https://github.com/veraatversus/poke-tcg`
- Actions: `https://github.com/veraatversus/poke-tcg/actions`
- Branch: `feature/try3-google-sheets-frontend`

### Google Cloud
- Console: `https://console.cloud.google.com`
- Credentials: Projects → APIs & Services → Credentials

### Google Sheets
- Your Spreadsheet: [Replace with your URL]
- Spreadsheet ID: [In URL between /d/ and /edit]

### Production
- Try3 Live: `https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/`

---

## 💡 Pro Tips

### Performance
- Use Filter before Search for better speed
- Cache updates every 1 hour (normal)
- Use Ctrl+F5 for hard refresh

### Debugging
- Open F12 for Developer Tools
- Console shows all logs with emoji prefixes
- Network tab shows API calls
- Set `window.__DEBUG__ = true` in console for debug mode

### Testing
- Test on actual device if possible
- Try different browsers (Chrome, Firefox, Safari)
- Test offline mode (disconnect internet)
- Check mobile responsiveness (F12 → Device Mode)

---

## 📞 Quick Help

**Setup Issues?**
→ [docs/GOOGLE_CLOUD_SETUP.md](./docs/GOOGLE_CLOUD_SETUP.md)

**Testing Questions?**
→ [TESTING.md](./TESTING.md)

**Deployment Help?**
→ [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

**Feature Questions?**
→ [RELEASE_NOTES.md](./RELEASE_NOTES.md)

**Migration from Try1/Try2?**
→ [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

---

## 🚀 Next Step

### NOW: Read [GETTING_STARTED.md](./GETTING_STARTED.md)

It's only 3 steps to production! 🎉

---

**Version**: 1.0  
**Status**: Ready for Testing ✅  
**Last Updated**: 01.02.2026

🎴 **Let's ship this!**
