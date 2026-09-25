# AMORY V5 - Offline + Branding

## Offline mode
- The app keeps working from its local IndexedDB/localStorage cache when the internet is disconnected.
- A previously authenticated device can open the app without internet.
- Changes made while offline are marked as pending locally.
- When the connection returns, the app automatically retries cloud synchronization.
- Cloud/API requests are not used as the local working database, so normal sales, purchases and inventory screens remain usable offline.
- If another device changed the same cloud workspace while this device was offline, the version guard prevents blindly overwriting the other device's newer snapshot; the local changes remain on this device for review/retry.

## Change the app name for another customer
Set these Vercel Environment Variables before deploying that customer's copy:

- `VITE_APP_NAME` = اسم النسخة الثابت الظاهر أعلى التطبيق، e.g. `محل أحمد لقطع الغيار`
- `VITE_APP_SHORT_NAME` = the short name shown on mobile, e.g. `أحمد`

The browser title, installed PWA name, mobile header brand, and login footer use these values.

The shop name printed on invoices is still controlled separately by the app's Store Settings (`store_name`).


## اسم النسخة الثابت للعميل
- اسم النسخة الظاهر في شريط التطبيق يتم أخذه من `VITE_APP_NAME` و`VITE_APP_SHORT_NAME` وقت الـbuild.
- العميل لا يستطيع تغييره من داخل التطبيق.
- لعمل نسخة جديدة لعميل آخر، غيّر القيمتين في `.env.production` قبل رفع النسخة إلى Vercel.
- مثال: `VITE_APP_NAME=محل محمد لقطع الغيار` و`VITE_APP_SHORT_NAME=محمد`.
- اسم المحل الموجود في إعدادات الفواتير يظل منفصلًا ويمكن تغييره إذا أردت تخصيص بيانات الفواتير.
