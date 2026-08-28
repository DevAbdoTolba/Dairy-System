# تشغيل وصيانة ذاتية

## Docker محلياً

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d --build
docker compose ps
```

يشغّل Compose MongoDB في حاوية منفصلة ويحتفظ بالبيانات في volume باسم `mongo-data`. لا تفتح منفذ MongoDB للشبكة العامة؛ الملف يربطه بـ `127.0.0.1` فقط. فحص الصحة `http://localhost:3000/api/health` يتحقق من MongoDB وينشئ الفهارس والسجلات الافتراضية.

## النسخ الاحتياطي والاستعادة

من صفحة الإعدادات نزّل نسخة JSON. أو نفّذ:

```powershell
docker compose exec dairy-system npm run backup
docker compose exec dairy-system npm run restore -- /app/backups/dairy-backup-YYYY-MM-DD.json
```

تحقق الاستعادة من صيغة النسخة ثم تستبدل البيانات داخل MongoDB transaction وتعيد بناء إسقاط الأرصدة من سجل الحركات. اختبر الاستعادة أولاً على قاعدة تجريبية، واحفظ النسخ خارج الخادم وفي مساحة مشفرة.

## Vercel وAtlas

أضف `MONGODB_URI` و`MONGODB_DB` و`DAIRY_OWNER_PIN` و`DAIRY_SESSION_SECRET` في إعدادات Vercel. راجع [دليل Vercel وAtlas](vercel-atlas.md) للتفاصيل. لا تستخدم نسخة Vercel preview على قاعدة الإنتاج أثناء تجربة الاستعادة.
