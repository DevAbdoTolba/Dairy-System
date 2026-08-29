# Dairy System

نظام عربي RTL لإدارة تصنيع وبيع ومرتجع صفائح الجبنة. الواجهة الرئيسية محسّنة للجهاز اللوحي: لوحة عمليات في ثلث الشاشة ومساحة عمل مباشرة في الثلثين الباقيين.

يعمل التطبيق على Vercel مع MongoDB Atlas. سجل الحركات غير قابل للحذف؛ وتبقى أرصدة المخزون مشتقة من السجل ومحميّة من البيع الذي يجعل الرصيد سالباً.

التطبيق PWA قابل للتثبيت ومصمم للعمل اليومي دون إنترنت. تُحفظ حركات التصنيع والبيع والمرتجع محلياً، تظهر فوراً في رصيد الجهاز، ثم تُزامن تلقائياً وبأمان عند عودة الاتصال. راجع [دليل العمل دون إنترنت](docs/offline.md).

## التشغيل المحلي

```powershell
Copy-Item .env.example .env
# عدّل DAIRY_OWNER_PIN و DAIRY_SESSION_SECRET في .env
docker compose up -d --build
```

افتح `http://localhost:3000/login`. يشغّل Compose قاعدة MongoDB محلية تلقائياً. للتشغيل خارج Docker، شغّل MongoDB محلياً ثم أضف في `.env.local`:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/?directConnection=true
MONGODB_DB=dairy_system
```

## النشر على Vercel

1. ارفع المشروع إلى GitHub ثم أنشئ مشروع Next.js في Vercel.
2. من Vercel Marketplace أضف MongoDB Atlas واربط المورد بالمشروع.
3. أضف متغيرات Production التالية في Vercel:

```text
MONGODB_URI=<Atlas connection string>
MONGODB_DB=dairy_system
DAIRY_OWNER_PIN=<private PIN>
DAIRY_SESSION_SECRET=<random secret, 32+ characters>
```

4. انشر المشروع وافتح `/login` من الجهاز اللوحي. لا تضع `MONGODB_URI` أو أي سر في المتصفح أو في مستودع Git.

التفاصيل في [دليل Vercel وAtlas](docs/vercel-atlas.md) و[دليل التشغيل](docs/operations.md).

## الأوامر

```text
npm run verify              # التنسيق واللينت والأنواع والاختبارات والبناء
npm run db:migrate          # ينشئ الفهارس والسجلات الافتراضية في MongoDB
npm run db:seed             # بيانات تجريبية فقط، غير مسموح في الإنتاج
npm run backup              # تصدير JSON احتياطي إلى backups/
npm run restore -- FILE     # استعادة ملف JSON بعد التحقق منه
```
