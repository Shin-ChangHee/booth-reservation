import { QrCode } from '../components/QrCode'
import { BOOTH } from '../lib/booth'
import { getPublicUrl, isLocalUrl } from '../lib/publicUrl'
import { Logo } from '../components/Logo'

const STEPS = [
  { title: '휴대폰 카메라로 QR코드를 찍어요', body: '앱 설치나 회원가입은 필요 없어요.' },
  { title: '남은 체험 시간 하나를 골라 예약해요', body: '4자리 확인코드가 나오면 화면을 캡처해 두세요.' },
  { title: '예약 시간에 1번 부스로 와 주세요', body: '스태프에게 확인코드를 보여주시면 바로 체험해요.' },
]

const RULES = [
  '체험 시간대마다 정원이 있어요.',
  '지정 시간 안에 오시면 우선 체험하실 수 있어요.',
  '시간이 지나면 현장 대기 순서로 안내해 드려요.',
  '스마트폰 1대당 1건만 예약할 수 있어요.',
  '이름, 전화번호 등 개인정보는 받지 않아요.',
]

export default function Poster() {
  const url = getPublicUrl()
  const local = isLocalUrl(url)

  return (
    <div className="poster-root min-h-dvh bg-slate-200 py-6 text-ink print:bg-white print:p-0">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .poster-root { min-height: 0 !important; }
          .poster-sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .poster-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      {/* 화면에서만 보이는 도구 막대 */}
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-3 px-4 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-12 rounded-xl bg-brand-600 px-5 text-base font-bold text-white hover:bg-brand-700"
        >
          인쇄하기
        </button>
        <p className="text-sm text-slate-700">A4 세로, 여백 없음(또는 기본)으로 인쇄하세요. QR 주소: <strong className="break-all">{url}</strong></p>
        {local && (
          <p role="alert" className="w-full rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
            지금 주소는 휴대폰에서 열 수 없어요. 배포한 주소에서 이 페이지를 열거나 .env의 VITE_PUBLIC_URL을 설정한 뒤 인쇄하세요.
          </p>
        )}
      </div>

      {/* A4 한 장 */}
      <article className="poster-sheet mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white shadow-xl">
        <div aria-hidden="true">
          <div className="h-[9mm] bg-brand-600" />
          <div className="h-[1.2mm] bg-white" />
          <div className="h-[3mm] bg-track-500" />
        </div>

        <div className="flex flex-1 flex-col px-[16mm] pt-[11mm] pb-[10mm]">
          <p className="text-[15pt] font-bold text-track-600">
            {BOOTH.organizationFull}
          </p>
          <h1 className="mt-[2mm] text-[27pt] leading-[1.2] font-extrabold">{BOOTH.defaultTitle}</h1>
          <p className="mt-[3mm] text-[17pt] leading-snug font-bold text-brand-700">
            줄 서지 말고, 체험 시간을 예약하세요.
          </p>

          <div className="mt-[12mm] flex items-center gap-[9mm]">
            <div className="shrink-0 text-center">
              <QrCode value={url} label="예약 페이지 QR코드" className="size-[80mm] rounded-[4mm] border-[0.8mm] border-slate-300" />
              <p className="mt-[2mm] max-w-[80mm] text-[9pt] break-all text-slate-500">{url}</p>
            </div>
            <ol className="flex flex-col gap-[6mm]">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-[4mm]">
                  <span className="flex size-[11mm] shrink-0 items-center justify-center rounded-full bg-brand-600 text-[17pt] font-extrabold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[15pt] leading-snug font-extrabold">{s.title}</span>
                    <span className="mt-[1mm] block text-[11pt] leading-snug text-slate-600">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <section className="mt-[10mm] rounded-[4mm] border-[0.6mm] border-slate-300 px-[8mm] py-[6mm]">
            <h2 className="text-[16pt] font-extrabold">이용 안내</h2>
            <ul className="mt-[4mm] flex flex-col gap-[3mm] text-[14pt] leading-snug text-slate-800">
              {RULES.map((r) => (
                <li key={r} className="flex gap-[2.5mm]">
                  <span aria-hidden="true" className="mt-[2.2mm] size-[1.8mm] shrink-0 rounded-full bg-track-500" />
                  {r}
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-auto pt-[6mm] text-[15pt] font-bold text-slate-700">
            줄이 짧을 때는 예약 없이 바로 체험하실 수 있어요.
          </p>
          <div className="mt-[4mm] flex items-end justify-between border-t-[0.4mm] border-slate-200 pt-[4mm] text-[10pt] text-slate-500">
            <span>
              {BOOTH.eventName}
              <br />
              {BOOTH.organization}
            </span>
            <Logo eager className="h-[15mm]" />
          </div>
        </div>
      </article>
    </div>
  )
}
