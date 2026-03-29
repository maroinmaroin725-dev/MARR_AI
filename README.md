# MARR-AI (Single-root, advanced)

ملخّص:
هذا المشروع نسخة مطوّرة من تطبيق دردشة AI — كل الملفات في جذر المشروع (بدون مجلدات). يدعم Google OAuth، MongoDB، جلسات مخزّنة في Mongo، وSocket.IO لتحديثات فورية. الخادم يعمل كـ proxy إلى Gemini API.

المتطلبات:
- Node.js 18+
- MongoDB (Atlas أو محلي)
- Google OAuth credentials (Client ID & Secret)
- Gemini API key

خطوات الإعداد محليًا:
1. انسخ هذا المجلد كمجلد جديد (جذر المشروع).
2. انسخ `.env.example` إلى `.env` واملأ:
   - MONGO_URI
   - SESSION_SECRET
   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL (مثلاً http://localhost:3000/auth/google/callback)
   - GOOGLE_API_KEY (مفتاح Gemini)
3. ثبّت الحزم:
   npm install
4. شغّل المشروع:
   npm run dev
5. افتح: http://localhost:3000

نقاط أمان:
- لا تضع مفاتيح في مستودع عام.
- استعمل HTTPS في الإنتاج.
- راقب استخدام Gemini ودوّر المفاتيح عند الشك.

نصائح للنشر:
- على Render/Vercel/Heroku: ارفع الكود، عيّن متغيرات البيئة مثل في `.env`, استخدم تكوين callback URL على Google ليطابق نطاقك.
- تأكد من تفعيل TLS (HTTPS).
- قيّد نطاقات OAuth وراجع سياسات Google Cloud.

ميزات مستقبلية أقترحها:
- ترقية الواجهة إلى React/Next.js مع SSR أو SSG.
- تدفق (streaming) حقيقي من مصدر الـ AI إن كانت واجهة Gemini تدعم ذلك.
- إضافة إدارة الخطط، حدود الاستخدام (quotas) لكل مستخدم.
- تخزين وتحليل إحصاءات المحادثات.

إذا أردت، أعمل الآن على أحد الخيارات التالية فوراً:
1) أرفع هذا المشروع إلى مستودع GitHub maroinmaroin725-dev/MARR_AI (أحتاج إذ��ك لأرفع وأكتب اسم repo إن أردت تغيير الاسم).  
2) أحزم المشروع كـ ZIP وجاهز للتحميل.  
3) أطلق سكر��ت نشر عبر Render (أعطيك الإعدادات الجاهزة).  
4) أحوّل الواجهة إلى React + Tailwind مع نفس الخادم.

اختر ما يناسبك وسأبدأ التنفيذ مباشرةً.