import {
  db,
  serverTimestamp,
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
} from './firebase-config.js';

const loginCard = document.getElementById('teacherLoginCard');
const dashboard = document.getElementById('teacherDashboard');
const loginForm = document.getElementById('teacherLoginForm');
const generateQrBtn = document.getElementById('generateQrBtn');
const qrContainer = document.getElementById('qrcode');
const qrTimer = document.getElementById('qrTimer');
const attendanceBody = document.getElementById('attendanceTableBody');
const presentCount = document.getElementById('presentCount');
const lateCount = document.getElementById('lateCount');
const absentCount = document.getElementById('absentCount');
const attendancePercent = document.getElementById('attendancePercent');
const warningText = document.getElementById('warningText');

let activeSession = null;
let countdownRef = null;

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.getElementById('teacherEmail').value.trim();
  const password = document.getElementById('teacherPassword').value.trim();

  if (email === 'teacher@smartattend.com' && password === '123456') {
    loginCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    startDashboardListener();
  } else {
    alert('Invalid login credentials.');
  }
});

document.getElementById('logoutTeacherBtn').addEventListener('click', () => {
  window.location.reload();
});

generateQrBtn.addEventListener('click', async () => {
  const sessionId = crypto.randomUUID();
  const token = Math.random().toString(36).slice(2);
  const expiryMs = Date.now() + 60_000;

  const sessionDoc = doc(db, 'sessions', sessionId);
  await setDoc(sessionDoc, {
    token,
    createdAt: serverTimestamp(),
    expiresAt: expiryMs,
    active: true,
  });

  activeSession = { sessionId, token, expiryMs };
  renderQr(activeSession);
  startCountdown(expiryMs, sessionDoc);
  listenAttendance(sessionId);
});

function renderQr(payload) {
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: JSON.stringify(payload),
    width: 180,
    height: 180,
    colorDark: '#000000',
    colorLight: '#ffffff',
  });
}

function startCountdown(expiryMs, sessionDoc) {
  clearInterval(countdownRef);
  countdownRef = setInterval(async () => {
    const left = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
    qrTimer.textContent = left > 0 ? `QR expires in ${left}s` : 'QR expired';

    if (left <= 0) {
      clearInterval(countdownRef);
      await updateDoc(sessionDoc, { active: false });
    }
  }, 500);
}

function listenAttendance(sessionId) {
  const q = query(
    collection(db, 'attendance'),
    where('sessionId', '==', sessionId),
    orderBy('timestamp', 'desc'),
  );

  onSnapshot(q, async (snapshot) => {
    const rows = [];
    let present = 0;
    let late = 0;

    snapshot.forEach((docSnap) => {
      const row = docSnap.data();
      rows.push(row);
      if (row.status === 'present') present += 1;
      if (row.status === 'late') late += 1;
    });

    attendanceBody.innerHTML = rows
      .map(
        (row) => `
      <tr>
        <td>${row.studentName}</td>
        <td>${new Date(row.clientTimestamp).toLocaleTimeString()}</td>
        <td>${row.status}</td>
        <td>${row.deviceIP || 'unknown'}</td>
      </tr>
    `,
      )
      .join('');

    const students = await getDocs(collection(db, 'students'));
    const totalStudents = students.size || 0;
    const attended = present + late;
    const absent = Math.max(totalStudents - attended, 0);
    const percent = totalStudents ? Math.round((attended / totalStudents) * 100) : 0;

    presentCount.textContent = String(present);
    lateCount.textContent = String(late);
    absentCount.textContent = String(absent);
    attendancePercent.textContent = `${percent}%`;
    warningText.classList.toggle('hidden', percent >= 75);
  });
}

function startDashboardListener() {
  // Placeholder for future cross-session analytics.
}
