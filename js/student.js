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
const liveScanStatus = document.getElementById('liveScanStatus');
const faceVideo = document.getElementById('faceVideo');

const SCAN_THROTTLE_MS = 1500;

let studentProfile = null;
let scannedPayload = null;
let qrScanner = null;
let lastDecodedText = '';
let lastScanAt = 0;
let isValidatingQr = false;

studentLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  studentProfile = {
    id: document.getElementById('studentId').value.trim(),
    name: document.getElementById('studentName').value.trim(),
  };

  studentLoginCard.classList.add('hidden');
  studentPanel.classList.remove('hidden');

  // Keep a student profile document for dashboard totals and future analytics.
  try {
    await setDoc(
      doc(db, 'students', studentProfile.id),
      {
        id: studentProfile.id,
        name: studentProfile.name,
        photo: '',
      },
      { merge: true },
    );
  } catch (error) {
    console.error('Could not save student profile to Firestore:', error);
    studentStatus.textContent = 'Logged in, but profile sync failed. You can still scan QR.';
  }

  await initScanner();
  await initFaceModel();
});

document.getElementById('logoutStudentBtn').addEventListener('click', () => {
  window.location.reload();
});

async function initScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    studentStatus.textContent = 'QR scanner library failed to load.';
    return;
  }

  qrScanner = new Html5Qrcode('qr-reader');

  try {
    await qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        const now = Date.now();
        if (isValidatingQr) return;
        if (decodedText === lastDecodedText && now - lastScanAt < SCAN_THROTTLE_MS) return;

        lastDecodedText = decodedText;
        lastScanAt = now;
        await validateScannedQr(decodedText);
      },
    );

    if (liveScanStatus) {
      liveScanStatus.textContent = 'Live scan is active. Point the camera to teacher QR.';
    }
  } catch (error) {
    console.error('Could not start QR scanner:', error);
    studentStatus.textContent = 'Camera access denied or unavailable for QR scanning.';
  }
}

async function validateScannedQr(decodedText) {
  isValidatingQr = true;

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
    if (liveScanStatus) {
      liveScanStatus.textContent = `Live session detected: ${payload.sessionId.slice(0, 8)}...`;
    }
  } catch {
    studentStatus.textContent = 'Could not read QR payload.';
  } finally {
    isValidatingQr = false;
  }
}

async function initFaceModel() {
  // Download face-api models into /models folder for a proper local demo.
  if (typeof faceapi === 'undefined') {
    studentStatus.textContent = 'Face library failed to load.';
    return;
  }

  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
  } catch {
    studentStatus.textContent = 'Face model missing. Add face-api model files to /models.';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    faceVideo.srcObject = stream;
  } catch (error) {
    console.error('Could not access camera for face verification:', error);
    studentStatus.textContent = 'Camera access denied or unavailable for face verification.';
  }
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
