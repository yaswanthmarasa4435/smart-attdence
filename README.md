# SmartAttend (Hackathon Prototype)

SmartAttend is a simple attendance prototype that uses dynamic QR codes + face verification + Firestore.

## Folder Structure

```
smart-attdence/
├── index.html
├── teacher.html
├── student.html
├── css/
│   └── styles.css
├── js/
│   ├── firebase-config.js
│   ├── teacher.js
│   └── student.js
└── models/
```

## Setup

1. Create a Firebase project.
2. Enable Firestore database.
3. Update `js/firebase-config.js` with your Firebase keys.
4. Add face-api model files into `/models`:
   - `tiny_face_detector_model-weights_manifest.json`
   - `tiny_face_detector_model-shard1`
5. Serve the project with a local server:

```bash
python3 -m http.server 5500
```

6. Open:
   - `http://localhost:5500/teacher.html`
   - `http://localhost:5500/student.html`

## Firestore Collections

### `students`
- `id`
- `name`
- `photo`

### `sessions`
- `token`
- `createdAt`
- `expiresAt`
- `active`

### `attendance`
- `sessionId`
- `studentId`
- `studentName`
- `timestamp`
- `clientTimestamp`
- `status` (`present` / `late`)
- `deviceIP`

## Demo Flow

1. Teacher logs in and generates QR.
2. Student logs in and scans QR.
3. Face detection validates presence.
4. Attendance is written to Firestore once per session per student.
5. Teacher dashboard updates in real time.
