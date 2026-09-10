/** "글" 게시판 type 값의 한국어 표시 이름. 목록과 상세 페이지가 함께 쓴다. */
export const TYPE_LABELS: Record<string, string> = {
  essay: '에세이',
  experience: '환자 경험',
  research: '연구 해설',
  'paper-summary': '논문 요약',
  column: '칼럼',
  guest: '기고',
  observation: '관찰 기록',
};

/** 한글 본문 기준 분당 500자 어림으로 예상 읽기시간을 추정한다. 최소 1분. */
export function estimateReadingMinutes(markdown: string | undefined): number {
  const plain = (markdown ?? '').replace(/[#>*_`~\-]/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(plain.length / 500));
}
