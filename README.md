# Dairy System

نظام عربي RTL بسيط لإدارة تصنيع وبيع ومرتجع صفائح الجبنة (5 و8 و10 و15 كجم). التطبيق PWA ذاتي الاستضافة على شبكة محلية ويستخدم سجل SQLite لا يمكنه حذف الحركات التجارية.

## تشغيل سريع

```powershell
npm install
npm run dev
```

افتح `http://localhost:3000`. رمز التطوير الأولي هو `123456` فقط عندما لا يوجد `DAIRY_OWNER_PIN`. لا تستخدمه في التشغيل الفعلي.

## تشغيل ذاتي بـ Docker

```powershell
Copy-Item .env.example .env
# عدّل DAIRY_OWNER_PIN و DAIRY_SESSION_SECRET في .env
docker compose up -d --build
docker compose ps
```

يفتح الهاتف `http://عنوان-IP-للحاسوب:3000` من نفس شبكة Wi-Fi. التفاصيل في [دليل التشغيل](docs/operations.md) و[دليل المالك العربي](docs/owner-guide-ar.md).

## الأوامر

```text
npm run verify              # فحص تنسيق ولينت وأنواع ووحدات وتكامل وبناء
npm run test:e2e            # اختبارات المتصفح (بعد تثبيت Chromium)
npm run db:migrate          # إنشاء/ترقية قاعدة البيانات
npm run db:seed             # بيانات تجريبية فقط، غير مسموح في الإنتاج
npm run backup              # نسخة SQLite متسقة ومدققة
npm run restore -- FILE     # استعادة نسخة بعد التحقق وعمل نسخة أمان
```

## التصميم

تطبيق Next.js واحد، SQLite واحدة في وحدة تخزين دائمة، وحدات منفصلة للمخزون والحركات والتقارير والإعدادات. الرصيد = تصنيع + مرتجع + تسوية زيادة − بيع − تسوية نقص. راجع [المعمارية](docs/architecture.md).
