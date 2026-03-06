# SmartAttend (Hackathon Prototype)

SmartAttend is a hackathon-friendly attendance prototype with:
- Controlled account creation via admin-approved IDs
- Teacher timetable-based QR attendance sessions
- Student QR scan + Face ID verification
- Network-restricted attendance marking
- Attendance history for students, teachers, and admin

## Pages

- `index.html` – launcher
- `admin.html` – admin dashboard
- `teacher.html` – teacher dashboard
- `student.html` – student dashboard

## Setup

1. Create a Firebase project and enable Firestore.
2. Put your Firebase keys in `js/firebase-config.js`.
3. Add face-api model files in `/models`:
   - tiny face detector
   - face landmark 68 net
   - face recognition net
4. Run local server:

```bash
python3 -m http.server 5500
```

For full Firebase persistence setup (Firestore collections, required indexes, rules, and verification), see:

- [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md)

## Data Model (Firestore)

### Admin-controlled records
- `adminTeachers/{teacherID}`
  - `teacherID`, `name`, `email`, `department`
- `adminStudents/{studentID}`
  - `studentID`, `name`, `email`, `classSection`
- `subjects/{subjectCode}`
- `classes/{classId}` for timetable assignment
- `enrollments/{classSection_studentID}` for class membership
- `system/networkPolicy`
  - `allowedIp` (default `192.168.1.15`)

### Login profiles
- `teacherProfiles/{teacherID}`
- `studentProfiles/{studentID}`
  - includes `facePhotoDataUrl`

### Attendance flow
- `sessions/{sessionId}`
  - generated only by teacher-assigned classes
- `attendance/{sessionId_studentId}`
  - includes class, subject, status, and device IP

## Core Rules Implemented

1. **Controlled account creation:** non-admin IDs cannot register/login.
2. **Face ID enrollment:** required on student first profile setup.
3. **Teacher timetable integration:** teacher can generate QR only for assigned classes.
4. **Attendance history:** visible in student and teacher dashboards.
5. **Network restriction:** attendance only when device IP matches authorized IP.
6. **Admin panel:** create/manage teachers, students, timetable, subjects, enrollments, and view attendance.
7. **Teacher attendance control:** sessions and marking are class-restricted and enrollment-checked.

## Demo Data (for quick admin form entry)

Use these values in `admin.html` to quickly set up a complete flow:

- **Network rule**
  - Allowed IP: `192.168.1.15`

- **Subject**
  - Subject code: `CS101`
  - Subject name: `Computer Fundamentals`

- **Teacher record**
  - Teacher ID: `TCH001`
  - Name: `Aarav Sharma`
  - Email: `aarav@smartattend.com`
  - Department/Subject: `Computer Science`

- **Student records**
  - Student 1: `STU001`, `Priya Nair`, `priya@smartattend.com`, class `CSE-A`
  - Student 2: `STU002`, `Rahul Verma`, `rahul@smartattend.com`, class `CSE-A`

- **Timetable assignment**
  - Class section: `CSE-A`
  - Subject code: `CS101`
  - Teacher ID: `TCH001`
  - Classroom: `Room 204`
  - Time slot: `Mon 09:00-10:00`

- **Enrollments**
  - Assign `STU001` to `CSE-A`
  - Assign `STU002` to `CSE-A`

Then:
1. Login in teacher panel with ID `TCH001` and set a password.
2. Login in student panel with ID `STU001`/`STU002`, set passwords, and upload face images.
3. Generate QR from teacher dashboard and scan from student dashboard.
