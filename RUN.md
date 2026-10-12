# تشغيل المشروع

## المتطلبات

- Node.js 18 أو أحدث مع npm.
- إعدادات Supabase في `.env.local` داخل مجلد `frontend` لتفعيل تسجيل الدخول والاتصال بقاعدة البيانات. عند التشغيل لأول مرة، ينسخ الأمر أدناه ملف `.env` الموجود في جذر المشروع إذا لم يكن `.env.local` موجودًا.

## التشغيل على Windows PowerShell

من مجلد المشروع:

```powershell
Set-Location frontend
npm install
if (-not (Test-Path .env.local) -and (Test-Path ..\.env)) { Copy-Item ..\.env .env.local }
npm run dev
```

افتح العنوان الذي يظهر في الطرفية، وغالبًا يكون `http://localhost:5173`. لإيقاف الخادم اضغط `Ctrl+C`.

## أوامر إضافية

نفّذها من مجلد `frontend`:

```powershell
npm run build
npm run typecheck
npm run lint
npm run preview
```

هذا المشروع يشغّل واجهة React عبر Vite. مجلد `backend` يحتوي أداة لتصدير المشروع وليس خادم API مستقلًا. ملفات تغييرات قاعدة البيانات موجودة في `database/supabase/migrations`، والاتصال الفعلي يحتاج إعداد مشروع Supabase صالحًا في متغيري `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY`.