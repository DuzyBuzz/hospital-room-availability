import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { addDoc, collection, doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCxZM9UOr1qXilBABXMmocPMgZu4RoFQT8',
  authDomain: 'shra-iloilo.firebaseapp.com',
  projectId: 'shra-iloilo',
  storageBucket: 'shra-iloilo.firebasestorage.app',
  messagingSenderId: '152960820364',
  appId: '1:152960820364:web:31988c5009cd4f88c6c7a9',
  measurementId: 'G-21R8Y0SHC8',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const email = `copilot-smoke-${Date.now()}@example.com`;
const password = 'TempPass123!';
const displayName = 'Copilot Smoke';
let createdUser = null;

async function waitForAuthenticatedUser(auth) {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          return;
        }

        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      },
    );
  });
}

try {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  createdUser = credential.user;
  await updateProfile(createdUser, { displayName });
  await createdUser.getIdToken(true);
  createdUser = await waitForAuthenticatedUser(auth);

  const createdDocument = await addDoc(collection(firestore, 'facilities'), {
    name: 'Copilot Smoke Facility',
    category: 'Clinic',
    description: 'Temporary smoke test facility entry used to verify production Firestore writes.',
    location: {
      lat: 10.7202,
      lng: 122.5621,
    },
    coordinates: {
      lat: 10.7202,
      lng: 122.5621,
    },
    landmark: 'Smoke Test Marker',
    address: 'Iloilo City Smoke Test Address',
    area: 'Iloilo City',
    contactNumber: '09123456789',
    website: '',
    totalRooms: 10,
    availableRooms: 5,
    roomTypes: ['Private Room'],
    status: 'available',
    sourceLabel: 'Copilot Smoke Test',
    ownerUserId: createdUser.uid,
    ownerDisplayName: displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(firestore, 'facilities', createdDocument.id), {
    updatedAt: serverTimestamp(),
    deletedAt: serverTimestamp(),
    deletedByUserId: createdUser.uid,
  });

  await deleteUser(createdUser);
  await signOut(auth);

  console.log(
    JSON.stringify(
      {
        success: true,
        email,
        uid: createdUser.uid,
        facilityId: createdDocument.id,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        success: false,
        email,
        uid: createdUser?.uid ?? null,
        message: error instanceof Error ? error.message : String(error),
        code: typeof error === 'object' && error !== null && 'code' in error ? error.code : null,
      },
      null,
      2,
    ),
  );

  process.exitCode = 1;
}
