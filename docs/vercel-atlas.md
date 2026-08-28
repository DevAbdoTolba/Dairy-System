# نشر Vercel وMongoDB Atlas

هذا التطبيق يستخدم Vercel للواجهة ومسارات Next.js، ويستخدم MongoDB Atlas لتخزين السجل الدائم. لا يصل المتصفح إلى Atlas مباشرة؛ جميع عمليات قاعدة البيانات تبقى في Node.js runtime على الخادم.

## إعداد Atlas من Vercel

1. افتح مشروعك في Vercel ثم Marketplace > MongoDB Atlas > Install.
2. أنشئ Atlas cluster واربطه بمشروع Vercel. تضيف التكاملات بيانات الاتصال إلى بيئات Vercel.
3. تأكد من أن المشروع يملك `MONGODB_URI` وعيّن `MONGODB_DB=dairy_system`.
4. أضف `DAIRY_OWNER_PIN` خاصاً و`DAIRY_SESSION_SECRET` عشوائياً بطول 32 حرفاً على الأقل لكل من Production وPreview عند الحاجة.
5. انشر من الفرع `main` ثم افتح `https://<project>.vercel.app/api/health` للتأكد من اتصال MongoDB.

استخدم منطقة Atlas قريبة من مستخدمي النظام، واختر المنطقة نفسها أو الأقرب لها في إعدادات Vercel. قد تستخدم Vercel عناوين IP ديناميكية؛ تكامل Atlas في Vercel يهيئ وصول الشبكة المطلوب، بينما تظل بيانات الاتصال سرية في متغيرات البيئة.

## ما الذي يتغير في البيانات

البيانات مخزنة في collections: `productVariants` و`inventoryTransactions` و`inventoryBalances` و`appSettings` و`ownerAccounts` و`loginAttempts`. `inventoryBalances` إسقاط سريع للرصد فقط؛ المصدر المحاسبي هو `inventoryTransactions` غير القابل للحذف. تكتب العملية وسجل الرصيد في MongoDB transaction واحدة.

## النسخ الاحتياطي

من الإعدادات نزّل نسخة JSON. تحتوي النسخة على بيانات التطبيق وسجل الحركات وحساب المالك. خزّنها خارج Vercel في مكان موثوق ومشفّر. عند الاستعادة يتحقق التطبيق من الصيغة، ويستبدل البيانات داخل MongoDB transaction، ثم يعيد بناء إسقاط الأرصدة من السجل.

## قبل النشر الفعلي

- غيّر رمز المالك الافتراضي؛ لا تستخدم `123456` في الإنتاج.
- استخدم نطاق Vercel الافتراضي أولاً، ثم اربط نطاقك المخصص إن لزم.
- اختبر إنشاء حركة ونسخة احتياطية واستعادة في قاعدة Atlas تجريبية قبل لمس بيانات الإنتاج.
