import { useStore } from "../store";
import { endpointsFor, CATEGORIES } from "../endpoints";
import EndpointRunner from "../components/EndpointRunner";

const INTROS = {
  quotation: "인증이 필요 없는 시세 API. 활성 키와 무관하게 호출됩니다.",
  accounts: "보유 자산과 주문 가능 정보를 조회합니다.",
  orders: "매수/매도 주문을 생성·취소하고, 생성·취소 직후 주문 조회로 대조합니다. 쓰기 액션은 확인 모달을 거칩니다.",
  deposits: "메인포켓 키 전용. 입금 주소를 만들고, 외부에서 직접 소액을 보낸 뒤 입금 리스트를 새로고침하며 사람이 확인합니다.",
  withdraws: "메인포켓 키 전용. 출금 요청 후 출금 리스트/개별 조회로 상태를 대조합니다. 출금 주소는 업비트 웹에 등록된 허용 주소만 선택됩니다.",
  pockets:
    "활성 키 유형에 따라 사용 가능한 작업이 자동으로 갈립니다 — 메인포켓 키: (a)~(e), 서브포켓 키: (f)(g). from/to/uuid 는 (a) 포켓 조회로 캐시된 목록에서 선택하세요.",
};

export default function CategoryTab({ categoryId }) {
  const { activeKey, loadPockets } = useStore();
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  const eps = endpointsFor(categoryId);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title text-lg">{cat.label}</h2>
        {cat.auth ? (
          <span className="chip bg-warn-100 text-warn-800">🔒 인증 필요</span>
        ) : (
          <span className="chip bg-ok-100 text-ok-700">🔓 인증 불필요</span>
        )}
        {categoryId === "pockets" && (
          <button
            onClick={() => loadPockets(true)}
            disabled={!activeKey}
            className="btn-ghost btn-sm ml-auto"
          >
            ↻ 포켓 목록 불러오기(드롭다운 채우기)
          </button>
        )}
      </div>
      <p className="text-sm text-ink-600 leading-relaxed">{INTROS[categoryId]}</p>
      <div className="space-y-4">
        {eps.map((ep) => (
          <EndpointRunner key={ep.id} endpoint={ep} />
        ))}
      </div>
    </div>
  );
}
