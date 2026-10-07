// 退場処分中の画面（反則を繰り返した人。期限が過ぎるまでは、どの画面を開いてもこれを出す）
export const BannedPage = () => (
  <section class="error-page banned-page">
    <div class="foul-mark" aria-hidden="true"></div>
    <h1>退場処分中です</h1>
    <p class="error-text">権限のない操作を繰り返したため、しばらくの間このアプリは使えません。</p>
  </section>
)
