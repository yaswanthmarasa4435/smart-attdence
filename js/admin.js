import {
  db,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
} from './firebase-config.js';

const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginCard = document.getElementById('adminLoginCard');
const adminDashboard = document.getElementById('adminDashboard');
const networkStatus = document.getElementById('networkStatus');
const adminAttendanceBody = document.getElementById('adminAttendanceBody');
const adminStatus = document.getElementById('adminStatus');

function getErrorMessage(error) {
  if (!error) return 'Unknown error.';
  if (error.code && error.message) return `${error.code}: ${error.message}`;
  return error.message || String(error);
}

function setAdminStatus(message, isError = false) {
  if (!adminStatus) return;
  adminStatus.textContent = message;
  adminStatus.style.color = isError ? '#b00020' : '';
}


function buildFirestoreHint(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (code.includes('permission-denied')) {
    return 'Fix Firestore Rules: allow read, write for demo or add proper auth rules.';
  }

  if (code.includes('failed-precondition') || message.includes('database') || message.includes('cloud firestore api')) {
    return 'Enable Firestore Database in Firebase Console (Build → Firestore). Realtime Database rules do not apply to this app.';
  }

  if (code.includes('unavailable') || message.includes('offline')) {
    return 'Network issue. Reconnect internet and retry.';
  }

  return 'Check Firebase project config and Firestore setup.';
}

async function assertFirestoreReady() {
  try {
    await getDoc(doc(db, 'system', 'networkPolicy'));
    return true;
  } catch (error) {
    throw new Error(`Firestore not ready. ${buildFirestoreHint(error)} | ${getErrorMessage(error)}`);
  }
}

adminLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value.trim();

  if (email !== 'admin@smartattend.com' || password !== 'admin123') {
    alert('Invalid admin credentials.');
    return;
  }

  adminLoginCard.classList.add('hidden');
  adminDashboard.classList.remove('hidden');
  setAdminStatus('Connected. Loading dashboard...');

  try {
    await assertFirestoreReady();
    await loadNetworkSettings();
    await loadAttendanceTable();
    setAdminStatus('Dashboard loaded. Firestore connection is active.');
  } catch (error) {
    setAdminStatus(`Could not load admin data: ${getErrorMessage(error)}`, true);
  }
});

document.getElementById('logoutAdminBtn').addEventListener('click', () => {
  window.location.reload();
});

document.getElementById('networkForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ip = document.getElementById('authorizedIp').value.trim();

  try {
    await setDoc(doc(db, 'system', 'networkPolicy'), {
      allowedIp: ip,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    networkStatus.textContent = `Authorized IP saved: ${ip}`;
    setAdminStatus('Network policy saved to Firestore.');
  } catch (error) {
    const message = `Network policy save failed: ${getErrorMessage(error)}`;
    networkStatus.textContent = message;
    setAdminStatus(`${message} | ${buildFirestoreHint(error)}`, true);
  }
});

document.getElementById('subjectForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = document.getElementById('subjectCode').value.trim().toUpperCase();
  const name = document.getElementById('subjectName').value.trim();

  try {
    await setDoc(doc(db, 'subjects', code), {
      code,
      name,
      createdAt: serverTimestamp(),
    }, { merge: true });

    event.target.reset();
    setAdminStatus(`Subject ${code} saved.`);
  } catch (error) {
    setAdminStatus(`Subject save failed: ${getErrorMessage(error)} | ${buildFirestoreHint(error)}`, true);
  }
});

document.getElementById('teacherRecordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const teacherID = document.getElementById('teacherId').value.trim().toUpperCase();
  const name = document.getElementById('teacherName').value.trim();
  const email = document.getElementById('teacherRecordEmail').value.trim().toLowerCase();
  const department = document.getElementById('teacherDepartment').value.trim();

  try {
    await setDoc(doc(db, 'adminTeachers', teacherID), {
      teacherID,
      name,
      email,
      department,
      createdAt: serverTimestamp(),
    }, { merge: true });

    event.target.reset();
    setAdminStatus(`Teacher ${teacherID} saved.`);
  } catch (error) {
    setAdminStatus(`Teacher save failed: ${getErrorMessage(error)} | ${buildFirestoreHint(error)}`, true);
  }
});

