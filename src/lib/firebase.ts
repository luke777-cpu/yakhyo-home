/**
 * Firebase 클라이언트.
 *
 * 이 사이트는 정적 빌드(GitHub Pages)를 유지한다. 서버가 없으므로 인증과 게시판은
 * 전부 브라우저에서 돈다. 그래서 **보안은 화면이 아니라 Firestore Security Rules 가 지킨다.**
 * 여기 있는 코드가 무엇을 요청하든, 허용 여부는 firestore.rules 가 정한다.
 *
 * Firebase web config(apiKey 등)는 **공개되어도 되는 값**이다. 비밀키가 아니라
 * 프로젝트를 가리키는 식별자다. 접근 제어는 Rules 가 한다.
 * 반대로 service account JSON / private key 는 이 파일을 포함해 클라이언트 어디에도 두지 않는다.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, signOut as fbSignOut,
  onAuthStateChanged, type Auth, type User,
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, runTransaction,
  collection, addDoc, updateDoc, query, where, orderBy, limit, startAfter,
  getDocs, serverTimestamp, type Firestore, type QueryDocumentSnapshot, type Timestamp,
} from 'firebase/firestore';
import { writeAuthHint } from './authHint';

const cfg = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID as string | undefined,
};

/** 최소 네 값이 있어야 동작한다. 없으면 화면에 설정 안내를 띄운다. */
export const isConfigured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

export const SETUP_MESSAGE =
  '아직 로그인 설정이 끝나지 않았습니다. docs/FIREBASE-AUTH-BOARD-SETUP.md 의 순서대로 Firebase 프로젝트와 환경변수를 먼저 준비해 주세요.';

/** 카카오는 아직 안전하게 붙일 수 없다. 이유는 docs/FIREBASE-KAKAO-AUTH.md 참고. */
export const KAKAO_ENABLED = false;
export const KAKAO_PENDING_MESSAGE =
  '카카오 로그인은 준비 중입니다. Firebase 는 카카오를 기본 제공하지 않아 안전한 서버(Custom Token 발급)가 필요합니다. 지금은 Google 또는 이메일로 이용해 주세요.';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function ensureApp(): FirebaseApp | null {
  if (!isConfigured) return null;
  if (!app) app = initializeApp(cfg as Record<string, string>);
  return app;
}
/** 설정 전이면 null. 던지지 않는다 — 페이지가 죽는 대신 버튼이 안내를 보이게 하려는 것이다. */
export function getAuthOrNull(): Auth | null {
  const a = ensureApp();
  if (!a) return null;
  if (!authInstance) authInstance = getAuth(a);
  return authInstance;
}
export function getDb(): Firestore | null {
  const a = ensureApp();
  if (!a) return null;
  if (!dbInstance) dbInstance = getFirestore(a);
  return dbInstance;
}

/* ---------- 컬렉션 이름 ---------- */
export const COL = {
  profiles: 'yakhyo_profiles',
  nicknames: 'yakhyo_nicknames',
  posts: 'yakhyo_posts',
  comments: 'yakhyo_comments',
  reports: 'yakhyo_reports',
} as const;

/* ---------- 경로 ---------- */
export function absoluteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const rest = path.startsWith('/') ? path.slice(1) : path;
  return new URL(`${base}${rest}`, window.location.origin).toString();
}

/* ---------- 인증 ---------- */
/**
 * Google 로그인은 popup 을 쓴다.
 *
 * signInWithRedirect 는 Firebase 의 인증 iframe 이 <project>.firebaseapp.com 에 있어
 * 서드파티 저장소 접근에 기댄다. 우리 사이트는 github.io 라 authDomain 을 맞출 수 없고,
 * 그래서 Safari 16.1+ · Firefox 109+ · Chrome M115+ 에서 redirect 방식이 깨진다.
 * popup 은 창 사이 postMessage 를 쓰므로 그 영향을 받지 않는다.
 *
 * 대신 popup 을 막는 브라우저(카카오톡·인스타그램 인앱 브라우저 등)가 있다.
 * 그 경우 redirect 로 넘어가지 않는다 — 어차피 깨지는 길이기 때문이다.
 * 이메일 로그인을 대비책으로 안내한다.
 */
export async function signInWithGoogle(): Promise<User> {
  const auth = getAuthOrNull();
  if (!auth) throw new Error('not-configured');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const auth = getAuthOrNull();
  if (!auth) throw new Error('not-configured');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // 확인 메일은 보내되 막지는 않는다. v1 에서 미확인 계정을 잠그지 않는 이유는 설정 문서에 적었다.
  try { await sendEmailVerification(cred.user); } catch (e) { console.warn('[auth] 확인 메일 실패', e); }
  return cred.user;
}
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const auth = getAuthOrNull();
  if (!auth) throw new Error('not-configured');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}
export async function signOut(): Promise<void> {
  const auth = getAuthOrNull();
  if (auth) await fbSignOut(auth);
  writeAuthHint(null);
}

