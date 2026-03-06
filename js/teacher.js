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
  onSnapshot,
  updateDoc,
} from './firebase-config.js';

const loginForm = document.getElementById('teacherLoginForm');
const loginCard = document.getElementById('teacherLoginCard');
const dashboard = document.getElementById('teacherDashboard');
const generateQrBtn = document.getElementById('generateQrBtn');
const qrContainer = document.getElementById('qrcode');
const qrTimer = document.getElementById('qrTimer');
const teacherStatus = document.getElementById('teacherStatus');
const attendanceBody = document.getElementById('attendanceTableBody');
const historyBody = document.getElementById('historyBody');
const timetableBody = document.getElementById('timetableBody');
const classSelector = document.getElementById('classSelector');

const presentCount = document.getElementById('presentCount');
const lateCount = document.getElementById('lateCount');
const absentCount = document.getElementById('absentCount');
const attendancePercent = document.getElementById('attendancePercent');
const warningText = document.getElementById('warningText');

let teacherProfile = null;
let assignedClasses = [];
let activeSession = null;
let countdownRef = null;
let unsubscribeAttendance = null;

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const teacherID = document.getElementById('teacherId').value.trim().toUpperCase();
  const password = document.getElementById('teacherPassword').value.trim();

  const adminRecordRef = doc(db, 'adminTeachers', teacherID);
  const adminRecord = await getDoc(adminRecordRef);

  if (!adminRecord.exists()) {
    alert('Access denied. Contact the administrator.');
    return;
  }

  const profileRef = doc(db, 'teacherProfiles', teacherID);
  const profileSnap = await getDoc(profileRef);

  if (profileSnap.exists()) {
    if (profileSnap.data().password !== password) {
      alert('Invalid password.');
      return;
    }
    teacherProfile = { teacherID, ...adminRecord.data(), ...profileSnap.data() };
  } else {
    await setDoc(profileRef, {
      teacherID,
      password,
      createdAt: serverTimestamp(),
    });
    teacherProfile = { teacherID, ...adminRecord.data(), password };
  }

  loginCard.classList.add('hidden');
  dashboard.classList.remove('hidden');
  teacherStatus.textContent = `Welcome ${teacherProfile.name}.`; 

  await loadTimetable();
  await loadHistory();
});

document.getElementById('logoutTeacherBtn').addEventListener('click', () => {
  window.location.reload();
});

generateQrBtn.addEventListener('click', async () => {
  if (!teacherProfile) return;

  const classId = classSelector.value;
  const selectedClass = assignedClasses.find((item) => item.classId === classId);

  if (!selectedClass) {
    teacherStatus.textContent = 'No assigned class selected.';
    return;
  }

  const sessionId = crypto.randomUUID();
  const token = Math.random().toString(36).slice(2);
  const expiryMs = Date.now() + 60_000;
  const sessionDoc = doc(db, 'sessions', sessionId);

  activeSession = {
    sessionId,
    token,
    expiryMs,
    classId: selectedClass.classId,
    classSection: selectedClass.classSection,
    subjectCode: selectedClass.subjectCode,
    teacherID: teacherProfile.teacherID,
  };

  renderQr(activeSession);
  startCountdown(expiryMs, sessionDoc);
  if (unsubscribeAttendance) unsubscribeAttendance();
  unsubscribeAttendance = listenAttendance(sessionId, selectedClass.classSection);

  try {
    await setDoc(sessionDoc, {
      ...activeSession,
      classroom: selectedClass.classroom,
      timeSlot: selectedClass.timeSlot,
      createdAt: serverTimestamp(),
      active: true,
    });
    teacherStatus.textContent = 'QR generated for assigned class.';
  } catch (error) {
    console.error('Could not save session to Firestore:', error);
    teacherStatus.textContent = 'QR generated locally, but session was not saved to Firestore.';
  }
});

function renderQr(payload) {
  qrContainer.innerHTML = '';

  if (typeof QRCode === 'undefined') {
    qrContainer.textContent = 'QR library failed to load.';
    return;
  }

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
      try {
        await updateDoc(sessionDoc, { active: false });
      } catch (error) {
        console.warn('Could not update session expiry in Firestore:', error);
      }
    }
  }, 500);
}

function listenAttendance(sessionId, classSection) {
  const q = query(
    collection(db, 'attendance'),
    where('sessionId', '==', sessionId),
    orderBy('clientTimestamp', 'desc'),
  );

  return onSnapshot(q, async (snapshot) => {
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
        <td>${row.classSection || '-'}</td>
        <td>${row.subjectCode || '-'}</td>
        <td>${new Date(row.clientTimestamp).toLocaleTimeString()}</td>
        <td>${row.status}</td>
        <td>${row.deviceIP || 'unknown'}</td>
      </tr>
    `,
      )
      .join('');

    const enrolledStudents = await getDocs(
      query(collection(db, 'enrollments'), where('classSection', '==', classSection)),
    );

    const totalStudents = enrolledStudents.size || 0;
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

async function loadTimetable() {
  const q = query(collection(db, 'classes'), where('teacherID', '==', teacherProfile.teacherID));
  const snap = await getDocs(q);

  assignedClasses = [];
  timetableBody.innerHTML = '';
  classSelector.innerHTML = '';

  snap.forEach((docSnap) => {
    const row = docSnap.data();
    assignedClasses.push(row);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.classSection}</td>
      <td>${row.subjectCode}</td>
      <td>${row.classroom}</td>
      <td>${row.timeSlot}</td>
    `;
    timetableBody.appendChild(tr);

    const option = document.createElement('option');
    option.value = row.classId;
    option.textContent = `${row.classSection} | ${row.subjectCode} | ${row.timeSlot}`;
    classSelector.appendChild(option);
  });

  if (!assignedClasses.length) {
    teacherStatus.textContent = 'No classes assigned by admin yet.';
    generateQrBtn.disabled = true;
  } else {
    generateQrBtn.disabled = false;
  }
}

async function loadHistory() {
  const q = query(
    collection(db, 'attendance'),
    where('teacherID', '==', teacherProfile.teacherID),
    orderBy('clientTimestamp', 'desc'),
    limit(100),
  );

  const snap = await getDocs(q);
  historyBody.innerHTML = '';

  snap.forEach((docSnap) => {
    const row = docSnap.data();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.sessionId?.slice(0, 8) || '-'}</td>
      <td>${row.classSection || '-'}</td>
      <td>${row.subjectCode || '-'}</td>
      <td>${row.studentName || row.studentId}</td>
      <td>${row.status || '-'}</td>
      <td>${new Date(row.clientTimestamp || Date.now()).toLocaleString()}</td>
    `;
    historyBody.appendChild(tr);
  });
}
