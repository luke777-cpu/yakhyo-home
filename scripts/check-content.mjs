/**
 * 콘텐츠 파일의 흔한 실수를 빌드 전에 잡는다.
 *
 *  1) 프론트매터 값이 따옴표로 시작하는 경우
 *     YAML 이 인용 문자열로 읽고 닫는 따옴표 뒤를 오류로 처리한다.
 *     한국어 본문에 큰따옴표를 쓰다 보면 반복해서 걸리는 함정이라 여기서 막는다.
 *  2) 본문에 배포 경로(/yakhyo-home)를 하드코딩한 경우
 *     내부 문서 링크는 related 목록을 사용한다.
 *     단, public/images 아래의 정적 이미지 src는 GitHub Pages의 base 경로가 필요하므로 허용한다.
 *
 * 실행:  node scripts/check-content.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'src/content');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
}

const problems = [];
for (const file of walk(CONTENT)) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  let inFrontmatter = false;

  lines.forEach((line, i) => {
    if (line.trim() === '---') {
      inFrontmatter = i === 0 ? true : !inFrontmatter;
      return;
    }
    if (inFrontmatter && /^\s*[a-zA-Z_]+:\s*"/.test(line)) {
      problems.push(`${rel}:${i + 1} 프론트매터 값이 따옴표로 시작합니다 — YAML 이 인용 문자열로 읽습니다`);
    }

    const isPublicImageSrc = /src=["']\/yakhyo-home\/images\//.test(line);
    if (!inFrontmatter && line.includes('/yakhyo-home') && !isPublicImageSrc) {
      problems.push(`${rel}:${i + 1} 본문에 배포 경로가 하드코딩되어 있습니다 — related 목록으로 연결하세요`);
    }
  });
}

if (problems.length > 0) {
  console.error(`콘텐츠 검사 실패 (${problems.length}건)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('콘텐츠 검사 통과');
