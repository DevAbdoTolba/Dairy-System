# تشغيل وصيانة ذاتية

## Docker على الشبكة المحلية

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d --build
docker compose logs -f
docker compose ps
```

اجعل `DAIRY_OWNER_PIN` رمزاً خاصاً و`DAIRY_SESSION_SECRET` قيمة عشوائية طويلة. تظل `data` و`backups` خارج طبقات الحاوية. فحص الصحة `http://localhost:3000/api/health` يهيئ المهاجرات ويفحص SQLite.

لإيجاد IP في Windows: `ipconfig` ثم افتح `http://IP:3000` على الهاتف الموجود في Wi-Fi نفسه. لا تفتح المنفذ للإنترنت. الوصول البعيد يحتاج HTTPS وVPN خاص مثل Tailscale.

## النسخ الاحتياطي

```powershell
docker compose exec dairy-system npm run backup
docker compose exec dairy-system npm run restore -- /backups/dairy-YYYY-MM-DD.sqlite
```

تستخدم النسخة API SQLite online backup، ثم `integrity_check`، ولا تنسخ ملف WAL وحده. الاستعادة تتحقق من الملف، تنشئ نسخة أمان للحالة الحالية، تستبدل القاعدة وتفحصها. أوقف الاستعمال أثناء الاستعادة.

أنشئ مهمة يومية على المضيف تستدعي `docker compose exec -T dairy-system npm run backup`. في Windows استخدم Task Scheduler؛ في Linux استخدم cron. السكربت يحذف نسخاً عمرها أكثر من 30 يوماً. اختبر الاستعادة في نسخة غير إنتاجية دورياً.

## أوامر مفيدة

```powershell
docker compose stop
docker compose start
docker compose logs -f
docker compose up -d --build
```
