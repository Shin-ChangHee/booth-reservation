# 배포 안내 (Vercel 또는 Netlify)

둘 중 하나만 하면 됩니다. 설정 파일은 둘 다 들어 있어요 (`vercel.json`, `netlify.toml`).
처음이라면 **Vercel**을 권장합니다 (GitHub 연결 → 환경변수 2개 → 끝).

---

## 0. 배포 전에 Supabase가 준비돼 있어야 합니다

`supabase/README.md` 순서대로:

- [ ] 마이그레이션 5개 적용
- [ ] `supabase/seed/generate_slots.sql` 실행 (행사일 시간대 생성)
- [ ] `supabase/tests/phase1_checks.sql` 실행 → 전부 `true`
- [ ] Authentication → **Allow new users to sign up 끄기**, **Allow anonymous sign-ins 끄기**
- [ ] Authentication → Users → **Add user**로 스태프 공용 계정 생성 (Auto Confirm 체크)
- [ ] Project Settings → API 에서 **Project URL**과 **anon(public) key** 복사
  (새 형식의 `sb_publishable_...` 키도 그대로 쓰면 됩니다. `service_role`/`secret` 키는 절대 넣지 마세요.)

---

## 1-A. Vercel로 배포

1. https://vercel.com 로그인 → **Add New… → Project**
2. GitHub 저장소 `booth-reservation` 선택 → **Import**
3. 설정 화면에서
   - Framework Preset: **Vite** (자동 인식)
   - Build Command / Output Directory: 그대로 (`vercel.json`에 지정됨)
   - **Environment Variables**에 추가
     | 이름 | 값 |
     |---|---|
     | `VITE_SUPABASE_URL` | Supabase Project URL |
     | `VITE_SUPABASE_ANON_KEY` | Supabase anon(public) key |
4. **Deploy** → 1~2분 뒤 `https://<프로젝트이름>.vercel.app` 주소가 나옵니다.
5. (권장) Settings → Domains 에서 주소를 짧게 바꿀 수 있어요. 예: `kspo-booth.vercel.app`
   QR·포스터에 들어가는 주소이므로 **인쇄 전에** 정해 두세요.

> 환경변수를 빠뜨리면 빌드가 일부러 실패하고 "환경변수가 없어요" 메시지가 나옵니다. 추가한 뒤 **Redeploy** 하세요.
> 환경변수를 바꾼 뒤에도 반드시 Redeploy 해야 반영됩니다 (빌드 때 값이 들어가는 방식).

## 1-B. Netlify로 배포

1. https://app.netlify.com 로그인 → **Add new site → Import an existing project → GitHub**
2. 저장소 `booth-reservation` 선택
3. Build command / Publish directory: 그대로 (`netlify.toml`에 지정됨)
4. **Add environment variables**에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가
5. **Deploy** → `https://<사이트이름>.netlify.app`
6. Site configuration → Change site name 으로 주소를 짧게 바꿀 수 있어요.

---

## 2. 배포 후 할 일

### 2.1 주소 고정 (선택)
안내 화면(`/board`)과 포스터(`/poster`)의 QR은 **지금 열린 주소**로 만들어집니다.
커스텀 도메인과 기본 도메인을 둘 다 쓰는 경우처럼 QR 주소를 하나로 고정하고 싶으면
환경변수 `VITE_PUBLIC_URL=https://최종주소/` 를 추가하고 Redeploy 하세요.

### 2.2 Supabase Auth 주소 설정
Supabase → Authentication → URL Configuration → **Site URL**을 배포 주소로 바꿔 둡니다.
(이메일+비밀번호 로그인에는 필수는 아니지만, 기본값 `localhost`로 남겨 두지 않기 위해)

### 2.3 QR 이미지와 포스터
```bash
npm run make-qr -- https://최종주소/
```
→ `public/qr.png`(2000px), `public/qr.svg` 생성 (현수막·다른 인쇄물용).

포스터는 **배포 주소에서** `https://최종주소/poster` 를 열고 [인쇄하기] → A4 세로로 인쇄합니다.
화면 위에 노란 경고가 보이면 localhost 주소이므로 인쇄하지 마세요.

### 2.4 부스 안내 태블릿
태블릿 브라우저로 `https://최종주소/board` 를 열고 전체 화면으로 둡니다.
화면 자동 꺼짐은 태블릿 설정에서도 꺼 두세요.

---

## 3. 배포 확인 (Phase 5 완료 기준)

와이파이를 끄고 **LTE/5G**로 휴대폰에서 확인합니다.

- [ ] 휴대폰 카메라로 포스터 QR 촬영 → 예약 화면이 열림
- [ ] 스태프가 `/admin` 로그인 → 예약 접수 켜기
- [ ] 휴대폰에서 시간대 예약 → 확인코드 화면 → 새로고침해도 유지
- [ ] `/admin`에 코드 입력 → 방문 완료 처리
- [ ] 휴대폰에서 다른 예약 후 취소 → 남은 자리 1 증가
- [ ] 접수 끄기 → 휴대폰 화면이 15초 안에 "지금은 바로 체험하실 수 있어요"로 바뀜
- [ ] `/admin`, `/board`, `/poster` 주소에서 새로고침해도 404가 나지 않음
- [ ] 테스트로 만든 예약은 `/admin`에서 취소하거나, SQL Editor에서
      `delete from public.bookings;` 로 지운 뒤 행사 당일을 맞이하기

---

## 4. 알아 둘 점

- **Supabase 무료 플랜은 7일간 사용이 없으면 프로젝트가 일시 정지**됩니다.
  행사 전날 대시보드에서 프로젝트가 Active인지 확인하고, 리허설을 행사 2~3일 전에 하면 안전합니다.
- **Vercel 무료(Hobby) 플랜은 비상업적 용도 기준**입니다. 기관 내부 보안성 검토 때 이용 약관도 함께 확인하세요.
  (Netlify 무료 플랜은 상업적 이용 제한이 없습니다.)
- 검색엔진 노출 방지: `robots.txt` 전체 차단 + `noindex` 메타 태그 + `X-Robots-Tag` 헤더.
- 행사 후: 통계 CSV를 내려받은 뒤 `bookings` 데이터를 지우고, Supabase 프로젝트와 배포 사이트를 정지 또는 삭제합니다.
