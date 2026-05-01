# Database

The app can use Firebase Cloud Firestore as its database.

## Firebase Firestore

1. Create a Firebase project.
2. Enable Firestore Database.
3. In Firebase Console, go to Project settings > Service accounts.
4. Generate a new private key.
5. Save that downloaded JSON file as:

```text
firebase-service-account.json
```

6. Create a `.env` file from `.env.example`:

```text
DATA_BACKEND=firebase
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
PORT=3000
```

7. Restart the server with `npm start`.

The server stores data in these Firestore collections:

- `settings` with document `app`
- `categoryBudgets`
- `transactions`

## Local Fallback

If `DATA_BACKEND=firebase` is not set, the app uses a local SQLite database:

```text
data/expense-tracker.sqlite
```

Tables:

- `settings` stores the app currency and monthly budget.
- `category_budgets` stores budget limits by category.
- `transactions` stores income and expense records.

The older `data/db.json` file is kept only as migration seed data. On first startup, the server imports it if the selected database is empty.
