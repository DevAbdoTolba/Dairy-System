# المعمارية

التطبيق modular monolith مبني بـ Next.js App Router. يُنشر على Vercel، بينما تحتفظ MongoDB Atlas بالبيانات الدائمة. لا توجد microservices أو Redis أو broker.

واجهة المستخدم تستدعي مسارات Next.js، والمسارات تستدعي خدمات الوحدات، والخدمات تستدعي مستودعات MongoDB. يبقى كود المجال مستقلاً عن React وNext وMongoDB.

`src/modules` يحتوي `transactions` و`inventory` و`reports` و`settings` و`auth`. تخزن الحركات في `inventoryTransactions` كسجل غير قابل للحذف: `ACTIVE` أو `VOIDED`. يضمن فهرس `idempotencyKey` الفريد أن تكرار طلب الحفظ لا يكرر الحركة.

تستخدم الحركات MongoDB transaction واحدة لكتابة السجل وتحديث `inventoryBalances`. هذا الأخير إسقاط أداء فقط، أما مصدر الحقيقة فهو السجل. عند البيع أو التسوية بالنقص، يحدث تحديث الرصيد شرطياً وبشكل ذري؛ إذا لم يكف الرصيد يفشل الطلب، إلا عند تفعيل التجاوز مع سبب موثق.

يعيد `getDb()` استخدام MongoClient على مستوى العملية لتفادي فتح اتصال جديد مع كل Vercel Function. ينشئ عند أول اتصال الفهارس والسجلات الافتراضية للأوزان 5 و8 و10 و15 كجم.
