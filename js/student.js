import {
  db,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  runTransaction,
} from './firebase-config.js';

const studentLoginForm = document.getElementById('studentLoginForm');
const studentLoginCard = document.getElementById('studentLoginCard');
const studentPanel = document.getElementById('studentPanel');
const verifyFaceBtn = document.getElementById('verifyFaceBtn');
const studentStatus = document.getElementById('studentStatus');
const faceVideo = document.getElementById('faceVideo');

let studentProfile = null;
let scannedPayload = null;
let qrScanner = null;

studentLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  studentProfile = {
    id: document.getElementById('studentId').value.trim(),
    name: document.getElementById('studentName').value.trim(),
  };

  // Keep a student profile document for dashboard totals and future analytics.
  await setDoc(
    doc(db, 'students', studentProfile.id),
    {
      id: studentProfile.id,
      name: studentProfile.name,
      photo: '',
    },
    { merge: true },
  );

  studentLoginCard.classList.add('hidden');
  studentPanel.classList.remove('hidden');
  await initScanner();
  await initFaceModel();
});

document.getElementById('logoutStudentBtn').addEventListener('click', () => {
  window.location.reload();
});

async function initScanner() {
  qrScanner = new Html5Qrcode('qr-reader');
  await qrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    async (decodedText) => {
      try {
        const payload = JSON.parse(decodedText);
        const isFresh = Date.now() < payload.expiryMs;

        if (!isFresh) {
          studentStatus.textContent = 'QR expired. Ask teacher to regenerate.';
          return;
        }

        const sessionDoc = await getDoc(doc(db, 'sessions', payload.sessionId));
        if (!sessionDoc.exists() || !sessionDoc.data().active || sessionDoc.data().token !== payload.token) {
          studentStatus.textContent = 'Invalid session QR.';
          return;
        }

        scannedPayload = payload;
        verifyFaceBtn.disabled = false;
        studentStatus.textContent = 'QR valid. Click verify to detect face.';
        await qrScanner.stop();
      } catch {
        studentStatus.textContent = 'Could not read QR payload.';
      }
    },
  );
}

async function initFaceModel() {
  // Download face-api models into /models folder for a proper local demo.
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
  } catch {
    studentStatus.textContent = 'Face model missing. Add face-api model files to /models.';
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  faceVideo.srcObject = stream;
}

verifyFaceBtn.addEventListener('click', async () => {
  if (!studentProfile || !scannedPayload) return;

  const faceDetection = await faceapi.detectSingleFace(
    faceVideo,
    new faceapi.TinyFaceDetectorOptions(),
  );

  if (!faceDetection) {
    studentStatus.textContent = 'Face not detected. Try again.';
    return;
  }

  const studentAttendanceId = `${scannedPayload.sessionId}_${studentProfile.id}`;
  const attendanceRef = doc(db, 'attendance', studentAttendanceId);
  const sessionRef = doc(db, 'sessions', scannedPayload.sessionId);

  try {
    await runTransaction(db, async (transaction) => {
      const [attendanceSnap, sessionSnap] = await Promise.all([
        transaction.get(attendanceRef),
        transaction.get(sessionRef),
      ]);

      if (attendanceSnap.exists()) {
        throw new Error('Already marked attendance for this session.');
      }

      if (!sessionSnap.exists() || !sessionSnap.data().active) {
        throw new Error('Session is no longer active.');
      }

      const sessionData = sessionSnap.data();
      const status = Date.now() - sessionData.expiresAt + 60_000 > 5 * 60_000 ? 'late' : 'present';

      transaction.set(attendanceRef, {
        sessionId: scannedPayload.sessionId,
        studentId: studentProfile.id,
        studentName: studentProfile.name,
        timestamp: serverTimestamp(),
        clientTimestamp: Date.now(),
        status,
        deviceIP: await getDeviceIP(),
      });
    });

    studentStatus.textContent = 'Attendance marked successfully.';
    verifyFaceBtn.disabled = true;
  } catch (error) {
    studentStatus.textContent = error.message;
  }
});

async function getDeviceIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'unavailable';
  }
}
