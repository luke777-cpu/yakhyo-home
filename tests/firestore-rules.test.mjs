/**
 * Firestore Security Rules 시나리오 테스트.
 *
 * 5차까지 PostgreSQL RLS 로 확인했던 26개 시나리오를 같은 의도로 옮겼다.
 * Rules 는 이 사이트의 유일한 접근 제어이므로, 바꿀 때마다 이 파일을 돌린다.
 *
 *   npm run test:rules
 *
 * 에뮬레이터가 없으면 자동으로 받는다(약 137MB, 최초 1회).
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc, collection, getDocs,
         query, where, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const A = 'user-a', B = 'user-b', C = 'user-c', D = 'user-d';
// C 는 프로필을 새로 만드는 사용자, D 는 끝까지 프로필이 없는 사용자
const POST = 'post-1', COMMENT = 'comment-1';

let env, pass = 0, fail = 0;
const results = [];

async function check(name, fn) {
  try { await fn(); pass++; results.push(['PASS', name]); }
  catch (e) { fail++; results.push(['FAIL', name, String(e.message ?? e).slice(0, 160)]); }
}

const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
// 관리자는 Firebase Auth custom claim 으로만 판별된다. 에뮬레이터에서는 이렇게 흉내낸다.
// 실제 환경에서 이 claim 은 Admin SDK(서버)만 발급할 수 있어 클라이언트가 위조할 수 없다.
const ADMIN = 'admin-1';
const adminDb = () => env.authenticatedContext(ADMIN, { admin: true }).firestore();
const BANNED = 'user-banned';

const postData = (authorId, over = {}) => ({
  authorId, authorNickname: '아침산책', title: '아침에 늦게 오르는 날',
  body: '기록을 어떻게 남기면 좋을까요', status: 'published', deletedAt: null,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});
const commentData = (authorId, over = {}) => ({
  postId: POST, authorId, authorNickname: '저녁기록', body: '저도 그렇습니다',
  deletedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});

env = await initializeTestEnvironment({
  projectId: 'yakhyo-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});
await env.clearFirestore();

// ---- 준비: A·B 프로필, A 의 글 하나. Rules 를 우회해 심는다. ----
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'yakhyo_profiles', A), { nickname: '아침산책', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_profiles', B), { nickname: '저녁기록', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_nicknames', '아침산책'), { uid: A, nickname: '아침산책', createdAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_posts', POST), { ...postData(A), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_comments', COMMENT), { ...commentData(B), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
});

/* ---------- 프로필 · 닉네임 ---------- */
// C 는 프로필이 없는 사용자다. 새로 만드는 경로를 그대로 시험한다.
await check('[1] 프로필이 없는 사용자가 자기 프로필을 만든다 → 허용', () =>
  assertSucceeds(setDoc(doc(db(C), 'yakhyo_profiles', C),
    { nickname: '새로온사람', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[1b] A가 닉네임을 바꾼다(createdAt 유지) → 허용', () =>
  assertSucceeds(updateDoc(doc(db(A), 'yakhyo_profiles', A),
    { nickname: '아침걷기', updatedAt: serverTimestamp() })));

await check('[1c] A가 createdAt 을 고쳐 쓴다 → 차단', () =>
  assertFails(updateDoc(doc(db(A), 'yakhyo_profiles', A),
    { nickname: '아침걷기', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[2] A가 B의 프로필 생성 → 차단', () =>
  assertFails(setDoc(doc(db(A), 'yakhyo_profiles', B),
    { nickname: '가짜B', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[3] 1자 닉네임 → 차단', () =>
  assertFails(setDoc(doc(db(D), 'yakhyo_profiles', D),
    { nickname: '짧', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[4] 21자 닉네임 → 차단', () =>
  assertFails(setDoc(doc(db(D), 'yakhyo_profiles', D),
    { nickname: '가'.repeat(21), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[5] 프로필에 없는 필드 추가 → 차단', () =>
  assertFails(setDoc(doc(db(D), 'yakhyo_profiles', D),
    { nickname: '새사람', realName: '홍길동', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[6] createdAt 을 클라이언트 시각으로 위조 → 차단', () =>
  assertFails(setDoc(doc(db(D), 'yakhyo_profiles', D),
    { nickname: '새사람', createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() })));

await check('[7] 프로필 삭제 → 차단', () =>
  assertFails(deleteDoc(doc(db(A), 'yakhyo_profiles', A))));

await check('[8] B가 A의 닉네임 예약을 지운다 → 차단', () =>
  assertFails(deleteDoc(doc(db(B), 'yakhyo_nicknames', '아침산책'))));

await check('[9] B가 이미 잡힌 닉네임을 덮어쓴다 → 차단', () =>
  assertFails(setDoc(doc(db(B), 'yakhyo_nicknames', '아침산책'),
    { uid: B, nickname: '아침산책', createdAt: serverTimestamp() })));

await check('[10] B가 남의 uid 로 예약 → 차단', () =>
  assertFails(setDoc(doc(db(B), 'yakhyo_nicknames', '새이름'),
    { uid: A, nickname: '새이름', createdAt: serverTimestamp() })));

/* ---------- 글 읽기 ---------- */
await check('[11] 비로그인 방문자가 글을 읽는다 → 허용', () =>
  assertSucceeds(getDoc(doc(db(null), 'yakhyo_posts', POST))));

await check('[12] 비로그인 목록 질의(deletedAt 조건 있음) → 허용', () =>
  assertSucceeds(getDocs(query(collection(db(null), 'yakhyo_posts'),
    where('deletedAt', '==', null), orderBy('createdAt', 'desc')))));

await check('[13] deletedAt 조건 없는 목록 질의 → 차단(Rules 는 필터가 아니다)', () =>
  assertFails(getDocs(query(collection(db(null), 'yakhyo_posts'), orderBy('createdAt', 'desc')))));

/* ---------- 글 쓰기 ---------- */
await check('[14] 비로그인 글쓰기 → 차단', () =>
  assertFails(addDoc(collection(db(null), 'yakhyo_posts'), postData('anyone'))));

await check('[15] A가 글을 쓴다 → 허용', () =>
  assertSucceeds(addDoc(collection(db(A), 'yakhyo_posts'), postData(A))));

await check('[16] A가 authorId 를 B로 위조 → 차단', () =>
  assertFails(addDoc(collection(db(A), 'yakhyo_posts'), postData(B))));

await check('[17] D(프로필 없음)가 글을 쓴다 → 차단', () =>
  assertFails(addDoc(collection(db(D), 'yakhyo_posts'), postData(D))));

await check('[18] 제목 1자 → 차단', () =>
  assertFails(addDoc(collection(db(A), 'yakhyo_posts'), postData(A, { title: '가' }))));

await check('[19] 본문 5001자 → 차단', () =>
  assertFails(addDoc(collection(db(A), 'yakhyo_posts'), postData(A, { body: '가'.repeat(5001) }))));

await check('[20] 처음부터 deletedAt 을 채워서 생성 → 차단', () =>
  assertFails(addDoc(collection(db(A), 'yakhyo_posts'), postData(A, { deletedAt: serverTimestamp() }))));

/* ---------- 글 수정 · 삭제 ---------- */
await check('[21] B가 A의 글을 수정 → 차단', () =>
  assertFails(updateDoc(doc(db(B), 'yakhyo_posts', POST), { title: '남이 바꿈', body: '내용', updatedAt: serverTimestamp() })));

await check('[22] B가 A의 글을 소프트 삭제 → 차단', () =>
  assertFails(updateDoc(doc(db(B), 'yakhyo_posts', POST), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[23] B가 A의 글을 하드 삭제 → 차단', () =>
  assertFails(deleteDoc(doc(db(B), 'yakhyo_posts', POST))));

await check('[24] A조차 하드 삭제할 수 없다 → 차단', () =>
  assertFails(deleteDoc(doc(db(A), 'yakhyo_posts', POST))));

await check('[25] A가 자기 글의 소유권을 B에게 넘긴다 → 차단', () =>
  assertFails(updateDoc(doc(db(A), 'yakhyo_posts', POST),
    { authorId: B, title: '제목', body: '내용', updatedAt: serverTimestamp() })));

await check('[26] A가 status 를 직접 바꾼다 → 차단', () =>
  assertFails(updateDoc(doc(db(A), 'yakhyo_posts', POST),
    { status: 'hidden', title: '제목', body: '내용', updatedAt: serverTimestamp() })));

await check('[27] A가 자기 글을 수정 → 허용', () =>
  assertSucceeds(updateDoc(doc(db(A), 'yakhyo_posts', POST),
    { title: '제목을 고쳤습니다', body: '내용도 고쳤습니다', updatedAt: serverTimestamp() })));

/* ---------- 답글 ---------- */
await check('[28] B가 A의 글에 답글 → 허용', () =>
  assertSucceeds(addDoc(collection(db(B), 'yakhyo_comments'), commentData(B))));

await check('[29] 없는 글에 답글 → 차단', () =>
  assertFails(addDoc(collection(db(B), 'yakhyo_comments'), commentData(B, { postId: 'no-such-post' }))));

await check('[30] A가 B의 답글을 수정 → 차단', () =>
  assertFails(updateDoc(doc(db(A), 'yakhyo_comments', COMMENT), { body: '가로채기', updatedAt: serverTimestamp() })));

await check('[31] A가 B의 답글을 하드 삭제 → 차단', () =>
  assertFails(deleteDoc(doc(db(A), 'yakhyo_comments', COMMENT))));

await check('[32] B가 자기 답글을 소프트 삭제 → 허용', () =>
  assertSucceeds(updateDoc(doc(db(B), 'yakhyo_comments', COMMENT),
    { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })));

/* ---------- 소프트 삭제 이후 ---------- */
await check('[33] A가 자기 글을 소프트 삭제 → 허용', () =>
  assertSucceeds(updateDoc(doc(db(A), 'yakhyo_posts', POST),
    { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })));

await check('[34] 지운 글을 비로그인이 읽는다 → 차단', () =>
  assertFails(getDoc(doc(db(null), 'yakhyo_posts', POST))));

await check('[35] 작성자 본인도 지운 글은 못 읽는다 → 차단', () =>
  assertFails(getDoc(doc(db(A), 'yakhyo_posts', POST))));

await check('[36] 지운 글을 되살린다 → 차단', () =>
  assertFails(updateDoc(doc(db(A), 'yakhyo_posts', POST),
    { deletedAt: null, title: '제목', body: '내용', updatedAt: serverTimestamp() })));

await check('[37] 지운 글에 답글을 단다 → 차단', () =>
  assertFails(addDoc(collection(db(B), 'yakhyo_comments'), commentData(B))));

/* ---------- 신고 ---------- */
await check('[38] A가 신고를 접수 → 허용', () =>
  assertSucceeds(addDoc(collection(db(A), 'yakhyo_reports'),
    { reporterId: A, targetType: 'post', targetId: POST, reason: 'personal_info', createdAt: serverTimestamp() })));

await check('[39] 정해지지 않은 신고 사유 → 차단', () =>
  assertFails(addDoc(collection(db(A), 'yakhyo_reports'),
    { reporterId: A, targetType: 'post', targetId: POST, reason: '아무거나', createdAt: serverTimestamp() })));

await check('[40] A가 신고 내역을 읽는다 → 차단', () =>
  assertFails(getDocs(collection(db(A), 'yakhyo_reports'))));

await check('[41] 비로그인이 신고를 접수 → 차단', () =>
  assertFails(addDoc(collection(db(null), 'yakhyo_reports'),
    { reporterId: A, targetType: 'post', targetId: POST, reason: 'spam', createdAt: serverTimestamp() })));

/* ---------- 그 밖 ---------- */
await check('[42] 규칙에 없는 컬렉션 읽기 → 차단', () =>
  assertFails(getDocs(collection(db(A), 'anything_else'))));

await check('[43] 규칙에 없는 컬렉션 쓰기 → 차단', () =>
  assertFails(addDoc(collection(db(A), 'anything_else'), { x: 1 })));

/* ---------- 관리자: 숨김(moderation) ---------- */
// 준비: 관리자 프로필과 차단 대상 데이터
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'yakhyo_profiles', ADMIN), { nickname: '운영자', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_profiles', BANNED), { nickname: '차단대상', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_posts', 'post-mod'), { ...postData(A), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_comments', 'comment-mod'), { ...commentData(B), postId: 'post-mod', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  // moderation 필드가 아예 없는 "예전 글" — 호환 회귀 검사용
  await setDoc(doc(d, 'yakhyo_posts', 'post-a2'), { ...postData(A), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await setDoc(doc(d, 'yakhyo_reports', 'report-1'),
    { reporterId: B, targetType: 'post', targetId: 'post-mod', reason: 'spam', createdAt: Timestamp.now() });
});

await check('[44] 일반 회원이 자기 글의 moderationStatus 를 바꾼다 → 차단', () =>
  assertFails(updateDoc(doc(db(A), 'yakhyo_posts', 'post-mod'),
    { title: '아침에 늦게 오르는 날', body: '기록을 어떻게 남기면 좋을까요',
      moderationStatus: 'visible', updatedAt: serverTimestamp() })));

await check('[45] admin claim 이 없는 회원이 관리자 숨김을 흉내낸다 → 차단', () =>
  assertFails(updateDoc(doc(db(B), 'yakhyo_posts', 'post-mod'),
    { moderationStatus: 'hidden', moderatedAt: serverTimestamp(), moderatedBy: B,
      moderationReason: '', updatedAt: serverTimestamp() })));

await check('[46] 관리자가 글을 숨긴다 → 허용', () =>
  assertSucceeds(updateDoc(doc(adminDb(), 'yakhyo_posts', 'post-mod'),
    { moderationStatus: 'hidden', moderatedAt: serverTimestamp(), moderatedBy: ADMIN,
      moderationReason: '의료 조언 우려', updatedAt: serverTimestamp() })));

await check('[47] 작성자가 숨겨진 자기 글의 숨김을 스스로 푼다 → 차단', () =>
  assertFails(updateDoc(doc(db(A), 'yakhyo_posts', 'post-mod'),
    { title: '아침에 늦게 오르는 날', body: '기록을 어떻게 남기면 좋을까요',
      moderationStatus: 'visible', updatedAt: serverTimestamp() })));

await check('[48] 관리자가 moderation 과 함께 본문까지 고친다 → 차단', () =>
  assertFails(updateDoc(doc(adminDb(), 'yakhyo_posts', 'post-mod'),
    { moderationStatus: 'visible', moderatedAt: serverTimestamp(), moderatedBy: ADMIN,
      title: '관리자가 바꾼 제목', updatedAt: serverTimestamp() })));

await check('[49] 관리자가 글 숨김을 해제한다 → 허용', () =>
  assertSucceeds(updateDoc(doc(adminDb(), 'yakhyo_posts', 'post-mod'),
    { moderationStatus: 'visible', moderatedAt: serverTimestamp(), moderatedBy: ADMIN,
      updatedAt: serverTimestamp() })));

await check('[50] 관리자가 답글을 숨긴다 → 허용', () =>
  assertSucceeds(updateDoc(doc(adminDb(), 'yakhyo_comments', 'comment-mod'),
    { moderationStatus: 'hidden', moderatedAt: serverTimestamp(), moderatedBy: ADMIN,
      moderationReason: '', updatedAt: serverTimestamp() })));

await check('[51] 작성자가 숨겨진 자기 답글을 수정해 숨김을 지운다 → 차단', () =>
  assertFails(updateDoc(doc(db(B), 'yakhyo_comments', 'comment-mod'),
    { body: '저도 그렇습니다', moderationStatus: 'visible', updatedAt: serverTimestamp() })));

await check('[52] moderation 필드 없는 기존 글을 작성자가 평범하게 수정 → 허용(호환)', () =>
  assertSucceeds(updateDoc(doc(db(A), 'yakhyo_posts', 'post-a2') /* 아래에서 만든다 */,
    { title: '수정한 제목', body: '수정한 내용입니다', updatedAt: serverTimestamp() })
  ));

/* ---------- 관리자: 신고 처리 ---------- */
await check('[53] 관리자가 신고 목록을 읽는다 → 허용', () =>
  assertSucceeds(getDocs(collection(adminDb(), 'yakhyo_reports'))));

await check('[54] 관리자가 신고 상태를 바꾼다 → 허용', () =>
  assertSucceeds(updateDoc(doc(adminDb(), 'yakhyo_reports', 'report-1'),
    { status: 'reviewed', reviewedAt: serverTimestamp(), reviewedBy: ADMIN })));

await check('[55] 일반 회원이 신고 상태를 바꾼다 → 차단', () =>
  assertFails(updateDoc(doc(db(B), 'yakhyo_reports', 'report-1'),
    { status: 'dismissed', reviewedAt: serverTimestamp(), reviewedBy: B })));

await check('[56] 관리자가 신고 원문(대상)을 고친다 → 차단', () =>
  assertFails(updateDoc(doc(adminDb(), 'yakhyo_reports', 'report-1'),
    { targetId: '다른글', status: 'reviewed', reviewedAt: serverTimestamp(), reviewedBy: ADMIN })));

await check('[57] status: open 을 넣어 신고를 접수 → 허용(새 클라이언트)', () =>
  assertSucceeds(addDoc(collection(db(A), 'yakhyo_reports'),
    { reporterId: A, targetType: 'comment', targetId: 'comment-mod', reason: 'other',
      status: 'open', createdAt: serverTimestamp() })));

/* ---------- 관리자: 차단 ---------- */
await check('[58] 일반 회원이 차단 목록을 읽는다 → 차단', () =>
  assertFails(getDocs(collection(db(A), 'yakhyo_bans'))));

await check('[59] 일반 회원이 자기 차단 문서를 읽는다 → 차단(사유는 관리자만 본다)', () =>
  assertFails(getDoc(doc(db(BANNED), 'yakhyo_bans', BANNED))));

await check('[60] 일반 회원이 차단 문서를 만든다 → 차단', () =>
  assertFails(setDoc(doc(db(A), 'yakhyo_bans', B),
    { uid: B, reason: '마음에 안 듦', createdAt: serverTimestamp(), createdBy: A, expiresAt: null, active: true })));

await check('[61] 관리자가 사용자를 차단한다 → 허용', () =>
  assertSucceeds(setDoc(doc(adminDb(), 'yakhyo_bans', BANNED),
    { uid: BANNED, reason: '반복 스팸', createdAt: serverTimestamp(), createdBy: ADMIN, expiresAt: null, active: true })));

await check('[62] 차단된 사용자가 글을 쓴다 → 차단', () =>
  assertFails(addDoc(collection(db(BANNED), 'yakhyo_posts'), postData(BANNED))));

await check('[63] 차단된 사용자가 답글을 단다 → 차단', () =>
  assertFails(addDoc(collection(db(BANNED), 'yakhyo_comments'),
    { ...commentData(BANNED), postId: 'post-mod' })));

await check('[64] 차단된 사용자가 신고를 접수한다 → 차단(신고 남용 방지)', () =>
  assertFails(addDoc(collection(db(BANNED), 'yakhyo_reports'),
    { reporterId: BANNED, targetType: 'post', targetId: 'post-mod', reason: 'spam', createdAt: serverTimestamp() })));

await check('[65] 차단된 사용자도 읽기는 된다 → 허용', () =>
  assertSucceeds(getDocs(query(collection(db(BANNED), 'yakhyo_posts'),
    where('deletedAt', '==', null), orderBy('createdAt', 'desc')))));

await check('[66] 관리자가 차단을 해제한다 → 허용', () =>
  assertSucceeds(updateDoc(doc(adminDb(), 'yakhyo_bans', BANNED),
    { active: false, reason: '반복 스팸', expiresAt: null })));

await check('[67] 해제된 사용자가 다시 글을 쓴다 → 허용', () =>
  assertSucceeds(addDoc(collection(db(BANNED), 'yakhyo_posts'),
    { ...postData(BANNED), authorNickname: '차단대상' })));

await check('[68] 만료 시각이 지난 차단은 효력이 없다 → 글쓰기 허용', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'yakhyo_bans', BANNED),
      { uid: BANNED, reason: '기간 차단', createdAt: Timestamp.now(), createdBy: ADMIN,
        expiresAt: Timestamp.fromMillis(Date.now() - 60_000), active: true });
  });
  await assertSucceeds(addDoc(collection(db(BANNED), 'yakhyo_posts'),
    { ...postData(BANNED), authorNickname: '차단대상' }));
});

await check('[69] 관리자도 hard delete 는 못 한다 → 차단', () =>
  assertFails(deleteDoc(doc(adminDb(), 'yakhyo_posts', 'post-mod'))));

await env.cleanup();

for (const [state, name, detail] of results) {
  console.log(`${state === 'PASS' ? ' ok ' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}
console.log(`\n${pass} 통과 / ${fail} 실패 (전체 ${pass + fail})`);
process.exit(fail ? 1 : 0);
