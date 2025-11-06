// Firebase Initialization (Compat SDK)
// Exposes auth and firestore via window.FirebaseServices

// Ensure Firebase CDN scripts are loaded before this file.
(function initFirebaseCompat() {
	if (window.FirebaseServices && window.FirebaseServices.app) return;
	if (typeof firebase === 'undefined') {
		console.error('Firebase CDN scripts not loaded.');
		return;
	}

	// Direct config (per request)
	const firebaseConfig = {
		apiKey: "AIzaSyDzG7ALtTD4NKHwFDj-sWJCdWvSOL-UphU",
		authDomain: "chargekart-6b4b6.firebaseapp.com",
		projectId: "chargekart-6b4b6",
		storageBucket: "chargekart-6b4b6.firebasestorage.app",
		messagingSenderId: "142662338683",
		appId: "1:142662338683:web:05887bc5252eb756fffade",
		measurementId: "G-Q5XGRGDS5J"
	};

	const app = firebase.initializeApp(firebaseConfig);
	let analytics = null;
	try { analytics = firebase.analytics ? firebase.analytics() : null; } catch (_) {}

	window.FirebaseServices = {
		app,
		auth: firebase.auth(),
		db: firebase.firestore(),
		analytics
	};
})();



