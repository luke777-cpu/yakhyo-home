/**
 * Supabase 클라이언트.
 *
 * 이 사이트는 정적 빌드(GitHub Pages)를 유지한다. 서버가 없으므로 인증과 게시판은
 * 전부 브라우저에서 돈다. 그래서 **보안은 화면이 아니라 RLS 가 지킨다.**
 * 여기 있는 코드가 무엇을 요청하든, 허용 여부는 supabase/schema.sql 의 정책이 정한다.
 *
 * anon key 는 공개되어도 되는 값이다(브라우저에 나가는 것이 정상).
 * service_role key 는 이 파일을 포함해 클라이언트 코드 어디에도 두지 않는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_ENV = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY_ENV = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

/** 환경변수가 채워져 있는지. 아직이면 화면에 설정 안내를 띄운다. */
export const isConfigured = Boolean(URL_ENV && KEY_ENV);

export const SETUP_MESSAGE =
  '아직 로그인 설정이 끝나지 않았습니다. docs/AUTH-BOARD-SETUP.md 의 순서대로 Supabase 프로젝트와 환경변수를 먼저 준비해 주세요.';

let client: SupabaseClient | null = null;

/**
 * 설정이 안 됐으면 null 을 준다. 던지지 않는다 —
 * 페이지가 통째로 죽는 대신 버튼이 안내 문구를 보여주게 하기 위해서다.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isConfigured) return null;
  if (!client) {
    client = createClient(URL_ENV!, KEY_ENV!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // OAuth 로 돌아왔을 때 URL 의 토큰을 세션으로 바꾼다.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }
  return client;
}

/** BASE_PATH 를 포함한 절대 URL. OAuth redirectTo 는 절대 경로여야 한다. */
export function absoluteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const rest = path.startsWith('/') ? path.slice(1) : path;
  return new URL(`${base}${rest}`, window.location.origin).toString();
}

export type Profile = { id: string; nickname: string; created_at: string };

/** 로그인 사용자의 프로필. 없으면 null (= 아직 닉네임을 안 정한 상태). */
export async function getProfile(sb: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await sb.from('profiles').select('id, nickname, created_at').eq('id', userId).maybeSingle();
  return (data as Profile) ?? null;
}

/**
 * 로그인 여부와 프로필을 한 번에.
 * 닉네임이 없으면 호출한 쪽에서 /profile/setup/ 으로 보낸다.
 */
export async function getSession(sb: SupabaseClient) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return { session: null, user: null, profile: null };
  const profile = await getProfile(sb, session.user.id);
  return { session, user: session.user, profile };
}

/** Supabase 오류를 사용자에게 보여줄 한 문장으로. 원문은 콘솔에만 남긴다. */
export function friendlyError(err: unknown, fallback = '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'): string {
  if (!err) return fallback;
  const msg = String((err as { message?: string })?.message ?? err);
  console.error('[supabase]', err);

  if (/duplicate key|profiles_nickname_lower_key/i.test(msg)) return '이미 쓰고 있는 닉네임입니다. 다른 이름으로 해 주세요.';
  if (/profiles_nickname_len/i.test(msg)) return '닉네임은 2~20자로 정해 주세요.';
  if (/posts_title_len/i.test(msg)) return '제목은 2~120자로 써 주세요.';
  if (/posts_body_len/i.test(msg)) return '내용은 2~5000자로 써 주세요.';
  if (/comments_body_len/i.test(msg)) return '답글은 1~2000자로 써 주세요.';
  if (/row-level security|violates row-level/i.test(msg)) return '권한이 없습니다. 로그인 상태와 본인 글인지 확인해 주세요.';
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return '이 로그인 방법이 아직 Supabase 에서 켜지지 않았습니다. 설정 문서를 확인해 주세요.';
  if (/Invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (/Email not confirmed/i.test(msg)) return '메일로 보낸 확인 링크를 먼저 눌러 주세요.';
  if (/User already registered/i.test(msg)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (/Password should be/i.test(msg)) return '비밀번호는 8자 이상으로 정해 주세요.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return '연결하지 못했습니다. 네트워크 상태를 확인해 주세요.';
  return fallback;
}

/**
 * PostgREST 의 임베드 결과 모양을 흡수한다.
 *
 * posts.author_id → profiles.id 는 다대일이라 보통 객체 하나로 온다.
 * 다만 관계 추론이 어긋나면 배열로 오는 경우가 있어 양쪽을 다 받는다.
 * 실제 Supabase 없이 통합 테스트를 못 했으므로 여기서 방어한다.
 */
export function nicknameOf(row: any): string {
  const p = row?.profiles;
  const nick = Array.isArray(p) ? p[0]?.nickname : p?.nickname;
  return typeof nick === 'string' && nick.length ? nick : '알 수 없음';
}

/** comments(count) 는 [{count: n}] 로 오지만, 숫자로 오는 경우도 받아 둔다. */
export function countOf(row: any, key = 'comments'): number {
  const c = row?.[key];
  if (typeof c === 'number') return c;
  if (Array.isArray(c)) return Number(c[0]?.count ?? c.length ?? 0) || 0;
  if (c && typeof c === 'object') return Number((c as any).count ?? 0) || 0;
  return 0;
}

/** 사용자가 쓴 글이 그대로 HTML 로 들어가지 않게 한다. 게시판은 서식 없는 글만 받는다. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** "3분 전" 같은 표시. 하루가 넘으면 날짜로. */
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}
