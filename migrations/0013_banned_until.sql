-- 退場処分の期限（反則を繰り返した人は、この日時まで API も画面も使えない。NULL なら処分なし）
ALTER TABLE users ADD COLUMN banned_until TEXT;
