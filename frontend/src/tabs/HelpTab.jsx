// 도움말 — 포켓 권한 가이드(독립 SVG, public/pocket-permissions.svg) + 요약 치트시트.
export default function HelpTab() {
  return (
    <div className="max-w-5xl space-y-5">
      <h2 className="section-title text-lg">도움말 · 포켓 권한 가이드</h2>

      <div className="card p-4">
        <img
          src="/pocket-permissions.svg"
          alt="업비트 포켓 권한 가이드 — 메인(포켓관리)과 서브(자산이전)의 차이, 서브포켓에 돈 넣고 빼는 흐름"
          className="w-full h-auto"
        />
      </div>

      <div className="card p-4 text-sm text-ink-700 space-y-3 leading-relaxed">
        <h3 className="section-title text-sm">한눈 요약</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-control bg-brand-50 border border-brand-200 p-3">
            <div className="font-semibold text-brand-800 mb-1">🔵 메인포켓 키 · 포켓관리</div>
            <ul className="list-disc pl-4 space-y-0.5 text-ink-700">
              <li>(a~c) 포켓 목록·API키·다른 서브 잔고 조회</li>
              <li>(d)(e) 메인↔서브 자산 이전·내역</li>
              <li>외부 입금·출금 (메인 전용)</li>
            </ul>
          </div>
          <div className="rounded-control bg-accent-violet-50 border border-accent-violet-200 p-3">
            <div className="font-semibold text-accent-violet-700 mb-1">🟣 서브포켓 키 · 자산이전</div>
            <ul className="list-disc pl-4 space-y-0.5 text-ink-700">
              <li>(f)(g) 서브→메인/서브→서브 이전·내역 — 서브 전용</li>
              <li>자기 잔고·주문은 계좌·주문 탭에서</li>
              <li>외부 입출금·포켓 관리·다른 포켓 조회 불가</li>
            </ul>
          </div>
        </div>
        <p className="text-ink-600">
          <b>서브포켓에 넣기</b>: 외부→메인(입금) → (d) 메인키로 메인→서브 이전. &nbsp;
          <b>빼기</b>: (f) 서브키로 서브→메인 이전 → 메인키로 외부 출금. 서브는 외부와 직접 입출금이 안 되고 항상 메인을 거칩니다.
        </p>
        <p className="text-ink-500">
          각 키의 <b>실제 부여 권한</b>은 포켓 탭 (b) 포켓별 API Key 목록에서 확인할 수 있습니다(업비트가 내려주는 실권한).
        </p>
      </div>
    </div>
  );
}
