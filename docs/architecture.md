# المعمارية

التطبيق modular monolith: Next.js App Router وSQLite WAL على نفس المضيف. لا توجد microservices أو Redis أو broker. واجهة المستخدم تستدعي مسارات التطبيق، ومسارات التطبيق تستدعي خدمات الوحدات، والخدمات تستخدم قواعد المجال والمستودعات. لا تستورد ملفات المجال React أو Next أو SQLite.

`src/modules` يحوي `transactions` و`inventory` و`reports` و`settings` و`auth`. تخزن الحركات في سجل لا يحذف: `ACTIVE` أو `VOIDED`. رصيد كل وزن مشتق فقط من الحركات النشطة. `idempotency_key` فريد لمنع ضغط الحفظ المكرر.

قرار ORM: يستخدم المشروع Drizzle لتعريف المخطط مع `better-sqlite3` كدرايفر محلي؛ تنفذ المهاجرات والاستعلامات المعاملية في مستودع SQLite لتبقى المعاملة وقواعد المخزون صريحة وصغيرة.