/** 첫 상태가 정해질 때까지 기다린다. onAuthStateChanged 는 처음 한 번 늦게 온다. */
export function currentUser(): Promise<User | null> {
  const auth = getAuthOrNull();
  if (!auth) return Promise.resolve(null);
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      if (!u) writeAuthHint(null);
      resolve(u);
    });
  });
}
export function watchUser(cb: (u: User | null) => void): () => void {
  const auth = getAuthOrNull();
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, (u) => {
    if (!u) writeAuthHint(null);
    cb(u);
  });
}

/* ---------- 프로필 · 닉네임 ---------- */
export type Profile = { nickname: string; createdAt?: Timestamp | null; updatedAt?: Timestamp | null };

/** 대소문자·앞뒤 공백을 무시한 비교용 키. 닉네임 예약 문서의 id 가 된다. */
export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, COL.profiles, uid));
  const profile = snap.exists() ? (snap.data() as Profile) : null;
  // 헤더가 읽는 힌트를 여기서 최신으로 맞춘다. Firebase 를 부른 김에 한다.
  writeAuthHint({ uid, nickname: profile?.nickname ?? null });
  return profile;
}

/**
 * 닉네임을 확보하면서 프로필을 만든다.
 *
 * Firestore 에는 SQL 의 UNIQUE 가 없다. "먼저 조회해서 없으면 저장"은
 * 두 사람이 동시에 하면 둘 다 통과한다(race condition).
 * 그래서 `yakhyo_nicknames/{정규화된 닉네임}` 문서를 **예약**으로 쓰고,
 * 예약 확보와 프로필 저장을 하나의 트랜잭션으로 묶는다.
 * 예약 문서가 이미 있으면 트랜잭션이 실패하므로 중복이 생기지 않는다.
 */
export async function claimNicknameAndSaveProfile(uid: string, nickname: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('not-configured');

  const clean = nickname.trim();
  const key = normalizeNickname(clean);
  if (clean.length < 2 || clean.length > 20) throw new Error('nickname-length');

  const nickRef = doc(db, COL.nicknames, key);
  const profRef = doc(db, COL.profiles, uid);

  await runTransaction(db, async (tx) => {
    const nickSnap = await tx.get(nickRef);
    if (nickSnap.exists() && nickSnap.data().uid !== uid) throw new Error('nickname-taken');

    const profSnap = await tx.get(profRef);
    const prev = profSnap.exists() ? (profSnap.data() as Profile) : null;
    const prevKey = prev ? normalizeNickname(prev.nickname) : null;

    if (!nickSnap.exists()) tx.set(nickRef, { uid, nickname: clean, createdAt: serverTimestamp() });

    if (prev) tx.update(profRef, { nickname: clean, updatedAt: serverTimestamp() });
    else tx.set(profRef, { nickname: clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

    // 이름을 바꾼 경우 옛 예약을 놓아준다. 안 놓으면 그 이름이 영영 잠긴다.
    if (prevKey && prevKey !== key) tx.delete(doc(db, COL.nicknames, prevKey));
  });
}

/**
 * 닉네임을 바꿔도 **이미 쓴 글의 authorNickname 은 그대로 남는다.**
 * Firestore 에는 join 이 없어 글마다 닉네임을 복사해 두기 때문이다.
 * 옛 글을 모두 고치려면 글 수만큼 쓰기가 필요해 v1 에서는 하지 않는다.
 * 이 선택의 결과는 docs/FIREBASE-AUTH-BOARD-SETUP.md 에 적어 두었다.
 */

/* ---------- 게시판 ---------- */
export type PostRow = {
  id: string; authorId: string; authorNickname: string;
  title: string; body: string;
  createdAt: Timestamp | null; updatedAt?: Timestamp | null; deletedAt: null; status: string;
  commentCount?: number;
};

const PAGE = 20;

export async function listPosts(cursor?: QueryDocumentSnapshot) {
  const db = getDb();
  if (!db) return { rows: [], last: null };
  // deletedAt == null 조건은 Rules 와 짝이다. 이 조건이 없으면 Rules 가 질의를 거부한다.
  const parts = [where('deletedAt', '==', null), orderBy('createdAt', 'desc'), limit(PAGE)];
  const q = cursor
    ? query(collection(db, COL.posts), where('deletedAt', '==', null), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE))
    : query(collection(db, COL.posts), ...parts);
  const snap = await getDocs(q);
  return {
    rows: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as PostRow[],
    last: snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : null,
  };
}

export async function listMyPosts(uid: string) {
  const db = getDb();
  if (!db) return [];
  const q = query(
    collection(db, COL.posts),
    where('authorId', '==', uid), where('deletedAt', '==', null),
    orderBy('createdAt', 'desc'), limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as PostRow[];
}

export async function getPost(id: string): Promise<PostRow | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, COL.posts, id));
  if (!snap.exists()) return null;
  const data = snap.data() as PostRow;
  if (data.deletedAt) return null;
  return { ...data, id: snap.id };
}

