

// firebase-config.js para uso com Firebase CDN
// Certifique-se de adicionar os scripts CDN do Firebase no seu index.html antes deste arquivo:
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js"></script>

const firebaseConfig = {
  apiKey: "AIzaSyCWLQteC_iYmUi_0DVEsUb5kCdki5e13bs",
  authDomain: "normatel-rh.firebaseapp.com",
  projectId: "normatel-rh",
  storageBucket: "normatel-rh.firebasestorage.app",
  messagingSenderId: "184591082402",
  appId: "1:184591082402:web:8cc2e29f863e0ac8f888fb",
  measurementId: "G-RWH43JZTPY"
};

if (!window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

window.db = window.firebase.firestore();
window.auth = window.firebase.auth();
if (typeof window.firebase.storage === 'function') {
  window.storage = window.firebase.storage();
} else {
  // Algumas telas (ex.: login) não carregam o SDK de Storage.
  window.storage = null;
}
