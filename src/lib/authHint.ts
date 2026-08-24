/**
 * 헤더에 보여줄 로그인 표시를 위한 **가벼운 힌트**.
 *
 * 왜 필요한가:
 * 헤더는 모든 페이지에 있다. 여기서 Firebase SDK 를 부르면 글 읽는 페이지까지
 * 550KB 를 내려받게 된다. 이 사이트는 읽는 곳이 본체이므로 그건 손해다.
 *
 * 그래서 로그인한 뒤 닉네임만 localStorage 에 적어 두고, 헤더는 그것만 읽는다.
 * Firebase 는 실제로 필요한 페이지(로그인·프로필·게시판)에서만 실린다.
 *
 * **이 값은 보안 경계가 아니다.** 라벨일 뿐이다.
 * 여기에 무엇을 적어 넣든 글을 쓰거나 고칠 권한은 생기지 않는다 — 그것은 Rules 가 정한다.
 * 다른 탭에서 로그아웃하면 잠깐 어긋날 수 있고, 그때는 해당 페이지가 바로잡는다.
 */
const KEY = 'yakhyo.auth.hint';
export const AUTH_HINT_EVENT = 'yakhyo:auth-hint';

export type AuthHint = { uid: string; nickname: string | null } | null;

export function readAuthHint(): AuthHint {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.uid === 'string' ? { uid: v.uid, nickname: v.nickname ?? null } : null;
  } catch { return null; }   // 사파리 프라이빗 모드 등에서 던질 수 있다
}

export function writeAuthHint(hint: AuthHint): void {
  try {
    if (hint) localStorage.setItem(KEY, JSON.stringify(hint));
    else localStorage.removeItem(KEY);
  } catch { /* 저장 못 해도 기능은 돌아간다 */ }
  try { window.dispatchEvent(new CustomEvent(AUTH_HINT_EVENT)); } catch { /* SSR 등 */ }
}