export async function createPost(uid: string, nickname: string, title: string, body: string) {
  const db = getDb();
  if (!db) throw new Error('not-configured');
  const ref = await addDoc(collection(db, COL.posts), {
    authorId: uid, authorNickname: nickname,
    title: title.trim(), body: body.trim(),
    status: 'published', deletedAt: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePost(id: string, title: string, body: string) {
  const db = getDb();
  if (!db) throw new Error('not-configured');
  await updateDoc(doc(db, COL.posts, id), { title: title.trim(), body: body.trim(), updatedAt: serverTimestamp() });
}

/** hard delete 가 아니다. Rules 에서 delete 는 아예 막혀 있다. */
export async function softDeletePost(id: string) {
  const db = getDb();
  if (!db) throw new Error('not-configured');
  await updateDoc(doc(db, COL.posts, id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function listComments(postId: string) {
  const db = getDb();
  if (!db) return [];
  const q = query(
    collection(db, COL.comments),
    where('postId', '==', postId), where('deletedAt', '==', null),
    orderBy('createdAt', 'asc'), limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Array<{
    id: string; postId: string; authorId: string; authorNickname: string; body: string; createdAt: Timestamp | null;
  }>;
}

export async function createComment(postId: string, uid: string, nickname: string, body: string) {
  const db = getDb();
  if (!db) throw new Error('not-configured');
  await addDoc(collection(db, COL.comments), {
    postId, authorId: uid, authorNickname: nickname, body: body.trim(),
    deletedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}
export async function updateComment(id: string, body: string) {
  const db = getDb();
  if (!db) throw new Error('not-configured');
  await updateDoc(doc(db, COL.comments, id), { body: body.trim(), updatedAt: serverTimestamp() });
}
export async function softDeleteComment(id: string) {
  const db = getDb();
  if (!db) throw new Error('not-configured');
  await updateDoc(doc(db, COL.comments, id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/* ---------- 표시 유틸 ---------- */
/** 사용자가 쓴 글이 그대로 HTML 로 들어가지 않게 한다. 게시판은 서식 없는 글만 받는다. */
export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * serverTimestamp() 는 서버가 값을 넣기 전까지 null 이다.
 * getDocs 로 서버에서 읽으면 보통 채워져 있지만, 방금 쓴 문서가 캐시로 먼저 올 수 있어
 * null 을 안전하게 처리한다.
 */
export function timeAgo(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts?.toDate) return '방금';
  const t = ts.toDate().getTime();
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  const d = ts.toDate();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** Firebase 오류를 사용자에게 보여줄 한 문장으로. 원문은 콘솔에만 남긴다. */
export function friendlyError(err: unknown, fallback = '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'): string {
  if (!err) return fallback;
  console.error('[firebase]', err);
  const code = String((err as { code?: string })?.code ?? '');
  const msg = String((err as { message?: string })?.message ?? err);

  if (msg.includes('nickname-taken')) return '이미 쓰고 있는 닉네임입니다. 다른 이름으로 해 주세요.';
  if (msg.includes('nickname-length')) return '닉네임은 2~20자로 정해 주세요.';
  if (msg.includes('not-configured')) return SETUP_MESSAGE;

  if (code === 'auth/popup-blocked')
    return '브라우저가 로그인 창을 막았습니다. 팝업을 허용하시거나, 카카오톡·인스타그램 안에서 열었다면 크롬·사파리로 열어 주세요. 이메일 로그인도 됩니다.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '로그인 창이 닫혔습니다. 다시 시도해 주세요.';
  if (code === 'auth/operation-not-allowed') return '이 로그인 방법이 아직 Firebase 에서 켜지지 않았습니다. 설정 문서를 확인해 주세요.';
  if (code === 'auth/unauthorized-domain') return '이 주소가 Firebase 의 승인된 도메인에 없습니다. 설정 문서 4단계를 확인해 주세요.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
    return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (code === 'auth/email-already-in-use') return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (code === 'auth/weak-password') return '비밀번호는 6자 이상이어야 합니다. 8자 이상을 권합니다.';
  if (code === 'auth/invalid-email') return '이메일 주소를 확인해 주세요.';
  if (code === 'auth/too-many-requests') return '시도가 너무 잦습니다. 잠시 후 다시 해 주세요.';
  if (code === 'auth/network-request-failed') return '연결하지 못했습니다. 네트워크 상태를 확인해 주세요.';

  if (code === 'permission-denied') return '권한이 없습니다. 로그인 상태와 본인 글인지 확인해 주세요.';
  if (code === 'failed-precondition' && /index/i.test(msg))
    return '데이터베이스 색인이 아직 만들어지지 않았습니다. 설정 문서 6단계의 색인 배포를 확인해 주세요.';
  if (code === 'unavailable') return '연결하지 못했습니다. 네트워크 상태를 확인해 주세요.';
  return fallback;
}