document.getElementById('studentRecordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const studentID = document.getElementById('adminStudentId').value.trim().toUpperCase();
  const name = document.getElementById('adminStudentName').value.trim();
  const email = document.getElementById('adminStudentEmail').value.trim().toLowerCase();
  const classSection = document.getElementById('adminStudentClass').value.trim().toUpperCase();

  try {
    await setDoc(doc(db, 'adminStudents', studentID), {
      studentID,
      name,
      email,
      classSection,
      createdAt: serverTimestamp(),
    }, { merge: true });

    event.target.reset();
    setAdminStatus(`Student ${studentID} saved.`);
  } catch (error) {
    setAdminStatus(`Student save failed: ${getErrorMessage(error)} | ${buildFirestoreHint(error)}`, true);
  }
});

document.getElementById('timetableForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const classSection = document.getElementById('classSection').value.trim().toUpperCase();
  const subjectCode = document.getElementById('classSubject').value.trim().toUpperCase();
  const teacherID = document.getElementById('classTeacherId').value.trim().toUpperCase();
  const classroom = document.getElementById('classroom').value.trim();
  const timeSlot = document.getElementById('timeSlot').value.trim();

  try {
    const [teacherSnap, subjectSnap] = await Promise.all([
      getDoc(doc(db, 'adminTeachers', teacherID)),
      getDoc(doc(db, 'subjects', subjectCode)),
    ]);

    if (!teacherSnap.exists()) {
      alert('Teacher ID not found in admin records. Create teacher first.');
      return;
    }

    if (!subjectSnap.exists()) {
      alert('Subject code not found. Create subject first.');
      return;
    }

    const classId = `${classSection}_${subjectCode}_${timeSlot.replace(/\s+/g, '-')}`;

    await setDoc(doc(db, 'classes', classId), {
      classId,
      classSection,
      subjectCode,
      teacherID,
      classroom,
      timeSlot,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    event.target.reset();
    setAdminStatus(`Class ${classId} saved.`);
  } catch (error) {
    setAdminStatus(`Timetable save failed: ${getErrorMessage(error)} | ${buildFirestoreHint(error)}`, true);
  }
});

document.getElementById('enrollmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const studentID = document.getElementById('enrollStudentId').value.trim().toUpperCase();
  const classSection = document.getElementById('enrollClassSection').value.trim().toUpperCase();

  try {
    const [studentSnap, classSnap] = await Promise.all([
      getDoc(doc(db, 'adminStudents', studentID)),
      getDocs(query(collection(db, 'classes'), where('classSection', '==', classSection), limit(1))),
    ]);

    if (!studentSnap.exists()) {
      alert('Student ID not found in admin records. Create student first.');
      return;
    }

    if (studentSnap.data().classSection !== classSection) {
      alert('Enrollment class must match the student class section in admin record.');
      return;
    }

    if (classSnap.empty) {
      alert('No timetable exists for this class section. Assign class first.');
      return;
    }

    await setDoc(doc(db, 'enrollments', `${classSection}_${studentID}`), {
      studentID,
      classSection,
      assignedAt: serverTimestamp(),
    }, { merge: true });

    event.target.reset();
    setAdminStatus(`Enrollment saved for ${studentID} in ${classSection}.`);
  } catch (error) {
    setAdminStatus(`Enrollment save failed: ${getErrorMessage(error)} | ${buildFirestoreHint(error)}`, true);
  }
});

async function loadNetworkSettings() {
  const snap = await getDoc(doc(db, 'system', 'networkPolicy'));
  if (snap.exists()) {
    document.getElementById('authorizedIp').value = snap.data().allowedIp || '192.168.1.15';
  }
}

async function loadAttendanceTable() {
  const q = query(collection(db, 'attendance'), orderBy('clientTimestamp', 'desc'), limit(100));
  const snap = await getDocs(q);

  adminAttendanceBody.innerHTML = '';
  snap.forEach((docSnap) => {
    const row = docSnap.data();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.studentName || row.studentId}</td>
      <td>${row.classSection || '-'}</td>
      <td>${row.subjectCode || '-'}</td>
      <td>${row.status || '-'}</td>
      <td>${new Date(row.clientTimestamp || Date.now()).toLocaleString()}</td>
      <td>${row.teacherID || '-'}</td>
    `;
    adminAttendanceBody.appendChild(tr);
  });
}
