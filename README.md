# בדיחה בלחיצה

אפליקציית בדיחות בעברית, מסך אחד: כותבים נושא, לוחצים, ומקבלים בדיחה מ-OpenAI (GPT-5) דרך פונקציית Serverless ב-Vercel.

אפיון ועיצוב מלאים: [joke-app-spec.md](joke-app-spec.md)

## מבנה

- `public/` – הממשק (HTML, CSS, JS רגיל, בלי build).
- `api/joke.js` – פונקציית Vercel: `POST /api/joke` עם `{ "topic": "חתולים" }` מחזירה `{ "joke": "..." }`.
- מפתח OpenAI נשמר רק במשתנה סביבה ב-Vercel, אף פעם לא בקוד.

## משתני סביבה

| שם | חובה | הסבר |
|---|---|---|
| `OPENAI_API_KEY` | כן | מפתח מ-platform.openai.com |
| `OPENAI_MODEL` | לא | ברירת מחדל: `gpt-5` |

## הרצה מקומית

```
npm i -g vercel
cp .env.example .env.local   # ולמלא את המפתח
vercel dev
```

## פריסה ל-Vercel

1. ב-Vercel: Add New Project, לבחור את הריפו `joke-app`, ללחוץ Deploy (Framework: Other, בלי Build Command).
2. Settings, Environment Variables: להוסיף `OPENAI_API_KEY` לכל הסביבות.
3. Redeploy כדי שהמשתנה ייכנס לתוקף.

## מגבלת קצב

בפונקציה יש הגנה בסיסית (10 בקשות בדקה ל-IP), אבל היא פר-instance ולכן חלשה. להגנה אמיתית להוסיף כלל Rate Limit ב-Vercel Firewall ותקרת Budget בפרויקט ב-OpenAI.
