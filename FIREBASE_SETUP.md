# Firebase Setup Instructions (Store All SmartAttend Data)

This guide explains how to store **all app data in Firebase** for this prototype.

## 1) Create Firebase project

1. Open Firebase Console: https://console.firebase.google.com
2. Create project (or use existing): `smart-attendance-cbf53`
3. Add a **Web App** and copy config keys.
4. Put keys in `js/firebase-config.js`.

---

## 2) Enable Firestore Database

1. Firebase Console → **Build → Firestore Database**.
2. Click **Create database**.
3. Start in **Test mode** for hackathon demo (you can lock later).
4. Select a region close to you.

> Important: SmartAttend uses **Cloud Firestore**, not Realtime Database.
> Editing Realtime Database rules alone will not allow these writes.

---

## 3) (Optional but recommended) Enable Firebase Storage

> Current code stores face image as `facePhotoDataUrl` in Firestore. For production, use Storage.

1. Firebase Console → **Build → Storage**.
2. Click **Get started**.
3. Start in test mode (for demo).

---

## 4) Create required Firestore collections/documents

SmartAttend uses these collections:

- `adminTeachers/{teacherID}`
- `adminStudents/{studentID}`
- `subjects/{subjectCode}`
- `classes/{classId}`
- `enrollments/{classSection_studentID}`
- `teacherProfiles/{teacherID}`
- `studentProfiles/{studentID}`
- `students/{studentID}`
- `sessions/{sessionId}`
- `attendance/{sessionId_studentID}`
- `system/networkPolicy` (document)

### Required seed document

Create this document manually if needed:

- Collection: `system`
- Document ID: `networkPolicy`
- Fields:
  - `allowedIp`: `192.168.1.15`

You can also create this from Admin panel after login.

---

## 5) Composite indexes needed

Because the app uses `where(...) + orderBy(...)`, create these Firestore composite indexes:

1. Collection: `attendance`
   - Fields:
     - `sessionId` (Ascending)
     - `clientTimestamp` (Descending)

2. Collection: `attendance`
   - Fields:
     - `teacherID` (Ascending)
     - `clientTimestamp` (Descending)

3. Collection: `attendance`
   - Fields:
     - `studentId` (Ascending)
     - `clientTimestamp` (Descending)

### How to create quickly

- Run the app once and trigger queries.
- Firestore error message will show a direct **Create index** link.
- Open link and click create.

---

## 6) Firestore Rules (hackathon prototype)

Use these demo rules first:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ This is open access and only suitable for demo/hackathon.

---

## 7) Storage Rules (if you enable Firebase Storage)

Demo-only rules:

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

---

## 8) Data entry flow (Admin-first)

1. Open `admin.html`.
2. Login:
   - Email: `admin@smartattend.com`
   - Password: `admin123`
3. Fill forms in this order:
   - Save Network Rule
   - Add Subject
   - Save Teacher
   - Save Students
   - Assign Timetable
   - Assign Student Enrollments

Everything entered is saved to Firestore immediately by `js/admin.js`.

---

## 9) Verify that data is saved in Firebase

In Firestore console, verify documents appear in:

- `adminTeachers`
- `adminStudents`
- `subjects`
- `classes`
- `enrollments`
- `system/networkPolicy`

Then run Teacher/Student flows and verify:

- `teacherProfiles`
- `studentProfiles`
- `sessions`
- `attendance`

---

## 10) Local run command

```bash
python3 -m http.server 5500
```

Open:

- `http://localhost:5500/admin.html`
- `http://localhost:5500/teacher.html`
- `http://localhost:5500/student.html`


---

## 11) If data is not stored (quick debug checklist)

If form submit appears to work but Firestore has no new documents:

1. **Use HTTP server, not file://**
   - Always run: `python3 -m http.server 5500`
   - Open `http://localhost:5500/admin.html`

2. **Check browser console errors**
   - Open DevTools console.
   - Look for Firebase errors like:
     - `permission-denied`
     - `failed-precondition` (missing index)
     - `unavailable` (network issue)

3. **Confirm Firestore database is created in same project**
   - Project ID in `js/firebase-config.js` must match Firebase console project.
   - Firestore must be enabled for that project.

4. **Set demo Firestore rules during hackathon**
   - Use open demo rules in section 6 (`allow read, write: if true;`) until auth rules are implemented.

5. **Verify new admin status messages**
   - Admin page now shows exact save/load errors at top of dashboard and after every form action.

6. **For attendance history queries**
   - Create composite indexes listed in section 5 after first query failure message.

7. **Do not configure only Realtime Database**
   - Your screenshot/rules may be in Realtime Database, but this project writes to Cloud Firestore collections.
