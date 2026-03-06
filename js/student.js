import {
  db,
  serverTimestamp,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
} from './firebase-config.js';

const AUTHORIZED_IP_FALLBACK = '192.168.1.15';
const FACE_MATCH_THRESHOLD = 0.55;
const SCAN_THROTTLE_MS = 1500;

const studentLoginForm = document.getElementById('studentLoginForm');
const studentLoginCard = document.getElementById('studentLoginCard');
const studentPanel = document.getElementById('studentPanel');
const verifyFaceBtn = document.getElementById('verifyFaceBtn');
const studentStatus = document.getElementById('studentStatus');
const liveScanStatus = document.getElementById('liveScanStatus');
const faceVideo = document.getElementById('faceVideo');
const studentHistoryBody = document.getElementById('studentHistoryBody');

const SCAN_THROTTLE_MS = 1500;

let studentProfile = null;
let adminStudentRecord = null;
let scannedPayload = null;
let qrScanner = null;
let lastDecodedText = '';
let lastScanAt = 0;
let isValidatingQr = false;

studentLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const id = document.getElementById('studentId').value.trim().toUpperCase();
  const name = document.getElementById('studentName').value.trim();
  const password = document.getElementById('studentPassword').value.trim();
  const file = document.getElementById('faceUpload').files[0];

  const adminStudentSnap = await getDoc(doc(db, 'adminStudents', id));
  if (!adminStudentSnap.exists()) {
    alert('Access denied. Contact the administrator.');
    return;
  }

  adminStudentRecord = adminStudentSnap.data();
  const profileRef = doc(db, 'studentProfiles', id);
  const profileSnap = await getDoc(profileRef);

  if (profileSnap.exists()) {
    const profile = profileSnap.data();
    if (profile.password !== password) {
      alert('Invalid password.');
      return;
    }
    studentProfile = {
      id,
      name: profile.name,
      classSection: profile.classSection,
      email: profile.email,
      password: profile.password,
      facePhotoDataUrl: profile.facePhotoDataUrl,
    };
  } else {
    if (!file) {
      alert('Face image is required for first-time profile creation.');
      return;
    }

    const facePhotoDataUrl = await fileToDataUrl(file);

    await setDoc(profileRef, {
      studentID: id,
      name,
      email: adminStudentRecord.email,
      classSection: adminStudentRecord.classSection,
      password,
      facePhotoDataUrl,
      createdAt: serverTimestamp(),
    });

    studentProfile = {
      id,
      name,
      email: adminStudentRecord.email,
      classSection: adminStudentRecord.classSection,
      password,
      facePhotoDataUrl,
    };
  }

  await setDoc(
    doc(db, 'students', studentProfile.id),
    {
      id: studentProfile.id,
      name: studentProfile.name,
      classSection: studentProfile.classSection,
    },
    { merge: true },
  );

  studentLoginCard.classList.add('hidden');
  studentPanel.classList.remove('hidden');

  await initScanner();
  await initFaceModel();
  await loadHistory();
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

    liveScanStatus.textContent = 'Live scan is active. Point the camera to teacher QR.';
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
    if (!sessionDoc.exists()) {
      studentStatus.textContent = 'Invalid session QR.';
      return;
    }

    const sessionData = sessionDoc.data();

    if (!sessionData.active || sessionData.token !== payload.token) {
      studentStatus.textContent = 'Invalid session QR.';
      return;
    }

    if (sessionData.classSection !== studentProfile.classSection) {
      studentStatus.textContent = 'This QR belongs to a different class.';
      return;
    }

    const enrollmentSnap = await getDoc(
      doc(db, 'enrollments', `${studentProfile.classSection}_${studentProfile.id}`),
    );

    if (!enrollmentSnap.exists()) {
      studentStatus.textContent = 'You are not enrolled in this class.';
      return;
    }

    scannedPayload = { ...payload, ...sessionData };
    verifyFaceBtn.disabled = false;
    studentStatus.textContent = 'QR valid. Click verify to confirm face and mark attendance.';
    liveScanStatus.textContent = `Live session detected: ${payload.sessionId.slice(0, 8)}...`;
  } catch {
    studentStatus.textContent = 'Could not read QR payload.';
  } finally {
    isValidatingQr = false;
  }
}

async function initFaceModel() {
  if (typeof faceapi === 'undefined') {
    studentStatus.textContent = 'Face library failed to load.';
    return;
  }

  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
    ]);
  } catch {
    studentStatus.textContent = 'Face model missing. Add full face-api model files to /models.';
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

  const deviceIp = await getDeviceIP();
  const authorizedIp = await getAuthorizedIP();

  if (deviceIp !== authorizedIp) {
    studentStatus.textContent =
      'Attendance cannot be marked. Device not connected to the authorized network.';
    return;
  }

  const isFaceMatch = await verifyFaceMatch(studentProfile.facePhotoDataUrl);
  if (!isFaceMatch) {
    studentStatus.textContent = 'Face does not match enrolled profile.';
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
      if (sessionData.classSection !== studentProfile.classSection) {
        throw new Error('Session class mismatch.');
      }

      const status = Date.now() > sessionData.expiresAt ? 'late' : 'present';

      transaction.set(attendanceRef, {
        sessionId: scannedPayload.sessionId,
        teacherID: sessionData.teacherID,
        subjectCode: sessionData.subjectCode,
        classSection: sessionData.classSection,
        studentId: studentProfile.id,
        studentName: studentProfile.name,
        timestamp: serverTimestamp(),
        clientTimestamp: Date.now(),
        status,
        deviceIP: deviceIp,
      });
    });

    studentStatus.textContent = 'Attendance marked successfully.';
    verifyFaceBtn.disabled = true;
    await loadHistory();
  } catch (error) {
    studentStatus.textContent = error.message;
  }
});

async function verifyFaceMatch(referenceImageDataUrl) {
  if (typeof faceapi === 'undefined' || !referenceImageDataUrl || !faceVideo.srcObject) {
    return false;
  }

  const options = new faceapi.TinyFaceDetectorOptions();
  const liveDetection = await faceapi
    .detectSingleFace(faceVideo, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!liveDetection) return false;

  const img = await faceapi.fetchImage(referenceImageDataUrl);
  const referenceDetection = await faceapi
    .detectSingleFace(img, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!referenceDetection) return false;

  const distance = faceapi.euclideanDistance(liveDetection.descriptor, referenceDetection.descriptor);
  return distance <= FACE_MATCH_THRESHOLD;
}

async function loadHistory() {
  const q = query(
    collection(db, 'attendance'),
    where('studentId', '==', studentProfile.id),
    orderBy('clientTimestamp', 'desc'),
    limit(100),
  );

  const snap = await getDocs(q);
  studentHistoryBody.innerHTML = '';

  snap.forEach((docSnap) => {
    const row = docSnap.data();
    const when = new Date(row.clientTimestamp || Date.now());
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.subjectCode || '-'}</td>
      <td>${when.toLocaleDateString()}</td>
      <td>${when.toLocaleTimeString()}</td>
      <td>${(row.status || '-').toUpperCase()}</td>
    `;
    studentHistoryBody.appendChild(tr);
  });
}

async function getAuthorizedIP() {
  try {
    const policySnap = await getDoc(doc(db, 'system', 'networkPolicy'));
    if (policySnap.exists()) {
      return policySnap.data().allowedIp || AUTHORIZED_IP_FALLBACK;
    }
    return AUTHORIZED_IP_FALLBACK;
  } catch {
    return AUTHORIZED_IP_FALLBACK;
  }
}

async function getDeviceIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'unavailable';
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
